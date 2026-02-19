import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const versions = await prisma.statutoryVersion.findMany({
    orderBy: { effectiveFrom: "desc" },
    include: {
      _count: { select: { birRows: true, sssRows: true } },
    },
  });

  return NextResponse.json(versions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { action } = body;

  if (action === "create-draft") {
    const { effectiveFrom, effectiveTo, notes } = body;
    if (!effectiveFrom) {
      return NextResponse.json({ error: "effectiveFrom is required" }, { status: 400 });
    }

    const version = await prisma.statutoryVersion.create({
      data: {
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes: notes || "",
        status: "DRAFT",
      },
    });
    return NextResponse.json(version, { status: 201 });
  }

  if (action === "import-bir") {
    const { versionId, rows } = body;
    if (!versionId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "versionId and rows array required" }, { status: 400 });
    }
    const version = await prisma.statutoryVersion.findUnique({ where: { id: versionId } });
    if (!version || version.status !== "DRAFT") {
      return NextResponse.json({ error: "Version must be in DRAFT status" }, { status: 400 });
    }

    await prisma.birTableGlobal.deleteMany({ where: { statutoryVersionId: versionId } });
    const records = rows.map((r: {
      exSemi: number; maxSemi: number; fixedSemi: number; rateSemi: number;
      exMonth: number; maxMonth: number; fixedMonth: number; rateMonth: number;
      exAnnual?: number; maxAnnual?: number; fixedAnnual?: number; rateAnnual?: number;
    }) => ({
      statutoryVersionId: versionId,
      exSemi: Number(r.exSemi) || 0,
      maxSemi: Number(r.maxSemi) || 999999999999,
      fixedSemi: Number(r.fixedSemi) || 0,
      rateSemi: Number(r.rateSemi) || 0,

      exMonth: Number(r.exMonth) || 0,
      maxMonth: Number(r.maxMonth) || 999999999999,
      fixedMonth: Number(r.fixedMonth) || 0,
      rateMonth: Number(r.rateMonth) || 0,

      exAnnual: Number(r.exAnnual) || 0,
      maxAnnual: Number(r.maxAnnual) || 999999999999,
      fixedAnnual: Number(r.fixedAnnual) || 0,
      rateAnnual: Number(r.rateAnnual) || 0,
    }));
    await prisma.birTableGlobal.createMany({ data: records });
    return NextResponse.json({ imported: records.length });
  }

  if (action === "import-sss") {
    const { versionId, rows } = body;
    if (!versionId || !Array.isArray(rows)) {
      return NextResponse.json({ error: "versionId and rows array required" }, { status: 400 });
    }
    const version = await prisma.statutoryVersion.findUnique({ where: { id: versionId } });
    if (!version || version.status !== "DRAFT") {
      return NextResponse.json({ error: "Version must be in DRAFT status" }, { status: 400 });
    }

    await prisma.sssTableGlobal.deleteMany({ where: { statutoryVersionId: versionId } });
    const records = rows.map((r: { compensationMin: number; compensationMax: number; eeMc: number; eeMpf: number; erMc: number; erMpf: number; ec: number }) => ({
      statutoryVersionId: versionId,
      compensationMin: Number(r.compensationMin),
      compensationMax: Number(r.compensationMax),
      eeMc: Number(r.eeMc) || 0,
      eeMpf: Number(r.eeMpf) || 0,
      erMc: Number(r.erMc) || 0,
      erMpf: Number(r.erMpf) || 0,
      ec: Number(r.ec) || 0,
    }));
    await prisma.sssTableGlobal.createMany({ data: records });
    return NextResponse.json({ imported: records.length });
  }

  if (action === "publish") {
    const { versionId } = body;
    if (!versionId) {
      return NextResponse.json({ error: "versionId required" }, { status: 400 });
    }
    const version = await prisma.statutoryVersion.findUnique({
      where: { id: versionId },
      include: { _count: { select: { birRows: true, sssRows: true } } },
    });
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (version.status !== "DRAFT") {
      return NextResponse.json({ error: "Only DRAFT versions can be published" }, { status: 400 });
    }
    if (version._count.birRows === 0) {
      return NextResponse.json({ error: "BIR table must have at least one row before publishing" }, { status: 400 });
    }

    const overlapping = await prisma.statutoryVersion.findFirst({
      where: {
        id: { not: versionId },
        country: version.country,
        status: "PUBLISHED",
        effectiveFrom: { lte: version.effectiveTo ?? new Date("9999-12-31") },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: version.effectiveFrom } },
        ],
      },
    });
    if (overlapping) {
      return NextResponse.json({
        error: `Overlaps with existing published version effective from ${overlapping.effectiveFrom.toISOString().slice(0, 10)}`,
      }, { status: 409 });
    }

    const published = await prisma.statutoryVersion.update({
      where: { id: versionId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return NextResponse.json(published);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

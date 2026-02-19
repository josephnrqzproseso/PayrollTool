import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const ver = await ensurePublishedGlobalVersionForToday();

  const rows = await prisma.sssTableGlobal.findMany({
    where: { statutoryVersionId: ver.id },
    orderBy: { compensationMin: "asc" },
  });

  return NextResponse.json(rows);
}

async function ensurePublishedGlobalVersionForToday() {
  const now = new Date();
  const existing = await prisma.statutoryVersion.findFirst({
    where: {
      country: "PH",
      status: "PUBLISHED",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (existing) return existing;

  // Default single global version covering all dates.
  return prisma.statutoryVersion.create({
    data: {
      country: "PH",
      status: "PUBLISHED",
      effectiveFrom: new Date("2000-01-01"),
      effectiveTo: null,
      notes: "Global statutory (default)",
      publishedAt: new Date(),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const version = await ensurePublishedGlobalVersionForToday();

  if (body.action === "replace" && Array.isArray(body.rows)) {
    await prisma.sssTableGlobal.deleteMany({ where: { statutoryVersionId: version.id } });
    const records = body.rows.map((r: { compensationMin: number; compensationMax: number; eeMc: number; eeMpf: number; erMc: number; erMpf: number; ec: number }) => ({
      statutoryVersionId: version.id,
      compensationMin: Number(r.compensationMin),
      compensationMax: Number(r.compensationMax),
      eeMc: Number(r.eeMc) || 0,
      eeMpf: Number(r.eeMpf) || 0,
      erMc: Number(r.erMc) || 0,
      erMpf: Number(r.erMpf) || 0,
      ec: Number(r.ec) || 0,
    }));
    await prisma.sssTableGlobal.createMany({ data: records });
    return NextResponse.json({ replaced: records.length });
  }

  return NextResponse.json({ error: "Use action: replace with rows array" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.sssTableGlobal.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}

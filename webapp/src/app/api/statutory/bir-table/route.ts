import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";
import { resolveStatutoryVersion } from "@/services/statutory/version-resolver";

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const ver = await ensurePublishedGlobalVersionForToday();

  const rows = await prisma.birTableGlobal.findMany({
    where: { statutoryVersionId: ver.id },
    orderBy: { exMonth: "asc" },
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
    await prisma.birTableGlobal.deleteMany({ where: { statutoryVersionId: version.id } });
    const records = body.rows.map((r: {
      exSemi: number; maxSemi: number; fixedSemi: number; rateSemi: number;
      exMonth: number; maxMonth: number; fixedMonth: number; rateMonth: number;
      exAnnual?: number; maxAnnual?: number; fixedAnnual?: number; rateAnnual?: number;
    }) => ({
      statutoryVersionId: version.id,
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
    return NextResponse.json({ replaced: records.length });
  }

  const { exSemi, maxSemi, fixedSemi, rateSemi, exMonth, maxMonth, fixedMonth, rateMonth, exAnnual, maxAnnual, fixedAnnual, rateAnnual } = body;
  const row = await prisma.birTableGlobal.create({
    data: {
      statutoryVersionId: version.id,
      exSemi: Number(exSemi) || 0,
      maxSemi: Number(maxSemi) || 999999999999,
      fixedSemi: Number(fixedSemi) || 0,
      rateSemi: Number(rateSemi) || 0,

      exMonth: Number(exMonth) || 0,
      maxMonth: Number(maxMonth) || 999999999999,
      fixedMonth: Number(fixedMonth) || 0,
      rateMonth: Number(rateMonth) || 0,

      exAnnual: Number(exAnnual) || 0,
      maxAnnual: Number(maxAnnual) || 999999999999,
      fixedAnnual: Number(fixedAnnual) || 0,
      rateAnnual: Number(rateAnnual) || 0,
    },
  });

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.birTableGlobal.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}

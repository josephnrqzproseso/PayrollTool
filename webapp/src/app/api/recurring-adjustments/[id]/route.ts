import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COMPONENT_CATEGORIES } from "@/lib/constants";
import { requireMinRole } from "@/lib/rbac";

const VALID_CATEGORIES = new Set<string>(COMPONENT_CATEGORIES);

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const tenantId = ctx.tenantId;

  const existing = await prisma.recurringAdjustment.findFirst({
    where: { id, tenantId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.name != null) data.name = body.name;
  if (body.category != null) {
    if (!VALID_CATEGORIES.has(body.category))
      return NextResponse.json(
        { error: `category must be one of: ${COMPONENT_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    data.category = body.category;
  }
  if (body.amount != null) data.amount = Number(body.amount);
  if (body.mode != null) {
    if (!["SPLIT", "1ST", "2ND"].includes(body.mode))
      return NextResponse.json({ error: "mode must be SPLIT, 1ST, or 2ND" }, { status: 400 });
    data.mode = body.mode;
  }
  if (body.maxAmount !== undefined) data.maxAmount = body.maxAmount != null ? Number(body.maxAmount) : null;
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.active !== undefined) data.active = Boolean(body.active);

  const updated = await prisma.recurringAdjustment.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const tenantId = ctx.tenantId;

  const existing = await prisma.recurringAdjustment.findFirst({
    where: { id, tenantId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recurringAdjustment.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COMPONENT_CATEGORIES } from "@/lib/constants";
import { requireMinRole } from "@/lib/rbac";

const VALID_CATEGORIES = new Set<string>(COMPONENT_CATEGORIES);

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.adjustmentType.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { name, category } = await req.json();

  if (!name || typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  if (!category || !VALID_CATEGORIES.has(category))
    return NextResponse.json(
      { error: `category must be one of: ${COMPONENT_CATEGORIES.join(", ")}` },
      { status: 400 }
    );

  const tenantId = ctx.tenantId;

  const existing = await prisma.adjustmentType.findUnique({
    where: { tenantId_name: { tenantId, name: name.trim() } },
  });
  if (existing)
    return NextResponse.json({ error: "Adjustment type already exists" }, { status: 409 });

  const adjType = await prisma.adjustmentType.create({
    data: { tenantId, name: name.trim(), category },
  });

  return NextResponse.json(adjType, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const existing = await prisma.adjustmentType.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.adjustmentType.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

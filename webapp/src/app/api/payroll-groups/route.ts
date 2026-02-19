import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const groups = await prisma.payrollGroupDef.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { name, code } = await req.json();
  if (!name || typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const existing = await prisma.payrollGroupDef.findUnique({
    where: { tenantId_name: { tenantId: ctx.tenantId, name: name.trim() } },
  });
  if (existing)
    return NextResponse.json({ error: "Payroll group already exists" }, { status: 409 });

  const group = await prisma.payrollGroupDef.create({
    data: { tenantId: ctx.tenantId, name: name.trim(), code: code?.trim() || "" },
  });

  return NextResponse.json(group, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const existing = await prisma.payrollGroupDef.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.payrollGroupDef.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

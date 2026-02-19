import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kinds = await prisma.trackingCategoryKind.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { sortOrder: "asc" },
    include: {
      options: { orderBy: { name: "asc" } },
    },
  });

  return NextResponse.json(kinds);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { action } = body;

  if (action === "create-kind") {
    const { name } = body;
    if (!name || !name.trim())
      return NextResponse.json({ error: "name is required" }, { status: 400 });

    const existing = await prisma.trackingCategoryKind.findUnique({
      where: { tenantId_name: { tenantId: ctx.tenantId, name: name.trim() } },
    });
    if (existing)
      return NextResponse.json({ error: "Tracking category kind already exists" }, { status: 409 });

    const maxSort = await prisma.trackingCategoryKind.aggregate({
      where: { tenantId: ctx.tenantId },
      _max: { sortOrder: true },
    });

    const kind = await prisma.trackingCategoryKind.create({
      data: {
        tenantId: ctx.tenantId,
        name: name.trim(),
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
    return NextResponse.json(kind, { status: 201 });
  }

  if (action === "add-option") {
    const { kindId, name, code } = body;
    if (!kindId || !name?.trim())
      return NextResponse.json({ error: "kindId and name required" }, { status: 400 });

    const kind = await prisma.trackingCategoryKind.findFirst({
      where: { id: kindId, tenantId: ctx.tenantId },
    });
    if (!kind) return NextResponse.json({ error: "Kind not found" }, { status: 404 });

    const existing = await prisma.trackingCategoryOption.findUnique({
      where: { kindId_name: { kindId, name: name.trim() } },
    });
    if (existing)
      return NextResponse.json({ error: "Option already exists" }, { status: 409 });

    const option = await prisma.trackingCategoryOption.create({
      data: { kindId, name: name.trim(), code: code?.trim() || "" },
    });
    return NextResponse.json(option, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { kindId, optionId } = await req.json();

  if (optionId) {
    const option = await prisma.trackingCategoryOption.findUnique({ where: { id: optionId } });
    if (!option) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const kind = await prisma.trackingCategoryKind.findFirst({
      where: { id: option.kindId, tenantId: ctx.tenantId },
    });
    if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.trackingCategoryOption.delete({ where: { id: optionId } });
    return NextResponse.json({ success: true });
  }

  if (kindId) {
    const kind = await prisma.trackingCategoryKind.findFirst({
      where: { id: kindId, tenantId: ctx.tenantId },
    });
    if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.trackingCategoryKind.delete({ where: { id: kindId } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "kindId or optionId required" }, { status: 400 });
}

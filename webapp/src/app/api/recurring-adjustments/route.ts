import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COMPONENT_CATEGORIES } from "@/lib/constants";
import { requireMinRole } from "@/lib/rbac";

const VALID_CATEGORIES = new Set<string>(COMPONENT_CATEGORIES);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeId = req.nextUrl.searchParams.get("employeeId");

  const where: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (employeeId) where.employeeId = employeeId;

  const records = await prisma.recurringAdjustment.findMany({
    where,
    include: { employee: { select: { employeeName: true, employeeId: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { employeeId, name, category, amount, mode, maxAmount, startDate, endDate } = body;

  if (!employeeId || !name || !category || amount == null)
    return NextResponse.json({ error: "employeeId, name, category, amount required" }, { status: 400 });

  if (!VALID_CATEGORIES.has(category))
    return NextResponse.json(
      { error: `category must be one of: ${COMPONENT_CATEGORIES.join(", ")}` },
      { status: 400 }
    );

  if (mode && !["SPLIT", "1ST", "2ND"].includes(mode))
    return NextResponse.json({ error: "mode must be SPLIT, 1ST, or 2ND" }, { status: 400 });

  const record = await prisma.recurringAdjustment.create({
    data: {
      tenantId: ctx.tenantId,
      employeeId,
      name,
      category,
      amount: Number(amount),
      mode: mode || "SPLIT",
      maxAmount: maxAmount != null ? Number(maxAmount) : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });

  return NextResponse.json(record, { status: 201 });
}

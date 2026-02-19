import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const profile = await prisma.companyProfile.findUnique({
    where: { tenantId: ctx.tenantId },
  });

  return NextResponse.json({
    coaMappings: profile?.coaMappings || [],
    defaultExpenseAcct: (profile as Record<string, unknown>)?.defaultExpenseAcct || "6100",
    defaultPayableAcct: (profile as Record<string, unknown>)?.defaultPayableAcct || "2100",
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { coaMappings, defaultExpenseAcct, defaultPayableAcct } = body;

  if (!Array.isArray(coaMappings)) {
    return NextResponse.json({ error: "coaMappings must be an array" }, { status: 400 });
  }

  await prisma.companyProfile.upsert({
    where: { tenantId: ctx.tenantId },
    update: {
      coaMappings,
      ...(defaultExpenseAcct ? { defaultExpenseAcct } : {}),
      ...(defaultPayableAcct ? { defaultPayableAcct } : {}),
    },
    create: {
      tenantId: ctx.tenantId,
      coaMappings,
      defaultExpenseAcct: defaultExpenseAcct || "6100",
      defaultPayableAcct: defaultPayableAcct || "2100",
    },
  });

  return NextResponse.json({ success: true });
}

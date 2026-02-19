import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const runs = await prisma.payrollRun.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(runs);
}

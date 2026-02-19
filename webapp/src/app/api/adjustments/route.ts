import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const periodKey = url.searchParams.get("periodKey");
  const employeeId = url.searchParams.get("employeeId");

  if (!periodKey)
    return NextResponse.json({ error: "periodKey query param required" }, { status: 400 });

  const adjustments = await prisma.adjustment.findMany({
    where: { tenantId: ctx.tenantId, periodKey, ...(employeeId ? { employeeId } : {}) },
    orderBy: { employeeId: "asc" },
  });

  return NextResponse.json(adjustments);
}

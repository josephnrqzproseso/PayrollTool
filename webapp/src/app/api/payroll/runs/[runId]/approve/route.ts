import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "APPROVER" });
  if (ctx instanceof NextResponse) return ctx;

  const { runId } = await params;
  const tenantId = ctx.tenantId;

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, tenantId },
    include: { rows: true },
  });

  if (!run)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "COMPUTED")
    return NextResponse.json(
      { error: "Run must be in COMPUTED status to approve" },
      { status: 400 }
    );

  const adjPeriodKey = /^[AB]$/i.test(String(run.payrollCode || "").trim())
    ? `${run.periodKey} ${String(run.payrollCode).trim().toUpperCase()}`
    : run.periodKey;

  const adjustments = await prisma.adjustment.findMany({
    where: { tenantId, periodKey: adjPeriodKey },
  });

  const adjByEmployee = new Map<string, Record<string, number>>();
  for (const adj of adjustments) {
    if (!adjByEmployee.has(adj.employeeId)) adjByEmployee.set(adj.employeeId, {});
    adjByEmployee.get(adj.employeeId)![adj.name] = adj.amount;
  }

  for (const row of run.rows) {
    const snapshot = adjByEmployee.get(row.employeeId) ?? {};
    await prisma.payrollRow.update({
      where: { id: row.id },
      data: { inputsSnapshot: snapshot },
    });
  }

  await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: "APPROVED", approvedAt: new Date() },
  });

  return NextResponse.json({ status: "APPROVED" });
}

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
  if (run.status !== "APPROVED")
    return NextResponse.json(
      { error: "Run must be in APPROVED status to post" },
      { status: 400 }
    );

  const historyRecords = run.rows.map((row) => ({
    tenantId,
    employeeId: row.employeeId,
    periodKey: run.periodKey,
    periodLabel: run.periodLabel,
    partLabel: run.payrollCode,
    columnValues: {
      basicPay: row.basicPay,
      grossPay: row.grossPay,
      taxableIncome: row.taxableIncome,
      withholdingTax: row.withholdingTax,
      sssEeMc: row.sssEeMc,
      sssEeMpf: row.sssEeMpf,
      sssErMc: row.sssErMc,
      sssErMpf: row.sssErMpf,
      sssEc: row.sssEc,
      philhealthEe: row.philhealthEe,
      philhealthEr: row.philhealthEr,
      pagibigEe: row.pagibigEe,
      pagibigEr: row.pagibigEr,
      netPay: row.netPay,
      totalDeductions: row.totalDeductions,
      componentValues: row.componentValues,
    },
  }));

  await prisma.$transaction([
    prisma.payrollHistory.createMany({ data: historyRecords }),
    prisma.payrollRun.update({
      where: { id: runId },
      data: { status: "POSTED", postedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ status: "POSTED", historyCount: historyRecords.length });
}

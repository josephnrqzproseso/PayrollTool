import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";
import { generateBankFiles } from "@/services/accounting/journal-builder";
import type { PayrollRowOutput } from "@/services/payroll-engine/types";
import type { BankMapping } from "@/services/accounting/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  const { runId } = await params;
  const tenantId = ctx.tenantId;

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, tenantId },
    include: { rows: true },
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "POSTED") {
    return NextResponse.json({ error: "Bank files can only be generated for POSTED payroll runs." }, { status: 400 });
  }

  const employees = await prisma.employee.findMany({ where: { tenantId } });
  const employeeBankIndex = new Map(
    employees.map((e) => [
      e.employeeId,
      { bankName: e.bankName || "UNKNOWN", bankAccountNumber: e.bankAccountNumber || "" },
    ])
  );

  const rows = run.rows.map((r) => r.componentValues as PayrollRowOutput);
  const bankMappings: BankMapping[] = [];

  const results = generateBankFiles(rows, bankMappings, employeeBankIndex);

  if (results.length === 0) {
    return NextResponse.json({ error: "No bank file data to generate (no employees with positive net pay and bank details)." }, { status: 400 });
  }

  if (results.length === 1) {
    return new NextResponse(results[0].csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${results[0].filename}"`,
      },
    });
  }

  const combined = results.map((r) => `--- ${r.bankName} (${r.rowCount} employees, Total: ${r.totalAmount.toFixed(2)}) ---\n${r.csvContent}`).join("\n\n");
  return new NextResponse(combined, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="bank-files-${run.periodLabel}.csv"`,
    },
  });
}

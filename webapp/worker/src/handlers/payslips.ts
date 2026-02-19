import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handlePayslips(
  jobId: string,
  payrollRunId: string,
  tenantId: string
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const { generateAndStorePayslips } = await import("@/services/providers/document-provider");
    const { buildComponentMapFromTypes } = await import("@/services/payroll-engine/component-map");

    const run = await prisma.payrollRun.findUniqueOrThrow({
      where: { id: payrollRunId },
      include: { rows: true },
    });

    const adjTypes = await prisma.adjustmentType.findMany({ where: { tenantId } });
    const componentMap = buildComponentMapFromTypes(adjTypes);

    const employees = await prisma.employee.findMany({ where: { tenantId } });
    const empDetailsMap = new Map(employees.map((e) => [e.employeeId, {
      position: e.position, department: e.trackingCategory1,
      bankName: e.bankName, bankAccountNumber: e.bankAccountNumber,
    }]));

    const rows = run.rows.map((r) => r.componentValues as Record<string, number | string>);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    const urls = await generateAndStorePayslips({
      tenantId, payrollRunId, rows, headers, componentMap, employeeDetailsMap: empDetailsMap,
    });

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED", progress: 100,
        message: `Generated ${urls.length} payslips`,
        result: { count: urls.length },
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", message, finishedAt: new Date() },
    });
    throw err;
  }
}

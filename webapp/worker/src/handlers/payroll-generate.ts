import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handlePayrollGenerate(
  jobId: string,
  payrollRunId: string,
  tenantId: string
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    // Dynamic import to pick up path aliases from the webapp src
    const { executePayrollRun } = await import("@/services/providers/computation-engine");

    const onProgress = async (percent: number, message: string) => {
      await prisma.job.update({
        where: { id: jobId },
        data: { progress: percent, message },
      });
    };

    const result = await executePayrollRun(payrollRunId, tenantId, onProgress);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        message: `Computed ${result.totalEmployees} employees, Net Pay: ${result.totalNetPay}`,
        result: { totalEmployees: result.totalEmployees, totalGrossPay: result.totalGrossPay, totalNetPay: result.totalNetPay },
        finishedAt: new Date(),
      },
    });

    console.log(`[Worker] Payroll ${payrollRunId} completed: ${result.totalEmployees} employees`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", message, finishedAt: new Date() },
    });

    await prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: { status: "DRAFT" },
    });

    throw err;
  }
}

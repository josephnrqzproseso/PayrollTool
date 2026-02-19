import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handlePayrollPost(
  jobId: string,
  payrollRunId: string,
  tenantId: string
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const { postPayrollRun } = await import("@/services/providers/posting-provider");
    const result = await postPayrollRun(tenantId, payrollRunId);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        progress: 100,
        message: result.success ? `Posted to ${result.provider} (${result.journalId})` : `Failed: ${result.error}`,
        result: result as never,
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

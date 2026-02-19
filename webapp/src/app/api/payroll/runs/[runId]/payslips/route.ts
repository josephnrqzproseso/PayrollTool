import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";
import { enqueuePayslipGeneration } from "@/lib/gcp/cloud-tasks";

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
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "POSTED") {
    return NextResponse.json(
      { error: "Payslips can only be generated for POSTED payroll runs." },
      { status: 400 }
    );
  }

  const existingJob = await prisma.job.findFirst({
    where: {
      tenantId,
      type: "payslips.generate",
      status: { in: ["PENDING", "RUNNING"] },
      payload: { path: ["payrollRunId"], equals: runId },
    },
  });

  if (existingJob) {
    return NextResponse.json({
      jobId: existingJob.id,
      status: existingJob.status,
      message: "Payslip generation is already in progress.",
    });
  }

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: "payslips.generate",
      payload: { payrollRunId: runId },
      status: "PENDING",
    },
  });

  await enqueuePayslipGeneration(job.id, runId, tenantId);

  return NextResponse.json({ jobId: job.id, status: "PENDING" }, { status: 201 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;

  const latestJob = await prisma.job.findFirst({
    where: {
      tenantId: session.user.tenantId,
      type: "payslips.generate",
      payload: { path: ["payrollRunId"], equals: runId },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestJob) return NextResponse.json({ status: "NONE" });

  return NextResponse.json({
    jobId: latestJob.id,
    status: latestJob.status,
    progress: latestJob.progress,
    message: latestJob.message,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueAccountingPosting } from "@/lib/gcp/cloud-tasks";
import { requireMinRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { payrollRunId } = await req.json();
  if (!payrollRunId) return NextResponse.json({ error: "payrollRunId required" }, { status: 400 });

  const tenantId = ctx.tenantId;

  const run = await prisma.payrollRun.findFirst({
    where: { id: payrollRunId, tenantId },
  });
  if (!run) return NextResponse.json({ error: "Payroll run not found" }, { status: 404 });
  if (run.status !== "POSTED") return NextResponse.json({ error: "Run must be POSTED to history before posting to accounting" }, { status: 400 });

  const job = await prisma.job.create({
    data: { tenantId, type: "payroll.postAccounting", payload: { payrollRunId }, status: "PENDING" },
  });

  await enqueueAccountingPosting(job.id, payrollRunId, tenantId);

  return NextResponse.json({ jobId: job.id });
}

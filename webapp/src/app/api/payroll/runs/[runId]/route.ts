import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const { runId } = await params;

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, tenantId: ctx.tenantId },
    include: {
      rows: {
        orderBy: { employeeName: "asc" },
      },
    },
  });

  if (!run)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(run);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { runId } = await params;
  const tenantId = ctx.tenantId;

  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, tenantId },
    select: { id: true, status: true, periodLabel: true },
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (run.status === "POSTED") {
    return NextResponse.json(
      { error: "Cannot delete a POSTED run. Unpost it first." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.job.updateMany({
      where: {
        tenantId,
        status: { in: ["PENDING", "RUNNING"] },
        payload: { path: ["payrollRunId"], equals: runId },
      },
      data: {
        status: "CANCELLED",
        message: `Cancelled due to deletion of payroll run ${run.periodLabel}.`,
        finishedAt: new Date(),
      },
    }),
    prisma.payrollRun.delete({
      where: { id: runId },
    }),
  ]);

  return NextResponse.json({ deleted: true });
}

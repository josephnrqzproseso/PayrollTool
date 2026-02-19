import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueReportGeneration } from "@/lib/gcp/cloud-tasks";
import { requireMinRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const { year, month } = await req.json();
  if (!year) return NextResponse.json({ error: "Year is required" }, { status: 400 });
  if (!month || month < 1 || month > 12) return NextResponse.json({ error: "Month (1-12) is required" }, { status: 400 });

  const tenantId = ctx.tenantId;

  const job = await prisma.job.create({
    data: { tenantId, type: "reports.preAnnualization", payload: { year, month }, status: "PENDING" },
  });

  await enqueueReportGeneration(job.id, "preAnnualization", tenantId, { year, month });

  return NextResponse.json({ jobId: job.id });
}

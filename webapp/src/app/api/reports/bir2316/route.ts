import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueReportGeneration } from "@/lib/gcp/cloud-tasks";
import { requireMinRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "VIEWER" });
  if (ctx instanceof NextResponse) return ctx;

  const { year } = await req.json();
  if (!year) return NextResponse.json({ error: "Year is required" }, { status: 400 });

  const tenantId = ctx.tenantId;

  const job = await prisma.job.create({
    data: { tenantId, type: "reports.bir2316", payload: { year }, status: "PENDING" },
  });

  await enqueueReportGeneration(job.id, "bir2316", tenantId, { year });

  return NextResponse.json({ jobId: job.id });
}

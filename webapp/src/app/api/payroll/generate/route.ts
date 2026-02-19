import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/gcp/cloud-tasks";
import { requireMinRole } from "@/lib/rbac";
import { resolveStatutoryVersion } from "@/services/statutory/version-resolver";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const tenantId = ctx.tenantId;

  const { payrollFrequency, payrollCode, payrollGroups, startDate, endDate, creditingDate } = body;

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
  }

  const rangeEnd = new Date(endDate);
  const year = rangeEnd.getFullYear();
  const month = rangeEnd.getMonth() + 1;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const code = String(payrollCode || "A").trim().toUpperCase();
  const periodLabel = `${periodKey}-${code}`;
  const payrollMonth = rangeEnd.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  const rangeStart = new Date(startDate);
  const normalizedGroups = Array.isArray(payrollGroups) ? payrollGroups : [];

  // Idempotency: avoid creating duplicates if user clicks Generate twice.
  const existing = await prisma.payrollRun.findFirst({
    where: {
      tenantId,
      periodLabel,
      startDate: rangeStart,
      endDate: rangeEnd,
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    if (["COMPUTED", "APPROVED", "POSTED"].includes(existing.status as string)) {
      return NextResponse.json(
        { error: `Payroll run ${existing.periodLabel} is already ${existing.status}.` },
        { status: 409 }
      );
    }

    const job = await prisma.job.create({
      data: {
        tenantId,
        type: "payroll.generate",
        payload: { payrollRunId: existing.id },
        status: "PENDING",
      },
    });

    await prisma.payrollRun.update({
      where: { id: existing.id },
      data: { status: "COMPUTING" },
    });

    await enqueueJob(job.id, "payroll.generate", { payrollRunId: existing.id, tenantId });

    return NextResponse.json({ ...existing, jobId: job.id });
  }

  const statutoryVersion = await resolveStatutoryVersion(rangeEnd);
  if (!statutoryVersion) {
    return NextResponse.json(
      { error: "No PUBLISHED statutory version covers this payroll date. Create/import/publish a global statutory version first." },
      { status: 400 }
    );
  }

  const run = await prisma.payrollRun.create({
    data: {
      tenantId,
      payrollFrequency: payrollFrequency || "Semi-Monthly",
      payrollCode: code,
      periodLabel,
      periodKey,
      payrollMonth,
      entity: "",
      payrollGroups: normalizedGroups,
      startDate: rangeStart,
      endDate: rangeEnd,
      creditingDate: creditingDate ? new Date(creditingDate) : null,
      computeTax: true,
      computeContrib: true,
      status: "COMPUTING",
      statutoryVersionId: statutoryVersion.id,
    },
  });

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: "payroll.generate",
      payload: { payrollRunId: run.id },
      status: "PENDING",
    },
  });

  await enqueueJob(job.id, "payroll.generate", { payrollRunId: run.id, tenantId });

  return NextResponse.json({ ...run, jobId: job.id });
}

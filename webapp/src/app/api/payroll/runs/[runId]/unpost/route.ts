import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { requireMinRole } from "@/lib/rbac";

export async function POST(
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
    include: { rows: true },
  });

  if (!run)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.status !== "POSTED")
    return NextResponse.json(
      { error: "Run must be in POSTED status to unpost" },
      { status: 400 }
    );

  await prisma.$transaction([
    prisma.payrollHistory.deleteMany({
      where: { tenantId, periodKey: run.periodKey },
    }),

    ...run.rows.map((row) =>
      prisma.payrollRow.update({
        where: { id: row.id },
        data: { inputsSnapshot: Prisma.DbNull },
      })
    ),

    prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: "APPROVED",
        postedAt: null,
      },
    }),
  ]);

  return NextResponse.json({ status: "APPROVED" });
}

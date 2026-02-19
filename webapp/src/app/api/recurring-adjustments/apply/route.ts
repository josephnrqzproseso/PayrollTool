import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireMinRole } from "@/lib/rbac";
import { applyRecurringAdjustmentsForCutoff } from "@/services/adjustments/apply-recurring";

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  const tenantId = ctx.tenantId;
  const { periodKey, payrollCode } = await req.json();

  if (!periodKey)
    return NextResponse.json({ error: "periodKey required" }, { status: 400 });

  const res = await applyRecurringAdjustmentsForCutoff({
    tenantId,
    periodKey,
    payrollCode,
    asOf: new Date(),
  });

  return NextResponse.json(res);
}

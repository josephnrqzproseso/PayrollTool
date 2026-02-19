import { prisma } from "@/lib/db";

export async function applyRecurringAdjustmentsForCutoff(input: {
  tenantId: string;
  periodKey: string; // e.g. "2026-02 A"
  payrollCode: string; // "A" | "B"
  asOf: Date;
}): Promise<{ created: number; skipped: number }> {
  const tenantId = input.tenantId;
  const periodKey = String(input.periodKey || "").trim();
  const payrollCode = String(input.payrollCode || "").trim().toUpperCase();
  const asOf = input.asOf;

  if (!periodKey) throw new Error("periodKey required");
  if (payrollCode !== "A" && payrollCode !== "B") {
    return { created: 0, skipped: 0 };
  }

  const recurring = await prisma.recurringAdjustment.findMany({
    where: {
      tenantId,
      active: true,
      OR: [{ startDate: null }, { startDate: { lte: asOf } }],
    },
  });

  const applicable = recurring.filter((r) => {
    if (r.endDate && r.endDate < asOf) return false;
    if (payrollCode === "A" && r.mode === "2ND") return false;
    if (payrollCode === "B" && r.mode === "1ST") return false;
    return true;
  });

  let created = 0;
  let skipped = 0;

  for (const rec of applicable) {
    const existing = await prisma.adjustment.findFirst({
      where: {
        tenantId,
        employeeId: rec.employeeId,
        name: rec.name,
        periodKey,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    let adjAmount = rec.amount;
    if (rec.mode === "SPLIT") adjAmount = rec.amount / 2;

    if (rec.maxAmount != null) {
      const previousTotal = await prisma.adjustment.aggregate({
        where: { tenantId, employeeId: rec.employeeId, name: rec.name },
        _sum: { amount: true },
      });
      const totalSoFar = previousTotal._sum.amount ?? 0;
      const remaining = rec.maxAmount - totalSoFar;
      if (remaining <= 0) {
        skipped++;
        continue;
      }
      adjAmount = Math.min(adjAmount, remaining);
    }

    await prisma.adjustment.create({
      data: {
        tenantId,
        employeeId: rec.employeeId,
        name: rec.name,
        category: rec.category,
        amount: adjAmount,
        periodKey,
        source: "recurring",
      },
    });
    created++;
  }

  return { created, skipped };
}


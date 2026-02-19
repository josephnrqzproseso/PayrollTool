import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

const DEFAULT_TYPES = [
  { name: "OT Hours", category: "Taxable Earning" },
  { name: "Absence Days", category: "Basic Pay Related" },
  { name: "Late Minutes", category: "Basic Pay Related" },
  { name: "ND Hours", category: "Taxable Earning" },
  { name: "Rest Day Hours", category: "Taxable Earning" },
  { name: "Holiday Hours", category: "Taxable Earning" },
  { name: "Special Holiday Hours", category: "Taxable Earning" },
  { name: "Days Worked", category: "Basic Pay Related" },
  { name: "Rice Subsidy", category: "Non-Taxable Earning - De Minimis" },
  { name: "Clothing Allowance", category: "Non-Taxable Earning - De Minimis" },
  { name: "Laundry Allowance", category: "Non-Taxable Earning - De Minimis" },
  { name: "Medical Cash Allowance", category: "Non-Taxable Earning - De Minimis" },
  { name: "Transportation Allowance", category: "Non-Taxable Earning - Other" },
  { name: "Meal Allowance", category: "Non-Taxable Earning - Other" },
  { name: "13th Month Pay", category: "13th Month Pay and Other Benefits" },
  { name: "Cash Advance", category: "Deduction" },
  { name: "Loan Deduction", category: "Deduction" },
  { name: "SSS Loan", category: "Deduction" },
  { name: "Pag-IBIG Loan", category: "Deduction" },
  { name: "Reimbursement", category: "Addition" },
  { name: "Allowance Adjustment", category: "Addition" },
];

export async function POST() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const tenantId = ctx.tenantId;
  let created = 0;
  let updated = 0;

  for (const t of DEFAULT_TYPES) {
    const existing = await prisma.adjustmentType.findUnique({
      where: { tenantId_name: { tenantId, name: t.name } },
    });
    if (!existing) {
      await prisma.adjustmentType.create({
        data: { tenantId, name: t.name, category: t.category },
      });
      created++;
    } else if (existing.category !== t.category) {
      await prisma.adjustmentType.update({
        where: { id: existing.id },
        data: { category: t.category },
      });
      updated++;
    }
  }

  return NextResponse.json({ created, updated, total: DEFAULT_TYPES.length });
}

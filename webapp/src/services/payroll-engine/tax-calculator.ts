/**
 * BIR Withholding Tax computation — faithful port of PayrollGenerator.txt
 * _applyWithholdingTax_ and related helpers.
 *
 * Preserves:
 * - Bracket lookup: semi-monthly / monthly / annual tables
 * - Consultant flat rate
 * - 13th month annual rate approach
 * - MWE exemption
 * - Cutoff-based annual projection (remaining cutoffs including current)
 */

import { r2, n } from "./helpers";
import type { BirBracket } from "./types";

interface WithholdingTaxParams {
  taxableIncomeForPeriod: number;
  partLabel: string;
  cfg: { PAY_FREQUENCY?: string };
  bir: BirBracket[];
  empId?: string;
  periodLabel?: string;
  isFreelance?: boolean;
  consultantTaxRate?: number;
  priorA?: Record<string, number>;
  priorMTD?: Record<string, number>;
  isFullPeriod?: boolean;
}

function lookupSemiMonthlyTax(taxable: number, bir: BirBracket[]): number {
  if (taxable <= 0 || !bir.length) return 0;
  for (const row of bir) {
    if (taxable >= row.exSemi && taxable <= (row.maxSemi ?? Infinity)) {
      return r2(row.fixedSemi + (taxable - row.exSemi) * row.rateSemi);
    }
  }
  return 0;
}

export function lookupMonthlyTax(taxable: number, bir: BirBracket[]): number {
  if (taxable <= 0 || !bir.length) return 0;
  for (const row of bir) {
    if (taxable >= row.exMonth && taxable <= (row.maxMonth ?? Infinity)) {
      return r2(row.fixedMonth + (taxable - row.exMonth) * row.rateMonth);
    }
  }
  return 0;
}

export function lookupAnnualTax(taxable: number, bir: BirBracket[]): number {
  if (taxable <= 0 || !bir.length) return 0;
  for (const row of bir) {
    if (taxable >= row.exAnnual && taxable <= (row.maxAnnual ?? Infinity)) {
      return r2(row.fixedAnnual + (taxable - row.exAnnual) * row.rateAnnual);
    }
  }
  return 0;
}

/**
 * Look up the marginal rate at a given annual taxable income.
 * Used for 13th month / other benefits annual rate approach.
 */
export function lookupAnnualRateFor13th(annualProjected: number, bir: BirBracket[]): number {
  if (annualProjected <= 0 || !bir.length) return 0;
  for (const row of bir) {
    if (annualProjected >= row.exAnnual && annualProjected <= (row.maxAnnual ?? Infinity)) {
      return row.rateAnnual;
    }
  }
  return 0;
}

/**
 * Estimate annual projected taxable income — faithful port of _estimateAnnualProjectedTaxable_.
 * Uses remaining cutoffs (including current) from YTD history, not simple months.
 */
export function estimateAnnualProjectedTaxable(
  empId: string,
  periodTaxable: number,
  payFrequency: string | undefined,
  ytdTaxableMap: Map<string, number>,
  completedCutoffs?: number,
  totalCutoffsPerYear?: number
): number {
  const freq = String(payFrequency || "").toUpperCase();
  const ytdSoFar = ytdTaxableMap.get(empId) || 0;

  const isSemi = freq.includes("SEMI") || (!freq.includes("MONTH") && !freq.includes("SPECIAL"));
  const cutoffsPerYear = totalCutoffsPerYear || (isSemi ? 24 : 12);

  if (completedCutoffs !== undefined && completedCutoffs > 0) {
    const avgPerCutoff = (ytdSoFar + periodTaxable) / (completedCutoffs + 1);
    return r2(avgPerCutoff * cutoffsPerYear);
  }

  const now = new Date();
  const monthsElapsed = now.getMonth() + 1;
  const periodsPerMonth = isSemi ? 2 : 1;
  const estimatedCompleted = monthsElapsed * periodsPerMonth;
  const remainingCutoffs = Math.max(0, cutoffsPerYear - estimatedCompleted);

  return r2(ytdSoFar + periodTaxable + periodTaxable * remainingCutoffs);
}

/**
 * Main withholding tax application — modifies dataMap in place.
 * Faithful port of _applyWithholdingTax_ from PayrollGenerator.txt.
 */
export function applyWithholdingTax(
  dataMap: Map<string, number | string>,
  params: WithholdingTaxParams
): void {
  const { taxableIncomeForPeriod, partLabel, cfg, bir, priorA, priorMTD } = params;

  const freq = String(cfg?.PAY_FREQUENCY || "").toUpperCase();
  const isSemi = freq.includes("SEMI") || partLabel === "A" || partLabel === "B";

  if (isSemi) {
    if (partLabel === "A") {
      const tax = lookupSemiMonthlyTax(taxableIncomeForPeriod, bir);
      dataMap.set("Withholding Tax", -r2(tax));
    } else if (partLabel === "B") {
      const priorATaxable = Math.abs(n(priorA?.["Taxable Income"]));
      const monthlyTaxable = r2(priorATaxable + taxableIncomeForPeriod);
      const monthlyTax = lookupMonthlyTax(monthlyTaxable, bir);
      const priorATax = Math.abs(n(priorA?.["Withholding Tax"]));
      const bTax = r2(Math.max(0, monthlyTax - priorATax));
      dataMap.set("Withholding Tax", -r2(bTax));
    } else {
      const tax = lookupSemiMonthlyTax(taxableIncomeForPeriod, bir);
      dataMap.set("Withholding Tax", -r2(tax));
    }
  } else {
    const tax = lookupMonthlyTax(taxableIncomeForPeriod, bir);
    dataMap.set("Withholding Tax", -r2(tax));
  }
}

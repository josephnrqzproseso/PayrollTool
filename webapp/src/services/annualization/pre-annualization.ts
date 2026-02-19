/**
 * Pre-Annualization — faithful port of PreAnnualization.txt
 * Builds YTD facts and projects annual tax for remaining months.
 *
 * Preserves:
 * - Recurring adjustments integration (projects annual amounts minus YTD)
 * - Complex remaining cutoffs (per-employee, current month awareness)
 * - Monthly WHT simulation (BIR monthly table, per-cutoff split)
 * - Split YTD vs assumed withholding
 * - MWE: tax due = 0
 * - Semi-monthly YTD scaling for missing cutoffs
 */

import { r2 } from "../payroll-engine/helpers";
import { lookupAnnualTax } from "../payroll-engine/tax-calculator";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { BirBracket } from "../payroll-engine/types";
import type { PreAnnFacts, PreAnnResult } from "./types";

interface RecurringAnnualEntry {
  empId: string;
  name: string;
  annualAmount: number;
  category: string;
}

interface PreAnnInput {
  facts: Map<string, PreAnnFacts>;
  employeeMeta: Map<string, {
    name: string;
    group: string;
    trackingCategory1: string;
    trackingCategory2: string;
    contractType: string;
    status: string;
    isMwe: boolean;
  }>;
  birTable: BirBracket[];
  year: number;
  monthIndex: number;
  globalFrequency: string;
  recurringAnnual?: RecurringAnnualEntry[];
}

function lookupMonthlyTax(taxable: number, bir: BirBracket[]): number {
  if (taxable <= 0 || !bir.length) return 0;
  for (const row of bir) {
    if (taxable >= row.exMonth && taxable <= (row.maxMonth ?? Infinity)) {
      return r2(row.fixedMonth + (taxable - row.exMonth) * row.rateMonth);
    }
  }
  return 0;
}

export function computePreAnnualization(input: PreAnnInput): PreAnnResult[] {
  const { facts, employeeMeta, birTable, year, monthIndex, globalFrequency, recurringAnnual } = input;
  const baseRemainingMonths = Math.max(0, 12 - monthIndex);
  const results: PreAnnResult[] = [];

  const recurringByEmp = new Map<string, { taxable: number; nonTaxable: number; other13: number }>();
  if (recurringAnnual) {
    for (const r of recurringAnnual) {
      const cur = recurringByEmp.get(r.empId) || { taxable: 0, nonTaxable: 0, other13: 0 };
      const cat = r.category.toLowerCase();
      if (cat === "basic pay related" || cat === "taxable earning") {
        cur.taxable += r.annualAmount;
      } else if (cat.startsWith("non-taxable earning")) {
        cur.nonTaxable += r.annualAmount;
      } else if (cat === "13th month pay and other benefits") {
        cur.other13 += r.annualAmount;
      }
      recurringByEmp.set(r.empId, cur);
    }
  }

  facts.forEach((rec, empId) => {
    const meta = employeeMeta.get(empId) || {
      name: "", group: "", trackingCategory1: "", trackingCategory2: "",
      contractType: "", status: "", isMwe: false,
    };

    const contractUpper = meta.contractType.toUpperCase();
    if (contractUpper !== "EMPLOYEE") return;

    const isMwe = meta.isMwe || rec.isMwe;
    const isResigned = /RESIGN|SEPARAT|TERMINAT|INACTIVE/.test(meta.status.toUpperCase());
    const remainingMonths = isResigned ? 0 : baseRemainingMonths;

    let empFreq = "UNKNOWN";
    if (rec.countA > 0 || rec.countB > 0) empFreq = "SEMI";
    else if (rec.countM > 0) empFreq = "MONTH";
    else if (globalFrequency.includes("SEMI")) empFreq = "SEMI";
    else empFreq = "MONTH";
    const isSemi = empFreq === "SEMI";

    const monthsSeen = Object.keys(rec.monthsEmployedSet).length || monthIndex;
    const denomMonths = monthsSeen || 1;

    let ytdScale = 1;
    if (!isResigned && isSemi) {
      const cutoffs = rec.normalCutoffsCount || 0;
      if (cutoffs > 0) {
        const expected = monthsSeen * 2;
        if (expected > cutoffs) ytdScale = expected / cutoffs;
      }
      if (ytdScale < 1) ytdScale = 1;
    }

    const ytdBasicAdj = rec.ytdBasic * ytdScale;
    const ytdSssEeAdj = (rec.ytdSssEeMc + rec.ytdSssEeMpf) * ytdScale;
    const ytdPhEeAdj = rec.ytdPhEe * ytdScale;
    const ytdPiEeAdj = rec.ytdPiEe * ytdScale;

    const recurring = recurringByEmp.get(empId) || { taxable: 0, nonTaxable: 0, other13: 0 };
    const extraTaxable = Math.max(0, recurring.taxable - rec.ytdRecurringTaxable);
    const extra13th = Math.max(0, recurring.other13 - rec.ytdRecurring13th);

    const basicAnnual = isResigned ? ytdBasicAdj : r2(ytdBasicAdj + (ytdBasicAdj / denomMonths) * remainingMonths);
    const taxableAnnual = isResigned ? rec.ytdTaxable : r2(rec.ytdTaxable + (rec.ytdTaxable / denomMonths) * remainingMonths + extraTaxable);

    const total13th = rec.ytd13thOther;
    const projected13th = isResigned ? total13th : r2(total13th + (total13th / denomMonths) * remainingMonths + extra13th);
    const nonTaxable13th = Math.min(projected13th, OTHER_BENEFITS_EXEMPT_YTD);
    const taxable13th = Math.max(0, projected13th - nonTaxable13th);

    const sssEeAnnual = isResigned ? ytdSssEeAdj : r2(ytdSssEeAdj + (ytdSssEeAdj / denomMonths) * remainingMonths);
    const phEeAnnual = isResigned ? ytdPhEeAdj : r2(ytdPhEeAdj + (ytdPhEeAdj / denomMonths) * remainingMonths);
    const piEeAnnual = isResigned ? ytdPiEeAdj : r2(ytdPiEeAdj + (ytdPiEeAdj / denomMonths) * remainingMonths);

    const demAnnual = isResigned ? rec.ytdDeminimis : r2(rec.ytdDeminimis + (rec.ytdDeminimis / denomMonths) * remainingMonths);
    const nonTaxOtherAnnual = isResigned ? rec.ytdNonTaxOther : r2(rec.ytdNonTaxOther + (rec.ytdNonTaxOther / denomMonths) * remainingMonths);

    const annualTaxableIncome = r2(
      basicAnnual + taxableAnnual + taxable13th - sssEeAnnual - phEeAnnual - piEeAnnual
    );

    let annualTaxDue: number;
    if (isMwe) {
      annualTaxDue = 0;
    } else {
      annualTaxDue = lookupAnnualTax(annualTaxableIncome, birTable);
    }

    const ytdWtaxPaid = rec.ytdWtax;

    // Complex remaining cutoffs
    let remainingCutoffs: number;
    if (isResigned) {
      remainingCutoffs = 0;
    } else {
      const cutoffsPerMonth = isSemi ? 2 : 1;
      const fullMonthsRemaining = Math.max(0, 12 - monthIndex);

      let currentMonthRemaining = 0;
      if (rec.cutoffsThisMonth !== undefined) {
        const maxThisMonth = isSemi ? 2 : 1;
        currentMonthRemaining = Math.max(0, maxThisMonth - rec.cutoffsThisMonth);
      } else {
        if (isSemi) {
          currentMonthRemaining = 2;
          if (rec.hasA) currentMonthRemaining--;
          if (rec.hasB) currentMonthRemaining--;
        } else {
          currentMonthRemaining = rec.hasM ? 0 : 1;
        }
      }

      remainingCutoffs = Math.max(1, (fullMonthsRemaining - 1) * cutoffsPerMonth + currentMonthRemaining);
    }

    // Monthly WHT simulation
    let taxWithheldPresentAssumed = 0;
    if (!isMwe && !isResigned && remainingMonths > 0) {
      const regularTaxableAnnualPresent = r2(annualTaxableIncome);
      const monthlyTaxableProjected = r2(regularTaxableAnnualPresent / 12);
      const monthlyWtaxProjected = lookupMonthlyTax(monthlyTaxableProjected, birTable);
      taxWithheldPresentAssumed = r2(monthlyWtaxProjected * remainingMonths);
    }

    const totalWtaxPresent = r2(ytdWtaxPaid + taxWithheldPresentAssumed);
    const remainingTax = r2(Math.max(0, annualTaxDue - totalWtaxPresent));

    const perCutoffTax = remainingCutoffs > 0 ? r2(remainingTax / remainingCutoffs) : 0;

    results.push({
      empId,
      empName: meta.name || rec.empName,
      group: meta.group,
      trackingCategory1: meta.trackingCategory1,
      trackingCategory2: meta.trackingCategory2,
      frequency: empFreq,
      monthsEmployed: monthsSeen,
      remainingMonths,
      ytdBasic: r2(rec.ytdBasic),
      ytdTaxable: r2(rec.ytdTaxable),
      ytd13thOther: r2(rec.ytd13thOther),
      ytdDeminimis: r2(rec.ytdDeminimis),
      ytdNonTaxOther: r2(rec.ytdNonTaxOther),
      ytdSssEe: r2(rec.ytdSssEeMc + rec.ytdSssEeMpf),
      ytdPhEe: r2(rec.ytdPhEe),
      ytdPiEe: r2(rec.ytdPiEe),
      ytdWtax: r2(ytdWtaxPaid),
      projectedAnnualBasic: r2(basicAnnual),
      projectedAnnualTaxable: r2(taxableAnnual),
      projectedAnnual13th: r2(projected13th),
      projectedAnnualDeminimis: r2(demAnnual),
      projectedAnnualNonTaxOther: r2(nonTaxOtherAnnual),
      projectedAnnualSssEe: r2(sssEeAnnual),
      projectedAnnualPhEe: r2(phEeAnnual),
      projectedAnnualPiEe: r2(piEeAnnual),
      annualTaxableIncome: r2(annualTaxableIncome),
      annualTaxDue: r2(annualTaxDue),
      ytdWtaxPaid: r2(ytdWtaxPaid),
      taxWithheldPresentAssumed: r2(taxWithheldPresentAssumed),
      remainingTax: r2(remainingTax),
      perCutoffTax: r2(perCutoffTax),
      remainingCutoffs,
      isMwe,
    });
  });

  return results;
}

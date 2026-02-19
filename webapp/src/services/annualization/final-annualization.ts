/**
 * Final Annualization — faithful port of FinalAnnualization.txt
 * Year-end tax settlement: computes actual annual tax due vs total withheld.
 *
 * Preserves:
 * - Component-level YTD tracking (one entry per PAYROLL_HISTORY column)
 * - Column classification (BASIC/TAXABLE/DEMINIMIS/NONTAX_OTHER/OTHER13)
 * - MWE handling: basic+OT non-taxable, tax due = 0
 * - Previous employer 15+ field breakdown
 * - Non-tax repeat block for De Minimis + Non-tax Other
 * - Overtime extraction for MWE reclassification
 * - Correct taxable formula: grossComp - totalNonTax
 */

import { r2, normHdr, isOvertimeHeader, isEmployerContributionColumn, isHistoryMetaColumn, isHistoryDerivedTotalColumn, isDeductionLikeColumn } from "../payroll-engine/helpers";
import { lookupAnnualTax } from "../payroll-engine/tax-calculator";
import { classifyComponent, type ComponentMap } from "../payroll-engine/component-map";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { BirBracket } from "../payroll-engine/types";
import type { FinalAnnResult, FinalAnnComponentYtd, PreviousEmployerBreakdown } from "./types";

export type PayrollHistoryColumn = string;

type CategoryKey = "BASIC" | "TAXABLE" | "DEMINIMIS" | "NONTAX_OTHER" | "OTHER13" | "DEDUCTION" | "SKIP";

export interface FinalAnnInput {
  empId: string;
  empName: string;
  group: string;
  trackingCategory1: string;
  trackingCategory2: string;
  isMwe: boolean;

  historyRows: Array<Record<string, number | string>>;
  historyHeaders: string[];
  componentMap: ComponentMap;

  prevEmployer: PreviousEmployerBreakdown | null;

  birTable: BirBracket[];
}

function classifyHistoryColumn(header: string, componentMap: ComponentMap): CategoryKey {
  const h = normHdr(header);

  if (isHistoryMetaColumn(header)) return "SKIP";
  if (isHistoryDerivedTotalColumn(header)) return "SKIP";
  if (isEmployerContributionColumn(header)) return "SKIP";

  if (/^SSS\s*EE|^PHILHEALTH\s*EE|^PAG-?IBIG\s*EE|^HDMF\s*EE/i.test(h)) return "SKIP";
  if (/^WITHHOLDING\s*TAX$/i.test(h)) return "SKIP";

  if (isDeductionLikeColumn(header)) return "DEDUCTION";

  const cat = classifyComponent(header, componentMap).toLowerCase();

  if (cat === "basic pay related") return "BASIC";
  if (cat === "taxable earning") return "TAXABLE";
  if (cat === "non-taxable earning - de minimis" || cat.includes("deminimis")) return "DEMINIMIS";
  if (cat === "non-taxable earning - other" || cat === "non-taxable earning") return "NONTAX_OTHER";
  if (cat === "13th month pay and other benefits") return "OTHER13";
  if (cat === "deduction") return "DEDUCTION";
  if (cat === "addition") return "SKIP";

  if (/DEMINIMIS/i.test(h)) return "DEMINIMIS";
  if (/NON[- ]?TAX/i.test(h)) return "NONTAX_OTHER";
  if (/13TH\s*MONTH|OTHER\s*BENEFIT/i.test(h)) return "OTHER13";
  if (/BASIC\s*PAY|ALLOWANCE|OT\s*PAY|OVERTIME|NIGHT\s*DIFF|HOLIDAY|REST\s*DAY|ABSENCE|LATES?|TARDIN/i.test(h)) return "BASIC";

  return "TAXABLE";
}

export function computeFinalAnnualization(input: FinalAnnInput): FinalAnnResult {
  const {
    empId, empName, group, trackingCategory1, trackingCategory2,
    isMwe, historyRows, historyHeaders, componentMap,
    prevEmployer, birTable,
  } = input;

  const componentYtds: FinalAnnComponentYtd[] = [];
  const ytdByHeader = new Map<string, number>();
  const classificationByHeader = new Map<string, CategoryKey>();

  for (const hdr of historyHeaders) {
    const cat = classifyHistoryColumn(hdr, componentMap);
    classificationByHeader.set(hdr, cat);
    ytdByHeader.set(hdr, 0);
  }

  for (const row of historyRows) {
    for (const hdr of historyHeaders) {
      const cat = classificationByHeader.get(hdr);
      if (cat === "SKIP") continue;
      const val = Number(row[hdr]) || 0;
      ytdByHeader.set(hdr, (ytdByHeader.get(hdr) || 0) + val);
    }
  }

  let ytdBasic = 0;
  let ytdTaxableEarnings = 0;
  let ytd13thOther = 0;
  let ytdDeminimis = 0;
  let ytdNonTaxOther = 0;
  let ytdOvertime = 0;
  let ytdSssEe = 0;
  let ytdPhEe = 0;
  let ytdPiEe = 0;
  let ytdWtax = 0;

  for (const hdr of historyHeaders) {
    const cat = classificationByHeader.get(hdr)!;
    const val = ytdByHeader.get(hdr) || 0;

    if (cat === "SKIP") {
      const h = normHdr(hdr);
      if (/^SSS\s*EE\s*MC$/i.test(h) || /^SSS\s*EE\s*MPF$/i.test(h) || /^SSS\s*EE$/i.test(h)) ytdSssEe += Math.abs(val);
      if (/^PHILHEALTH\s*EE$/i.test(h)) ytdPhEe += Math.abs(val);
      if (/^PAG-?IBIG\s*EE$/i.test(h) || /^HDMF\s*EE$/i.test(h)) ytdPiEe += Math.abs(val);
      if (/^WITHHOLDING\s*TAX$/i.test(h)) ytdWtax += Math.abs(val);
      continue;
    }

    if (cat === "DEDUCTION") continue;

    componentYtds.push({ header: hdr, category: cat, ytdAmount: r2(val) });

    if (isOvertimeHeader(hdr)) ytdOvertime += val;

    switch (cat) {
      case "BASIC": ytdBasic += val; break;
      case "TAXABLE": ytdTaxableEarnings += val; break;
      case "DEMINIMIS": ytdDeminimis += val; break;
      case "NONTAX_OTHER": ytdNonTaxOther += val; break;
      case "OTHER13": ytd13thOther += val; break;
    }
  }

  ytdBasic = r2(ytdBasic);
  ytdTaxableEarnings = r2(ytdTaxableEarnings);
  ytd13thOther = r2(ytd13thOther);
  ytdDeminimis = r2(ytdDeminimis);
  ytdNonTaxOther = r2(ytdNonTaxOther);
  ytdOvertime = r2(ytdOvertime);
  ytdSssEe = r2(ytdSssEe);
  ytdPhEe = r2(ytdPhEe);
  ytdPiEe = r2(ytdPiEe);
  ytdWtax = r2(ytdWtax);

  // MWE: Basic + OT become non-taxable
  let mweNonTaxBasic = 0;
  let mweNonTaxOvertime = 0;
  if (isMwe) {
    const eeContribYtd = ytdSssEe + ytdPhEe + ytdPiEe;
    mweNonTaxBasic = r2(Math.max(0, ytdBasic - eeContribYtd));
    mweNonTaxOvertime = r2(ytdOvertime);
  }

  // Gross compensation present employer
  const totalGrossCompPresent = r2(ytdBasic + ytdTaxableEarnings + ytd13thOther + ytdDeminimis + ytdNonTaxOther);

  // Non-taxable components
  const nonTaxable13th = Math.min(ytd13thOther, OTHER_BENEFITS_EXEMPT_YTD);
  const eeContrib = r2(ytdSssEe + ytdPhEe + ytdPiEe);

  let totalNonTaxableComp = r2(
    ytdDeminimis +
    ytdNonTaxOther +
    nonTaxable13th +
    eeContrib +
    mweNonTaxBasic +
    mweNonTaxOvertime
  );

  const taxableCompPresent = r2(totalGrossCompPresent - totalNonTaxableComp);

  // Previous employer
  const prevTaxable = prevEmployer?.taxableCompensation ?? 0;
  const prevWtax = prevEmployer?.taxesWithheld ?? 0;

  // Total compensation (present + previous)
  const totalCompensationIncome = r2(totalGrossCompPresent + prevTaxable);
  const totalNonTaxableIncome = r2(totalNonTaxableComp);
  const totalTaxableIncome = r2(taxableCompPresent + prevTaxable);

  // Annual tax due
  let totalTaxDue: number;
  if (isMwe) {
    totalTaxDue = 0;
  } else {
    totalTaxDue = lookupAnnualTax(Math.max(0, totalTaxableIncome), birTable);
  }

  const totalTaxWithheld = r2(ytdWtax + prevWtax);
  const taxDifference = r2(totalTaxDue - totalTaxWithheld);

  return {
    empId,
    empName,
    group,
    trackingCategory1,
    trackingCategory2,
    isMwe,

    componentYtds,

    ytdBasic,
    ytdTaxableEarnings,
    ytd13thOther,
    ytdDeminimis,
    ytdNonTaxOther,
    ytdOvertime,

    ytdSssEe,
    ytdPhEe,
    ytdPiEe,
    ytdWtax,

    mweNonTaxBasic,
    mweNonTaxOvertime,

    totalGrossCompPresent,
    totalNonTaxableComp,
    totalTaxableComp: r2(taxableCompPresent),

    totalCompensationIncome,
    totalNonTaxableIncome,
    totalTaxableIncome,
    totalExemptions: eeContrib,
    totalTaxDue: r2(totalTaxDue),
    totalTaxWithheld,
    taxDifference,

    prevEmployer: prevEmployer ?? null,
    prevEmployerTaxable: r2(prevTaxable),
    prevEmployerWtax: r2(prevWtax),
  };
}

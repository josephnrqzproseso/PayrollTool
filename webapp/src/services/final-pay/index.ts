/**
 * Final Pay computation — faithful port of FinalPay.txt.
 *
 * Preserves:
 * - Final pay computation with annualization (_buildFinalAnnFacts_)
 * - Tax settlement logic (variance = tax due - YTD withheld)
 * - Tax refund writing (negative Withholding Tax if over-withheld)
 * - MWE handling (tax = 0)
 * - Previous employer integration
 * - Period format: YYYY-MM-FP
 * - YTD calculations including final pay components
 * - Tracking column support
 */

import { r2, n, normHdr, fmtDate, isOvertimeHeader } from "../payroll-engine/helpers";
import { lookupAnnualTax } from "../payroll-engine/tax-calculator";
import { classifyComponent, type ComponentMap } from "../payroll-engine/component-map";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { BirBracket } from "../payroll-engine/types";
import type { PreviousEmployerBreakdown } from "../annualization/types";

export interface FinalPayInput {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  isMwe: boolean;
  contractType: string;
  payBasis: string;
  basicPay: number;
  trackingCategory1: string;
  trackingCategory2: string;
  payrollGroup: string;
  trackingDimensions?: Record<string, string>;

  // Date params
  endDate: string;
  fromDate: string;
  toDate: string;
  creditingDate: string;

  // Final pay line items
  unpaidSalary: number;
  proRated13thMonth: number;
  leaveConversion: number;
  separationPay: number;
  otherEarnings: number;
  otherEarningsLabel: string;

  // Deductions
  sssLoan: number;
  pagibigLoan: number;
  otherDeductions: number;
  otherDeductionsLabel: string;

  // Statutory contributions for final period (if applicable)
  sssEeMc: number;
  sssEeMpf: number;
  phEe: number;
  piEe: number;
  sssErMc: number;
  sssErMpf: number;
  sssEc: number;
  phEr: number;
  piEr: number;

  // YTD data from payroll history
  ytdBasic: number;
  ytdTaxableEarnings: number;
  ytd13thOther: number;
  ytdDeminimis: number;
  ytdNonTaxOther: number;
  ytdSssEe: number;
  ytdPhEe: number;
  ytdPiEe: number;
  ytdWtax: number;
  ytdOvertime: number;

  // Previous employer
  prevEmployer: PreviousEmployerBreakdown | null;

  birTable: BirBracket[];
  componentMap: ComponentMap;
}

export interface FinalPayResult {
  headers: string[];
  row: Record<string, number | string>;
  periodLabel: string;

  // Annualization summary
  totalGrossCompYtd: number;
  totalNonTaxableYtd: number;
  totalTaxableYtd: number;
  annualTaxDue: number;
  totalTaxWithheld: number;
  taxSettlement: number;

  grossPay: number;
  netPay: number;
}

export function computeFinalPay(input: FinalPayInput): FinalPayResult {
  const {
    employeeId, employeeCode, employeeName, isMwe, contractType,
    payBasis, basicPay,
    trackingCategory1, trackingCategory2, payrollGroup, trackingDimensions,
    endDate, fromDate, toDate, creditingDate,
    unpaidSalary, proRated13thMonth, leaveConversion, separationPay,
    otherEarnings, otherEarningsLabel,
    sssLoan, pagibigLoan, otherDeductions, otherDeductionsLabel,
    sssEeMc, sssEeMpf, phEe, piEe,
    sssErMc, sssErMpf, sssEc, phEr, piEr,
    ytdBasic, ytdTaxableEarnings, ytd13thOther, ytdDeminimis, ytdNonTaxOther,
    ytdSssEe, ytdPhEe, ytdPiEe, ytdWtax, ytdOvertime,
    prevEmployer, birTable,
  } = input;

  const endDateObj = new Date(endDate);
  const year = endDateObj.getFullYear();
  const month = endDateObj.getMonth() + 1;
  const periodLabel = `${year}-${String(month).padStart(2, "0")}-FP`;

  const dataMap = new Map<string, number | string>();

  // Metadata
  dataMap.set("Employee ID", employeeCode);
  dataMap.set("Employee Name", employeeName);
  dataMap.set("Tracking Category 1", trackingCategory1);
  dataMap.set("Payroll Group", payrollGroup);
  dataMap.set("Tracking Category 2", trackingCategory2);
  dataMap.set("Period", periodLabel);
  dataMap.set("From", fromDate);
  dataMap.set("To", toDate);
  dataMap.set("Crediting Date", creditingDate);

  // Earnings
  dataMap.set("Unpaid Salary", r2(unpaidSalary));
  dataMap.set("Pro-Rated 13th Month", r2(proRated13thMonth));
  dataMap.set("Leave Conversion", r2(leaveConversion));
  dataMap.set("Separation Pay", r2(separationPay));
  if (otherEarnings) {
    dataMap.set(otherEarningsLabel || "Other Earnings", r2(otherEarnings));
  }

  // Statutory for final period
  dataMap.set("SSS EE MC", r2(-sssEeMc));
  dataMap.set("SSS EE MPF", r2(-sssEeMpf));
  dataMap.set("SSS EE", r2(-(sssEeMc + sssEeMpf)));
  dataMap.set("PhilHealth EE", r2(-phEe));
  dataMap.set("Pag-IBIG EE", r2(-piEe));
  dataMap.set("SSS ER MC", r2(sssErMc));
  dataMap.set("SSS ER MPF", r2(sssErMpf));
  dataMap.set("SSS ER", r2(sssErMc + sssErMpf));
  dataMap.set("SSS EC", r2(sssEc));
  dataMap.set("PhilHealth ER", r2(phEr));
  dataMap.set("Pag-IBIG ER", r2(piEr));

  // Deductions
  if (sssLoan) dataMap.set("SSS LOAN", r2(-sssLoan));
  if (pagibigLoan) dataMap.set("HDMF LOAN", r2(-pagibigLoan));
  if (otherDeductions) {
    dataMap.set(otherDeductionsLabel || "Other Deductions", r2(-otherDeductions));
  }

  // YTD including this final pay
  const finalBasic = unpaidSalary;
  const final13th = proRated13thMonth;
  const finalTaxableEarnings = leaveConversion + otherEarnings;
  const finalSssEe = sssEeMc + sssEeMpf;
  const finalPhEe = phEe;
  const finalPiEe = piEe;

  const totalYtdBasic = r2(ytdBasic + finalBasic);
  const totalYtdTaxable = r2(ytdTaxableEarnings + finalTaxableEarnings);
  const totalYtd13th = r2(ytd13thOther + final13th);
  const totalYtdSssEe = r2(ytdSssEe + finalSssEe);
  const totalYtdPhEe = r2(ytdPhEe + finalPhEe);
  const totalYtdPiEe = r2(ytdPiEe + finalPiEe);

  // Annualization for tax settlement
  const totalGrossComp = r2(totalYtdBasic + totalYtdTaxable + totalYtd13th + ytdDeminimis + ytdNonTaxOther);

  // MWE: basic + OT → non-taxable, tax = 0
  const eeContrib = r2(totalYtdSssEe + totalYtdPhEe + totalYtdPiEe);
  let mweNonTaxBasic = 0;
  let mweNonTaxOT = 0;
  if (isMwe) {
    mweNonTaxBasic = r2(Math.max(0, totalYtdBasic - eeContrib));
    mweNonTaxOT = r2(ytdOvertime);
  }

  const nonTaxable13th = Math.min(totalYtd13th, OTHER_BENEFITS_EXEMPT_YTD);
  const totalNonTaxable = r2(
    ytdDeminimis + ytdNonTaxOther + nonTaxable13th + eeContrib + mweNonTaxBasic + mweNonTaxOT
  );

  const totalTaxableComp = r2(totalGrossComp - totalNonTaxable);

  // Previous employer
  const prevTaxable = prevEmployer?.taxableCompensation ?? 0;
  const prevWtax = prevEmployer?.taxesWithheld ?? 0;
  const totalTaxableIncome = r2(totalTaxableComp + prevTaxable);

  // Annual tax due
  let annualTaxDue: number;
  if (isMwe) {
    annualTaxDue = 0;
  } else {
    annualTaxDue = lookupAnnualTax(Math.max(0, totalTaxableIncome), birTable);
  }

  const totalTaxWithheld = r2(ytdWtax + prevWtax);

  // Tax settlement: positive = employee still owes, negative = refund
  const taxSettlement = r2(annualTaxDue - totalTaxWithheld);

  // Write tax settlement as Withholding Tax
  dataMap.set("Withholding Tax", r2(-taxSettlement));

  // Gross pay for final period
  const grossPay = r2(unpaidSalary + proRated13thMonth + leaveConversion + separationPay + otherEarnings);
  dataMap.set("Gross Pay", grossPay);

  // Net pay
  const totalStatDed = r2(sssEeMc + sssEeMpf + phEe + piEe);
  const totalManualDed = r2(sssLoan + pagibigLoan + otherDeductions);
  const wtaxAmount = Math.abs(taxSettlement);
  const wtaxSign = taxSettlement > 0 ? 1 : -1;

  const netPay = r2(grossPay - totalStatDed - totalManualDed - wtaxSign * wtaxAmount);
  dataMap.set("Net Pay", netPay);

  // Build output headers
  const headers = [
    "Employee ID", "Employee Name", "Tracking Category 1", "Payroll Group", "Tracking Category 2",
    "Period", "From", "To", "Crediting Date",
    "Unpaid Salary", "Pro-Rated 13th Month", "Leave Conversion", "Separation Pay",
  ];
  if (otherEarnings) headers.push(otherEarningsLabel || "Other Earnings");
  headers.push("Gross Pay", "SSS EE MC", "SSS EE MPF", "SSS EE", "PhilHealth EE", "Pag-IBIG EE");
  if (sssLoan) headers.push("SSS LOAN");
  if (pagibigLoan) headers.push("HDMF LOAN");
  if (otherDeductions) headers.push(otherDeductionsLabel || "Other Deductions");
  headers.push("Withholding Tax", "Net Pay");
  headers.push("SSS ER MC", "SSS ER MPF", "SSS ER", "SSS EC", "PhilHealth ER", "Pag-IBIG ER");

  if (trackingDimensions) {
    for (const [kindName, optionName] of Object.entries(trackingDimensions)) {
      dataMap.set(`Tracking: ${kindName}`, optionName);
    }
  }

  const row: Record<string, number | string> = {};
  for (const h of headers) row[h] = dataMap.get(h) ?? "";

  return {
    headers,
    row,
    periodLabel,
    totalGrossCompYtd: r2(totalGrossComp),
    totalNonTaxableYtd: r2(totalNonTaxable),
    totalTaxableYtd: r2(totalTaxableIncome),
    annualTaxDue: r2(annualTaxDue),
    totalTaxWithheld: r2(totalTaxWithheld),
    taxSettlement: r2(taxSettlement),
    grossPay: r2(grossPay),
    netPay: r2(netPay),
  };
}

/**
 * Monthly payroll runner — port of _runPayrollMonthly_.
 * Full-month: no A/B splitting, all component modes treated as "full".
 * Monthly BIR brackets. Prior-taken still protects monthly caps.
 */

import { r2, n, normHdr, fmtDate, formatPayrollMonth, isSystemComponentName, canonicalSysKey, isDeductionComponent, isSssBaseComponent, isPhilHealthBaseComponent, isUnworkedTime, isSalaryAdjustment, getSignedForPeriod, parsePercentOrNumber } from "./helpers";
import { computeStatutoryForPeriod } from "./statutory-contributions";
import { applyWithholdingTax, lookupAnnualRateFor13th, estimateAnnualProjectedTaxable } from "./tax-calculator";
import { classifyComponent, type ComponentMap, isDeductionCategory, isAdditionCategory } from "./component-map";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { EmployeeRow, Adjustment, BirBracket, SssBracket, PayrollConfig, PayrollRowOutput, PayrollRunResult, ProgressCallback } from "./types";

interface MonthlyRunnerInput {
  employees: EmployeeRow[];
  adjustments: Adjustment[];
  birTable: BirBracket[];
  sssTable: SssBracket[];
  componentMap: ComponentMap;
  cfg: PayrollConfig;
  form: {
    payrollCode: string;
    startDate: string;
    endDate: string;
    entity: string;
    payrollGroups: string[];
    creditingDate?: string;
    computeTax: boolean;
    computeContrib: boolean;
  };
  takenMap: Map<string, Record<string, number>>;
  takenByPt: { A: Map<string, Record<string, number>>; B: Map<string, Record<string, number>> };
  ytdOtherBenefitsMap: Map<string, number>;
  ytdTaxableIncomeMap: Map<string, number>;
  attendanceDaysMap: Map<string, number>;
  onProgress?: ProgressCallback;
}

export function runPayrollMonthly(input: MonthlyRunnerInput): PayrollRunResult {
  const { employees, adjustments, birTable, sssTable, componentMap, cfg, form, takenMap, ytdOtherBenefitsMap, ytdTaxableIncomeMap, attendanceDaysMap, onProgress } = input;

  const rangeStart = new Date(form.startDate);
  const rangeEnd = new Date(form.endDate);
  const anchorDate = rangeEnd;
  const partLabel = "M";

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth() + 1;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodLabel = `${periodKey}-M`;
  const payrollMonth = formatPayrollMonth(anchorDate);

  const progress = onProgress || (() => {});
  progress(0, "Phase 1/4: Loading settings & source data...", "--");

  const nameToCat = new Map<string, string>();
  const allAdjNamesSet = new Set<string>();
  for (const a of adjustments) {
    const aName = String(a.name || "").trim();
    if (!aName || isSystemComponentName(aName)) continue;
    allAdjNamesSet.add(aName);
    if (!nameToCat.has(aName)) nameToCat.set(aName, a.cat);
  }

  const addlEarningCols: string[] = [];
  const dynamicDeductionCols: string[] = [];
  const dynamicAdditionCols: string[] = [];
  for (const aName of allAdjNamesSet) {
    const cat = (nameToCat.get(aName) || "").toLowerCase();
    if (cat === "deduction") dynamicDeductionCols.push(aName);
    else if (cat === "addition") dynamicAdditionCols.push(aName);
    else addlEarningCols.push(aName);
  }

  const preCols = ["Employee ID", "Employee Name", "Tracking Category 1", "Payroll Group", "Tracking Category 2", "Period", "From", "To", "Crediting Date", "Payroll Month"];
  const baseEarningCols = ["BASIC PAY", "NON-TAXABLE ALLOWANCE", "DEMINIMIS ALLOWANCE", "MONTHLY TAXABLE ALLOWANCE", "ALLOWANCE", "REGULAR OT PAY", "NIGHT DIFFERENTIAL", "HOLIDAY PAY", "REST DAY PAY", "ABSENCES", "LATES"];
  const coreCols = ["Gross Pay", "SSS EE MC", "SSS EE MPF", "SSS EE", "PhilHealth EE", "Pag-IBIG EE", "Taxable Income", "Withholding Tax"];
  const fixedDeductionHeaders = ["SSS LOAN", "SSS CALAMITY LOAN", "HDMF LOAN", "HDMF CALAMITY LOAN", "HMO DEDUCTION", "OTHER DEDUCTIONS"];
  const postCols = ["Net Pay", "SSS ER MC", "SSS ER MPF", "SSS ER", "SSS EC", "PhilHealth ER", "Pag-IBIG ER"];

  const fullHeader = [...new Set([...preCols, ...baseEarningCols, ...addlEarningCols, ...coreCols, ...dynamicAdditionCols, ...fixedDeductionHeaders, ...dynamicDeductionCols, ...postCols])];

  const outRows: PayrollRowOutput[] = [];
  const total = employees.length;
  const nonEarningCols = new Set(["WITHHOLDING TAX", "TAXABLE INCOME", "GROSS PAY", "NET PAY", "PHILHEALTH EE", "PAG-IBIG EE", "SSS EC", "PHILHEALTH ER", "PAG-IBIG ER", "SSS EE", "SSS ER", "SSS EE MC", "SSS EE MPF", "SSS ER MC", "SSS ER MPF"]);

  for (let i = 0; i < total; i++) {
    const emp = employees[i];
    if (!emp.employeeId || !emp.employeeName) continue;
    if (emp.status && String(emp.status).trim().toLowerCase() !== "active") continue;

    const activeStart = emp.dateHired && emp.dateHired > rangeStart ? emp.dateHired : rangeStart;
    const activeEnd = emp.dateSeparated && emp.dateSeparated < rangeEnd ? emp.dateSeparated : rangeEnd;
    if (activeStart > activeEnd) continue;

    const isConsultant = /freelance|contractor|consultant/.test(emp.contractType.toLowerCase());
    const isRetired = emp.appliedForRetirement;
    const isPwd = emp.isPwd;
    const isFilipino = emp.nationality.toUpperCase().includes("FILIPINO");
    const isMwe = emp.isMwe;
    const isDailyPayBasis = emp.payBasis === "DAILY";

    const priorTaken = takenMap.get(emp.employeeId) || {};
    const priorFor = (k: string) => n(takenMap.get(emp.employeeId)?.[k]);

    const dataMap = new Map<string, number | string>();
    const baseMonthlySalary = emp.computedBasicPay > 0 ? emp.computedBasicPay : emp.basicPay;

    // Monthly: full component, no split
    for (const header of fullHeader) {
      const up = normHdr(header);
      if (["EMPLOYEE ID", "EMPLOYEE NAME", "TRACKING CATEGORY 1", "PAYROLL GROUP", "TRACKING CATEGORY 2"].includes(up)) continue;

      if (up === "BASIC PAY") {
        if (isDailyPayBasis) {
          const daysWorked = attendanceDaysMap.get(emp.employeeId) || 0;
          dataMap.set(header, r2(baseMonthlySalary * daysWorked - priorFor(header)));
        } else {
          dataMap.set(header, r2(baseMonthlySalary - priorFor(header)));
        }
        continue;
      }

      const fieldVal = emp.dynamicFields[header];
      if (fieldVal !== undefined && typeof fieldVal === "number") {
        dataMap.set(header, r2(fieldVal - priorFor(header)));
      }
    }

    // Adjustments
    const myAdj = adjustments.filter((a) => a.empId === emp.employeeId);
    let basicRelatedSum = 0, basicRelatedSumPH = 0, taxableOnlySum = 0;
    const sysAdj: Record<string, number> = { "SSS EE MC": 0, "SSS EE MPF": 0, "PhilHealth EE": 0, "Pag-IBIG EE": 0, "SSS ER MC": 0, "SSS ER MPF": 0, "SSS EC": 0, "PhilHealth ER": 0, "Pag-IBIG ER": 0, "Withholding Tax": 0 };

    for (const adj of myAdj) {
      const valueForRun = r2((adj.amt || 0) - priorFor(adj.name));
      const cat = (adj.cat || "").toLowerCase();

      const sysKey = canonicalSysKey(adj.name);
      if (sysKey && sysKey in sysAdj) { sysAdj[sysKey] += valueForRun; dataMap.set(sysKey, n(dataMap.get(sysKey)) + valueForRun); continue; }

      dataMap.set(adj.name, valueForRun);
      if (isSssBaseComponent(adj.name, cat)) basicRelatedSum += valueForRun;
      if (isPhilHealthBaseComponent(adj.name, cat)) basicRelatedSumPH += valueForRun;
      else if (cat === "taxable earning") taxableOnlySum += valueForRun;
    }

    // Statutory
    const stat = form.computeContrib && !isConsultant && !isRetired
      ? computeStatutoryForPeriod({ baseMonthlySSSPI: baseMonthlySalary + basicRelatedSum, baseMonthlyPH: baseMonthlySalary + basicRelatedSumPH, getModeFor: () => "full", sssTable, isFullPeriod: true, priorTaken, partLabel, empId: emp.employeeId, periodLabel, cfg, isDailyPayBasis })
      : { sssEeMc: 0, sssEeMpf: 0, sssErMc: 0, sssErMpf: 0, sssEc: 0, phEe: 0, phEr: 0, piEe: 0, piEr: 0 };

    if (isPwd && !isConsultant && !isRetired) stat.phEe = 0;
    if (!isFilipino && !isConsultant && !isRetired) { stat.piEe = 0; stat.piEr = 0; }

    dataMap.set("SSS EE MC", r2(-stat.sssEeMc + (sysAdj["SSS EE MC"] || 0)));
    dataMap.set("SSS EE MPF", r2(-stat.sssEeMpf + (sysAdj["SSS EE MPF"] || 0)));
    dataMap.set("PhilHealth EE", r2(-stat.phEe + (sysAdj["PhilHealth EE"] || 0)));
    dataMap.set("Pag-IBIG EE", r2(-stat.piEe + (sysAdj["Pag-IBIG EE"] || 0)));
    dataMap.set("SSS ER MC", r2(stat.sssErMc + (sysAdj["SSS ER MC"] || 0)));
    dataMap.set("SSS ER MPF", r2(stat.sssErMpf + (sysAdj["SSS ER MPF"] || 0)));
    dataMap.set("SSS EC", r2(stat.sssEc + (sysAdj["SSS EC"] || 0)));
    dataMap.set("PhilHealth ER", r2(stat.phEr + (sysAdj["PhilHealth ER"] || 0)));
    dataMap.set("Pag-IBIG ER", r2(stat.piEr + (sysAdj["Pag-IBIG ER"] || 0)));

    // Legacy SSS totals
    dataMap.set("SSS EE", r2(n(dataMap.get("SSS EE MC")) + n(dataMap.get("SSS EE MPF"))));
    dataMap.set("SSS ER", r2(n(dataMap.get("SSS ER MC")) + n(dataMap.get("SSS ER MPF"))));

    // Taxable income + Withholding Tax (same logic as core, but with monthly bracket)
    let taxableEarnings = basicRelatedSum + taxableOnlySum;
    for (const [key] of Object.entries(emp.dynamicFields)) {
      const cat = classifyComponent(key, componentMap);
      const v = n(dataMap.get(key));
      if (cat === "Basic Pay Related" || cat === "Taxable Earning") taxableEarnings += v;
    }

    let otherBenefitsThisRun = 0;
    for (const h of fullHeader) {
      const v = n(dataMap.get(h));
      if (!v) continue;
      const catI = (nameToCat.get(h) || "").toLowerCase();
      const catM = classifyComponent(h, componentMap).toLowerCase();
      if ((catI || catM) === "13th month pay and other benefits") otherBenefitsThisRun += v;
    }

    let taxableOtherBenefits = 0;
    const priorYtdTotal = Math.abs(ytdOtherBenefitsMap.get(emp.employeeId) || 0);
    const remainingExempt = Math.max(0, OTHER_BENEFITS_EXEMPT_YTD - priorYtdTotal);
    if (otherBenefitsThisRun !== 0) {
      const runAbs = Math.abs(otherBenefitsThisRun);
      taxableOtherBenefits = (otherBenefitsThisRun >= 0 ? 1 : -1) * Math.max(0, runAbs - remainingExempt);
    }
    taxableEarnings += taxableOtherBenefits;

    const sssEeActual = Math.abs(n(dataMap.get("SSS EE MC"))) + Math.abs(n(dataMap.get("SSS EE MPF")));
    const phEeActual = Math.abs(n(dataMap.get("PhilHealth EE")));
    const piEeActual = Math.abs(n(dataMap.get("Pag-IBIG EE")));
    const taxableIncomeForPeriod = Math.max(0, taxableEarnings - sssEeActual - phEeActual - piEeActual);
    dataMap.set("Taxable Income", r2(taxableIncomeForPeriod));

    if (form.computeTax && !isMwe) {
      if (isConsultant) {
        dataMap.set("Withholding Tax", -r2(taxableIncomeForPeriod * emp.consultantTaxRate));
      } else {
        applyWithholdingTax(dataMap, { taxableIncomeForPeriod, partLabel: "M", cfg, bir: birTable });
      }
    } else {
      dataMap.set("Withholding Tax", 0);
    }
    if (sysAdj["Withholding Tax"]) dataMap.set("Withholding Tax", r2(n(dataMap.get("Withholding Tax")) + sysAdj["Withholding Tax"]));

    // Gross & Net
    let grossPay = 0, totalDeductions = 0;
    for (const h of fullHeader) {
      const up = normHdr(h);
      const v = n(dataMap.get(h));
      if (nonEarningCols.has(up)) continue;
      const catI = (nameToCat.get(h) || "").toLowerCase();
      const catM = classifyComponent(h, componentMap).toLowerCase();
      const cat = catI || catM;
      if (isDeductionCategory(cat) || (!cat && isDeductionComponent(h))) {
        if (v < 0) totalDeductions += Math.abs(v); else if (v > 0) totalDeductions -= Math.abs(v);
        continue;
      }
      if (isAdditionCategory(cat)) continue;
      if (v > 0) grossPay += v;
      if (v < 0 && (isUnworkedTime(h) || isSalaryAdjustment(h))) grossPay += v;
    }

    let netOnlyAdditions = 0;
    for (const h of fullHeader) {
      const v = n(dataMap.get(h));
      if (!v) continue;
      const catI = (nameToCat.get(h) || "").toLowerCase();
      const catM = classifyComponent(h, componentMap).toLowerCase();
      if (isAdditionCategory(catI || catM)) netOnlyAdditions += v;
    }

    const sssEE = n(dataMap.get("SSS EE MC")) + n(dataMap.get("SSS EE MPF"));
    const wtaxSigned = n(dataMap.get("Withholding Tax"));
    const statutoryDed = Math.abs(sssEE) + Math.abs(n(dataMap.get("PhilHealth EE"))) + Math.abs(n(dataMap.get("Pag-IBIG EE"))) + (wtaxSigned < 0 ? Math.abs(wtaxSigned) : -Math.abs(wtaxSigned));
    const netPay = r2(grossPay - (statutoryDed + totalDeductions) + netOnlyAdditions);

    dataMap.set("Gross Pay", r2(grossPay));
    dataMap.set("Net Pay", netPay);
    dataMap.set("Employee ID", emp.employeeCode);
    dataMap.set("Employee Name", emp.employeeName);
    dataMap.set("Tracking Category 1", emp.trackingCategory1);
    dataMap.set("Payroll Group", emp.payrollGroup);
    dataMap.set("Tracking Category 2", emp.trackingCategory2);
    if (emp.trackingDimensions) {
      for (const [kindName, optionName] of Object.entries(emp.trackingDimensions)) {
        dataMap.set(`Tracking: ${kindName}`, optionName);
      }
    }
    dataMap.set("Period", periodLabel);
    dataMap.set("From", fmtDate(rangeStart));
    dataMap.set("To", fmtDate(rangeEnd));
    dataMap.set("Crediting Date", form.creditingDate || fmtDate(rangeEnd));
    dataMap.set("Payroll Month", payrollMonth);

    const row: PayrollRowOutput = {};
    for (const h of fullHeader) row[h] = dataMap.get(h) ?? "";
    outRows.push(row);

    if (i % 5 === 0 || i + 1 === total) progress(Math.min(98, Math.round(((i + 1) / total) * 100)), `Computing (${i + 1}/${total})...`, "");
  }

  progress(100, "Monthly payroll complete!", "0s");

  return {
    headers: fullHeader,
    rows: outRows,
    periodLabel,
    payrollMonth,
    totalEmployees: outRows.length,
    totalGrossPay: r2(outRows.reduce((s, r) => s + n(r["Gross Pay"]), 0)),
    totalNetPay: r2(outRows.reduce((s, r) => s + n(r["Net Pay"]), 0)),
  };
}

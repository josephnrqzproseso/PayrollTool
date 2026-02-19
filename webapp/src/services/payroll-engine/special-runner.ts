/**
 * Special payroll runner — port of _runPayrollSpecial_.
 * Inputs-only: no Masterfile pay components pulled, only identity fields.
 * Adjustments drive all earning/deduction columns.
 */

import { r2, n, normHdr, fmtDate, formatPayrollMonth, isSystemComponentName, canonicalSysKey } from "./helpers";
import { applyWithholdingTax, lookupAnnualRateFor13th, estimateAnnualProjectedTaxable } from "./tax-calculator";
import { classifyComponent, type ComponentMap, isDeductionCategory, isAdditionCategory } from "./component-map";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { EmployeeRow, Adjustment, BirBracket, PayrollConfig, PayrollRowOutput, PayrollRunResult, ProgressCallback } from "./types";

interface SpecialRunnerInput {
  employees: EmployeeRow[];
  adjustments: Adjustment[];
  birTable: BirBracket[];
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
  };
  takenMap: Map<string, Record<string, number>>;
  ytdOtherBenefitsMap: Map<string, number>;
  ytdTaxableIncomeMap: Map<string, number>;
  onProgress?: ProgressCallback;
}

export function runPayrollSpecial(input: SpecialRunnerInput): PayrollRunResult {
  const { employees, adjustments, birTable, componentMap, cfg, form, takenMap, ytdOtherBenefitsMap, ytdTaxableIncomeMap, onProgress } = input;

  const rangeStart = new Date(form.startDate);
  const rangeEnd = new Date(form.endDate);
  const anchorDate = rangeEnd;

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth() + 1;
  const rawCode = String(form.payrollCode || "SPECIAL").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const partLabel = `S-${rawCode || "SPECIAL"}`;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodLabel = `${periodKey}-${partLabel}`;
  const payrollMonth = formatPayrollMonth(anchorDate);

  const progress = onProgress || (() => {});
  progress(0, "Phase 1/4: Loading settings & source data...", "--");

  // Group adjustments by employee
  const byEmp = new Map<string, Adjustment[]>();
  const nameToCat = new Map<string, string>();
  const allAdjNamesOrder: string[] = [];

  for (const a of adjustments) {
    const aName = String(a.name || "").trim();
    if (!aName || !a.empId) continue;
    if (!byEmp.has(a.empId)) byEmp.set(a.empId, []);
    byEmp.get(a.empId)!.push(a);
    if (!nameToCat.has(aName)) {
      allAdjNamesOrder.push(aName);
      nameToCat.set(aName, String(a.cat || "").trim());
    }
  }

  const addlEarningCols: string[] = [];
  const dynamicDeductionCols: string[] = [];
  const dynamicAdditionCols: string[] = [];

  for (const aName of allAdjNamesOrder) {
    if (isSystemComponentName(aName)) continue;
    const cat = (nameToCat.get(aName) || "").toLowerCase();
    if (cat === "deduction") dynamicDeductionCols.push(aName);
    else if (cat === "addition") dynamicAdditionCols.push(aName);
    else addlEarningCols.push(aName);
  }

  const preCols = ["Employee ID", "Employee Name", "Tracking Category 1", "Payroll Group", "Tracking Category 2", "Period", "From", "To", "Crediting Date", "Payroll Month"];
  const coreCols = ["Gross Pay", "SSS EE MC", "SSS EE MPF", "SSS EE", "PhilHealth EE", "Pag-IBIG EE", "Taxable Income", "Withholding Tax"];
  const fixedDeductionHeaders = ["SSS LOAN", "SSS CALAMITY LOAN", "HDMF LOAN", "HDMF CALAMITY LOAN", "HMO DEDUCTION", "OTHER DEDUCTIONS"];
  const postCols = ["Net Pay", "SSS ER MC", "SSS ER MPF", "SSS ER", "SSS EC", "PhilHealth ER", "Pag-IBIG ER"];

  const fullHeader: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (h: string) => { const k = h.trim(); if (k && !seen.has(k)) { seen.add(k); fullHeader.push(k); } };
  [...preCols, ...addlEarningCols, ...coreCols, ...dynamicAdditionCols, ...fixedDeductionHeaders, ...dynamicDeductionCols, ...postCols].forEach(pushUnique);

  const outRows: PayrollRowOutput[] = [];
  const empIds = Array.from(byEmp.keys());
  const total = empIds.length;

  for (let i = 0; i < total; i++) {
    const empId = empIds[i];
    const emp = employees.find((e) => e.employeeId === empId);
    if (!emp) continue;
    if (emp.status && String(emp.status).trim().toLowerCase() !== "active") continue;

    const isConsultant = /freelance|contractor|consultant/.test(emp.contractType.toLowerCase());
    const isRetired = emp.appliedForRetirement;
    const isFilipino = emp.nationality.toUpperCase().includes("FILIPINO");
    const isMwe = emp.isMwe;

    const dataMap = new Map<string, number | string>();
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

    // Apply adjustments (no statutory computed for SPECIAL; only explicit system adj from Inputs)
    const inputsForEmp = byEmp.get(empId) || [];
    let sumBasicRelated = 0, sumTaxableOnly = 0, manualDeductionAbs = 0, additionSum = 0;
    const sysAdj: Record<string, number> = { "SSS EE MC": 0, "SSS EE MPF": 0, "SSS ER MC": 0, "SSS ER MPF": 0, "SSS EC": 0, "PhilHealth EE": 0, "PhilHealth ER": 0, "Pag-IBIG EE": 0, "Pag-IBIG ER": 0 };

    for (const adj of inputsForEmp) {
      const val = r2(adj.amt || 0);
      const cat = (adj.cat || "").toLowerCase();

      const sysKey = canonicalSysKey(adj.name);
      if (sysKey && sysKey in sysAdj) { sysAdj[sysKey] += val; dataMap.set(sysKey, n(dataMap.get(sysKey)) + val); continue; }

      dataMap.set(adj.name, val);
      if (cat === "basic pay related") sumBasicRelated += val;
      else if (cat === "taxable earning") sumTaxableOnly += val;
      else if (cat === "deduction") { if (val < 0) manualDeductionAbs += Math.abs(val); else if (val > 0) manualDeductionAbs -= Math.abs(val); }
      else if (cat === "addition") additionSum += val;
    }

    // Statutory EE/ER (from sysAdj only)
    let sssEeVal = (sysAdj["SSS EE MC"] || 0) + (sysAdj["SSS EE MPF"] || 0);
    let phEeVal = sysAdj["PhilHealth EE"] || 0;
    let piEeVal = sysAdj["Pag-IBIG EE"] || 0;
    let sssErVal = (sysAdj["SSS ER MC"] || 0) + (sysAdj["SSS ER MPF"] || 0);
    let sssEcVal = sysAdj["SSS EC"] || 0;
    let phErVal = sysAdj["PhilHealth ER"] || 0;
    let piErVal = sysAdj["Pag-IBIG ER"] || 0;

    if (isRetired && !isConsultant) { sssEeVal = 0; phEeVal = 0; piEeVal = 0; sssErVal = 0; sssEcVal = 0; phErVal = 0; piErVal = 0; }
    else if (!isFilipino && !isConsultant) { piEeVal = 0; piErVal = 0; }

    dataMap.set("SSS EE MC", r2(sysAdj["SSS EE MC"] || 0));
    dataMap.set("SSS EE MPF", r2(sysAdj["SSS EE MPF"] || 0));
    dataMap.set("PhilHealth EE", r2(phEeVal));
    dataMap.set("Pag-IBIG EE", r2(piEeVal));
    dataMap.set("SSS ER MC", r2(sysAdj["SSS ER MC"] || 0));
    dataMap.set("SSS ER MPF", r2(sysAdj["SSS ER MPF"] || 0));
    dataMap.set("SSS EC", r2(sssEcVal));
    dataMap.set("PhilHealth ER", r2(phErVal));
    dataMap.set("Pag-IBIG ER", r2(piErVal));

    // Legacy SSS totals
    dataMap.set("SSS EE", r2(n(dataMap.get("SSS EE MC")) + n(dataMap.get("SSS EE MPF"))));
    dataMap.set("SSS ER", r2(n(dataMap.get("SSS ER MC")) + n(dataMap.get("SSS ER MPF"))));

    // Taxable income
    let taxableEarnings = sumBasicRelated + sumTaxableOnly;
    let otherBenefitsThisRun = 0;
    for (const h of fullHeader) {
      const v = n(dataMap.get(h));
      if (!v) continue;
      const catI = (nameToCat.get(h) || "").toLowerCase();
      const catM = classifyComponent(h, componentMap).toLowerCase();
      if ((catI || catM) === "13th month pay and other benefits") otherBenefitsThisRun += v;
    }

    let taxableOtherBenefits = 0;
    const priorYtdTotal = Math.abs(ytdOtherBenefitsMap.get(empId) || 0);
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

    // Withholding tax
    if (form.computeTax && !isMwe) {
      if (isConsultant) {
        dataMap.set("Withholding Tax", -r2(taxableIncomeForPeriod * emp.consultantTaxRate));
      } else {
        const taxable13th = n(taxableOtherBenefits);
        const regularTaxable = r2(taxableIncomeForPeriod - taxable13th);
        let useAnnualRate = false, annualRate = 0;
        if (taxable13th) {
          const proj = estimateAnnualProjectedTaxable(empId, regularTaxable, cfg.PAY_FREQUENCY, ytdTaxableIncomeMap) + Math.max(0, taxable13th);
          annualRate = lookupAnnualRateFor13th(proj, birTable);
          if (annualRate > 0) useAnnualRate = true;
        }
        if (!useAnnualRate) {
          applyWithholdingTax(dataMap, { taxableIncomeForPeriod, partLabel: "SPECIAL", cfg, bir: birTable });
        } else {
          applyWithholdingTax(dataMap, { taxableIncomeForPeriod: regularTaxable, partLabel: "SPECIAL", cfg, bir: birTable });
          const taxRegular = Math.abs(n(dataMap.get("Withholding Tax")));
          dataMap.set("Withholding Tax", -r2(taxRegular + r2(Math.abs(taxable13th) * annualRate)));
        }
      }
    } else {
      dataMap.set("Withholding Tax", 0);
    }

    // Gross & Net
    let grossPay = 0;
    for (const h of addlEarningCols) grossPay += n(dataMap.get(h));

    const wtaxSigned = n(dataMap.get("Withholding Tax"));
    const statutoryDed = Math.abs(sssEeVal) + Math.abs(phEeVal) + Math.abs(piEeVal) + (wtaxSigned < 0 ? Math.abs(wtaxSigned) : -Math.abs(wtaxSigned));
    const netPay = r2(grossPay - statutoryDed - manualDeductionAbs + additionSum);

    dataMap.set("Gross Pay", r2(grossPay));
    dataMap.set("Net Pay", netPay);

    const row: PayrollRowOutput = {};
    for (const h of fullHeader) row[h] = dataMap.get(h) ?? "";
    outRows.push(row);

    if (i % 5 === 0 || i + 1 === total) progress(Math.min(98, Math.round(((i + 1) / total) * 100)), `Computing SPECIAL (${i + 1}/${total})...`, "");
  }

  progress(100, "Special payroll complete!", "0s");

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

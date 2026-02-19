/**
 * Core semi-monthly payroll runner — faithful port of _runPayrollCore_.
 *
 * Preserves:
 * - Entity + payroll group filtering
 * - Component mode (split/first/second) with period portion
 * - Prior-taken: statutory uses month-to-date, non-statutory uses same-part
 * - Basic Pay Related / Taxable / Non-Taxable / Deduction / Addition categories
 * - SSS/PhilHealth/Pag-IBIG statutory contributions
 * - Semi A/B withholding tax (A: semi bracket, B: monthly minus A)
 * - 13th month / other benefits YTD 90k exemption + annual marginal rate
 * - Gross / Net Pay calculations with deduction/addition separation
 * - Computed Basic Pay override: per-cutoff, no A/B split, double-split prevention
 * - PhilHealth base rebuild for semi-B: includes basic-related from Part A
 * - Legacy SSS totals (SSS EE = MC + MPF, SSS ER = MC + MPF)
 * - Daily pay basis handling
 * - MWE tax exemption
 */

import { r2, n, normHdr, safeDate, fmtDate, formatPayrollMonth, isSystemComponentName, canonicalSysKey, isDeductionComponent, isSssBaseComponent, isPhilHealthBaseComponent, isUnworkedTime, isSalaryAdjustment, getSignedForPeriod, parsePercentOrNumber } from "./helpers";
import { computeStatutoryForPeriod } from "./statutory-contributions";
import { applyWithholdingTax, lookupAnnualRateFor13th, estimateAnnualProjectedTaxable } from "./tax-calculator";
import { classifyComponent, type ComponentMap, isDeductionCategory, isAdditionCategory } from "./component-map";
import { OTHER_BENEFITS_EXEMPT_YTD } from "@/lib/constants";
import type { EmployeeRow, Adjustment, BirBracket, SssBracket, PayrollConfig, PayrollRowOutput, PayrollRunResult, ProgressCallback } from "./types";

interface CoreRunnerInput {
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
  takenByPtSigned: { A: Map<string, Record<string, number>> };
  ytdOtherBenefitsMap: Map<string, number>;
  ytdTaxableIncomeMap: Map<string, number>;
  attendanceDaysMap: Map<string, number>;
  onProgress?: ProgressCallback;
}

export function runPayrollCore(input: CoreRunnerInput): PayrollRunResult {
  const { employees, adjustments, birTable, sssTable, componentMap, cfg, form, takenMap, takenByPt, takenByPtSigned, ytdOtherBenefitsMap, ytdTaxableIncomeMap, attendanceDaysMap, onProgress } = input;

  const rangeStart = new Date(form.startDate);
  const rangeEnd = new Date(form.endDate);
  const partLabel = String(form.payrollCode || "A").trim().toUpperCase();

  const crossesMonth = rangeStart.getFullYear() !== rangeEnd.getFullYear() || rangeStart.getMonth() !== rangeEnd.getMonth();
  const anchorDate = partLabel === "B" && crossesMonth ? rangeStart : rangeEnd;

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth() + 1;
  const periodKey = `${year}-${String(month).padStart(2, "0")}`;
  const periodLabel = `${periodKey}-${partLabel}`;
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

  // Statutory components use month-to-date prior; non-statutory use same-part
  const STATUTORY_NAMES = new Set(["SSS EE MC", "SSS EE MPF", "SSS EE", "PHILHEALTH EE", "PAG-IBIG EE", "SSS ER MC", "SSS ER MPF", "SSS ER", "SSS EC", "PHILHEALTH ER", "PAG-IBIG ER", "WITHHOLDING TAX"]);

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
    const hasComputedBasic = emp.computedBasicPay > 0;

    // Prior-taken: statutory → month-to-date; non-statutory → same-part
    const priorForStatutory = (k: string) => n(takenMap.get(emp.employeeId)?.[k]);
    const priorForNonStat = (k: string) => {
      const ptMap = partLabel === "A" ? takenByPt.A : takenByPt.B;
      const ptVal = ptMap?.get(emp.employeeId)?.[k];
      return ptVal !== undefined ? n(ptVal) : n(takenMap.get(emp.employeeId)?.[k]);
    };
    const priorFor = (k: string) => {
      if (STATUTORY_NAMES.has(normHdr(k))) return priorForStatutory(k);
      return priorForNonStat(k);
    };

    const dataMap = new Map<string, number | string>();

    // Basic pay handling
    const rawBasic = emp.basicPay;
    const overrideBasic = emp.computedBasicPay;
    const daysWorked = isDailyPayBasis ? (attendanceDaysMap.get(emp.employeeId) || 0) : 0;
    const priorBasicSamePart = n(priorForNonStat("BASIC PAY"));

    let basicForRun: number;
    let baseMonthlySalary: number;

    if (hasComputedBasic) {
      // Computed Basic Pay override: treated as per-cutoff, no A/B split
      basicForRun = r2(overrideBasic - priorBasicSamePart);
      baseMonthlySalary = overrideBasic;
    } else if (isDailyPayBasis) {
      basicForRun = r2(r2(rawBasic * daysWorked) - priorBasicSamePart);
      const priorBasicMTD = n(takenMap.get(emp.employeeId)?.["BASIC PAY"]);
      baseMonthlySalary = r2(priorBasicMTD + basicForRun);
    } else {
      baseMonthlySalary = rawBasic;
      basicForRun = 0; // will be set via periodPortion below
    }

    const getModeFor = (componentName: string): string => {
      const override = cfg.employeeOverrides.get(`${emp.employeeId}-${componentName}`);
      if (override) return override;
      return cfg.componentModes.get(componentName) || "split";
    };

    // Pull masterfile dynamic components
    for (const header of fullHeader) {
      const up = normHdr(header);
      if (["EMPLOYEE ID", "EMPLOYEE NAME", "TRACKING CATEGORY 1", "PAYROLL GROUP", "TRACKING CATEGORY 2"].includes(up)) continue;

      if (up === "BASIC PAY") {
        if (isDailyPayBasis || hasComputedBasic) {
          dataMap.set(header, r2(basicForRun));
        } else {
          const mode = getModeFor(header);
          const prior = priorFor(header);
          dataMap.set(header, getSignedForPeriod(baseMonthlySalary, mode, partLabel, true, false, prior));
        }
        continue;
      }

      const fieldVal = emp.dynamicFields[header];
      if (fieldVal !== undefined && typeof fieldVal === "number") {
        const mode = getModeFor(header);
        const prior = priorFor(header);
        dataMap.set(header, getSignedForPeriod(fieldVal, mode, partLabel, true, false, prior));
      }
    }

    // Apply adjustments
    const myAdj = adjustments.filter((a) => a.empId === emp.employeeId);
    let basicRelatedSum = 0, basicRelatedSumPH = 0, taxableOnlySum = 0, nonTaxableSum = 0, deductionSum = 0, additionSum = 0;

    const sysAdj: Record<string, number> = { "SSS EE MC": 0, "SSS EE MPF": 0, "PhilHealth EE": 0, "Pag-IBIG EE": 0, "SSS ER MC": 0, "SSS ER MPF": 0, "SSS EC": 0, "PhilHealth ER": 0, "Pag-IBIG ER": 0, "Withholding Tax": 0 };

    for (const adj of myAdj) {
      const prior = priorFor(adj.name);
      const valueForRun = r2((adj.amt || 0) - prior);
      const cat = (adj.cat || "").toLowerCase();

      const sysKey = canonicalSysKey(adj.name);
      if (sysKey && sysKey in sysAdj) {
        sysAdj[sysKey] += valueForRun;
        dataMap.set(sysKey, n(dataMap.get(sysKey)) + valueForRun);
        continue;
      }

      dataMap.set(adj.name, valueForRun);

      if (isSssBaseComponent(adj.name, cat)) basicRelatedSum += valueForRun;
      if (isPhilHealthBaseComponent(adj.name, cat)) basicRelatedSumPH += valueForRun;
      else if (cat === "taxable earning") taxableOnlySum += valueForRun;
      else if (cat.startsWith("non-taxable earning")) nonTaxableSum += valueForRun;
      else if (cat === "addition") additionSum += valueForRun;
      else if (cat === "deduction") deductionSum += valueForRun;
    }

    // Statutory contributions
    let baseForSSS_PI = baseMonthlySalary + basicRelatedSum;
    let baseForPH = baseMonthlySalary + basicRelatedSumPH;

    // PhilHealth base rebuild for semi-B: includes basic-related from Part A
    if (partLabel === "B" && !isDailyPayBasis) {
      const mapA = takenByPtSigned?.A;
      if (mapA) {
        const priorA_stat = mapA.get(emp.employeeId) || {};
        const basicA = n(priorA_stat["BASIC PAY"] ?? priorA_stat["Basic Pay"] ?? 0);
        const basicB = n(dataMap.get("BASIC PAY"));

        // Rebuild monthly base: A signed + B signed + basic-related adjustments
        baseForSSS_PI = r2(basicA + basicB + basicRelatedSum * 2);
        // PhilHealth base includes all basic-related components from both parts
        let phBaseA = basicA;
        for (const [key, val] of Object.entries(priorA_stat)) {
          if (isPhilHealthBaseComponent(key, classifyComponent(key, componentMap).toLowerCase())) {
            phBaseA += n(val);
          }
        }
        baseForPH = r2(phBaseA + basicB + basicRelatedSumPH);
      }
    }

    // Double-split prevention: if computed basic override, ensure PhilHealth base is monthly
    if (hasComputedBasic && !isDailyPayBasis) {
      const phMode = getModeFor("PhilHealth EE");
      if (phMode === "split" && partLabel === "A") {
        baseForPH = baseMonthlySalary + basicRelatedSumPH;
      }
    }

    const priorTakenForStatutory = takenMap.get(emp.employeeId) || {};
    const stat = form.computeContrib && !isConsultant && !isRetired
      ? computeStatutoryForPeriod({ baseMonthlySSSPI: baseForSSS_PI, baseMonthlyPH: baseForPH, getModeFor, sssTable, isFullPeriod: true, priorTaken: priorTakenForStatutory, partLabel, empId: emp.employeeId, periodLabel, cfg, isDailyPayBasis })
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

    // Taxable income
    let taxableEarnings = basicRelatedSum + taxableOnlySum;
    for (const [key, val] of Object.entries(emp.dynamicFields)) {
      const cat = classifyComponent(key, componentMap);
      const v = n(dataMap.get(key));
      if (cat === "Basic Pay Related" || cat === "Taxable Earning") taxableEarnings += v;
    }

    // 13th month / other benefits YTD 90k exemption
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
      const taxableAbs = Math.max(0, runAbs - remainingExempt);
      const sign = otherBenefitsThisRun >= 0 ? 1 : -1;
      taxableOtherBenefits = sign * taxableAbs;
    }
    taxableEarnings += taxableOtherBenefits;

    const sssEeActual = Math.abs(n(dataMap.get("SSS EE MC"))) + Math.abs(n(dataMap.get("SSS EE MPF")));
    const phEeActual = Math.abs(n(dataMap.get("PhilHealth EE")));
    const piEeActual = Math.abs(n(dataMap.get("Pag-IBIG EE")));
    const taxableIncomeForPeriod = Math.max(0, taxableEarnings - sssEeActual - phEeActual - piEeActual);
    dataMap.set("Taxable Income", r2(taxableIncomeForPeriod));

    // Withholding tax
    const priorA = takenByPt.A.get(emp.employeeId) || {};
    const priorMTD = takenMap.get(emp.employeeId) || {};

    if (form.computeTax && !isMwe) {
      if (isConsultant) {
        dataMap.set("Withholding Tax", -r2(Math.max(0, taxableIncomeForPeriod * emp.consultantTaxRate)));
      } else {
        const taxable13th = n(taxableOtherBenefits);
        const regularTaxable = r2(taxableIncomeForPeriod - taxable13th);

        let useAnnualRate = false;
        let annualRate = 0;

        if (taxable13th) {
          const annualProjected = estimateAnnualProjectedTaxable(emp.employeeId, regularTaxable, cfg.PAY_FREQUENCY, ytdTaxableIncomeMap) + Math.max(0, taxable13th);
          annualRate = lookupAnnualRateFor13th(annualProjected, birTable);
          if (annualRate > 0) useAnnualRate = true;
        }

        if (!useAnnualRate) {
          applyWithholdingTax(dataMap, { taxableIncomeForPeriod, partLabel, cfg, bir: birTable, priorA, priorMTD });
        } else {
          applyWithholdingTax(dataMap, { taxableIncomeForPeriod: regularTaxable, partLabel, cfg, bir: birTable, priorA, priorMTD });
          const taxRegular = Math.abs(n(dataMap.get("Withholding Tax")));
          const tax13th = r2(Math.abs(taxable13th) * annualRate);
          dataMap.set("Withholding Tax", -(r2(taxRegular + tax13th)));
        }
      }
    } else {
      dataMap.set("Withholding Tax", 0);
    }

    const wtaxAdj = sysAdj["Withholding Tax"] || 0;
    if (wtaxAdj) dataMap.set("Withholding Tax", r2(n(dataMap.get("Withholding Tax")) + wtaxAdj));

    // Gross & Net Pay
    let grossPay = 0;
    let totalDeductions = 0;

    for (const h of fullHeader) {
      const up = normHdr(h);
      const v = n(dataMap.get(h));
      if (nonEarningCols.has(up)) continue;

      const catI = (nameToCat.get(h) || "").toLowerCase();
      const catM = classifyComponent(h, componentMap).toLowerCase();
      const cat = catI || catM;

      if (isDeductionCategory(cat) || (!cat && !isAdditionCategory(cat) && isDeductionComponent(h))) {
        if (v < 0) totalDeductions += Math.abs(v);
        else if (v > 0) totalDeductions -= Math.abs(v);
        continue;
      }
      if (isAdditionCategory(cat)) continue;

      if (cat === "taxable earning" || cat.startsWith("non-taxable earning")) {
        grossPay += v;
      } else {
        if (v > 0) grossPay += v;
        if (v < 0 && (isUnworkedTime(h) || isSalaryAdjustment(h))) grossPay += v;
      }
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
    const phEE = n(dataMap.get("PhilHealth EE"));
    const piEE = n(dataMap.get("Pag-IBIG EE"));
    const wtaxSigned = n(dataMap.get("Withholding Tax"));
    const statutoryDeductions = Math.abs(sssEE) + Math.abs(phEE) + Math.abs(piEE) + (wtaxSigned < 0 ? Math.abs(wtaxSigned) : -Math.abs(wtaxSigned));
    const totalAllDeductions = statutoryDeductions + totalDeductions;
    const netPay = r2(grossPay - totalAllDeductions + netOnlyAdditions);

    dataMap.set("Gross Pay", r2(grossPay));
    dataMap.set("Net Pay", netPay);

    // Metadata
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

    if (i % 5 === 0 || i + 1 === total) {
      const pct = Math.min(98, Math.round(((i + 1) / total) * 100));
      progress(pct, `Phase 2/4: Computing employees (${i + 1}/${total})...`, "");
    }
  }

  const totalGrossPay = outRows.reduce((s, r) => s + n(r["Gross Pay"]), 0);
  const totalNetPay = outRows.reduce((s, r) => s + n(r["Net Pay"]), 0);

  progress(100, "Payroll complete", "0s");

  return {
    headers: fullHeader,
    rows: outRows,
    periodLabel,
    payrollMonth,
    totalEmployees: outRows.length,
    totalGrossPay: r2(totalGrossPay),
    totalNetPay: r2(totalNetPay),
  };
}

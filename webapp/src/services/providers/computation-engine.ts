/**
 * ComputationEngine — orchestrator that ties repositories to payroll runners.
 * Entry point for the worker to execute a payroll run end-to-end.
 */

import { prisma } from "@/lib/db";
import { runPayrollCore } from "../payroll-engine/core-runner";
import { runPayrollMonthly } from "../payroll-engine/monthly-runner";
import { runPayrollSpecial } from "../payroll-engine/special-runner";
import { buildComponentMapFromTypes } from "../payroll-engine/component-map";
import { loadEmployees, loadAdjustments, loadPayrollHistory } from "./masterfile-repository";
import { loadGlobalBirTable, loadGlobalSssTable, resolveStatutoryVersion } from "../statutory/version-resolver";
import { applyRecurringAdjustmentsForCutoff } from "../adjustments/apply-recurring";
import type { PayrollRunResult, ProgressCallback, PayrollConfig } from "../payroll-engine/types";

export async function executePayrollRun(
  payrollRunId: string,
  tenantId: string,
  onProgress?: ProgressCallback
): Promise<PayrollRunResult> {
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: payrollRunId } });
  const profile = await prisma.companyProfile.findUnique({ where: { tenantId } });
  const adjTypes = await prisma.adjustmentType.findMany({ where: { tenantId } });

  const componentMap = buildComponentMapFromTypes(adjTypes);

  const cfg: PayrollConfig = {
    SOURCE_SS_ID: "",
    INPUTS_SS_ID: "",
    MASTER_SHEET_NAME: "employees",
    WORKING_DAYS_PER_YEAR: profile?.workingDaysPerYear || 261,
    PAY_FREQUENCY: profile?.payFrequency || "Semi-Monthly",
    PH_RATE: profile?.philhealthRate || 0.05,
    PH_MIN_BASE: profile?.philhealthMinBase || 10000,
    PH_MAX_BASE: profile?.philhealthMaxBase || 100000,
    PAGIBIG_EE_RATE: profile?.pagibigEeRate || 0.02,
    PAGIBIG_ER_RATE: profile?.pagibigErRate || 0.02,
    PAGIBIG_MAX_BASE: profile?.pagibigMaxBase || 10000,
    COMPANY_TIN: profile?.tin || "",
    componentModes: new Map(),
    employeeOverrides: new Map(),
  };

  const employees = await loadEmployees(tenantId, run.payrollGroups);
  const adjPeriodKey = /^[AB]$/i.test(String(run.payrollCode || "").trim())
    ? `${run.periodKey} ${String(run.payrollCode).trim().toUpperCase()}`
    : run.periodKey;

  if (adjPeriodKey.includes(" ") && /^[AB]$/i.test(String(run.payrollCode || "").trim())) {
    await applyRecurringAdjustmentsForCutoff({
      tenantId,
      periodKey: adjPeriodKey,
      payrollCode: String(run.payrollCode).trim().toUpperCase(),
      asOf: run.endDate,
    });
  }

  const adjustments = await loadAdjustments(tenantId, adjPeriodKey);
  const codeToDbId = new Map(employees.map((e) => [e.employeeCode, e.employeeId]));

  const resolved =
    run.statutoryVersionId
      ? { id: run.statutoryVersionId }
      : await resolveStatutoryVersion(run.endDate);

  if (!resolved?.id) {
    throw new Error(
      "No PUBLISHED global statutory version covers this payroll date. Configure and publish a statutory version first."
    );
  }

  if (!run.statutoryVersionId) {
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { statutoryVersionId: resolved.id },
    });
  }

  const birTable = await loadGlobalBirTable(resolved.id);
  const sssTable = await loadGlobalSssTable(resolved.id);

  const takenMap = await loadPayrollHistory(tenantId, run.periodKey);

  const emptyPartMap = { A: new Map<string, Record<string, number>>(), B: new Map<string, Record<string, number>>() };

  const form = {
    payrollCode: run.payrollCode,
    startDate: run.startDate.toISOString(),
    endDate: run.endDate.toISOString(),
    entity: run.entity,
    payrollGroups: run.payrollGroups,
    creditingDate: run.creditingDate?.toISOString(),
    computeTax: run.computeTax,
    computeContrib: run.computeContrib,
  };

  const ytdOtherBenefitsMap = new Map<string, number>();
  const ytdTaxableIncomeMap = new Map<string, number>();
  const attendanceDaysMap = new Map<string, number>();

  let result: PayrollRunResult;

  const freq = run.payrollFrequency.toUpperCase();
  if (freq.includes("SPECIAL") || run.payrollCode.startsWith("S-")) {
    result = runPayrollSpecial({
      employees, adjustments: adjustments as never, birTable, componentMap, cfg, form: { ...form, computeTax: run.computeTax },
      takenMap, ytdOtherBenefitsMap, ytdTaxableIncomeMap, onProgress,
    });
  } else if (freq.includes("MONTH") && !freq.includes("SEMI")) {
    result = runPayrollMonthly({
      employees, adjustments: adjustments as never, birTable, sssTable, componentMap, cfg, form,
      takenMap, takenByPt: emptyPartMap, ytdOtherBenefitsMap, ytdTaxableIncomeMap, attendanceDaysMap, onProgress,
    });
  } else {
    result = runPayrollCore({
      employees, adjustments: adjustments as never, birTable, sssTable, componentMap, cfg, form,
      takenMap, takenByPt: emptyPartMap, takenByPtSigned: { A: new Map() }, ytdOtherBenefitsMap, ytdTaxableIncomeMap, attendanceDaysMap, onProgress,
    });
  }

  // Persist results
  await prisma.$transaction([
    prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        status: "COMPUTED",
        totalEmployees: result.totalEmployees,
        totalGrossPay: result.totalGrossPay,
        totalNetPay: result.totalNetPay,
      },
    }),
    ...result.rows.map((row) =>
      prisma.payrollRow.create({
        data: {
          payrollRunId,
          employeeId: (() => {
            const code = String(row["Employee ID"] || "").trim();
            const id = codeToDbId.get(code);
            if (!id) throw new Error(`Unknown employee code "${code}" in computed rows`);
            return id;
          })(),
          employeeName: String(row["Employee Name"]),
          periodLabel: result.periodLabel,
          basicPay: Number(row["BASIC PAY"]) || 0,
          grossPay: Number(row["Gross Pay"]) || 0,
          taxableIncome: Number(row["Taxable Income"]) || 0,
          withholdingTax: Number(row["Withholding Tax"]) || 0,
          sssEeMc: Math.abs(Number(row["SSS EE MC"]) || 0),
          sssEeMpf: Math.abs(Number(row["SSS EE MPF"]) || 0),
          sssErMc: Number(row["SSS ER MC"]) || 0,
          sssErMpf: Number(row["SSS ER MPF"]) || 0,
          sssEc: Number(row["SSS EC"]) || 0,
          philhealthEe: Math.abs(Number(row["PhilHealth EE"]) || 0),
          philhealthEr: Number(row["PhilHealth ER"]) || 0,
          pagibigEe: Math.abs(Number(row["Pag-IBIG EE"]) || 0),
          pagibigEr: Number(row["Pag-IBIG ER"]) || 0,
          netPay: Number(row["Net Pay"]) || 0,
          componentValues: row,
        },
      })
    ),
  ]);

  return result;
}

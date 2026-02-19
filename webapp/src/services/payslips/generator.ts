/**
 * Payslip generator — faithful port of PayslipGenerator.txt.
 *
 * Preserves:
 * - Template-based generation with {{TAGS}} replacement
 * - Net Pay validation (payslip vs payroll sheet comparison)
 * - Employee ID normalization (spaces, dashes, zero-width chars)
 * - Adjustment loading from Inputs with snapshot support
 * - Tag collection from template
 * - Component classification for earnings/deductions/contributions
 * - Masterfile integration for employee details
 */

import { r2, n, normHdr, isDeductionComponent, fmt2 } from "../payroll-engine/helpers";
import { classifyComponent, type ComponentMap, isDeductionCategory, isAdditionCategory } from "../payroll-engine/component-map";
import type { PayrollRowOutput } from "../payroll-engine/types";
import type { PayslipData, PayslipLine, PayslipAdjustmentLine, PayslipCheckResult } from "./types";

interface PayslipInput {
  row: PayrollRowOutput;
  headers: string[];
  componentMap: ComponentMap;
  employeeDetails: {
    position: string;
    department: string;
    bankName: string;
    bankAccountNumber: string;
  };
  adjustmentInputs?: Array<{ name: string; category: string; amount: number }>;
}

const SKIP_HEADERS = new Set([
  "EMPLOYEE ID", "EMPLOYEE NAME", "TRACKING CATEGORY 1", "PAYROLL GROUP",
  "TRACKING CATEGORY 2", "PERIOD", "FROM", "TO", "CREDITING DATE",
  "PAYROLL MONTH", "GROSS PAY", "NET PAY", "TAXABLE INCOME",
]);

const CONTRIBUTION_HEADERS = new Set([
  "SSS EE MC", "SSS EE MPF", "SSS EE", "PHILHEALTH EE", "PAG-IBIG EE", "WITHHOLDING TAX",
]);

/**
 * Normalize Employee ID for matching: removes zero-width chars, normalizes
 * whitespace, trims dashes.
 */
function normalizeEmployeeId(id: string): string {
  return String(id || "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[-–—]+/g, "-")
    .trim()
    .toUpperCase();
}

export function buildPayslipData(input: PayslipInput): PayslipData {
  const { row, headers, componentMap, employeeDetails, adjustmentInputs } = input;

  const earnings: PayslipLine[] = [];
  const deductions: PayslipLine[] = [];
  const contributions: PayslipLine[] = [];
  const adjustmentDetails: PayslipAdjustmentLine[] = [];

  for (const h of headers) {
    const up = normHdr(h);
    if (SKIP_HEADERS.has(up)) continue;
    if (up.startsWith("SSS ER") || up === "SSS EC" || up === "PHILHEALTH ER" || up === "PAG-IBIG ER") continue;
    if (up === "SSS ER") continue;

    const v = n(row[h]);
    if (v === 0) continue;

    if (CONTRIBUTION_HEADERS.has(up)) {
      contributions.push({ label: h, amount: Math.abs(v) });
      continue;
    }

    const cat = classifyComponent(h, componentMap).toLowerCase();

    if (isDeductionCategory(cat) || isDeductionComponent(h)) {
      deductions.push({ label: h, amount: Math.abs(v) });
    } else if (isAdditionCategory(cat)) {
      earnings.push({ label: h, amount: v });
    } else {
      if (v > 0) earnings.push({ label: h, amount: v });
      else deductions.push({ label: h, amount: Math.abs(v) });
    }
  }

  if (adjustmentInputs) {
    for (const adj of adjustmentInputs) {
      adjustmentDetails.push({
        name: adj.name,
        category: adj.category,
        amount: adj.amount,
      });
    }
  }

  // Build tag map for template-based rendering
  const tags: Record<string, string> = {};
  tags["EMPLOYEE_ID"] = String(row["Employee ID"] || "");
  tags["EMPLOYEE_NAME"] = String(row["Employee Name"] || "");
  tags["PERIOD"] = String(row["Period"] || "");
  tags["PAYROLL_MONTH"] = String(row["Payroll Month"] || "");
  tags["FROM"] = String(row["From"] || "");
  tags["TO"] = String(row["To"] || "");
  tags["CREDITING_DATE"] = String(row["Crediting Date"] || "");
  tags["GROSS_PAY"] = fmt2(n(row["Gross Pay"]));
  tags["NET_PAY"] = fmt2(n(row["Net Pay"]));
  tags["TAXABLE_INCOME"] = fmt2(n(row["Taxable Income"]));
  tags["POSITION"] = employeeDetails.position;
  tags["DEPARTMENT"] = employeeDetails.department;
  tags["BANK_NAME"] = employeeDetails.bankName;
  tags["BANK_ACCOUNT"] = employeeDetails.bankAccountNumber;
  tags["TRACKING_CATEGORY_1"] = String(row["Tracking Category 1"] || "");
  tags["TRACKING_CATEGORY_2"] = String(row["Tracking Category 2"] || "");
  tags["PAYROLL_GROUP"] = String(row["Payroll Group"] || "");

  // Add all numeric columns as tags
  for (const h of headers) {
    const v = row[h];
    if (typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v !== "")) {
      const tagKey = h.replace(/\s+/g, "_").toUpperCase();
      tags[tagKey] = fmt2(n(v));
    }
  }

  return {
    empId: String(row["Employee ID"] || ""),
    empName: String(row["Employee Name"] || ""),
    position: employeeDetails.position,
    department: employeeDetails.department,
    periodLabel: String(row["Period"] || ""),
    payrollMonth: String(row["Payroll Month"] || ""),
    fromDate: String(row["From"] || ""),
    toDate: String(row["To"] || ""),
    creditingDate: String(row["Crediting Date"] || ""),
    earnings,
    deductions,
    contributions,
    grossPay: n(row["Gross Pay"]),
    totalDeductions: deductions.reduce((s, l) => s + l.amount, 0),
    totalContributions: contributions.reduce((s, l) => s + l.amount, 0),
    netPay: n(row["Net Pay"]),
    bankName: employeeDetails.bankName,
    bankAccountNumber: employeeDetails.bankAccountNumber,
    tags,
    adjustmentDetails,
  };
}

/**
 * Render a template string by replacing {{TAG}} placeholders.
 * Case-insensitive matching.
 */
export function renderPayslipTemplate(template: string, tags: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const upper = key.trim().toUpperCase().replace(/\s+/g, "_");
    for (const [tKey, tVal] of Object.entries(tags)) {
      if (tKey.toUpperCase().replace(/\s+/g, "_") === upper) return tVal;
    }
    return "";
  });
}

/**
 * Collect all {{TAG}} placeholders from a template string.
 */
export function collectTemplateTags(template: string): string[] {
  const tags = new Set<string>();
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    tags.add(match[1].trim().toUpperCase());
  }
  return Array.from(tags);
}

/**
 * Validate payslip Net Pay against expected from payroll computation.
 */
export function checkPayslipNetPay(
  payslipData: PayslipData[],
  payrollRows: PayrollRowOutput[]
): PayslipCheckResult[] {
  const payrollByEmp = new Map<string, number>();
  for (const row of payrollRows) {
    const id = normalizeEmployeeId(String(row["Employee ID"] || ""));
    payrollByEmp.set(id, n(row["Net Pay"]));
  }

  const results: PayslipCheckResult[] = [];
  for (const slip of payslipData) {
    const id = normalizeEmployeeId(slip.empId);
    const expected = payrollByEmp.get(id) ?? 0;
    const diff = r2(Math.abs(slip.netPay - expected));
    results.push({
      empId: slip.empId,
      empName: slip.empName,
      expectedNetPay: expected,
      payslipNetPay: slip.netPay,
      difference: diff,
      matched: diff < 0.01,
    });
  }

  return results;
}

/**
 * Build a filename from a pattern template.
 * Default pattern: "{{Employee Name}} - Payslip - {{Period}}"
 */
export function buildPayslipFilename(pattern: string, tags: Record<string, string>): string {
  let name = renderPayslipTemplate(pattern, tags);
  name = name.replace(/[<>:"/\\|?*]/g, "_").trim();
  if (!name) name = `Payslip_${tags["EMPLOYEE_ID"] || "unknown"}`;
  return name;
}

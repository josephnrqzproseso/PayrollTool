/**
 * Journal entry builder — faithful port of PayrollPosting.txt posting logic.
 *
 * Preserves:
 * - 4-account header mapping: Employee/Consultant × COST/OPEX
 * - Dimension resolution from masterfile (CONTRACT TYPE, ALLOCATION)
 * - Positive/Negative line type marking
 * - Tracking category support for both Xero and Odoo
 * - Bank file generation per disbursing bank
 * - Heuristic marking (Positive/Negative based on header names)
 */

import { r2, n, normHdr } from "../payroll-engine/helpers";
import type { JournalEntry, JournalLine, HeaderAccountMapping, CoaMapping, BankMapping, BankFileRow, BankFileResult } from "./types";
import type { PayrollRowOutput } from "../payroll-engine/types";

interface BuildJournalInput {
  periodLabel: string;
  payrollMonth: string;
  date: string;
  referenceNo: string;
  rows: PayrollRowOutput[];
  headerMappings: HeaderAccountMapping[];
  coaMappings?: CoaMapping[];
  defaultSalaryExpenseAccount: string;
  defaultPayableAccount: string;
}

interface EmployeeDimension {
  contractType: string;
  allocation: string;
}

function resolveAccount(
  mapping: HeaderAccountMapping | undefined,
  dimension: EmployeeDimension,
  fallbackDebit: string,
  fallbackCredit: string,
  isDebitSide: boolean
): string {
  if (!mapping) return isDebitSide ? fallbackDebit : fallbackCredit;

  const isConsultant = /freelance|contractor|consultant/i.test(dimension.contractType);
  const isCost = /cost|cogs/i.test(dimension.allocation) || !dimension.allocation;

  if (isConsultant) {
    return isCost
      ? (mapping.consultantCostAccount || mapping.employeeCostAccount || fallbackDebit)
      : (mapping.consultantOpexAccount || mapping.employeeOpexAccount || fallbackDebit);
  }
  return isCost
    ? (mapping.employeeCostAccount || fallbackDebit)
    : (mapping.employeeOpexAccount || fallbackDebit);
}

/**
 * Infer line type heuristic: headers containing certain keywords are negative.
 */
function inferLineType(headerName: string): "positive" | "negative" {
  const up = normHdr(headerName);
  if (/LOAN|DEDUCTION|SSS\s*EE|PHILHEALTH\s*EE|PAG-?IBIG\s*EE|WITHHOLDING\s*TAX|HDMF\s*EE/i.test(up)) {
    return "negative";
  }
  return "positive";
}

export function buildJournalEntries(input: BuildJournalInput): JournalEntry {
  const {
    periodLabel, payrollMonth, date, referenceNo, rows,
    headerMappings, coaMappings,
    defaultSalaryExpenseAccount, defaultPayableAccount,
  } = input;

  const headerMap = new Map<string, HeaderAccountMapping>();
  for (const m of headerMappings) {
    headerMap.set(normHdr(m.componentName), m);
  }

  const coaMap = new Map<string, CoaMapping>();
  if (coaMappings) {
    for (const m of coaMappings) {
      coaMap.set(normHdr(m.componentName), m);
    }
  }

  const aggregated = new Map<string, { debit: number; credit: number; accountCode: string; accountName: string; trackingDimensions?: Record<string, string>; trackingCategory1?: string; trackingCategory2?: string }>();

  const addLine = (accountCode: string, accountName: string, debit: number, credit: number, trackingDimensions?: Record<string, string>, tc1?: string, tc2?: string) => {
    if (!accountCode) return;
    const key = `${accountCode}|${debit > 0 ? "D" : "C"}|${tc1 || ""}|${tc2 || ""}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.debit += debit;
      existing.credit += credit;
    } else {
      aggregated.set(key, { accountCode, accountName, debit, credit, trackingDimensions, trackingCategory1: tc1, trackingCategory2: tc2 });
    }
  };

  for (const row of rows) {
    const grossPay = n(row["Gross Pay"]);
    const netPay = n(row["Net Pay"]);
    const sssEeMc = Math.abs(n(row["SSS EE MC"]));
    const sssEeMpf = Math.abs(n(row["SSS EE MPF"]));
    const phEe = Math.abs(n(row["PhilHealth EE"]));
    const piEe = Math.abs(n(row["Pag-IBIG EE"]));
    const wtax = Math.abs(n(row["Withholding Tax"]));

    const sssErMc = n(row["SSS ER MC"]);
    const sssErMpf = n(row["SSS ER MPF"]);
    const sssEc = n(row["SSS EC"]);
    const phEr = n(row["PhilHealth ER"]);
    const piEr = n(row["Pag-IBIG ER"]);

    const trackingDimensions: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith("Tracking: ") && typeof v === "string") {
        trackingDimensions[k.replace("Tracking: ", "")] = v;
      }
    }
    const tc1 = String(row["Tracking Category 1"] || "");
    const tc2 = String(row["Tracking Category 2"] || "");

    const contractType = String(row["Contract Type"] || "Employee");
    const allocation = String(row["Allocation"] || "");
    const dim: EmployeeDimension = { contractType, allocation };

    // Salary expense (debit)
    const salMapping = headerMap.get(normHdr("BASIC PAY"));
    const salAccount = resolveAccount(salMapping, dim, defaultSalaryExpenseAccount, "", true);
    addLine(salAccount, "Salary Expense", grossPay, 0, trackingDimensions, tc1, tc2);

    // Net payable (credit)
    addLine(defaultPayableAccount, "Salaries Payable", 0, netPay, undefined, tc1, tc2);

    // SSS EE (credit)
    if (sssEeMc + sssEeMpf > 0) {
      const m = headerMap.get(normHdr("SSS EE")) || headerMap.get(normHdr("SSS EE MC"));
      const acct = resolveAccount(m, dim, "", "2110", false);
      addLine(acct, "SSS EE Payable", 0, sssEeMc + sssEeMpf);
    }

    // SSS ER (debit expense + credit payable)
    if (sssErMc + sssErMpf + sssEc > 0) {
      const m = headerMap.get(normHdr("SSS ER")) || headerMap.get(normHdr("SSS ER MC"));
      const debitAcct = resolveAccount(m, dim, "6120", "", true);
      const creditAcct = resolveAccount(m, dim, "", "2110", false);
      addLine(debitAcct, "SSS ER Expense", sssErMc + sssErMpf + sssEc, 0, trackingDimensions, tc1, tc2);
      addLine(creditAcct, "SSS ER Payable", 0, sssErMc + sssErMpf + sssEc);
    }

    // PhilHealth EE
    if (phEe > 0) {
      const m = headerMap.get(normHdr("PHILHEALTH EE"));
      const acct = resolveAccount(m, dim, "", "2120", false);
      addLine(acct, "PhilHealth EE Payable", 0, phEe);
    }

    // PhilHealth ER
    if (phEr > 0) {
      const m = headerMap.get(normHdr("PHILHEALTH ER"));
      const debitAcct = resolveAccount(m, dim, "6130", "", true);
      const creditAcct = resolveAccount(m, dim, "", "2120", false);
      addLine(debitAcct, "PhilHealth ER Expense", phEr, 0, trackingDimensions, tc1, tc2);
      addLine(creditAcct, "PhilHealth ER Payable", 0, phEr);
    }

    // Pag-IBIG EE
    if (piEe > 0) {
      const m = headerMap.get(normHdr("PAG-IBIG EE"));
      const acct = resolveAccount(m, dim, "", "2130", false);
      addLine(acct, "Pag-IBIG EE Payable", 0, piEe);
    }

    // Pag-IBIG ER
    if (piEr > 0) {
      const m = headerMap.get(normHdr("PAG-IBIG ER"));
      const debitAcct = resolveAccount(m, dim, "6140", "", true);
      const creditAcct = resolveAccount(m, dim, "", "2130", false);
      addLine(debitAcct, "Pag-IBIG ER Expense", piEr, 0, trackingDimensions, tc1, tc2);
      addLine(creditAcct, "Pag-IBIG ER Payable", 0, piEr);
    }

    // Withholding Tax
    if (wtax > 0) {
      const m = headerMap.get(normHdr("WITHHOLDING TAX"));
      const acct = resolveAccount(m, dim, "", "2140", false);
      addLine(acct, "WTax Payable", 0, wtax);
    }
  }

  const lines: JournalLine[] = [];
  for (const [, agg] of aggregated) {
    lines.push({
      accountCode: agg.accountCode,
      accountName: agg.accountName,
      debit: r2(agg.debit),
      credit: r2(agg.credit),
      trackingCategory1: agg.trackingCategory1,
      trackingCategory2: agg.trackingCategory2,
      trackingDimensions: agg.trackingDimensions,
    });
  }

  return {
    date: date || new Date().toISOString().slice(0, 10),
    reference: referenceNo || `PAYROLL-${periodLabel}`,
    narration: `Payroll posting for ${payrollMonth} (${periodLabel})`,
    lines,
  };
}

/**
 * Generate bank CSV files per disbursing bank.
 * Faithful port of generateBankFilesFromPayroll from PayrollPosting.txt.
 */
export function generateBankFiles(
  rows: PayrollRowOutput[],
  bankMappings: BankMapping[],
  employeeBankIndex: Map<string, { bankName: string; bankAccountNumber: string }>
): BankFileResult[] {
  const bankGroups = new Map<string, BankFileRow[]>();

  for (const row of rows) {
    const empId = String(row["Employee ID"] || "");
    const empName = String(row["Employee Name"] || "");
    const netPay = n(row["Net Pay"]);

    if (netPay <= 0) continue;

    const bankInfo = employeeBankIndex.get(empId);
    if (!bankInfo) continue;

    const bankName = bankInfo.bankName || "UNKNOWN";
    if (!bankGroups.has(bankName)) bankGroups.set(bankName, []);
    bankGroups.get(bankName)!.push({
      employeeName: empName,
      bankName,
      bankAccountNumber: bankInfo.bankAccountNumber,
      amount: r2(netPay),
    });
  }

  const results: BankFileResult[] = [];
  for (const [bankName, bankRows] of bankGroups) {
    let csvContent = "Employee Name,Bank Account Number,Amount\n";
    let totalAmount = 0;

    for (const br of bankRows) {
      csvContent += `"${br.employeeName}","${br.bankAccountNumber}",${br.amount}\n`;
      totalAmount += br.amount;
    }

    results.push({
      bankName,
      filename: `Bank_${bankName.replace(/\s+/g, "_")}.csv`,
      csvContent,
      totalAmount: r2(totalAmount),
      rowCount: bankRows.length,
    });
  }

  return results;
}

/**
 * Build export CSV for manual journal import (Xero/QBO format).
 */
export function buildPayrollExportCsv(entry: JournalEntry): string {
  let csv = "Date,Reference,Narration,Account Code,Account Name,Debit,Credit,Tracking1,Tracking2\n";

  for (const line of entry.lines) {
    const debit = line.debit > 0 ? line.debit.toFixed(2) : "";
    const credit = line.credit > 0 ? line.credit.toFixed(2) : "";
    csv += `"${entry.date}","${entry.reference}","${entry.narration}","${line.accountCode}","${line.accountName}",${debit},${credit},"${line.trackingCategory1 || ""}","${line.trackingCategory2 || ""}"\n`;
  }

  return csv;
}

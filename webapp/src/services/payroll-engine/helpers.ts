/**
 * Utility functions ported from PayrollGenerator.txt
 * Preserves original rounding, normalization, and date behaviors.
 */

import { SYSTEM_COMPONENT_NAMES } from "@/lib/constants";

export function r2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

export function n(v: unknown): number {
  if (typeof v === "number" && !isNaN(v)) return v;
  const parsed = Number(v);
  return isNaN(parsed) ? 0 : parsed;
}

export function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  return Number(s) || 0;
}

export function normHdr(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function findHeaderFuzzy(headers: string[], candidates: string[]): number {
  const norm = candidates.map((c) => c.trim().toUpperCase());
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").trim().toUpperCase();
    if (norm.includes(h)) return i;
  }
  return -1;
}

export function safeDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatPayrollMonth(d: Date): string {
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export function isSystemComponentName(name: string): boolean {
  return SYSTEM_COMPONENT_NAMES.has(normHdr(name));
}

export function canonicalSysKey(name: string): string | null {
  const up = normHdr(name);
  const map: Record<string, string> = {
    "SSS EE MC": "SSS EE MC",
    "SSS EE MPF": "SSS EE MPF",
    "SSS EE": "SSS EE MC",
    "PHILHEALTH EE": "PhilHealth EE",
    "PAG-IBIG EE": "Pag-IBIG EE",
    "HDMF EE": "Pag-IBIG EE",
    "SSS ER MC": "SSS ER MC",
    "SSS ER MPF": "SSS ER MPF",
    "SSS ER": "SSS ER MC",
    "SSS EC": "SSS EC",
    "PHILHEALTH ER": "PhilHealth ER",
    "PAG-IBIG ER": "Pag-IBIG ER",
    "HDMF ER": "Pag-IBIG ER",
    "WITHHOLDING TAX": "Withholding Tax",
    WTAX: "Withholding Tax",
  };
  return map[up] || null;
}

export function parsePercentOrNumber(v: unknown): number {
  if (typeof v === "number") return v > 1 ? v / 100 : v;
  const s = String(v || "").replace(/[^0-9.\-]/g, "");
  const num = Number(s) || 0;
  return num > 1 ? num / 100 : num;
}

export function isUnworkedTime(header: string): boolean {
  return /ABSENCE|LATES?|TARDIN/i.test(header);
}

export function isSalaryAdjustment(header: string): boolean {
  return /SALARY\s*ADJ/i.test(header);
}

export function isDeductionComponent(header: string): boolean {
  return /LOAN|DEDUCTION|DEDUK|CALAMITY|CHARGE|ADVANCE|HMO|RECOVERY/i.test(header);
}

export function isOvertimeHeader(header: string): boolean {
  return /OT\s*PAY|OVERTIME|REG(?:ULAR)?\s*OT|SPECIAL\s*OT|REST\s*DAY\s*OT|NIGHT\s*OT/i.test(header);
}

export function isEmployerContributionColumn(header: string): boolean {
  return /^SSS\s*ER|^PHILHEALTH\s*ER|^PAG-?IBIG\s*ER|^HDMF\s*ER|^SSS\s*EC$/i.test(header);
}

export function isHistoryMetaColumn(header: string): boolean {
  return /^(EMPLOYEE\s*ID|EMPLOYEE\s*NAME|TRACKING\s*CATEGORY|PAYROLL\s*GROUP|PERIOD|FROM|TO|CREDITING\s*DATE|PAYROLL\s*MONTH)$/i.test(normHdr(header));
}

export function isHistoryDerivedTotalColumn(header: string): boolean {
  return /^(GROSS\s*PAY|NET\s*PAY|TAXABLE\s*INCOME)$/i.test(normHdr(header));
}

export function isDeductionLikeColumn(header: string): boolean {
  return isDeductionComponent(header) || /^WITHHOLDING\s*TAX$/i.test(header);
}

export function roundHalfUp(v: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((v + Number.EPSILON) * factor) / factor;
}

export function toNumberRobust(v: unknown): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  if (!v) return 0;
  let s = String(v).trim();
  const isNeg = s.startsWith("(") && s.endsWith(")");
  if (isNeg) s = s.slice(1, -1);
  s = s.replace(/[₱$PHP\s,\u00A0]/gi, "");
  const num = Number(s) || 0;
  return isNeg ? -num : num;
}

export function sanitizeAscii(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

export function padTin9(tin: string): string {
  const digits = tin.replace(/\D/g, "");
  return digits.padEnd(9, "0").slice(0, 9);
}

export function pad4(s: string): string {
  return s.replace(/\D/g, "").padStart(4, "0").slice(0, 4);
}

export function birFormatDate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export function csvEscape(v: string | number, forceQuote = false): string {
  const s = String(v ?? "");
  if (forceQuote || s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function fmt2(n: number): string {
  return (Math.round((n || 0) * 100) / 100).toFixed(2);
}

export function fmt0(n: number): string {
  return String(Math.round(n || 0));
}

export function isSssBaseComponent(name: string, catLower: string): boolean {
  if (catLower === "basic pay related") return true;
  if (/SALARY\s*ADJ/i.test(name)) return true;
  return false;
}

export function isPhilHealthBaseComponent(name: string, catLower: string): boolean {
  if (/ABSENCE|TARDIN|LATES?/i.test(name)) return false;
  if (catLower === "basic pay related") return true;
  if (/SALARY\s*ADJ/i.test(name)) return true;
  return false;
}

/** Normalize group list from various formats */
export function normalizeGroups(g: string[] | string): string[] {
  if (Array.isArray(g)) return g;
  return String(g || "")
    .split(/[\n,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Period portion calculator — faithful port of _periodPortion_
 * For SEMI: A=first half, B=second half of split; mode = split|first|second
 */
export function periodPortion(
  monthlyValue: number,
  mode: string,
  partLabel: string,
  isSemi: boolean,
  isMonthly: boolean
): number {
  if (isMonthly) return monthlyValue;

  const m = mode.toLowerCase();
  if (partLabel === "A") {
    if (m === "split") return monthlyValue / 2;
    if (m === "first") return monthlyValue;
    return 0;
  }
  if (partLabel === "B") {
    if (m === "split") return monthlyValue / 2;
    if (m === "second") return monthlyValue;
    return 0;
  }
  return monthlyValue;
}

export function getSignedForPeriod(
  monthlyValue: number,
  mode: string,
  partLabel: string,
  isSemi: boolean,
  isMonthly: boolean,
  priorTaken = 0
): number {
  return r2(periodPortion(monthlyValue, mode, partLabel, isSemi, isMonthly) - (Number(priorTaken) || 0));
}

export function computeAgeYears(birthday: Date | null): number {
  if (!birthday) return 0;
  const today = stripTime(new Date());
  let age = today.getFullYear() - birthday.getFullYear();
  const mDiff = today.getMonth() - birthday.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthday.getDate())) age--;
  return age;
}

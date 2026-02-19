/**
 * Component classification — ported from _buildComponentMap_ / _classifyComponent_.
 * Maps each payroll column to a category for tax/gross/net treatment.
 */

import { normHdr } from "./helpers";
import type { ComponentMapEntry } from "./types";

export type ComponentMap = Record<string, ComponentMapEntry>;

export function classifyComponent(
  columnName: string,
  componentMap: ComponentMap
): string {
  const key = normHdr(columnName);
  const entry = componentMap[key];
  if (entry) return entry.category;

  // Fallback heuristics matching original behavior
  if (/^BASIC\s*PAY$/i.test(key)) return "Basic Pay Related";
  if (/DEMINIMIS/i.test(key)) return "Non-Taxable Earning - De Minimis";
  if (/NON[- ]?TAXABLE\s*(ALLOWANCE|EARNING)/i.test(key)) return "Non-Taxable Earning";
  if (/13TH\s*MONTH|OTHER\s*BENEFIT/i.test(key)) return "13th Month Pay and Other Benefits";
  if (/ALLOWANCE|OT\s*PAY|OVERTIME|NIGHT\s*DIFF|HOLIDAY\s*PAY|REST\s*DAY/i.test(key))
    return "Basic Pay Related";
  if (/ABSENCE|LATES?|TARDIN/i.test(key)) return "Basic Pay Related";
  if (/LOAN|DEDUCTION|DEDUK|CALAMITY|CHARGE|ADVANCE|HMO|RECOVERY/i.test(key)) return "Deduction";

  return "";
}

/**
 * Build component map from DB adjustment types (replaces _buildComponentMap_ from cfg).
 */
export function buildComponentMapFromTypes(
  types: Array<{ name: string; category: string }>
): ComponentMap {
  const map: ComponentMap = {};
  for (const t of types) {
    const key = normHdr(t.name);
    if (!key) continue;
    map[key] = {
      name: t.name,
      category: t.category,
      source: "adjustment_types",
    };
  }
  return map;
}

/**
 * Check if a category is a deduction type.
 */
export function isDeductionCategory(cat: string): boolean {
  return /^deduction\b/i.test(cat);
}

export function isAdditionCategory(cat: string): boolean {
  return /^addition\b/i.test(cat);
}

export function isEarningCategory(cat: string): boolean {
  const lower = cat.toLowerCase();
  return (
    lower === "basic pay related" ||
    lower === "taxable earning" ||
    lower === "non-taxable earning" ||
    lower === "non-taxable earning - de minimis" ||
    lower === "non-taxable earning - other" ||
    lower === "13th month pay and other benefits"
  );
}

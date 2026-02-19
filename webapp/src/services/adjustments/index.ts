export * from "./rate-lookup";
export * from "./types";
export * from "./apply-recurring";

/**
 * Load and merge adjustments for a payroll run.
 * Replaces _loadInputsWithin_, _loadAbsencesTardinessDirect_, _loadRecurringAdjustments_.
 */
import type { InputsRow, RecurringAdjustment, InputsSummaryRow } from "./types";

/** @internal Unused — current adjustment flow doesn't merge. */
function mergeAdjustments(
  baseAdjustments: InputsRow[],
  absenceTardiness: InputsRow[],
  recurringAdjustments: InputsRow[]
): InputsRow[] {
  const mergeMap = new Map<string, InputsRow>();

  for (const a of baseAdjustments) {
    mergeMap.set(`${a.empId}||${a.name.toLowerCase()}`, { ...a });
  }

  for (const a of absenceTardiness) {
    const k = `${a.empId}||${a.name.toLowerCase()}`;
    const prev = mergeMap.get(k);
    if (prev) {
      prev.cat = "Basic Pay Related";
    } else {
      mergeMap.set(k, { ...a, cat: "Basic Pay Related" });
    }
  }

  const combined = Array.from(mergeMap.values());
  return [...combined, ...recurringAdjustments];
}

/**
 * Filter recurring adjustments by period and mode.
 */
/** @internal Unused — recurring filtering handled by apply-recurring module. */
function filterRecurringForPeriod(
  allRecurring: RecurringAdjustment[],
  rangeStart: Date,
  rangeEnd: Date,
  partLabel: string
): InputsRow[] {
  const results: InputsRow[] = [];

  for (const rec of allRecurring) {
    if (rec.startDate && rec.startDate > rangeEnd) continue;
    if (rec.endDate && rec.endDate < rangeStart) continue;

    let amount = rec.amount;
    const mode = (rec.mode || "SPLIT").toUpperCase();

    if (partLabel === "A") {
      if (mode === "SPLIT") amount = amount / 2;
      else if (mode === "2ND") continue;
    } else if (partLabel === "B") {
      if (mode === "SPLIT") amount = amount / 2;
      else if (mode === "1ST") continue;
    }

    if (partLabel.startsWith("S-")) continue;

    results.push({
      empId: rec.empId,
      name: rec.name,
      amt: amount,
      cat: rec.category,
    });
  }

  return results;
}

/**
 * Rebuild Inputs Summary — faithful port of rebuildInputsSummary().
 * Aggregates Overtime, Absences/Tardiness, and Variable Adjustments
 * into a single sorted summary with categories.
 */
/** @internal Reserved for future adjustment summary view. */
function rebuildInputsSummary(
  overtimeInputs: InputsRow[],
  absenceTardinessInputs: InputsRow[],
  variableAdjustments: InputsRow[],
  employeeNames?: Map<string, string>
): InputsSummaryRow[] {
  const summary: InputsSummaryRow[] = [];

  for (const row of overtimeInputs) {
    summary.push({
      empId: row.empId,
      empName: employeeNames?.get(row.empId) || row.empId,
      componentName: row.name,
      category: row.cat || "Basic Pay Related",
      amount: row.amt,
      sourceSheet: "Overtime",
    });
  }

  for (const row of absenceTardinessInputs) {
    summary.push({
      empId: row.empId,
      empName: employeeNames?.get(row.empId) || row.empId,
      componentName: row.name,
      category: "Basic Pay Related",
      amount: row.amt,
      sourceSheet: "Absences_Tardiness",
    });
  }

  for (const row of variableAdjustments) {
    summary.push({
      empId: row.empId,
      empName: employeeNames?.get(row.empId) || row.empId,
      componentName: row.name,
      category: row.cat,
      amount: row.amt,
      sourceSheet: "Variable_Adjustments",
    });
  }

  summary.sort((a, b) => {
    const empCmp = a.empId.localeCompare(b.empId);
    if (empCmp !== 0) return empCmp;
    return a.componentName.localeCompare(b.componentName);
  });

  return summary;
}

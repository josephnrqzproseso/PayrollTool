/**
 * Golden-master validation script.
 *
 * Compares payroll run output from the new TypeScript engine against
 * a reference CSV/JSON exported from the original Apps Script engine.
 *
 * Usage: npx tsx scripts/validate-output.ts --run-id=<payroll-run-id> --reference=<path-to-csv>
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

interface RefRow {
  [key: string]: string | number;
}

const TOLERANCE = 0.01;

async function main() {
  const runId = getArg("--run-id");
  const refPath = getArg("--reference");

  if (!runId || !refPath) {
    console.error("Usage: npx tsx scripts/validate-output.ts --run-id=<uuid> --reference=<path-to-csv>");
    process.exit(1);
  }

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { rows: true },
  });

  if (!run) { console.error("Payroll run not found."); process.exit(1); }

  console.log(`Validating run ${run.periodLabel} (${run.totalEmployees} employees)`);

  const refData = loadReference(refPath);
  console.log(`Reference has ${refData.length} rows`);

  const newByEmpId = new Map<string, Record<string, number | string>>();
  for (const row of run.rows) {
    const vals = row.componentValues as Record<string, number | string>;
    newByEmpId.set(String(vals["Employee ID"] || row.employeeId), vals);
  }

  let matches = 0;
  let mismatches = 0;
  let missing = 0;
  const errors: string[] = [];

  for (const ref of refData) {
    const empId = String(ref["Employee ID"] || "").trim();
    if (!empId) continue;

    const newRow = newByEmpId.get(empId);
    if (!newRow) {
      missing++;
      errors.push(`MISSING: ${empId} not in new output`);
      continue;
    }

    const fieldsToCompare = ["Gross Pay", "Net Pay", "Taxable Income", "Withholding Tax", "SSS EE MC", "SSS EE MPF", "PhilHealth EE", "Pag-IBIG EE", "BASIC PAY"];
    let rowMatch = true;

    for (const field of fieldsToCompare) {
      const refVal = Number(ref[field]) || 0;
      const newVal = Number(newRow[field]) || 0;
      const diff = Math.abs(refVal - newVal);

      if (diff > TOLERANCE) {
        rowMatch = false;
        errors.push(`MISMATCH: ${empId} | ${field}: ref=${refVal} new=${newVal} diff=${diff.toFixed(2)}`);
      }
    }

    if (rowMatch) matches++;
    else mismatches++;
  }

  console.log("\n════════════════════════════════════");
  console.log("  GOLDEN-MASTER VALIDATION REPORT");
  console.log("════════════════════════════════════");
  console.log(`  Reference rows: ${refData.length}`);
  console.log(`  New engine rows: ${run.rows.length}`);
  console.log(`  Matches:    ${matches}`);
  console.log(`  Mismatches: ${mismatches}`);
  console.log(`  Missing:    ${missing}`);
  console.log(`  Pass rate:  ${((matches / Math.max(1, refData.length)) * 100).toFixed(1)}%`);
  console.log("════════════════════════════════════\n");

  if (errors.length > 0) {
    console.log("Errors (first 50):");
    errors.slice(0, 50).forEach((e) => console.log(`  ${e}`));
  }

  if (mismatches === 0 && missing === 0) {
    console.log("RESULT: PASS — all outputs match within tolerance.");
  } else {
    console.log("RESULT: FAIL — review mismatches above.");
    process.exit(1);
  }

  await prisma.$disconnect();
}

function loadReference(path: string): RefRow[] {
  const content = readFileSync(path, "utf-8");

  if (path.endsWith(".json")) {
    return JSON.parse(content);
  }

  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows: RefRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.replace(/"/g, "").trim());
    const row: RefRow = {};
    for (let j = 0; j < headers.length; j++) {
      const num = Number(vals[j]);
      row[headers[j]] = isNaN(num) ? vals[j] : num;
    }
    rows.push(row);
  }

  return rows;
}

function getArg(name: string): string {
  const arg = process.argv.find((a) => a.startsWith(name + "="));
  return arg ? arg.split("=")[1] : "";
}

main().catch(console.error);

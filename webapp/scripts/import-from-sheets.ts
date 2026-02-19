/**
 * Data import script — migrates existing Google Sheets data into Cloud SQL.
 *
 * Usage: npx tsx scripts/import-from-sheets.ts --tenant-id=<uuid> --sheet-id=<spreadsheet-id>
 *
 * Reads from:
 *   - Masterfile Import (employees)
 *   - PAYROLL_HISTORY (historical payroll data)
 *   - BIR_TABLE, SSS_TABLE (statutory tables)
 *   - ADJUSTMENT_TYPES (component categories)
 */

import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";

const prisma = new PrismaClient();

async function main() {
  const tenantId = getArg("--tenant-id");
  const sheetId = getArg("--sheet-id");

  if (!tenantId || !sheetId) {
    console.error("Usage: npx tsx scripts/import-from-sheets.ts --tenant-id=<uuid> --sheet-id=<spreadsheet-id>");
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Importing employees from Masterfile Import...");
  await importEmployees(sheets, sheetId, tenantId);

  console.log("Importing BIR table...");
  await importBirTable(sheets, sheetId, tenantId);

  console.log("Importing SSS table...");
  await importSssTable(sheets, sheetId, tenantId);

  console.log("Importing payroll history...");
  await importPayrollHistory(sheets, sheetId, tenantId);

  console.log("Import complete!");
  await prisma.$disconnect();
}

async function importEmployees(sheets: ReturnType<typeof google.sheets>, sheetId: string, tenantId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Masterfile Import!A:ZZ",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) { console.log("  No employee data found."); return; }

  const headers = rows[0].map((h: string) => String(h || "").trim());
  const findCol = (names: string[]) => headers.findIndex((h: string) => names.map((n) => n.toUpperCase()).includes(h.toUpperCase()));

  const idxId = findCol(["Employee ID", "Emp ID"]);
  const idxName = findCol(["Employee Name", "Name"]);
  const idxStatus = findCol(["Status"]);
  const idxContract = findCol(["Contract Type"]);
  const idxHired = findCol(["Date Hired"]);
  const idxSep = findCol(["Date Separated"]);
  const idxBasic = findCol(["Basic Pay"]);
  const idxPayBasis = findCol(["Pay Basis"]);
  const idxGroup = findCol(["Payroll Group"]);
  const idxTin = findCol(["TIN"]);
  const idxSss = findCol(["SSS"]);
  const idxPh = findCol(["PhilHealth"]);
  const idxPi = findCol(["Pag-IBIG", "HDMF"]);

  if (idxId === -1 || idxName === -1) { console.error("  Missing Employee ID/Name columns."); return; }

  let imported = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const empId = String(r[idxId] || "").trim();
    const empName = String(r[idxName] || "").trim();
    if (!empId || !empName) continue;

    await prisma.employee.upsert({
      where: { tenantId_employeeId: { tenantId, employeeId: empId } },
      update: { employeeName: empName },
      create: {
        tenantId,
        employeeId: empId,
        employeeName: empName,
        status: idxStatus > -1 ? String(r[idxStatus] || "Active").trim() : "Active",
        contractType: idxContract > -1 ? String(r[idxContract] || "Employee").trim() : "Employee",
        dateHired: idxHired > -1 && r[idxHired] ? new Date(r[idxHired]) : null,
        dateSeparated: idxSep > -1 && r[idxSep] ? new Date(r[idxSep]) : null,
        basicPay: idxBasic > -1 ? Number(String(r[idxBasic]).replace(/[^0-9.]/g, "")) || 0 : 0,
        payBasis: idxPayBasis > -1 ? String(r[idxPayBasis] || "MONTHLY").trim() : "MONTHLY",
        payrollGroup: idxGroup > -1 ? String(r[idxGroup] || "").trim() : "",
        tin: idxTin > -1 ? String(r[idxTin] || "").trim() : "",
        sss: idxSss > -1 ? String(r[idxSss] || "").trim() : "",
        philhealth: idxPh > -1 ? String(r[idxPh] || "").trim() : "",
        pagibig: idxPi > -1 ? String(r[idxPi] || "").trim() : "",
      },
    });
    imported++;
  }

  console.log(`  Imported ${imported} employees.`);
}

async function importBirTable(sheets: ReturnType<typeof google.sheets>, sheetId: string, tenantId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "BIR_TABLE!A:F",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return;

  await prisma.birTable.deleteMany({ where: { tenantId } });

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    await prisma.birTable.create({
      data: {
        tenantId,
        bracketMin: Number(r[0]) || 0,
        bracketMax: r[1] === "Infinity" ? 999999999 : Number(r[1]) || 0,
        fixedTax: Number(r[2]) || 0,
        rate: Number(r[3]) || 0,
        period: String(r[4] || "MONTHLY"),
      },
    });
  }

  console.log(`  Imported ${rows.length - 1} BIR brackets.`);
}

async function importSssTable(sheets: ReturnType<typeof google.sheets>, sheetId: string, tenantId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "SSS_TABLE!A:G",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) return;

  await prisma.sssTable.deleteMany({ where: { tenantId } });

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    await prisma.sssTable.create({
      data: {
        tenantId,
        compensationMin: Number(r[0]) || 0,
        compensationMax: Number(r[1]) || 0,
        eeMc: Number(r[2]) || 0,
        eeMpf: Number(r[3]) || 0,
        erMc: Number(r[4]) || 0,
        erMpf: Number(r[5]) || 0,
        ec: Number(r[6]) || 0,
      },
    });
  }

  console.log(`  Imported ${rows.length - 1} SSS brackets.`);
}

async function importPayrollHistory(sheets: ReturnType<typeof google.sheets>, sheetId: string, tenantId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "PAYROLL_HISTORY!A:ZZ",
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) { console.log("  No history data found."); return; }

  const headers = rows[0].map((h: string) => String(h || "").trim());
  const idxEmpId = headers.findIndex((h: string) => /^Employee ID$/i.test(h));
  const idxPeriod = headers.findIndex((h: string) => /^Period$/i.test(h));

  if (idxEmpId === -1 || idxPeriod === -1) { console.log("  Missing Employee ID or Period column."); return; }

  let imported = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const empId = String(r[idxEmpId] || "").trim();
    const period = String(r[idxPeriod] || "").trim();
    if (!empId || !period) continue;

    const periodKeyMatch = period.match(/(\d{4}-\d{2})/);
    const periodKey = periodKeyMatch ? periodKeyMatch[1] : "";
    const partMatch = period.match(/-([A-Z]+)$/);
    const partLabel = partMatch ? partMatch[1] : "";

    const columnValues: Record<string, number> = {};
    for (let c = 0; c < headers.length; c++) {
      if (c === idxEmpId || c === idxPeriod) continue;
      const val = Number(r[c]);
      if (!isNaN(val) && val !== 0) columnValues[headers[c]] = val;
    }

    const employee = await prisma.employee.findUnique({
      where: { tenantId_employeeId: { tenantId, employeeId: empId } },
    });
    if (!employee) continue;

    await prisma.payrollHistory.create({
      data: { tenantId, employeeId: employee.id, periodKey, periodLabel: period, partLabel, columnValues },
    });
    imported++;
  }

  console.log(`  Imported ${imported} history records.`);
}

function getArg(name: string): string {
  const arg = process.argv.find((a) => a.startsWith(name + "="));
  return arg ? arg.split("=")[1] : "";
}

main().catch(console.error);

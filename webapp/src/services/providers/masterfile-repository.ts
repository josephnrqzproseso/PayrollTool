/**
 * MasterfileRepository — DB-backed provider replacing SpreadsheetApp access.
 * All payroll runners call this interface instead of reading from Google Sheets.
 */

import { prisma } from "@/lib/db";
import type { EmployeeRow } from "../payroll-engine/types";
import type { InputsRow } from "../adjustments/types";

export async function loadEmployees(
  tenantId: string,
  payrollGroups?: string[]
): Promise<EmployeeRow[]> {
  const where: Record<string, unknown> = { tenantId };

  if (payrollGroups && payrollGroups.length > 0 && !payrollGroups.includes("ALL")) {
    where.payrollGroup = { in: payrollGroups };
  }

  const employees = await prisma.employee.findMany({
    where: where as never,
    include: {
      trackingAssignments: {
        include: { option: { include: { kind: true } } },
      },
    },
  });

  return employees.map((emp) => {
    const trackingDimensions: Record<string, string> = {};
    for (const a of emp.trackingAssignments) {
      trackingDimensions[a.option.kind.name] = a.option.name;
    }
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeId,
      employeeName: emp.employeeName,
      status: emp.status,
      contractType: emp.contractType,
      dateHired: emp.dateHired,
      dateSeparated: emp.dateSeparated,
      payBasis: emp.payBasis,
      basicPay: emp.basicPay,
      computedBasicPay: 0,
      trackingCategory1: emp.trackingCategory1,
      trackingCategory2: emp.trackingCategory2,
      payrollGroup: emp.payrollGroup,
      birthday: emp.birthday,
      isPwd: emp.isPwd,
      isMwe: emp.isMwe,
      appliedForRetirement: emp.appliedForRetirement,
      nationality: emp.nationality,
      consultantTaxRate: Number(emp.consultantTaxRate) || 0,
      dynamicFields: (emp.dynamicFields as Record<string, number | string>) || {},
      trackingDimensions,
    };
  });
}

export async function loadAdjustments(
  tenantId: string,
  periodKey: string
): Promise<InputsRow[]> {
  const adjustments = await prisma.adjustment.findMany({
    where: { tenantId, periodKey },
  });

  return adjustments.map((adj) => ({
    empId: adj.employeeId,
    name: adj.name,
    amt: adj.amount,
    cat: adj.category,
  }));
}

/** @internal Not used — system uses global statutory tables via version-resolver. */
async function loadBirTable(tenantId: string) {
  const rows = await prisma.birTable.findMany({
    where: { tenantId },
    orderBy: { bracketMin: "asc" },
  });

  return rows.map((r) => ({
    exSemi: r.bracketMin / 2,
    maxSemi: r.bracketMax === Infinity ? Infinity : r.bracketMax / 2,
    fixedSemi: r.fixedTax / 2,
    rateSemi: r.rate,
    exMonth: r.bracketMin,
    maxMonth: r.bracketMax,
    fixedMonth: r.fixedTax,
    rateMonth: r.rate,
    exAnnual: r.bracketMin * 12,
    maxAnnual: r.bracketMax === Infinity ? Infinity : r.bracketMax * 12,
    fixedAnnual: r.fixedTax * 12,
    rateAnnual: r.rate,
  }));
}

/** @internal Not used — system uses global statutory tables via version-resolver. */
async function loadSssTable(tenantId: string) {
  const rows = await prisma.sssTable.findMany({
    where: { tenantId },
    orderBy: { compensationMin: "asc" },
  });

  return rows.map((r) => ({
    compensationMin: r.compensationMin,
    compensationMax: r.compensationMax,
    eeMc: r.eeMc,
    eeMpf: r.eeMpf,
    erMc: r.erMc,
    erMpf: r.erMpf,
    ec: r.ec,
  }));
}

export async function loadPayrollHistory(
  tenantId: string,
  periodKey: string
): Promise<Map<string, Record<string, number>>> {
  const history = await prisma.payrollHistory.findMany({
    where: { tenantId, periodKey },
  });

  const map = new Map<string, Record<string, number>>();
  for (const h of history) {
    const vals = h.columnValues as Record<string, number>;
    const existing = map.get(h.employeeId) || {};
    for (const [k, v] of Object.entries(vals)) {
      existing[k] = (existing[k] || 0) + (Number(v) || 0);
    }
    map.set(h.employeeId, existing);
  }

  return map;
}

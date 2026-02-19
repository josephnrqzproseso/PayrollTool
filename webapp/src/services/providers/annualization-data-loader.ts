/**
 * Loads and structures PayrollHistory + Employee data for annualization.
 * Used by BIR 2316, Alphalist, and Pre-Annualization report generators.
 */

import { prisma } from "@/lib/db";
import { buildComponentMapFromTypes } from "../payroll-engine/component-map";
import type { ComponentMap } from "../payroll-engine/component-map";

export interface EmployeeAnnualizationMeta {
  dbId: string;
  employeeId: string;
  employeeName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  tin: string;
  birthday: string;
  address: string;
  zipCode: string;
  dateHired: Date | null;
  dateSeparated: Date | null;
  status: string;
  contractType: string;
  payBasis: string;
  basicPay: number;
  workingDaysPerYear: number;
  nationality: string;
  isMwe: boolean;
  payrollGroup: string;
  trackingCategory1: string;
  trackingCategory2: string;
  position: string;
  bankName: string;
  bankAccountNumber: string;
  hasPrevEmployer: boolean;
}

export interface PerEmployeeHistory {
  historyRows: Array<Record<string, number | string>>;
  historyHeaders: string[];
}

export interface AnnualizationDataBundle {
  employees: EmployeeAnnualizationMeta[];
  perEmployee: Map<string, PerEmployeeHistory>;
  componentMap: ComponentMap;
  companyProfile: {
    tin: string;
    registeredName: string;
    registeredAddress1: string;
    registeredAddress2: string;
    zipCode: string;
    authorizedRep: string;
    authorizedRepTin: string;
  };
}

export async function loadAnnualizationData(
  tenantId: string,
  year: number
): Promise<AnnualizationDataBundle> {
  const yearStr = String(year);

  const [historyRecords, dbEmployees, profile, adjTypes] = await Promise.all([
    prisma.payrollHistory.findMany({
      where: {
        tenantId,
        periodKey: { startsWith: `${yearStr}-` },
      },
      orderBy: [{ periodKey: "asc" }, { partLabel: "asc" }],
    }),
    prisma.employee.findMany({ where: { tenantId } }),
    prisma.companyProfile.findUnique({ where: { tenantId } }),
    prisma.adjustmentType.findMany({ where: { tenantId } }),
  ]);

  const componentMap = buildComponentMapFromTypes(adjTypes);

  const employeeDbIdToCode = new Map<string, string>();
  for (const e of dbEmployees) {
    employeeDbIdToCode.set(e.id, e.employeeId);
  }

  const perEmployee = new Map<string, PerEmployeeHistory>();

  for (const h of historyRecords) {
    const empCode = employeeDbIdToCode.get(h.employeeId);
    if (!empCode) continue;

    const vals = h.columnValues as Record<string, number | string>;

    let entry = perEmployee.get(empCode);
    if (!entry) {
      entry = { historyRows: [], historyHeaders: [] };
      perEmployee.set(empCode, entry);
    }

    entry.historyRows.push(vals);

    for (const key of Object.keys(vals)) {
      if (!entry.historyHeaders.includes(key)) {
        entry.historyHeaders.push(key);
      }
    }
  }

  const employees: EmployeeAnnualizationMeta[] = dbEmployees.map((e) => ({
    dbId: e.id,
    employeeId: e.employeeId,
    employeeName: e.employeeName,
    lastName: e.lastName,
    firstName: e.firstName,
    middleName: e.middleName,
    tin: e.tin,
    birthday: e.birthday?.toISOString().slice(0, 10) || "",
    address: [e.trackingCategory1, e.trackingCategory2].filter(Boolean).join(", "),
    zipCode: "",
    dateHired: e.dateHired,
    dateSeparated: e.dateSeparated,
    status: e.status,
    contractType: e.contractType,
    payBasis: e.payBasis,
    basicPay: e.basicPay,
    workingDaysPerYear: e.workingDaysPerYear,
    nationality: e.nationality,
    isMwe: e.isMwe,
    payrollGroup: e.payrollGroup,
    trackingCategory1: e.trackingCategory1,
    trackingCategory2: e.trackingCategory2,
    position: e.position,
    bankName: e.bankName,
    bankAccountNumber: e.bankAccountNumber,
    hasPrevEmployer: false,
  }));

  return {
    employees,
    perEmployee,
    componentMap,
    companyProfile: {
      tin: profile?.tin || "",
      registeredName: profile?.registeredName || "",
      registeredAddress1: profile?.registeredAddress1 || "",
      registeredAddress2: profile?.registeredAddress2 || "",
      zipCode: profile?.zipCode || "",
      authorizedRep: profile?.authorizedRep || "",
      authorizedRepTin: profile?.authorizedRepTin || "",
    },
  };
}

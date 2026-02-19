export interface PayrollForm {
  payrollFrequency: string;
  payrollCode: string;
  entity: string;
  payrollGroups: string[];
  startDate: string;
  endDate: string;
  creditingDate?: string;
  computeTax: boolean;
  computeContrib: boolean;
}

export interface PayrollConfig {
  SOURCE_SS_ID: string;
  INPUTS_SS_ID: string;
  MASTER_SHEET_NAME: string;
  WORKING_DAYS_PER_YEAR: number;
  PAY_FREQUENCY: string;
  PH_RATE: number;
  PH_MIN_BASE: number;
  PH_MAX_BASE: number;
  PAGIBIG_EE_RATE: number;
  PAGIBIG_ER_RATE: number;
  PAGIBIG_MAX_BASE: number;
  COMPANY_TIN: string;
  componentModes: Map<string, string>;
  employeeOverrides: Map<string, string>;
}

export interface EmployeeRow {
  /**
   * Internal DB primary key (UUID) for joins (adjustments, history, payroll rows).
   */
  employeeId: string;
  /**
   * Human/business employee code (e.g. "E-001"). Used for report display/export.
   */
  employeeCode: string;
  employeeName: string;
  status: string;
  contractType: string;
  dateHired: Date | null;
  dateSeparated: Date | null;
  payBasis: string;
  basicPay: number;
  computedBasicPay: number;
  trackingCategory1: string;
  trackingCategory2: string;
  payrollGroup: string;
  birthday: Date | null;
  isPwd: boolean;
  isMwe: boolean;
  appliedForRetirement: boolean;
  nationality: string;
  consultantTaxRate: number;
  dynamicFields: Record<string, number | string>;
  trackingDimensions?: Record<string, string>;
}

export interface Adjustment {
  empId: string;
  name: string;
  amt: number;
  cat: string;
}

export interface BirBracket {
  exSemi: number;
  maxSemi: number;
  fixedSemi: number;
  rateSemi: number;
  exMonth: number;
  maxMonth: number;
  fixedMonth: number;
  rateMonth: number;
  exAnnual: number;
  maxAnnual: number;
  fixedAnnual: number;
  rateAnnual: number;
}

export interface SssBracket {
  compensationMin: number;
  compensationMax: number;
  eeMc: number;
  eeMpf: number;
  erMc: number;
  erMpf: number;
  ec: number;
}

export interface StatutoryResult {
  sssEeMc: number;
  sssEeMpf: number;
  sssErMc: number;
  sssErMpf: number;
  sssEc: number;
  phEe: number;
  phEr: number;
  piEe: number;
  piEr: number;
}

export interface ComponentMapEntry {
  name: string;
  category: string;
  source: string;
}

export interface PayrollRowOutput {
  [key: string]: number | string;
}

export interface PayrollRunResult {
  headers: string[];
  rows: PayrollRowOutput[];
  periodLabel: string;
  payrollMonth: string;
  totalEmployees: number;
  totalGrossPay: number;
  totalNetPay: number;
}

export type ProgressCallback = (percent: number, message: string, eta: string) => void;

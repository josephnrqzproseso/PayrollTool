export interface PreAnnFacts {
  empId: string;
  empName: string;
  ytdBasic: number;
  ytdTaxable: number;
  ytd13thOther: number;
  ytdDeminimis: number;
  ytdNonTaxOther: number;
  ytdSssEeMc: number;
  ytdSssEeMpf: number;
  ytdPhEe: number;
  ytdPiEe: number;
  ytdWtax: number;
  wtaxThisMonth: number;
  monthsEmployedSet: Record<number, boolean>;
  normalCutoffsCount: number;
  countA: number;
  countB: number;
  countM: number;
  isMwe: boolean;
  ytdOvertime: number;
  ytdRecurringTaxable: number;
  ytdRecurringNonTaxable: number;
  ytdRecurring13th: number;
  cutoffsThisMonth: number;
  hasA: boolean;
  hasB: boolean;
  hasM: boolean;
}

export interface PreAnnResult {
  empId: string;
  empName: string;
  group: string;
  trackingCategory1: string;
  trackingCategory2: string;
  frequency: string;
  monthsEmployed: number;
  remainingMonths: number;

  ytdBasic: number;
  ytdTaxable: number;
  ytd13thOther: number;
  ytdDeminimis: number;
  ytdNonTaxOther: number;
  ytdSssEe: number;
  ytdPhEe: number;
  ytdPiEe: number;
  ytdWtax: number;

  projectedAnnualBasic: number;
  projectedAnnualTaxable: number;
  projectedAnnual13th: number;
  projectedAnnualDeminimis: number;
  projectedAnnualNonTaxOther: number;
  projectedAnnualSssEe: number;
  projectedAnnualPhEe: number;
  projectedAnnualPiEe: number;

  annualTaxableIncome: number;
  annualTaxDue: number;
  ytdWtaxPaid: number;
  taxWithheldPresentAssumed: number;
  remainingTax: number;
  perCutoffTax: number;
  remainingCutoffs: number;

  isMwe: boolean;
}

export interface PreviousEmployerBreakdown {
  tin: string;
  registeredName: string;
  address: string;
  zipCode: string;
  taxableCompensation: number;
  taxesWithheld: number;
  nonTaxGrossCompIncome: number;
  nonTaxBasicSmw: number;
  nonTaxHolidayPay: number;
  nonTaxOvertimePay: number;
  nonTaxNightDiff: number;
  nonTaxHazardPay: number;
  nonTax13thMonth: number;
  nonTaxDeMinimis: number;
  nonTaxSssEtc: number;
  nonTaxSalaries: number;
  taxableBasicSalary: number;
  taxable13thMonth: number;
  taxableSalaries: number;
}

export interface FinalAnnComponentYtd {
  header: string;
  category: string;
  ytdAmount: number;
}

export interface FinalAnnResult {
  empId: string;
  empName: string;
  group: string;
  trackingCategory1: string;
  trackingCategory2: string;
  isMwe: boolean;

  componentYtds: FinalAnnComponentYtd[];

  ytdBasic: number;
  ytdTaxableEarnings: number;
  ytd13thOther: number;
  ytdDeminimis: number;
  ytdNonTaxOther: number;
  ytdOvertime: number;

  ytdSssEe: number;
  ytdPhEe: number;
  ytdPiEe: number;
  ytdWtax: number;

  mweNonTaxBasic: number;
  mweNonTaxOvertime: number;

  totalGrossCompPresent: number;
  totalNonTaxableComp: number;
  totalTaxableComp: number;

  totalCompensationIncome: number;
  totalNonTaxableIncome: number;
  totalTaxableIncome: number;
  totalExemptions: number;
  totalTaxDue: number;
  totalTaxWithheld: number;
  taxDifference: number;

  prevEmployer: PreviousEmployerBreakdown | null;
  prevEmployerTaxable: number;
  prevEmployerWtax: number;
}

import type { PreviousEmployerBreakdown } from "../annualization/types";

export interface Bir2316Data {
  empId: string;
  empName: string;
  tin: string;
  birthday: string;
  address: string;
  zipCode: string;

  employerTin: string;
  employerName: string;
  employerAddress: string;
  employerZipCode: string;

  totalCompensation: number;
  totalNonTaxable: number;
  totalTaxable: number;
  totalExemptions: number;
  totalTaxDue: number;
  totalTaxWithheld: number;
  taxDifference: number;

  prevEmployerTaxable: number;
  prevEmployerWtax: number;
  prevEmployer: PreviousEmployerBreakdown | null;

  sssContributions: number;
  philhealthContributions: number;
  pagibigContributions: number;

  isMwe: boolean;
  mweBp: number;
  mweOt: number;
  nmweBp: number;
  nmweOt: number;
  smwPerDay: number;
  smwPerMonth: number;

  ytdBasic: number;
  ytdTaxableEarnings: number;
  ytd13thOther: number;
  ytdDeminimis: number;
  ytdNonTaxOther: number;
  ytdOvertime: number;

  nonTaxable13th: number;
  taxable13th: number;

  periodFrom: string;
  periodTo: string;
  dateIssued: string;
  year: number;

  tags: Record<string, string>;
}

export interface AlphalistRow {
  seqNo: number;
  schedule: 1 | 2;
  tin: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthday: string;
  address: string;
  zipCode: string;
  nationality: string;
  employmentStatus: string;
  employmentFrom: string;
  employmentTo: string;
  reasonSeparation: string;
  subsFiling: string;

  totalCompensation: number;
  totalStatutoryContrib: number;
  totalNonTaxable: number;
  taxableIncome: number;
  taxWithheld: number;
  taxDue: number;
  adjustmentAmount: number;

  basicSum: number;
  taxableEarningsSum: number;
  other13Sum: number;
  deminimusSum: number;
  nonTaxOtherSum: number;
  overtimeSum: number;

  eeShare: number;
  nonTaxable13th: number;
  taxable13th: number;
  taxableBasicSalary: number;

  smwPerDay: number;
  smwPerMonth: number;
  smwPerYear: number;
  smwFactor: number;

  isMwe: boolean;
  mweBp: number;
  mweOt: number;

  prevEmployer: PreviousEmployerBreakdown | null;
}

export interface AlphalistSummary {
  rows: AlphalistRow[];
  s1Rows: AlphalistRow[];
  s2Rows: AlphalistRow[];
  totalCompensation: number;
  totalTaxable: number;
  totalTaxWithheld: number;
  totalTaxDue: number;
  s1DetailCsv: string;
  s1ControlCsv: string;
  s2DetailCsv: string;
  s2ControlCsv: string;
  datFilename: string;
}

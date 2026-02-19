export interface AdjustmentTypeRecord {
  name: string;
  category: string;
}

export interface OtRateConfig {
  name: string;
  multiplier: number;
}

export interface RateLookupEntry {
  empId: string;
  empName: string;
  basicPay: number;
  payBasis: string;
  workingDaysPerYear: number;
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  minuteRate: number;
}

export interface InputsRow {
  empId: string;
  name: string;
  amt: number;
  cat: string;
}

export interface RecurringAdjustment {
  empId: string;
  name: string;
  category: string;
  amount: number;
  mode: string;
  maxAmount: number | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface InputsSummaryRow {
  empId: string;
  empName: string;
  componentName: string;
  category: string;
  amount: number;
  sourceSheet: string;
}

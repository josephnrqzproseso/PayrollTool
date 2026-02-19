export interface PayslipData {
  empId: string;
  empName: string;
  position: string;
  department: string;
  periodLabel: string;
  payrollMonth: string;
  fromDate: string;
  toDate: string;
  creditingDate: string;

  earnings: PayslipLine[];
  deductions: PayslipLine[];
  contributions: PayslipLine[];

  grossPay: number;
  totalDeductions: number;
  totalContributions: number;
  netPay: number;

  bankName: string;
  bankAccountNumber: string;

  tags: Record<string, string>;
  adjustmentDetails: PayslipAdjustmentLine[];
}

export interface PayslipLine {
  label: string;
  amount: number;
}

export interface PayslipAdjustmentLine {
  name: string;
  category: string;
  amount: number;
}

export interface PayslipEmailSettings {
  subject: string;
  body: string;
  cc: string;
  bcc: string;
  replyTo: string;
  senderName: string;
  appendSignature: boolean;
  filenamePattern: string;
}

export interface PayslipBatchState {
  runId: string;
  totalEmployees: number;
  completedEmployees: number;
  failedEmployees: string[];
  status: "pending" | "running" | "completed" | "cancelled" | "error";
  startedAt: Date;
  lastProgressAt: Date;
}

export interface PayslipCheckResult {
  empId: string;
  empName: string;
  expectedNetPay: number;
  payslipNetPay: number;
  difference: number;
  matched: boolean;
}

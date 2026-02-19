export interface JournalEntry {
  date: string;
  reference: string;
  narration: string;
  lines: JournalLine[];
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  trackingCategory1?: string;
  trackingCategory2?: string;
  trackingDimensions?: Record<string, string>;
  lineType?: "positive" | "negative";
}

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  uid?: number;
  apiKey?: string;
}

export interface XeroConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  trackingCategory1Name?: string;
  trackingCategory2Name?: string;
  tokenSet?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}

export interface CoaAccount {
  code: string;
  name: string;
}

/**
 * 4-account mapping per payroll header.
 * Employee/Consultant × COST/OPEX = 4 distinct GL accounts.
 */
export interface HeaderAccountMapping {
  componentName: string;
  employeeCostAccount: string;
  employeeOpexAccount: string;
  consultantCostAccount: string;
  consultantOpexAccount: string;
  lineType: "positive" | "negative";
}

export interface BankMapping {
  bankName: string;
  glAccountCode: string;
  glAccountName: string;
}

export interface CoaMapping {
  componentName: string;
  debitAccount: string;
  creditAccount: string;
}

export interface PostingResult {
  success: boolean;
  provider: string;
  journalId?: string;
  error?: string;
}

export interface OdooIdCache {
  accountIds: Record<string, number>;
  partnerIds: Record<string, number>;
  journalIds: Record<string, number>;
  analyticAccountIds: Record<string, number>;
}

export interface AccountingSettings {
  targetSystem: "odoo" | "xero" | "manual";
  exportMode: "manual_journal" | "bill" | "ap_invoice";
  odoo?: OdooConfig;
  xero?: XeroConfig;
  defaultSalaryExpenseAccount: string;
  defaultPayableAccount: string;
  journalHints?: Record<string, number>;
}

export interface BankFileRow {
  employeeName: string;
  bankName: string;
  bankAccountNumber: string;
  amount: number;
}

export interface BankFileResult {
  bankName: string;
  filename: string;
  csvContent: string;
  totalAmount: number;
  rowCount: number;
}

export const APP_NAME = "Netpay PH";
export const DEFAULT_TIMEZONE = "Asia/Manila";
export const DEFAULT_WORKING_DAYS_PER_YEAR = 261;

export const OTHER_BENEFITS_EXEMPT_YTD = 90_000;
export const DEMINIMIS_EXEMPT_ANNUAL = 90_000;

export const PAY_FREQUENCIES = ["Semi-Monthly", "Monthly", "Special"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAYROLL_CODES = {
  SEMI_A: "A",
  SEMI_B: "B",
  MONTHLY: "MONTHLY",
  SPECIAL: "SPECIAL",
} as const;

export const COMPONENT_CATEGORIES = [
  "Basic Pay Related",
  "Taxable Earning",
  "Non-Taxable Earning",
  "Non-Taxable Earning - De Minimis",
  "Non-Taxable Earning - Other",
  "13th Month Pay and Other Benefits",
  "Deduction",
  "Addition",
] as const;

export const SYSTEM_COMPONENT_NAMES = new Set([
  "SSS EE MC",
  "SSS EE MPF",
  "PhilHealth EE",
  "Pag-IBIG EE",
  "SSS ER MC",
  "SSS ER MPF",
  "SSS EC",
  "PhilHealth ER",
  "Pag-IBIG ER",
  "Withholding Tax",
  "Gross Pay",
  "Taxable Income",
  "Net Pay",
]);

export const GCP_REGION =
  process.env.GCP_REGION || "asia-southeast1";

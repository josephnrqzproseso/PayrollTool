/**
 * Rate lookup — faithful port of refreshRateLookup / _loadRateLookup_ / getOtMultiplier_.
 *
 * Preserves:
 * - PAY BASIS (DAILY vs MONTHLY) rate conversion
 * - Configurable OT multipliers from OT_RATES configuration
 * - Custom rounding (roundHalfUp with EPSILON)
 * - Negative sign for absence/tardiness amounts
 * - Working days per year configuration
 */

import { roundHalfUp } from "../payroll-engine/helpers";
import type { RateLookupEntry, OtRateConfig } from "./types";

const DEFAULT_WORKING_DAYS = 261;
const HOURS_PER_DAY = 8;
const MINUTES_PER_HOUR = 60;

/**
 * Default OT rate multipliers matching the old OT_RATES sheet.
 */
const DEFAULT_OT_RATES: OtRateConfig[] = [
  { name: "Regular OT", multiplier: 1.25 },
  { name: "Night Differential", multiplier: 0.10 },
  { name: "Rest Day OT", multiplier: 1.30 },
  { name: "Special Holiday OT", multiplier: 1.30 },
  { name: "Regular Holiday OT", multiplier: 2.00 },
  { name: "Rest Day + Special Holiday OT", multiplier: 1.50 },
  { name: "Rest Day + Regular Holiday OT", multiplier: 2.60 },
];

/**
 * Compute rate lookup from employee masterfile data.
 * Handles PAY BASIS: DAILY vs MONTHLY conversion.
 */
export function computeRateLookup(
  empId: string,
  empName: string,
  basicPay: number,
  payBasis: string,
  workingDaysPerYear?: number
): RateLookupEntry {
  const wdpy = workingDaysPerYear || DEFAULT_WORKING_DAYS;
  const isDaily = payBasis.toUpperCase() === "DAILY";

  let dailyRate: number;
  let monthlyRate: number;

  if (isDaily) {
    dailyRate = basicPay;
    monthlyRate = roundHalfUp(basicPay * (wdpy / 12));
  } else {
    monthlyRate = basicPay;
    dailyRate = roundHalfUp((basicPay * 12) / wdpy);
  }

  const hourlyRate = roundHalfUp(dailyRate / HOURS_PER_DAY);
  const minuteRate = roundHalfUp(hourlyRate / MINUTES_PER_HOUR);

  return {
    empId,
    empName,
    basicPay,
    payBasis,
    workingDaysPerYear: wdpy,
    monthlyRate,
    dailyRate,
    hourlyRate,
    minuteRate,
  };
}

/**
 * Get OT multiplier from configured rates or defaults.
 * Faithful port of getOtMultiplier_ from AdjustmentLogic.txt.
 */
export function getOtMultiplier(
  otTypeName: string,
  configuredRates?: OtRateConfig[]
): number {
  const rates = configuredRates && configuredRates.length > 0 ? configuredRates : DEFAULT_OT_RATES;
  const upper = otTypeName.toUpperCase().trim();

  for (const rate of rates) {
    if (rate.name.toUpperCase().trim() === upper) {
      return rate.multiplier;
    }
  }

  if (/REGULAR\s*OT|REG\s*OT/i.test(upper)) return 1.25;
  if (/NIGHT\s*DIFF/i.test(upper)) return 0.10;
  if (/REST\s*DAY.*REGULAR\s*HOLIDAY/i.test(upper)) return 2.60;
  if (/REST\s*DAY.*SPECIAL/i.test(upper)) return 1.50;
  if (/REST\s*DAY/i.test(upper)) return 1.30;
  if (/REGULAR\s*HOLIDAY/i.test(upper)) return 2.00;
  if (/SPECIAL\s*HOLIDAY/i.test(upper)) return 1.30;

  return 1.25;
}

/**
 * Compute overtime pay with configurable multiplier.
 * Amount = Rate × Hours × Multiplier
 */
export function computeOvertimePay(
  hourlyRate: number,
  hours: number,
  otTypeName?: string,
  configuredRates?: OtRateConfig[]
): number {
  const multiplier = otTypeName ? getOtMultiplier(otTypeName, configuredRates) : 1.25;
  return roundHalfUp(hourlyRate * multiplier * hours);
}

/**
 * Compute absence deduction. Returns NEGATIVE amount (deduction).
 * Faithful port: Amount = -1 × Units × Daily Rate
 */
export function computeAbsenceDeduction(
  dailyRate: number,
  daysAbsent: number
): number {
  return -roundHalfUp(dailyRate * daysAbsent);
}

/**
 * Compute tardiness deduction. Returns NEGATIVE amount (deduction).
 * Uses minute rate for tardiness.
 * Faithful port: Amount = -1 × Minutes × Minute Rate
 */
export function computeLateDeduction(
  minuteRate: number,
  minutesLate: number
): number {
  return -roundHalfUp(minuteRate * minutesLate);
}

/**
 * Compute night differential pay.
 * ND Rate defaults to 10% of hourly rate.
 */
export function computeNightDifferential(
  hourlyRate: number,
  nightHours: number,
  ndRate = 0.1
): number {
  return roundHalfUp(hourlyRate * ndRate * nightHours);
}

/**
 * Compute holiday pay.
 */
export function computeHolidayPay(
  dailyRate: number,
  regularHolidays: number,
  specialHolidays: number,
  regularMultiplier = 2.0,
  specialMultiplier = 1.3
): number {
  const regular = dailyRate * regularMultiplier * regularHolidays;
  const special = dailyRate * specialMultiplier * specialHolidays;
  return roundHalfUp(regular + special);
}

/**
 * Compute rest day pay.
 */
export function computeRestDayPay(
  dailyRate: number,
  restDaysWorked: number,
  multiplier = 1.3
): number {
  return roundHalfUp(dailyRate * multiplier * restDaysWorked);
}

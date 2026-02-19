/**
 * Statutory contribution computation — faithful port of PayrollGenerator.txt
 * _computeStatutoryForPeriod_ equivalent.
 *
 * Preserves:
 * - SSS table lookup, PhilHealth %, Pag-IBIG fixed rate logic
 * - Daily pay basis + semi-monthly Part A: SSS/PhilHealth taken in full, Pag-IBIG split with min 100
 * - Part B refund logic: allows negative due when Part A overdeducted
 * - Legacy SSS total allocation (SSS EE/ER → MC first, then MPF)
 */

import { r2, n } from "./helpers";
import type { SssBracket, StatutoryResult, PayrollConfig } from "./types";

interface StatutoryParams {
  baseMonthlySSSPI: number;
  baseMonthlyPH: number;
  sssTable: SssBracket[];
  isFullPeriod: boolean;
  priorTaken: Record<string, number>;
  partLabel: string;
  empId: string;
  periodLabel: string;
  cfg: PayrollConfig;
  isDailyPayBasis: boolean;
  getModeFor: (component: string) => string;
}

function lookupSss(monthlyBase: number, table: SssBracket[]) {
  const base = Math.max(0, monthlyBase);
  for (const row of table) {
    if (base >= row.compensationMin && base <= row.compensationMax) {
      return {
        eeMc: row.eeMc,
        eeMpf: row.eeMpf,
        erMc: row.erMc,
        erMpf: row.erMpf,
        ec: row.ec,
      };
    }
  }
  if (table.length > 0) {
    const last = table[table.length - 1];
    return { eeMc: last.eeMc, eeMpf: last.eeMpf, erMc: last.erMc, erMpf: last.erMpf, ec: last.ec };
  }
  return { eeMc: 0, eeMpf: 0, erMc: 0, erMpf: 0, ec: 0 };
}

function computePhilHealth(monthlyBase: number, cfg: PayrollConfig): { ee: number; er: number } {
  const rate = cfg.PH_RATE || 0.05;
  const minBase = cfg.PH_MIN_BASE || 10000;
  const maxBase = cfg.PH_MAX_BASE || 100000;

  const clampedBase = Math.min(Math.max(monthlyBase, minBase), maxBase);
  const totalPremium = r2(clampedBase * rate);
  const ee = r2(totalPremium / 2);
  const er = r2(totalPremium - ee);
  return { ee, er };
}

function computePagibig(monthlyBase: number, cfg: PayrollConfig): { ee: number; er: number } {
  const eeRate = cfg.PAGIBIG_EE_RATE || 0.02;
  const erRate = cfg.PAGIBIG_ER_RATE || 0.02;
  const maxBase = cfg.PAGIBIG_MAX_BASE || 10000;

  const base = Math.min(monthlyBase, maxBase);
  return {
    ee: r2(base * eeRate),
    er: r2(base * erRate),
  };
}

/**
 * Allocate legacy SSS totals into MC/MPF components.
 * If history only has SSS EE/ER totals, allocates to MC first, then remaining to MPF.
 */
export function allocateLegacySssTotals(
  priorTaken: Record<string, number>,
  sssTable: SssBracket[],
  monthlyBase: number
): Record<string, number> {
  const result = { ...priorTaken };
  const sss = lookupSss(monthlyBase, sssTable);

  const hasTotal = priorTaken["SSS EE"] !== undefined && priorTaken["SSS EE MC"] === undefined;
  if (hasTotal) {
    const totalEe = Math.abs(n(priorTaken["SSS EE"]));
    result["SSS EE MC"] = Math.min(totalEe, sss.eeMc);
    result["SSS EE MPF"] = Math.max(0, totalEe - sss.eeMc);
  }

  const hasErTotal = priorTaken["SSS ER"] !== undefined && priorTaken["SSS ER MC"] === undefined;
  if (hasErTotal) {
    const totalEr = Math.abs(n(priorTaken["SSS ER"]));
    result["SSS ER MC"] = Math.min(totalEr, sss.erMc);
    result["SSS ER MPF"] = Math.max(0, totalEr - sss.erMc);
  }

  return result;
}

export function computeStatutoryForPeriod(params: StatutoryParams): StatutoryResult {
  const {
    baseMonthlySSSPI,
    baseMonthlyPH,
    sssTable,
    priorTaken: rawPriorTaken,
    partLabel,
    cfg,
    isDailyPayBasis,
  } = params;

  const priorTaken = allocateLegacySssTotals(rawPriorTaken, sssTable, baseMonthlySSSPI);

  const sss = lookupSss(baseMonthlySSSPI, sssTable);
  const ph = computePhilHealth(baseMonthlyPH, cfg);
  const pi = computePagibig(baseMonthlySSSPI, cfg);

  const isSemiB = partLabel === "B";
  const isSemiA = partLabel === "A";
  const isMonthly = partLabel === "M" || partLabel === "MONTHLY";

  let sssEeMc: number, sssEeMpf: number, sssErMc: number, sssErMpf: number, sssEc: number;
  let phEe: number, phEr: number;
  let piEe: number, piEr: number;

  if (isMonthly) {
    sssEeMc = sss.eeMc;
    sssEeMpf = sss.eeMpf;
    sssErMc = sss.erMc;
    sssErMpf = sss.erMpf;
    sssEc = sss.ec;
    phEe = ph.ee;
    phEr = ph.er;
    piEe = pi.ee;
    piEr = pi.er;
  } else if (isSemiB) {
    // Semi B: Full monthly minus what was taken in A — allows refunds (negative)
    const priorSssEeMc = Math.abs(n(priorTaken["SSS EE MC"]));
    const priorSssEeMpf = Math.abs(n(priorTaken["SSS EE MPF"]));
    const priorPhEe = Math.abs(n(priorTaken["PhilHealth EE"]));
    const priorPiEe = Math.abs(n(priorTaken["Pag-IBIG EE"]));

    sssEeMc = r2(sss.eeMc - priorSssEeMc);
    sssEeMpf = r2(sss.eeMpf - priorSssEeMpf);
    sssErMc = sss.erMc;
    sssErMpf = sss.erMpf;
    sssEc = sss.ec;
    phEe = r2(ph.ee - priorPhEe);
    phEr = ph.er;
    piEe = r2(pi.ee - priorPiEe);
    piEr = pi.er;
  } else if (isSemiA) {
    if (isDailyPayBasis) {
      // Daily pay basis + semi A: take SSS and PhilHealth in full, Pag-IBIG stays split
      sssEeMc = sss.eeMc;
      sssEeMpf = sss.eeMpf;
      sssErMc = sss.erMc;
      sssErMpf = sss.erMpf;
      sssEc = sss.ec;
      phEe = ph.ee;
      phEr = ph.er;
      piEe = r2(pi.ee / 2);
      piEr = 0;
      // Min Pag-IBIG monthly cap for daily basis
      const piMonthly = r2(piEe * 2);
      if (piMonthly < 100) {
        piEe = r2(100 / 2);
      }
    } else {
      // Standard semi A: half of monthly
      sssEeMc = r2(sss.eeMc / 2);
      sssEeMpf = r2(sss.eeMpf / 2);
      sssErMc = 0;
      sssErMpf = 0;
      sssEc = 0;
      phEe = r2(ph.ee / 2);
      phEr = 0;
      piEe = r2(pi.ee / 2);
      piEr = 0;
    }
  } else {
    // SPECIAL or unknown: half
    sssEeMc = r2(sss.eeMc / 2);
    sssEeMpf = r2(sss.eeMpf / 2);
    sssErMc = 0;
    sssErMpf = 0;
    sssEc = 0;
    phEe = r2(ph.ee / 2);
    phEr = 0;
    piEe = r2(pi.ee / 2);
    piEr = 0;
  }

  return {
    sssEeMc: r2(sssEeMc),
    sssEeMpf: r2(sssEeMpf),
    sssErMc: r2(sssErMc),
    sssErMpf: r2(sssErMpf),
    sssEc: r2(sssEc),
    phEe: r2(phEe),
    phEr: r2(phEr),
    piEe: r2(piEe),
    piEr: r2(piEr),
  };
}

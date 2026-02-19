import { prisma } from "@/lib/db";

export interface ResolvedStatutoryVersion {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * Resolves the published statutory version that covers the given payroll date.
 * Falls back to tenant-scoped legacy tables if no global version exists.
 */
export async function resolveStatutoryVersion(
  payrollDate: Date,
  country = "PH"
): Promise<ResolvedStatutoryVersion | null> {
  const version = await prisma.statutoryVersion.findFirst({
    where: {
      country,
      status: "PUBLISHED",
      effectiveFrom: { lte: payrollDate },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: payrollDate } },
      ],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!version) return null;

  return {
    id: version.id,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
  };
}

export async function loadGlobalBirTable(statutoryVersionId: string) {
  const rows = await prisma.birTableGlobal.findMany({
    where: { statutoryVersionId },
    orderBy: { exMonth: "asc" },
  });

  const toInfinity = (v: number) => (v >= 9e11 ? Infinity : v);

  return rows.map((r) => ({
    exSemi: r.exSemi,
    maxSemi: toInfinity(r.maxSemi),
    fixedSemi: r.fixedSemi,
    rateSemi: r.rateSemi,

    exMonth: r.exMonth,
    maxMonth: toInfinity(r.maxMonth),
    fixedMonth: r.fixedMonth,
    rateMonth: r.rateMonth,

    exAnnual: r.exAnnual,
    maxAnnual: toInfinity(r.maxAnnual),
    fixedAnnual: r.fixedAnnual,
    rateAnnual: r.rateAnnual,
  }));
}

export async function loadGlobalSssTable(statutoryVersionId: string) {
  const rows = await prisma.sssTableGlobal.findMany({
    where: { statutoryVersionId },
    orderBy: { compensationMin: "asc" },
  });

  return rows.map((r) => ({
    compensationMin: r.compensationMin,
    compensationMax: r.compensationMax,
    eeMc: r.eeMc,
    eeMpf: r.eeMpf,
    erMc: r.erMc,
    erMpf: r.erMpf,
    ec: r.ec,
  }));
}

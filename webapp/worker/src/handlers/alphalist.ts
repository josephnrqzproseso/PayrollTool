import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleAlphalist(
  jobId: string,
  tenantId: string,
  year: number
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const { generateAndStoreAlphalist } = await import("@/services/providers/document-provider");
    const { computeFinalAnnualization } = await import("@/services/annualization/final-annualization");
    const { resolveStatutoryVersion, loadGlobalBirTable } = await import("@/services/statutory/version-resolver");
    const { loadAnnualizationData } = await import("@/services/providers/annualization-data-loader");

    const asOf = new Date(Number(year), 11, 31);
    const ver = await resolveStatutoryVersion(asOf);
    if (!ver) throw new Error("No PUBLISHED global statutory version covers this year. Publish one first.");
    const birTable = await loadGlobalBirTable(ver.id);

    const bundle = await loadAnnualizationData(tenantId, year);

    const annResults = bundle.employees.map((emp) => {
      const hist = bundle.perEmployee.get(emp.employeeId) || { historyRows: [], historyHeaders: [] };
      return computeFinalAnnualization({
        empId: emp.employeeId,
        empName: emp.employeeName,
        group: emp.payrollGroup,
        trackingCategory1: emp.trackingCategory1,
        trackingCategory2: emp.trackingCategory2,
        isMwe: emp.isMwe,
        historyRows: hist.historyRows,
        historyHeaders: hist.historyHeaders,
        componentMap: bundle.componentMap,
        prevEmployer: null,
        birTable,
      });
    });

    const empMeta = new Map(
      bundle.employees.map((e) => [
        e.employeeId,
        {
          lastName: e.lastName,
          firstName: e.firstName,
          middleName: e.middleName,
          tin: e.tin,
          birthday: e.birthday,
          address: e.address,
          zipCode: e.zipCode,
          dateHired: e.dateHired,
          dateSeparated: e.dateSeparated,
          dateRegularized: null as Date | null,
          status: e.status,
          payBasis: e.payBasis,
          basicPay: e.basicPay,
          workingDaysPerYear: e.workingDaysPerYear,
          nationality: e.nationality,
          isMwe: e.isMwe,
          hasPrevEmployer: e.hasPrevEmployer,
        },
      ])
    );

    const cp = bundle.companyProfile;
    const url = await generateAndStoreAlphalist(tenantId, year, annResults, empMeta, cp.tin);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", progress: 100, message: "Alphalist 1604-C generated", result: { url }, finishedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", message, finishedAt: new Date() },
    });
    throw err;
  }
}

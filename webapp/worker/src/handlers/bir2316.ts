import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function handleBir2316(
  jobId: string,
  tenantId: string,
  year: number
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const { generateAndStoreBir2316 } = await import("@/services/providers/document-provider");
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

    const empDetails = new Map(
      bundle.employees.map((e) => [
        e.employeeId,
        {
          tin: e.tin,
          lastName: e.lastName,
          firstName: e.firstName,
          middleName: e.middleName,
          birthday: e.birthday,
          address: e.address,
          zipCode: e.zipCode,
          dateHired: e.dateHired,
          dateSeparated: e.dateSeparated,
          payBasis: e.payBasis,
          basicPay: e.basicPay,
          workingDaysPerYear: e.workingDaysPerYear,
          nationality: e.nationality,
          isMwe: e.isMwe,
        },
      ])
    );

    const cp = bundle.companyProfile;
    const url = await generateAndStoreBir2316(tenantId, year, annResults, empDetails, {
      tin: cp.tin,
      name: cp.registeredName,
      address: cp.registeredAddress1,
      zipCode: cp.zipCode,
      authorizedRep: cp.authorizedRep,
      authorizedRepTin: cp.authorizedRepTin,
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", progress: 100, message: "BIR 2316 generated", result: { url }, finishedAt: new Date() },
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

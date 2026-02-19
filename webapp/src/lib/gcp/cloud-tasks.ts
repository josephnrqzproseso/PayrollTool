/**
 * Cloud Tasks client — enqueues background jobs for the payroll worker.
 */

import "server-only";
import { CloudTasksClient } from "@google-cloud/tasks";
import { prisma } from "@/lib/db";
import { executePayrollRun } from "@/services/providers/computation-engine";
import { postPayrollRun } from "@/services/providers/posting-provider";

const client = new CloudTasksClient();

const PROJECT_ID = process.env.GCP_PROJECT_ID || "";
const LOCATION = process.env.CLOUD_TASKS_LOCATION || "asia-southeast1";
const QUEUE = process.env.CLOUD_TASKS_QUEUE || "payroll-jobs";
const WORKER_URL = process.env.WORKER_SERVICE_URL || "http://localhost:8081";

function isLocalWorkerUrl(url: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

async function runInlineJob(jobId: string, taskType: string, fullPayload: Record<string, unknown>) {
  const tenantId = String(fullPayload.tenantId || "");
  if (!tenantId) throw new Error(`Missing tenantId for inline job ${jobId} (${taskType})`);

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    switch (taskType) {
      case "payroll.generate": {
        const payrollRunId = String(fullPayload.payrollRunId || "");
        if (!payrollRunId) throw new Error(`Missing payrollRunId for inline payroll.generate job ${jobId}`);

        const onProgress = async (percent: number, message: string) => {
          await prisma.job.update({
            where: { id: jobId },
            data: { progress: percent, message },
          });
        };

        const result = await executePayrollRun(payrollRunId, tenantId, onProgress);

        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            message: `Computed ${result.totalEmployees} employees, Net Pay: ${result.totalNetPay}`,
            result: {
              totalEmployees: result.totalEmployees,
              totalGrossPay: result.totalGrossPay,
              totalNetPay: result.totalNetPay,
            },
            finishedAt: new Date(),
          },
        });
        return;
      }

      case "payroll.postAccounting": {
        const payrollRunId = String(fullPayload.payrollRunId || "");
        if (!payrollRunId) throw new Error(`Missing payrollRunId for inline payroll.postAccounting job ${jobId}`);

        const result = await postPayrollRun(tenantId, payrollRunId);

        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: result.success ? "COMPLETED" : "FAILED",
            progress: 100,
            message: result.success ? `Posted to ${result.provider} (${result.journalId})` : `Failed: ${result.error}`,
            result: result as never,
            finishedAt: new Date(),
          },
        });
        return;
      }

      case "payslips.generate": {
        const payrollRunId = String(fullPayload.payrollRunId || "");
        if (!payrollRunId) throw new Error(`Missing payrollRunId for inline payslips.generate job ${jobId}`);

        const { generateAndStorePayslips } = await import("@/services/providers/document-provider");
        const { buildComponentMapFromTypes } = await import("@/services/payroll-engine/component-map");

        const run = await prisma.payrollRun.findUniqueOrThrow({
          where: { id: payrollRunId },
          include: { rows: true },
        });

        const [adjTypes, employees, profile] = await Promise.all([
          prisma.adjustmentType.findMany({ where: { tenantId } }),
          prisma.employee.findMany({ where: { tenantId } }),
          prisma.companyProfile.findUnique({ where: { tenantId } }),
        ]);

        const componentMap = buildComponentMapFromTypes(adjTypes);

        const empDetailsMap = new Map(
          employees.map((e) => [
            e.employeeId,
            {
              position: e.position,
              department: e.trackingCategory1,
              bankName: e.bankName,
              bankAccountNumber: e.bankAccountNumber,
            },
          ])
        );

        const rows = run.rows.map((r) => r.componentValues as Record<string, number | string>);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

        const template = ((profile as Record<string, unknown>)?.payslipTemplate as string) || "";

        const urls = await generateAndStorePayslips({
          tenantId,
          payrollRunId,
          rows,
          headers,
          componentMap,
          employeeDetailsMap: empDetailsMap,
          template: template || undefined,
          periodLabel: run.periodLabel,
        });

        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            message: `Generated ${urls.length} payslips${template ? " (with template)" : ""}`,
            result: { count: urls.length, urls: urls.slice(0, 5) },
            finishedAt: new Date(),
          },
        });
        return;
      }

      case "reports.bir2316": {
        const year = Number(fullPayload.year || 0);
        if (!year) throw new Error(`Missing year for inline reports.bir2316 job ${jobId}`);

        const { generateAndStoreBir2316 } = await import("@/services/providers/document-provider");
        const { computeFinalAnnualization } = await import("@/services/annualization/final-annualization");
        const { resolveStatutoryVersion, loadGlobalBirTable } = await import("@/services/statutory/version-resolver");
        const { loadAnnualizationData } = await import("@/services/providers/annualization-data-loader");

        const asOf = new Date(year, 11, 31);
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
          data: {
            status: "COMPLETED",
            progress: 100,
            message: "BIR 2316 generated",
            result: { url },
            finishedAt: new Date(),
          },
        });
        return;
      }

      case "reports.alphalist": {
        const year = Number(fullPayload.year || 0);
        if (!year) throw new Error(`Missing year for inline reports.alphalist job ${jobId}`);

        const { generateAndStoreAlphalist } = await import("@/services/providers/document-provider");
        const { computeFinalAnnualization } = await import("@/services/annualization/final-annualization");
        const { resolveStatutoryVersion, loadGlobalBirTable } = await import("@/services/statutory/version-resolver");
        const { loadAnnualizationData } = await import("@/services/providers/annualization-data-loader");

        const asOf = new Date(year, 11, 31);
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
          data: {
            status: "COMPLETED",
            progress: 100,
            message: "Alphalist 1604-C generated",
            result: { url },
            finishedAt: new Date(),
          },
        });
        return;
      }

      case "reports.preAnnualization": {
        const year = Number(fullPayload.year || 0);
        const month = Number(fullPayload.month || 0);
        if (!year || !month) throw new Error(`Missing year/month for inline reports.preAnnualization job ${jobId}`);

        const { computePreAnnualization } = await import("@/services/annualization/pre-annualization");
        const { loadAnnualizationData } = await import("@/services/providers/annualization-data-loader");
        const { resolveStatutoryVersion, loadGlobalBirTable } = await import("@/services/statutory/version-resolver");
        const { uploadFile, getSignedUrl } = await import("@/lib/gcp/cloud-storage");
        const { normHdr } = await import("@/services/payroll-engine/helpers");

        const asOf = new Date(year, 11, 31);
        const ver = await resolveStatutoryVersion(asOf);
        if (!ver) throw new Error("No PUBLISHED global statutory version covers this year.");
        const birTable = await loadGlobalBirTable(ver.id);

        const bundle = await loadAnnualizationData(tenantId, year);
        const profile = await prisma.companyProfile.findUnique({ where: { tenantId } });

        const facts = new Map<string, import("@/services/annualization/types").PreAnnFacts>();
        const employeeMeta = new Map<string, {
          name: string; group: string; trackingCategory1: string; trackingCategory2: string;
          contractType: string; status: string; isMwe: boolean;
        }>();

        for (const emp of bundle.employees) {
          employeeMeta.set(emp.employeeId, {
            name: emp.employeeName,
            group: emp.payrollGroup,
            trackingCategory1: emp.trackingCategory1,
            trackingCategory2: emp.trackingCategory2,
            contractType: emp.contractType,
            status: emp.status,
            isMwe: emp.isMwe,
          });

          const hist = bundle.perEmployee.get(emp.employeeId);
          if (!hist || hist.historyRows.length === 0) continue;

          const fact: import("@/services/annualization/types").PreAnnFacts = {
            empId: emp.employeeId, empName: emp.employeeName,
            ytdBasic: 0, ytdTaxable: 0, ytd13thOther: 0, ytdDeminimis: 0, ytdNonTaxOther: 0,
            ytdSssEeMc: 0, ytdSssEeMpf: 0, ytdPhEe: 0, ytdPiEe: 0, ytdWtax: 0, wtaxThisMonth: 0,
            monthsEmployedSet: {}, normalCutoffsCount: 0,
            countA: 0, countB: 0, countM: 0,
            isMwe: emp.isMwe, ytdOvertime: 0,
            ytdRecurringTaxable: 0, ytdRecurringNonTaxable: 0, ytdRecurring13th: 0,
            cutoffsThisMonth: 0, hasA: false, hasB: false, hasM: false,
          };

          for (const row of hist.historyRows) {
            const periodKey = String(row["Period Key"] || row["PERIOD_KEY"] || "");
            const partLabel = String(row["Part Label"] || row["PART_LABEL"] || "");

            const rowMonth = periodKey ? parseInt(periodKey.split("-")[1] || "0", 10) : 0;
            if (rowMonth > 0 && rowMonth <= month) {
              fact.monthsEmployedSet[rowMonth] = true;
            }
            if (rowMonth > month) continue;

            fact.normalCutoffsCount++;
            if (/\bA$/i.test(partLabel)) { fact.countA++; if (rowMonth === month) { fact.hasA = true; fact.cutoffsThisMonth++; } }
            else if (/\bB$/i.test(partLabel)) { fact.countB++; if (rowMonth === month) { fact.hasB = true; fact.cutoffsThisMonth++; } }
            else { fact.countM++; if (rowMonth === month) { fact.hasM = true; fact.cutoffsThisMonth++; } }

            for (const [hdr, val] of Object.entries(row)) {
              const n = Number(val) || 0;
              if (n === 0) continue;
              const h = normHdr(hdr);
              if (h === "BASIC PAY") fact.ytdBasic += n;
              else if (h === "WITHHOLDING TAX") { fact.ytdWtax += Math.abs(n); if (rowMonth === month) fact.wtaxThisMonth += Math.abs(n); }
              else if (h === "SSS EE MC") fact.ytdSssEeMc += Math.abs(n);
              else if (h === "SSS EE MPF") fact.ytdSssEeMpf += Math.abs(n);
              else if (h === "PHILHEALTH EE") fact.ytdPhEe += Math.abs(n);
              else if (/PAG-?IBIG EE|HDMF EE/i.test(h)) fact.ytdPiEe += Math.abs(n);
              else if (h === "TAXABLE INCOME") fact.ytdTaxable += n;
              else if (/13TH|OTHER BENEFIT/i.test(hdr)) fact.ytd13thOther += n;
              else if (/DE\s*MINIMIS/i.test(hdr)) fact.ytdDeminimis += n;
            }
          }

          facts.set(emp.employeeId, fact);
        }

        const results = computePreAnnualization({
          facts,
          employeeMeta,
          birTable,
          year,
          monthIndex: month,
          globalFrequency: profile?.payFrequency || "Semi-Monthly",
        });

        const jsonContent = JSON.stringify({ year, month, generated: new Date().toISOString(), results }, null, 2);
        const fileName = `${tenantId}/${year}/pre-annualization-${month}.json`;

        await uploadFile(process.env.GCS_BUCKET_REPORTS || "", fileName, Buffer.from(jsonContent), "application/json");
        const url = await getSignedUrl(process.env.GCS_BUCKET_REPORTS || "", fileName);

        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            progress: 100,
            message: `Pre-Annualization generated for ${results.length} employees`,
            result: { url, count: results.length },
            finishedAt: new Date(),
          },
        });
        return;
      }

      default:
        throw new Error(`Inline execution not implemented for task type: ${taskType}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", message, finishedAt: new Date() },
    });

    if (taskType === "payroll.generate") {
      const payrollRunId = String(fullPayload.payrollRunId || "");
      if (payrollRunId) {
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: { status: "DRAFT" },
        });
      }
    }

    throw err;
  }
}

function getQueuePath() {
  return client.queuePath(PROJECT_ID, LOCATION, QUEUE);
}

export async function enqueueJob(
  jobId: string,
  taskType: string,
  payload: Record<string, unknown>
): Promise<string> {
  const bodyJson = JSON.stringify({ jobId, taskType, ...payload });
  const fullPayload = { jobId, taskType, ...payload };
  const workerExecuteUrl = `${WORKER_URL}/api/worker/execute`;

  // Local/dev convenience: Cloud Tasks can't call your machine's localhost, so dispatch directly.
  if (isLocalWorkerUrl(WORKER_URL)) {
    // Use async mode so the API request can return immediately while the worker computes.
    void fetch(`${workerExecuteUrl}?async=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyJson,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Worker responded ${res.status} ${res.statusText}`);
      })
      .catch((err) => {
        console.error("[LocalWorkerDispatch] failed:", err);
        console.log("[LocalWorkerDispatch] falling back to inline execution");
        void runInlineJob(jobId, taskType, fullPayload).catch((inlineErr) =>
          console.error("[InlineFallback] failed:", inlineErr)
        );
      });

    return `local-dispatch-${jobId}`;
  }

  // When not configured for GCP, run inline so dev still works.
  if (!PROJECT_ID) {
    void runInlineJob(jobId, taskType, fullPayload).catch((err) =>
      console.error("[InlineExecution] failed:", err)
    );
    return `inline-${jobId}`;
  }

  const url = workerExecuteUrl;

  const httpRequest: {
    httpMethod: "POST";
    url: string;
    headers: Record<string, string>;
    body: Buffer;
    oidcToken?: { serviceAccountEmail: string };
  } = {
    httpMethod: "POST",
    url,
    headers: { "Content-Type": "application/json" },
    body: Buffer.from(bodyJson),
  };

  // Cloud Tasks requires HTTPS if you set an Authorization header (OIDC/OAuth).
  if (url.startsWith("https://")) {
    httpRequest.oidcToken = {
      serviceAccountEmail:
        process.env.CLOUD_TASKS_OIDC_EMAIL || `${PROJECT_ID}@appspot.gserviceaccount.com`,
    };
  } else if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) {
    throw new Error(
      `WORKER_SERVICE_URL must start with "https://" when using Cloud Tasks with OIDC auth. Got: ${WORKER_URL}`
    );
  }

  const [response] = await client.createTask({
    parent: getQueuePath(),
    task: {
      httpRequest,
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + 1,
      },
    },
  });

  return response.name || "";
}

export async function enqueuePayrollGeneration(
  jobId: string,
  payrollRunId: string,
  tenantId: string
) {
  return enqueueJob(jobId, "payroll.generate", { payrollRunId, tenantId });
}

export async function enqueueAccountingPosting(
  jobId: string,
  payrollRunId: string,
  tenantId: string
) {
  return enqueueJob(jobId, "payroll.postAccounting", { payrollRunId, tenantId });
}

export async function enqueueReportGeneration(
  jobId: string,
  reportType: string,
  tenantId: string,
  params: Record<string, unknown>
) {
  return enqueueJob(jobId, `reports.${reportType}`, { tenantId, ...params });
}

export async function enqueuePayslipGeneration(
  jobId: string,
  payrollRunId: string,
  tenantId: string
) {
  return enqueueJob(jobId, "payslips.generate", { payrollRunId, tenantId });
}

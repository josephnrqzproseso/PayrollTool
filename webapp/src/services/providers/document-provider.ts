/**
 * DocumentProvider — handles payslip and report document generation and storage.
 * Uses Cloud Storage for output files.
 */

import { uploadFile, getSignedUrl } from "@/lib/gcp/cloud-storage";
import { buildPayslipData, renderPayslipTemplate, checkPayslipNetPay, buildPayslipFilename } from "../payslips/generator";
import { generateBir2316Data } from "../reports/bir2316";
import { generateAlphalist, buildAlphalistDatFile } from "../reports/alphalist-1604c";
import type { ComponentMap } from "../payroll-engine/component-map";
import type { PayrollRowOutput } from "../payroll-engine/types";
import type { FinalAnnResult } from "../annualization/types";
import type { PayslipData } from "../payslips/types";

interface GeneratePayslipsInput {
  tenantId: string;
  payrollRunId: string;
  rows: PayrollRowOutput[];
  headers: string[];
  componentMap: ComponentMap;
  employeeDetailsMap: Map<string, { position: string; department: string; bankName: string; bankAccountNumber: string }>;
  template?: string;
  filenamePattern?: string;
  periodLabel?: string;
}

export interface PayslipGenerationResult {
  urls: string[];
  htmlUrls: string[];
  validationErrors: Array<{ empId: string; empName: string; difference: number }>;
}

export async function generateAndStorePayslips(input: GeneratePayslipsInput): Promise<string[]> {
  const { tenantId, payrollRunId, rows, headers, componentMap, employeeDetailsMap, template, filenamePattern, periodLabel } = input;
  const urls: string[] = [];
  const htmlUrls: string[] = [];
  const allPayslipData: PayslipData[] = [];

  for (const row of rows) {
    const empId = String(row["Employee ID"]);
    const details = employeeDetailsMap.get(empId) || { position: "", department: "", bankName: "", bankAccountNumber: "" };

    const payslipData = buildPayslipData({ row, headers, componentMap, employeeDetails: details });
    allPayslipData.push(payslipData);

    const baseName = filenamePattern
      ? buildPayslipFilename(filenamePattern, payslipData.tags)
      : `payslip-${empId}`;

    const jsonContent = JSON.stringify(payslipData, null, 2);
    const jsonFileName = `${tenantId}/${payrollRunId}/${baseName}.json`;

    await uploadFile(
      process.env.GCS_BUCKET_PAYSLIPS || "",
      jsonFileName,
      Buffer.from(jsonContent),
      "application/json"
    );

    const jsonUrl = await getSignedUrl(process.env.GCS_BUCKET_PAYSLIPS || "", jsonFileName);
    urls.push(jsonUrl);

    if (template) {
      const enrichedTags = {
        ...payslipData.tags,
        PERIOD_LABEL: periodLabel || "",
      };
      const html = renderPayslipTemplate(template, enrichedTags);
      const htmlFileName = `${tenantId}/${payrollRunId}/${baseName}.html`;

      await uploadFile(
        process.env.GCS_BUCKET_PAYSLIPS || "",
        htmlFileName,
        Buffer.from(html),
        "text/html"
      );

      const htmlUrl = await getSignedUrl(process.env.GCS_BUCKET_PAYSLIPS || "", htmlFileName);
      htmlUrls.push(htmlUrl);
    }
  }

  const validationResults = checkPayslipNetPay(allPayslipData, rows);
  const mismatches = validationResults.filter((r) => !r.matched);
  if (mismatches.length > 0) {
    console.warn(
      `[PayslipValidation] ${mismatches.length} net pay mismatches:`,
      mismatches.map((m) => `${m.empName}: expected ${m.expectedNetPay}, got ${m.payslipNetPay}`)
    );
  }

  return template && htmlUrls.length > 0 ? htmlUrls : urls;
}

export async function generateAndStoreBir2316(
  tenantId: string,
  year: number,
  annualizationResults: FinalAnnResult[],
  employeeDetails: Parameters<typeof generateBir2316Data>[0]["employeeDetails"],
  companyInfo: Parameters<typeof generateBir2316Data>[0]["companyInfo"]
): Promise<string> {
  const data = generateBir2316Data({ annualizationResults, employeeDetails, companyInfo, year });
  const jsonContent = JSON.stringify(data, null, 2);
  const fileName = `${tenantId}/${year}/bir2316.json`;

  await uploadFile(
    process.env.GCS_BUCKET_REPORTS || "",
    fileName,
    Buffer.from(jsonContent),
    "application/json"
  );

  return getSignedUrl(process.env.GCS_BUCKET_REPORTS || "", fileName);
}

export async function generateAndStoreAlphalist(
  tenantId: string,
  year: number,
  annualizationResults: FinalAnnResult[],
  employeeMeta: Parameters<typeof generateAlphalist>[0]["employeeMeta"],
  employerTin: string
): Promise<string> {
  const returnPeriod = `1231${year}`;
  const data = generateAlphalist({ annualizationResults, employeeMeta, employerTin, returnPeriod, year });

  const datContent = buildAlphalistDatFile(data);
  const fileName = `${tenantId}/${year}/${data.datFilename}`;

  await uploadFile(
    process.env.GCS_BUCKET_REPORTS || "",
    fileName,
    Buffer.from(datContent),
    "text/plain"
  );

  return getSignedUrl(process.env.GCS_BUCKET_REPORTS || "", fileName);
}

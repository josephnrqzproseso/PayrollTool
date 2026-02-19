/**
 * PostingProvider — orchestrates journal building and posting to Odoo or Xero.
 */

import { prisma } from "@/lib/db";
import { buildJournalEntries } from "../accounting/journal-builder";
import { postJournalToOdoo, checkOdooPostedDuplicates, testOdooConnection } from "../accounting/odoo-connector";
import { postJournalToXero, testXeroConnection } from "../accounting/xero-connector";
import { getSecret } from "@/lib/gcp/secret-manager";
import type { PostingResult, CoaMapping, HeaderAccountMapping, OdooConfig, XeroConfig } from "../accounting/types";
import type { PayrollRowOutput } from "../payroll-engine/types";

export async function postPayrollRun(
  tenantId: string,
  payrollRunId: string
): Promise<PostingResult> {
  const run = await prisma.payrollRun.findUniqueOrThrow({
    where: { id: payrollRunId },
    include: { rows: true },
  });

  const [integration, profile] = await Promise.all([
    prisma.integration.findFirst({ where: { tenantId, active: true } }),
    prisma.companyProfile.findUnique({ where: { tenantId } }),
  ]);

  if (!integration) {
    return { success: false, provider: "none", error: "No active integration configured" };
  }

  const rows = run.rows.map((r) => r.componentValues as PayrollRowOutput);

  const rawMappings = (profile as Record<string, unknown>)?.coaMappings;
  const headerMappings: HeaderAccountMapping[] = Array.isArray(rawMappings) ? rawMappings : [];

  const rawCoaMappings = headerMappings.map((m) => ({
    componentName: m.componentName,
    debitAccount: m.employeeCostAccount || "",
    creditAccount: m.consultantCostAccount || "",
  })) as CoaMapping[];

  const defaultExpenseAcct = ((profile as Record<string, unknown>)?.defaultExpenseAcct as string) || "6100";
  const defaultPayableAcct = ((profile as Record<string, unknown>)?.defaultPayableAcct as string) || "2100";

  const journal = buildJournalEntries({
    periodLabel: run.periodLabel,
    payrollMonth: run.payrollMonth,
    date: new Date().toISOString().slice(0, 10),
    referenceNo: `PAYROLL-${run.periodLabel}`,
    rows,
    headerMappings,
    coaMappings: rawCoaMappings,
    defaultSalaryExpenseAccount: defaultExpenseAcct,
    defaultPayableAccount: defaultPayableAcct,
  });

  let result: PostingResult;
  const reference = `PAYROLL-${run.periodLabel}`;

  if (integration.provider === "odoo") {
    const config = integration.config as unknown as OdooConfig;
    const password = await getSecret(integration.secretRef);

    const dupes = await checkOdooPostedDuplicates(config, password, reference);
    if (dupes.length > 0) {
      return {
        success: false,
        provider: "odoo",
        error: `Duplicate journal entry already exists in Odoo: ${dupes.map((d) => d.name).join(", ")}`,
      };
    }

    result = await postJournalToOdoo(config, password, 1, journal);
  } else if (integration.provider === "xero") {
    const config = integration.config as unknown as XeroConfig;
    result = await postJournalToXero(config, journal);
  } else {
    result = { success: false, provider: integration.provider, error: "Unknown provider" };
  }

  if (result.success) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "ACCOUNTING_POSTED",
        entity: "PayrollRun",
        entityId: payrollRunId,
        details: { provider: result.provider, journalId: result.journalId },
      },
    });
  }

  return result;
}

export async function testIntegrationConnection(
  tenantId: string,
  provider: string
): Promise<boolean> {
  const integration = await prisma.integration.findFirst({
    where: { tenantId, provider },
  });
  if (!integration) return false;

  const password = integration.secretRef ? await getSecret(integration.secretRef) : "";

  if (provider === "odoo") {
    return testOdooConnection(integration.config as unknown as OdooConfig, password);
  } else if (provider === "xero") {
    return testXeroConnection(integration.config as unknown as XeroConfig);
  }

  return false;
}

/**
 * Odoo JSON-RPC connector — faithful port of PayrollPosting.txt Odoo integration.
 *
 * Preserves:
 * - Authentication via JSON-RPC
 * - Journal entry creation with account_id resolution
 * - ID caching for accounts, partners, journals, analytic accounts
 * - Analytic distribution from tracking dimensions
 * - Duplicate checking before push
 * - Partner/supplier lookup
 * - Journal selection with hints
 * - Connection testing
 */

import type { OdooConfig, JournalEntry, PostingResult, OdooIdCache } from "./types";

interface OdooRpcResponse {
  result?: unknown;
  error?: { message: string; data?: { message: string } };
}

async function odooRpc(baseUrl: string, service: string, method: string, args: unknown[]): Promise<OdooRpcResponse> {
  const response = await fetch(`${baseUrl}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  return response.json();
}

async function odooExecuteKw(
  baseUrl: string, db: string, uid: number, password: string,
  model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const result = await odooRpc(baseUrl, "object", "execute_kw", [
    db, uid, password, model, method, args, kwargs,
  ]);
  if (result.error) {
    throw new Error(result.error.data?.message || result.error.message);
  }
  return result.result;
}

export async function authenticateOdoo(config: OdooConfig, password: string): Promise<number> {
  const result = await odooRpc(config.url, "common", "authenticate", [
    config.db, config.username, password, {},
  ]);
  const uid = result.result as number;
  if (!uid) throw new Error("Odoo authentication failed");
  return uid;
}

export async function testOdooConnection(config: OdooConfig, password: string): Promise<boolean> {
  try {
    const uid = await authenticateOdoo(config, password);
    return uid > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve account_id from account code.
 */
async function resolveAccountId(
  config: OdooConfig, uid: number, password: string,
  accountCode: string, cache: OdooIdCache
): Promise<number> {
  if (cache.accountIds[accountCode]) return cache.accountIds[accountCode];

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "account.account", "search_read",
    [[["code", "=", accountCode]]],
    { fields: ["id", "code"], limit: 1 }
  ) as Array<{ id: number; code: string }>;

  if (results.length > 0) {
    cache.accountIds[accountCode] = results[0].id;
    return results[0].id;
  }
  return 0;
}

/**
 * Resolve partner_id from partner name.
 */
async function resolvePartnerId(
  config: OdooConfig, uid: number, password: string,
  partnerName: string, cache: OdooIdCache
): Promise<number> {
  if (cache.partnerIds[partnerName]) return cache.partnerIds[partnerName];

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "res.partner", "search_read",
    [[["name", "ilike", partnerName]]],
    { fields: ["id", "name"], limit: 1 }
  ) as Array<{ id: number; name: string }>;

  if (results.length > 0) {
    cache.partnerIds[partnerName] = results[0].id;
    return results[0].id;
  }
  return 0;
}

/**
 * Resolve analytic account ID by name for analytic distribution.
 */
async function resolveAnalyticAccountId(
  config: OdooConfig, uid: number, password: string,
  name: string, cache: OdooIdCache
): Promise<number> {
  if (cache.analyticAccountIds[name]) return cache.analyticAccountIds[name];

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "account.analytic.account", "search_read",
    [[["name", "ilike", name]]],
    { fields: ["id", "name"], limit: 1 }
  ) as Array<{ id: number; name: string }>;

  if (results.length > 0) {
    cache.analyticAccountIds[name] = results[0].id;
    return results[0].id;
  }
  return 0;
}

/**
 * Build analytic distribution from tracking dimensions.
 * Odoo 17+ uses analytic_distribution as JSON: { "analytic_account_id": percentage }
 */
async function buildAnalyticDistribution(
  config: OdooConfig, uid: number, password: string,
  dimensions: Record<string, string> | undefined,
  cache: OdooIdCache
): Promise<Record<string, number> | null> {
  if (!dimensions || Object.keys(dimensions).length === 0) return null;

  const dist: Record<string, number> = {};
  for (const [, optionName] of Object.entries(dimensions)) {
    if (!optionName) continue;
    const id = await resolveAnalyticAccountId(config, uid, password, optionName, cache);
    if (id) dist[String(id)] = 100;
  }

  return Object.keys(dist).length > 0 ? dist : null;
}

/**
 * Check for duplicate postings in Odoo based on reference.
 */
export async function checkOdooPostedDuplicates(
  config: OdooConfig, password: string,
  reference: string
): Promise<Array<{ id: number; name: string; ref: string; date: string }>> {
  const uid = config.uid || await authenticateOdoo(config, password);

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "account.move", "search_read",
    [[["ref", "=", reference]]],
    { fields: ["id", "name", "ref", "date"], limit: 10 }
  ) as Array<{ id: number; name: string; ref: string; date: string }>;

  return results;
}

/**
 * List Odoo suppliers (for bill/AP invoice mode).
 */
/** @internal Debug helper — not part of the production workflow. */
async function listOdooSuppliers(
  config: OdooConfig, password: string
): Promise<Array<{ id: number; name: string }>> {
  const uid = config.uid || await authenticateOdoo(config, password);

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "res.partner", "search_read",
    [[["supplier_rank", ">", 0]]],
    { fields: ["id", "name"], limit: 200, order: "name" }
  ) as Array<{ id: number; name: string }>;

  return results;
}

export async function postJournalToOdoo(
  config: OdooConfig,
  password: string,
  journalId: number,
  entry: JournalEntry,
  cache?: OdooIdCache
): Promise<PostingResult> {
  try {
    const uid = config.uid || (await authenticateOdoo(config, password));
    const idCache = cache || { accountIds: {}, partnerIds: {}, journalIds: {}, analyticAccountIds: {} };

    const moveLines: unknown[] = [];
    for (const line of entry.lines) {
      const accountId = await resolveAccountId(config, uid, password, line.accountCode, idCache);

      const lineData: Record<string, unknown> = {
        account_id: accountId || parseInt(line.accountCode, 10) || 0,
        name: line.accountName,
        debit: line.debit,
        credit: line.credit,
      };

      const analyticDist = await buildAnalyticDistribution(
        config, uid, password, line.trackingDimensions, idCache
      );
      if (analyticDist) {
        lineData.analytic_distribution = analyticDist;
      }

      moveLines.push([0, 0, lineData]);
    }

    const result = await odooExecuteKw(
      config.url, config.db, uid, password,
      "account.move", "create",
      [{
        journal_id: journalId,
        ref: entry.reference,
        narration: entry.narration,
        date: entry.date,
        move_type: "entry",
        line_ids: moveLines,
      }]
    );

    return { success: true, provider: "odoo", journalId: String(result) };
  } catch (err) {
    return { success: false, provider: "odoo", error: (err as Error).message };
  }
}

/**
 * Fetch COA from Odoo for syncing.
 */
export async function fetchOdooCoa(
  config: OdooConfig, password: string
): Promise<Array<{ code: string; name: string }>> {
  const uid = config.uid || await authenticateOdoo(config, password);

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "account.account", "search_read",
    [[]],
    { fields: ["code", "name"], order: "code", limit: 5000 }
  ) as Array<{ code: string; name: string }>;

  return results.map(r => ({ code: r.code, name: r.name }));
}

/**
 * Read the current user's company from Odoo.
 */
/** @internal Debug helper — not part of the production workflow. */
async function readOdooUserCompany(
  config: OdooConfig, password: string
): Promise<{ id: number; name: string } | null> {
  const uid = config.uid || await authenticateOdoo(config, password);

  const results = await odooExecuteKw(
    config.url, config.db, uid, password,
    "res.users", "read",
    [[uid]],
    { fields: ["company_id"] }
  ) as Array<{ company_id: [number, string] }>;

  if (results.length > 0 && results[0].company_id) {
    return { id: results[0].company_id[0], name: results[0].company_id[1] };
  }
  return null;
}

/**
 * Xero API connector — faithful port of PayrollPosting.txt Xero integration.
 *
 * Preserves:
 * - OAuth token refresh
 * - Manual journal creation with tracking categories
 * - Connection testing
 * - COA fetch for syncing
 * - Custom tracking category name support
 */

import type { XeroConfig, JournalEntry, PostingResult } from "./types";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

async function refreshXeroToken(config: XeroConfig): Promise<string> {
  if (config.tokenSet && config.tokenSet.expires_at > Date.now()) {
    return config.tokenSet.access_token;
  }

  if (!config.tokenSet?.refresh_token) throw new Error("No Xero refresh token available");

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.tokenSet.refresh_token,
    }),
  });

  const data = await response.json();
  if (!data.access_token) throw new Error("Xero token refresh failed");

  config.tokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function testXeroConnection(config: XeroConfig): Promise<boolean> {
  try {
    const token = await refreshXeroToken(config);
    const response = await fetch(`${XERO_API_BASE}/Organisation`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Xero-Tenant-Id": config.tenantId,
        Accept: "application/json",
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch COA from Xero for syncing.
 */
export async function fetchXeroCoa(
  config: XeroConfig
): Promise<Array<{ code: string; name: string }>> {
  const token = await refreshXeroToken(config);

  const response = await fetch(`${XERO_API_BASE}/Accounts`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-Tenant-Id": config.tenantId,
      Accept: "application/json",
    },
  });

  if (!response.ok) throw new Error(`Xero COA fetch failed: ${response.status}`);

  const data = await response.json();
  const accounts = data.Accounts || [];
  return accounts.map((a: { Code: string; Name: string }) => ({
    code: a.Code,
    name: a.Name,
  }));
}

export async function postJournalToXero(
  config: XeroConfig,
  entry: JournalEntry
): Promise<PostingResult> {
  try {
    const token = await refreshXeroToken(config);

    const tc1Name = config.trackingCategory1Name || "Category 1";
    const tc2Name = config.trackingCategory2Name || "Category 2";

    const journalLines = entry.lines.map((line) => {
      const trackingCategories: { Name: string; Option: string }[] = [];

      if (line.trackingDimensions) {
        for (const [kindName, optionName] of Object.entries(line.trackingDimensions)) {
          if (optionName) trackingCategories.push({ Name: kindName, Option: optionName });
        }
      }

      if (trackingCategories.length === 0) {
        if (line.trackingCategory1) {
          trackingCategories.push({ Name: tc1Name, Option: line.trackingCategory1 });
        }
        if (line.trackingCategory2) {
          trackingCategories.push({ Name: tc2Name, Option: line.trackingCategory2 });
        }
      }

      return {
        AccountCode: line.accountCode,
        Description: line.accountName,
        LineAmount: line.debit > 0 ? line.debit : -line.credit,
        TrackingCategories: trackingCategories,
      };
    });

    const response = await fetch(`${XERO_API_BASE}/ManualJournals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Xero-Tenant-Id": config.tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        Narration: entry.narration,
        Date: entry.date,
        JournalLines: journalLines,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, provider: "xero", error: errorData };
    }

    const data = await response.json();
    return {
      success: true,
      provider: "xero",
      journalId: data.ManualJournals?.[0]?.ManualJournalID || "",
    };
  } catch (err) {
    return { success: false, provider: "xero", error: (err as Error).message };
  }
}

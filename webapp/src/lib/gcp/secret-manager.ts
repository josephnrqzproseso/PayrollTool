/**
 * Secret Manager client — retrieves per-tenant secrets for integrations.
 */

import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const client = new SecretManagerServiceClient();

const PROJECT_ID = process.env.GCP_PROJECT_ID || "";

export async function getSecret(secretName: string, version = "latest"): Promise<string> {
  if (!PROJECT_ID) {
    console.log(`[DEV] Would fetch secret: ${secretName}`);
    return "dev-secret-placeholder";
  }

  const name = secretName.startsWith("projects/")
    ? secretName
    : `projects/${PROJECT_ID}/secrets/${secretName}/versions/${version}`;

  const [response] = await client.accessSecretVersion({ name });
  return response.payload?.data?.toString() || "";
}

export async function createSecret(
  secretId: string,
  value: string
): Promise<void> {
  if (!PROJECT_ID) {
    console.log(`[DEV] Would create secret: ${secretId}`);
    return;
  }

  try {
    await client.createSecret({
      parent: `projects/${PROJECT_ID}`,
      secretId,
      secret: { replication: { automatic: {} } },
    });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e.code !== 6) throw err; // 6 = ALREADY_EXISTS
  }

  await client.addSecretVersion({
    parent: `projects/${PROJECT_ID}/secrets/${secretId}`,
    payload: { data: Buffer.from(value) },
  });
}

export async function deleteSecret(secretId: string): Promise<void> {
  if (!PROJECT_ID) return;

  await client.deleteSecret({
    name: `projects/${PROJECT_ID}/secrets/${secretId}`,
  }).catch(() => {});
}

export function tenantSecretId(tenantId: string, key: string): string {
  const prefix = process.env.SECRET_PREFIX || "payroll-tenant";
  return `${prefix}-${tenantId}-${key}`;
}

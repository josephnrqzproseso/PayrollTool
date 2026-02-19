import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSecret, tenantSecretId } from "@/lib/gcp/secret-manager";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const integrations = await prisma.integration.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, provider: true, active: true, config: true },
  });

  return NextResponse.json(integrations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { provider, config, password } = body;

  if (!provider) return NextResponse.json({ error: "Provider is required" }, { status: 400 });

  const tenantId = ctx.tenantId;

  let secretRef = "";
  if (password) {
    const secretId = tenantSecretId(tenantId, `${provider}-password`);
    await createSecret(secretId, password);
    secretRef = secretId;
  }

  const integration = await prisma.integration.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    update: { config: config || {}, secretRef: secretRef || undefined, active: true },
    create: { tenantId, provider, config: config || {}, secretRef, active: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: ctx.userId,
      action: "INTEGRATION_CONFIGURED",
      entity: "Integration",
      entityId: integration.id,
      details: { provider },
    },
  });

  return NextResponse.json({ id: integration.id, provider, active: true });
}

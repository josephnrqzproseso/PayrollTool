import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testIntegrationConnection } from "@/services/providers/posting-provider";
import { requireMinRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { provider } = await req.json();
  if (!provider) return NextResponse.json({ error: "Provider required" }, { status: 400 });

  const ok = await testIntegrationConnection(ctx.tenantId, provider);
  return NextResponse.json({ connected: ok });
}

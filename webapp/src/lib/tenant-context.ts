import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export async function requireTenantContext(): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const tenantId = session.user.tenantId;
  if (!tenantId) redirect("/onboarding");

  return {
    tenantId,
    userId: session.user.id,
    role: session.user.role || "MEMBER",
  };
}

export async function requireAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new Error("Forbidden: admin role required");
  }
  return ctx;
}

export function hasRole(
  ctx: TenantContext,
  minRole: "VIEWER" | "MEMBER" | "APPROVER" | "ADMIN" | "OWNER"
) {
  const rank: Record<string, number> = {
    VIEWER: 10,
    MEMBER: 20,
    APPROVER: 30,
    ADMIN: 40,
    OWNER: 50,
  };
  const current = String(ctx.role || "MEMBER").toUpperCase();
  return (rank[current] ?? 20) >= rank[minRole];
}

export function scopedQuery(tenantId: string) {
  return {
    where: { tenantId },
  };
}

export async function switchTenant(userId: string, tenantId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!membership) throw new Error("Not a member of this tenant");
  return membership;
}

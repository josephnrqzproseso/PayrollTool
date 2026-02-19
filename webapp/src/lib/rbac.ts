import { NextResponse } from "next/server";

export type AppRole = "VIEWER" | "MEMBER" | "APPROVER" | "ADMIN" | "OWNER";

const ROLE_RANK: Record<AppRole, number> = {
  VIEWER: 10,
  MEMBER: 20,
  APPROVER: 30,
  ADMIN: 40,
  OWNER: 50,
};

export function normalizeRole(role?: string | null): AppRole {
  const r = String(role || "MEMBER").toUpperCase();
  if (r === "VIEWER") return "VIEWER";
  if (r === "MEMBER") return "MEMBER";
  if (r === "APPROVER") return "APPROVER";
  if (r === "ADMIN") return "ADMIN";
  if (r === "OWNER") return "OWNER";
  return "MEMBER";
}

export function hasMinRole(role: string | null | undefined, minRole: AppRole): boolean {
  const current = normalizeRole(role);
  return ROLE_RANK[current] >= ROLE_RANK[minRole];
}

export function requireMinRole(params: {
  session: { user?: { id?: string; tenantId?: string; role?: string } } | null;
  minRole: AppRole;
}) {
  const { session, minRole } = params;
  const userId = session?.user?.id;
  const tenantId = session?.user?.tenantId;

  if (!userId || !tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasMinRole(session.user!.role, minRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId, tenantId, role: normalizeRole(session.user!.role) };
}


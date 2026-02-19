import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

const ALLOWED_ROLES = ["VIEWER", "MEMBER", "APPROVER", "ADMIN", "OWNER"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const memberships = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: [{ role: "asc" }, { user: { email: "asc" } }],
  });

  return NextResponse.json(
    memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "VIEWER").toUpperCase() as AllowedRole;

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!ALLOWED_ROLES.includes(role))
    return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user)
    return NextResponse.json(
      { error: "User not found. Ask them to register/sign in first." },
      { status: 404 }
    );

  const existing = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: ctx.tenantId } },
  });
  if (existing)
    return NextResponse.json({ error: "User already in this company" }, { status: 409 });

  const membership = await prisma.membership.create({
    data: { userId: user.id, tenantId: ctx.tenantId, role },
  });

  return NextResponse.json({ userId: membership.userId, email: user.email, role: membership.role }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const userId = String(body.userId || "");
  const role = String(body.role || "").toUpperCase() as AllowedRole;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!ALLOWED_ROLES.includes(role))
    return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
  });
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Prevent removing the last OWNER.
  if (membership.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.membership.count({
      where: { tenantId: ctx.tenantId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return NextResponse.json({ error: "Cannot remove the last OWNER" }, { status: 400 });
    }
  }

  const updated = await prisma.membership.update({
    where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
    data: { role },
  });

  return NextResponse.json({ userId: updated.userId, role: updated.role });
}


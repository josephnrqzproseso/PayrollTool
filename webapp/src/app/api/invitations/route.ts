import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const invitations = await prisma.invitation.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invitations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const { email, role } = body;
    if (!email || typeof email !== "string" || !email.includes("@"))
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });

    const validRoles = ["VIEWER", "MEMBER", "APPROVER", "ADMIN"];
    const assignRole = validRoles.includes(role) ? role : "MEMBER";

    const existing = await prisma.invitation.findFirst({
      where: { tenantId: ctx.tenantId, email: email.toLowerCase(), accepted: false },
    });
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json({ error: "A pending invitation already exists for this email" }, { status: 409 });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        tenantId: ctx.tenantId,
        email: email.toLowerCase(),
        role: assignRole,
        token,
        expiresAt,
      },
    });

    const inviteUrl = `${process.env.NEXTAUTH_URL || ""}/invite/${token}`;

    return NextResponse.json({
      ...invitation,
      inviteUrl,
    }, { status: 201 });
  }

  if (action === "validate") {
    const { token } = body;
    if (!token)
      return NextResponse.json({ error: "Token is required" }, { status: 400 });

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation)
      return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
    if (invitation.accepted)
      return NextResponse.json({ error: "Invitation already accepted" }, { status: 410 });
    if (invitation.expiresAt < new Date())
      return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });

    const tenant = await prisma.tenant.findUnique({ where: { id: invitation.tenantId } });

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      tenantName: tenant?.name || "Unknown",
      expiresAt: invitation.expiresAt,
    });
  }

  if (action === "accept") {
    const { token, userId } = body;
    if (!token || !userId)
      return NextResponse.json({ error: "token and userId required" }, { status: 400 });

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation)
      return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
    if (invitation.accepted)
      return NextResponse.json({ error: "Invitation already accepted" }, { status: 410 });
    if (invitation.expiresAt < new Date())
      return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });

    const existingMembership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: invitation.tenantId } },
    });

    if (existingMembership) {
      return NextResponse.json({ error: "User is already a member of this tenant" }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.membership.create({
        data: {
          userId,
          tenantId: invitation.tenantId,
          role: invitation.role,
        },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { accepted: true, acceptedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true, tenantId: invitation.tenantId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

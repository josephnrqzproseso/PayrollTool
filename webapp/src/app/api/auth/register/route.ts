import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { name, email, password, company } = await req.json();

  if (!name || !email || !password || !company) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    return NextResponse.json({ error: "Company name already taken." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, name, passwordHash },
  });

  const tenant = await prisma.tenant.create({
    data: {
      name: company,
      slug,
      companyProfile: { create: {} },
    },
  });

  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
  });

  return NextResponse.json({ ok: true, userId: user.id, tenantId: tenant.id });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyName } = await request.json();
  if (!companyName || typeof companyName !== "string" || !companyName.trim()) {
    return NextResponse.json(
      { error: "Company name is required." },
      { status: 400 }
    );
  }

  const existing = await prisma.membership.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already belong to a company." },
      { status: 409 }
    );
  }

  const slug = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName.trim(),
      slug: `${slug}-${Date.now().toString(36)}`,
      companyProfile: {
        create: {},
      },
      memberships: {
        create: {
          userId: session.user.id,
          role: "OWNER",
        },
      },
      adjustmentTypes: {
        createMany: {
          data: [
            { name: "OT Hours", category: "Taxable Earning" },
            { name: "Absence Days", category: "Basic Pay Related" },
            { name: "Late Minutes", category: "Basic Pay Related" },
            { name: "ND Hours", category: "Taxable Earning" },
            { name: "Rest Day Hours", category: "Taxable Earning" },
            { name: "Holiday Hours", category: "Taxable Earning" },
            { name: "Special Holiday Hours", category: "Taxable Earning" },
            { name: "Days Worked", category: "Basic Pay Related" },
          ],
        },
      },
    },
  });

  return NextResponse.json({ tenantId: tenant.id }, { status: 201 });
}

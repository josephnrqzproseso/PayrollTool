import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.companyProfile.findUnique({
    where: { tenantId: session.user.tenantId },
  });
  if (!profile) return NextResponse.json({});

  return NextResponse.json(profile);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();

  const profile = await prisma.companyProfile.upsert({
    where: { tenantId: ctx.tenantId },
    update: {
      registeredName: body.registeredName,
      tin: body.tin,
      registeredAddress1: body.registeredAddress1,
      registeredAddress2: body.registeredAddress2 ?? "",
      zipCode: body.zipCode ?? "",
      authorizedRep: body.authorizedRep ?? "",
      payFrequency: body.payFrequency,
      workingDaysPerYear: Number(body.workingDaysPerYear) || 261,
      philhealthRate: Number(body.philhealthRate) || 0.05,
      philhealthMinBase: Number(body.philhealthMinBase) || 10000,
      philhealthMaxBase: Number(body.philhealthMaxBase) || 100000,
      pagibigEeRate: Number(body.pagibigEeRate) || 0.02,
      pagibigErRate: Number(body.pagibigErRate) || 0.02,
      pagibigMaxBase: Number(body.pagibigMaxBase) || 10000,
    },
    create: {
      tenantId: ctx.tenantId,
      registeredName: body.registeredName || "",
      tin: body.tin || "",
    },
  });

  return NextResponse.json(profile);
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

function normalizeContractType(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "Employee";
  const low = s.toLowerCase();
  if (low === "contractor") return "Consultant";
  if (low === "probationary") return "Employee";
  if (low === "consultant") return "Consultant";
  if (low === "employee") return "Employee";
  return s;
}

function buildEmployeeName(input: { employeeName?: unknown; lastName?: unknown; firstName?: unknown; middleName?: unknown }): string {
  const explicit = String(input.employeeName ?? "").trim();
  if (explicit) return explicit;
  const last = String(input.lastName ?? "").trim();
  const first = String(input.firstName ?? "").trim();
  const mid = String(input.middleName ?? "").trim();
  const name = [last, first, mid].filter(Boolean).join(", ");
  return name.trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const employee = await prisma.employee.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!employee)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(employee);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.employee.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextLast = body.lastName ?? existing.lastName;
    const nextFirst = body.firstName ?? existing.firstName;
    const nextMid = body.middleName ?? existing.middleName;
    const employeeName = buildEmployeeName({
      employeeName: body.employeeName ?? existing.employeeName,
      lastName: nextLast,
      firstName: nextFirst,
      middleName: nextMid,
    });

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        employeeId: body.employeeId ?? existing.employeeId,
        employeeName,
        lastName: nextLast,
        firstName: nextFirst,
        middleName: nextMid,
        status: body.status ?? existing.status,
        contractType: body.contractType !== undefined ? normalizeContractType(body.contractType) : existing.contractType,
        consultantTaxRate: body.consultantTaxRate !== undefined ? Number(body.consultantTaxRate) : existing.consultantTaxRate,
        dateHired: body.dateHired !== undefined ? (body.dateHired ? new Date(body.dateHired) : null) : existing.dateHired,
        dateSeparated: body.dateSeparated !== undefined ? (body.dateSeparated ? new Date(body.dateSeparated) : null) : existing.dateSeparated,
        payBasis: body.payBasis ?? existing.payBasis,
        basicPay: body.basicPay !== undefined ? Number(body.basicPay) : existing.basicPay,
        workingDaysPerYear: body.workingDaysPerYear !== undefined ? Number(body.workingDaysPerYear) : existing.workingDaysPerYear,
        payrollGroup: body.payrollGroup ?? existing.payrollGroup,
        trackingCategory1: body.trackingCategory1 ?? existing.trackingCategory1,
        trackingCategory2: body.trackingCategory2 ?? existing.trackingCategory2,
        tin: body.tin ?? existing.tin,
        sss: body.sss ?? existing.sss,
        philhealth: body.philhealth ?? existing.philhealth,
        pagibig: body.pagibig ?? existing.pagibig,
        bankName: body.bankName ?? existing.bankName,
        bankAccountNumber: body.bankAccountNumber ?? existing.bankAccountNumber,
        bankAccountName: body.bankAccountName ?? existing.bankAccountName,
        nationality: body.nationality ?? existing.nationality,
        birthday: body.birthday !== undefined ? (body.birthday ? new Date(body.birthday) : null) : existing.birthday,
        isPwd: body.isPwd !== undefined ? Boolean(body.isPwd) : existing.isPwd,
        isMwe: body.isMwe !== undefined ? Boolean(body.isMwe) : existing.isMwe,
        appliedForRetirement: body.appliedForRetirement !== undefined ? Boolean(body.appliedForRetirement) : existing.appliedForRetirement,
        position: body.position ?? existing.position,
        allocation: body.allocation ?? existing.allocation,
      },
    });

    return NextResponse.json(employee);
  } catch (e) {
    console.error("[PUT /api/employees/:id] Error updating employee:", e);
    const details = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update employee", details },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "ADMIN" });
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const existing = await prisma.employee.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

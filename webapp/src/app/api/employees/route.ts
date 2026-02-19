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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const group = url.searchParams.get("group");

  const where: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (status) where.status = status;
  if (group) where.payrollGroup = group;

  const employees = await prisma.employee.findMany({
    where,
    orderBy: { employeeName: "asc" },
  });

  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await req.json();
    const employeeId = String(body.employeeId ?? "").trim();
    const employeeName = buildEmployeeName(body);

    if (!employeeId || !employeeName)
      return NextResponse.json(
        { error: "employeeId and employeeName are required" },
        { status: 400 }
      );

    const tenantId = ctx.tenantId;

    const contractType = normalizeContractType(body.contractType ?? "Employee");

    const existing = await prisma.employee.findUnique({
      where: { tenantId_employeeId: { tenantId, employeeId } },
    });
    if (existing)
      return NextResponse.json(
        { error: "Employee ID already exists" },
        { status: 409 }
      );

    const employee = await prisma.employee.create({
      data: {
        tenantId,
        employeeId,
        employeeName,
        lastName: String(body.lastName ?? "").trim(),
        firstName: String(body.firstName ?? "").trim(),
        middleName: String(body.middleName ?? "").trim(),
        status: body.status ?? "Active",
        contractType,
        consultantTaxRate: Number(body.consultantTaxRate) || 0,
        dateHired: body.dateHired ? new Date(body.dateHired) : null,
        dateSeparated: body.dateSeparated ? new Date(body.dateSeparated) : null,
        payBasis: body.payBasis ?? "MONTHLY",
        basicPay: Number(body.basicPay) || 0,
        workingDaysPerYear: Number(body.workingDaysPerYear) || 261,
        payrollGroup: String(body.payrollGroup ?? "").trim(),
        trackingCategory1: String(body.trackingCategory1 ?? "").trim(),
        trackingCategory2: String(body.trackingCategory2 ?? "").trim(),
        tin: String(body.tin ?? "").trim(),
        sss: String(body.sss ?? "").trim(),
        philhealth: String(body.philhealth ?? "").trim(),
        pagibig: String(body.pagibig ?? "").trim(),
        bankName: String(body.bankName ?? "").trim(),
        bankAccountNumber: String(body.bankAccountNumber ?? "").trim(),
        bankAccountName: String(body.bankAccountName ?? "").trim(),
        nationality: String(body.nationality ?? "Filipino").trim(),
        birthday: body.birthday ? new Date(body.birthday) : null,
        isPwd: Boolean(body.isPwd),
        isMwe: Boolean(body.isMwe),
        appliedForRetirement: Boolean(body.appliedForRetirement),
        position: String(body.position ?? "").trim(),
        allocation: String(body.allocation ?? "").trim(),
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (e) {
    console.error("[POST /api/employees] Error creating employee:", e);
    const details = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create employee", details },
      { status: 500 }
    );
  }
}

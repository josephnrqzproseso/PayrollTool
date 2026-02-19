import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMinRole } from "@/lib/rbac";

interface CsvRow {
  employeeId: string;
  employeeName: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  status?: string;
  contractType?: string;
  consultantTaxRate?: string;
  dateHired?: string;
  dateSeparated?: string;
  payBasis?: string;
  basicPay?: string;
  workingDaysPerYear?: string;
  payrollGroup?: string;
  trackingCategory1?: string;
  trackingCategory2?: string;
  tin?: string;
  sss?: string;
  philhealth?: string;
  pagibig?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  nationality?: string;
  birthday?: string;
  isPwd?: string;
  isMwe?: string;
  appliedForRetirement?: string;
  position?: string;
  allocation?: string;
}

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

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    if (row.employeeId) rows.push(row as unknown as CsvRow);
  }

  return rows;
}

function toBool(v?: string): boolean {
  if (!v) return false;
  return ["true", "1", "yes", "y"].includes(v.toLowerCase());
}

function toDateOrNull(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const ctx = requireMinRole({ session, minRole: "MEMBER" });
  if (ctx instanceof NextResponse) return ctx;

  try {
    const tenantId = ctx.tenantId;
    const body = await req.json();
    const { csvText } = body;

    if (!csvText || typeof csvText !== "string")
      return NextResponse.json({ error: "csvText is required" }, { status: 400 });

    const rows = parseCsv(csvText);
    if (rows.length === 0)
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const data = {
          employeeName: row.employeeName || `${row.lastName ?? ""}, ${row.firstName ?? ""}`.trim(),
          lastName: row.lastName ?? "",
          firstName: row.firstName ?? "",
          middleName: row.middleName ?? "",
          status: row.status ?? "Active",
          contractType: normalizeContractType(row.contractType ?? "Employee"),
          consultantTaxRate: Number(row.consultantTaxRate) || 0,
          dateHired: toDateOrNull(row.dateHired),
          dateSeparated: toDateOrNull(row.dateSeparated),
          payBasis: row.payBasis ?? "MONTHLY",
          basicPay: Number(row.basicPay) || 0,
          workingDaysPerYear: Number(row.workingDaysPerYear) || 261,
          payrollGroup: row.payrollGroup ?? "",
          trackingCategory1: row.trackingCategory1 ?? "",
          trackingCategory2: row.trackingCategory2 ?? "",
          tin: row.tin ?? "",
          sss: row.sss ?? "",
          philhealth: row.philhealth ?? "",
          pagibig: row.pagibig ?? "",
          bankName: row.bankName ?? "",
          bankAccountNumber: row.bankAccountNumber ?? "",
          bankAccountName: row.bankAccountName ?? "",
          nationality: row.nationality ?? "Filipino",
          birthday: toDateOrNull(row.birthday),
          isPwd: toBool(row.isPwd),
          isMwe: toBool(row.isMwe),
          appliedForRetirement: toBool(row.appliedForRetirement),
          position: row.position ?? "",
          allocation: row.allocation ?? "",
        };

        const existing = await prisma.employee.findUnique({
          where: { tenantId_employeeId: { tenantId, employeeId: row.employeeId } },
        });

        if (existing) {
          await prisma.employee.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.employee.create({
            data: { tenantId, employeeId: row.employeeId, ...data },
          });
          created++;
        }
      } catch (e) {
        errors.push(`Row ${row.employeeId}: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({ created, updated, errors, total: rows.length });
  } catch (e) {
    const details = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to import employees",
        ...(process.env.NODE_ENV !== "production" ? { details } : {}),
      },
      { status: 500 }
    );
  }
}

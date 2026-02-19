"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface Employee {
  id: string;
  employeeId: string;
  employeeName: string;
  payrollGroup?: string;
  payBasis?: string;
  basicPay?: number;
  status?: string;
  contractType?: string;
  consultantTaxRate?: number;
  position?: string;
  allocation?: string;
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
  birthday?: string | null;
  dateHired?: string | null;
  dateSeparated?: string | null;
  workingDaysPerYear?: number;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
  total: number;
}

type ColumnKey =
  | "employeeId"
  | "employeeName"
  | "status"
  | "contractType"
  | "consultantTaxRate"
  | "payrollGroup"
  | "payBasis"
  | "basicPay"
  | "position"
  | "allocation"
  | "trackingCategory1"
  | "trackingCategory2"
  | "dateHired"
  | "dateSeparated"
  | "workingDaysPerYear"
  | "tin"
  | "sss"
  | "philhealth"
  | "pagibig"
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountName"
  | "nationality"
  | "birthday";

const STORAGE_KEY = "employees.columns.v1";
const DEFAULT_COLUMNS: ColumnKey[] = [
  "employeeId",
  "employeeName",
  "payrollGroup",
  "payBasis",
  "basicPay",
  "status",
  "contractType",
];

function fmtMoney(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return "";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const COLUMN_DEFS: Record<ColumnKey, { label: string; render: (emp: Employee) => React.ReactNode }> = {
  employeeId: { label: "Employee ID", render: (e) => <span style={{ fontFamily: "monospace", fontSize: 13 }}>{e.employeeId}</span> },
  employeeName: { label: "Name", render: (e) => <span style={{ fontWeight: 500 }}>{e.employeeName}</span> },
  payrollGroup: { label: "Payroll Group", render: (e) => e.payrollGroup ?? "" },
  payBasis: { label: "Pay Basis", render: (e) => e.payBasis ?? "" },
  basicPay: { label: "Basic Pay", render: (e) => <span style={{ fontFamily: "monospace" }}>{fmtMoney(e.basicPay)}</span> },
  status: {
    label: "Status",
    render: (e) => {
      const s = (e.status ?? "").toString();
      const isActive = s.toLowerCase() === "active";
      return <span className={`badge badge-${isActive ? "success" : "muted"}`}>{s}</span>;
    },
  },
  contractType: { label: "Contract", render: (e) => <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{e.contractType ?? ""}</span> },
  consultantTaxRate: {
    label: "Consultant Tax Rate",
    render: (e) => {
      const r = Number(e.consultantTaxRate);
      if (!isFinite(r) || r === 0) return "";
      return <span style={{ fontFamily: "monospace" }}>{(r * 100).toFixed(2)}%</span>;
    },
  },
  position: { label: "Position", render: (e) => e.position ?? "" },
  allocation: { label: "Allocation", render: (e) => e.allocation ?? "" },
  trackingCategory1: { label: "Tracking Category 1", render: (e) => e.trackingCategory1 ?? "" },
  trackingCategory2: { label: "Tracking Category 2", render: (e) => e.trackingCategory2 ?? "" },
  dateHired: { label: "Date Hired", render: (e) => <span style={{ fontFamily: "monospace" }}>{fmtDate(e.dateHired)}</span> },
  dateSeparated: { label: "Date Separated", render: (e) => <span style={{ fontFamily: "monospace" }}>{fmtDate(e.dateSeparated)}</span> },
  workingDaysPerYear: { label: "Working Days / Year", render: (e) => (e.workingDaysPerYear ?? "").toString() },
  tin: { label: "TIN", render: (e) => <span style={{ fontFamily: "monospace" }}>{e.tin ?? ""}</span> },
  sss: { label: "SSS", render: (e) => <span style={{ fontFamily: "monospace" }}>{e.sss ?? ""}</span> },
  philhealth: { label: "PhilHealth", render: (e) => <span style={{ fontFamily: "monospace" }}>{e.philhealth ?? ""}</span> },
  pagibig: { label: "Pag-IBIG", render: (e) => <span style={{ fontFamily: "monospace" }}>{e.pagibig ?? ""}</span> },
  bankName: { label: "Bank Name", render: (e) => e.bankName ?? "" },
  bankAccountNumber: { label: "Account Number", render: (e) => <span style={{ fontFamily: "monospace" }}>{e.bankAccountNumber ?? ""}</span> },
  bankAccountName: { label: "Account Name", render: (e) => e.bankAccountName ?? "" },
  nationality: { label: "Nationality", render: (e) => e.nationality ?? "" },
  birthday: { label: "Birthday", render: (e) => <span style={{ fontFamily: "monospace" }}>{fmtDate(e.birthday)}</span> },
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[][] | null>(null);
  const [csvText, setCsvText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState<ColumnKey[]>(() => {
    try {
      if (typeof window === "undefined") return DEFAULT_COLUMNS;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_COLUMNS;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
      const known = new Set<ColumnKey>(Object.keys(COLUMN_DEFS) as ColumnKey[]);
      const next = parsed.filter((k) => known.has(k)).slice(0, 30) as ColumnKey[];
      return next.length > 0 ? next : DEFAULT_COLUMNS;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEmployees(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch {
      // ignore
    }
  }, [columns]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const preview = lines.slice(0, 6).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
      setCsvPreview(preview);
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    const res = await fetch("/api/employees/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText }),
    });
    const result = await res.json();
    setImportResult(result);
    setImporting(false);

    if (result.created > 0 || result.updated > 0) {
      const refreshRes = await fetch("/api/employees");
      const data = await refreshRes.json();
      if (Array.isArray(data)) setEmployees(data);
    }
  }

  function downloadTemplate() {
    const headers = [
      "employeeId", "lastName", "firstName", "middleName", "status", "contractType", "consultantTaxRate",
      "dateHired", "dateSeparated", "payBasis", "basicPay", "workingDaysPerYear",
      "payrollGroup", "trackingCategory1", "trackingCategory2", "position", "allocation",
      "tin", "sss", "philhealth", "pagibig",
      "bankName", "bankAccountNumber", "bankAccountName",
      "nationality", "birthday", "isPwd", "isMwe", "appliedForRetirement",
    ];
    const csv = headers.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Employees</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowImport(!showImport)}>
            {showImport ? "Cancel Import" : "Import CSV"}
          </button>
          <Link href="/dashboard/employees/new" className="btn btn-primary" style={{ textDecoration: "none" }}>
            + Add Employee
          </Link>
        </div>
      </div>

      {showColumns && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Employee Columns</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setColumns(Object.keys(COLUMN_DEFS) as ColumnKey[])}
                style={{ fontSize: 12 }}
              >
                Select all
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setColumns(DEFAULT_COLUMNS)}
                style={{ fontSize: 12 }}
              >
                Reset
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {(Object.keys(COLUMN_DEFS) as ColumnKey[]).map((key) => {
              const checked = columns.includes(key);
              return (
                <label key={key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const want = e.target.checked;
                      setColumns((prev) => {
                        if (want) return prev.includes(key) ? prev : [...prev, key];
                        const next = prev.filter((k) => k !== key);
                        return next.length === 0 ? prev : next;
                      });
                    }}
                  />
                  <span>{COLUMN_DEFS[key].label}</span>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
            Tip: Your selection is saved on this device/browser.
          </div>
        </div>
      )}

      {showImport && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Import Employees from CSV</h2>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect} style={{ fontSize: 13 }} />
            <button className="btn btn-secondary" onClick={downloadTemplate} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              Download Template
            </button>
          </div>

          {csvPreview && (
            <div style={{ marginBottom: 16, overflowX: "auto" }}>
              <p style={{ fontSize: 13, marginBottom: 8, color: "var(--text-muted)" }}>
                Preview (first {Math.min(csvPreview.length - 1, 5)} data rows):
              </p>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    {csvPreview[0].map((h, i) => (
                      <th key={i} style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((c, ci) => (
                        <td key={ci} style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleImport} disabled={importing}>
                {importing ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          )}

          {importResult && (
            <div style={{ fontSize: 13, padding: 12, background: importResult.errors.length ? "#fef9c3" : "#f0fdf4", borderRadius: 6 }}>
              <strong>Result:</strong> {importResult.created} created, {importResult.updated} updated out of {importResult.total} rows.
              {importResult.errors.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#dc2626" }}>
                  {importResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{employees.length} total</div>
          <button
            type="button"
            onClick={() => setShowColumns((v) => !v)}
            title="Columns"
            aria-label="Columns"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16" />
              <path d="M6 12h12" />
              <path d="M10 18h10" />
            </svg>
          </button>
        </div>
        {loading ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading...</p>
        ) : employees.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No employees yet. Add manually or import from CSV.</p>
        ) : (
          <table>
            <thead>
              <tr>
                {columns.map((k) => (
                  <th key={k}>{COLUMN_DEFS[k].label}</th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  {columns.map((k) => (
                    <td key={k} style={{ whiteSpace: "nowrap" }}>
                      {COLUMN_DEFS[k].render(emp)}
                    </td>
                  ))}
                  <td>
                    <Link href={`/dashboard/employees/${emp.id}`} style={{ fontSize: 13, color: "var(--primary)" }}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

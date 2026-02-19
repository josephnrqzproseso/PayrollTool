"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface PayrollGroupOption { id: string; name: string; }
interface TrackingKindOption { id: string; name: string; options: { id: string; name: string }[]; }

export interface EmployeeData {
  id?: string;
  employeeId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  employeeName: string;
  status: string;
  contractType: string;
  consultantTaxRate: number;
  dateHired: string;
  dateSeparated: string;
  payBasis: string;
  basicPay: number;
  workingDaysPerYear: number;
  payrollGroup: string;
  trackingCategory1: string;
  trackingCategory2: string;
  position: string;
  allocation: string;
  tin: string;
  sss: string;
  philhealth: string;
  pagibig: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  nationality: string;
  birthday: string;
  isPwd: boolean;
  isMwe: boolean;
  appliedForRetirement: boolean;
}

const EMPTY: EmployeeData = {
  employeeId: "", lastName: "", firstName: "", middleName: "", employeeName: "",
  status: "Active", contractType: "Employee", dateHired: "", dateSeparated: "",
  consultantTaxRate: 0,
  payBasis: "MONTHLY", basicPay: 0, workingDaysPerYear: 261,
  payrollGroup: "", trackingCategory1: "", trackingCategory2: "",
  position: "", allocation: "",
  tin: "", sss: "", philhealth: "", pagibig: "",
  bankName: "", bankAccountNumber: "", bankAccountName: "",
  nationality: "Filipino", birthday: "",
  isPwd: false, isMwe: false, appliedForRetirement: false,
};

function normalizeContractType(v: unknown): EmployeeData["contractType"] {
  const s = String(v ?? "").trim();
  if (!s) return "Employee";
  const low = s.toLowerCase();
  if (low === "contractor") return "Consultant";
  if (low === "probationary") return "Employee";
  if (low === "consultant") return "Consultant";
  if (low === "employee") return "Employee";
  return s;
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EmployeeForm({ initial, isEdit }: { initial?: Partial<EmployeeData> & { id?: string }; isEdit?: boolean }) {
  const router = useRouter();
  const merged: EmployeeData = {
    ...EMPTY,
    ...initial,
    contractType: normalizeContractType(initial?.contractType ?? EMPTY.contractType),
    consultantTaxRate: Number(initial?.consultantTaxRate) || 0,
    dateHired: fmtDate(initial?.dateHired),
    dateSeparated: fmtDate(initial?.dateSeparated),
    birthday: fmtDate(initial?.birthday),
  };

  const [form, setForm] = useState<EmployeeData>(merged);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [payrollGroups, setPayrollGroups] = useState<PayrollGroupOption[]>([]);
  const [trackingKinds, setTrackingKinds] = useState<TrackingKindOption[]>([]);

  useEffect(() => {
    fetch("/api/payroll-groups").then(r => r.json()).then(d => { if (Array.isArray(d)) setPayrollGroups(d); });
    fetch("/api/tracking-categories").then(r => r.json()).then(d => { if (Array.isArray(d)) setTrackingKinds(d); });
  }, []);

  function set<K extends keyof EmployeeData>(key: K, value: EmployeeData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (["lastName", "firstName", "middleName"].includes(key as string)) {
        next.employeeName = [next.lastName, next.firstName, next.middleName]
          .filter(Boolean)
          .join(", ");
      }
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const url = isEdit ? `/api/employees/${initial?.id}` : "/api/employees";
    const method = isEdit ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        let message = `Failed to save. (${res.status} ${res.statusText})`;
        try {
          const text = await res.text();
          if (text) {
            try {
              const data = JSON.parse(text) as { error?: string; message?: string; details?: string };
              if (data.error && data.details) message = `${data.error}: ${data.details}`;
              else message = data.error || data.message || message;
            } catch {
              message = text;
            }
          }
        } catch {
          // ignore
        }
        setError(message);
        return;
      }

      router.push("/dashboard/employees");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const txt = (label: string, key: keyof EmployeeData, type = "text") => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={form[key] as string | number}
        onChange={(e) => set(key, type === "number" ? Number(e.target.value) : e.target.value as never)}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
      />
    </div>
  );

  const sel = (label: string, key: keyof EmployeeData, options: string[]) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <select
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const chk = (label: string, key: keyof EmployeeData) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginBottom: 8 }}>
      <input
        type="checkbox"
        checked={form[key] as boolean}
        onChange={(e) => set(key, e.target.checked as never)}
        style={{ width: "auto" }}
      />
      {label}
    </label>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{isEdit ? "Edit Employee" : "Add Employee"}</h1>
        <button onClick={() => router.push("/dashboard/employees")} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: 14 }}>
          Back to list
        </button>
      </div>

      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Basic Info</h2>
            {txt("Employee ID", "employeeId")}
            {txt("Last Name", "lastName")}
            {txt("First Name", "firstName")}
            {txt("Middle Name", "middleName")}
            {sel("Status", "status", ["Active", "Inactive", "Separated"])}
            {sel("Contract Type", "contractType", ["Employee", "Consultant"])}
            {form.contractType === "Consultant" && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Withholding Tax Rate (Consultant)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={form.consultantTaxRate}
                  onChange={(e) => set("consultantTaxRate", Number(e.target.value) as never)}
                  placeholder="e.g. 0.10 for 10%"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                />
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  Stored as a decimal. Example: 10% = 0.10
                </div>
              </div>
            )}
            {txt("Date Hired", "dateHired", "date")}
            {txt("Date Separated", "dateSeparated", "date")}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Compensation</h2>
            {sel("Pay Basis", "payBasis", ["MONTHLY", "DAILY"])}
            {txt("Basic Pay", "basicPay", "number")}
            {txt("Working Days / Year", "workingDaysPerYear", "number")}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Payroll Group</label>
              <select
                value={form.payrollGroup}
                onChange={(e) => set("payrollGroup", e.target.value as never)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
              >
                <option value="">— None —</option>
                {payrollGroups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
            </div>
            {txt("Position", "position")}
            {txt("Allocation", "allocation")}
            {trackingKinds.length > 0 && trackingKinds.map((kind, idx) => {
              const key = idx === 0 ? "trackingCategory1" : idx === 1 ? "trackingCategory2" : null;
              if (!key) return null;
              return (
                <div key={kind.id} style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{kind.name}</label>
                  <select
                    value={(form as unknown as Record<string, unknown>)[key] as string || ""}
                    onChange={(e) => set(key as keyof EmployeeData, e.target.value as never)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                  >
                    <option value="">— None —</option>
                    {kind.options.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
                  </select>
                </div>
              );
            })}
            {trackingKinds.length === 0 && (
              <>
                {txt("Tracking Category 1", "trackingCategory1")}
                {txt("Tracking Category 2", "trackingCategory2")}
              </>
            )}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Government IDs</h2>
            {txt("TIN", "tin")}
            {txt("SSS", "sss")}
            {txt("PhilHealth", "philhealth")}
            {txt("Pag-IBIG", "pagibig")}

            <h2 style={{ fontSize: 14, fontWeight: 600, margin: "16px 0 12px" }}>Bank Details</h2>
            {txt("Bank Name", "bankName")}
            {txt("Account Number", "bankAccountNumber")}
            {txt("Account Name", "bankAccountName")}
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginTop: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Personal</h2>
              {txt("Nationality", "nationality")}
              {txt("Birthday", "birthday", "date")}
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Flags</h2>
              {chk("Person with Disability (PWD)", "isPwd")}
              {chk("Minimum Wage Earner (MWE)", "isMwe")}
              {chk("Applied for Retirement", "appliedForRetirement")}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update Employee" : "Create Employee"}
          </button>
        </div>
      </form>
    </div>
  );
}

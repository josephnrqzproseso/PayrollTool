"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

interface PayrollRunSummary {
  id: string;
  periodLabel: string;
  payrollFrequency: string;
  payrollCode: string;
  status: string;
  totalEmployees: number;
  totalNetPay: number;
  createdAt: string;
}

interface PayrollGroupOption { id: string; name: string; }

export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [configuredGroups, setConfiguredGroups] = useState<PayrollGroupOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string>("");
  const [form, setForm] = useState({
    payrollFrequency: "Semi-Monthly",
    payrollCode: "A",
    payrollGroups: "" as string | string[],
    startDate: "",
    endDate: "",
    creditingDate: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/payroll/runs").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setRuns(data);
    });
    fetch("/api/payroll-groups").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setConfiguredGroups(d);
    });
  }, []);

  async function handleDeleteRun(run: PayrollRunSummary) {
    if (run.status === "POSTED") {
      alert("This run is POSTED. Unpost it first, then delete.");
      return;
    }
    if (!confirm(`Delete payroll run "${run.periodLabel}"? This cannot be undone.`)) return;

    setDeletingId(run.id);
    try {
      const res = await fetch(`/api/payroll/runs/${run.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || "Failed to delete payroll run.");
        return;
      }
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
    } finally {
      setDeletingId("");
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/payroll/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payrollFrequency: form.payrollFrequency,
        payrollCode: form.payrollCode,
        startDate: form.startDate,
        endDate: form.endDate,
        creditingDate: form.creditingDate,
        payrollGroups: Array.isArray(form.payrollGroups)
          ? form.payrollGroups
          : (form.payrollGroups as string).split(",").map(s => s.trim()).filter(Boolean),
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      setShowForm(false);
      setRuns(prev => [data, ...prev]);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Payroll Runs</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ Generate Payroll"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>New Payroll Run</h2>
          <form onSubmit={handleGenerate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label>Frequency</label>
              <select value={form.payrollFrequency} onChange={e => setForm({ ...form, payrollFrequency: e.target.value })}>
                <option>Semi-Monthly</option>
                <option>Monthly</option>
                <option>Special</option>
              </select>
            </div>
            <div>
              <label>Code</label>
              {form.payrollFrequency === "Semi-Monthly" ? (
                <select value={form.payrollCode} onChange={e => setForm({ ...form, payrollCode: e.target.value })}>
                  <option value="A">A (1st Half)</option>
                  <option value="B">B (2nd Half)</option>
                </select>
              ) : (
                <input value={form.payrollCode} onChange={e => setForm({ ...form, payrollCode: e.target.value })} placeholder={form.payrollFrequency === "Monthly" ? "MONTHLY" : "e.g. BONUS"} />
              )}
            </div>
            <div>
              <label>Payroll Groups</label>
              {configuredGroups.length > 0 ? (
                <select
                  multiple
                  value={Array.isArray(form.payrollGroups) ? form.payrollGroups : []}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, o => o.value);
                    setForm({ ...form, payrollGroups: selected });
                  }}
                  style={{ minHeight: 80 }}
                >
                  {configuredGroups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              ) : (
                <input value={form.payrollGroups as string} onChange={e => setForm({ ...form, payrollGroups: e.target.value })} placeholder="e.g. Staff, Managers (comma-separated)" />
              )}
            </div>
            <div>
              <label>Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label>End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required />
            </div>
            <div>
              <label>Crediting Date</label>
              <input type="date" value={form.creditingDate} onChange={e => setForm({ ...form, creditingDate: e.target.value })} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Generate Payroll"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {runs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No payroll runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Period</th><th>Frequency</th><th>Code</th><th>Employees</th><th>Net Pay</th><th>Status</th><th>Date</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id}>
                  <td style={{ fontWeight: 500 }}>{run.periodLabel}</td>
                  <td>{run.payrollFrequency}</td>
                  <td>{run.payrollCode}</td>
                  <td>{run.totalEmployees}</td>
                  <td style={{ fontFamily: "monospace" }}>{run.totalNetPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td><span className={`badge badge-${run.status === "POSTED" ? "success" : run.status === "COMPUTED" || run.status === "APPROVED" ? "info" : run.status === "COMPUTING" ? "warning" : "muted"}`}>{run.status}</span></td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13 }}>{new Date(run.createdAt).toLocaleDateString("en-PH")}</td>
                  <td>
                    <Link href={`/dashboard/payroll/${run.id}`} style={{ fontSize: 13, color: "var(--primary)" }}>
                      View
                    </Link>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDeleteRun(run)}
                      disabled={deletingId === run.id}
                      title={run.status === "POSTED" ? "Unpost first" : "Delete run"}
                      style={{
                        background: "none",
                        border: "none",
                        color: run.status === "POSTED" ? "var(--text-muted)" : "#dc2626",
                        cursor: run.status === "POSTED" ? "not-allowed" : "pointer",
                        fontSize: 14,
                      }}
                    >
                      {deletingId === run.id ? "…" : "×"}
                    </button>
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

"use client";

import { useState, useEffect, useCallback } from "react";

interface Employee {
  id: string;
  employeeId: string;
  employeeName: string;
  payBasis: string;
  status: string;
}

interface AdjType {
  id: string;
  name: string;
  category: string;
}

interface Adjustment {
  id: string;
  employeeId: string;
  name: string;
  category: string;
  amount: number;
  periodKey: string;
}

function buildPeriodOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let m = -2; m <= 2; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push(`${ym} A`, `${ym} B`);
  }
  return options;
}

export default function AdjustmentsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adjTypes, setAdjTypes] = useState<AdjType[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [periodKey, setPeriodKey] = useState(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return `${ym} A`;
  });
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: "",
    amount: "",
  });
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAdjustments = useCallback(async (selectedEmployeeId: string) => {
    if (!selectedEmployeeId) {
      setAdjustments([]);
      return;
    }

    const res = await fetch(
      `/api/adjustments?periodKey=${encodeURIComponent(periodKey)}&employeeId=${encodeURIComponent(selectedEmployeeId)}`,
    );
    const data: Adjustment[] = await res.json();
    setAdjustments(Array.isArray(data) ? data : []);
  }, [periodKey]);

  useEffect(() => {
    Promise.all([
      fetch("/api/employees?status=Active").then((r) => r.json()),
      fetch("/api/adjustment-types").then((r) => r.json()),
    ]).then(([emps, types]) => {
      if (Array.isArray(emps)) setEmployees(emps);
      if (Array.isArray(emps) && emps.length > 0) setEmployeeId(emps[0].id);
      if (Array.isArray(types)) setAdjTypes(types);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading || !employeeId) return;

    const timer = setTimeout(() => {
      void loadAdjustments(employeeId);
    }, 0);

    return () => clearTimeout(timer);
  }, [loading, employeeId, loadAdjustments]);

  function resetForm() {
    setForm({ name: "", category: "", amount: "" });
    setEditingAdjustmentId(null);
    setOriginalName("");
  }

  function onTypeChange(typeName: string) {
    const t = adjTypes.find((a) => a.name === typeName);
    setForm((f) => ({ ...f, name: typeName, category: t?.category ?? f.category }));
  }

  function onEditAdjustment(adj: Adjustment) {
    setEditingAdjustmentId(adj.id);
    setOriginalName(adj.name);
    setForm({ name: adj.name, category: adj.category, amount: String(adj.amount) });
  }

  async function handleSave() {
    if (!employeeId || !form.name || form.amount === "") {
      setMessage("Please select employee/type and enter amount.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payloadAdjustments: Array<{
      employeeId: string;
      name: string;
      category: string;
      amount: number;
      periodKey: string;
    }> = [];

    const parsedAmount = Number(form.amount);
    if (Number.isNaN(parsedAmount)) {
      setMessage("Please enter a valid amount.");
      setSaving(false);
      return;
    }

    payloadAdjustments.push({
      employeeId,
      name: form.name,
      category: form.category,
      amount: parsedAmount,
      periodKey,
    });

    if (editingAdjustmentId && originalName && originalName !== form.name) {
      payloadAdjustments.unshift({
        employeeId,
        name: originalName,
        category: form.category,
        amount: 0,
        periodKey,
      });
    }

    const res = await fetch("/api/adjustments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustments: payloadAdjustments }),
    });

    if (res.ok) {
      const result = await res.json();
      setMessage(`Saved: ${result.upserted} updated, ${result.removed} cleared.`);
      resetForm();
      void loadAdjustments(employeeId);
    } else {
      setMessage("Failed to save.");
    }
    setSaving(false);
  }

  async function handleRemove(adj: Adjustment) {
    const res = await fetch("/api/adjustments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adjustments: [{ employeeId: adj.employeeId, name: adj.name, category: adj.category, amount: 0, periodKey }],
      }),
    });

    if (res.ok) {
      setMessage(`Removed ${adj.name}.`);
      if (editingAdjustmentId === adj.id) resetForm();
      void loadAdjustments(employeeId);
    } else {
      setMessage("Failed to remove adjustment.");
    }
  }

  async function handleApplyRecurring() {
    setApplying(true);
    setMessage("");
    const payrollCode = periodKey.split(" ").pop() || "A";
    const res = await fetch("/api/recurring-adjustments/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodKey, payrollCode }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessage(`Recurring applied: ${data.created} created, ${data.skipped} skipped.`);
      void loadAdjustments(employeeId);
    } else {
      const err = await res.json().catch(() => null);
      setMessage(err?.error || "Failed to apply recurring adjustments.");
    }
    setApplying(false);
  }

  const periodOptions = buildPeriodOptions();

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Adjustments</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select
            value={employeeId}
            onChange={(e) => {
              const nextEmployeeId = e.target.value;
              setEmployeeId(nextEmployeeId);
              resetForm();
            }}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, minWidth: 220 }}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.employeeName} ({emp.employeeId})</option>
            ))}
          </select>
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
          >
            {periodOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={handleApplyRecurring} disabled={applying}>
            {applying ? "Applying..." : "Apply Recurring"}
          </button>
          {message && (
            <span style={{ fontSize: 13, color: message.includes("Failed") ? "#dc2626" : "#16a34a" }}>
              {message}
            </span>
          )}
        </div>
      </div>

      {adjTypes.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            No adjustment types configured. They will be created automatically when you set up your company, or you can add them in Settings.
          </p>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="card"
            style={{ padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}
          >
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Adjustment Type</label>
              <select
                value={form.name}
                onChange={(e) => onTypeChange(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                required
              >
                <option value="">Select...</option>
                {adjTypes.map((t) => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Category</label>
              <input
                value={form.category}
                readOnly
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db", background: "#f3f4f6" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Amount</label>
              <input
                type="number"
                step="any"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}
                required
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : editingAdjustmentId ? "Save" : "Add"}
              </button>
              {editingAdjustmentId && (
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px" }}>Type</th>
                  <th style={{ padding: "10px 12px" }}>Category</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "10px 12px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "14px 12px", color: "var(--text-muted)" }}>
                      No adjustments found for the selected employee and period.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((adj) => (
                    <tr key={adj.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{adj.name}</td>
                      <td style={{ padding: "10px 12px" }}>{adj.category}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{adj.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "10px 12px", display: "flex", gap: 6 }}>
                        <button className="btn btn-secondary" onClick={() => onEditAdjustment(adj)}>Edit</button>
                        <button className="btn btn-secondary" onClick={() => handleRemove(adj)}>Remove</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

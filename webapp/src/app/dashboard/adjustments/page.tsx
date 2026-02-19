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

type GridData = Record<string, Record<string, number>>;

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
  const [periodKey, setPeriodKey] = useState(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return `${ym} A`;
  });
  const [grid, setGrid] = useState<GridData>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/employees?status=Active").then((r) => r.json()),
      fetch("/api/adjustment-types").then((r) => r.json()),
    ]).then(([emps, types]) => {
      if (Array.isArray(emps)) setEmployees(emps);
      if (Array.isArray(types)) setAdjTypes(types);
      setLoading(false);
    });
  }, []);

  const loadAdjustments = useCallback(async () => {
    const res = await fetch(`/api/adjustments?periodKey=${encodeURIComponent(periodKey)}`);
    const data: Adjustment[] = await res.json();
    if (!Array.isArray(data)) return;

    const g: GridData = {};
    for (const adj of data) {
      if (!g[adj.employeeId]) g[adj.employeeId] = {};
      g[adj.employeeId][adj.name] = adj.amount;
    }
    setGrid(g);
  }, [periodKey]);

  useEffect(() => {
    if (!loading) loadAdjustments();
  }, [periodKey, loading, loadAdjustments]);

  function setCellValue(empId: string, adjName: string, value: number) {
    setGrid((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], [adjName]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    const adjustments: Array<{
      employeeId: string;
      name: string;
      category: string;
      amount: number;
      periodKey: string;
    }> = [];

    for (const emp of employees) {
      for (const t of adjTypes) {
        const amount = grid[emp.id]?.[t.name] ?? 0;
        adjustments.push({
          employeeId: emp.id,
          name: t.name,
          category: t.category,
          amount,
          periodKey,
        });
      }
    }

    const res = await fetch("/api/adjustments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustments }),
    });

    if (res.ok) {
      const result = await res.json();
      setMessage(`Saved: ${result.upserted} updated, ${result.removed} cleared.`);
    } else {
      setMessage("Failed to save.");
    }
    setSaving(false);
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
      loadAdjustments();
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save All"}
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
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ fontSize: 13, minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, minWidth: 180 }}>Employee</th>
                <th style={{ position: "sticky", left: 180, background: "#fff", zIndex: 1, minWidth: 80 }}>Pay Basis</th>
                {adjTypes.map((t) => (
                  <th key={t.id} style={{ minWidth: 100, textAlign: "center", whiteSpace: "nowrap" }}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 500, whiteSpace: "nowrap" }}>
                    {emp.employeeName}
                  </td>
                  <td style={{ position: "sticky", left: 180, background: "#fff", fontSize: 12, color: "var(--text-muted)" }}>
                    {emp.payBasis}
                  </td>
                  {adjTypes.map((t) => (
                    <td key={t.id} style={{ padding: 2 }}>
                      <input
                        type="number"
                        step="any"
                        value={grid[emp.id]?.[t.name] ?? ""}
                        onChange={(e) =>
                          setCellValue(emp.id, t.name, e.target.value === "" ? 0 : Number(e.target.value))
                        }
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          border: "1px solid #e5e7eb",
                          borderRadius: 4,
                          fontSize: 13,
                          textAlign: "right",
                          background: "transparent",
                        }}
                        placeholder="0"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";

interface MappingRow {
  componentName: string;
  employeeCostAccount: string;
  employeeOpexAccount: string;
  consultantCostAccount: string;
  consultantOpexAccount: string;
  lineType: "positive" | "negative";
}

const DEFAULT_HEADERS = [
  "BASIC PAY",
  "Gross Pay",
  "SSS EE MC",
  "SSS EE MPF",
  "SSS ER MC",
  "SSS ER MPF",
  "SSS EC",
  "PhilHealth EE",
  "PhilHealth ER",
  "Pag-IBIG EE",
  "Pag-IBIG ER",
  "Withholding Tax",
  "Net Pay",
];

function emptyRow(name: string): MappingRow {
  return {
    componentName: name,
    employeeCostAccount: "",
    employeeOpexAccount: "",
    consultantCostAccount: "",
    consultantOpexAccount: "",
    lineType: "positive",
  };
}

export default function CoaMappingPage() {
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [defaultExpense, setDefaultExpense] = useState("6100");
  const [defaultPayable, setDefaultPayable] = useState("2100");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newHeader, setNewHeader] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/coa-mapping");
      if (!res.ok) return;
      const data = await res.json();
      const saved: MappingRow[] = Array.isArray(data.coaMappings) ? data.coaMappings : [];

      const merged = DEFAULT_HEADERS.map(
        (h) => saved.find((s) => s.componentName === h) || emptyRow(h)
      );
      const extras = saved.filter((s) => !DEFAULT_HEADERS.includes(s.componentName));
      setMappings([...merged, ...extras]);

      setDefaultExpense(data.defaultExpenseAcct || "6100");
      setDefaultPayable(data.defaultPayableAcct || "2100");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const filtered = mappings.filter(
        (m) => m.employeeCostAccount || m.employeeOpexAccount || m.consultantCostAccount || m.consultantOpexAccount
      );
      const res = await fetch("/api/settings/coa-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coaMappings: filtered,
          defaultExpenseAcct: defaultExpense,
          defaultPayableAcct: defaultPayable,
        }),
      });
      if (res.ok) setMessage("Saved successfully.");
      else {
        const err = await res.json().catch(() => null);
        setMessage(err?.error || "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx: number, field: keyof MappingRow, value: string) {
    setMappings((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    const name = newHeader.trim();
    if (!name) return;
    if (mappings.some((m) => m.componentName === name)) return;
    setMappings((prev) => [...prev, emptyRow(name)]);
    setNewHeader("");
  }

  function removeRow(idx: number) {
    setMappings((prev) => prev.filter((_, i) => i !== idx));
  }

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  const inputStyle = { width: "100%", fontSize: 12, padding: "4px 6px" };
  const thStyle = { fontSize: 11, fontWeight: 600 as const, padding: "6px 8px", textAlign: "left" as const, whiteSpace: "nowrap" as const };
  const tdStyle = { padding: "4px 6px" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Chart of Accounts Mapping</h2>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Mappings"}
        </button>
      </div>

      {message && (
        <div style={{
          padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13,
          background: message.includes("success") ? "#f0fdf4" : "#fef2f2",
          color: message.includes("success") ? "#16a34a" : "#dc2626",
        }}>
          {message}
        </div>
      )}

      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Default Accounts</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 500 }}>
          <div>
            <label style={{ fontSize: 12 }}>Default Salary Expense Account</label>
            <input value={defaultExpense} onChange={(e) => setDefaultExpense(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Default Payable Account</label>
            <input value={defaultPayable} onChange={(e) => setDefaultPayable(e.target.value)} style={inputStyle} />
          </div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Header-Level Mappings</h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Map each payroll component to GL accounts. Employee/Consultant and COST/OPEX dimensions determine which account is used per employee.
        </p>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ ...thStyle, minWidth: 160 }}>Component</th>
              <th style={thStyle}>Employee COST</th>
              <th style={thStyle}>Employee OPEX</th>
              <th style={thStyle}>Consultant COST</th>
              <th style={thStyle}>Consultant OPEX</th>
              <th style={{ ...thStyle, width: 90 }}>Line Type</th>
              <th style={{ ...thStyle, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((row, idx) => (
              <tr key={row.componentName} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: "nowrap" }}>{row.componentName}</td>
                <td style={tdStyle}>
                  <input value={row.employeeCostAccount} onChange={(e) => updateRow(idx, "employeeCostAccount", e.target.value)} style={inputStyle} placeholder="e.g. 6100" />
                </td>
                <td style={tdStyle}>
                  <input value={row.employeeOpexAccount} onChange={(e) => updateRow(idx, "employeeOpexAccount", e.target.value)} style={inputStyle} placeholder="e.g. 6200" />
                </td>
                <td style={tdStyle}>
                  <input value={row.consultantCostAccount} onChange={(e) => updateRow(idx, "consultantCostAccount", e.target.value)} style={inputStyle} placeholder="e.g. 6300" />
                </td>
                <td style={tdStyle}>
                  <input value={row.consultantOpexAccount} onChange={(e) => updateRow(idx, "consultantOpexAccount", e.target.value)} style={inputStyle} placeholder="e.g. 6400" />
                </td>
                <td style={tdStyle}>
                  <select value={row.lineType} onChange={(e) => updateRow(idx, "lineType", e.target.value)} style={{ ...inputStyle, width: 90 }}>
                    <option value="positive">Positive</option>
                    <option value="negative">Negative</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  {!DEFAULT_HEADERS.includes(row.componentName) && (
                    <button onClick={() => removeRow(idx)} style={{ color: "#dc2626", cursor: "pointer", border: "none", background: "none", fontSize: 14 }} title="Remove">×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <input
            value={newHeader}
            onChange={(e) => setNewHeader(e.target.value)}
            placeholder="Add custom component name..."
            style={{ ...inputStyle, maxWidth: 250 }}
            onKeyDown={(e) => { if (e.key === "Enter") addRow(); }}
          />
          <button className="btn btn-secondary" onClick={addRow} style={{ fontSize: 12, padding: "4px 12px" }}>
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

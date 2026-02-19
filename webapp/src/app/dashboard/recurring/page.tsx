"use client";
import { useState, useEffect, useCallback } from "react";

interface Employee {
  id: string;
  employeeId: string;
  employeeName: string;
}

interface RecurringAdj {
  id: string;
  employeeId: string;
  name: string;
  category: string;
  amount: number;
  mode: string;
  maxAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  employee?: { employeeName: string; employeeId: string };
}

interface AdjType {
  id: string;
  name: string;
  category: string;
}

const MODES = ["SPLIT", "1ST", "2ND"] as const;

export default function RecurringAdjustmentsPage() {
  const [records, setRecords] = useState<RecurringAdj[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adjTypes, setAdjTypes] = useState<AdjType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [form, setForm] = useState({
    employeeId: "",
    name: "",
    category: "",
    amount: "",
    mode: "SPLIT",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [recRes, empRes, typRes] = await Promise.all([
      fetch("/api/recurring-adjustments"),
      fetch("/api/employees"),
      fetch("/api/adjustment-types"),
    ]);
    if (recRes.ok) setRecords(await recRes.json());
    if (empRes.ok) setEmployees(await empRes.json());
    if (typRes.ok) setAdjTypes(await typRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function resetForm() {
    setForm({ employeeId: "", name: "", category: "", amount: "", mode: "SPLIT", maxAmount: "", startDate: "", endDate: "" });
    setEditId(null);
    setShowForm(false);
  }

  function editRecord(r: RecurringAdj) {
    setForm({
      employeeId: r.employeeId,
      name: r.name,
      category: r.category,
      amount: String(r.amount),
      mode: r.mode,
      maxAmount: r.maxAmount != null ? String(r.maxAmount) : "",
      startDate: r.startDate ? r.startDate.slice(0, 10) : "",
      endDate: r.endDate ? r.endDate.slice(0, 10) : "",
    });
    setEditId(r.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      employeeId: form.employeeId,
      name: form.name,
      category: form.category,
      amount: Number(form.amount),
      mode: form.mode,
      maxAmount: form.maxAmount ? Number(form.maxAmount) : null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    };

    const url = editId ? `/api/recurring-adjustments/${editId}` : "/api/recurring-adjustments";
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (res.ok) {
      resetForm();
      fetchAll();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to save");
    }
  }

  async function toggleActive(r: RecurringAdj) {
    await fetch(`/api/recurring-adjustments/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this recurring adjustment?")) return;
    await fetch(`/api/recurring-adjustments/${id}`, { method: "DELETE" });
    fetchAll();
  }

  function onTypeChange(typeName: string) {
    const t = adjTypes.find((a) => a.name === typeName);
    setForm((f) => ({ ...f, name: typeName, category: t?.category ?? f.category }));
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Recurring Adjustments</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          + Add Recurring
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8,
          padding: 20, marginBottom: 24, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12,
        }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Employee</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }} required>
              <option value="">Select...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.employeeName} ({emp.employeeId})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Adjustment Type</label>
            <select value={form.name} onChange={(e) => onTypeChange(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }} required>
              <option value="">Select...</option>
              {adjTypes.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Category</label>
            <input value={form.category} readOnly
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db", background: "#f3f4f6" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Amount</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }} required />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Mode</label>
            <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Max Amount (optional)</label>
            <input type="number" step="0.01" value={form.maxAmount} onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }} placeholder="Leave blank for no cap" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Start Date</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500 }}>End Date</label>
            <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #d1d5db" }} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={resetForm}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editId ? "Update" : "Create"}
            </button>
          </div>
        </form>
      )}

      {records.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No recurring adjustments configured yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Employee</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Name</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Category</th>
              <th style={{ padding: "8px 12px", fontSize: 13, textAlign: "right" }}>Amount</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Mode</th>
              <th style={{ padding: "8px 12px", fontSize: 13, textAlign: "right" }}>Max</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Start</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>End</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Active</th>
              <th style={{ padding: "8px 12px", fontSize: 13 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: r.active ? 1 : 0.5 }}>
                <td style={{ padding: "8px 12px", fontSize: 14 }}>{r.employee?.employeeName ?? "—"}</td>
                <td style={{ padding: "8px 12px", fontSize: 14 }}>{r.name}</td>
                <td style={{ padding: "8px 12px", fontSize: 14 }}>{r.category}</td>
                <td style={{ padding: "8px 12px", fontSize: 14, textAlign: "right" }}>{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ padding: "8px 12px", fontSize: 14 }}>{r.mode}</td>
                <td style={{ padding: "8px 12px", fontSize: 14, textAlign: "right" }}>{r.maxAmount != null ? r.maxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</td>
                <td style={{ padding: "8px 12px", fontSize: 14 }}>{r.startDate ? r.startDate.slice(0, 10) : "—"}</td>
                <td style={{ padding: "8px 12px", fontSize: 14 }}>{r.endDate ? r.endDate.slice(0, 10) : "—"}</td>
                <td style={{ padding: "8px 12px" }}>
                  <button onClick={() => toggleActive(r)}
                    style={{ padding: "2px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d5db", background: r.active ? "#d1fae5" : "#fee2e2", cursor: "pointer" }}>
                    {r.active ? "Yes" : "No"}
                  </button>
                </td>
                <td style={{ padding: "8px 12px", display: "flex", gap: 6 }}>
                  <button onClick={() => editRecord(r)}
                    style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(r.id)}
                    style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", cursor: "pointer" }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

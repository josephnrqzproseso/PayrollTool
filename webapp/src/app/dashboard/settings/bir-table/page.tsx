"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

interface BirRow {
  id: string;
  exSemi: number;
  maxSemi: number;
  fixedSemi: number;
  rateSemi: number;
  exMonth: number;
  maxMonth: number;
  fixedMonth: number;
  rateMonth: number;
  exAnnual: number;
  maxAnnual: number;
  fixedAnnual: number;
  rateAnnual: number;
}

function money(v: number) {
  if (v === Infinity || v >= 9e11) return "∞";
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function pct(v: number) {
  return `${(v * 100).toFixed(0)}%`;
}

export default function BirTablePage() {
  const [rows, setRows] = useState<BirRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    exSemi: "", maxSemi: "", fixedSemi: "", rateSemi: "",
    exMonth: "", maxMonth: "", fixedMonth: "", rateMonth: "",
  });
  const [csvText, setCsvText] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/statutory/bir-table");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/statutory/bir-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exSemi: Number(form.exSemi) || 0,
        maxSemi: form.maxSemi.trim().toLowerCase() === "infinity" || form.maxSemi.trim() === "" ? 999999999999 : Number(form.maxSemi) || 0,
        fixedSemi: Number(form.fixedSemi) || 0,
        rateSemi: Number(form.rateSemi) || 0,

        exMonth: Number(form.exMonth) || 0,
        maxMonth: form.maxMonth.trim().toLowerCase() === "infinity" || form.maxMonth.trim() === "" ? 999999999999 : Number(form.maxMonth) || 0,
        fixedMonth: Number(form.fixedMonth) || 0,
        rateMonth: Number(form.rateMonth) || 0,
      }),
    });
    if (res.ok) {
      setForm({
        exSemi: "", maxSemi: "", fixedSemi: "", rateSemi: "",
        exMonth: "", maxMonth: "", fixedMonth: "", rateMonth: "",
      });
      load();
    } else {
      setMessage("Failed to add bracket.");
    }
  }

  async function handleDelete(id: string) {
    await fetch("/api/statutory/bir-table", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function handleCsvImport() {
    setMessage("");
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setMessage("CSV must have a header + data rows."); return; }
    const parsed = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const maxOrInf = (raw?: string) => {
        const v = String(raw ?? "").trim();
        if (!v) return 999999999999;
        if (v.toLowerCase() === "infinity") return 999999999999;
        return Number(v) || 0;
      };
      return {
        exSemi: Number(cols[0]) || 0,
        maxSemi: maxOrInf(cols[1]),
        fixedSemi: Number(cols[2]) || 0,
        rateSemi: Number(cols[3]) || 0,

        exMonth: Number(cols[4]) || 0,
        maxMonth: maxOrInf(cols[5]),
        fixedMonth: Number(cols[6]) || 0,
        rateMonth: Number(cols[7]) || 0,

        exAnnual: Number(cols[8]) || 0,
        maxAnnual: maxOrInf(cols[9]),
        fixedAnnual: Number(cols[10]) || 0,
        rateAnnual: Number(cols[11]) || 0,
      };
    });
    const res = await fetch("/api/statutory/bir-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace", rows: parsed }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessage(`Imported ${data.replaced} brackets (replaced all).`);
      setCsvText("");
      load();
    } else {
      setMessage("Failed to import.");
    }
  }

  return (
    <div>
      <Link href="/dashboard/settings/statutory" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>&larr; Back to Statutory</Link>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4, marginBottom: 20 }}>BIR Withholding Tax Table</h2>

      {message && <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 16, background: message.includes("Failed") ? "#fef2f2" : "#f0fdf4", color: message.includes("Failed") ? "#dc2626" : "#16a34a" }}>{message}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Import CSV</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          Format (8 cols): exSemi, maxSemi, fixedSemi, rateSemi, exMonth, maxMonth, fixedMonth, rateMonth (rate as decimal). Optional annual cols: exAnnual, maxAnnual, fixedAnnual, rateAnnual.
          This replaces ALL existing brackets.
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={4}
          placeholder={"exSemi,maxSemi,fixedSemi,rateSemi,exMonth,maxMonth,fixedMonth,rateMonth\n0,5208.33,0,0,0,10417,0,0\n5208.33,8333.33,0,0.15,10417,16667,0,0.15\n..."}
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}
        />
        <button className="btn btn-primary" onClick={handleCsvImport} style={{ fontSize: 12 }}>Replace All from CSV</button>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add Single Bracket</h2>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Excess Over (Semi)</label>
            <input type="number" step="any" value={form.exSemi} onChange={(e) => setForm({ ...form, exSemi: e.target.value })} style={{ width: 140, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Max (Semi)</label>
            <input type="text" value={form.maxSemi} onChange={(e) => setForm({ ...form, maxSemi: e.target.value })} placeholder="Infinity" style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Fixed (Semi)</label>
            <input type="number" step="any" value={form.fixedSemi} onChange={(e) => setForm({ ...form, fixedSemi: e.target.value })} style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Rate (Semi)</label>
            <input type="number" step="any" value={form.rateSemi} onChange={(e) => setForm({ ...form, rateSemi: e.target.value })} style={{ width: 110, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Excess Over (Month)</label>
            <input type="number" step="any" value={form.exMonth} onChange={(e) => setForm({ ...form, exMonth: e.target.value })} style={{ width: 150, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Max (Month)</label>
            <input type="text" value={form.maxMonth} onChange={(e) => setForm({ ...form, maxMonth: e.target.value })} placeholder="Infinity" style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Fixed (Month)</label>
            <input type="number" step="any" value={form.fixedMonth} onChange={(e) => setForm({ ...form, fixedMonth: e.target.value })} style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
          </div>
          <div>
            <label style={{ fontSize: 12, display: "block" }}>Rate (Month)</label>
            <input type="number" step="any" value={form.rateMonth} onChange={(e) => setForm({ ...form, rateMonth: e.target.value })} style={{ width: 110, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }}>Add</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Current Brackets ({rows.length})</h2>
        {loading ? <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading...</p> : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No BIR brackets configured. Import via CSV or add manually above.</p>
        ) : (
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th colSpan={4} style={{ textAlign: "left" }}>Semi-monthly</th>
                <th colSpan={4} style={{ textAlign: "left" }}>Monthly</th>
                <th></th>
              </tr>
              <tr>
                <th>Excess Over</th><th>Max</th><th>Fixed</th><th>Rate</th>
                <th>Excess Over</th><th>Max</th><th>Fixed</th><th>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace" }}>{money(r.exSemi)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.maxSemi)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.fixedSemi)}</td>
                  <td style={{ fontFamily: "monospace" }}>{pct(r.rateSemi)}</td>

                  <td style={{ fontFamily: "monospace" }}>{money(r.exMonth)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.maxMonth)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.fixedMonth)}</td>
                  <td style={{ fontFamily: "monospace" }}>{pct(r.rateMonth)}</td>
                  <td><button onClick={() => handleDelete(r.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>&times;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

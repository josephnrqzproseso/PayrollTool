"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SssRow {
  id: string;
  compensationMin: number;
  compensationMax: number;
  eeMc: number;
  eeMpf: number;
  erMc: number;
  erMpf: number;
  ec: number;
}

function money(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

export default function SssTablePage() {
  const [rows, setRows] = useState<SssRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [csvText, setCsvText] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/statutory/sss-table");
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }

  async function handleDelete(id: string) {
    await fetch("/api/statutory/sss-table", {
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
      const c = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return {
        compensationMin: Number(c[0]) || 0,
        compensationMax: Number(c[1]) || 0,
        eeMc: Number(c[2]) || 0,
        eeMpf: Number(c[3]) || 0,
        erMc: Number(c[4]) || 0,
        erMpf: Number(c[5]) || 0,
        ec: Number(c[6]) || 0,
      };
    });
    const res = await fetch("/api/statutory/sss-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace", rows: parsed }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessage(`Imported ${data.replaced} rows (replaced all).`);
      setCsvText("");
      load();
    } else {
      setMessage("Failed to import.");
    }
  }

  return (
    <div>
      <Link href="/dashboard/settings/statutory" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>&larr; Back to Statutory</Link>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4, marginBottom: 20 }}>SSS Contribution Table</h2>

      {message && <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 16, background: message.includes("Failed") ? "#fef2f2" : "#f0fdf4", color: message.includes("Failed") ? "#dc2626" : "#16a34a" }}>{message}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Import CSV</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Format: compensationMin, compensationMax, eeMc, eeMpf, erMc, erMpf, ec. This replaces ALL existing rows.</p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={4}
          placeholder={"compensationMin,compensationMax,eeMc,eeMpf,erMc,erMpf,ec\n1000,4249.99,180,0,360,0,10\n..."}
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}
        />
        <button className="btn btn-primary" onClick={handleCsvImport} style={{ fontSize: 12 }}>Replace All from CSV</button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Current Table ({rows.length} rows)</h2>
        {loading ? <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading...</p> : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No SSS table configured. Import via CSV above.</p>
        ) : (
          <table style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Comp Min</th><th>Comp Max</th>
                <th>EE MC</th><th>EE MPF</th><th>ER MC</th><th>ER MPF</th><th>EC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace" }}>{money(r.compensationMin)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.compensationMax)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.eeMc)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.eeMpf)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.erMc)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.erMpf)}</td>
                  <td style={{ fontFamily: "monospace" }}>{money(r.ec)}</td>
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

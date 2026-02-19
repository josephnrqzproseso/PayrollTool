"use client";

import { useState, useEffect, FormEvent } from "react";

interface StatutoryRates {
  philhealthRate: number;
  philhealthMinBase: number;
  philhealthMaxBase: number;
  pagibigEeRate: number;
  pagibigErRate: number;
  pagibigMaxBase: number;
}

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
  if (v === Infinity || v >= 9e11) return "∞";
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function pct(v: number) {
  return `${(v * 100).toFixed(0)}%`;
}

export default function StatutoryPage() {
  const [rates, setRates] = useState<StatutoryRates>({
    philhealthRate: 0.05, philhealthMinBase: 10000, philhealthMaxBase: 100000,
    pagibigEeRate: 0.02, pagibigErRate: 0.02, pagibigMaxBase: 10000,
  });
  const [savingRates, setSavingRates] = useState(false);
  const [ratesMsg, setRatesMsg] = useState("");

  const [birRows, setBirRows] = useState<BirRow[]>([]);
  const [birLoading, setBirLoading] = useState(true);
  const [birCsv, setBirCsv] = useState("");
  const [birMsg, setBirMsg] = useState("");
  const [birForm, setBirForm] = useState({
    exSemi: "", maxSemi: "", fixedSemi: "", rateSemi: "",
    exMonth: "", maxMonth: "", fixedMonth: "", rateMonth: "",
  });

  const [sssRows, setSssRows] = useState<SssRow[]>([]);
  const [sssLoading, setSssLoading] = useState(true);
  const [sssCsv, setSssCsv] = useState("");
  const [sssMsg, setSssMsg] = useState("");

  const [tab, setTab] = useState<"rates" | "bir" | "sss">("rates");

  useEffect(() => {
    fetch("/api/tenants/settings").then(r => r.json()).then(data => {
      if (data && !data.error) setRates(prev => ({ ...prev, ...data }));
    });
    loadBir();
    loadSss();
  }, []);

  async function loadBir() {
    setBirLoading(true);
    const res = await fetch("/api/statutory/bir-table");
    if (res.ok) setBirRows(await res.json());
    setBirLoading(false);
  }

  async function loadSss() {
    setSssLoading(true);
    const res = await fetch("/api/statutory/sss-table");
    if (res.ok) setSssRows(await res.json());
    setSssLoading(false);
  }

  async function handleSaveRates(e: FormEvent) {
    e.preventDefault();
    setSavingRates(true);
    setRatesMsg("");
    const res = await fetch("/api/tenants/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rates),
    });
    setSavingRates(false);
    setRatesMsg(res.ok ? "Rates saved." : "Failed to save.");
  }

  async function handleAddBirBracket(e: FormEvent) {
    e.preventDefault();
    setBirMsg("");
    const res = await fetch("/api/statutory/bir-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exSemi: Number(birForm.exSemi) || 0,
        maxSemi: birForm.maxSemi.trim().toLowerCase() === "infinity" || birForm.maxSemi.trim() === "" ? 999999999999 : Number(birForm.maxSemi) || 0,
        fixedSemi: Number(birForm.fixedSemi) || 0,
        rateSemi: Number(birForm.rateSemi) || 0,

        exMonth: Number(birForm.exMonth) || 0,
        maxMonth: birForm.maxMonth.trim().toLowerCase() === "infinity" || birForm.maxMonth.trim() === "" ? 999999999999 : Number(birForm.maxMonth) || 0,
        fixedMonth: Number(birForm.fixedMonth) || 0,
        rateMonth: Number(birForm.rateMonth) || 0,
      }),
    });
    if (res.ok) {
      setBirForm({
        exSemi: "", maxSemi: "", fixedSemi: "", rateSemi: "",
        exMonth: "", maxMonth: "", fixedMonth: "", rateMonth: "",
      });
      loadBir();
    } else {
      setBirMsg("Failed to add bracket.");
    }
  }

  async function handleDeleteBir(id: string) {
    await fetch("/api/statutory/bir-table", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadBir();
  }

  async function handleBirCsvImport() {
    setBirMsg("");
    const lines = birCsv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setBirMsg("CSV must have a header + data rows."); return; }
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

        // Optional annual columns (I–L). If omitted, keep zeros (meaning “not configured”).
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
      setBirMsg(`Imported ${data.replaced} brackets (replaced all).`);
      setBirCsv("");
      loadBir();
    } else {
      setBirMsg("Failed to import.");
    }
  }

  async function handleSssCsvImport() {
    setSssMsg("");
    const lines = sssCsv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setSssMsg("CSV must have a header + data rows."); return; }
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
      setSssMsg(`Imported ${data.replaced} rows (replaced all).`);
      setSssCsv("");
      loadSss();
    } else {
      setSssMsg("Failed to import.");
    }
  }

  async function handleDeleteSss(id: string) {
    await fetch("/api/statutory/sss-table", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadSss();
  }

  const ratesField = (label: string, key: keyof StatutoryRates) => (
    <div style={{ marginBottom: 16 }}>
      <label>{label}</label>
      <input
        type="number"
        step="any"
        value={rates[key]}
        onChange={(e) => setRates({ ...rates, [key]: Number(e.target.value) })}
      />
    </div>
  );

  const msgStyle = (msg: string) => ({
    fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 16,
    background: msg.includes("Failed") ? "#fef2f2" : "#f0fdf4",
    color: msg.includes("Failed") ? "#dc2626" : "#16a34a",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {(["rates", "bir", "sss"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px", fontSize: 13, borderRadius: 6, cursor: "pointer",
              border: tab === t ? "1px solid var(--primary)" : "1px solid #d1d5db",
              background: tab === t ? "var(--primary)" : "#fff",
              color: tab === t ? "#fff" : "var(--text-muted)",
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === "rates" ? "Statutory Rates" : t === "bir" ? "BIR Withholding Tax" : "SSS Contributions"}
          </button>
        ))}
      </div>

      {/* ── Statutory Rates ── */}
      {tab === "rates" && (
        <form onSubmit={handleSaveRates}>
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>PhilHealth & Pag-IBIG Rates</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {ratesField("PhilHealth Rate", "philhealthRate")}
              {ratesField("PhilHealth Min Base", "philhealthMinBase")}
              {ratesField("PhilHealth Max Base", "philhealthMaxBase")}
              {ratesField("Pag-IBIG EE Rate", "pagibigEeRate")}
              {ratesField("Pag-IBIG ER Rate", "pagibigErRate")}
              {ratesField("Pag-IBIG Max Base", "pagibigMaxBase")}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <button type="submit" className="btn btn-primary" disabled={savingRates}>
                {savingRates ? "Saving..." : "Save Rates"}
              </button>
              {ratesMsg && <span style={{ fontSize: 13, color: ratesMsg.includes("Failed") ? "var(--danger)" : "var(--success)" }}>{ratesMsg}</span>}
            </div>
          </div>
        </form>
      )}

      {/* ── BIR Table ── */}
      {tab === "bir" && (
        <div>
          {birMsg && <div style={msgStyle(birMsg)}>{birMsg}</div>}

          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Import CSV</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
              Format (8 cols): exSemi, maxSemi, fixedSemi, rateSemi, exMonth, maxMonth, fixedMonth, rateMonth (rate as decimal). Optional annual cols: exAnnual, maxAnnual, fixedAnnual, rateAnnual.
              Replaces ALL existing brackets.
            </p>
            <textarea
              value={birCsv}
              onChange={(e) => setBirCsv(e.target.value)}
              rows={4}
              placeholder={"exSemi,maxSemi,fixedSemi,rateSemi,exMonth,maxMonth,fixedMonth,rateMonth\n0,5208.33,0,0,0,10417,0,0\n5208.33,8333.33,0,0.15,10417,16667,0,0.15\n..."}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}
            />
            <button className="btn btn-primary" onClick={handleBirCsvImport} style={{ fontSize: 12 }}>Replace All from CSV</button>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add Single Bracket</h2>
            <form onSubmit={handleAddBirBracket} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Excess Over (Semi)</label>
                <input type="number" step="any" value={birForm.exSemi} onChange={(e) => setBirForm({ ...birForm, exSemi: e.target.value })} style={{ width: 140, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Max (Semi)</label>
                <input type="text" value={birForm.maxSemi} onChange={(e) => setBirForm({ ...birForm, maxSemi: e.target.value })} placeholder="Infinity" style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Fixed (Semi)</label>
                <input type="number" step="any" value={birForm.fixedSemi} onChange={(e) => setBirForm({ ...birForm, fixedSemi: e.target.value })} style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Rate (Semi)</label>
                <input type="number" step="any" value={birForm.rateSemi} onChange={(e) => setBirForm({ ...birForm, rateSemi: e.target.value })} style={{ width: 110, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Excess Over (Month)</label>
                <input type="number" step="any" value={birForm.exMonth} onChange={(e) => setBirForm({ ...birForm, exMonth: e.target.value })} style={{ width: 150, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Max (Month)</label>
                <input type="text" value={birForm.maxMonth} onChange={(e) => setBirForm({ ...birForm, maxMonth: e.target.value })} placeholder="Infinity" style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Fixed (Month)</label>
                <input type="number" step="any" value={birForm.fixedMonth} onChange={(e) => setBirForm({ ...birForm, fixedMonth: e.target.value })} style={{ width: 120, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <div>
                <label style={{ fontSize: 12, display: "block" }}>Rate (Month)</label>
                <input type="number" step="any" value={birForm.rateMonth} onChange={(e) => setBirForm({ ...birForm, rateMonth: e.target.value })} style={{ width: 110, padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }}>Add</button>
            </form>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Current Brackets ({birRows.length})</h2>
            {birLoading ? <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading...</p> : birRows.length === 0 ? (
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
                  {birRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: "monospace" }}>{money(r.exSemi)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.maxSemi)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.fixedSemi)}</td>
                      <td style={{ fontFamily: "monospace" }}>{pct(r.rateSemi)}</td>

                      <td style={{ fontFamily: "monospace" }}>{money(r.exMonth)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.maxMonth)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.fixedMonth)}</td>
                      <td style={{ fontFamily: "monospace" }}>{pct(r.rateMonth)}</td>
                      <td><button onClick={() => handleDeleteBir(r.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── SSS Table ── */}
      {tab === "sss" && (
        <div>
          {sssMsg && <div style={msgStyle(sssMsg)}>{sssMsg}</div>}

          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Import CSV</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Format: compensationMin, compensationMax, eeMc, eeMpf, erMc, erMpf, ec. Replaces ALL existing rows.</p>
            <textarea
              value={sssCsv}
              onChange={(e) => setSssCsv(e.target.value)}
              rows={4}
              placeholder={"compensationMin,compensationMax,eeMc,eeMpf,erMc,erMpf,ec\n1000,4249.99,180,0,360,0,10\n..."}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}
            />
            <button className="btn btn-primary" onClick={handleSssCsvImport} style={{ fontSize: 12 }}>Replace All from CSV</button>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Current Table ({sssRows.length} rows)</h2>
            {sssLoading ? <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading...</p> : sssRows.length === 0 ? (
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
                  {sssRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontFamily: "monospace" }}>{money(r.compensationMin)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.compensationMax)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.eeMc)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.eeMpf)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.erMc)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.erMpf)}</td>
                      <td style={{ fontFamily: "monospace" }}>{money(r.ec)}</td>
                      <td><button onClick={() => handleDeleteSss(r.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

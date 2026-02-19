"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";

interface AdjType { id: string; name: string; category: string; }
interface PayrollGroup { id: string; name: string; code: string; active: boolean; }
interface TrackingOption { id: string; kindId: string; name: string; code: string; active: boolean; }
interface TrackingKind { id: string; name: string; sortOrder: number; active: boolean; options: TrackingOption[]; }

const CATEGORIES = [
  "Basic Pay Related", "Taxable Earning", "Non-Taxable Earning",
  "Non-Taxable Earning - De Minimis", "Non-Taxable Earning - Other",
  "13th Month Pay and Other Benefits", "Deduction", "Addition",
];

export default function ConfigurationPage() {
  const [tab, setTab] = useState<"adjTypes" | "payrollGroups" | "trackingCategories">("adjTypes");

  const [adjTypes, setAdjTypes] = useState<AdjType[]>([]);
  const [adjLoading, setAdjLoading] = useState(true);
  const [adjMsg, setAdjMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [seeding, setSeeding] = useState(false);

  const [groups, setGroups] = useState<PayrollGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupMsg, setGroupMsg] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");

  const [kinds, setKinds] = useState<TrackingKind[]>([]);
  const [kindsLoading, setKindsLoading] = useState(true);
  const [kindMsg, setKindMsg] = useState("");
  const [newKindName, setNewKindName] = useState("");
  const [newOptionKindId, setNewOptionKindId] = useState("");
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionCode, setNewOptionCode] = useState("");

  const loadAdjTypes = useCallback(async () => {
    setAdjLoading(true);
    const res = await fetch("/api/adjustment-types");
    if (res.ok) setAdjTypes(await res.json());
    setAdjLoading(false);
  }, []);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    const res = await fetch("/api/payroll-groups");
    if (res.ok) setGroups(await res.json());
    setGroupsLoading(false);
  }, []);

  const loadKinds = useCallback(async () => {
    setKindsLoading(true);
    const res = await fetch("/api/tracking-categories");
    if (res.ok) setKinds(await res.json());
    setKindsLoading(false);
  }, []);

  useEffect(() => { loadAdjTypes(); loadGroups(); loadKinds(); }, [loadAdjTypes, loadGroups, loadKinds]);

  async function handleAddType(e: FormEvent) {
    e.preventDefault();
    setAdjMsg("");
    if (!newName.trim()) return;
    const res = await fetch("/api/adjustment-types", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), category: newCategory }),
    });
    if (res.ok) { setNewName(""); loadAdjTypes(); }
    else { const d = await res.json(); setAdjMsg(d.error || "Failed to add."); }
  }

  async function handleDeleteType(id: string, name: string) {
    if (!confirm(`Delete adjustment type "${name}"?`)) return;
    setAdjMsg("");
    const res = await fetch("/api/adjustment-types", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadAdjTypes();
    else { const d = await res.json(); setAdjMsg(d.error || "Failed to delete."); }
  }

  async function handleSeedDefaults() {
    setSeeding(true); setAdjMsg("");
    const res = await fetch("/api/adjustment-types/seed", { method: "POST" });
    if (res.ok) { const d = await res.json(); setAdjMsg(`Seeded: ${d.created} created, ${d.updated} updated.`); loadAdjTypes(); }
    else setAdjMsg("Failed to seed defaults.");
    setSeeding(false);
  }

  async function handleAddGroup(e: FormEvent) {
    e.preventDefault(); setGroupMsg("");
    if (!newGroupName.trim()) return;
    const res = await fetch("/api/payroll-groups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupName.trim(), code: newGroupCode.trim() }),
    });
    if (res.ok) { setNewGroupName(""); setNewGroupCode(""); loadGroups(); }
    else { const d = await res.json(); setGroupMsg(d.error || "Failed to add."); }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Delete this payroll group?")) return;
    setGroupMsg("");
    const res = await fetch("/api/payroll-groups", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadGroups();
    else { const d = await res.json(); setGroupMsg(d.error || "Failed to delete."); }
  }

  async function handleAddKind(e: FormEvent) {
    e.preventDefault(); setKindMsg("");
    if (!newKindName.trim()) return;
    const res = await fetch("/api/tracking-categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-kind", name: newKindName.trim() }),
    });
    if (res.ok) { setNewKindName(""); loadKinds(); }
    else { const d = await res.json(); setKindMsg(d.error || "Failed to add."); }
  }

  async function handleAddOption(e: FormEvent) {
    e.preventDefault(); setKindMsg("");
    if (!newOptionKindId || !newOptionName.trim()) return;
    const res = await fetch("/api/tracking-categories", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-option", kindId: newOptionKindId, name: newOptionName.trim(), code: newOptionCode.trim() }),
    });
    if (res.ok) { setNewOptionName(""); setNewOptionCode(""); loadKinds(); }
    else { const d = await res.json(); setKindMsg(d.error || "Failed to add option."); }
  }

  async function handleDeleteKind(kindId: string) {
    if (!confirm("Delete this category kind and all its options?")) return;
    setKindMsg("");
    const res = await fetch("/api/tracking-categories", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kindId }),
    });
    if (res.ok) loadKinds();
  }

  async function handleDeleteOption(optionId: string) {
    setKindMsg("");
    const res = await fetch("/api/tracking-categories", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    if (res.ok) loadKinds();
  }

  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    types: adjTypes.filter((t) => t.category === cat),
  })).filter((g) => g.types.length > 0);

  const msgStyle = (positive: boolean) => ({
    fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 12,
    background: positive ? "#f0fdf4" : "#fef2f2",
    color: positive ? "#16a34a" : "#dc2626",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {([
          { key: "adjTypes", label: "Adjustment Types" },
          { key: "payrollGroups", label: "Payroll Groups" },
          { key: "trackingCategories", label: "Tracking Categories" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", fontSize: 13, borderRadius: 6, cursor: "pointer",
              border: tab === t.key ? "1px solid var(--primary)" : "1px solid #d1d5db",
              background: tab === t.key ? "var(--primary)" : "#fff",
              color: tab === t.key ? "#fff" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Adjustment Types ── */}
      {tab === "adjTypes" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Adjustment Types</h2>
            <button className="btn btn-secondary" onClick={handleSeedDefaults} disabled={seeding} style={{ fontSize: 12 }}>
              {seeding ? "Seeding..." : "Seed Defaults"}
            </button>
          </div>
          {adjMsg && <div style={msgStyle(!adjMsg.includes("Failed") && !adjMsg.includes("error"))}>{adjMsg}</div>}
          <form onSubmit={handleAddType} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Hazard Pay" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>+ Add Type</button>
          </form>
          {adjLoading ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</p> : adjTypes.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No adjustment types yet. Click &quot;Seed Defaults&quot; or add types above.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {grouped.map((g) => (
                <div key={g.category} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>{g.category}</h3>
                  {g.types.map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                      <span>{t.name}</span>
                      <button type="button" onClick={() => handleDeleteType(t.id, t.name)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px" }}>&times;</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Payroll Groups ── */}
      {tab === "payrollGroups" && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Payroll Groups</h2>
          {groupMsg && <div style={msgStyle(!groupMsg.includes("Failed"))}>{groupMsg}</div>}
          <form onSubmit={handleAddGroup} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Name</label>
              <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Staff" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Code (optional)</label>
              <input type="text" value={newGroupCode} onChange={(e) => setNewGroupCode(e.target.value)} placeholder="e.g. STF" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>+ Add Group</button>
          </form>
          {groupsLoading ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</p> : groups.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No payroll groups configured yet.</p>
          ) : (
            <table style={{ fontSize: 13 }}>
              <thead><tr><th>Name</th><th>Code</th><th></th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 500 }}>{g.name}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{g.code || "—"}</td>
                    <td><button onClick={() => handleDeleteGroup(g.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tracking Categories ── */}
      {tab === "trackingCategories" && (
        <div>
          {kindMsg && <div style={msgStyle(!kindMsg.includes("Failed"))}>{kindMsg}</div>}

          <div className="card" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Category Kinds</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Define what types of tracking categories your company uses (e.g. Department, Cost Center, Project).
            </p>
            <form onSubmit={handleAddKind} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Kind Name</label>
                <input type="text" value={newKindName} onChange={(e) => setNewKindName(e.target.value)} placeholder="e.g. Department" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>+ Add Kind</button>
            </form>
            {kindsLoading ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading...</p> : kinds.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No tracking categories configured yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {kinds.map((k) => (
                  <div key={k.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{k.name}</h3>
                      <button onClick={() => handleDeleteKind(k.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>Delete Kind</button>
                    </div>
                    {k.options.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {k.options.map((o) => (
                          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 13 }}>
                            <span>{o.name} {o.code && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>({o.code})</span>}</span>
                            <button onClick={() => handleDeleteOption(o.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>&times;</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {k.options.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>No options yet.</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {kinds.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Add Option to Kind</h2>
              <form onSubmit={handleAddOption} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Kind</label>
                  <select value={newOptionKindId} onChange={(e) => setNewOptionKindId(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} required>
                    <option value="">Select kind...</option>
                    {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Option Name</label>
                  <input type="text" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} placeholder="e.g. Engineering" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} required />
                </div>
                <div style={{ width: 120 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Code</label>
                  <input type="text" value={newOptionCode} onChange={(e) => setNewOptionCode(e.target.value)} placeholder="ENG" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>+ Add Option</button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

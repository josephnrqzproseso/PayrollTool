"use client";

import { useState, useEffect, FormEvent } from "react";

interface Integration {
  id: string;
  provider: string;
  active: boolean;
  config: Record<string, string>;
}

const PROVIDERS = ["odoo", "xero"] as const;

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const [form, setForm] = useState({
    provider: "odoo",
    url: "",
    database: "",
    username: "",
    password: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/integrations");
    if (res.ok) setIntegrations(await res.json());
    setLoading(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const config: Record<string, string> = {};
    if (form.url) config.url = form.url;
    if (form.database) config.database = form.database;
    if (form.username) config.username = form.username;

    const res = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: form.provider, config, password: form.password || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage("Integration saved.");
      setShowForm(false);
      load();
    } else {
      const err = await res.json().catch(() => null);
      setMessage(err?.error || "Failed to save.");
    }
  }

  async function handleTestConnection(provider: string) {
    setTestingProvider(provider);
    setTestResult((prev) => ({ ...prev, [provider]: { ok: false, msg: "Testing..." } }));
    try {
      const res = await fetch("/api/accounting/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (res.ok && data.connected) {
        setTestResult((prev) => ({ ...prev, [provider]: { ok: true, msg: "Connection successful" } }));
      } else {
        setTestResult((prev) => ({ ...prev, [provider]: { ok: false, msg: data.error || "Connection failed" } }));
      }
    } catch {
      setTestResult((prev) => ({ ...prev, [provider]: { ok: false, msg: "Network error" } }));
    }
    setTestingProvider(null);
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Integrations</h2>

      {message && <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 6, marginBottom: 16, background: message.includes("Failed") ? "#fef2f2" : "#f0fdf4", color: message.includes("Failed") ? "#dc2626" : "#16a34a" }}>{message}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Configured Integrations</h2>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ fontSize: 13 }}>
            {showForm ? "Cancel" : "+ Add Integration"}
          </button>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading...</p>
        ) : integrations.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No integrations configured yet.</p>
        ) : (
          <table style={{ fontSize: 13 }}>
            <thead>
              <tr><th>Provider</th><th>URL</th><th>Status</th><th>Connection</th></tr>
            </thead>
            <tbody>
              {integrations.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 600, textTransform: "capitalize" }}>{i.provider}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{(i.config as Record<string, string>)?.url || "—"}</td>
                  <td>
                    <span className={`badge badge-${i.active ? "success" : "muted"}`}>
                      {i.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: "3px 10px" }}
                        disabled={testingProvider === i.provider}
                        onClick={() => handleTestConnection(i.provider)}
                      >
                        {testingProvider === i.provider ? "Testing..." : "Test Connection"}
                      </button>
                      {testResult[i.provider] && testResult[i.provider].msg !== "Testing..." && (
                        <span style={{ fontSize: 11, color: testResult[i.provider].ok ? "#16a34a" : "#dc2626" }}>
                          {testResult[i.provider].ok ? "OK" : testResult[i.provider].msg}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Configure Integration</h2>
          <form onSubmit={handleSave} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
              >
                {PROVIDERS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>URL</label>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://odoo.example.com" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Database</label>
              <input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder="db name" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Username</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Stored securely in GCP Secret Manager.</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Integration"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

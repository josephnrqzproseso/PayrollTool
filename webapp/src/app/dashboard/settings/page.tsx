"use client";

import { useState, useEffect, FormEvent } from "react";

interface CompanySettings {
  registeredName: string;
  tin: string;
  registeredAddress1: string;
  registeredAddress2: string;
  zipCode: string;
  authorizedRep: string;
  payFrequency: string;
  workingDaysPerYear: number;
}

export default function CompanyProfilePage() {
  const [settings, setSettings] = useState<CompanySettings>({
    registeredName: "", tin: "", registeredAddress1: "",
    registeredAddress2: "", zipCode: "", authorizedRep: "",
    payFrequency: "Semi-Monthly", workingDaysPerYear: 261,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/tenants/settings").then(r => r.json()).then(data => {
      if (data && !data.error) setSettings(prev => ({ ...prev, ...data }));
    });
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/tenants/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setMessage(res.ok ? "Settings saved." : "Failed to save.");
  }

  const field = (label: string, key: keyof CompanySettings, type = "text") => (
    <div style={{ marginBottom: 16 }}>
      <label>{label}</label>
      <input
        type={type}
        value={settings[key] as string | number}
        onChange={(e) => setSettings({ ...settings, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
      />
    </div>
  );

  return (
    <div>
      <form onSubmit={handleSave}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Company Details</h2>
            {field("Registered Name", "registeredName")}
            {field("TIN", "tin")}
            {field("Authorized Representative", "authorizedRep")}
            {field("Address Line 1", "registeredAddress1")}
            {field("Address Line 2", "registeredAddress2")}
            {field("Zip Code", "zipCode")}
          </div>
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Payroll Settings</h2>
            {field("Pay Frequency", "payFrequency")}
            {field("Working Days / Year", "workingDaysPerYear", "number")}
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {message && <span style={{ fontSize: 13, color: message.includes("Failed") ? "var(--danger)" : "var(--success)" }}>{message}</span>}
        </div>
      </form>
    </div>
  );
}

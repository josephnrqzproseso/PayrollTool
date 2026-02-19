"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function OnboardingPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: companyName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg, #f5f5f5)",
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{ maxWidth: 480, width: "100%", padding: 32 }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Image src="/logo.png" alt="Netpay PH" width={180} height={40} style={{ objectFit: "contain" }} priority />
          <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 16, marginBottom: 4 }}>
            Welcome!
          </h1>
          <p style={{ color: "var(--text-muted, #666)", fontSize: 14 }}>
            Create your company to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="companyName"
            style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}
          >
            Company Name
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Proseso Consulting"
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #ddd",
              fontSize: 14,
              marginBottom: 16,
            }}
          />

          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !companyName.trim()}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: 6,
              background: loading ? "#999" : "var(--primary)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Create Company"}
          </button>
        </form>
      </div>
    </div>
  );
}

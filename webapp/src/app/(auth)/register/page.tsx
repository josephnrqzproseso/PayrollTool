"use client";

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";

const TERMS_PATH = "/terms";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", company: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Registration failed.");
      setLoading(false);
      return;
    }

    router.push("/login?registered=1");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="card" style={{ width: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Image src="/logo.png" alt="Netpay PH" width={180} height={40} style={{ objectFit: "contain" }} priority />
          <p style={{ color: "var(--text-muted)", marginTop: 8, fontSize: 14 }}>Set up your company&apos;s payroll workspace</p>
        </div>

        {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="name">Full Name</label>
          <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required style={{ marginBottom: 12 }} />

          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required style={{ marginBottom: 12 }} />

          <label htmlFor="company">Company Name</label>
          <input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required style={{ marginBottom: 12 }} />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} style={{ marginBottom: 20 }} />

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
          By creating an account you agree to the{" "}
          <Link href={TERMS_PATH} style={{ fontSize: 11 }}>
            Terms of Use &amp; License
          </Link>.
        </p>
      </div>
    </div>
  );
}

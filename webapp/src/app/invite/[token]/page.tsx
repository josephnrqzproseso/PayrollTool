"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface InviteInfo {
  email: string;
  role: string;
  tenantName: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInfo(data);
      })
      .catch(() => setError("Failed to validate invitation."));
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError("");

    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();

    if (!session?.user?.id) {
      router.push(`/login?callbackUrl=/invite/${token}`);
      return;
    }

    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", token, userId: session.user.id }),
    });

    const data = await res.json();
    setAccepting(false);

    if (data.error) {
      setError(data.error);
    } else {
      setAccepted(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ maxWidth: 480, width: "100%", padding: 32, background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Team Invitation</h1>

        {error && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        {accepted && (
          <div style={{ background: "#f0fdf4", color: "#16a34a", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            Invitation accepted! Redirecting to dashboard...
          </div>
        )}

        {!info && !error && (
          <p style={{ color: "#6b7280", fontSize: 14 }}>Validating invitation...</p>
        )}

        {info && !accepted && (
          <>
            <p style={{ fontSize: 14, color: "#374151", marginBottom: 12 }}>
              You&apos;ve been invited to join <strong>{info.tenantName}</strong> as a{" "}
              <strong>{info.role}</strong>.
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
              Invitation for: <strong>{info.email}</strong>
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              style={{
                width: "100%", padding: "12px 16px", background: "#2563eb", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}
            >
              {accepting ? "Accepting..." : "Accept Invitation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

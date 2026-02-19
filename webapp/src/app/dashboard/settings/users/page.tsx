"use client";

import { useEffect, useState } from "react";

type Role = "VIEWER" | "MEMBER" | "APPROVER" | "ADMIN" | "OWNER";

const ROLES: Role[] = ["VIEWER", "MEMBER", "APPROVER", "ADMIN", "OWNER"];
const INVITE_ROLES: Role[] = ["VIEWER", "MEMBER", "APPROVER", "ADMIN"];

type Row = { userId: string; email: string; name: string | null; role: Role };

interface Invite {
  id: string;
  email: string;
  role: string;
  accepted: boolean;
  expiresAt: string;
  inviteUrl?: string;
  createdAt: string;
}

export default function UsersAccessPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"members" | "invites">("members");
  const [copiedId, setCopiedId] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/tenant-users");
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Failed to load users");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function refreshInvites() {
    setInvitesLoading(true);
    const res = await fetch("/api/invitations");
    if (res.ok) setInvites(await res.json());
    setInvitesLoading(false);
  }

  useEffect(() => {
    refresh();
    refreshInvites();
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", email, role }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to send invitation");
      return;
    }

    setMessage(`Invitation created for ${data.email}`);
    setEmail("");
    setRole("MEMBER");
    refreshInvites();
    setTab("invites");
  }

  async function updateRole(userId: string, nextRole: Role) {
    setMessage("");
    setError("");
    const res = await fetch("/api/tenant-users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: nextRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to update role");
      return;
    }
    setMessage("Role updated.");
    refresh();
  }

  function copyToClipboard(url: string, id: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Users & Access</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
        Invite users to your workspace and manage access roles.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Invite User</h3>
        <form onSubmit={handleInvite} style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" required />
          </div>
          <div style={{ width: 200 }}>
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Send Invite
          </button>
        </form>
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
          An invite link will be generated. Share it with the user to grant them access.
        </p>
      </div>

      {message && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--success)" }}>{message}</div>}
      {error && <div style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)" }}>{error}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["members", "invites"] as const).map((t) => (
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
            {t === "members" ? `Members (${rows.length})` : `Invitations (${invites.length})`}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Members</h3>
            <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading...</p>
          ) : rows.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No users found.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td style={{ fontWeight: 600 }}>{r.name || "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 13 }}>{r.email}</td>
                    <td>
                      <select value={r.role} onChange={(e) => updateRole(r.userId, e.target.value as Role)}>
                        {ROLES.map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "invites" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Invitations</h3>
            <button className="btn btn-secondary" onClick={refreshInvites} disabled={invitesLoading}>
              {invitesLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {invitesLoading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading...</p>
          ) : invites.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No invitations sent yet.</p>
          ) : (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Link</th></tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const expired = new Date(inv.expiresAt) < new Date();
                  const status = inv.accepted ? "Accepted" : expired ? "Expired" : "Pending";
                  const statusColor = inv.accepted ? "var(--success)" : expired ? "var(--danger)" : "#ca8a04";
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "monospace" }}>{inv.email}</td>
                      <td>{inv.role}</td>
                      <td><span style={{ color: statusColor, fontWeight: 500 }}>{status}</span></td>
                      <td style={{ color: "var(--text-muted)" }}>{new Date(inv.expiresAt).toLocaleDateString("en-PH")}</td>
                      <td>
                        {!inv.accepted && !expired && inv.inviteUrl && (
                          <button
                            onClick={() => copyToClipboard(inv.inviteUrl!, inv.id)}
                            style={{
                              background: "none", border: "1px solid #d1d5db", borderRadius: 4,
                              padding: "2px 8px", fontSize: 12, cursor: "pointer",
                              color: copiedId === inv.id ? "var(--success)" : "var(--primary)",
                            }}
                          >
                            {copiedId === inv.id ? "Copied!" : "Copy Link"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

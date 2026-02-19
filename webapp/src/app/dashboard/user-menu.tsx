"use client";

import { signOut } from "next-auth/react";

export default function UserMenu({
  email,
  name,
}: {
  email: string;
  name: string | null;
}) {
  return (
    <div style={{ padding: "10px 16px" }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
        {name ? (
          <div style={{ fontWeight: 600, color: "#fff" }}>{name}</div>
        ) : null}
        <div style={{ opacity: 0.85 }}>{email}</div>
      </div>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Log out
      </button>
    </div>
  );
}


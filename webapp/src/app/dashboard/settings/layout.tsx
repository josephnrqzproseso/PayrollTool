"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const settingsTabs = [
  { href: "/dashboard/settings", label: "Company Profile" },
  { href: "/dashboard/settings/statutory", label: "Statutory" },
  { href: "/dashboard/settings/configuration", label: "Configuration" },
  { href: "/dashboard/settings/integrations", label: "Integrations" },
  { href: "/dashboard/settings/coa-mapping", label: "COA Mapping" },
  { href: "/dashboard/settings/users", label: "Users & Access" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard/settings") return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Settings</h1>
      <nav style={{
        display: "flex",
        gap: 4,
        borderBottom: "2px solid #e5e7eb",
        marginBottom: 24,
      }}>
        {settingsTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: isActive(tab.href) ? 600 : 400,
              color: isActive(tab.href) ? "var(--primary)" : "var(--text-muted)",
              textDecoration: "none",
              borderBottom: isActive(tab.href) ? "2px solid var(--primary)" : "2px solid transparent",
              marginBottom: -2,
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

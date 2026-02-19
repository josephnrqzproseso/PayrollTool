import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import UserMenu from "./user-menu";

const TERMS_PATH = "/terms";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/employees", label: "Employees", icon: "👥" },
  { href: "/dashboard/adjustments", label: "Adjustments", icon: "📝" },
  { href: "/dashboard/recurring", label: "Recurring", icon: "🔄" },
  { href: "/dashboard/payroll", label: "Payroll Runs", icon: "💰" },
  { href: "/dashboard/reports", label: "Reports", icon: "📋" },
  { href: "/dashboard/profile", label: "Profile", icon: "👤" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const tenantId = session.user.tenantId;
  const tenant = tenantId
    ? await prisma.tenant.findUnique({ where: { id: tenantId } })
    : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside style={{
        width: "var(--sidebar-w)", background: "var(--sidebar-bg)", color: "#fff",
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#fff",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            <Image
              src="/logo.png"
              alt="Netpay PH"
              width={140}
              height={32}
              style={{ objectFit: "contain" }}
              priority
            />
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>{tenant?.name || "No workspace"}</div>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 6, color: "#d1d5db", fontSize: 14, marginBottom: 2,
              textDecoration: "none",
            }}>
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <UserMenu
            email={session.user.email || ""}
            name={session.user.name || null}
          />
        </div>
        <div style={{ padding: "8px 16px 12px", fontSize: 10, opacity: 0.35, lineHeight: 1.5 }}>
          Proseso Outsourcing Services Inc.{" "}
          <Link
            href={TERMS_PATH}
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}
          >
            Terms
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: 32, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const tenantId = session.user.tenantId;

  const [user, membership, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    tenantId
      ? prisma.membership.findFirst({ where: { userId, tenantId } })
      : Promise.resolve(null),
    tenantId ? prisma.tenant.findUnique({ where: { id: tenantId } }) : Promise.resolve(null),
  ]);

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Profile</h1>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", rowGap: 10, columnGap: 16 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>Name</div>
          <div style={{ fontSize: 14 }}>{user?.name || "—"}</div>

          <div style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>Email</div>
          <div style={{ fontSize: 14 }}>{user?.email || session.user.email}</div>

          <div style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>Company</div>
          <div style={{ fontSize: 14 }}>{tenant?.name || "—"}</div>

          <div style={{ color: "var(--text-muted)", fontSize: 13, fontWeight: 600 }}>Role</div>
          <div style={{ fontSize: 14 }}>{membership?.role || "—"}</div>
        </div>
      </div>
    </div>
  );
}


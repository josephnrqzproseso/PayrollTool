import { requireTenantContext } from "@/lib/tenant-context";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const ctx = await requireTenantContext();

  const [employeeCount, recentRuns, activeJobs] = await Promise.all([
    prisma.employee.count({ where: { tenantId: ctx.tenantId } }),
    prisma.payrollRun.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.job.count({
      where: { tenantId: ctx.tenantId, status: { in: ["PENDING", "RUNNING"] } },
    }),
  ]);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div className="card">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Employees</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{employeeCount}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Payroll Runs</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{recentRuns.length}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Active Jobs</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{activeJobs}</div>
        </div>
      </div>

      {/* Recent Payroll Runs */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Recent Payroll Runs</h2>
        {recentRuns.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No payroll runs yet. Generate your first payroll to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Frequency</th>
                <th>Employees</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id}>
                  <td style={{ fontWeight: 500 }}>{run.periodLabel}</td>
                  <td>{run.payrollFrequency}</td>
                  <td>{run.totalEmployees}</td>
                  <td style={{ fontFamily: "monospace" }}>{run.totalNetPay.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td>
                    <span className={`badge badge-${run.status === "POSTED" ? "success" : run.status === "COMPUTED" ? "info" : run.status === "COMPUTING" ? "warning" : "muted"}`}>
                      {run.status}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {run.createdAt.toLocaleDateString("en-PH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

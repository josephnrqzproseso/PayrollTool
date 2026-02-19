"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface PayrollRow {
  id: string;
  employeeId: string;
  employeeName: string;
  basicPay: number;
  grossPay: number;
  taxableIncome: number;
  withholdingTax: number;
  sssEeMc: number;
  sssEeMpf: number;
  philhealthEe: number;
  pagibigEe: number;
  netPay: number;
  totalDeductions: number;
  componentValues: Record<string, number>;
}

interface PayrollRun {
  id: string;
  periodLabel: string;
  payrollFrequency: string;
  payrollCode: string;
  payrollMonth: string;
  startDate: string;
  endDate: string;
  creditingDate: string | null;
  status: string;
  totalEmployees: number;
  totalGrossPay: number;
  totalNetPay: number;
  createdAt: string;
  approvedAt: string | null;
  postedAt: string | null;
  rows: PayrollRow[];
}

function money(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function PayrollRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");
  const [payslipStatus, setPayslipStatus] = useState<string>("");
  const [payslipMsg, setPayslipMsg] = useState("");
  const [acctPostMsg, setAcctPostMsg] = useState("");
  const [acctPostStatus, setAcctPostStatus] = useState<"" | "posting" | "success" | "error">("");

  useEffect(() => {
    fetch(`/api/payroll/runs/${runId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setRun(data);
        else setError(data?.error || "Not found");
        setLoading(false);
      });
    fetch(`/api/payroll/runs/${runId}/payslips`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.status && data.status !== "NONE") {
          setPayslipStatus(data.status);
          setPayslipMsg(data.message || "");
        }
      })
      .catch(() => {});
  }, [runId]);

  async function doAction(action: "approve" | "post" | "unpost") {
    setActing(action);
    setError("");
    const res = await fetch(`/api/payroll/runs/${runId}/${action}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setRun((prev) => prev ? { ...prev, status: data.status } : prev);
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error || `Failed to ${action}`);
    }
    setActing("");
  }

  async function handleGeneratePayslips() {
    setActing("payslips");
    setError("");
    const res = await fetch(`/api/payroll/runs/${runId}/payslips`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setPayslipStatus(data.status);
      setPayslipMsg(data.message || "Payslip generation queued.");
    } else {
      setError(data.error || "Failed to generate payslips");
    }
    setActing("");
  }

  async function handleDeleteRun() {
    if (!run) return;
    if (run.status === "POSTED") {
      setError("This run is POSTED. Unpost it first, then delete.");
      return;
    }
    if (!confirm(`Delete payroll run "${run.periodLabel}"? This cannot be undone.`)) return;

    setActing("delete");
    setError("");
    const res = await fetch(`/api/payroll/runs/${runId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Failed to delete payroll run.");
      setActing("");
      return;
    }
    router.push("/dashboard/payroll");
  }

  async function handlePostToAccounting() {
    setActing("accounting");
    setError("");
    setAcctPostMsg("");
    setAcctPostStatus("posting");
    try {
      const res = await fetch("/api/accounting/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollRunId: runId }),
      });
      const data = await res.json();
      if (res.ok) {
        setAcctPostStatus("success");
        setAcctPostMsg(data.jobId ? "Accounting posting job queued." : "Posted successfully.");
      } else {
        setAcctPostStatus("error");
        setAcctPostMsg(data.error || "Failed to post to accounting.");
      }
    } catch {
      setAcctPostStatus("error");
      setAcctPostMsg("Network error posting to accounting.");
    }
    setActing("");
  }

  async function handleDownloadBankFile() {
    setActing("bankfile");
    setError("");
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/bank-files`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to generate bank file.");
        setActing("");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bank-file-${run?.periodLabel || runId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error downloading bank file.");
    }
    setActing("");
  }

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (!run) return <div style={{ padding: 32, color: "#dc2626" }}>{error || "Payroll run not found."}</div>;

  const statusColor: Record<string, string> = {
    DRAFT: "muted", COMPUTING: "warning", COMPUTED: "info", APPROVED: "info", POSTED: "success", CANCELLED: "muted",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link href="/dashboard/payroll" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
            &larr; Back to Payroll Runs
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{run.periodLabel}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge badge-${statusColor[run.status] || "muted"}`} style={{ fontSize: 14, padding: "4px 12px" }}>
            {run.status}
          </span>

          {run.status === "COMPUTED" && (
            <button className="btn btn-primary" disabled={acting === "approve"} onClick={() => doAction("approve")}>
              {acting === "approve" ? "Approving..." : "Approve"}
            </button>
          )}
          {run.status === "APPROVED" && (
            <button className="btn btn-primary" disabled={acting === "post"} onClick={() => doAction("post")}>
              {acting === "post" ? "Posting..." : "Post to History"}
            </button>
          )}
          {run.status === "POSTED" && (
            <>
              <button
                className="btn btn-primary"
                disabled={acting === "payslips" || payslipStatus === "PENDING" || payslipStatus === "RUNNING"}
                onClick={handleGeneratePayslips}
              >
                {acting === "payslips" ? "Queuing..." : payslipStatus === "PENDING" || payslipStatus === "RUNNING" ? "Generating Payslips..." : payslipStatus === "COMPLETED" ? "Regenerate Payslips" : "Generate Payslips"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={acting === "accounting" || acctPostStatus === "success"}
                onClick={handlePostToAccounting}
              >
                {acting === "accounting" ? "Posting..." : acctPostStatus === "success" ? "Posted to Accounting" : "Post to Accounting"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={acting === "bankfile"}
                onClick={handleDownloadBankFile}
              >
                {acting === "bankfile" ? "Generating..." : "Download Bank File"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={acting === "unpost"}
                onClick={() => { if (confirm("Unpost will remove payroll history for this period. Continue?")) doAction("unpost"); }}
                style={{ color: "#dc2626", borderColor: "#fca5a5" }}
              >
                {acting === "unpost" ? "Unposting..." : "Unpost"}
              </button>
            </>
          )}

          {run.status !== "POSTED" && (
            <button
              className="btn btn-secondary"
              disabled={acting === "delete"}
              onClick={handleDeleteRun}
              style={{ color: "#dc2626", borderColor: "#fca5a5" }}
            >
              {acting === "delete" ? "Deleting..." : "Delete Run"}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {payslipStatus && payslipStatus !== "NONE" && (
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13,
          background: payslipStatus === "COMPLETED" ? "#f0fdf4" : payslipStatus === "FAILED" ? "#fef2f2" : "#fffbeb",
          color: payslipStatus === "COMPLETED" ? "#16a34a" : payslipStatus === "FAILED" ? "#dc2626" : "#ca8a04",
        }}>
          Payslip generation: <strong>{payslipStatus}</strong> {payslipMsg && `— ${payslipMsg}`}
        </div>
      )}

      {acctPostMsg && (
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13,
          background: acctPostStatus === "success" ? "#f0fdf4" : acctPostStatus === "error" ? "#fef2f2" : "#fffbeb",
          color: acctPostStatus === "success" ? "#16a34a" : acctPostStatus === "error" ? "#dc2626" : "#ca8a04",
        }}>
          {acctPostMsg}
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 13 }}>
          <div><strong>Frequency:</strong> {run.payrollFrequency}</div>
          <div><strong>Code:</strong> {run.payrollCode}</div>
          <div><strong>Month:</strong> {run.payrollMonth}</div>
          <div><strong>Period:</strong> {fmtDate(run.startDate)} – {fmtDate(run.endDate)}</div>
          <div><strong>Crediting:</strong> {fmtDate(run.creditingDate)}</div>
          <div><strong>Created:</strong> {fmtDate(run.createdAt)}</div>
          <div><strong>Posted:</strong> {fmtDate(run.postedAt)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{run.totalEmployees}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Employees</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace" }}>{money(run.totalGrossPay)}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Gross Pay</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace" }}>{money(run.totalNetPay)}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Net Pay</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Employee Breakdown ({run.rows.length})</h2>
        {run.rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No rows computed yet.</p>
        ) : (
          <table style={{ fontSize: 12, minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#fff", zIndex: 1, minWidth: 180 }}>Employee</th>
                <th style={{ textAlign: "right" }}>Basic Pay</th>
                <th style={{ textAlign: "right" }}>Gross Pay</th>
                <th style={{ textAlign: "right" }}>SSS EE</th>
                <th style={{ textAlign: "right" }}>PhilHealth EE</th>
                <th style={{ textAlign: "right" }}>Pag-IBIG EE</th>
                <th style={{ textAlign: "right" }}>Taxable Income</th>
                <th style={{ textAlign: "right" }}>W/Tax</th>
                <th style={{ textAlign: "right" }}>Deductions</th>
                <th style={{ textAlign: "right", fontWeight: 700 }}>Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {run.rows.map((row) => (
                <tr key={row.id}>
                  <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 500, whiteSpace: "nowrap" }}>{row.employeeName}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.basicPay)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.grossPay)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.sssEeMc + row.sssEeMpf)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.philhealthEe)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.pagibigEe)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.taxableIncome)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(Math.abs(row.withholdingTax))}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(row.totalDeductions)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{money(row.netPay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #333", fontWeight: 700 }}>
                <td style={{ position: "sticky", left: 0, background: "#fff" }}>TOTAL</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.basicPay, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.grossPay, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.sssEeMc + r.sssEeMpf, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.philhealthEe, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.pagibigEe, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.taxableIncome, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + Math.abs(r.withholdingTax), 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.totalDeductions, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{money(run.rows.reduce((s, r) => s + r.netPay, 0))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

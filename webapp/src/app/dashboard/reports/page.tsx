"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface JobState {
  jobId: string;
  status: string;
  progress: number;
  message: string;
  result: { url?: string } | null;
}

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [generating, setGenerating] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const pollJob = useCallback((type: string, jobId: string) => {
    if (pollRef.current[type]) clearInterval(pollRef.current[type]);

    pollRef.current[type] = setInterval(async () => {
      try {
        const res = await fetch(`/api/payroll/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJobs((prev) => ({ ...prev, [type]: { jobId, status: data.status, progress: data.progress, message: data.message, result: data.result } }));
        if (data.status === "COMPLETED" || data.status === "FAILED") {
          clearInterval(pollRef.current[type]);
          delete pollRef.current[type];
        }
      } catch {
        // ignore
      }
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pollRef.current).forEach(clearInterval);
    };
  }, []);

  async function generate(type: string) {
    setGenerating(type);
    setJobs((prev) => ({ ...prev, [type]: { jobId: "", status: "SUBMITTING", progress: 0, message: "Submitting...", result: null } }));
    try {
      const payload: Record<string, number> = { year };
      if (type === "pre-annualization") payload.month = month;

      const res = await fetch(`/api/reports/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setJobs((prev) => ({ ...prev, [type]: { jobId: "", status: "FAILED", progress: 0, message: err?.error || "Failed to submit", result: null } }));
        setGenerating(null);
        return;
      }
      const data = await res.json();
      setJobs((prev) => ({ ...prev, [type]: { jobId: data.jobId, status: "PENDING", progress: 0, message: "Queued...", result: null } }));
      pollJob(type, data.jobId);
    } catch {
      setJobs((prev) => ({ ...prev, [type]: { jobId: "", status: "FAILED", progress: 0, message: "Network error", result: null } }));
    }
    setGenerating(null);
  }

  function renderJobStatus(type: string) {
    const job = jobs[type];
    if (!job) return null;

    const colors: Record<string, string> = {
      PENDING: "#eab308", RUNNING: "#3b82f6", COMPLETED: "#16a34a", FAILED: "#dc2626", SUBMITTING: "#6b7280",
    };
    const color = colors[job.status] || "#6b7280";

    return (
      <div style={{ marginTop: 12, fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color }} />
          <span style={{ fontWeight: 600 }}>{job.status}</span>
          {job.progress > 0 && job.status === "RUNNING" && <span style={{ color: "var(--text-muted)" }}>({job.progress}%)</span>}
        </div>
        {job.message && <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 4 }}>{job.message}</div>}
        {job.status === "RUNNING" && (
          <div style={{ width: "100%", height: 4, background: "#e5e7eb", borderRadius: 2 }}>
            <div style={{ width: `${job.progress}%`, height: "100%", background: "#3b82f6", borderRadius: 2, transition: "width 0.3s" }} />
          </div>
        )}
        {job.status === "COMPLETED" && job.result?.url && (
          <a
            href={job.result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ display: "inline-block", marginTop: 8, fontSize: 12, textDecoration: "none" }}
          >
            Download Report
          </a>
        )}
        {job.status === "COMPLETED" && !job.result?.url && (
          <div style={{ color: "#16a34a", fontSize: 12 }}>Report generated. Check your storage bucket for the output.</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Reports</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Generate Annual Reports</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "end", marginBottom: 20 }}>
          <div>
            <label>Tax Year</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }} />
          </div>
          <div>
            <label>Month (for Pre-Annualization)</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 160 }}>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>BIR 2316</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Certificate of Compensation Payment / Tax Withheld</p>
            <button
              className="btn btn-primary"
              disabled={generating === "bir2316" || jobs.bir2316?.status === "RUNNING" || jobs.bir2316?.status === "PENDING"}
              onClick={() => generate("bir2316")}
            >
              {generating === "bir2316" ? "Submitting..." : "Generate"}
            </button>
            {renderJobStatus("bir2316")}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Alphalist 1604-C</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Annual Information Return of Income Taxes Withheld</p>
            <button
              className="btn btn-primary"
              disabled={generating === "alphalist" || jobs.alphalist?.status === "RUNNING" || jobs.alphalist?.status === "PENDING"}
              onClick={() => generate("alphalist")}
            >
              {generating === "alphalist" ? "Submitting..." : "Generate"}
            </button>
            {renderJobStatus("alphalist")}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Pre-Annualization</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>YTD tax projection and remaining per-cutoff estimates</p>
            <button
              className="btn btn-primary"
              disabled={generating === "pre-annualization" || jobs["pre-annualization"]?.status === "RUNNING" || jobs["pre-annualization"]?.status === "PENDING"}
              onClick={() => generate("pre-annualization")}
            >
              {generating === "pre-annualization" ? "Submitting..." : "Generate"}
            </button>
            {renderJobStatus("pre-annualization")}
          </div>
        </div>
      </div>
    </div>
  );
}

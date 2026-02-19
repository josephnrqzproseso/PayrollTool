/**
 * Cloud Run Worker — receives Cloud Tasks HTTP callbacks.
 * Handles payroll generation, posting, report generation, and payslip creation.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";

import { handlePayrollGenerate } from "./handlers/payroll-generate.js";
import { handlePayrollPost } from "./handlers/payroll-post.js";
import { handleBir2316 } from "./handlers/bir2316.js";
import { handleAlphalist } from "./handlers/alphalist.js";
import { handlePayslips } from "./handlers/payslips.js";

const PORT = Number(process.env.PORT) || 8081;

type TaskPayload = {
  jobId: string;
  taskType: string;
  tenantId: string;
  payrollRunId?: string;
  year?: number;
  [key: string]: unknown;
};

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("OK");
    return;
  }

  const requestUrl = req.url ? new URL(req.url, "http://localhost") : null;
  const pathname = requestUrl?.pathname || "";

  if (req.method !== "POST" || pathname !== "/api/worker/execute") {
    res.writeHead(404).end("Not found");
    return;
  }

  let payload: TaskPayload;
  try {
    const body = await readBody(req);
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400).end("Invalid JSON");
    return;
  }

  console.log(`[Worker] Received task: ${payload.taskType} (job: ${payload.jobId})`);

  try {
    const execute = async () => {
      switch (payload.taskType) {
        case "payroll.generate":
          await handlePayrollGenerate(payload.jobId, payload.payrollRunId!, payload.tenantId);
          break;
        case "payroll.postAccounting":
          await handlePayrollPost(payload.jobId, payload.payrollRunId!, payload.tenantId);
          break;
        case "reports.bir2316":
          await handleBir2316(payload.jobId, payload.tenantId, payload.year!);
          break;
        case "reports.alphalist":
          await handleAlphalist(payload.jobId, payload.tenantId, payload.year!);
          break;
        case "payslips.generate":
          await handlePayslips(payload.jobId, payload.payrollRunId!, payload.tenantId);
          break;
        default:
          throw new Error(`Unknown task type: ${payload.taskType}`);
      }
    };

    // Dev-only convenience: allow immediate HTTP response while work continues.
    // Do NOT use this mode for Cloud Tasks delivery (it expects 2xx only after success).
    const asyncMode = requestUrl?.searchParams.get("async") === "1";
    if (asyncMode) {
      res.writeHead(202).end("Accepted");
      void execute().catch((err) => console.error("[Worker async] task failed:", err));
      return;
    }

    await execute();
    res.writeHead(200).end("OK");
  } catch (err) {
    console.error(`[Worker] Task failed:`, err);
    res.writeHead(500).end(String(err));
  }
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`[Worker] Listening on port ${PORT}`);
});

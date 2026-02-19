#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# GCP Payroll SaaS — one-time project bootstrap
# Usage:  bash infra/setup-gcp.sh <PROJECT_ID> [REGION]
# ============================================================

PROJECT_ID="${1:?Usage: setup-gcp.sh <PROJECT_ID> [REGION]}"
REGION="${2:-asia-southeast1}"
DB_INSTANCE="payroll-pg"
DB_NAME="payroll_saas"
DB_USER="payroll_app"
DB_TIER="db-f1-micro"
TASKS_QUEUE="payroll-jobs"
REPO_NAME="payroll-saas"
BUCKET_PAYSLIPS="${PROJECT_ID}-payslips"
BUCKET_REPORTS="${PROJECT_ID}-reports"

echo "▸ Setting project to ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

# ── Enable required APIs ──
echo "▸ Enabling APIs …"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudtasks.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  cloudtrace.googleapis.com \
  clouderrorreporting.googleapis.com \
  identitytoolkit.googleapis.com \
  sheets.googleapis.com \
  drive.googleapis.com \
  gmail.googleapis.com \
  storage.googleapis.com

# ── Artifact Registry ──
echo "▸ Creating Artifact Registry repository …"
gcloud artifacts repositories describe "${REPO_NAME}" \
  --location="${REGION}" 2>/dev/null || \
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="Payroll SaaS container images"

# ── Cloud SQL (PostgreSQL 15) ──
echo "▸ Creating Cloud SQL instance …"
gcloud sql instances describe "${DB_INSTANCE}" 2>/dev/null || \
gcloud sql instances create "${DB_INSTANCE}" \
  --database-version=POSTGRES_15 \
  --tier="${DB_TIER}" \
  --region="${REGION}" \
  --storage-auto-increase \
  --availability-type=zonal

echo "▸ Creating database and user …"
gcloud sql databases describe "${DB_NAME}" --instance="${DB_INSTANCE}" 2>/dev/null || \
gcloud sql databases create "${DB_NAME}" --instance="${DB_INSTANCE}"

DB_PASS=$(openssl rand -base64 24)
gcloud sql users create "${DB_USER}" --instance="${DB_INSTANCE}" --password="${DB_PASS}" 2>/dev/null || true

echo "▸ Storing DB password in Secret Manager …"
printf '%s' "${DB_PASS}" | \
  gcloud secrets create payroll-db-password --data-file=- 2>/dev/null || \
printf '%s' "${DB_PASS}" | \
  gcloud secrets versions add payroll-db-password --data-file=-

# ── Cloud Tasks queue ──
echo "▸ Creating Cloud Tasks queue …"
gcloud tasks queues describe "${TASKS_QUEUE}" --location="${REGION}" 2>/dev/null || \
gcloud tasks queues create "${TASKS_QUEUE}" \
  --location="${REGION}" \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=5 \
  --max-attempts=3 \
  --min-backoff=10s

# ── Cloud Storage buckets ──
echo "▸ Creating GCS buckets …"
gsutil ls -b "gs://${BUCKET_PAYSLIPS}" 2>/dev/null || \
gsutil mb -l "${REGION}" "gs://${BUCKET_PAYSLIPS}"

gsutil ls -b "gs://${BUCKET_REPORTS}" 2>/dev/null || \
gsutil mb -l "${REGION}" "gs://${BUCKET_REPORTS}"

# ── Identity Platform ──
echo "▸ Enabling Identity Platform email + Google providers …"
gcloud identity-platform config update \
  --project="${PROJECT_ID}" \
  --enable-email-link-sign-in 2>/dev/null || true

# ── Summary ──
cat <<EOF

════════════════════════════════════════════
  GCP Payroll SaaS — Bootstrap Complete
════════════════════════════════════════════
  Project:       ${PROJECT_ID}
  Region:        ${REGION}
  DB Instance:   ${DB_INSTANCE}
  Database:      ${DB_NAME}
  DB User:       ${DB_USER}
  Tasks Queue:   ${TASKS_QUEUE}
  Registry:      ${REPO_NAME}
  Buckets:       ${BUCKET_PAYSLIPS}, ${BUCKET_REPORTS}

  DB password stored in Secret Manager as: payroll-db-password
  Next steps:
    1. Set up Cloud SQL Auth Proxy for local dev
    2. Run prisma migrate to create tables
    3. Deploy with:  gcloud builds submit --config infra/cloudbuild.yaml
════════════════════════════════════════════
EOF

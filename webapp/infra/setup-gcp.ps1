# ============================================================
# GCP Payroll SaaS -- one-time project bootstrap (PowerShell)
# Usage:  .\infra\setup-gcp.ps1
# ============================================================

$PROJECT_ID   = "odoo-ocr-487104"
$REGION       = "asia-southeast1"
$DB_INSTANCE  = "payroll-pg"
$DB_NAME      = "payroll_saas"
$DB_USER      = "payroll_app"
$DB_TIER      = "db-f1-micro"
$TASKS_QUEUE  = "payroll-jobs"
$REPO_NAME    = "payroll-saas"
$BUCKET_PAYSLIPS = "$PROJECT_ID-payslips"
$BUCKET_REPORTS  = "$PROJECT_ID-reports"

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "> Setting project to $PROJECT_ID" -ForegroundColor Cyan
gcloud config set project $PROJECT_ID

# -- Enable required APIs --
Write-Host "> Enabling APIs (this takes a minute)..." -ForegroundColor Cyan
gcloud services enable `
  run.googleapis.com `
  sqladmin.googleapis.com `
  secretmanager.googleapis.com `
  cloudtasks.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  monitoring.googleapis.com `
  logging.googleapis.com `
  cloudtrace.googleapis.com `
  clouderrorreporting.googleapis.com `
  identitytoolkit.googleapis.com `
  sheets.googleapis.com `
  drive.googleapis.com `
  gmail.googleapis.com `
  storage.googleapis.com

# -- Artifact Registry --
Write-Host "> Creating Artifact Registry repository..." -ForegroundColor Cyan
gcloud artifacts repositories describe $REPO_NAME --location=$REGION 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud artifacts repositories create $REPO_NAME `
    --repository-format=docker `
    --location=$REGION `
    --description="Payroll SaaS container images"
} else {
  Write-Host "  (already exists)"
}

# -- Cloud SQL (PostgreSQL 15) --
Write-Host "> Creating Cloud SQL instance (this takes 5-10 minutes)..." -ForegroundColor Cyan
gcloud sql instances describe $DB_INSTANCE 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud sql instances create $DB_INSTANCE `
    --database-version=POSTGRES_15 `
    --tier=$DB_TIER `
    --region=$REGION `
    --storage-auto-increase `
    --availability-type=zonal
} else {
  Write-Host "  (already exists)"
}

Write-Host "> Creating database..." -ForegroundColor Cyan
gcloud sql databases describe $DB_NAME --instance=$DB_INSTANCE 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE
} else {
  Write-Host "  (already exists)"
}

Write-Host "> Creating database user..." -ForegroundColor Cyan
$DB_PASS = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object {[char]$_})
gcloud sql users create $DB_USER --instance=$DB_INSTANCE --password=$DB_PASS 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  (user may already exist -- updating password)"
  gcloud sql users set-password $DB_USER --instance=$DB_INSTANCE --password=$DB_PASS
}

Write-Host "> Storing DB password in Secret Manager..." -ForegroundColor Cyan
gcloud secrets describe payroll-db-password 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Output $DB_PASS | gcloud secrets create payroll-db-password --data-file=-
} else {
  Write-Output $DB_PASS | gcloud secrets versions add payroll-db-password --data-file=-
}

# -- Cloud Tasks queue --
Write-Host "> Creating Cloud Tasks queue..." -ForegroundColor Cyan
gcloud tasks queues describe $TASKS_QUEUE --location=$REGION 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud tasks queues create $TASKS_QUEUE `
    --location=$REGION `
    --max-dispatches-per-second=10 `
    --max-concurrent-dispatches=5 `
    --max-attempts=3 `
    --min-backoff=10s
} else {
  Write-Host "  (already exists)"
}

# -- Cloud Storage buckets --
Write-Host "> Creating GCS buckets..." -ForegroundColor Cyan
gsutil ls -b "gs://$BUCKET_PAYSLIPS" 2>$null
if ($LASTEXITCODE -ne 0) {
  gsutil mb -l $REGION "gs://$BUCKET_PAYSLIPS"
} else {
  Write-Host "  payslips bucket already exists"
}

gsutil ls -b "gs://$BUCKET_REPORTS" 2>$null
if ($LASTEXITCODE -ne 0) {
  gsutil mb -l $REGION "gs://$BUCKET_REPORTS"
} else {
  Write-Host "  reports bucket already exists"
}

# -- Identity Platform --
Write-Host "> Enabling Identity Platform..." -ForegroundColor Cyan
gcloud identity-platform config update --project=$PROJECT_ID --enable-email-link-sign-in 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "  (configure manually in console if needed)"
}

# -- Summary --
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  GCP Payroll SaaS -- Bootstrap Complete" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Project:       $PROJECT_ID"
Write-Host "  Region:        $REGION"
Write-Host "  DB Instance:   $DB_INSTANCE"
Write-Host "  Database:      $DB_NAME"
Write-Host "  DB User:       $DB_USER"
Write-Host "  Tasks Queue:   $TASKS_QUEUE"
Write-Host "  Registry:      $REPO_NAME"
Write-Host "  Buckets:       $BUCKET_PAYSLIPS, $BUCKET_REPORTS"
Write-Host ""
Write-Host "  DB password stored in Secret Manager as: payroll-db-password"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Install Cloud SQL Auth Proxy for local dev"
Write-Host "    2. Retrieve DB password:  gcloud secrets versions access latest --secret=payroll-db-password"
Write-Host "    3. Copy .env.example to .env and fill values"
Write-Host "    4. Run: npm install"
Write-Host "    5. Run: npx prisma migrate dev --name init"
Write-Host "    6. Run: npm run dev"
Write-Host "============================================" -ForegroundColor Green

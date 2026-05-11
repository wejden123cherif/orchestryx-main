<#
DESTRUCTIVE — DEV ENVIRONMENT ONLY.

Drops and recreates the public schema in the Aurora dev database, erasing all
tables, indexes, and data.  Run this when the database is in a state that
cannot be fixed by normal Alembic downgrade (e.g. a failed partial migration
or a corrupted schema left by a previous bad migration).

After this script completes, run the migration task to rebuild the schema:
  .\scripts\windows\run-migrations.ps1

DO NOT run against staging or production.  The script will refuse if
ORCHESTRYX_ENV is set to anything other than "dev".

Usage:
  .\scripts\windows\reset-dev-db.ps1
  .\scripts\windows\reset-dev-db.ps1 -Force   # skip the confirmation prompt
#>

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $true
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

# ── Load generated env ────────────────────────────────────────────────────────
function Import-EnvFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Write-Host "Loading environment from $Path"
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#") -or -not $line.Contains("=")) { continue }
        $key, $value = $line.Split("=", 2)
        $key = $key.Trim()
        if ($key -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") { continue }
        if (-not [Environment]::GetEnvironmentVariable($key, "Process")) {
            [Environment]::SetEnvironmentVariable($key, $value.Trim().Trim('"').Trim("'"), "Process")
        }
    }
}

Import-EnvFile ".env.dev.generated"

# ── Safety gate ───────────────────────────────────────────────────────────────
$Env = if ($env:ORCHESTRYX_ENV) { $env:ORCHESTRYX_ENV } else { "dev" }

if ($Env -ne "dev") {
    Write-Error "ABORT: ORCHESTRYX_ENV is '$Env'. This script only runs against dev."
    exit 1
}

$Cluster  = if ($env:ORCHESTRYX_ECS_CLUSTER_NAME) { $env:ORCHESTRYX_ECS_CLUSTER_NAME } else { "orchestryx-dev" }
$TaskArn  = $env:ORCHESTRYX_MIGRATION_TASK_ARN
$SgId     = $env:ORCHESTRYX_API_SG_ID
$Subnets  = $env:ORCHESTRYX_PRIVATE_SUBNET_IDS
$Region   = if ($env:AWS_REGION) { $env:AWS_REGION } else { "eu-central-1" }

if (-not $TaskArn)  { throw "ORCHESTRYX_MIGRATION_TASK_ARN not set. Run export_env.py first." }
if (-not $SgId)     { throw "ORCHESTRYX_API_SG_ID not set. Run export_env.py first." }
if (-not $Subnets)  { throw "ORCHESTRYX_PRIVATE_SUBNET_IDS not set. Run export_env.py first." }

$SubnetList = ($Subnets -split ",") | Select-Object -First 2
$SubnetsArg = $SubnetList -join ","

# ── Confirmation ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "WARNING: This will DROP SCHEMA public CASCADE on the Aurora dev database."
Write-Host "All tables, indexes, and data will be permanently deleted."
Write-Host ""
Write-Host "Cluster:  $Cluster"
Write-Host "Task def: $TaskArn"
Write-Host "Region:   $Region"
Write-Host ""

if (-not $Force) {
    $answer = Read-Host "Type 'reset dev db' to confirm"
    if ($answer -ne "reset dev db") {
        Write-Host "Aborted."
        exit 0
    }
}

# ── Python reset script (runs inside the migration container) ─────────────────
# Uses asyncpg/SQLAlchemy already present in the API image.
# DATABASE_URL and DB_SSL_MODE are injected from the runtime secret.
$ResetScript = @'
import os, asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    url = os.environ["DATABASE_URL"]
    if not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    ssl_mode = os.environ.get("DB_SSL_MODE", "require")
    connect_args = {} if ssl_mode == "disable" else {"ssl": ssl_mode}
    engine = create_async_engine(url, connect_args=connect_args)
    stmts = [
        "DROP SCHEMA public CASCADE",
        "CREATE SCHEMA public",
        "GRANT ALL ON SCHEMA public TO public",
        "GRANT ALL ON SCHEMA public TO postgres",
    ]
    async with engine.begin() as conn:
        for stmt in stmts:
            print(f"Executing: {stmt}")
            await conn.execute(text(stmt))
    await engine.dispose()
    print("Schema reset complete. Run the migration task next.")

asyncio.run(main())
'@

# ── Build ECS overrides ───────────────────────────────────────────────────────
$overrideObj = @{
    containerOverrides = @(
        @{
            name    = "migrate"
            command = @("python", "-c", $ResetScript)
        }
    )
}
$overrideJson = $overrideObj | ConvertTo-Json -Depth 10 -Compress

# ── Run the one-off task ──────────────────────────────────────────────────────
Write-Host "Starting schema reset task..."

$runOutput = aws ecs run-task `
    --cluster $Cluster `
    --task-definition $TaskArn `
    --launch-type FARGATE `
    --network-configuration "awsvpcConfiguration={subnets=[$SubnetsArg],securityGroups=[$SgId],assignPublicIp=DISABLED}" `
    --overrides $overrideJson `
    --count 1 `
    --region $Region 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Error "aws ecs run-task failed:`n$runOutput"
    exit 1
}

$runResult = $runOutput | ConvertFrom-Json

if (-not $runResult.tasks -or $runResult.tasks.Count -eq 0) {
    Write-Error "No task started. Failures:"
    $runResult.failures | ForEach-Object { Write-Host "  $_" }
    exit 1
}

$runningTaskArn = $runResult.tasks[0].taskArn
Write-Host "Reset task started: $runningTaskArn"
Write-Host "Waiting for task to complete..."

aws ecs wait tasks-stopped `
    --cluster $Cluster `
    --tasks $runningTaskArn `
    --region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Error "Timed out waiting for reset task to stop."
    exit 1
}

$descOutput = aws ecs describe-tasks `
    --cluster $Cluster `
    --tasks $runningTaskArn `
    --region $Region | ConvertFrom-Json

$task      = $descOutput.tasks[0]
$container = $task.containers | Where-Object { $_.name -eq "migrate" } | Select-Object -First 1
$exitCode  = $container.exitCode
$stopped   = $task.stoppedReason

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "Schema reset completed successfully."
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Run migrations:  .\scripts\windows\run-migrations.ps1"
    Write-Host "  2. Restart API:     .\scripts\windows\deploy.ps1 api"
    Write-Host "  3. Verify:          curl http://`$env:ORCHESTRYX_API_ALB_DNS/ready"
} else {
    Write-Host "Reset task FAILED. Exit code: $exitCode" -ForegroundColor Red
    if ($stopped) { Write-Host "Stop reason: $stopped" }
    Write-Host ""
    Write-Host "Check CloudWatch logs:"
    Write-Host "  aws logs tail /ecs/orchestryx-dev-api --since 15m --region $Region"
    exit 1
}

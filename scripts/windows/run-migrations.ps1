<#
Run the Alembic migration task inside ECS Fargate (one-off, no service created).

The task uses the API image and security group so it has identical DB access to
the API service.  Run this BEFORE the API service starts and after every
schema migration is added.

Prerequisites:
  - EcsPlatformStack deployed
  - export_env.py has been run (produces .env.dev.generated)
  - DATABASE_URL secret is populated in Secrets Manager

Usage:
  .\scripts\windows\run-migrations.ps1
  .\scripts\windows\run-migrations.ps1 -Env staging
#>

param(
    [string]$Env = "dev"
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $true
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

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

Import-EnvFile ".env.$Env.generated"

$Cluster  = if ($env:ORCHESTRYX_ECS_CLUSTER_NAME) { $env:ORCHESTRYX_ECS_CLUSTER_NAME } else { "orchestryx-$Env" }
$TaskArn  = $env:ORCHESTRYX_MIGRATION_TASK_ARN
$SgId     = $env:ORCHESTRYX_API_SG_ID
$Subnets  = $env:ORCHESTRYX_PRIVATE_SUBNET_IDS
$Region   = if ($env:AWS_REGION) { $env:AWS_REGION } else { "eu-central-1" }

if (-not $TaskArn)  { throw "ORCHESTRYX_MIGRATION_TASK_ARN not set. Run export_env.py first." }
if (-not $SgId)     { throw "ORCHESTRYX_API_SG_ID not set. Run export_env.py first." }
if (-not $Subnets)  { throw "ORCHESTRYX_PRIVATE_SUBNET_IDS not set. Run export_env.py first." }

# Use the first two private subnets for AZ redundancy.
$SubnetList = ($Subnets -split ",") | Select-Object -First 2
$SubnetsArg = $SubnetList -join ","

Write-Host ""
Write-Host "Migration task parameters:"
Write-Host "  Cluster:       $Cluster"
Write-Host "  Task def:      $TaskArn"
Write-Host "  Security group: $SgId"
Write-Host "  Subnets:       $SubnetsArg"
Write-Host "  Region:        $Region"
Write-Host ""

$runOutput = aws ecs run-task `
    --cluster $Cluster `
    --task-definition $TaskArn `
    --launch-type FARGATE `
    --network-configuration "awsvpcConfiguration={subnets=[$SubnetsArg],securityGroups=[$SgId],assignPublicIp=DISABLED}" `
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
Write-Host "Task started: $runningTaskArn"
Write-Host "Waiting for task to complete (up to 10 minutes)..."

aws ecs wait tasks-stopped `
    --cluster $Cluster `
    --tasks $runningTaskArn `
    --region $Region

if ($LASTEXITCODE -ne 0) {
    Write-Error "Timed out waiting for migration task to stop."
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
    Write-Host "Migrations completed successfully."
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Restart the API service:"
    Write-Host "     aws ecs update-service --cluster $Cluster --service $($env:ORCHESTRYX_API_SERVICE_NAME ?? 'orchestryx-dev-api-service') --force-new-deployment --region $Region"
    Write-Host "  2. Check /ready on the ALB to confirm the API is fully operational."
} else {
    Write-Host "Migration task FAILED. Exit code: $exitCode"
    if ($stopped) { Write-Host "Stop reason: $stopped" }
    Write-Host ""
    Write-Host "Check CloudWatch logs:"
    Write-Host "  aws logs tail /ecs/orchestryx-$Env-api --since 30m --region $Region"
    exit 1
}

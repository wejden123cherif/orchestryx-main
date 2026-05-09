<#
Build and deploy Orchestryx API/worker images to existing ECS services.

Infrastructure must already exist through infra/platform_cdk/.

Usage:
  .\scripts\windows\deploy.ps1
  .\scripts\windows\deploy.ps1 api
  .\scripts\windows\deploy.ps1 worker
  .\scripts\windows\deploy.ps1 images

Optional:
  $env:ENV_FILE = ".env.staging.generated"
  $env:WAIT_FOR_STABILITY = "true"
  $env:IMAGE_TAG = "2026-05-09.1"
  $env:FORCE = "true"
  $env:ORCHESTRYX_ENV = "prod"
#>

param(
    [ValidateSet("all", "api", "worker", "images")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $true
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

function Get-EnvValue {
    param([string]$Name)
    [Environment]::GetEnvironmentVariable($Name, "Process")
}

function Set-EnvValueIfMissing {
    param(
        [string]$Name,
        [string]$Value
    )
    if (-not (Get-EnvValue $Name)) {
        [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    }
}

function Import-DeployEnvFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Write-Host "Loading deploy environment from $Path"
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#") -or -not $line.Contains("=")) {
            continue
        }
        $key, $value = $line.Split("=", 2)
        $key = $key.Trim()
        if ($key -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
            continue
        }
        if (-not (Get-EnvValue $key)) {
            $value = $value.Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Assert-EnvVar {
    param([string]$Name)
    if (-not (Get-EnvValue $Name)) {
        throw "Missing required deploy variable: $Name. Generate it with: cd infra/platform_cdk; python export_env.py --env $env:ORCHESTRYX_ENV --outputs-file cdk-outputs-$env:ORCHESTRYX_ENV.json"
    }
}

function Confirm-Prod {
    if ($env:ORCHESTRYX_ENV -ne "prod") {
        return
    }
    if ($env:FORCE -eq "true") {
        return
    }

    Write-Host "Production deployment requested."
    Write-Host "Cluster: $env:ORCHESTRYX_ECS_CLUSTER_NAME"
    $confirmation = Read-Host "Type 'deploy prod' to continue"
    if ($confirmation -ne "deploy prod") {
        throw "Aborted."
    }
}

function Write-Plan {
    Write-Host "Deploy target: $Target"
    Write-Host "Environment: $env:ORCHESTRYX_ENV"
    Write-Host "AWS region: $env:AWS_REGION"
    Write-Host "AWS account: $env:AWS_ACCOUNT_ID"
    Write-Host "ECS cluster: $(if ($env:ORCHESTRYX_ECS_CLUSTER_NAME) { $env:ORCHESTRYX_ECS_CLUSTER_NAME } else { 'not-required-for-images-target' })"
    Write-Host "API service: $(if ($env:ORCHESTRYX_API_SERVICE_NAME) { $env:ORCHESTRYX_API_SERVICE_NAME } else { 'not-required-for-images-target' })"
    Write-Host "Worker service: $(if ($env:ORCHESTRYX_WORKER_SERVICE_NAME) { $env:ORCHESTRYX_WORKER_SERVICE_NAME } else { 'not-required-for-images-target' })"
    Write-Host "API ECR repo: $env:ORCHESTRYX_API_ECR_REPO_URI"
    Write-Host "Worker ECR repo: $env:ORCHESTRYX_WORKER_ECR_REPO_URI"
    Write-Host "Image tag: $env:IMAGE_TAG"
    Write-Host "Wait for stability: $env:WAIT_FOR_STABILITY"
}

function Login-Ecr {
    $registry = "$env:AWS_ACCOUNT_ID.dkr.ecr.$env:AWS_REGION.amazonaws.com"
    Write-Host "Logging in to ECR registry $registry..."
    aws ecr get-login-password --region $env:AWS_REGION |
        docker login --username AWS --password-stdin $registry
}

function Update-Service {
    param([string]$ServiceName)

    Write-Host "Forcing ECS redeployment for $ServiceName..."
    aws ecs update-service `
        --cluster $env:ORCHESTRYX_ECS_CLUSTER_NAME `
        --service $ServiceName `
        --force-new-deployment `
        --region $env:AWS_REGION | Out-Null

    if ($env:WAIT_FOR_STABILITY -eq "true") {
        Write-Host "Waiting for $ServiceName to become stable..."
        aws ecs wait services-stable `
            --cluster $env:ORCHESTRYX_ECS_CLUSTER_NAME `
            --services $ServiceName `
            --region $env:AWS_REGION
    }
}

function Build-PushApi {
    $image = "orchestryx-api:$env:IMAGE_TAG"
    $remoteImage = "$env:ORCHESTRYX_API_ECR_REPO_URI`:$env:IMAGE_TAG"

    Write-Host "Building API image..."
    docker build -f Dockerfile -t $image .

    Write-Host "Tagging API image as $remoteImage..."
    docker tag $image $remoteImage

    Write-Host "Pushing API image..."
    docker push $remoteImage
}

function Deploy-Api {
    Build-PushApi
    Update-Service $env:ORCHESTRYX_API_SERVICE_NAME
}

function Build-PushWorker {
    $image = "orchestryx-worker:$env:IMAGE_TAG"
    $remoteImage = "$env:ORCHESTRYX_WORKER_ECR_REPO_URI`:$env:IMAGE_TAG"

    Write-Host "Building worker image..."
    docker build -f Dockerfile.worker -t $image .

    Write-Host "Tagging worker image as $remoteImage..."
    docker tag $image $remoteImage

    Write-Host "Pushing worker image..."
    docker push $remoteImage
}

function Deploy-Worker {
    Build-PushWorker
    Update-Service $env:ORCHESTRYX_WORKER_SERVICE_NAME
}

Set-EnvValueIfMissing "IMAGE_TAG" "latest"
Set-EnvValueIfMissing "WAIT_FOR_STABILITY" "false"
Set-EnvValueIfMissing "FORCE" "false"
$DeployEnvName = Get-EnvValue "ORCHESTRYX_ENV"
if (-not $DeployEnvName) {
    $DeployEnvName = Get-EnvValue "DEPLOY_ENV"
}
if (-not $DeployEnvName) {
    $DeployEnvName = Get-EnvValue "ENV"
}
if (-not $DeployEnvName) {
    $DeployEnvName = "dev"
}

if (Get-EnvValue "ENV_FILE") {
    Import-DeployEnvFile $env:ENV_FILE
} else {
    Import-DeployEnvFile ".env.deploy"
    Import-DeployEnvFile ".env.$DeployEnvName.generated"
}

if (-not (Get-EnvValue "ORCHESTRYX_ENV")) {
    Set-EnvValueIfMissing "ORCHESTRYX_ENV" $DeployEnvName
}

Assert-Command aws
Assert-Command docker

if (-not (Get-EnvValue "AWS_REGION") -and $env:ORCHESTRYX_ENV -ne "prod") {
    Set-EnvValueIfMissing "AWS_REGION" "eu-central-1"
}
if (-not (Get-EnvValue "AWS_ACCOUNT_ID")) {
    $accountId = aws sts get-caller-identity --query Account --output text
    [Environment]::SetEnvironmentVariable("AWS_ACCOUNT_ID", $accountId, "Process")
}

Assert-EnvVar "AWS_REGION"
Assert-EnvVar "AWS_ACCOUNT_ID"
Assert-EnvVar "ORCHESTRYX_API_ECR_REPO_URI"
Assert-EnvVar "ORCHESTRYX_WORKER_ECR_REPO_URI"
if ($Target -ne "images") {
    Assert-EnvVar "ORCHESTRYX_ECS_CLUSTER_NAME"
    Assert-EnvVar "ORCHESTRYX_API_SERVICE_NAME"
    Assert-EnvVar "ORCHESTRYX_WORKER_SERVICE_NAME"
}

Write-Plan
Confirm-Prod
Login-Ecr

switch ($Target) {
    "api" { Deploy-Api }
    "worker" { Deploy-Worker }
    "images" {
        Build-PushApi
        Build-PushWorker
    }
    "all" {
        Deploy-Api
        Deploy-Worker
    }
}

Write-Host "Deployment complete."

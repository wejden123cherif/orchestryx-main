<# 
Build and deploy Orchestryx ECS images.
Usage:
  .\scripts\windows\deploy.ps1          # deploy API and worker
  .\scripts\windows\deploy.ps1 api      # deploy only API
  .\scripts\windows\deploy.ps1 worker   # deploy only worker
#>

param(
    [ValidateSet("all", "api", "worker")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $true
}

$AwsRegion = "eu-central-1"
$AwsAccountId = "254076817005"
$EcsCluster = "orchestryx"
$Registry = "$AwsAccountId.dkr.ecr.$AwsRegion.amazonaws.com"
$EcrApi = "$Registry/orchestryx-api"
$EcrWorker = "$Registry/orchestryx-worker"
$ApiService = "orchestryx-api-service"
$WorkerService = "orchestryx-worker-service"
$ApiTaskRole = "orchestryx-api-task-role"
$ApiSqsPolicyArn = "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
$AlbName = "orchestryx-api-alb"

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Login-Ecr {
    Write-Host "Logging in to ECR in $AwsRegion..."
    aws ecr get-login-password --region $AwsRegion |
        docker login --username AWS --password-stdin $Registry
}

function Ensure-ApiSqsPolicy {
    $attached = aws iam list-attached-role-policies `
        --role-name $ApiTaskRole `
        --query "length(AttachedPolicies[?PolicyArn=='$ApiSqsPolicyArn'])" `
        --output text

    if ($attached -ne "0") {
        Write-Host "API task role already has SQS policy attached."
        return
    }

    Write-Host "Attaching SQS policy to $ApiTaskRole..."
    aws iam attach-role-policy `
        --role-name $ApiTaskRole `
        --policy-arn $ApiSqsPolicyArn
}

function Deploy-Api {
    Ensure-ApiSqsPolicy

    Write-Host "Building API image..."
    docker build -f Dockerfile -t orchestryx-api:latest .

    Write-Host "Tagging API image as ${EcrApi}:latest..."
    docker tag orchestryx-api:latest "${EcrApi}:latest"

    Write-Host "Pushing API image..."
    docker push "${EcrApi}:latest"

    Write-Host "Forcing ECS redeployment for $ApiService..."
    aws ecs update-service `
        --cluster $EcsCluster `
        --service $ApiService `
        --force-new-deployment `
        --region $AwsRegion | Out-Null
}

function Deploy-Worker {
    Write-Host "Building worker image..."
    docker build -f Dockerfile.worker -t orchestryx-worker:latest .

    Write-Host "Tagging worker image as ${EcrWorker}:latest..."
    docker tag orchestryx-worker:latest "${EcrWorker}:latest"

    Write-Host "Pushing worker image..."
    docker push "${EcrWorker}:latest"

    Write-Host "Forcing ECS redeployment for $WorkerService..."
    aws ecs update-service `
        --cluster $EcsCluster `
        --service $WorkerService `
        --force-new-deployment `
        --region $AwsRegion | Out-Null
}

function Write-ApiUrl {
    try {
        $albDnsName = aws elbv2 describe-load-balancers `
            --names $AlbName `
            --region $AwsRegion `
            --query "LoadBalancers[0].DNSName" `
            --output text 2>$null

        if ($albDnsName -and $albDnsName -ne "None") {
            Write-Host "Public API URL: http://$albDnsName"
            return
        }
    } catch {
    }

    Write-Host "No ALB found yet. Run .\scripts\windows\setup-aws.ps1 to create the public API URL."
}

Assert-Command aws
Assert-Command docker

Login-Ecr

switch ($Target) {
    "api" { Deploy-Api }
    "worker" { Deploy-Worker }
    "all" {
        Deploy-Api
        Deploy-Worker
    }
}

Write-Host "Deployment complete."
Write-ApiUrl

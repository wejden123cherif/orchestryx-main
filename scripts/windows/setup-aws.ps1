$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $true
}

<#
Legacy/manual bootstrap helper. Prefer infra/platform_cdk/ for active
infrastructure changes.

Idempotent one-time AWS setup for Orchestryx.
This documents and automates the resources that were already created in the
current eu-central-1 account. It is safe to run again: existing resources are
detected and skipped where practical.
#>

$AwsRegion = "eu-central-1"
$AwsAccountId = "254076817005"
$EcsCluster = "orchestryx"
$VpcId = "vpc-0d10f5a5902d4ffd4"
$Subnets = @("subnet-09b0a64b46e90bf03", "subnet-0f3460c06ddf5ecc9", "subnet-0ff556deb9702ca2a")

$ApiRepo = "orchestryx-api"
$WorkerRepo = "orchestryx-worker"
$SecretName = "orchestryx/api/env"
$SecretArn = "arn:aws:secretsmanager:${AwsRegion}:${AwsAccountId}:secret:orchestryx/api/env-J7WB6D"
$AuroraEndpoint = "orchestryx-db.cluster-cz86ciucmlhr.eu-central-1.rds.amazonaws.com"
$AuroraCluster = "orchestryx-db"
$AuroraInstance = "orchestryx-db-writer"
$AuroraDbName = "orchestryx"
$AuroraSubnetGroup = "orchestryx-db-subnets"
$AuroraMinCapacity = "0.5"
$AuroraMaxCapacity = "2"

$ExecutionRole = "orchestryx-ecs-execution-role"
$ApiTaskRole = "orchestryx-api-task-role"
$WorkerTaskRole = "orchestryx-worker-task-role"
$TrustPolicyFile = "scripts/aws/iam/ecs-task-trust-policy.json"
$ApiTaskFile = "scripts/aws/task-definitions/api-task.json"
$WorkerTaskFile = "scripts/aws/task-definitions/worker-task.json"

$ApiSgName = "orchestryx-api-sg"
$WorkerSgName = "orchestryx-worker-sg"
$AlbSgName = "orchestryx-alb-sg"
$ApiSgId = "sg-0205b75f583ebfa25"
$WorkerSgId = "sg-0db089ffb994e8272"
$AlbSgId = ""
$AuroraSgId = "sg-0088ffc271e2fa353"

$ApiLogGroup = "/ecs/orchestryx-api"
$WorkerLogGroup = "/ecs/orchestryx-worker"
$ApiService = "orchestryx-api-service"
$WorkerService = "orchestryx-worker-service"
$AlbName = "orchestryx-api-alb"
$TargetGroupName = "orchestryx-api-tg"
$ApiContainerName = "orchestryx-api"
$ApiContainerPort = 8000

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Write-Section {
    param([string]$Name)
    Write-Host ""
    Write-Host "==> $Name"
}

function Test-EcrRepository {
    param([string]$Name)
    try {
        aws ecr describe-repositories --repository-names $Name --region $AwsRegion | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Ensure-EcrRepository {
    param([string]$Name)
    if (Test-EcrRepository $Name) {
        Write-Host "ECR repository $Name already exists; skipping."
    } else {
        aws ecr create-repository --repository-name $Name --region $AwsRegion | Out-Null
        Write-Host "Created ECR repository $Name."
    }
}

function Ensure-EcsCluster {
    $count = aws ecs describe-clusters `
        --clusters $EcsCluster `
        --region $AwsRegion `
        --query "clusters[?status!='INACTIVE'] | length(@)" `
        --output text

    if ($count -ne "0") {
        Write-Host "ECS cluster $EcsCluster already exists; skipping."
    } else {
        aws ecs create-cluster --cluster-name $EcsCluster --region $AwsRegion | Out-Null
        Write-Host "Created ECS cluster $EcsCluster."
    }
}

function Ensure-Role {
    param([string]$Name)
    try {
        aws iam get-role --role-name $Name | Out-Null
        Write-Host "IAM role $Name already exists; skipping create."
    } catch {
        aws iam create-role `
            --role-name $Name `
            --assume-role-policy-document "file://$TrustPolicyFile" | Out-Null
        Write-Host "Created IAM role $Name."
    }
}

function Ensure-PolicyAttached {
    param(
        [string]$RoleName,
        [string]$PolicyArn
    )

    $count = aws iam list-attached-role-policies `
        --role-name $RoleName `
        --query "AttachedPolicies[?PolicyArn=='$PolicyArn'] | length(@)" `
        --output text

    if ($count -ne "0") {
        Write-Host "Policy already attached to ${RoleName}: $PolicyArn"
    } else {
        aws iam attach-role-policy --role-name $RoleName --policy-arn $PolicyArn
        Write-Host "Attached policy to ${RoleName}: $PolicyArn"
    }
}

function Resolve-OrCreateSecurityGroup {
    param(
        [string]$DesiredId,
        [string]$Name,
        [string]$Description
    )

    if (-not [string]::IsNullOrWhiteSpace($DesiredId)) {
        try {
            aws ec2 describe-security-groups --group-ids $DesiredId --region $AwsRegion | Out-Null
            return $DesiredId
        } catch {
        }
    }

    try {
        $discovered = aws ec2 describe-security-groups `
            --region $AwsRegion `
            --filters "Name=group-name,Values=$Name" "Name=vpc-id,Values=$VpcId" `
            --query "SecurityGroups[0].GroupId" `
            --output text

        if ($discovered -and $discovered -ne "None") {
            return $discovered
        }

        return aws ec2 create-security-group `
            --group-name $Name `
            --description $Description `
            --vpc-id $VpcId `
            --region $AwsRegion `
            --query "GroupId" `
            --output text
    } catch {
        throw
    }
}

function Ensure-TargetGroup {
    try {
        $targetGroupArn = aws elbv2 describe-target-groups `
            --names $TargetGroupName `
            --region $AwsRegion `
            --query "TargetGroups[0].TargetGroupArn" `
            --output text 2>$null
        if ($targetGroupArn -and $targetGroupArn -ne "None") {
            return $targetGroupArn
        }
    } catch {
    }

    return aws elbv2 create-target-group `
        --name $TargetGroupName `
        --protocol HTTP `
        --port $ApiContainerPort `
        --vpc-id $VpcId `
        --target-type ip `
        --health-check-protocol HTTP `
        --health-check-path /health `
        --health-check-interval-seconds 30 `
        --health-check-timeout-seconds 5 `
        --healthy-threshold-count 2 `
        --unhealthy-threshold-count 3 `
        --matcher HttpCode=200 `
        --region $AwsRegion `
        --query "TargetGroups[0].TargetGroupArn" `
        --output text
}

function Ensure-LoadBalancer {
    try {
        $albArn = aws elbv2 describe-load-balancers `
            --names $AlbName `
            --region $AwsRegion `
            --query "LoadBalancers[0].LoadBalancerArn" `
            --output text 2>$null
        if ($albArn -and $albArn -ne "None") {
            return $albArn
        }
    } catch {
    }

    return aws elbv2 create-load-balancer `
        --name $AlbName `
        --type application `
        --scheme internet-facing `
        --ip-address-type ipv4 `
        --security-groups $AlbSgId `
        --subnets $Subnets[0] $Subnets[1] `
        --region $AwsRegion `
        --query "LoadBalancers[0].LoadBalancerArn" `
        --output text
}

function Ensure-HttpListener {
    param([string]$AlbArn, [string]$TargetGroupArn)

    $listenerArn = aws elbv2 describe-listeners `
        --load-balancer-arn $AlbArn `
        --region $AwsRegion `
        --query "Listeners[?Port==``80``].ListenerArn | [0]" `
        --output text

    if ($listenerArn -and $listenerArn -ne "None") {
        Write-Host "ALB HTTP listener already exists."
        return
    }

    aws elbv2 create-listener `
        --load-balancer-arn $AlbArn `
        --protocol HTTP `
        --port 80 `
        --default-actions "Type=forward,TargetGroupArn=$TargetGroupArn" `
        --region $AwsRegion | Out-Null
    Write-Host "Created ALB HTTP listener on port 80."
}

function Get-AlbDnsName {
    return aws elbv2 describe-load-balancers `
        --names $AlbName `
        --region $AwsRegion `
        --query "LoadBalancers[0].DNSName" `
        --output text
}

function Invoke-IgnoreDuplicateIngress {
    param([scriptblock]$Command, [string]$SuccessMessage, [string]$DuplicateMessage)
    try {
        & $Command | Out-Null
        Write-Host $SuccessMessage
    } catch {
        $message = $_.Exception.Message
        if ($message -match "InvalidPermission\.Duplicate") {
            Write-Host $DuplicateMessage
        } else {
            throw
        }
    }
}

function Ensure-LogGroup {
    param([string]$Name)
    try {
        aws logs create-log-group --log-group-name $Name --region $AwsRegion | Out-Null
        Write-Host "Created log group $Name."
    } catch {
        $message = $_.Exception.Message
        if ($message -match "ResourceAlreadyExistsException") {
            Write-Host "Log group $Name already exists; skipping."
        } else {
            throw
        }
    }
}

function Ensure-Secret {
    try {
        aws secretsmanager describe-secret --secret-id $SecretName --region $AwsRegion | Out-Null
        Write-Host "Secret $SecretName already exists; skipping create."
        return
    } catch {
        Write-Host "Creating $SecretName. Values are not printed."
    }

    $dbUser = Read-Host "Aurora database username [orchestryx]"
    if ([string]::IsNullOrWhiteSpace($dbUser)) {
        $dbUser = "orchestryx"
    }

    $securePassword = Read-Host "Aurora database password" -AsSecureString
    $dbPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
    $cognitoClientId = Read-Host "Cognito app client ID"

    if ([string]::IsNullOrWhiteSpace($dbPassword) -or [string]::IsNullOrWhiteSpace($cognitoClientId)) {
        throw "Aurora password and Cognito app client ID are required to create the secret."
    }

    $secretBody = [ordered]@{
        DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@${AuroraEndpoint}:5432/orchestryx"
        SQL_ECHO = "false"
        DB_SSL_MODE = "require"
        AWS_REGION = $AwsRegion
        AWS_ACCOUNT_ID = $AwsAccountId
        COGNITO_USER_POOL_ID = "eu-central-1_FCduBIpFa"
        COGNITO_APP_CLIENT_ID = $cognitoClientId
        PROVISION_QUEUE = "orchestryx-provision-lab"
        DESTROY_QUEUE = "orchestryx-destroy-lab"
        SQS_PROVISION_URL = "https://sqs.eu-central-1.amazonaws.com/254076817005/orchestryx-provision-lab"
        SQS_DESTROY_URL = "https://sqs.eu-central-1.amazonaws.com/254076817005/orchestryx-destroy-lab"
        CORS_ALLOWED_ORIGINS = "http://localhost:3000"
        LAB_RUNTIME_ENABLED = "false"
    } | ConvertTo-Json -Compress

    $tmp = New-TemporaryFile
    Set-Content -LiteralPath $tmp.FullName -Value $secretBody -NoNewline
    aws secretsmanager create-secret `
        --name $SecretName `
        --region $AwsRegion `
        --secret-string "file://$($tmp.FullName)" | Out-Null
    Remove-Item -LiteralPath $tmp.FullName -Force
    Write-Host "Created secret $SecretName."
}

function Get-DatabaseConfigFromSecret {
    $secretString = aws secretsmanager get-secret-value `
        --secret-id $SecretName `
        --region $AwsRegion `
        --query SecretString `
        --output text

    $secret = $secretString | ConvertFrom-Json
    $databaseUrl = [Uri]$secret.DATABASE_URL
    $userInfoParts = $databaseUrl.UserInfo.Split(":", 2)
    $dbUser = [Uri]::UnescapeDataString($userInfoParts[0])
    $dbPassword = ""
    if ($userInfoParts.Count -gt 1) {
        $dbPassword = [Uri]::UnescapeDataString($userInfoParts[1])
    }
    $dbName = $databaseUrl.AbsolutePath.TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($dbName)) {
        $dbName = $AuroraDbName
    }

    if ([string]::IsNullOrWhiteSpace($dbUser) -or [string]::IsNullOrWhiteSpace($dbPassword)) {
        throw "DATABASE_URL in $SecretName must include a database username and password."
    }

    return @{
        Username = $dbUser
        Password = $dbPassword
        Database = $dbName
    }
}

function Ensure-DbSubnetGroup {
    try {
        aws rds describe-db-subnet-groups `
            --db-subnet-group-name $AuroraSubnetGroup `
            --region $AwsRegion | Out-Null
        Write-Host "DB subnet group $AuroraSubnetGroup already exists; skipping."
        return
    } catch {
    }

    aws rds create-db-subnet-group `
        --db-subnet-group-name $AuroraSubnetGroup `
        --db-subnet-group-description "Orchestryx Aurora subnet group" `
        --subnet-ids $Subnets `
        --region $AwsRegion | Out-Null
    Write-Host "Created DB subnet group $AuroraSubnetGroup."
}

function Test-DbCluster {
    try {
        aws rds describe-db-clusters `
            --db-cluster-identifier $AuroraCluster `
            --region $AwsRegion | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-DbInstance {
    try {
        aws rds describe-db-instances `
            --db-instance-identifier $AuroraInstance `
            --region $AwsRegion | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Ensure-AuroraDatabase {
    $dbConfig = Get-DatabaseConfigFromSecret
    Ensure-DbSubnetGroup

    if (Test-DbCluster) {
        Write-Host "Aurora cluster $AuroraCluster already exists; skipping create."
    } else {
        aws rds create-db-cluster `
            --db-cluster-identifier $AuroraCluster `
            --engine aurora-postgresql `
            --engine-mode provisioned `
            --database-name $($dbConfig.Database) `
            --master-username $($dbConfig.Username) `
            --master-user-password $($dbConfig.Password) `
            --db-subnet-group-name $AuroraSubnetGroup `
            --vpc-security-group-ids $AuroraSgId `
            --serverless-v2-scaling-configuration "MinCapacity=$AuroraMinCapacity,MaxCapacity=$AuroraMaxCapacity" `
            --backup-retention-period 7 `
            --deletion-protection `
            --region $AwsRegion | Out-Null
        Write-Host "Created Aurora cluster $AuroraCluster."
    }

    if (Test-DbInstance) {
        Write-Host "Aurora writer instance $AuroraInstance already exists; skipping create."
    } else {
        aws rds create-db-instance `
            --db-instance-identifier $AuroraInstance `
            --db-cluster-identifier $AuroraCluster `
            --engine aurora-postgresql `
            --db-instance-class db.serverless `
            --no-publicly-accessible `
            --region $AwsRegion | Out-Null
        Write-Host "Created Aurora writer instance $AuroraInstance."
    }

    Write-Host "Waiting for Aurora writer instance to become available..."
    aws rds wait db-instance-available `
        --db-instance-identifier $AuroraInstance `
        --region $AwsRegion
    Write-Host "Aurora is available at $AuroraEndpoint."
}

function Test-TaskDefinition {
    param([string]$Family)
    try {
        aws ecs describe-task-definition --task-definition $Family --region $AwsRegion | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Ensure-TaskDefinition {
    param([string]$Family, [string]$File)
    if (Test-TaskDefinition $Family) {
        Write-Host "Task definition $Family already exists; skipping registration."
    } else {
        aws ecs register-task-definition --region $AwsRegion --cli-input-json "file://$File" | Out-Null
        Write-Host "Registered task definition $Family."
    }
}

function Test-Service {
    param([string]$Name)
    $count = aws ecs describe-services `
        --cluster $EcsCluster `
        --services $Name `
        --region $AwsRegion `
        --query "services[?status!='INACTIVE'] | length(@)" `
        --output text
    return $count -ne "0"
}

function Ensure-Service {
    param(
        [string]$Name,
        [string]$TaskDefinition,
        [string]$SecurityGroup,
        [string]$TargetGroupArn = ""
    )

    $loadBalancerArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($TargetGroupArn)) {
        $loadBalancerArgs = @(
            "--load-balancers",
            "targetGroupArn=$TargetGroupArn,containerName=$ApiContainerName,containerPort=$ApiContainerPort",
            "--health-check-grace-period-seconds",
            "60"
        )
    }

    if (Test-Service $Name) {
        if ([string]::IsNullOrWhiteSpace($TargetGroupArn)) {
            Write-Host "ECS service $Name already exists; skipping create."
            return
        }

        Write-Host "ECS service $Name already exists; ensuring latest load balancer settings."
        aws ecs update-service `
            --cluster $EcsCluster `
            --service $Name `
            @loadBalancerArgs `
            --region $AwsRegion | Out-Null
    } else {
        aws ecs create-service `
            --cluster $EcsCluster `
            --service-name $Name `
            --task-definition $TaskDefinition `
            --desired-count 1 `
            --launch-type FARGATE `
            --network-configuration "awsvpcConfiguration={subnets=[$($Subnets[0]),$($Subnets[1])],securityGroups=[$SecurityGroup],assignPublicIp=ENABLED}" `
            @loadBalancerArgs `
            --region $AwsRegion | Out-Null
        Write-Host "Created ECS service $Name."
    }
}

Assert-Command aws

Write-Section "ECR repositories"
Ensure-EcrRepository $ApiRepo
Ensure-EcrRepository $WorkerRepo

Write-Section "ECS cluster"
Ensure-EcsCluster

Write-Section "IAM roles"
Ensure-Role $ExecutionRole
Ensure-PolicyAttached $ExecutionRole "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
Ensure-PolicyAttached $ExecutionRole "arn:aws:iam::aws:policy/SecretsManagerReadWrite"

Ensure-Role $ApiTaskRole
Ensure-PolicyAttached $ApiTaskRole "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
Ensure-PolicyAttached $ApiTaskRole "arn:aws:iam::aws:policy/AmazonSQSFullAccess"
Ensure-PolicyAttached $ApiTaskRole "arn:aws:iam::aws:policy/SecretsManagerReadWrite"

Ensure-Role $WorkerTaskRole
Ensure-PolicyAttached $WorkerTaskRole "arn:aws:iam::aws:policy/AmazonSQSFullAccess"

Write-Section "Security groups"
$ApiSgId = Resolve-OrCreateSecurityGroup $ApiSgId $ApiSgName "Orchestryx API"
$WorkerSgId = Resolve-OrCreateSecurityGroup $WorkerSgId $WorkerSgName "Orchestryx worker"
$AlbSgId = Resolve-OrCreateSecurityGroup $AlbSgId $AlbSgName "Orchestryx public API load balancer"
Write-Host "Using API security group $ApiSgId."
Write-Host "Using worker security group $WorkerSgId."
Write-Host "Using ALB security group $AlbSgId."

Invoke-IgnoreDuplicateIngress `
    -Command { aws ec2 authorize-security-group-ingress --group-id $AlbSgId --protocol tcp --port 80 --cidr "0.0.0.0/0" --region $AwsRegion } `
    -SuccessMessage "Added ALB ingress tcp:80 from 0.0.0.0/0." `
    -DuplicateMessage "ALB ingress tcp:80 already exists; skipping."

Invoke-IgnoreDuplicateIngress `
    -Command { aws ec2 authorize-security-group-ingress --group-id $ApiSgId --protocol tcp --port 8000 --source-group $AlbSgId --region $AwsRegion } `
    -SuccessMessage "Allowed ALB security group to reach API tasks on tcp:8000." `
    -DuplicateMessage "API ingress from ALB security group already exists; skipping."

Invoke-IgnoreDuplicateIngress `
    -Command { aws ec2 authorize-security-group-ingress --group-id $AuroraSgId --protocol tcp --port 5432 --source-group $ApiSgId --region $AwsRegion } `
    -SuccessMessage "Allowed API security group to reach Aurora on tcp:5432." `
    -DuplicateMessage "Aurora ingress from API security group already exists; skipping."

Invoke-IgnoreDuplicateIngress `
    -Command { aws ec2 authorize-security-group-ingress --group-id $AuroraSgId --protocol tcp --port 5432 --source-group $WorkerSgId --region $AwsRegion } `
    -SuccessMessage "Allowed worker security group to reach Aurora on tcp:5432." `
    -DuplicateMessage "Aurora ingress from worker security group already exists; skipping."

Write-Section "Application Load Balancer"
$TargetGroupArn = Ensure-TargetGroup
$AlbArn = Ensure-LoadBalancer
Ensure-HttpListener $AlbArn $TargetGroupArn
$AlbDnsName = Get-AlbDnsName
Write-Host "ALB URL: http://$AlbDnsName"

Write-Section "CloudWatch log groups"
Ensure-LogGroup $ApiLogGroup
Ensure-LogGroup $WorkerLogGroup

Write-Section "Secrets Manager"
Ensure-Secret

Write-Section "Aurora PostgreSQL"
Ensure-AuroraDatabase

Write-Section "ECS task definitions"
Ensure-TaskDefinition "orchestryx-api" $ApiTaskFile
Ensure-TaskDefinition "orchestryx-worker" $WorkerTaskFile

Write-Section "ECS services"
Ensure-Service $ApiService "orchestryx-api" $ApiSgId $TargetGroupArn
Ensure-Service $WorkerService "orchestryx-worker" $WorkerSgId

Write-Host ""
Write-Host "AWS setup complete."
Write-Host "Public API URL: http://$AlbDnsName"
Write-Host "Documented secret ARN for existing environment: $SecretArn"

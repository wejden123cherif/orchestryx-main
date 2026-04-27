# Orchestryx AWS Overview Script
# Shows every deployed resource in eu-central-1
# Usage: .\aws-overview.ps1

$REGION = "eu-central-1"
$CLUSTER = "orchestryx"

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  ORCHESTRYX AWS OVERVIEW" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# ─── ECS CLUSTER ───
Write-Host "`n[ECS CLUSTER]" -ForegroundColor Yellow
aws ecs describe-clusters --clusters $CLUSTER --region $REGION --query "clusters[0].{name:clusterName,status:status,running:runningTasksCount,pending:pendingTasksCount,services:activeServicesCount}" --output table

# ─── ECS SERVICES ───
Write-Host "`n[ECS SERVICES]" -ForegroundColor Yellow
aws ecs describe-services --cluster $CLUSTER --services orchestryx-api-service orchestryx-worker-service --region $REGION --query "services[*].{name:serviceName,status:status,desired:desiredCount,running:runningCount,pending:pendingCount,task:taskDefinition}" --output table

# ─── ECS RUNNING TASKS ───
Write-Host "`n[RUNNING TASKS]" -ForegroundColor Yellow
$TASKS = aws ecs list-tasks --cluster $CLUSTER --region $REGION --query "taskArns" --output text
if ($TASKS) {
    aws ecs describe-tasks --cluster $CLUSTER --tasks $TASKS --region $REGION --query "tasks[*].{task:taskArn,status:lastStatus,health:healthStatus,started:startedAt,cpu:cpu,memory:memory}" --output table
} else {
    Write-Host "No running tasks" -ForegroundColor Red
}

# ─── TASK PUBLIC IPS ───
Write-Host "`n[TASK PUBLIC IPs]" -ForegroundColor Yellow
$TASK_ARNS = (aws ecs list-tasks --cluster $CLUSTER --region $REGION --query "taskArns" --output json | ConvertFrom-Json)
foreach ($TASK in $TASK_ARNS) {
    $ENI = aws ecs describe-tasks --cluster $CLUSTER --tasks $TASK --region $REGION --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text
    if ($ENI) {
        $IP = aws ec2 describe-network-interfaces --network-interface-ids $ENI --region $REGION --query "NetworkInterfaces[0].Association.PublicIp" --output text
        $TASK_SHORT = $TASK.Split("/")[-1].Substring(0,8)
        Write-Host "Task $TASK_SHORT ... Public IP: $IP" -ForegroundColor Green
    }
}

# ─── ECR REPOS ───
Write-Host "`n[ECR REPOSITORIES]" -ForegroundColor Yellow
aws ecr describe-repositories --region $REGION --query "repositories[*].{name:repositoryName,uri:repositoryUri,pushed:createdAt}" --output table

# ─── ECR LATEST IMAGES ───
Write-Host "`n[ECR LATEST IMAGES]" -ForegroundColor Yellow
foreach ($REPO in @("orchestryx-api", "orchestryx-worker")) {
    Write-Host "  $REPO" -ForegroundColor Cyan
    aws ecr describe-images --repository-name $REPO --region $REGION --query "imageDetails[-1].{digest:imageDigest,tags:imageTags,pushed:imagePushedAt,size:imageSizeInBytes}" --output table
}

# ─── AURORA ───
Write-Host "`n[AURORA DATABASE]" -ForegroundColor Yellow
aws rds describe-db-clusters --db-cluster-identifier orchestryx-db --region $REGION --query "DBClusters[0].{id:DBClusterIdentifier,status:Status,engine:Engine,endpoint:Endpoint,port:Port,capacity:ServerlessV2ScalingConfiguration}" --output table

# ─── SQS QUEUES ───
Write-Host "`n[SQS QUEUES]" -ForegroundColor Yellow
foreach ($QUEUE in @("orchestryx-provision-lab", "orchestryx-destroy-lab")) {
    $URL = "https://sqs.$REGION.amazonaws.com/254076817005/$QUEUE"
    Write-Host "  $QUEUE" -ForegroundColor Cyan
    aws sqs get-queue-attributes --queue-url $URL --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible --region $REGION --output table
}

# ─── SECRETS MANAGER ───
Write-Host "`n[SECRETS MANAGER]" -ForegroundColor Yellow
aws secretsmanager list-secrets --region $REGION --query "SecretList[?contains(Name,'orchestryx')].{name:Name,arn:ARN,updated:LastChangedDate}" --output table

# ─── IAM ROLES ───
Write-Host "`n[IAM ROLES]" -ForegroundColor Yellow
foreach ($ROLE in @("orchestryx-ecs-execution-role", "orchestryx-api-task-role", "orchestryx-worker-task-role")) {
    $POLICIES = aws iam list-attached-role-policies --role-name $ROLE --query "AttachedPolicies[*].PolicyName" --output text
    Write-Host "  $ROLE" -ForegroundColor Cyan
    Write-Host "    Policies: $POLICIES" -ForegroundColor Gray
}

# ─── SECURITY GROUPS ───
Write-Host "`n[SECURITY GROUPS]" -ForegroundColor Yellow
aws ec2 describe-security-groups --group-ids sg-0205b75f583ebfa25 sg-0db089ffb994e8272 sg-0088ffc271e2fa353 --region $REGION --query "SecurityGroups[*].{name:GroupName,id:GroupId,inbound:length(IpPermissions)}" --output table

# ─── CLOUDWATCH LOG GROUPS ───
Write-Host "`n[CLOUDWATCH LOG GROUPS]" -ForegroundColor Yellow
aws logs describe-log-groups --log-group-name-prefix /ecs/orchestryx --region $REGION --query "logGroups[*].{name:logGroupName,streams:metricFilterCount,retention:retentionInDays,bytes:storedBytes}" --output table

# ─── COGNITO ───
Write-Host "`n[COGNITO]" -ForegroundColor Yellow
aws cognito-idp describe-user-pool --user-pool-id eu-central-1_FCduBIpFa --region $REGION --query "UserPool.{name:Name,id:Id,users:EstimatedNumberOfUsers,status:Status}" --output table

# ─── CLOUDFORMATION STACKS (lab stacks) ───
Write-Host "`n[CLOUDFORMATION STACKS]" -ForegroundColor Yellow
aws cloudformation describe-stacks --region $REGION --query "Stacks[?contains(StackName,'orchestryx')].{name:StackName,status:StackStatus,created:CreationTime}" --output table

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  END OF OVERVIEW" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "`nAPI Health Check:" -ForegroundColor Yellow
Write-Host "  Get task IP from [TASK PUBLIC IPs] above then run:" -ForegroundColor Gray
Write-Host "  curl http://<IP>:8000/health" -ForegroundColor Green
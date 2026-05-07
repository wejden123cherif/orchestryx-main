.PHONY: deploy deploy-api deploy-worker logs-api logs-worker status restart-api restart-worker setup-aws cockpit push-sqli-lab push-php-rce-lab push-lfi-lab push-custom-labs

# AWS / ECR configuration.
# These values must match the AWS account and region used by the API seeds.
AWS_ACCOUNT_ID = 254076817005
AWS_REGION     = eu-central-1
ECR_REGISTRY   = $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

deploy:
	./scripts/linux/deploy.sh

deploy-api:
	./scripts/linux/deploy.sh api

deploy-worker:
	./scripts/linux/deploy.sh worker

logs-api:
	aws logs tail /ecs/orchestryx-api --follow --region eu-central-1

logs-worker:
	aws logs tail /ecs/orchestryx-worker --follow --region eu-central-1

status:
	aws ecs describe-services --cluster orchestryx --services orchestryx-api-service orchestryx-worker-service --region eu-central-1 --query "services[*].{name:serviceName,running:runningCount,pending:pendingCount,desired:desiredCount}"

restart-api:
	aws ecs update-service --cluster orchestryx --service orchestryx-api-service --force-new-deployment --region eu-central-1

restart-worker:
	aws ecs update-service --cluster orchestryx --service orchestryx-worker-service --force-new-deployment --region eu-central-1

setup-aws:
	bash scripts/linux/setup-aws.sh

cockpit:
	cd cockpit && uvicorn main:app --reload --port 9000

# Build and publish the NexBank SQLi lab image.
# The catalog seed points web-nexbank-01 at this ECR URI.
push-sqli-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/sqli-lab --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/sqli-lab:latest labs/sqli-lab/
	@echo "Tagging for ECR"
	docker tag orchestryx/sqli-lab:latest $(ECR_REGISTRY)/orchestryx/sqli-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/sqli-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/sqli-lab:latest"

# Build and publish the CloudDrop PHP RCE lab image.
# This is separate from the SQLi image so each catalog template can pull its
# own lab app without sharing files or runtime assumptions.
push-php-rce-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/php-rce-lab --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/php-rce-lab:latest labs/php-rce-lab/
	@echo "Tagging for ECR"
	docker tag orchestryx/php-rce-lab:latest $(ECR_REGISTRY)/orchestryx/php-rce-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/php-rce-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/php-rce-lab:latest"

# Build and publish the Herald LFI lab image.
# This lab has its own Docker context and ECR repository so Start Lab can pull
# the exact container for the LFI template without touching other labs.
push-lfi-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/lfi-lab --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/lfi-lab:latest labs/lfi-lab/
	@echo "Tagging for ECR"
	docker tag orchestryx/lfi-lab:latest $(ECR_REGISTRY)/orchestryx/lfi-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/lfi-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/lfi-lab:latest"

# Build and publish every custom ECR-backed lab image used by the active catalog.
# Docker Hub labs do not need this target; the EC2 host pulls them directly.
push-custom-labs: push-sqli-lab push-php-rce-lab push-lfi-lab

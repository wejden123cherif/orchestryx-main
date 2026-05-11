.PHONY: deploy deploy-api deploy-worker deploy-dev logs-api logs-worker status \
        restart-api restart-worker setup-aws aws-status \
        platform-synth-dev platform-diff-dev platform-deploy-dev \
        platform-export-dev platform-destroy-dev \
        run-migrations-dev \
        push-sqli-lab push-php-rce-lab push-lfi-lab \
        push-dfir-lab push-malware-lab push-networking-lab push-custom-labs \
        migrate migrate-docker db-shell test \
        web-install web-dev web-build web-typecheck web-lint

# ── AWS / ECR configuration ───────────────────────────────────────────────────
# Read from environment so the Makefile works across accounts without edits.
# Set these in your shell or source .env.dev.generated before running targets:
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=eu-central-1
AWS_ACCOUNT_ID ?= $(shell aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "ACCOUNT_ID_NOT_SET")
AWS_REGION     ?= eu-central-1
ECR_REGISTRY    = $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

# ── ECS runtime names (dev defaults; override from .env.dev.generated) ────────
# Source .env.dev.generated in your shell before running ecs/log targets:
#   . .env.dev.generated  (bash/zsh)
#   Get-Content .env.dev.generated | ForEach-Object { ... }  (PowerShell - use deploy.ps1 instead)
CLUSTER_NAME     ?= orchestryx-dev
API_SERVICE      ?= orchestryx-dev-api-service
WORKER_SERVICE   ?= orchestryx-dev-worker-service
API_LOG_GROUP    ?= /ecs/orchestryx-dev-api
WORKER_LOG_GROUP ?= /ecs/orchestryx-dev-worker

# ── Database migrations ───────────────────────────────────────────────────────

## Run Alembic migrations against the DATABASE_URL in your environment / .env.
migrate:
	alembic upgrade head

## Run Alembic migrations inside Docker Compose (starts db if needed).
migrate-docker:
	docker compose run --rm migrate

## Open a psql shell against the local Docker Compose database.
db-shell:
	docker compose exec db psql -U orchestryx -d orchestryx

# ── Tests ─────────────────────────────────────────────────────────────────────

test:
	pytest tests/ -v

# ── Web frontend ──────────────────────────────────────────────────────────────

web-install:
	cd apps/web && npm install

web-dev:
	cd apps/web && npm run dev

web-build:
	cd apps/web && npm run build

web-typecheck:
	cd apps/web && npm run typecheck

web-lint:
	cd apps/web && npm run lint

# ── Deployment ────────────────────────────────────────────────────────────────

# Linux/macOS/WSL image deploy aliases.
# On Windows use: .\scripts\windows\deploy.ps1 [images|api|worker|all]
# Prerequisite: source .env.dev.generated and ensure ECS services exist before
# running "all", "api", or "worker" targets. Use "images" target to push without
# triggering an ECS redeployment (safe before EcsPlatformStack is deployed).
deploy:
	./scripts/linux/deploy.sh

deploy-api:
	./scripts/linux/deploy.sh api

deploy-worker:
	./scripts/linux/deploy.sh worker

deploy-dev:
	ORCHESTRYX_ENV=dev ./scripts/linux/deploy.sh

platform-synth-dev:
	cd infra/platform_cdk && cdk synth -c env=dev

platform-diff-dev:
	cd infra/platform_cdk && cdk diff -c env=dev

platform-deploy-dev:
	cd infra/platform_cdk && cdk deploy --all -c env=dev --outputs-file cdk-outputs-dev.json

platform-export-dev:
	cd infra/platform_cdk && python export_env.py --env dev --outputs-file cdk-outputs-dev.json

platform-destroy-dev:
	cd infra/platform_cdk && cdk destroy --all -c env=dev

## Run the one-off Alembic migration task inside ECS Fargate (Linux/macOS/WSL).
## On Windows use: .\scripts\windows\run-migrations.ps1
## Requires .env.dev.generated (run make platform-export-dev first).
run-migrations-dev:
	./scripts/linux/run-migrations.sh

logs-api:
	aws logs tail $(API_LOG_GROUP) --follow --region $(AWS_REGION)

logs-worker:
	aws logs tail $(WORKER_LOG_GROUP) --follow --region $(AWS_REGION)

status:
	aws ecs describe-services \
	  --cluster $(CLUSTER_NAME) \
	  --services $(API_SERVICE) $(WORKER_SERVICE) \
	  --region $(AWS_REGION) \
	  --query "services[*].{name:serviceName,running:runningCount,pending:pendingCount,desired:desiredCount}"

restart-api:
	aws ecs update-service --cluster $(CLUSTER_NAME) --service $(API_SERVICE) \
	  --force-new-deployment --region $(AWS_REGION)

restart-worker:
	aws ecs update-service --cluster $(CLUSTER_NAME) --service $(WORKER_SERVICE) \
	  --force-new-deployment --region $(AWS_REGION)

setup-aws:
	@if [ "$$FORCE_LEGACY_SETUP" != "true" ]; then \
	  echo "setup-aws is a legacy/manual bootstrap helper. Use infra/platform_cdk for active infrastructure."; \
	  echo "Run with FORCE_LEGACY_SETUP=true only if you intentionally need the legacy setup script."; \
	  exit 1; \
	fi
	bash scripts/linux/setup-aws.sh

aws-status:
	python scripts/aws/status.py

# ── Lab image builds ──────────────────────────────────────────────────────────

## Build and publish the NexBank SQLi lab image.
push-sqli-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/sqli-lab \
	  --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/sqli-lab:latest labs/sqli-lab/
	@echo "Tagging for ECR"
	docker tag orchestryx/sqli-lab:latest $(ECR_REGISTRY)/orchestryx/sqli-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/sqli-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/sqli-lab:latest"

## Build and publish the CloudDrop PHP RCE lab image.
push-php-rce-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/php-rce-lab \
	  --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/php-rce-lab:latest labs/php-rce-lab/
	@echo "Tagging for ECR"
	docker tag orchestryx/php-rce-lab:latest $(ECR_REGISTRY)/orchestryx/php-rce-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/php-rce-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/php-rce-lab:latest"

## Build and publish the Herald LFI lab image.
push-lfi-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/lfi-lab \
	  --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/lfi-lab:latest labs/lfi-lab/
	@echo "Tagging for ECR"
	docker tag orchestryx/lfi-lab:latest $(ECR_REGISTRY)/orchestryx/lfi-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/lfi-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/lfi-lab:latest"

## Build and publish the MemoryGhost DFIR lab image.
push-dfir-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/dfir-lab \
	  --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/dfir-lab:latest labs/dfir/
	@echo "Tagging for ECR"
	docker tag orchestryx/dfir-lab:latest $(ECR_REGISTRY)/orchestryx/dfir-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/dfir-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/dfir-lab:latest"

## Build and publish the SandboxEscape Malware lab image.
push-malware-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/malware-lab \
	  --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/malware-lab:latest labs/malware/
	@echo "Tagging for ECR"
	docker tag orchestryx/malware-lab:latest $(ECR_REGISTRY)/orchestryx/malware-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/malware-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/malware-lab:latest"

## Build and publish the NetworkNinja Networking lab image.
push-networking-lab:
	@echo "Creating ECR repo (if needed)"
	-aws ecr create-repository --repository-name orchestryx/networking-lab \
	  --region $(AWS_REGION) --image-scanning-configuration scanOnPush=true
	@echo "Logging Docker into ECR"
	aws ecr get-login-password --region $(AWS_REGION) \
	  | docker login --username AWS --password-stdin $(ECR_REGISTRY)
	@echo "Building image"
	docker build -t orchestryx/networking-lab:latest labs/networking/
	@echo "Tagging for ECR"
	docker tag orchestryx/networking-lab:latest $(ECR_REGISTRY)/orchestryx/networking-lab:latest
	@echo "Pushing to ECR"
	docker push $(ECR_REGISTRY)/orchestryx/networking-lab:latest
	@echo "Done! Image: $(ECR_REGISTRY)/orchestryx/networking-lab:latest"

## Build and publish every custom ECR-backed lab image.
push-custom-labs: push-sqli-lab push-php-rce-lab push-lfi-lab \
                  push-dfir-lab push-malware-lab push-networking-lab

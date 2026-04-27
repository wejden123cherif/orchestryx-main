.PHONY: deploy deploy-api deploy-worker logs-api logs-worker status restart-api restart-worker setup-aws

deploy:
	./scripts/deploy.sh

deploy-api:
	./scripts/deploy.sh api

deploy-worker:
	./scripts/deploy.sh worker

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
	bash scripts/setup-aws.sh

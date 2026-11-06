#!/usr/bin/env bash
# Usage: deploy/aws-up.sh
# Creates the AWS stack in infra/aws, builds and pushes the images to ECR, restarts the services on them and waits until
# the site answers. Run it yourself: it needs AWS credentials in your shell (aws configure / SSO), Docker, Terraform and
# the AWS CLI. It creates billable resources: run deploy/aws-down.sh when you are done.
set -euo pipefail
cd "$(dirname "$0")/.."
TF="terraform -chdir=infra/aws"
out() { $TF output -raw "$1" | tr -d '\r'; }
json() { $TF output -json "$1" | tr -d '\r\n '; } # one line, so sed and tr can pick it apart

$TF init -input=false
$TF apply # shows the plan and asks for approval; ECS keeps retrying image pulls until the images below exist

REGION=$(out region)
CLUSTER=$(out cluster_name)
URL=$(out url)
REPOS=$(json ecr_repository_urls)
repo() { printf '%s' "$REPOS" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }
HOST=$(repo api | cut -d/ -f1)

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$HOST"

# linux/amd64 because Fargate tasks here are x86; this also keeps builds on Apple silicon correct.
for pair in api:8083 pipeline:8082 connectors:8080 replay:8081; do
  m=${pair%%:*}
  docker build --platform linux/amd64 --build-arg "MODULE=$m" --build-arg "PORT=${pair##*:}" -t "$(repo $m):latest" .
  docker push "$(repo $m):latest"
done
# Next bakes its /api rewrites at build time, so the Cloud Map name of the API goes in here.
docker build --platform linux/amd64 --build-arg "API_ORIGIN=$(out web_api_origin)" -t "$(repo web):latest" web
docker push "$(repo web):latest"
if [ -n "$(repo plutus)" ]; then
  docker build --platform linux/amd64 -f plutus/Dockerfile.service -t "$(repo plutus):latest" plutus
  docker push "$(repo plutus):latest"
fi
# Kafka is mirrored into ECR so Fargate does not depend on Docker Hub pull limits.
KTAG=$(out kafka_tag)
docker pull --platform linux/amd64 "apache/kafka:$KTAG"
docker tag "apache/kafka:$KTAG" "$(repo kafka):$KTAG"
docker push "$(repo kafka):$KTAG"

# MSK mode only: a one-off task creates the topics (the single-node Kafka task creates its own).
TOPIC_TD=$(json topic_init_task_definition)
if [ "$TOPIC_TD" != "null" ]; then
  SUBNETS=$(json public_subnet_ids | tr -d '[]"')
  TASK=$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$(printf '%s' "$TOPIC_TD" | tr -d '"')" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$(out app_security_group_id)],assignPublicIp=ENABLED}" \
    --query 'tasks[0].taskArn' --output text)
  aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK"
  CODE=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
  [ "$CODE" = "0" ] || { echo "topic creation failed (exit $CODE); see CloudWatch log group /ecs/pumpwatch" >&2; exit 1; }
fi

for s in $(json services | tr -d '[]"' | tr ',' ' '); do
  aws ecs update-service --region "$REGION" --cluster "$CLUSTER" --service "$s" --force-new-deployment >/dev/null
done
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services web api pipeline

deploy/ready.sh "$URL"
# The live stream bypasses the web server: expect 200 from the API (curl exits 28 when -m ends the open stream).
for i in $(seq 30); do
  CODE=$(curl -sS -m 5 -N -o /dev/null -w '%{http_code}' "$URL/api/v1/flags/stream" || true)
  [ "$CODE" = "200" ] && { echo "stream ok: $URL"; exit 0; }
  sleep 10
done
echo "flag stream did not answer 200 (last: $CODE)" >&2
exit 1

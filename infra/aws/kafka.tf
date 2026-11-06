# Kafka in one of two modes.
#   enable_msk = false (default): one apache/kafka KRaft task, defined in ecs.tf, same settings as docker-compose.yml.
#                                 Its data lives on the task's ephemeral disk and is LOST on every restart.
#   enable_msk = true:            Amazon MSK, PLAINTEXT inside the VPC, so the applications need no change.
locals {
  # Same list as the kafka-init service in docker-compose.yml.
  topics = ["raw-posts", "ticks", "raw-news", "raw-filings", "ingest-dlq", "mentions", "features", "scores", "flags", "source-health"]

  # Waits for the broker, then creates every topic. Idempotent, so it is safe to run again.
  topic_script = <<-EOT
    set -e
    for i in $(seq 90); do
      /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server "$BOOTSTRAP" >/dev/null 2>&1 && break
      sleep 5
    done
    for t in ${join(" ", local.topics)}; do
      /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
        --topic "$t" --partitions ${var.topic_partitions} --replication-factor "$REPLICATION"
    done
  EOT
}

resource "aws_msk_configuration" "this" {
  count             = var.enable_msk ? 1 : 0
  name              = var.name
  kafka_versions    = ["3.9.x"]
  server_properties = <<-EOT
    auto.create.topics.enable=true
    default.replication.factor=2
    min.insync.replicas=1
    num.partitions=${var.topic_partitions}
  EOT
}

resource "aws_msk_cluster" "this" {
  count                  = var.enable_msk ? 1 : 0
  cluster_name           = var.name
  kafka_version          = "3.9.x"
  number_of_broker_nodes = 2 # one per availability zone

  broker_node_group_info {
    instance_type   = var.msk_instance_type
    client_subnets  = aws_subnet.private[*].id
    security_groups = [aws_security_group.msk[0].id]
    storage_info {
      ebs_storage_info { volume_size = 10 }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.this[0].arn
    revision = aws_msk_configuration.this[0].latest_revision
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "PLAINTEXT"
    }
  }
}

# MSK has no admin sidecar, so topics are created by a one-off task that deploy/aws-up.sh (or you) runs once:
# the `topic_init_command` output prints the exact `aws ecs run-task` line. auto.create.topics above is a fallback.
resource "aws_ecs_task_definition" "topic_init" {
  count                    = var.enable_msk ? 1 : 0
  family                   = "${var.name}-topic-init"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name       = "topic-init"
    image      = "${aws_ecr_repository.this["kafka"].repository_url}:${local.kafka_tag}"
    essential  = true
    entryPoint = ["/bin/bash", "-c"]
    command    = [local.topic_script]
    environment = [
      { name = "BOOTSTRAP", value = local.kafka_bootstrap },
      { name = "REPLICATION", value = "2" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "topic-init"
      }
    }
  }])
}

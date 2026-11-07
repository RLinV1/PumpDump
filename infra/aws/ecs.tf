locals {
  ns              = "${var.name}.local"
  kafka_bootstrap = var.enable_msk ? one(aws_msk_cluster.this[*].bootstrap_brokers) : "kafka.${local.ns}:19092"
  image           = { for k, r in aws_ecr_repository.this : k => "${r.repository_url}:${k == "kafka" ? local.kafka_tag : var.image_tag}" }

  # Public deployment rules: no Alpaca keys, every market-data source off. Only the password is a secret.
  java_env = {
    JAVA_TOOL_OPTIONS   = "-XX:MaxRAMPercentage=70"
    KAFKA_BOOTSTRAP     = local.kafka_bootstrap
    ALPACA_ENABLED      = "false"
    ALPACA_NEWS_ENABLED = "false"
  }
  db_env = {
    POSTGRES_URL  = "jdbc:postgresql://${aws_db_instance.this.address}:5432/pumpwatch?sslmode=require" # RDS PostgreSQL 17 forces TLS
    POSTGRES_USER = "pumpwatch"
  }
  db_secrets = { POSTGRES_PASSWORD = aws_secretsmanager_secret.db_password.arn }

  # One entry per ECS service; ECS reads the same shape for every one, so every key is present on every entry.
  services = {
    web = {
      enabled = true, cpu = 256, memory = 512, desired = 1, min_healthy = 100, discover = true
      lb      = { arn = aws_lb_target_group.web.arn, port = 3000 }
      containers = [{
        name   = "web", image = local.image["web"], port = 3000
        health = "wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1"
        env = merge({
          DATA_MODE           = var.data_mode
          API_ORIGIN          = "http://api.${local.ns}:8083"
          TRUST_PROXY_HEADERS = "true" # the ALB is web's only peer and appends the real client as the right-most X-Forwarded-For entry
        }, var.enable_research ? { RESEARCH_ORIGIN = "http://research.${local.ns}:8090" } : {})
      }]
    }
    api = {
      enabled = true, cpu = 512, memory = 1024, desired = 1, min_healthy = 100, discover = true
      lb      = { arn = aws_lb_target_group.api.arn, port = 8083 }
      containers = [{
        name    = "api", image = local.image["api"], port = 8083
        health  = "curl -fsS http://localhost:8083/actuator/health >/dev/null || exit 1"
        secrets = local.db_secrets
        env = merge(local.java_env, local.db_env, {
          API_PORT                  = "8083"
          API_TRUSTED_PROXIES       = local.vpc_regex # only addresses inside the VPC (the ALB and web) may set the client address
          API_RATE_LIMIT_PER_MINUTE = tostring(var.api_rate_limit_per_minute)
        }, var.api_extra_env)
      }]
    }
    pipeline = {
      enabled = true, cpu = 512, memory = 1024, desired = 1, min_healthy = 100, discover = false, lb = null
      containers = [{
        name   = "pipeline", image = local.image["pipeline"], port = 8082
        health = "curl -fsS http://localhost:8082/actuator/health >/dev/null || exit 1"
        env    = merge(local.java_env, { PIPELINE_PORT = "8082" })
      }]
    }
    # connectors and replay are defined so they can be switched on; both default to 0 tasks (see variables.tf).
    connectors = {
      enabled = true, cpu = 512, memory = 1024, desired = var.connectors_desired_count, min_healthy = 100, discover = false, lb = null
      containers = [{
        name    = "connectors", image = local.image["connectors"], port = 8080
        health  = "curl -fsS http://localhost:8080/actuator/health >/dev/null || exit 1"
        secrets = local.db_secrets
        env     = merge(local.java_env, local.db_env)
      }]
    }
    replay = {
      enabled = true, cpu = 512, memory = 1024, desired = var.replay_desired_count, min_healthy = 100, discover = false, lb = null
      containers = [{
        name    = "replay", image = local.image["replay"], port = 8081
        health  = "curl -fsS http://localhost:8081/actuator/health >/dev/null || exit 1"
        secrets = local.db_secrets
        env     = merge(local.java_env, local.db_env, { REPLAY_PORT = "8081" })
      }]
    }
    # Single-node Kafka (KRaft), same settings as docker-compose.yml plus a loopback listener for health checks:
    # ECS registers the task in Cloud Map only once it is healthy, and the advertised DNS name does not exist yet.
    kafka = {
      enabled = !var.enable_msk, cpu = 1024, memory = 2048, desired = 1, min_healthy = 0, discover = true, lb = null
      containers = [
        {
          name   = "kafka", image = local.image["kafka"], port = 19092
          health = "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9094 >/dev/null 2>&1"
          env = {
            KAFKA_HEAP_OPTS                                = "-Xms768m -Xmx768m"
            KAFKA_NODE_ID                                  = "1"
            KAFKA_LOG_DIRS                                 = "/var/lib/kafka/data"
            KAFKA_PROCESS_ROLES                            = "broker,controller"
            KAFKA_CONTROLLER_QUORUM_VOTERS                 = "1@localhost:9093"
            KAFKA_CONTROLLER_LISTENER_NAMES                = "CONTROLLER"
            KAFKA_LISTENERS                                = "INTERNAL://:19092,LOCAL://127.0.0.1:9094,CONTROLLER://:9093"
            KAFKA_ADVERTISED_LISTENERS                     = "INTERNAL://kafka.${local.ns}:19092,LOCAL://localhost:9094"
            KAFKA_LISTENER_SECURITY_PROTOCOL_MAP           = "INTERNAL:PLAINTEXT,LOCAL:PLAINTEXT,CONTROLLER:PLAINTEXT"
            KAFKA_INTER_BROKER_LISTENER_NAME               = "INTERNAL"
            KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR         = "1"
            KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR = "1"
            KAFKA_TRANSACTION_STATE_LOG_MIN_ISR            = "1"
            KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS         = "0"
          }
        },
        {
          # Creates the topics once the broker is healthy, then exits. Runs again on every broker restart,
          # which matters because a restart loses all topics.
          name       = "kafka-init", image = local.image["kafka"], port = null, essential = false, health = null
          command    = local.topic_script
          depends_on = "kafka"
          env        = { BOOTSTRAP = "localhost:9094", REPLICATION = "1" }
        },
      ]
    }
    # Research assistant. Mock data and mock agent only; no Gemini key is ever set here.
    # Persistence: the task filesystem is ephemeral. If paper-trading state must survive restarts, add an EFS
    # file system and mount it with the task definition `volume` block; it is not done because this stack is disposable.
    research = {
      enabled = var.enable_research, cpu = 1024, memory = 2048, desired = 1, min_healthy = 100, discover = true, lb = null
      containers = [{
        name   = "research", image = lookup(local.image, "research", ""), port = 8090
        health = "curl -fsS http://127.0.0.1:8090/healthz >/dev/null || exit 1"
        env = {
          PUMPWATCH_API_URL = "http://web.${local.ns}:3000"
          RESEARCH_PUBLIC   = "1"
          USE_MOCK_DATA     = "1"
          USE_MOCK_LLM      = "1"
        }
      }]
    }
  }
  active = { for k, v in local.services : k => v if v.enabled }
}

resource "aws_ecs_cluster" "this" {
  name = var.name
}

resource "aws_service_discovery_private_dns_namespace" "this" {
  name = local.ns
  vpc  = aws_vpc.this.id
}

resource "aws_service_discovery_service" "this" {
  for_each = { for k, v in local.active : k => v if v.discover }
  name     = each.key
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}

resource "aws_ecs_task_definition" "this" {
  for_each                 = local.active
  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([for c in each.value.containers : {
    for k, v in {
      name         = c.name
      image        = c.image
      essential    = try(c.essential, true)
      environment  = [for n, val in try(c.env, {}) : { name = n, value = val }]
      secrets      = [for n, arn in try(c.secrets, {}) : { name = n, valueFrom = arn }]
      portMappings = try(c.port, null) == null ? null : [{ containerPort = c.port, protocol = "tcp" }]
      healthCheck  = try(c.health, null) == null ? null : { command = ["CMD-SHELL", c.health], interval = 10, timeout = 5, retries = 6, startPeriod = 60 }
      entryPoint   = try(c.command, null) == null ? null : ["/bin/bash", "-c"]
      command      = try(c.command, null) == null ? null : [c.command]
      dependsOn    = try(c.depends_on, null) == null ? null : [{ containerName = c.depends_on, condition = "HEALTHY" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.region
          awslogs-stream-prefix = c.name
        }
      }
    } : k => v if v != null
  }])
}

resource "aws_ecs_service" "this" {
  for_each                           = local.active
  name                               = each.key
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.this[each.key].arn
  desired_count                      = each.value.desired
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = each.value.min_healthy
  health_check_grace_period_seconds  = each.value.lb == null ? null : 120 # JVM start-up

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true # no NAT Gateway: the public IP is how the task reaches ECR and CloudWatch
  }

  dynamic "load_balancer" {
    for_each = each.value.lb == null ? [] : [each.value.lb]
    content {
      target_group_arn = load_balancer.value.arn
      container_name   = each.key
      container_port   = load_balancer.value.port
    }
  }

  dynamic "service_registries" {
    for_each = each.value.discover ? [1] : []
    content {
      registry_arn = aws_service_discovery_service.this[each.key].arn
    }
  }

  # The target groups must be attached to a listener before a service can register with them.
  depends_on = [aws_lb_listener.http, aws_lb_listener.https, aws_lb_listener_rule.stream]

  # Autoscaling owns the count of web and api. To change connectors or replay later, use
  # `terraform apply -replace='aws_ecs_service.this["connectors"]'`.
  lifecycle { ignore_changes = [desired_count] }
}

# CPU target tracking for web and api: 1 task minimum, small maximum.
locals {
  scaled = { web = var.web_max_count, api = var.api_max_count }
}

resource "aws_appautoscaling_target" "this" {
  for_each           = local.scaled
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.this[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = each.value
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = local.scaled
  name               = "${var.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this[each.key].service_namespace
  resource_id        = aws_appautoscaling_target.this[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.this[each.key].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

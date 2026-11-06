output "url" {
  value = local.https ? "https://${var.domain_name}" : "http://${aws_lb.this.dns_name}"
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "services" {
  value       = sort(keys(aws_ecs_service.this))
  description = "ECS services that exist (kafka is absent when enable_msk is true)."
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "web_api_origin" {
  value       = "http://api.${local.ns}:8083"
  description = "Build arg API_ORIGIN for the web image: Next bakes its rewrites at build time."
}

output "kafka_bootstrap" {
  value = local.kafka_bootstrap
}

output "kafka_tag" {
  value = local.kafka_tag
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "topic_init_task_definition" {
  value       = one(aws_ecs_task_definition.topic_init[*].arn)
  description = "MSK only: run this once as a Fargate task to create the topics (deploy/aws-up.sh does)."
}

output "github_deploy_role_arn" {
  value = one(aws_iam_role.github_deploy[*].arn)
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}

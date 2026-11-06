variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name" {
  type        = string
  default     = "pumpwatch"
  description = "Prefix for resource names. Also the private DNS namespace (<name>.local), which the web image bakes in at build time."
}

variable "vpc_cidr" {
  type        = string
  default     = "10.20.0.0/16"
  description = "Must be a 10.x.0.0/16: API_TRUSTED_PROXIES is derived from its first two octets."
  validation {
    condition     = can(regex("^10\\.[0-9]+\\.0\\.0/16$", var.vpc_cidr))
    error_message = "vpc_cidr must look like 10.<n>.0.0/16."
  }
}

variable "allowed_cidrs" {
  type        = list(string)
  default     = ["0.0.0.0/0"]
  description = "Who may reach the load balancer. Narrow it to your own /32 for a private test."
}

variable "domain_name" {
  type        = string
  default     = ""
  description = "Set to serve HTTPS with an ACM certificate (needs route53_zone_id). Empty means plain HTTP on the ALB DNS name."
}

variable "route53_zone_id" {
  type    = string
  default = ""
  validation {
    condition     = var.domain_name == "" || var.route53_zone_id != ""
    error_message = "route53_zone_id is required when domain_name is set (DNS validation of the certificate)."
  }
}

variable "data_mode" {
  type        = string
  default     = "mock"
  description = "Web DATA_MODE. mock is the public default. live reaches the Java API with no Alpaca keys, for load tests only."
  validation {
    condition     = contains(["mock", "live"], var.data_mode)
    error_message = "data_mode must be mock or live."
  }
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "enable_msk" {
  type        = bool
  default     = false
  description = "Use Amazon MSK instead of a single-node Kafka task. MSK is the largest cost line."
}

variable "msk_instance_type" {
  type    = string
  default = "kafka.t3.small"
}

variable "topic_partitions" {
  type    = number
  default = 6
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "api_rate_limit_per_minute" {
  type        = number
  default     = 120
  description = "Raise (for example 100000) before a capacity load test."
}

variable "api_extra_env" {
  type        = map(string)
  default     = {}
  description = "Extra non-secret API environment, for example API_MAX_STREAMS."
}

variable "connectors_desired_count" {
  type        = number
  default     = 0
  description = "0: every source is off on mock data (no Alpaca keys on a public deployment), so connectors would idle."
}

variable "replay_desired_count" {
  type        = number
  default     = 0
  description = "0: replay records and re-plays Kafka events, and nothing is ingested on mock data."
}

variable "enable_plutus" {
  type        = bool
  default     = false
  description = "Run the research assistant (mock data, mock agent, no keys). Its filesystem is ephemeral."
}

variable "web_max_count" {
  type    = number
  default = 3
}

variable "api_max_count" {
  type    = number
  default = 3
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "alarm_email" {
  type        = string
  default     = ""
  description = "Email for CloudWatch alarms (SNS). Confirm the subscription email AWS sends."
}

variable "budget_usd" {
  type    = number
  default = 25
}

variable "budget_email" {
  type        = string
  default     = ""
  description = "Email for the AWS Budgets alarm. No budget is created while empty."
}

variable "github_repo" {
  type    = string
  default = "RLinV1/PumpDump"
}

variable "enable_github_oidc" {
  type        = bool
  default     = false
  description = "Create the IAM role that .github/workflows/aws-deploy.yml assumes through OIDC."
}

variable "github_oidc_subjects" {
  type        = list(string)
  default     = ["repo:RLinV1/PumpDump:ref:refs/heads/main"]
  description = "OIDC sub claims allowed to assume the deploy role. Add a branch ref to deploy from it."
}

variable "github_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "Existing GitHub OIDC provider ARN (an account can have only one). Empty creates it."
}

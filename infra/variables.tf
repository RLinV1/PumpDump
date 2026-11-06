variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-central1"
}
variable "zone" {
  type    = string
  default = "us-central1-a"
}
variable "operator_cidr" {
  type        = string
  description = "Your public IP as a /32, e.g. 203.0.113.7/32. SSH is allowed only from here."
}
variable "ssh_public_key" {
  type        = string
  description = "Contents of your .pub file"
}
variable "machine_type" {
  type    = string
  default = "e2-standard-2" # 8 GB: Kafka, Postgres and four JVMs
}
variable "billing_account" {
  type    = string
  default = ""
}
variable "budget_usd" {
  type    = number
  default = 25
}

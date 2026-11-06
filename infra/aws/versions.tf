terraform {
  required_version = ">= 1.9"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # Local state by default (gitignored). For shared or durable state, create an S3 bucket
  # (versioning on, encryption on) and a DynamoDB table with a string key named LockID, then uncomment:
  #
  # backend "s3" {
  #   bucket         = "my-pumpwatch-tfstate"
  #   key            = "aws/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "my-pumpwatch-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.name
      Environment = "disposable"
      ManagedBy   = "terraform"
      Repo        = var.github_repo
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

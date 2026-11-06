# Two public subnets (ALB and Fargate tasks with public IPs, so no NAT Gateway) and two private subnets (RDS, MSK).
locals {
  azs       = slice(data.aws_availability_zones.available.names, 0, 2)
  octets    = slice(split(".", var.vpc_cidr), 0, 2)
  vpc_regex = "${join("\\.", local.octets)}\\.\\d+\\.\\d+" # API_TRUSTED_PROXIES: matches only addresses inside the VPC
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = false # tasks ask for a public IP themselves
  tags                    = { Name = "${var.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  tags              = { Name = "${var.name}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# The private subnets keep the VPC main route table (local routes only): no path to or from the internet.

resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  vpc_id      = aws_vpc.this.id
  description = "Public entry: HTTP and HTTPS from allowed_cidrs"
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "alb" {
  for_each          = { for pair in setproduct(var.allowed_cidrs, [80, 443]) : "${pair[0]}-${pair[1]}" => pair }
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value[0]
  from_port         = each.value[1]
  to_port           = each.value[1]
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  for_each                     = toset(["3000", "8083"])
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
  ip_protocol                  = "tcp"
}

# Tasks share one group. They accept traffic only from the ALB (web and api ports) and from each other.
resource "aws_security_group" "app" {
  name_prefix = "${var.name}-app-"
  vpc_id      = aws_vpc.this.id
  description = "Fargate tasks: ALB and peer traffic only"
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  for_each                     = toset(["3000", "8083"])
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = tonumber(each.value)
  to_port                      = tonumber(each.value)
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_app" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "-1"
}

# Outbound: image pulls from ECR and log delivery go over the public IP, since there is no NAT.
resource "aws_vpc_security_group_egress_rule" "app" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "db" {
  name_prefix = "${var.name}-db-"
  vpc_id      = aws_vpc.this.id
  description = "Postgres from tasks only"
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "db" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_security_group" "msk" {
  count       = var.enable_msk ? 1 : 0
  name_prefix = "${var.name}-msk-"
  vpc_id      = aws_vpc.this.id
  description = "Kafka brokers from tasks only"
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "msk" {
  count                        = var.enable_msk ? 1 : 0
  security_group_id            = aws_security_group.msk[0].id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 9092
  to_port                      = 9092
  ip_protocol                  = "tcp"
}

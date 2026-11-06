locals {
  https = var.domain_name != ""
}

resource "aws_lb" "this" {
  name                       = var.name
  load_balancer_type         = "application"
  subnets                    = aws_subnet.public[*].id
  security_groups            = [aws_security_group.alb.id]
  idle_timeout               = 120 # the API sends an SSE heartbeat every 15 s; the default 60 s would be too close
  drop_invalid_header_fields = true
  enable_deletion_protection = false
  # append: the ALB adds the address it saw to the END of any X-Forwarded-For the client sent. The web server
  # (web/server-headers.mjs) trusts the right-most entry, which is therefore the real client and cannot be forged.
  xff_header_processing_mode = "append"
}

resource "aws_lb_target_group" "web" {
  name_prefix          = "web-"
  vpc_id               = aws_vpc.this.id
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  deregistration_delay = 30
  health_check {
    path    = "/"
    matcher = "200"
  }
  lifecycle { create_before_destroy = true }
}

# The live flag stream goes straight to the API: a hop through the web server broke SSE earlier.
resource "aws_lb_target_group" "api" {
  name_prefix          = "api-"
  vpc_id               = aws_vpc.this.id
  port                 = 8083
  protocol             = "HTTP"
  target_type          = "ip"
  deregistration_delay = 30
  health_check {
    path    = "/actuator/health"
    matcher = "200"
  }
  lifecycle { create_before_destroy = true }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.https ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
  dynamic "default_action" {
    for_each = local.https ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.web.arn
    }
  }
}

resource "aws_acm_certificate" "this" {
  count             = local.https ? 1 : 0
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "validation" {
  for_each = local.https ? { for o in aws_acm_certificate.this[0].domain_validation_options : o.domain_name => o } : {}
  zone_id  = var.route53_zone_id
  name     = each.value.resource_record_name
  type     = each.value.resource_record_type
  records  = [each.value.resource_record_value]
  ttl      = 60
}

resource "aws_acm_certificate_validation" "this" {
  count                   = local.https ? 1 : 0
  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

resource "aws_lb_listener" "https" {
  count             = local.https ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener_rule" "stream" {
  listener_arn = local.https ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    path_pattern { values = ["/api/v1/flags/stream"] }
  }
}

resource "aws_route53_record" "alias" {
  count   = local.https ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

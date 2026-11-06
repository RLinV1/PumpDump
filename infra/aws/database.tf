# The password is generated here and stored in Secrets Manager; tasks receive it through the ECS `secrets` block.
# State implication: random_password keeps the value in terraform.tfstate in plain text, so treat the state file
# as a secret (local state is gitignored; an S3 backend must be encrypted). RDS-managed passwords
# (manage_master_user_password) keep it out of state but rotate every 7 days, which would break running tasks
# until they restart; for a disposable stack the generated password is the simpler, steadier choice.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.name}/db-password"
  recovery_window_in_days = 0 # disposable: allow immediate delete and re-create of the same name
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db.result
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "this" {
  identifier                 = var.name
  engine                     = "postgres"
  engine_version             = "17"
  instance_class             = var.db_instance_class
  allocated_storage          = var.db_allocated_storage
  storage_type               = "gp3"
  storage_encrypted          = true
  db_name                    = "pumpwatch"
  username                   = "pumpwatch"
  password                   = random_password.db.result
  db_subnet_group_name       = aws_db_subnet_group.this.name
  vpc_security_group_ids     = [aws_security_group.db.id]
  publicly_accessible        = false
  multi_az                   = false
  backup_retention_period    = 1
  deletion_protection        = false
  skip_final_snapshot        = true
  auto_minor_version_upgrade = true
  apply_immediately          = true
  copy_tags_to_snapshot      = true
}

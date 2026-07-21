variable "vpc_id" {
  type        = string
  description = "The ID of the VPC"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Subnets to deploy the DB Subnet Group"
}

variable "allowed_security_group_id" {
  type        = string
  description = "The Security Group allowed to connect to RDS (e.g. Lambda/ECS SG)"
}

variable "db_name" {
  type        = string
  default     = "benzdrive"
  description = "The database name"
}

variable "db_username" {
  type        = string
  default     = "postgres"
  description = "The master username"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "The master password"
}

variable "instance_class" {
  type        = string
  default     = "db.t4g.micro"
  description = "The RDS instance size"
}

# DB Subnet Group
resource "aws_db_subnet_group" "db_subnets" {
  name        = "benzdrive-db-subnet-group"
  subnet_ids  = var.private_subnet_ids
  description = "Subnet group for BenzDrive PostgreSQL RDS"

  tags = {
    Name = "benzdrive-db-subnet-group"
  }
}

# Security Group for database
resource "aws_security_group" "rds_sg" {
  name        = "benzdrive-rds-security-group"
  description = "Allows ingress from the application Lambda/ECS only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "benzdrive-rds-sg"
  }
}

# PostgreSQL RDS Instance
resource "aws_db_instance" "postgres" {
  identifier             = "benzdrive-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.instance_class
  allocated_storage      = 20
  max_allocated_storage  = 100
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.db_subnets.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  skip_final_snapshot    = true # Skip for dev, set false for production

  tags = {
    Name = "benzdrive-postgres"
  }
}

output "db_host" {
  value = aws_db_instance.postgres.address
}

output "db_port" {
  value = aws_db_instance.postgres.port
}

output "db_name" {
  value = aws_db_instance.postgres.db_name
}

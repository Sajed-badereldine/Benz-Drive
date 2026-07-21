variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region to deploy resources in"
}

variable "bucket_name" {
  type        = string
  description = "Unique name for the S3 bucket"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Master password for RDS PostgreSQL"
}

variable "jwt_secret" {
  type        = string
  sensitive   = true
  description = "Encryption secret for JWT tokens"
}

variable "allowed_origins" {
  type        = list(string)
  default     = ["http://localhost:5233"]
  description = "List of frontend origins permitted to access APIs/S3"
}

variable "mail_host" {
  type        = string
  default     = "smtp.mailtrap.io"
  description = "SMTP Mail server host"
}

variable "mail_port" {
  type        = string
  default     = "2525"
  description = "SMTP Mail server port"
}

variable "mail_user" {
  type        = string
  default     = ""
  description = "SMTP login username"
}

variable "mail_password" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Password for SMTP mail services"
}

variable "mail_from" {
  type        = string
  default     = "no-reply@benzdrive.com"
  description = "SMTP sender address"
}

terraform {
  required_version = ">= 1.5.0"
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# 1. VPC Module (Networking)
module "vpc" {
  source   = "./modules/vpc"
  vpc_cidr = "10.0.0.0/16"
}

# 2. S3 Module (File Storage)
module "s3" {
  source          = "./modules/s3"
  bucket_name     = var.bucket_name
  allowed_origins = var.allowed_origins
}

# 3. Lambda Module (Serverless Compute)
module "lambda" {
  source             = "./modules/lambda"
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  s3_bucket_name     = module.s3.bucket_name
  s3_bucket_arn      = module.s3.bucket_arn
  db_host            = module.rds.db_host
  db_port            = module.rds.db_port
  db_name            = module.rds.db_name
  db_username        = "postgres"
  db_password        = var.db_password
  jwt_secret         = var.jwt_secret
  mail_host          = var.mail_host
  mail_port          = var.mail_port
  mail_user          = var.mail_user
  mail_password      = var.mail_password
  mail_from          = var.mail_from
  allowed_origins    = var.allowed_origins
  custom_domain_name = var.custom_domain_name
}

# 4. RDS Module (PostgreSQL Database)
module "rds" {
  source                    = "./modules/rds"
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  allowed_security_group_id = module.lambda.lambda_sg_id
  db_username               = "postgres"
  db_password               = var.db_password
}

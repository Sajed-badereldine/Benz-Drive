variable "vpc_id" {
  type        = string
  description = "VPC ID to attach Lambda to"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for the Lambda VPC configuration"
}

variable "s3_bucket_name" {
  type        = string
  description = "The S3 bucket name for files"
}

variable "s3_bucket_arn" {
  type        = string
  description = "The S3 bucket ARN for permissions"
}

variable "db_host" {
  type        = string
  description = "RDS hostname"
}

variable "db_port" {
  type        = string
  description = "RDS port"
}

variable "db_name" {
  type        = string
  description = "RDS database name"
}

variable "db_username" {
  type        = string
  description = "RDS master username"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "RDS master password"
}

variable "jwt_secret" {
  type        = string
  sensitive   = true
  description = "JWT encryption key"
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
  description = "SMTP login password"
}

variable "mail_from" {
  type        = string
  default     = "no-reply@benzdrive.com"
  description = "SMTP sender address"
}

variable "allowed_origins" {
  type        = list(string)
  default     = ["http://localhost:5233"]
  description = "Allowed frontend origin URLs"
}

# Security group for Lambda
resource "aws_security_group" "lambda_sg" {
  name        = "benzdrive-lambda-security-group"
  description = "Permits outgoing traffic from NestJS Lambda"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "benzdrive-lambda-sg"
  }
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "benzdrive-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Policies for S3 access, CloudWatch logging, and VPC network interfaces
resource "aws_iam_policy" "lambda_policy" {
  name        = "benzdrive-lambda-execution-policy"
  description = "Provides logging, VPC access, and S3 upload/download permissions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      # VPC Access
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses"
        ]
        Resource = "*"
      },
      # S3 Access (for presigned URL validation, S3 deletes, S3 streams)
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.s3_bucket_arn,
          "${var.s3_bucket_arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}

# Lambda function zip placeholder (can be generated using archive_file locally)
data "archive_file" "lambda_zip_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  # Simple node code to bootstrap before real bundle is pushed via CI/CD
  source {
    content  = "exports.handler = async (event) => { return { statusCode: 200, body: 'BenzDrive API Placeholder' }; };"
    filename = "index.js"
  }
}

# AWS Lambda Function
resource "aws_lambda_function" "backend" {
  filename         = data.archive_file.lambda_zip_placeholder.output_path
  function_name    = "benzdrive-backend"
  role             = aws_iam_role.lambda_role.arn
  handler          = "dist/lambda.handler" # Requires a handler wrapper like serverless-express
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 512
  source_code_hash = data.archive_file.lambda_zip_placeholder.output_base64sha256

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  environment {
    variables = {
      DB_HOST                = var.db_host
      DB_PORT                = var.db_port
      DB_USERNAME            = var.db_username
      DB_PASSWORD            = var.db_password
      DB_DATABASE            = var.db_name
      JWT_SECRET             = var.jwt_secret
      JWT_EXPIRES_IN         = "7d"
      AWS_S3_BUCKET_NAME     = var.s3_bucket_name
      FRONTEND_URL           = var.allowed_origins[0]
      MAIL_HOST              = var.mail_host
      MAIL_PORT              = var.mail_port
      MAIL_USER              = var.mail_user
      MAIL_PASSWORD          = var.mail_password
      MAIL_FROM              = var.mail_from
    }
  }

  tags = {
    Name = "benzdrive-backend-lambda"
  }
}

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "http_api" {
  name          = "benzdrive-http-api"
  protocol_type = "HTTP"
}

# API Gateway Integration with Lambda
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.arn
  payload_format_version = "2.0"
}

# Route everything to Lambda
resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Default API Gateway Stage
resource "aws_apigatewayv2_stage" "default_stage" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

# Permission to allow API Gateway to call Lambda
resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

variable "custom_domain_name" {
  type        = string
  default     = "api.benzdrive.site"
  description = "Custom domain name for API Gateway mapping"
}

# Automatically map API Gateway to Custom Domain Name on terraform apply
resource "aws_apigatewayv2_api_mapping" "custom_domain_mapping" {
  count       = var.custom_domain_name != "" ? 1 : 0
  api_id      = aws_apigatewayv2_api.http_api.id
  domain_name = var.custom_domain_name
  stage       = aws_apigatewayv2_stage.default_stage.name
}

output "api_endpoint" {
  value = "https://${var.custom_domain_name != "" ? var.custom_domain_name : aws_apigatewayv2_api.http_api.api_endpoint}"
}

output "lambda_sg_id" {
  value = aws_security_group.lambda_sg.id
}

output "api_gateway_endpoint" {
  value       = module.lambda.api_endpoint
  description = "The HTTP invoke URL for the NestJS API Gateway"
}

output "s3_bucket_name" {
  value       = module.s3.bucket_name
  description = "The S3 bucket name created for file storage"
}

output "rds_endpoint" {
  value       = module.rds.db_host
  description = "The database endpoint (hostname)"
}

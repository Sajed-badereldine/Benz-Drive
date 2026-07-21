variable "bucket_name" {
  type        = string
  description = "The name of the S3 bucket to create"
}

variable "allowed_origins" {
  type        = list(string)
  default     = ["http://localhost:5233"]
  description = "List of allowed CORS origins (frontend URLs)"
}

resource "aws_s3_bucket" "drive" {
  bucket        = var.bucket_name
  force_destroy = true

  tags = {
    Name = "benzdrive-storage"
  }
}

# Block all public access by default
resource "aws_s3_bucket_public_access_block" "drive" {
  bucket = aws_s3_bucket.drive.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS Rule configuration (crucial to allow direct-to-S3 uploads from the frontend browser)
resource "aws_s3_bucket_cors_configuration" "drive" {
  bucket = aws_s3_bucket.drive.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET", "DELETE", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

output "bucket_name" {
  value = aws_s3_bucket.drive.id
}

output "bucket_arn" {
  value = aws_s3_bucket.drive.arn
}

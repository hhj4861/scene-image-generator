terraform {
  required_version = ">= 1.0.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# GCP Provider 설정
provider "google" {
  credentials = file("${path.module}/../google-credentials.json")
  project     = var.project_id
  region      = var.region
}

# 변수
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "mcp-test-457809"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "asia-northeast3" # 서울
}

variable "bucket_name" {
  description = "Cloud Storage Bucket Name"
  type        = string
  default     = "scene-image-generator-storage"
}

# Cloud Storage 버킷 생성
resource "google_storage_bucket" "scene_images" {
  name          = "${var.bucket_name}-${var.project_id}"
  location      = var.region
  force_destroy = true

  # 스토리지 클래스 (Standard, Nearline, Coldline, Archive)
  storage_class = "STANDARD"

  # 버전 관리 (선택사항)
  versioning {
    enabled = false
  }

  # CORS 설정 (웹에서 직접 접근 필요시)
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  # 수명 주기 규칙 (90일 후 Nearline으로 이동)
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  # 균일한 버킷 수준 액세스
  uniform_bucket_level_access = true

  labels = {
    environment = "production"
    purpose     = "scene-images"
  }
}

# 버킷을 공개 읽기 가능하게 설정 (선택사항)
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.scene_images.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Service Account에 버킷 쓰기 권한 부여
resource "google_storage_bucket_iam_member" "service_account_write" {
  bucket = google_storage_bucket.scene_images.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:mcp-test@mcp-test-457809.iam.gserviceaccount.com"
}

# 출력
output "bucket_name" {
  description = "Created bucket name"
  value       = google_storage_bucket.scene_images.name
}

output "bucket_url" {
  description = "Bucket URL"
  value       = "gs://${google_storage_bucket.scene_images.name}"
}

output "public_url" {
  description = "Public URL for accessing files"
  value       = "https://storage.googleapis.com/${google_storage_bucket.scene_images.name}"
}

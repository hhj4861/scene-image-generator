# ===========================================
# GCP FFmpeg Render Server VM
# ===========================================

# ===========================================
# 변수 정의
# ===========================================
variable "ffmpeg_machine_type" {
  description = "VM Machine Type for FFmpeg"
  type        = string
  # e2-medium: 2 vCPU, 4GB RAM (~$24/month) - 권장
  # e2-standard-2: 2 vCPU, 8GB RAM (~$48/month)
  # e2-standard-4: 4 vCPU, 16GB RAM (~$97/month)
  default     = "e2-medium"
}

variable "ffmpeg_disk_size" {
  description = "Boot disk size in GB"
  type        = number
  default     = 50
}

variable "zone" {
  description = "GCP Zone"
  type        = string
  default     = "asia-northeast3-a"
}

# ===========================================
# 방화벽 규칙 - FFmpeg API 서버용
# ===========================================
resource "google_compute_firewall" "ffmpeg_api" {
  name    = "ffmpeg-api-firewall"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22", "3000"]  # SSH, API
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["ffmpeg-server"]
}

# ===========================================
# 고정 IP 주소
# ===========================================
resource "google_compute_address" "ffmpeg_ip" {
  name   = "ffmpeg-server-ip"
  region = var.region
}

# ===========================================
# VM 인스턴스 - FFmpeg 렌더 서버
# ===========================================
resource "google_compute_instance" "ffmpeg_server" {
  name         = "ffmpeg-render-server"
  machine_type = var.ffmpeg_machine_type
  zone         = var.zone
  tags         = ["ffmpeg-server"]

  # 부팅 디스크 - Ubuntu 22.04 LTS
  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.ffmpeg_disk_size
      type  = "pd-ssd"
    }
  }

  # 네트워크 설정
  network_interface {
    network = "default"

    access_config {
      nat_ip = google_compute_address.ffmpeg_ip.address
    }
  }

  # 서비스 계정 (GCS 접근용)
  service_account {
    email  = "mcp-test@mcp-test-457809.iam.gserviceaccount.com"
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/devstorage.read_write",
    ]
  }

  # Startup 스크립트 - 외부 파일 참조
  metadata_startup_script = file("${path.module}/startup.sh")

  # 인스턴스 업데이트 허용
  allow_stopping_for_update = true

  labels = {
    environment = "production"
    purpose     = "ffmpeg-render"
  }
}

# ===========================================
# Outputs
# ===========================================
output "ffmpeg_instance_name" {
  description = "FFmpeg VM 인스턴스 이름"
  value       = google_compute_instance.ffmpeg_server.name
}

output "ffmpeg_external_ip" {
  description = "외부 IP 주소"
  value       = google_compute_address.ffmpeg_ip.address
}

output "ffmpeg_api_endpoint" {
  description = "FFmpeg API 엔드포인트"
  value       = "http://${google_compute_address.ffmpeg_ip.address}:3000"
}

output "ffmpeg_ssh_command" {
  description = "SSH 접속 명령어"
  value       = "gcloud compute ssh ${google_compute_instance.ffmpeg_server.name} --zone=${var.zone} --project=${var.project_id}"
}

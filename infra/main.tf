terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

resource "google_compute_address" "web" {
  name = "pumpwatch-ip"
}

resource "google_compute_firewall" "web" {
  name          = "pumpwatch-web"
  network       = "default"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["pumpwatch"]
  allow {
    protocol = "tcp"
    ports    = ["80"]
  }
}

resource "google_compute_firewall" "ssh" {
  name          = "pumpwatch-ssh"
  network       = "default"
  source_ranges = [var.operator_cidr]
  target_tags   = ["pumpwatch"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_instance" "app" {
  name         = "pumpwatch"
  machine_type = var.machine_type
  tags         = ["pumpwatch"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 30
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.web.address
    }
  }

  metadata = {
    ssh-keys               = "pumpwatch:${var.ssh_public_key}"
    block-project-ssh-keys = "true"
  }
  metadata_startup_script = file("${path.module}/startup.sh")
}

# Optional: needs a billing account id. Alerts go to billing admins by default.
resource "google_billing_budget" "cap" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "pumpwatch-cap"
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_usd)
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 1.0 }
}

output "url" {
  value = "http://${google_compute_address.web.address}"
}

output "ssh" {
  value = "ssh pumpwatch@${google_compute_address.web.address}"
}

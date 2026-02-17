# WAAPI-DADI — Docker Deployment Guide

> **WhatsApp SaaS API (Unofficial)** — Panduan lengkap deploy menggunakan Docker.
> Cocok untuk VPS, local development, atau server CRM.

---

## Daftar Isi

1. [Arsitektur & Stack](#arsitektur--stack)
2. [Prasyarat](#prasyarat)
3. [Struktur File Docker](#struktur-file-docker)
4. [Langkah Deploy](#langkah-deploy)
5. [Konfigurasi Environment](#konfigurasi-environment)
6. [Port Mapping](#port-mapping)
7. [Perintah Docker Penting](#perintah-docker-penting)
8. [Seed Database (Opsional)](#seed-database-opsional)
9. [Akses Aplikasi](#akses-aplikasi)
10. [Deploy di VPS / Server Production](#deploy-di-vps--server-production)
11. [Troubleshooting](#troubleshooting)
12. [FAQ](#faq)

---

## Arsitektur & Stack

```
┌─────────────────────────────────────────────────────┐
│                   Docker Network                     │
│                 (waapi-network)                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  MySQL   │  │  Redis   │  │    Backend        │   │
│  │  8.0     │  │  7-alpine│  │  Fastify+Prisma   │   │
│  │  :3306   │  │  :6379   │  │  Baileys (WA)     │   │
│  │          │  │          │  │  :3001             │   │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘   │
│       │              │                 │              │
│       └──────────────┴─────────────────┘              │
│                        │                              │
│              ┌─────────┴──────────┐                   │
│              │     Frontend       │                   │
│              │   Next.js 16       │                   │
│              │     :3000          │                   │
│              └────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

| Service      | Image / Build    | Deskripsi                                  |
| ------------ | ---------------- | ------------------------------------------ |
| **MySQL**    | `mysql:8.0`      | Database utama (multi-tenant)              |
| **Redis**    | `redis:7-alpine` | Queue BullMQ + rate limiting + cache       |
| **Backend**  | `./backend`      | Fastify v4, Prisma ORM, Baileys WA gateway |
| **Frontend** | `./frontend`     | Next.js 16 (App Router, standalone)        |

---

## Prasyarat

| Software            | Minimum Version | Download                                   |
| -------------------- | --------------- | ------------------------------------------ |
| **Docker Desktop**   | v4.x+           | https://www.docker.com/products/docker-desktop |
| **Docker Compose**   | v2.x+ (bawaan)  | Sudah include dalam Docker Desktop         |
| **Git**              | Opsional        | Untuk clone repository                     |

> **Catatan Windows:** Pastikan Docker Desktop sudah running (ikon Docker di system tray). WSL2 backend direkomendasikan.

> **Catatan Linux/VPS:** Install Docker Engine + Docker Compose plugin:
> ```bash
> curl -fsSL https://get.docker.com | sh
> sudo usermod -aG docker $USER
> ```

### Disk & RAM Minimum

- **RAM:** 2 GB minimum (4 GB direkomendasikan)
- **Disk:** 2 GB untuk images + data
- **CPU:** 2 core minimum

---

## Struktur File Docker

```
WAAPI-DADI/
├── docker-compose.yml          # Orchestrator semua service
├── .env.docker                 # Template environment variables
├── .env                        # Environment aktif (copy dari .env.docker)
│
├── backend/
│   ├── Dockerfile              # Multi-stage build (deps → build → production)
│   ├── .dockerignore           # Exclude node_modules, dist, .env, dll
│   └── prisma/
│       ├── schema.prisma       # Database schema
│       ├── migrations/         # Auto-migration files
│       └── seed.sql            # Data testing (opsional)
│
└── frontend/
    ├── Dockerfile              # Multi-stage build (deps → build → standalone)
    └── .dockerignore           # Exclude node_modules, .next, .env
```

---

## Langkah Deploy

### Step 1: Clone Repository

```bash
git clone https://github.com/AdiSyahadi/WAAPI-DADI.git
cd WAAPI-DADI
```

### Step 2: Buat File `.env`

```bash
# Linux / macOS
cp .env.docker .env

# Windows (PowerShell)
Copy-Item .env.docker .env
```

### Step 3: Edit `.env` (WAJIB)

Buka file `.env`, lalu ganti minimal 2 value ini:

```dotenv
# WAJIB DIGANTI! Generate secret:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=random_string_64_byte_anda
JWT_REFRESH_SECRET=random_string_64_byte_lain

# Ganti password MySQL production
MYSQL_ROOT_PASSWORD=password_kuat_anda
```

> **Tips generate JWT secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```
> Jalankan 2x untuk mendapat 2 secret berbeda.

### Step 4: Build & Start

```bash
docker compose up -d --build
```

Proses pertama kali membutuhkan waktu **5-15 menit** tergantung koneksi internet (download images MySQL ~500MB, Node.js ~200MB, npm install, build TypeScript & Next.js).

### Step 5: Verifikasi

```bash
# Cek semua container running
docker ps -a

# Output yang diharapkan:
# waapi-mysql      Up (healthy)
# waapi-redis      Up (healthy)
# waapi-backend    Up
# waapi-frontend   Up
```

```bash
# Cek backend logs
docker logs waapi-backend --tail 20
```

Jika sukses, Anda akan melihat:
```
✅ Prisma migrations applied
🚀 Server running at http://0.0.0.0:3001
📊 Workers started: broadcast, webhook, media-cleanup, daily-reset
```

### Step 6: Buka Aplikasi

| Service  | URL                          |
| -------- | ---------------------------- |
| Frontend | http://localhost:3000         |
| Backend  | http://localhost:3001         |
| API Docs | http://localhost:3001/docs    |

---

## Konfigurasi Environment

### File `.env` — Referensi Lengkap

```dotenv
# ============================
# MySQL
# ============================
MYSQL_ROOT_PASSWORD=root          # Password root MySQL
MYSQL_DATABASE=whatsapp_saas      # Nama database
MYSQL_PORT=3306                   # Port MySQL di host (ganti kalau bentrok)

# ============================
# Redis
# ============================
REDIS_PORT=6379                   # Port Redis di host
REDIS_PASSWORD=                   # Kosongkan jika tanpa password
REDIS_DB=0                        # Redis database number

# ============================
# Backend
# ============================
NODE_ENV=production
BACKEND_PORT=3001                 # Port backend di host
APP_URL=http://localhost:3001     # URL backend (ganti untuk production)
FRONTEND_URL=http://localhost:3000 # URL frontend

# JWT - WAJIB DIGANTI!
JWT_SECRET=xxx
JWT_REFRESH_SECRET=xxx
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# File Storage
FILE_STORAGE_TYPE=local
FILE_STORAGE_PATH=./storage

# CORS
CORS_ORIGIN=http://localhost:3000 # Sesuaikan dengan domain frontend

# Logging
LOG_LEVEL=info                    # debug | info | warn | error
LOG_PRETTY=false

# Super Admin (dibuat saat pertama run)
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=changeme123
SUPER_ADMIN_NAME=Super Admin

# ============================
# Frontend
# ============================
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3001  # Backend URL from browser
```

### Variable Penting untuk Production

| Variable                | Default             | Production                |
| ----------------------- | ------------------- | ------------------------- |
| `MYSQL_ROOT_PASSWORD`   | `root`              | Password kuat!            |
| `JWT_SECRET`            | (template)          | Random 64 byte hex        |
| `JWT_REFRESH_SECRET`    | (template)          | Random 64 byte hex (beda) |
| `CORS_ORIGIN`           | `http://localhost:3000` | `https://yourdomain.com`  |
| `NEXT_PUBLIC_API_URL`   | `http://localhost:3001` | `https://api.yourdomain.com` |
| `APP_URL`               | `http://localhost:3001` | `https://api.yourdomain.com` |
| `FRONTEND_URL`          | `http://localhost:3000` | `https://yourdomain.com`  |

---

## Port Mapping

| Service  | Container Port | Host Port (default) | Konfigurasi     |
| -------- | -------------- | ------------------- | --------------- |
| MySQL    | 3306           | 3306                | `MYSQL_PORT`    |
| Redis    | 6379           | 6379                | `REDIS_PORT`    |
| Backend  | 3001           | 3001                | `BACKEND_PORT`  |
| Frontend | 3000           | 3000                | `FRONTEND_PORT` |

> **Port bentrok?** Misalnya sudah ada MySQL lokal di 3306:
> ```dotenv
> MYSQL_PORT=3307
> ```
> Tidak perlu ubah apapun selain `.env`, Docker otomatis mapping.

---

## Perintah Docker Penting

### Lifecycle

```bash
# Build & start semua service
docker compose up -d --build

# Start (tanpa rebuild)
docker compose up -d

# Stop semua service (data tetap)
docker compose down

# Stop & HAPUS semua data (reset total)
docker compose down -v

# Restart satu service
docker compose restart backend
```

### Monitoring

```bash
# Status semua container
docker ps -a

# Lihat logs real-time
docker compose logs -f

# Logs satu service saja
docker logs waapi-backend --tail 50
docker logs waapi-frontend --tail 50

# Logs follow (real-time)
docker logs -f waapi-backend
```

### Database

```bash
# Masuk MySQL CLI
docker exec -it waapi-mysql mysql -u root -p whatsapp_saas

# Backup database
docker exec waapi-mysql mysqldump -u root -proot whatsapp_saas > backup.sql

# Restore database (Linux/Mac)
docker exec -i waapi-mysql mysql -u root -proot whatsapp_saas < backup.sql

# Restore database (Windows PowerShell)
Get-Content backup.sql | docker exec -i waapi-mysql mysql -u root -proot whatsapp_saas

# Run Prisma migration manual
docker exec waapi-backend npx prisma migrate deploy
```

### Rebuild Satu Service

```bash
# Rebuild backend saja (setelah update code)
docker compose up -d --build backend

# Rebuild frontend saja
docker compose up -d --build frontend
```

---

## Seed Database (Opsional)

File seed tersedia di `backend/prisma/seed.sql` untuk membuat data testing.

### Isi Seed

- **1 Organization**: "Testing Enterprise"
- **1 Subscription Plan**: Enterprise Unlimited (semua fitur, limit 999999)
- **4 User** (semua role):

| Email               | Password    | Role         |
| ------------------- | ----------- | ------------ |
| superadmin@test.com  | Test1234!   | SUPER_ADMIN  |
| owner@test.com       | Test1234!   | ORG_OWNER    |
| admin@test.com       | Test1234!   | ORG_ADMIN    |
| member@test.com      | Test1234!   | ORG_MEMBER   |

### Cara Menjalankan Seed

```bash
# Linux / macOS
docker exec -i waapi-mysql mysql -u root -proot whatsapp_saas < backend/prisma/seed.sql

# Windows PowerShell
Get-Content backend\prisma\seed.sql | docker exec -i waapi-mysql mysql -u root -proot whatsapp_saas
```

> **Catatan:** Seed hanya perlu dijalankan 1x setelah deploy pertama. Jangan jalankan ulang jika data sudah ada (akan error duplicate).

---

## Akses Aplikasi

### Testing Login

Setelah seed, buka http://localhost:3000/login dan gunakan salah satu akun:

- **Super Admin**: `superadmin@test.com` / `Test1234!`
- **Org Owner**: `owner@test.com` / `Test1234!`
- **Org Admin**: `admin@test.com` / `Test1234!`
- **Member**: `member@test.com` / `Test1234!`

### Role & Permission

| Role          | Deskripsi                                       |
| ------------- | ----------------------------------------------- |
| SUPER_ADMIN   | Akses penuh, kelola semua organisasi             |
| ORG_OWNER     | Pemilik organisasi, kelola user & setting        |
| ORG_ADMIN     | Admin organisasi, kelola WhatsApp & kontak       |
| ORG_MEMBER    | Member biasa, kirim/terima pesan saja            |

### Fitur Utama

- Multi-tenant (banyak organisasi dalam 1 instance)
- WhatsApp gateway via Baileys (unofficial API)
- QR code pairing
- Kirim & terima pesan (text, image, video, audio, document, sticker)
- Broadcast / bulk messaging
- Webhook integrations
- Contact management
- History sync
- Media download & upload
- API key management
- Rate limiting

---

## Deploy di VPS / Server Production

### Minimum VPS Specs

- **OS:** Ubuntu 22.04 / Debian 12
- **RAM:** 2 GB minimum (4 GB recommended)
- **CPU:** 2 core
- **Disk:** 20 GB SSD
- **Port:** 80, 443 (HTTP/HTTPS)

### Quick Deploy Script

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Logout & login kembali

# 2. Clone project
git clone https://github.com/AdiSyahadi/WAAPI-DADI.git
cd WAAPI-DADI

# 3. Setup environment
cp .env.docker .env
nano .env
# Edit: MYSQL_ROOT_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
# Edit: APP_URL, FRONTEND_URL, CORS_ORIGIN → pakai domain/IP server

# 4. Deploy
docker compose up -d --build

# 5. Seed database (opsional)
docker exec -i waapi-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" whatsapp_saas < backend/prisma/seed.sql

# 6. Verifikasi
docker ps -a
docker logs waapi-backend --tail 20
```

### Nginx Reverse Proxy (HTTPS)

Untuk production dengan domain + SSL, tambahkan Nginx di depan:

```nginx
# /etc/nginx/sites-available/waapi
server {
    listen 80;
    server_name your-domain.com api.your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (untuk QR code real-time)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Lalu:
```bash
sudo apt install nginx certbot python3-certbot-nginx -y
sudo ln -s /etc/nginx/sites-available/waapi /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com -d api.your-domain.com
sudo nginx -t && sudo systemctl reload nginx
```

Dan update `.env`:
```dotenv
APP_URL=https://api.your-domain.com
FRONTEND_URL=https://your-domain.com
CORS_ORIGIN=https://your-domain.com
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

Lalu rebuild frontend (karena `NEXT_PUBLIC_API_URL` di-embed saat build):
```bash
docker compose up -d --build frontend
```

---

## Troubleshooting

### Container tidak mau start

```bash
# Cek error logs
docker logs waapi-backend
docker logs waapi-frontend
docker logs waapi-mysql
```

### Port sudah dipakai

```
Error: bind: Only one usage of each socket address
```

**Solusi:** Ubah port di `.env`:
```dotenv
MYSQL_PORT=3307      # Jika MySQL lokal sudah pakai 3306
REDIS_PORT=6380      # Jika Redis lokal sudah pakai 6379
BACKEND_PORT=3002    # Jika port 3001 sudah terpakai
FRONTEND_PORT=3001   # Jika port 3000 sudah terpakai
```

### MySQL container restart loop

```bash
# Cek log MySQL
docker logs waapi-mysql

# Biasanya karena volume rusak, reset:
docker compose down -v
docker compose up -d --build
```

### Backend error "Cannot connect to database"

Pastikan MySQL sudah healthy dulu:
```bash
docker ps  # Cek status MySQL: "Up (healthy)"
```

Jika MySQL masih starting, tunggu 30 detik lalu restart backend:
```bash
docker compose restart backend
```

### Frontend blank / API error

1. Pastikan `NEXT_PUBLIC_API_URL` di `.env` benar
2. Rebuild frontend setelah ganti URL:
   ```bash
   docker compose up -d --build frontend
   ```
3. Pastikan CORS di backend sesuai:
   ```dotenv
   CORS_ORIGIN=http://localhost:3000
   ```

### Reset total (fresh install)

```bash
docker compose down -v     # Hapus semua container + volume
docker compose up -d --build  # Build ulang dari awal
```

> **Warning:** `docker compose down -v` menghapus SEMUA data (database, Redis, uploaded files)!

### Windows: docker command not found

Jika Docker Desktop baru diinstall dan terminal error `docker: command not found`:

```powershell
# Refresh PATH di PowerShell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
```

Atau buka terminal baru setelah install Docker Desktop.

---

## FAQ

### Q: Apakah perlu install Node.js di komputer?
**A:** Tidak. Semua sudah di dalam Docker container (Node.js 20).

### Q: Apakah perlu install MySQL di komputer?
**A:** Tidak. MySQL 8.0 sudah berjalan di Docker container.

### Q: Berapa lama build pertama kali?
**A:** 5-15 menit tergantung koneksi internet (download images ± 700MB total).

### Q: Bagaimana update ke versi terbaru?
**A:**
```bash
git pull origin main
docker compose up -d --build
```

### Q: Data hilang kalau container dihapus?
**A:** Tidak, selama pakai `docker compose down` (tanpa `-v`). Data MySQL, Redis, dan storage disimpan di Docker volumes yang persistent.

### Q: Bisa diakses dari jaringan lain / internet?
**A:** Secara default hanya `localhost`. Untuk akses dari luar:
1. Ganti `APP_URL`, `FRONTEND_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL` ke IP/domain server
2. Rebuild frontend
3. Buka port di firewall

### Q: Bisa pakai PostgreSQL?
**A:** Tidak saat ini. Schema di-design untuk MySQL 8.0+.

### Q: WhatsApp session hilang setelah restart?
**A:** Tidak. Session disimpan di volume `backend_storage` yang persistent.

### Q: Berapa WhatsApp number yang bisa dipakai?
**A:** Tergantung plan. Enterprise Unlimited: sampai 9999 instance.

---

## File Reference

| File                          | Fungsi                                      |
| ----------------------------- | ------------------------------------------- |
| `docker-compose.yml`         | Orchestrator: define semua service & network |
| `.env.docker`                | Template environment variables               |
| `.env`                       | Environment aktif (JANGAN commit ke git!)    |
| `backend/Dockerfile`         | Build backend: TypeScript → production       |
| `frontend/Dockerfile`        | Build frontend: Next.js → standalone         |
| `backend/.dockerignore`      | Exclude files dari Docker build context      |
| `frontend/.dockerignore`     | Exclude files dari Docker build context      |
| `backend/prisma/seed.sql`    | Data testing: users + plan + organization    |
| `backend/prisma/schema.prisma` | Database schema (Prisma ORM)               |

---

*Dokumen ini dibuat untuk WAAPI-DADI v1.0 — WhatsApp SaaS API Unofficial*
*Last updated: February 2026*

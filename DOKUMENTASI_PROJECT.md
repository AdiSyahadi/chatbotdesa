# 📋 Dokumentasi Lengkap — WA SaaS API (Unofficial)

> **WhatsApp SaaS API Platform** — Multi-tenant SaaS untuk mengirim/menerima pesan WhatsApp via REST API.
> Dibangun dengan Baileys (unofficial WhatsApp Web API), Fastify, Next.js, dan Prisma.

**GitHub**: https://github.com/AdiSyahadi/WAAPI-DADI.git
**Last Updated**: 11 Februari 2026

---

## 📌 Daftar Isi

1. [Arsitektur & Tech Stack](#1-arsitektur--tech-stack)
2. [Cara Setup & Menjalankan](#2-cara-setup--menjalankan)
3. [Environment Variables](#3-environment-variables)
4. [Database Schema](#4-database-schema)
5. [API Reference — Auth](#5-api-reference--auth)
6. [API Reference — Dashboard (JWT)](#6-api-reference--dashboard-jwt)
7. [API Reference — External / Integrasi (API Key)](#7-api-reference--external--integrasi-api-key)
8. [Frontend Pages](#8-frontend-pages)
9. [Fitur History Sync](#9-fitur-history-sync)
10. [Subscription Plans](#10-subscription-plans)
11. [Background Workers](#11-background-workers)
12. [Anti-Ban & Safety](#12-anti-ban--safety)
13. [Security Features](#13-security-features)

---

## 1. Arsitektur & Tech Stack

### High-Level Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│   WhatsApp   │
│  Next.js 16  │     │  Fastify 4   │     │   (Baileys)  │
│  React 19    │     │  TypeScript  │     │              │
│  Port: 3000  │     │  Port: 3001  │     │  Multi-WA    │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                    ┌───────┼───────┐
                    ▼       ▼       ▼
              ┌─────────┐ ┌─────┐ ┌────────┐
              │  MySQL   │ │Redis│ │ BullMQ │
              │ (Prisma) │ │     │ │Workers │
              └─────────┘ └─────┘ └────────┘
```

### Tech Stack Detail

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| **Backend** | Fastify + TypeScript | v4.26 |
| **Database** | MySQL + Prisma ORM | v5.22 |
| **Cache/Queue** | Redis + BullMQ | v5.0+ |
| **WhatsApp** | @whiskeysockets/baileys | v6.6 |
| **Frontend** | Next.js (App Router) + React | v16.1 / v19 |
| **UI** | Tailwind CSS + Radix UI (Shadcn) | v4 |
| **State** | Zustand (auth) + TanStack React Query (server) | v5 |
| **Auth** | JWT (dashboard) + API Key (external) | — |
| **Payment** | Midtrans (opsional) + Manual Transfer | — |
| **Storage** | Local filesystem / MinIO (S3) | — |
| **Runtime** | Node.js >= 20 | v24.12 |

### Dependencies Backend

| Package | Fungsi |
|---------|--------|
| `fastify` | Web framework utama |
| `@fastify/jwt` | JWT authentication |
| `@fastify/cors` | Cross-Origin Resource Sharing |
| `@fastify/helmet` | Security headers |
| `@fastify/multipart` | File upload (max 10MB, 5 files) |
| `@fastify/rate-limit` | Rate limiting berbasis Redis |
| `@fastify/swagger` | Auto-generate API docs |
| `@prisma/client` | Database ORM |
| `@whiskeysockets/baileys` | WhatsApp Web API (unofficial) |
| `bcrypt` | Password hashing |
| `bullmq` | Background job queue |
| `ioredis` | Redis client |
| `zod` | Schema validation |
| `sharp` | Image processing |
| `qrcode` | QR code generation |
| `pino` | Logger |

### Dependencies Frontend

| Package | Fungsi |
|---------|--------|
| `next` + `react` | Framework + UI |
| `@tanstack/react-query` | Server state management |
| `zustand` | Client state (auth) |
| `axios` | HTTP client |
| `sonner` | Toast notifications |
| `lucide-react` | Icons |
| `@radix-ui/*` | UI primitives (20+ components) |
| `tailwind-merge` + `clsx` | CSS utility |

---

## 2. Cara Setup & Menjalankan

### Prerequisites
- Node.js >= 20
- MySQL 8.0+
- Redis 5.0+

### Langkah Setup

```bash
# 1. Clone repo
git clone https://github.com/AdiSyahadi/WAAPI-DADI.git
cd WAAPI-DADI

# 2. Setup Backend
cd backend
cp .env.example .env        # Edit sesuai config lokal
npm install
npx prisma migrate dev       # Buat tabel di MySQL
npx prisma generate          # Generate Prisma client
npx tsx scripts/seed-plans.ts # Seed subscription plans

# 3. Jalankan Backend
npm run dev                   # Development mode (tsx watch)
# atau
npm run build && npm start    # Production mode

# 4. Setup Frontend
cd ../frontend
npm install

# 5. Jalankan Frontend
npm run dev
```

### Port Default
| Service | Port | URL |
|---------|------|-----|
| Backend API | 3001 | http://localhost:3001 |
| Frontend | 3000 | http://localhost:3000 |
| Swagger Docs | 3001 | http://localhost:3001/api/docs |
| Prisma Studio | 5555 | `npx prisma studio` |

### NPM Scripts (Backend)

| Script | Command | Fungsi |
|--------|---------|--------|
| `dev` | `tsx watch src/index.ts` | Dev server dengan hot reload |
| `build` | `tsc` | Compile TypeScript |
| `start` | `node dist/index.js` | Jalankan production build |
| `prisma:generate` | `prisma generate` | Generate Prisma client |
| `prisma:migrate` | `prisma migrate dev` | Jalankan migration |
| `prisma:studio` | `prisma studio` | GUI database browser |
| `worker` | `tsx src/workers/index.ts` | Jalankan background workers |

---

## 3. Environment Variables

| Variable | Default | Keterangan |
|----------|---------|------------|
| **App** | | |
| `NODE_ENV` | `development` | `development` / `production` |
| `PORT` | `3000` | Port backend server |
| `APP_URL` | `http://localhost:3000` | URL backend |
| `FRONTEND_URL` | `http://localhost:3001` | URL frontend |
| **Database** | | |
| `DATABASE_URL` | `mysql://root:root@localhost:3306/whatsapp_saas` | MySQL connection string |
| **Redis** | | |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL |
| `REDIS_PASSWORD` | _(kosong)_ | Redis password jika ada |
| `REDIS_DB` | `0` | Redis database number |
| **JWT** | | |
| `JWT_SECRET` | _(auto di dev)_ | **WAJIB di production!** |
| `JWT_REFRESH_SECRET` | _(auto di dev)_ | **WAJIB di production!** |
| `JWT_EXPIRES_IN` | `15m` | Masa berlaku access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Masa berlaku refresh token |
| **Storage** | | |
| `FILE_STORAGE_TYPE` | `local` | `local` atau `minio` |
| `FILE_STORAGE_PATH` | `./storage` | Path penyimpanan lokal |
| `MINIO_ENDPOINT` | `localhost` | MinIO server |
| `MINIO_PORT` | `9000` | MinIO port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET_NAME` | `whatsapp-saas` | MinIO bucket |
| **Payment (Opsional)** | | |
| `MIDTRANS_ENABLED` | `false` | Enable Midtrans |
| `MIDTRANS_SERVER_KEY` | — | Midtrans server key |
| `MIDTRANS_CLIENT_KEY` | — | Midtrans client key |
| **Rate Limit** | | |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `15m` | Rate limit time window |
| **WhatsApp** | | |
| `MAX_INSTANCES_PER_SERVER` | `50` | Max WA instance per server |
| `MIN_MESSAGE_DELAY` | `3000` | Delay minimum antar pesan (ms) |
| `MAX_MESSAGE_DELAY` | `7000` | Delay maximum antar pesan (ms) |
| **Webhook** | | |
| `WEBHOOK_MAX_RETRIES` | `5` | Max retry pengiriman webhook |
| `WEBHOOK_RETRY_DELAY` | `60000` | Delay antar retry (ms) |
| `WEBHOOK_TIMEOUT` | `30000` | Timeout request webhook (ms) |
| **Logging** | | |
| `LOG_LEVEL` | `info` | Level log (debug/info/warn/error) |
| `LOG_PRETTY` | `true` | Pretty print log output |
| **CORS** | | |
| `CORS_ORIGIN` | `http://localhost:3001` | Allowed origin |

---

## 4. Database Schema

### Model Overview (22 tabel)

| # | Model | Tabel | Fungsi |
|---|-------|-------|--------|
| 1 | `Organization` | `organizations` | Multi-tenant root entity |
| 2 | `User` | `users` | User management (multi-role) |
| 3 | `WhatsAppInstance` | `whatsapp_instances` | Koneksi WA via Baileys |
| 4 | `Message` | `messages` | Riwayat pesan masuk/keluar |
| 5 | `Contact` | `contacts` | Manajemen kontak |
| 6 | `Webhook` | `webhooks` | Antrian pengiriman webhook |
| 7 | `WebhookLog` | `webhook_logs` | Log percobaan webhook |
| 8 | `ApiKey` | `api_keys` | API key untuk integrasi |
| 9 | `SubscriptionPlan` | `subscription_plans` | Paket berlangganan |
| 10 | `Subscription` | `subscriptions` | Langganan aktif |
| 11 | `Invoice` | `invoices` | Tagihan pembayaran |
| 12 | `PaymentMethodConfig` | `payment_methods_config` | Config Midtrans |
| 13 | `UsageLog` | `usage_logs` | Tracking penggunaan API |
| 14 | `AuditLog` | `audit_logs` | Jejak audit keamanan |
| 15 | `SystemSetting` | `system_settings` | Konfigurasi global |
| 16 | `SessionBackup` | `session_backups` | Backup sesi Baileys |
| 17 | `Broadcast` | `broadcasts` | Kampanye broadcast |
| 18 | `BroadcastRecipient` | `broadcast_recipients` | Penerima broadcast |
| 19 | `TeamInvitation` | `team_invitations` | Undangan tim |
| 20 | `MessageTemplate` | `message_templates` | Template pesan |
| 21 | `Tag` | `tags` | Sistem tagging kontak |
| 22 | `ContactTag` | `contact_tags` | Relasi many-to-many |

### Enum Types (16 total)

| Enum | Values |
|------|--------|
| `UserRole` | `SUPER_ADMIN`, `ORG_OWNER`, `ORG_ADMIN`, `ORG_MEMBER` |
| `InstanceStatus` | `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `QR_READY`, `ERROR`, `BANNED` |
| `MessageType` | `TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `DOCUMENT`, `LOCATION`, `CONTACT`, `STICKER`, `REACTION`, `POLL`, `UNKNOWN` |
| `MessageDirection` | `INCOMING`, `OUTGOING` |
| `MessageStatus` | `PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` |
| `MessageSource` | `REALTIME`, `HISTORY_SYNC`, `MANUAL_IMPORT` |
| `HistorySyncStatus` | `IDLE`, `SYNCING`, `COMPLETED`, `FAILED`, `PARTIAL` |
| `WebhookStatus` | `PENDING`, `PROCESSING`, `DELIVERED`, `FAILED` |
| `SubscriptionStatus` | `TRIAL`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED` |
| `BillingPeriod` | `MONTHLY`, `QUARTERLY`, `YEARLY` |
| `InvoiceStatus` | `PENDING`, `PAID`, `FAILED`, `REFUNDED`, `CANCELED` |
| `PaymentMethod` | `MANUAL_TRANSFER`, `MIDTRANS_BANK_TRANSFER`, `MIDTRANS_CREDIT_CARD`, `MIDTRANS_GOPAY`, `MIDTRANS_OVO`, `MIDTRANS_QRIS` |
| `WarmingPhase` | `DAY_1_3`, `DAY_4_7`, `DAY_8_14`, `DAY_15_PLUS` |
| `BroadcastStatus` | `DRAFT`, `SCHEDULED`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED` |
| `BroadcastRecipientType` | `ALL_CONTACTS`, `SELECTED_TAGS`, `SELECTED_CONTACTS`, `CSV_UPLOAD`, `MANUAL_INPUT` |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `EXPIRED`, `CANCELED` |

### Key Model Fields

#### Organization
```
id, name, slug (unique), email, phone, logo_url,
subscription_plan_id, subscription_status, trial_ends_at,
max_instances, max_contacts, max_messages_per_day,
is_active, created_at, updated_at, deleted_at
```

#### User
```
id, organization_id, email (unique), password_hash, full_name,
phone, avatar_url, role (UserRole), is_active, is_email_verified,
last_login_at, last_login_ip, refresh_token, reset_token,
two_factor_enabled, two_factor_secret, created_at, updated_at, deleted_at
```

#### WhatsAppInstance
```
id, organization_id, name, phone_number, qr_code,
status (InstanceStatus), connection_state, is_active,
session_data (encrypted), health_score, account_age_days,
daily_message_count, daily_limit, warming_phase,
connected_at, disconnected_at,
webhook_url, webhook_events (Json), webhook_secret,
auto_reply_enabled, auto_reply_max_per_hour,
sync_history_on_connect, history_sync_status, history_sync_progress (Json),
last_history_sync_at, created_at, updated_at, deleted_at
```

#### Message
```
id, organization_id, instance_id, wa_message_id,
chat_jid, sender_jid, message_type, content,
media_url, media_type, caption,
direction (INCOMING/OUTGOING), status,
source (REALTIME/HISTORY_SYNC/MANUAL_IMPORT),
sent_at, delivered_at, read_at, failed_at,
error_message, retry_count, created_at, updated_at

Unique: [wa_message_id, instance_id]
Index: [instance_id, source, created_at]
```

#### Contact
```
id, organization_id, instance_id, jid, phone_number,
name, push_name, is_business, is_enterprise, is_group,
profile_pic_url, status_text, tags (Json), custom_fields (Json),
notes, last_seen_at, created_at, updated_at

Unique: [instance_id, jid]
```

---

## 5. API Reference — Auth

**Base URL**: `http://localhost:3001/api/auth`

### Endpoints

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| `POST` | `/register` | ❌ Public | Register organisasi baru + user owner |
| `POST` | `/login` | ❌ Public | Login → `access_token` + `refresh_token` |
| `POST` | `/refresh` | ❌ Public | Refresh access token |
| `POST` | `/forgot-password` | ❌ Public | Request reset password |
| `POST` | `/reset-password` | ❌ Public | Reset password dengan token |
| `GET` | `/me` | 🔐 JWT | Get profil user yang login |
| `POST` | `/logout` | 🔐 JWT | Logout (hapus refresh token) |
| `POST` | `/change-password` | 🔐 JWT | Ganti password |
| `PATCH` | `/profile` | 🔐 JWT | Update profil (nama, phone, avatar) |

### Contoh: Register

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "full_name": "John Doe",
    "organization_name": "My Company"
  }'
```

### Contoh: Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "full_name": "..." },
    "organization": { "id": "...", "name": "...", "subscription_status": "TRIAL" },
    "tokens": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "eyJhbGci..."
    }
  }
}
```

---

## 6. API Reference — Dashboard (JWT)

**Base URL**: `http://localhost:3001/api/whatsapp`
**Auth**: `Authorization: Bearer <access_token>`

### Instance Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/instances` | List semua instance (filter: status, search, paginated) |
| `POST` | `/instances` | Buat instance baru |
| `GET` | `/instances/:id` | Detail instance |
| `PATCH` | `/instances/:id` | Update settings (nama, webhook, auto-reply) |
| `DELETE` | `/instances/:id` | Hapus instance (soft delete) |

### Connection Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/instances/:id/connect` | Mulai koneksi (generate QR) |
| `POST` | `/instances/:id/disconnect` | Disconnect instance |
| `GET` | `/instances/:id/qr` | Ambil QR code saat ini |
| `GET` | `/instances/:id/status` | Status koneksi real-time |
| `POST` | `/instances/:id/restart` | Restart koneksi |

### Messaging

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/instances/:id/messages/text` | Kirim pesan teks |
| `POST` | `/instances/:id/messages/media` | Kirim media (gambar/video/audio/doc) |
| `POST` | `/instances/:id/messages/location` | Kirim lokasi |
| `GET` | `/instances/:id/messages` | Riwayat pesan per instance |
| `GET` | `/messages` | Semua pesan organisasi |
| `POST` | `/messages/send` | Kirim pesan (instance_id di body) |

### History Sync

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/instances/:id/sync-status` | Status history sync |
| `PATCH` | `/instances/:id/sync-settings` | Update setting sync |
| `POST` | `/instances/:id/re-pair` | Re-pair untuk full sync (logout + scan QR baru) |

### Contoh: Buat Instance

```bash
curl -X POST http://localhost:3001/api/whatsapp/instances \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{ "name": "CS WhatsApp 1" }'
```

### Contoh: Kirim Pesan Teks

```bash
curl -X POST http://localhost:3001/api/whatsapp/instances/INSTANCE_ID/messages/text \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "6281234567890",
    "text": "Halo dari WA SaaS!"
  }'
```

---

## 7. API Reference — External / Integrasi (API Key)

**Base URL**: `http://localhost:3001/api/v1`
**Auth**: `X-API-Key: wa_xxxxxxxxxxxx`

> API ini dirancang untuk integrasi dengan **n8n, Make, Zapier**, dan tools lainnya.

### Instance

| Method | Endpoint | Permission | Deskripsi |
|--------|----------|-----------|-----------|
| `GET` | `/instances` | — | List semua instance |
| `GET` | `/instances/:id/status` | — | Status koneksi instance |
| `DELETE` | `/instances/:id/data` | `instance:write` | Hapus semua data instance (tetap ada) |
| `POST` | `/instances/:id/reset` | `instance:write` | Full reset (disconnect + hapus data) |

### Messaging

| Method | Endpoint | Permission | Deskripsi |
|--------|----------|------------|-----------|
| `POST` | `/messages/send-text` | `message:send` | Kirim pesan teks |
| `POST` | `/messages/send-media` | `message:send` | Kirim media |
| `POST` | `/messages/send-location` | `message:send` | Kirim lokasi |
| `GET` | `/messages` | `message:read` | Riwayat pesan (filter: instance, arah, phone, JID, search, waktu) |

### Contacts

| Method | Endpoint | Permission | Deskripsi |
|--------|----------|------------|-----------|
| `GET` | `/contacts` | `contact:read` | List kontak |
| `POST` | `/contacts` | `contact:write` | Buat kontak baru |
| `GET` | `/contacts/:id` | `contact:read` | Detail kontak |
| `PATCH` | `/contacts/:id` | `contact:write` | Update kontak |
| `DELETE` | `/contacts/:id` | `contact:delete` | Hapus kontak |

### Conversations

| Method | Endpoint | Permission | Deskripsi |
|--------|----------|------------|-----------|
| `GET` | `/conversations` | `message:read` | List percakapan (grouped chats + unread count + info kontak) |

### Webhook Config

| Method | Endpoint | Permission | Deskripsi |
|--------|----------|------------|-----------|
| `GET` | `/webhook/config` | `webhook:read` | Ambil konfigurasi webhook |
| `PUT` | `/webhook/config` | `webhook:write` | Buat/update config webhook (URL, events, secret) |
| `DELETE` | `/webhook/config/:id` | `webhook:write` | Hapus config webhook |
| `GET` | `/webhook/status` | `webhook:read` | Stats webhook (total/delivered/failed/pending) |

### Auto-Reply

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/instances/:id/auto-reply` | Get auto-reply settings |
| `PATCH` | `/instances/:id/auto-reply` | Update auto-reply (enable/disable, max/hour) |

### History Sync

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/instances/:id/sync-history/status` | Status history sync |
| `PATCH` | `/api/instances/:id/sync-history/settings` | Update setting sync |
| `POST` | `/api/instances/:id/sync-history/re-pair` | Re-pair untuk sync |

### Health

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health check + verifikasi API key |

### Contoh: Kirim Pesan via API Key

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-text \
  -H "X-API-Key: wa_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "INSTANCE_ID",
    "to": "6281234567890",
    "text": "Halo dari integrasi n8n!"
  }'
```

### Contoh: Ambil Conversations

```bash
curl http://localhost:3001/api/v1/conversations \
  -H "X-API-Key: wa_xxxxxxxxxxxx"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "chat_jid": "6281234567890@s.whatsapp.net",
      "contact_name": "John Doe",
      "last_message": "Halo!",
      "last_message_time": "2026-02-11T10:30:00Z",
      "unread_count": 3,
      "message_type": "TEXT"
    }
  ]
}
```

---

## 8. Frontend Pages

### Halaman Publik

| Path | Halaman |
|------|---------|
| `/` | Landing page |
| `/login` | Login |
| `/register` | Registrasi |

### Dashboard (Login Required)

| Path | Halaman |
|------|---------|
| `/dashboard` | Dashboard utama |
| `/dashboard/whatsapp/instances` | Daftar WhatsApp instance |
| `/dashboard/whatsapp/instances/[id]` | Detail instance (Overview, QR, **History Sync**, Settings) |
| `/dashboard/whatsapp/instances/[id]/settings` | Settings instance (General, Webhook, Advanced) |
| `/dashboard/whatsapp/messages` | Semua pesan (filter by source: Real-time / Synced) |
| `/dashboard/whatsapp/broadcast` | Broadcast / kampanye |
| `/dashboard/contacts` | Manajemen kontak |
| `/dashboard/webhooks` | Konfigurasi webhook |
| `/dashboard/api-keys` | Manajemen API key |
| `/dashboard/team` | Manajemen tim |
| `/dashboard/billing` | Paket langganan |
| `/dashboard/billing/invoices` | Daftar tagihan |
| `/dashboard/settings` | Pengaturan akun |
| `/dashboard/docs` | Dokumentasi API |

### Admin Panel

| Path | Halaman |
|------|---------|
| `/dashboard/admin` | Admin dashboard |
| `/dashboard/admin/organizations` | Kelola organisasi |
| `/dashboard/admin/users` | Kelola user |

---

## 9. Fitur History Sync

### Apa itu History Sync?
Fitur untuk meng-import riwayat chat dari WhatsApp ke database saat pertama kali pairing (scan QR). WhatsApp secara otomatis mengirim history chat lama saat device baru terhubung.

### Cara Kerja

```
1. User enable "Auto-sync on connect" di tab History Sync
2. User klik "Re-pair & Sync" (logout session lama)
3. User connect ulang → scan QR baru
4. Baileys menerima event messaging-history.set dari WhatsApp
5. System memproses batch per 100 pesan:
   - Cek quota plan
   - Insert pesan ke database (skipDuplicates)
   - Upsert kontak baru
   - Track progress (total, inserted, skipped, errors)
6. Selesai setelah 30 detik tanpa data baru → status COMPLETED/PARTIAL
```

### Status Sync

| Status | Arti |
|--------|------|
| `IDLE` | Belum pernah sync / default |
| `SYNCING` | Sedang memproses history |
| `COMPLETED` | Semua data berhasil di-sync |
| `PARTIAL` | Sebagian data ter-sync (quota tercapai) |
| `FAILED` | Sync gagal (error) |

### Quota per Plan

| Plan | Allow Sync | Max Messages |
|------|-----------|-------------|
| Free | ❌ | 0 |
| Starter | ✅ | 5,000 |
| Pro | ✅ | 50,000 |
| Enterprise | ✅ | Unlimited |

### Progress Tracking (JSON)

```json
{
  "total_messages_received": 61898,
  "messages_inserted": 50000,
  "messages_skipped_duplicate": 2,
  "contacts_synced": 3132,
  "batch_errors": 0,
  "quota_reached": true,
  "quota_limit": 50000,
  "quota_used": 50000
}
```

### Akses di UI

1. Buka dashboard → WhatsApp → Instances
2. Klik instance → tab **"History Sync"**
3. Enable toggle "Auto-sync on connect"
4. Klik "Re-pair & Sync" → confirm → scan QR baru
5. Pantau progress di status card

---

## 10. Subscription Plans

| Plan | Harga/bulan | Instances | Contacts | Pesan/hari | History Sync | Max Sync |
|------|-------------|-----------|----------|-----------|-------------|----------|
| **Free** | IDR 0 | 1 | 100 | 20 | ❌ | 0 |
| **Starter** | IDR 99.000 | 2 | 1.000 | 100 | ✅ | 5.000 |
| **Pro** | IDR 299.000 | 5 | 10.000 | 500 | ✅ | 50.000 |
| **Enterprise** | IDR 999.000 | 20 | 100.000 | 2.000 | ✅ | Unlimited |

### Fitur per Plan

| Fitur | Free | Starter | Pro | Enterprise |
|-------|------|---------|-----|-----------|
| WhatsApp Instance | 1 | 2 | 5 | 20 |
| Basic Webhook | ✅ | ✅ | ✅ | ✅ |
| Auto-Reply | ❌ | ✅ | ✅ | ✅ |
| API Access | ❌ | ✅ | ✅ | ✅ |
| Broadcast | ❌ | ❌ | ✅ | ✅ |
| History Sync | ❌ | ✅ | ✅ | ✅ |
| CRM Integration | ❌ | ❌ | ✅ | ✅ |
| Priority Support | ❌ | ❌ | ✅ | ❌ |
| Dedicated Support | ❌ | ❌ | ❌ | ✅ |
| Custom Webhook Headers | ❌ | ❌ | ❌ | ✅ |
| SLA 99.9% | ❌ | ❌ | ❌ | ✅ |

---

## 11. Background Workers

Menggunakan **BullMQ** (Redis-backed job queue).

| Worker | Fungsi |
|--------|--------|
| **Webhook Worker** | Kirim webhook ke URL tujuan dengan retry (max 5x, exponential backoff) |
| **Broadcast Worker** | Proses pengiriman broadcast ke banyak penerima dengan delay anti-ban |
| **Daily Reset Worker** | Reset counter `daily_message_count` setiap tengah malam |
| **Media Cleanup Worker** | Bersihkan file media expired/orphaned |

### Webhook Events yang Dikirim

| Event | Trigger |
|-------|---------|
| `message.received` | Pesan masuk diterima |
| `message.sent` | Pesan keluar berhasil terkirim |
| `connection.connected` | Instance terhubung ke WhatsApp |
| `connection.disconnected` | Instance terputus |
| `history_sync.started` | History sync mulai |
| `history_sync.progress` | Update progress sync |
| `history_sync.completed` | Sync selesai |

---

## 12. Anti-Ban & Safety

Sistem dilengkapi mekanisme keamanan untuk menghindari ban WhatsApp:

| Fitur | Deskripsi |
|-------|-----------|
| **Warming Phase** | 4 fase pemanasan akun baru (DAY_1_3 → DAY_15_PLUS) |
| **Daily Message Limit** | Batas pesan harian per instance |
| **Health Score** | Skor kesehatan koneksi (0-100) |
| **Message Delay** | Random delay 3-7 detik antar pesan (configurable) |
| **Account Age Tracking** | Track umur akun untuk adjust limit |
| **Auto Reconnect** | Reconnect otomatis saat koneksi terputus |

### Warming Phase Detail

| Phase | Hari | Limit Pesan/hari |
|-------|------|-----------------|
| `DAY_1_3` | 1-3 | Sangat rendah |
| `DAY_4_7` | 4-7 | Rendah |
| `DAY_8_14` | 8-14 | Medium |
| `DAY_15_PLUS` | 15+ | Normal (sesuai plan) |

---

## 13. Security Features

| # | Fitur | Implementasi |
|---|-------|-------------|
| 1 | **Password Hashing** | bcrypt (salt rounds: 12) |
| 2 | **JWT dengan Refresh Token** | Access: 15m, Refresh: 7d |
| 3 | **API Key Hashing** | Key disimpan sebagai SHA-256 hash, bukan plaintext |
| 4 | **Rate Limiting** | Redis-backed, configurable per endpoint |
| 5 | **CORS** | Strict origin policy |
| 6 | **Helmet** | Security headers (XSS, HSTS, etc.) |
| 7 | **Input Validation** | Zod schema validation di semua endpoint |
| 8 | **SQL Injection Prevention** | Prisma parameterized queries |
| 9 | **Soft Delete** | Data tidak dihapus permanen (`deleted_at`) |
| 10 | **Multi-tenant Isolation** | Organization-based data isolation via Prisma middleware |
| 11 | **Audit Logging** | Log semua aksi sensitif |
| 12 | **Session Encryption** | Baileys session data dienkripsi |
| 13 | **2FA Support** | Two-factor authentication (TOTP) |
| 14 | **Webhook Secret** | HMAC signature untuk validasi webhook |

---

## ❓ FAQ

### Q: Ini pakai API resmi WhatsApp?
**A:** Tidak. Ini menggunakan **Baileys** (unofficial WhatsApp Web API). Artinya gratis tanpa biaya per pesan, tapi ada risiko akun bisa di-ban jika dipakai berlebihan.

### Q: Berapa instance WA yang bisa jalan bersamaan?
**A:** Tergantung plan (1-20 instance) dan kapasitas server. Default max 50 per server (`MAX_INSTANCES_PER_SERVER`).

### Q: Bagaimana cara integrasi dengan n8n/Make?
**A:** Buat API key di dashboard → pakai header `X-API-Key: wa_xxx` → panggil endpoint di `/api/v1/`.

### Q: Apakah data pesan terenkripsi di database?
**A:** Konten pesan disimpan plaintext di database. Baileys session (credential) dienkripsi. Untuk keamanan tambahan, gunakan enkripsi level database (MySQL TDE).

### Q: Kenapa status sync "PARTIAL"?
**A:** Quota plan Anda tercapai. Misal Pro plan max 50.000 pesan, tapi WA mengirim 60.000+ history. Upgrade ke Enterprise untuk unlimited.

### Q: Apakah perlu Redis?
**A:** Ya, Redis **wajib** untuk rate limiting, BullMQ job queue, dan caching. Tanpa Redis, server tidak bisa start.

---

> 📝 **Catatan**: Dokumentasi ini di-generate dari codebase aktual project. Untuk API docs interaktif (Swagger), buka http://localhost:3001/api/docs saat server berjalan.

# 📋 Jawaban untuk Pertanyaan Teman Anda

> **Update 2026-02-09:** Semua endpoint yang sebelumnya MISSING sudah **DIIMPLEMENTASI DAN DITEST** ✅

Setelah audit mendalam dan implementasi, berikut status lengkap API:

---

## ✅ Pertanyaan yang Sudah Terjawab

### 1️⃣ **Base URL Production**
**Development:** `http://localhost:3001/api/v1`  
**Production:** Configurable via `APP_URL` di `.env`

📌 **Contoh:**
```bash
APP_URL=https://api.yourdomain.com
```

---

### 2️⃣ **Cara Dapat API Key**
**Jawaban:** Dibuat via dashboard (butuh JWT token dulu)

**Cara:**
1. Login ke dashboard → dapat JWT token
2. POST `/api/api-keys` dengan JWT token
3. API key akan di-generate (hanya muncul 1x)

📌 **Note:** API key creation **TIDAK bisa** via API key lain, harus pakai JWT token dari dashboard login.

---

### 3️⃣ **Endpoint PUT/DELETE Contact**
**Jawaban:** ✅ **SUDAH ADA di External API** (baru ditambahkan)

**Endpoints tersedia:**
```http
GET    /api/v1/contacts/:id   → Get single contact (permission: contact:read)
PATCH  /api/v1/contacts/:id   → Update contact (permission: contact:write)
DELETE /api/v1/contacts/:id   → Delete contact (permission: contact:delete)
```

**Contoh Update Contact:**
```bash
PATCH /api/v1/contacts/{id}
X-API-Key: wa_xxxxx
Content-Type: application/json

{
  "name": "Updated Name",
  "tags": ["vip", "premium"],
  "notes": "Important customer",
  "custom_fields": { "company": "PT ABC", "role": "CEO" }
}
```

✅ **Tested & Verified** — Create, Read, Update, Delete semua berfungsi.

---

### 4️⃣ **Endpoint List Conversations (Grouped Chat per Contact)**
**Jawaban:** ✅ **SUDAH ADA** (baru ditambahkan)

**Endpoint:**
```http
GET /api/v1/conversations?instance_id={id}&page=1&limit=20
X-API-Key: wa_xxxxx
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "chat_jid": "628123456789@s.whatsapp.net",
      "instance_id": "xxx",
      "phone_number": "628123456789",
      "contact_name": "John Doe",
      "contact_id": "contact-uuid",
      "contact_tags": ["vip"],
      "total_messages": 58,
      "unread_count": 23,
      "last_message": {
        "id": "msg-uuid",
        "content": "Hello!",
        "message_type": "TEXT",
        "direction": "OUTGOING",
        "status": "SENT",
        "created_at": "2026-02-09T13:48:21.616Z"
      },
      "last_message_at": "2026-02-09T13:48:21.616Z"
    }
  ],
  "pagination": { "total": 23, "page": 1, "limit": 20, "total_pages": 2 }
}
```

✅ **Tested & Verified** — Menampilkan 23 conversations dengan enrichment lengkap.

---

### 5️⃣ **Media yang Diterima (Dari Customer) - Akses via URL**
**Jawaban:** ✅ **YA, ada `media_url` di webhook payload**

**Contoh webhook payload untuk incoming image:**
```json
{
  "event": "message.received",
  "data": {
    "message_type": "image",
    "content": "Check this photo",
    "media_url": "https://your-domain.com/storage/media/xyz.jpg"
  }
}
```

📌 **Konfirmasi yang perlu ditanyakan:**
- Apakah `media_url` langsung accessible (public) atau perlu authentication?
- Format URL-nya seperti apa?
- Berapa lama media disimpan?

---

### 6️⃣ **Berapa Instance WhatsApp yang Bisa Dipakai**
**Jawaban:** ✅ **MULTIPLE instances per organization**

**Bukti dari code:**
- `GET /api/v1/instances` - Return array instances
- Database: `whatsAppInstance` table dengan `organization_id`
- Bisa create banyak instance per organization

📌 **Limitasi:** Tergantung plan/subscription (perlu tanya ke teman Anda)

---

### 7️⃣ **Endpoint Search/Filter Messages by Contact/Phone**
**Jawaban:** ✅ **SUDAH ADA** (baru ditambahkan)

**Endpoint:**
```http
GET /api/v1/messages?phone_number=628123456789
GET /api/v1/messages?chat_jid=628123456789@s.whatsapp.net
GET /api/v1/messages?search=keyword
```

**Contoh Response (filter by chat_jid):**
```json
{
  "success": true,
  "messages": [...],  // 28 filtered messages
  "pagination": { "total": 28, "page": 1, "limit": 50 }
}
```

✅ **Tested & Verified:**
- Filter by `chat_jid` → 28 messages returned
- Search by keyword "Bandung" → 15 messages returned

---

## ✅ Endpoint yang Sebelumnya MISSING — Sekarang SUDAH ADA

| # | Feature | Endpoint | Status |
|---|---------|----------|--------|
| 1 | **Update Contact** | `PATCH /api/v1/contacts/:id` | ✅ Tested |
| 2 | **Delete Contact** | `DELETE /api/v1/contacts/:id` | ✅ Tested |
| 3 | **Get Single Contact** | `GET /api/v1/contacts/:id` | ✅ Tested |
| 4 | **Messages by Contact** | `GET /api/v1/messages?phone_number=xxx` | ✅ Tested |
| 5 | **Messages by Chat JID** | `GET /api/v1/messages?chat_jid=xxx` | ✅ Tested |
| 6 | **Search Messages** | `GET /api/v1/messages?search=keyword` | ✅ Tested |
| 7 | **List Conversations** | `GET /api/v1/conversations` | ✅ Tested |
| 8 | **Webhook Config (GET)** | `GET /api/v1/webhook/config` | ✅ Tested |
| 9 | **Webhook Config (PUT)** | `PUT /api/v1/webhook/config` | ✅ Tested |
| 10 | **Webhook Config (DELETE)** | `DELETE /api/v1/webhook/config/:instanceId` | ✅ Tested |
| 11 | **Media Cleanup Worker** | Auto-delete media > 30 hari | ✅ Running |

---

## ✅ Jawaban untuk Pertanyaan Tambahan Teman Anda

### 1️⃣ **Base URL Production**
**Status:** Configurable via environment variable

**Detail:**
- Development: `http://localhost:3001/api/v1`
- Production: Set via `APP_URL` di `.env` file
- Contoh: `APP_URL=https://api.yourdomain.com`

📌 **Untuk deploy production:**
```bash
# Di .env production
APP_URL=https://api.yourdomain.com
FRONTEND_URL=https://dashboard.yourdomain.com
NODE_ENV=production
```

---

### 2️⃣ **Media URL - Akses & Authentication**
**Jawaban:** ✅ **PUBLIC - Tidak perlu authentication**

**Detail Lengkap:**
- **URL Format:** `https://your-domain.com/uploads/media/{filename}`
- **Served via:** `@fastify/static` di route `/uploads/`
- **Storage Location:** 
  - Local: `backend/storage/` (default)
  - MinIO: Configurable untuk cloud storage
- **Tidak perlu auth:** Siapa saja bisa akses media URL langsung

✅ **Retention Policy:** SUDAH ADA (baru ditambahkan)
- Media di auto-delete setelah **30 hari** (configurable via `MEDIA_RETENTION_DAYS`)
- Cleanup worker jalan setiap **24 jam**
- Empty directories otomatis dibersihkan
- Storage stats monitoring tersedia

---

### 3️⃣ **Max Instances per Organization**
**Jawaban:** **CONFIGURABLE per organization**

**Default Limits:**
- **New organization:** `max_instances = 1` (default)
- **Per server:** Max 50 instances total
- **Per organization:** Bisa diubah di database

**Cara Update:**
```sql
-- Update max instances untuk specific organization
UPDATE Organization 
SET max_instances = 5 
WHERE id = 'org-uuid-here';
```

**Business Logic:**
- Tergantung subscription plan
- Trial: 1 instance
- Paid: Sesuai plan (bisa 5, 10, unlimited)

📌 **Check di code:**
```typescript
// Di Organization model (schema.prisma):
max_instances     Int      @default(1)
max_contacts      Int      @default(1000)
max_messages_per_day Int   @default(100)
```

---

### 4️⃣ **Webhook Setup - JWT atau API Key?**
**Jawaban:** ✅ **KEDUANYA SUDAH BISA** (API key support baru ditambahkan)

**Via API Key (baru):**
```http
# List webhook configs
GET /api/v1/webhook/config
X-API-Key: wa_xxxxx

# Create/Update webhook
PUT /api/v1/webhook/config
X-API-Key: wa_xxxxx
Content-Type: application/json
{
  "instance_id": "xxx",
  "url": "https://your-crm.com/webhook",
  "events": ["message.received", "message.sent"],
  "secret": "optional-webhook-secret"
}

# Delete webhook config
DELETE /api/v1/webhook/config/{instanceId}
X-API-Key: wa_xxxxx
```

**Permissions required:**
- `webhook:read` — untuk GET
- `webhook:write` — untuk PUT dan DELETE

**Via JWT (dashboard) — tetap bisa:**
```http
POST /api/webhooks
Authorization: Bearer <jwt_token>
```

✅ **Tested & Verified** — GET, PUT, DELETE semua berfungsi via API key.

---

## ✅ Semua Action Items — COMPLETED

Semua endpoint yang sebelumnya missing sudah diimplementasi dan ditest live:

1. ✅ `PATCH /api/v1/contacts/:id` — Update contact via API key
2. ✅ `DELETE /api/v1/contacts/:id` — Delete contact via API key
3. ✅ `GET /api/v1/contacts/:id` — Get single contact via API key
4. ✅ `GET /api/v1/messages?phone_number=xxx` — Filter messages by phone
5. ✅ `GET /api/v1/messages?chat_jid=xxx` — Filter messages by chat JID
6. ✅ `GET /api/v1/messages?search=keyword` — Search messages by content
7. ✅ `GET /api/v1/conversations` — List grouped chat threads
8. ✅ `PUT /api/v1/webhook/config` — Configure webhook via API key
9. ✅ `GET /api/v1/webhook/config` — List webhook configs via API key
10. ✅ `DELETE /api/v1/webhook/config/:instanceId` — Remove webhook via API key
11. ✅ Media cleanup worker — Auto-delete files > 30 hari

---

## 📊 Summary

| Feature | Status | Tested? |
|---------|--------|---------|
| Update Contact (External API) | ✅ Available | ✅ Passed |
| Delete Contact (External API) | ✅ Available | ✅ Passed |
| Get Single Contact | ✅ Available | ✅ Passed |
| List Conversations | ✅ Available | ✅ Passed |
| Filter Messages by Contact | ✅ Available | ✅ Passed |
| Search Messages | ✅ Available | ✅ Passed |
| Webhook Config via API Key | ✅ Available | ✅ Passed |
| Media Cleanup Worker | ✅ Running | ✅ Started |
| Media URL Access | ✅ Public (No Auth) | ✅ |
| Multiple Instances | ✅ Configurable | ✅ |
| Base URL Production | ✅ Configurable (.env) | ✅ |

---

## 🎯 Kesimpulan

API ini **sudah lengkap dan production-ready** untuk CRM integration:

### ✅ **Semua Feature Tersedia:**
1. Full CRUD contact management via API key ✓
2. Conversations list with enrichment (last message, unread count, contact info) ✓
3. Message filtering by phone, chat_jid, and search keyword ✓
4. Webhook configuration via API key (no JWT needed) ✓
5. Media auto-cleanup (30 hari retention) ✓
6. Multiple WhatsApp instances per organization ✓
7. Media files publicly accessible ✓
8. Comprehensive message delivery ✓
9. Webhook auto-reply support ✓

### 📋 **API Key Permissions yang Dibutuhkan:**
| Permission | Untuk |
|-----------|-------|
| `message:read` | Baca messages, conversations |
| `message:send` | Kirim messages |
| `contact:read` | List/get contacts |
| `contact:write` | Create/update contacts |
| `contact:delete` | Delete contacts |
| `instance:read` | List instances |
| `webhook:read` | List webhook configs |
| `webhook:write` | Create/update/delete webhook configs |

Semua endpoint sudah **ditest live** dan berfungsi dengan baik! 🚀

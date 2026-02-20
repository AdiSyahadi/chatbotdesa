# 🔄 Panduan Migrasi API — WAAPI v2 (Patch 068-117)

> **Tanggal**: 19 Februari 2026  
> **Versi**: Post-hardening (PATCH-068 → PATCH-117)  
> **Untuk**: Developer CRM / API Consumer eksternal

Dokumen ini berisi semua perubahan yang **berdampak ke integrasi CRM** setelah production hardening. Silakan sesuaikan kode CRM berdasarkan panduan di bawah.

---

## ⚠️ BREAKING CHANGES (Wajib Disesuaikan)

### 1. Format Error Response Berubah

**Prioritas: TINGGI** — Semua error response sekarang menggunakan format structured.

#### Sebelum:
```json
{
  "success": false,
  "error": "Instance not found"
}
```

#### Sesudah:
```json
{
  "success": false,
  "error": {
    "code": "INSTANCE_NOT_FOUND",
    "message": "Instance not found"
  }
}
```

#### Yang perlu diubah di CRM:
```javascript
// ❌ LAMA — tidak akan bekerja lagi
if (response.error === 'Instance not found') { ... }

// ✅ BARU — gunakan salah satu
if (response.error.code === 'INSTANCE_NOT_FOUND') { ... }
if (response.error.message === 'Instance not found') { ... }
```

#### Daftar Error Code yang tersedia:

| Code | Message | HTTP Status |
|------|---------|-------------|
| `INSTANCE_NOT_FOUND` | Instance not found | 404 |
| `INSTANCE_NOT_CONNECTED` | Instance is not connected | 400 |
| `SEND_FAILED` | Failed to send message | 500 |
| `MISSING_CONTENT` | Message content is required | 400 |
| `INVALID_MEDIA_TYPE` | Invalid media type | 400 |
| `MEDIA_DOWNLOAD_FAILED` | Failed to download media | 400 |
| `UNAUTHORIZED` | Invalid or missing API key | 401 |
| `INSUFFICIENT_PERMISSION` | API key lacks required permission | 403 |
| `RATE_LIMITED` | Too many requests | 429 |
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `CONTACT_NOT_FOUND` | Contact not found | 404 |
| `BROADCAST_NOT_FOUND` | Broadcast not found | 404 |
| `WEBHOOK_NOT_FOUND` | Webhook not found | 404 |
| `INTERNAL_ERROR` | Internal server error | 500 |

> **Tips**: Gunakan `error.code` untuk logic branching (stabil, tidak berubah), dan `error.message` untuk display ke user.

---

### 2. API Key Wajib Punya Permission

**Prioritas: TINGGI** — API key tanpa permission yang sesuai akan mendapat **403 Forbidden**.

#### Sebelum:
Semua API key bisa akses semua endpoint tanpa batasan permission.

#### Sesudah:
Setiap endpoint dicek permission-nya. Berikut daftar permission yang dibutuhkan:

| Endpoint | Method | Permission |
|----------|--------|------------|
| `/api/v1/instances` | GET | `instance:read` |
| `/api/v1/instances/:id/status` | GET | `instance:read` |
| `/api/v1/instances/:id/auto-reply` | GET | `instance:read` |
| `/api/v1/instances/:id/auto-reply` | PATCH | `instance:write` |
| `/api/v1/instances/:id/messages/text` | POST | `message:send` |
| `/api/v1/instances/:id/messages/media` | POST | `message:send` |
| `/api/v1/instances/:id/messages/location` | POST | `message:send` |
| `/api/v1/instances/:id/messages/contact` | POST | `message:send` |
| `/api/v1/instances/:id/messages` | GET | `message:read` |
| `/api/v1/contacts` | GET | `contact:read` |
| `/api/v1/contacts` | POST | `contact:write` |
| `/api/v1/contacts/:id` | DELETE | `contact:delete` |
| `/api/v1/broadcasts` | GET | `broadcast:read` |
| `/api/v1/broadcasts` | POST | `broadcast:write` |
| `/api/v1/webhooks` | GET | `webhook:read` |
| `/api/v1/webhooks` | POST | `webhook:write` |
| `/api/v1/instances/:id/sync-history/*` | GET | `instance:read` |
| `/api/v1/instances/:id/sync-history/*` | POST/PATCH | `instance:write` |

#### Solusi paling cepat:
Buat API key baru dengan permission **`full_access`** — ini memberikan akses ke semua endpoint.

#### Atau, berikan permission spesifik:
```
instance:read, instance:write, message:send, message:read, contact:read, contact:write, broadcast:read, broadcast:write, webhook:read, webhook:write
```

---

### 3. URL History Sync Berubah

**Prioritas: SEDANG** — URL lama yang salah (double prefix) sudah diperbaiki.

| Endpoint | URL Lama (SALAH) | URL Baru (BENAR) |
|----------|-----------------|-------------------|
| Sync status | `/api/v1/api/instances/:id/sync-history/status` | `/api/v1/instances/:id/sync-history/status` |
| Sync settings | `/api/v1/api/instances/:id/sync-history/settings` | `/api/v1/instances/:id/sync-history/settings` |
| Re-pair | `/api/v1/api/instances/:id/re-pair` | `/api/v1/instances/:id/re-pair` |
| Control | `/api/v1/api/instances/:id/sync-history/control` | `/api/v1/instances/:id/sync-history/control` |

> Jika CRM tidak menggunakan fitur history sync, perubahan ini tidak berdampak.

---

## 🔶 Perubahan Minor (Disarankan Disesuaikan)

### 4. Pagination Dibatasi Maksimal 100 Item

#### Sebelum:
```
GET /api/v1/contacts?limit=99999  → Mengembalikan semua data
```

#### Sesudah:
```
GET /api/v1/contacts?limit=99999  → Mengembalikan maksimal 100 item
```

#### Yang perlu diubah:
Jika CRM perlu mengambil semua data, gunakan pagination loop:

```javascript
let page = 1;
let allData = [];

while (true) {
  const res = await fetch(`/api/v1/contacts?page=${page}&limit=100`);
  const data = await res.json();
  allData.push(...data.contacts);
  
  if (data.pagination.page >= data.pagination.total_pages) break;
  page++;
}
```

---

### 5. Nomor Telepon Harus Angka Saja (Broadcast)

#### Sebelum:
```json
{ "phone_numbers": ["+62-812-3456-7890", "(0812) 3456 7890"] }
```
→ Diterima

#### Sesudah:
```json
{ "phone_numbers": ["+62-812-3456-7890"] }
```
→ **Ditolak** — hanya boleh digit dan opsional `+` di depan

#### Format yang benar:
```json
{ "phone_numbers": ["6281234567890", "+6281234567890"] }
```

#### Solusi di CRM:
```javascript
// Bersihkan nomor sebelum kirim ke API
const cleanPhone = rawPhone.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
```

---

### 6. CORS Dibatasi (Hanya untuk Browser-Based CRM)

> **Tidak berlaku** jika CRM berjalan server-to-server (Node.js, n8n, PHP backend, curl, dll).

Jika CRM memanggil API langsung dari browser (frontend JavaScript):

#### Yang perlu dilakukan:
Tambahkan origin CRM ke environment variable server:

```env
CORS_ORIGIN=https://crm.example.com,https://admin.example.com
```

Tanpa ini, request dari browser akan diblokir dengan error CORS.

---

## ✅ Tidak Perlu Disesuaikan (Backward Compatible)

Perubahan berikut **tidak berdampak** ke CRM — murni tambahan atau internal:

| Perubahan | Keterangan |
|-----------|------------|
| **Webhook payload diperkaya** | Field baru ditambahkan: `contact_name`, `media_url`, `mime_type`, `file_size`, `file_name`. Field lama tetap ada. CRM bisa mengabaikan field baru. |
| **Header `X-Request-Id`** | Setiap response sekarang memiliki header `X-Request-Id` (UUID). Berguna untuk debugging. Tidak wajib dibaca. |
| **Health check diperkaya** | `GET /health` sekarang mengembalikan info tambahan (`checks.database`, `checks.redis`, `uptime`). Field `status` masih ada. |
| **Media URL berubah ke `/media/`** | `media_url` di webhook payload sekarang menggunakan prefix `/media/` (public, tanpa auth) menggantikan `/uploads/` (butuh JWT). Ini justru mempermudah — CRM bisa langsung download tanpa token. |
| **Validasi Zod lebih deskriptif** | Pesan error validasi sekarang lebih jelas (contoh: `"Phone number must be at least 10 digits"` bukan `"String must contain at least 10 character(s)"`). Format response tetap sama. |
| **Rate limit lebih ketat** | Enforcement lebih akurat (selisih ~1 request). Tidak berdampak untuk penggunaan normal. |
| **Webhook delivery lebih reliable** | Retry dengan backoff + jitter, circuit breaker, dead-letter queue. Webhook lebih jarang gagal. Tidak ada perubahan format. |

---

## 📋 Checklist Migrasi CRM

- [ ] Update parsing error response: `response.error` → `response.error.code` / `response.error.message`
- [ ] Pastikan API key punya permission yang sesuai (atau gunakan `full_access`)
- [ ] Update URL history sync (hilangkan double `/api` prefix) — jika digunakan
- [ ] Implementasi pagination loop jika perlu ambil > 100 item
- [ ] Bersihkan format nomor telepon (hanya angka + opsional `+`)
- [ ] Tambahkan origin ke `CORS_ORIGIN` env var — jika CRM berbasis browser
- [ ] (Opsional) Manfaatkan field baru di webhook: `contact_name`, `media_url`, `mime_type`
- [ ] (Opsional) Gunakan `X-Request-Id` header untuk debugging/tracing

---

## 🆘 Bantuan

Jika ada pertanyaan atau kendala saat migrasi, hubungi tim backend dengan informasi:
- Error code yang didapat (dari `response.error.code`)
- Request ID (dari header `X-Request-Id`)
- Endpoint yang dipanggil
- API key permission yang digunakan

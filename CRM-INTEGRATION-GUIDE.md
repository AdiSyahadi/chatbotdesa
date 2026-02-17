# 📋 Panduan Integrasi CRM dengan WAAPI (WhatsApp SaaS API)

> Dokumen ini menjelaskan cara setup CRM agar bisa mengirim & menerima pesan WhatsApp melalui WAAPI.

---

## Daftar Isi

1. [Arsitektur & Alur Data](#1-arsitektur--alur-data)
2. [Environment & Network Setup](#2-environment--network-setup)
3. [Membuat API Key](#3-membuat-api-key)
4. [Kirim Pesan Teks](#4-kirim-pesan-teks)
5. [Upload & Kirim Media](#5-upload--kirim-media)
6. [Menerima Pesan Masuk (Webhook)](#6-menerima-pesan-masuk-webhook)
7. [Webhook Payload Reference](#7-webhook-payload-reference)
8. [Manajemen Kontak](#8-manajemen-kontak)
9. [Cek Status Instance](#9-cek-status-instance)
10. [Format Nomor Telepon](#10-format-nomor-telepon)
11. [Rate Limiting](#11-rate-limiting)
12. [Error Handling](#12-error-handling)
13. [File Type & Size Limits](#13-file-type--size-limits)
14. [Security Best Practices](#14-security-best-practices)
15. [Troubleshooting](#15-troubleshooting)
16. [Contoh Implementasi Lengkap (Node.js)](#16-contoh-implementasi-lengkap-nodejs)

---

## 1. Arsitektur & Alur Data

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│  CRM-DADI    │ ──API──▶│  WAAPI Backend   │◀──WA──▶ │  WhatsApp    │
│  (port 5000) │         │  (port 3001)     │         │  Server      │
│              │◀─Webhook─│                  │         │              │
└──────────────┘         └──────────────────┘         └──────────────┘
```

**Alur Kirim Pesan:**
1. CRM kirim `POST /api/v1/messages/send-text` ke WAAPI (port 3001)
2. WAAPI kirim ke WhatsApp via Baileys
3. WAAPI trigger webhook `message.sent` ke CRM

**Alur Terima Pesan:**
1. Pesan masuk ke WhatsApp
2. Baileys terima → WAAPI simpan ke DB
3. WAAPI trigger webhook `message.received` ke CRM (port 5000)
4. CRM proses pesan masuk (simpan, tampilkan, auto-reply, dll.)

---

## 2. Environment & Network Setup

### Base URL WAAPI

| Konteks | Base URL |
|---------|----------|
| CRM & WAAPI di **mesin yang sama** (Docker) | `http://host.docker.internal:3001/api/v1` |
| CRM & WAAPI di **mesin yang sama** (non-Docker) | `http://localhost:3001/api/v1` |
| CRM di **server lain** | `http://<IP_WAAPI>:3001/api/v1` |

> **Penting:** Kalau CRM berjalan di dalam Docker container, jangan pakai `localhost`!  
> Gunakan `host.docker.internal` agar bisa akses service di host machine.

### CORS (Sudah Dikonfigurasi)

WAAPI sudah mengizinkan `http://localhost:3002` (CRM frontend) di CORS.  
Kalau CRM frontend di port/domain lain, tambahkan di `.env` WAAPI:

```env
CORS_ORIGIN=http://localhost:3000,http://localhost:3002,http://your-crm-domain.com
```

> **Catatan:** Request dari server (backend-to-backend, curl, Postman) **tidak terkena CORS**.  
> CORS hanya berlaku untuk browser (frontend JavaScript).

---

## 3. Membuat API Key

### Langkah-langkah:

1. **Login ke Dashboard WAAPI** → `http://localhost:3000`
2. **Buka menu API Keys** di sidebar
3. **Klik "Create API Key"**
4. **Isi form:**
   - **Name:** `CRM-DADI Integration`
   - **Permissions:** pilih yang dibutuhkan (lihat tabel di bawah)
   - **Rate Limit:** `1000` (request per menit, default)
5. **Salin API Key** — key hanya ditampilkan **1x saja**, simpan dengan aman!

### Permissions yang Direkomendasikan untuk CRM:

| Permission | Fungsi |
|-----------|--------|
| `message:send` | Kirim pesan teks & media |
| `message:read` | Baca riwayat pesan |
| `contact:read` | Lihat daftar kontak |
| `contact:write` | Buat/update kontak |
| `webhook:read` | Lihat status webhook |
| `webhook:write` | Configure webhook URL |
| `instance:read` | Lihat status WhatsApp instance |

Atau gunakan `full_access` untuk memberikan semua permission sekaligus.

### Cara Pakai API Key:

Tambahkan header di setiap HTTP request:

```
X-API-Key: waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 4. Kirim Pesan Teks

### Endpoint

```
POST http://localhost:3001/api/v1/messages/send-text
```

### Header

```
X-API-Key: waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Body

```json
{
  "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
  "to": "6281234567890",
  "message": "Halo, ini pesan dari CRM!"
}
```

> **`to`** = nomor telepon format internasional **tanpa `+`** (contoh: `6281234567890`)  
> **`instance_id`** = ID WhatsApp instance yang sudah connected (lihat di Dashboard)

### Response (Sukses)

```json
{
  "success": true,
  "data": {
    "message_id": "uuid-xxx",
    "wa_message_id": "3EB0xxxxx",
    "status": "sent"
  }
}
```

### Contoh cURL

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-text \
  -H "X-API-Key: waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
    "to": "6281234567890",
    "message": "Halo dari CRM!"
  }'
```

### Contoh JavaScript (axios)

```javascript
const axios = require('axios');

const WAAPI_BASE = 'http://localhost:3001/api/v1';
const API_KEY = 'waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

async function sendText(instanceId, to, message) {
  const response = await axios.post(`${WAAPI_BASE}/messages/send-text`, {
    instance_id: instanceId,
    to: to,
    message: message
  }, {
    headers: { 'X-API-Key': API_KEY }
  });
  return response.data;
}

// Contoh penggunaan
sendText('162a8a8f-...', '6281234567890', 'Halo!');
```

---

## 5. Upload & Kirim Media

### Langkah 1: Upload File

```
POST http://localhost:3001/api/v1/media/upload
```

**Header:**
```
X-API-Key: waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: multipart/form-data
```

**Form Data:**
| Field | Type | Keterangan |
|-------|------|------------|
| `file` | File | File yang akan diupload |
| `type` | String | `image`, `video`, `audio`, atau `document` (opsional, untuk validasi) |

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "/media/org-uuid/abcdef12-3456-7890.jpg",
    "media_type": "image",
    "mime_type": "image/jpeg",
    "file_size": 524288,
    "original_name": "foto-produk.jpg"
  }
}
```

### Langkah 2: Kirim Media Message

```
POST http://localhost:3001/api/v1/messages/send-media
```

**Body:**
```json
{
  "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
  "to": "6281234567890",
  "media_url": "/media/org-uuid/abcdef12-3456-7890.jpg",
  "media_type": "image",
  "caption": "Ini foto produk terbaru kami"
}
```

> **`media_url`:** Bisa relative path dari upload (rekomendasi), atau URL publik (https://example.com/image.jpg)  
> **`media_type`:** Wajib — `image`, `video`, `audio`, atau `document`

### Kirim Dokumen (PDF, Excel, dll.)

```json
{
  "instance_id": "162a8a8f-...",
  "to": "6281234567890",
  "media_url": "/media/org-uuid/proposal.pdf",
  "media_type": "document",
  "caption": "Proposal kerjasama 2026",
  "filename": "Proposal-Kerjasama.pdf"
}
```

> **`filename`:** Nama file yang akan tampil di WhatsApp penerima (khusus document)

### Contoh JavaScript — Upload + Kirim

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const WAAPI_BASE = 'http://localhost:3001/api/v1';
const API_KEY = 'waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

async function sendMedia(instanceId, to, filePath, mediaType, caption) {
  // Step 1: Upload file
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('type', mediaType);

  const uploadRes = await axios.post(`${WAAPI_BASE}/media/upload`, form, {
    headers: {
      'X-API-Key': API_KEY,
      ...form.getHeaders()
    }
  });

  const mediaUrl = uploadRes.data.data.url;

  // Step 2: Kirim media message
  const sendRes = await axios.post(`${WAAPI_BASE}/messages/send-media`, {
    instance_id: instanceId,
    to: to,
    media_url: mediaUrl,
    media_type: mediaType,
    caption: caption
  }, {
    headers: { 'X-API-Key': API_KEY }
  });

  return sendRes.data;
}

// Contoh: kirim gambar
sendMedia('162a8a8f-...', '6281234567890', './foto.jpg', 'image', 'Produk baru!');

// Contoh: kirim dokumen PDF
sendMedia('162a8a8f-...', '6281234567890', './invoice.pdf', 'document', 'Invoice bulan ini');
```

---

## 6. Menerima Pesan Masuk (Webhook)

### Apa itu Webhook?

Webhook = WAAPI akan **mem-POST data ke URL CRM kamu** setiap kali ada event (pesan masuk, status berubah, dll.)

### Setup Webhook via API

```
PUT http://localhost:3001/api/v1/webhook/config
```

**Header:**
```
X-API-Key: waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Body:**
```json
{
  "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
  "url": "http://host.docker.internal:5000/api/webhook/whatsapp",
  "events": [
    "message.received",
    "message.sent",
    "message.delivered",
    "message.read",
    "connection.connected",
    "connection.disconnected"
  ],
  "secret": "my-webhook-secret-12345"
}
```

> **`url`:** URL endpoint di CRM kamu yang akan menerima webhook POST  
> **`events`:** Event apa saja yang ingin disubscribe  
> **`secret`:** (opsional) Untuk verifikasi signature — WAAPI akan sign payload dengan HMAC-SHA256

### URL Webhook — Penting!

| Situasi | URL yang Harus Dipakai |
|---------|------------------------|
| WAAPI & CRM di Docker **yang sama** | `http://host.docker.internal:5000/api/webhook/whatsapp` |
| CRM di Docker **network yang sama** | `http://crm-backend:5000/api/webhook/whatsapp` |
| CRM di **server lain** | `http://<IP_CRM>:5000/api/webhook/whatsapp` |

> **JANGAN** pakai `http://localhost:5000/...` sebagai webhook URL!  
> Karena dari perspektif container WAAPI, localhost = dirinya sendiri.

### Endpoint Webhook di CRM (yang harus kamu buat)

Kamu harus buat endpoint di CRM backend yang menerima POST request:

```javascript
// Express.js contoh
app.post('/api/webhook/whatsapp', (req, res) => {
  const payload = req.body;
  
  console.log('Event:', payload.event);
  console.log('Instance:', payload.instance_id);
  console.log('Data:', payload.data);
  
  // Proses berdasarkan event type
  switch (payload.event) {
    case 'message.received':
      handleIncomingMessage(payload.data);
      break;
    case 'message.sent':
      updateMessageStatus(payload.data.message_id, 'sent');
      break;
    case 'message.delivered':
      updateMessageStatus(payload.data.message_id, 'delivered');
      break;
    case 'message.read':
      updateMessageStatus(payload.data.message_id, 'read');
      break;
    case 'connection.disconnected':
      alertAdmin('WhatsApp terputus!');
      break;
  }
  
  // PENTING: Response 200 agar WAAPI tidak retry
  res.status(200).json({ received: true });
});
```

### Verifikasi Signature (Opsional tapi Direkomendasikan)

Jika kamu set `secret` saat configure webhook, WAAPI akan kirim header:

```
X-Webhook-Signature: <HMAC-SHA256 hex digest>
```

Cara verifikasi di CRM:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Di middleware
app.post('/api/webhook/whatsapp', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  
  if (signature && !verifyWebhookSignature(req.body, signature, 'my-webhook-secret-12345')) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // ... proses webhook
});
```

---

## 7. Webhook Payload Reference

### Header yang Dikirim WAAPI

```
Content-Type: application/json
User-Agent: WhatsApp-SaaS-Webhook/1.0
X-Webhook-Event: message.received
X-Webhook-Timestamp: 2026-02-16T10:30:00.000Z
X-Webhook-Signature: abc123...  (jika secret dikonfigurasi)
```

### Event Types

| Event | Kapan Trigger |
|-------|--------------|
| `message.received` | Pesan masuk dari kontak |
| `message.sent` | Pesan berhasil terkirim |
| `message.delivered` | Pesan sampai ke HP penerima (centang 2) |
| `message.read` | Pesan dibaca penerima (centang biru) |
| `message.failed` | Pesan gagal terkirim |
| `connection.connected` | WhatsApp berhasil connect |
| `connection.disconnected` | WhatsApp terputus |
| `connection.qr_update` | QR code baru tersedia |
| `contact.created` | Kontak baru dibuat |
| `contact.updated` | Kontak diupdate |
| `broadcast.started` | Broadcast mulai dikirim |
| `broadcast.completed` | Broadcast selesai |
| `broadcast.failed` | Broadcast gagal |

### Payload: `message.received` (Pesan Teks Masuk)

```json
{
  "event": "message.received",
  "timestamp": "2026-02-16T10:30:00.000Z",
  "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
  "organization_id": "org-uuid",
  "data": {
    "message_id": "msg-uuid",
    "wa_message_id": "3EB0xxxxxxxxxxxx",
    "chat_jid": "6281234567890@s.whatsapp.net",
    "sender_jid": "6281234567890@s.whatsapp.net",
    "message_type": "text",
    "content": "Halo, saya mau tanya produk",
    "status": "received",
    "timestamp": "2026-02-16T10:30:00.000Z"
  }
}
```

### Payload: `message.received` (Media — Gambar/Video/Audio/Dokumen)

```json
{
  "event": "message.received",
  "timestamp": "2026-02-16T10:31:00.000Z",
  "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
  "organization_id": "org-uuid",
  "data": {
    "message_id": "msg-uuid",
    "wa_message_id": "3EB0xxxxxxxxxxxx",
    "chat_jid": "6281234567890@s.whatsapp.net",
    "sender_jid": "6281234567890@s.whatsapp.net",
    "message_type": "image",
    "content": "Caption gambar (jika ada)",
    "media_url": "/uploads/org-uuid/a1b2c3d4-image.jpg",
    "mime_type": "image/jpeg",
    "file_size": 524288,
    "file_name": null,
    "status": "received",
    "timestamp": "2026-02-16T10:31:00.000Z"
  }
}
```

**Field media khusus:**

| Field | Tipe | Keterangan |
|-------|------|------------|
| `media_url` | string | Path file yang sudah disimpan WAAPI. Akses: `http://localhost:3001{media_url}` |
| `mime_type` | string | MIME type file (contoh: `image/jpeg`, `application/pdf`) |
| `file_size` | number | Ukuran file dalam bytes |
| `file_name` | string \| null | Nama file asli dari pengirim — **hanya ada untuk `document`**, null untuk image/video/audio |

### Cara Download Media dari Webhook

Media yang masuk otomatis disimpan WAAPI. Untuk download:

```javascript
// media_url dari webhook = "/uploads/org-uuid/a1b2c3d4-image.jpg"
// Akses langsung tanpa auth:
const fullUrl = `http://localhost:3001${payload.data.media_url}`;

// Download file
const response = await axios.get(fullUrl, { responseType: 'arraybuffer' });
const buffer = response.data;
```

> **Media URL** bisa diakses langsung **tanpa API Key** — ini URL publik.  
> Gunakan `mime_type` untuk menentukan bagaimana CRM menampilkan file tersebut.

### Payload: `connection.disconnected`

```json
{
  "event": "connection.disconnected",
  "timestamp": "2026-02-16T11:00:00.000Z",
  "instance_id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
  "organization_id": "org-uuid",
  "data": {
    "status": "disconnected",
    "reason": "Connection closed"
  }
}
```

---

## 8. Manajemen Kontak

### List Kontak

```
GET http://localhost:3001/api/v1/contacts?instance_id=xxx&search=john&page=1&limit=20
```

### Buat Kontak Baru

```
POST http://localhost:3001/api/v1/contacts
```

```json
{
  "instance_id": "162a8a8f-...",
  "phone_number": "6281234567890",
  "name": "John Doe",
  "notes": "Lead dari website",
  "tags": ["lead", "website"]
}
```

### Update Kontak

```
PATCH http://localhost:3001/api/v1/contacts/:id
```

```json
{
  "name": "John Doe (Updated)",
  "tags": ["customer", "premium"],
  "custom_fields": {
    "company": "PT Maju Jaya",
    "position": "Manager"
  }
}
```

---

## 9. Cek Status Instance

Sebelum kirim pesan, pastikan instance WhatsApp connected:

```
GET http://localhost:3001/api/v1/instances
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "162a8a8f-828c-4d39-b559-90aed2fd5176",
      "name": "Test",
      "phone_number": "628xxxxxxxxxx",
      "status": "connected",
      "is_active": true,
      "daily_message_count": 15,
      "daily_limit": 999999,
      "health_score": 95
    }
  ]
}
```

> Pastikan `status` = `"connected"` dan `is_active` = `true` sebelum kirim pesan.

---

## 10. Format Nomor Telepon

| Format | Contoh | Keterangan |
|--------|--------|------------|
| ✅ Internasional (tanpa +) | `6281234567890` | **Gunakan ini!** |
| ❌ Dengan + | `+6281234567890` | Jangan pakai + |
| ❌ Format lokal | `081234567890` | Jangan pakai 0 di depan |
| ❌ Dengan spasi/dash | `0812-3456-7890` | Jangan pakai separator |

### Konversi di CRM

```javascript
function normalizePhone(phone) {
  // Hapus semua non-digit
  let clean = phone.replace(/\D/g, '');
  
  // Kalau mulai dari 0, ganti dengan 62 (Indonesia)
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  }
  
  // Kalau mulai dari 8 (tanpa kode negara), tambah 62
  if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  
  return clean;
}

// Test
normalizePhone('+62 812-3456-7890'); // → "6281234567890"
normalizePhone('081234567890');       // → "6281234567890"
normalizePhone('6281234567890');      // → "6281234567890"
```

---

## 11. Rate Limiting

| Limit | Nilai |
|-------|-------|
| Per API Key | Default 1000 req/menit (configurable saat create key) |
| Range | Minimum 10, Maksimum 10.000 req/menit |

Jika rate limit terlampaui, response:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded"
}
```

**Tips:** Jika CRM mengirim broadcast/bulk message, gunakan fitur Broadcast bawaan WAAPI (endpoint `/broadcasts`) yang sudah menangani delay & anti-ban secara otomatis.

---

## 12. Error Handling

### Response Format Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Error Codes Umum

| HTTP Status | Code | Penyebab |
|------------|------|----------|
| 400 | `VALIDATION_ERROR` | Body request tidak valid (field wajib kosong, format salah) |
| 401 | `UNAUTHORIZED` | API Key tidak valid atau expired |
| 403 | `FORBIDDEN` | API Key tidak punya permission untuk endpoint ini |
| 404 | `NOT_FOUND` | Instance/contact/message tidak ditemukan |
| 413 | `FILE_TOO_LARGE` | File melebihi batas ukuran |
| 429 | `TOO_MANY_REQUESTS` | Rate limit terlampaui |
| 500 | `INTERNAL_ERROR` | Error internal server |

### Best Practice Error Handling di CRM

```javascript
async function sendMessage(instanceId, to, message) {
  try {
    const res = await axios.post(`${WAAPI_BASE}/messages/send-text`, {
      instance_id: instanceId,
      to,
      message
    }, {
      headers: { 'X-API-Key': API_KEY }
    });
    return { success: true, data: res.data };
  } catch (error) {
    const status = error.response?.status;
    const errData = error.response?.data;
    
    switch (status) {
      case 401:
        console.error('API Key invalid! Cek kembali key di settings.');
        break;
      case 429:
        console.warn('Rate limit! Tunggu sebentar sebelum kirim lagi.');
        // Retry setelah 1 menit
        await new Promise(r => setTimeout(r, 60000));
        return sendMessage(instanceId, to, message);
      case 400:
        console.error('Data tidak valid:', errData?.error?.message);
        break;
      default:
        console.error('Error:', status, errData);
    }
    
    return { success: false, error: errData };
  }
}
```

---

## 13. File Type & Size Limits

### Image

| MIME Type | Max Size |
|-----------|---------|
| `image/jpeg` | 16 MB |
| `image/png` | 16 MB |
| `image/gif` | 16 MB |
| `image/webp` | 16 MB |

### Video

| MIME Type | Max Size |
|-----------|---------|
| `video/mp4` | 64 MB |
| `video/mpeg` | 64 MB |
| `video/quicktime` | 64 MB |
| `video/webm` | 64 MB |

### Audio

| MIME Type | Max Size |
|-----------|---------|
| `audio/mpeg` (.mp3) | 16 MB |
| `audio/wav` | 16 MB |
| `audio/ogg` | 16 MB |
| `audio/mp4` (.m4a) | 16 MB |

### Document

| MIME Type | Max Size |
|-----------|---------|
| `application/pdf` | 100 MB |
| `application/msword` (.doc) | 100 MB |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx) | 100 MB |
| `application/vnd.ms-excel` (.xls) | 100 MB |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx) | 100 MB |
| `text/plain` (.txt) | 100 MB |
| `text/csv` (.csv) | 100 MB |

> **Format TIDAK didukung:** ZIP, RAR, HEIC, AVI, FLAC, EXE, dan lainnya yang tidak ada di list di atas.

---

## 14. Security Best Practices

1. **Simpan API Key di environment variable**, jangan hardcode di source code
2. **Gunakan webhook secret** dan verifikasi signature di endpoint CRM
3. **Jangan expose API Key di frontend** — semua request WAAPI harus dari backend CRM
4. **Set permission minimal** — hanya berikan permission yang dibutuhkan CRM
5. **Set expiry date** pada API Key (opsional) — key otomatis nonaktif setelah expired
6. **Rotate API Key** secara berkala menggunakan endpoint regenerate

```bash
# Simpan di .env CRM
WAAPI_BASE_URL=http://host.docker.internal:3001/api/v1
WAAPI_API_KEY=waapi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WAAPI_WEBHOOK_SECRET=my-webhook-secret-12345
WAAPI_INSTANCE_ID=162a8a8f-828c-4d39-b559-90aed2fd5176
```

---

## 15. Troubleshooting

### ❌ "CORS: origin not allowed"

**Penyebab:** Frontend CRM (browser) diblock CORS.  
**Solusi:** Tambahkan origin CRM frontend di `.env` WAAPI:
```env
CORS_ORIGIN=http://localhost:3000,http://localhost:3002
```
Lalu restart backend: `docker compose restart backend`

### ❌ "401 Unauthorized"

**Penyebab:** API Key salah, expired, atau tidak aktif.  
**Solusi:** Cek API Key di Dashboard → API Keys. Regenerate jika perlu.

### ❌ "403 Forbidden" / "Insufficient permissions"

**Penyebab:** API Key tidak punya permission untuk endpoint tersebut.  
**Solusi:** Update permission API Key di Dashboard. Contoh: `message:send` untuk kirim pesan.

### ❌ "Instance not connected"

**Penyebab:** WhatsApp belum scan QR atau terputus.  
**Solusi:**
1. Buka Dashboard → Instances
2. Klik Connect
3. Scan QR Code dengan WhatsApp di HP

### ❌ Webhook tidak diterima CRM

**Penyebab yang mungkin:**
1. URL webhook salah — cek pakai `host.docker.internal` bukan `localhost`
2. CRM endpoint belum return 200 — WAAPI akan retry sampai 5x
3. Event tidak di-subscribe — cek events di webhook config
4. Network issue — cek apakah container bisa saling berkomunikasi

**Debug:**
```bash
# Cek webhook history di WAAPI
curl -H "X-API-Key: waapi_xxx" http://localhost:3001/api/v1/webhook/status
```

### ❌ "FILE_TOO_LARGE" (413)

**Penyebab:** File melebihi batas ukuran.  
**Solusi:** Cek limit di [File Type & Size Limits](#13-file-type--size-limits). Compress file sebelum upload.

### ❌ Media terkirim tapi caption tidak muncul

**Penyebab:** `caption` terkirim untuk `audio` — WhatsApp tidak support caption di audio.  
**Solusi:** Caption hanya support untuk `image`, `video`, dan `document`.

---

## 16. Contoh Implementasi Lengkap (Node.js)

### waapi-client.js — Module Helper

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');

class WaapiClient {
  constructor(config) {
    this.baseUrl = config.baseUrl || 'http://host.docker.internal:3001/api/v1';
    this.apiKey = config.apiKey;
    this.instanceId = config.instanceId;
    this.webhookSecret = config.webhookSecret;
    
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: { 'X-API-Key': this.apiKey },
      timeout: 30000
    });
  }

  // ─── PESAN ───

  async sendText(to, message) {
    const { data } = await this.http.post('/messages/send-text', {
      instance_id: this.instanceId,
      to,
      message
    });
    return data;
  }

  async sendImage(to, filePath, caption = '') {
    const mediaUrl = await this._uploadFile(filePath, 'image');
    return this._sendMedia(to, mediaUrl, 'image', caption);
  }

  async sendDocument(to, filePath, caption = '', filename = '') {
    const mediaUrl = await this._uploadFile(filePath, 'document');
    return this._sendMedia(to, mediaUrl, 'document', caption, filename);
  }

  async sendVideo(to, filePath, caption = '') {
    const mediaUrl = await this._uploadFile(filePath, 'video');
    return this._sendMedia(to, mediaUrl, 'video', caption);
  }

  async sendAudio(to, filePath) {
    const mediaUrl = await this._uploadFile(filePath, 'audio');
    return this._sendMedia(to, mediaUrl, 'audio');
  }

  async sendLocation(to, latitude, longitude, name = '', address = '') {
    const { data } = await this.http.post('/messages/send-location', {
      instance_id: this.instanceId,
      to, latitude, longitude, name, address
    });
    return data;
  }

  // ─── KONTAK ───

  async getContacts(search = '', page = 1, limit = 20) {
    const { data } = await this.http.get('/contacts', {
      params: { instance_id: this.instanceId, search, page, limit }
    });
    return data;
  }

  async createContact(phoneNumber, name, tags = []) {
    const { data } = await this.http.post('/contacts', {
      instance_id: this.instanceId,
      phone_number: phoneNumber,
      name,
      tags
    });
    return data;
  }

  // ─── STATUS ───

  async getInstances() {
    const { data } = await this.http.get('/instances');
    return data;
  }

  async isConnected() {
    const res = await this.getInstances();
    const instance = res.data?.find(i => i.id === this.instanceId);
    return instance?.status === 'connected' && instance?.is_active;
  }

  // ─── WEBHOOK ───

  async configureWebhook(url, events, secret = '') {
    const { data } = await this.http.put('/webhook/config', {
      instance_id: this.instanceId,
      url,
      events,
      secret: secret || undefined
    });
    return data;
  }

  verifyWebhookSignature(payload, signature) {
    if (!this.webhookSecret) return true; // Skip if no secret
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature || '', 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch {
      return false;
    }
  }

  // ─── INTERNAL ───

  async _uploadFile(filePath, type) {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('type', type);

    const { data } = await this.http.post('/media/upload', form, {
      headers: form.getHeaders()
    });
    return data.data.url;
  }

  async _sendMedia(to, mediaUrl, mediaType, caption = '', filename = '') {
    const body = {
      instance_id: this.instanceId,
      to,
      media_url: mediaUrl,
      media_type: mediaType
    };
    if (caption) body.caption = caption;
    if (filename) body.filename = filename;

    const { data } = await this.http.post('/messages/send-media', body);
    return data;
  }
}

module.exports = WaapiClient;
```

### Contoh Penggunaan di CRM

```javascript
const WaapiClient = require('./waapi-client');

const waapi = new WaapiClient({
  baseUrl: process.env.WAAPI_BASE_URL,
  apiKey: process.env.WAAPI_API_KEY,
  instanceId: process.env.WAAPI_INSTANCE_ID,
  webhookSecret: process.env.WAAPI_WEBHOOK_SECRET
});

// Kirim teks
await waapi.sendText('6281234567890', 'Halo, terima kasih sudah menghubungi kami!');

// Kirim gambar
await waapi.sendImage('6281234567890', './promo.jpg', 'Promo spesial bulan ini!');

// Kirim PDF
await waapi.sendDocument('6281234567890', './invoice.pdf', 'Invoice #INV-001', 'Invoice-Februari.pdf');

// Cek status
const connected = await waapi.isConnected();
console.log('WhatsApp connected:', connected);
```

### Webhook Handler di CRM (Express.js)

```javascript
const express = require('express');
const WaapiClient = require('./waapi-client');

const app = express();
app.use(express.json());

const waapi = new WaapiClient({
  baseUrl: process.env.WAAPI_BASE_URL,
  apiKey: process.env.WAAPI_API_KEY,
  instanceId: process.env.WAAPI_INSTANCE_ID,
  webhookSecret: process.env.WAAPI_WEBHOOK_SECRET
});

app.post('/api/webhook/whatsapp', async (req, res) => {
  // 1. Verifikasi signature
  const signature = req.headers['x-webhook-signature'];
  if (!waapi.verifyWebhookSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, instance_id, data } = req.body;

  // 2. Handle berdasarkan event
  switch (event) {
    case 'message.received':
      console.log(`Pesan masuk dari ${data.sender_jid}: ${data.content}`);
      
      // Simpan ke database CRM
      await db.messages.create({
        phone: data.sender_jid.replace('@s.whatsapp.net', ''),
        content: data.content,
        type: data.message_type,
        media_url: data.media_url || null,
        mime_type: data.mime_type || null,
        file_size: data.file_size || null,
        file_name: data.file_name || null,
        wa_message_id: data.wa_message_id,
        direction: 'incoming',
        received_at: new Date(data.timestamp)
      });
      
      // Auto-reply contoh
      if (data.content?.toLowerCase().includes('harga')) {
        await waapi.sendText(
          data.sender_jid.replace('@s.whatsapp.net', ''),
          'Terima kasih! Berikut daftar harga kami:\n1. Paket A: Rp 100.000\n2. Paket B: Rp 200.000'
        );
      }
      break;
      
    case 'message.delivered':
      await db.messages.update(
        { wa_message_id: data.wa_message_id },
        { status: 'delivered' }
      );
      break;
      
    case 'message.read':
      await db.messages.update(
        { wa_message_id: data.wa_message_id },
        { status: 'read' }
      );
      break;
      
    case 'connection.disconnected':
      // Kirim alert ke admin CRM
      console.warn('⚠️ WhatsApp disconnected:', data.reason);
      break;
  }

  // 3. Response 200 (WAJIB — kalau tidak, WAAPI akan retry sampai 5x)
  res.status(200).json({ received: true });
});

app.listen(5000, () => {
  console.log('CRM webhook listener running on port 5000');
});
```

---

## Quick Start Checklist

- [ ] 1. Login ke Dashboard WAAPI (`http://localhost:3000`)
- [ ] 2. Pastikan WhatsApp instance **connected** (scan QR jika belum)
- [ ] 3. Buat API Key dengan permission yang dibutuhkan
- [ ] 4. Simpan API Key di `.env` CRM
- [ ] 5. Set Base URL WAAPI di CRM: `http://host.docker.internal:3001/api/v1`
- [ ] 6. Buat endpoint webhook di CRM backend (contoh: `POST /api/webhook/whatsapp`)
- [ ] 7. Configure webhook URL via API: `PUT /api/v1/webhook/config`
- [ ] 8. Test kirim pesan: `POST /api/v1/messages/send-text`
- [ ] 9. Test terima pesan: kirim WA ke nomor instance, cek webhook masuk ke CRM
- [ ] 10. Implementasi handler untuk semua event yang disubscribe

---

*Dokumentasi ini dibuat untuk integrasi CRM-DADI dengan WAAPI. Terakhir diupdate: 16 Februari 2026.*

# Jawaban untuk Pengguna Baru API WhatsApp Baileys

Dokumen ini menjawab pertanyaan integrasi CRM terhadap API yang aktif saat ini.

## Ringkasan Cepat
- Base external API: `/api/v1`
- Auth external API: `X-API-Key`
- Untuk pairing QR pertama: gunakan dashboard/web internal (JWT), lalu setelah connected operasional harian bisa via external API key
- Format response standar:
  - Sukses: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`

---

## 1) Endpoint & Authentication

### Base URL
- Local: `http://localhost:3001/api/v1`
- Production: `https://api.domain-anda.com/api/v1` (disarankan HTTPS)

### Metode autentikasi
- External integration: API Key di header:
  - `X-API-Key: wa_xxxxx`
- Internal/dashboard API masih menggunakan Bearer JWT, tetapi untuk integrasi CRM disarankan pakai API key.

### Rate limiting
- Ada rate limiting per API key (Redis-backed, enforced real).
- Nilai limit mengikuti `rate_limit` milik API key (default umumnya 1000 request/menit bila tidak di-set).
- Header rate limit dikirim di response (`X-RateLimit-*`).

### HTTP/HTTPS
- Development bisa HTTP.
- Production wajib HTTPS.

---

## 2) Koneksi & Session Management

### Pairing WhatsApp pertama kali
- Metode: QR Code (bukan pairing code via external API).
- Alur umum:
  1. Buat instance
  2. Trigger connect
  3. Ambil QR
  4. Scan dari WhatsApp di HP

### Endpoint cek status koneksi
- `GET /api/v1/instances/:instanceId/status`

### Penyimpanan session
- Session disimpan di storage server (`storage/sessions`) dan metadata di database.
- Selama tidak logout/invalid session dari sisi WhatsApp, tidak perlu scan ulang.

### Masa berlaku session
- Tidak ada TTL tetap yang dijamin.
- Session bisa invalid jika logout dari device, kebijakan WhatsApp berubah, atau session rusak.

### Reconnection saat terputus
- Ada auto reconnect dengan backoff di service.
- Jika session invalid/corrupt, perlu re-pair (scan QR ulang).
- Untuk reset total instance: `POST /api/v1/instances/:instanceId/reset`.

---

## 3) Mengirim Pesan

### Endpoint kirim text
- `POST /api/v1/messages/send-text`

### Request body
```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628123456789",
  "message": "Hello from CRM"
}
```

Catatan:
- Field `text` juga diterima sebagai alias `message`.
- Nomor yang belum tersimpan tetap bisa dikirim selama nomor WhatsApp valid.

### Kirim ke group
- Bisa, gunakan JID group di field `to` (contoh: `120363xxxx@g.us`).

### Delay/queue anti-ban
- Ada proteksi limit harian + warming phase per instance.
- Untuk broadcast tersedia delay acak per recipient.

---

## 4) Mengirim Media

### Endpoint kirim media
- `POST /api/v1/messages/send-media`

### Endpoint upload media (opsional, agar dapat URL publik)
- `POST /api/v1/media/upload` (multipart/form-data)

### Request kirim media
```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628123456789",
  "media_url": "https://example.com/file.jpg",
  "media_type": "image",
  "caption": "Optional caption"
}
```

### Jenis media
- `image`, `video`, `audio`, `document`

### Batas ukuran (praktik saat ini)
- Image: sampai 16 MB
- Video: sampai 64 MB
- Audio: sampai 16 MB
- Document: sampai 100 MB

### Caption
- Didukung untuk image/video/document.

---

## 5) Menerima Pesan (Webhook)

### Support webhook
- Ya, didukung.

### Endpoint konfigurasi webhook (external API)
- `GET /api/v1/webhook/config`
- `PUT /api/v1/webhook/config`
- `DELETE /api/v1/webhook/config/:instanceId`

### Contoh set webhook
```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://crm-anda.com/webhook/whatsapp",
  "events": ["message.received", "message.sent", "message.delivered", "message.read"],
  "secret": "webhook_secret_opsional"
}
```

### Event yang dikirim
- `message.received`
- `message.sent`
- `message.delivered`
- `message.read`
- `message.failed`
- `connection.connected`
- `connection.disconnected`
- `connection.qr_update`

### Signature verifikasi
- Jika `secret` di-set, webhook mengirim header:
  - `X-Webhook-Signature` (HMAC SHA-256 body raw)
  - `X-Webhook-Event`
  - `X-Webhook-Timestamp`

### Contoh payload webhook
```json
{
  "event": "message.received",
  "timestamp": "2026-03-27T19:45:00Z",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "d75672c2-1524-4be4-9406-216a62cb496d",
  "data": {
    "id": "3EB0F2F7D8B4A1F2E5C3",
    "from": "628123456789@s.whatsapp.net",
    "chat_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "direction": "INCOMING",
    "type": "text",
    "content": "Hello"
  }
}
```

---

## 6) Status Pesan

### Callback status pesan
- Ya, melalui webhook event:
  - `message.sent`, `message.delivered`, `message.read`, `message.failed`

### Endpoint cek status berdasarkan message ID
- Saat ini belum ada endpoint khusus `GET /messages/:id` di external API.
- Opsi saat ini:
  - Gunakan webhook status callback sebagai source utama
  - Query riwayat via `GET /api/v1/messages` lalu filter dari sisi CRM

---

## 7) Kontak & Group Management

### Kontak
- `GET /api/v1/contacts`
- `GET /api/v1/contacts/:id`
- `POST /api/v1/contacts`
- `PATCH /api/v1/contacts/:id`
- `DELETE /api/v1/contacts/:id`

### Group
- Belum ada endpoint dedicated untuk list/create/manage group via external API.
- Pengiriman ke group tetap bisa jika sudah punya JID group (`...@g.us`).

---

## 8) Template & Broadcast

### Template message
- Fitur template tersedia di API internal (JWT) (`/api/templates`), belum diekspos di external API key `/api/v1`.

### Broadcast
- Fitur broadcast tersedia di API internal (JWT) (`/api/broadcasts`).
- Untuk external API key, pendekatan saat ini biasanya loop kirim + delay dari sisi CRM, atau gunakan endpoint internal bila memakai JWT.

### Batasan jumlah penerima broadcast
- Mengikuti limit plan, health/warming, dan kebijakan anti-ban.

---

## 9) Error Handling

### Format error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Contoh error yang umum
- `AUTH_REQUIRED`, `INVALID_API_KEY`
- `INSUFFICIENT_PERMISSION`
- `RATE_LIMIT_EXCEEDED`
- `INSTANCE_NOT_FOUND`
- `INSTANCE_NOT_CONNECTED`
- `VALIDATION`

### Nomor tidak terdaftar WhatsApp
- Umumnya akan gagal kirim dan muncul status `message.failed` + detail error.
- Tangani sebagai failed delivery di CRM, jangan auto retry agresif.

### Akun terblokir/banned
- Instance akan cenderung masuk status error/disconnected.
- Mitigasi: warming bertahap, delay acak, hindari blast masif, kualitas nomor pengirim.

---

## 10) Logging & Monitoring

### Simpan history pesan
- Ya, pesan masuk/keluar disimpan di database.

### Endpoint history pesan
- `GET /api/v1/messages`
- Untuk thread per chat: `GET /api/v1/conversations`

### Monitoring
- Health external API: `GET /api/v1/health`
- Webhook delivery summary: `GET /api/v1/webhook/status`
- Swagger/internal docs untuk eksplorasi endpoint juga tersedia di server.

---

## 11) Multi-Device & Multi-Instance

### Support multiple WhatsApp account
- Ya, multi-instance per organisasi didukung.

### Manage multiple instances
- `GET /api/v1/instances`
- `GET /api/v1/instances/:instanceId/status`
- `POST /api/v1/instances/:instanceId/reset`

### API key per instance?
- Tidak wajib.
- 1 API key scope organisasi bisa mengakses banyak instance (sesuai permission).

---

## 12) Keamanan & Compliance

### Enkripsi data pesan
- In transit: aman jika memakai HTTPS.
- At rest: tidak ada klaim enkripsi end-to-end custom di level aplikasi untuk isi pesan yang tersimpan di DB.

### Policy penyimpanan data
- Data pesan, kontak, webhook log tersimpan untuk kebutuhan operasional/audit.
- Retensi detail sebaiknya ditetapkan di level kebijakan deployment (ops/admin).

### Backup otomatis
- Tersedia mekanisme backup session internal, tetapi belum ada endpoint external publik khusus backup/restore data penuh.
- Rekomendasi: jalankan backup DB + storage rutin dari sisi infrastruktur.

---

## Contoh Header Standar Request

```http
X-API-Key: wa_your_api_key_here
Content-Type: application/json
```

---

## Rekomendasi Integrasi Laravel CRM

1. Gunakan webhook sebagai source of truth status delivery.
2. Simpan mapping `wa_message_id` dan `instance_id` di tabel messages CRM.
3. Terapkan retry dengan exponential backoff untuk error 429/5xx.
4. Untuk campaign massal, gunakan delay acak + batching.
5. Pisahkan flow internal JWT (admin/ops) dan external API key (integrasi sistem).

---

Jika diinginkan, saya bisa lanjutkan dengan versi "siap kirim ke klien" yang lebih ringkas (1-2 halaman) dan versi teknis lengkap (dengan contoh cURL/Postman collection).
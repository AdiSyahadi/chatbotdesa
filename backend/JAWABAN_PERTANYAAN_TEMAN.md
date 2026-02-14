# Jawaban Pertanyaan Teman — WA API Integration Guide

---

## Pertanyaan 1: Instance statusnya ERROR, bagaimana cara reconnect?

### Penyebab
Instance kena `badSession` disconnect — artinya session WhatsApp-nya corrupt (bukan banned/logout). Session sudah otomatis dihapus oleh sistem.

### Cara Fix
**Ya, perlu scan QR ulang.** Caranya:

**Opsi A — Via Dashboard UI:**
1. Buka http://localhost:3000
2. Login
3. Ke Dashboard → WhatsApp → Instance "Test"
4. Klik **Connect** → Scan QR code dari HP WhatsApp

**Opsi B — Via API:**
```bash
# 1. Login dulu untuk dapat JWT token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "EMAIL_KAMU", "password": "PASSWORD_KAMU"}'

# Response: { "accessToken": "eyJ...", "refreshToken": "..." }

# 2. Trigger connect (generate QR)
curl -X POST http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38/connect \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# 3. Ambil QR code (polling setiap 5 detik sampai dapat)
curl http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38/qr \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Response: { "qr_code": "data:image/png;base64,..." }
# Render base64 ini sebagai image, scan dari HP
```

### Catatan
- WhatsApp-nya **TIDAK banned** — hanya session corrupt
- Setelah scan QR, status otomatis berubah ke `CONNECTED`
- Sistem sudah diperbaiki: kalau badSession terjadi lagi, akan auto-reconnect (bukan stuck di ERROR)

---

## Pertanyaan 2: Bagaimana cara set webhook URL?

### Endpoint
```
PATCH /api/whatsapp/instances/:id
```

### Auth
Butuh salah satu:
- **JWT Bearer**: `Authorization: Bearer <jwt_token>` (dari login)
- **API Key**: `X-API-Key: wa_<64 hex chars>` (dibuat via POST /api/api-keys)

### Contoh Request
```bash
curl -X PATCH http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38 \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "http://localhost:5000/api/webhook/wa",
    "webhook_events": ["message.received", "message.sent"],
    "webhook_secret": "my_secret_key_min16chars"
  }'
```

### Field yang diterima

| Field | Type | Keterangan |
|---|---|---|
| `webhook_url` | `string` | URL tujuan webhook (bisa localhost) |
| `webhook_events` | `string[]` | Event yang mau disubscribe (lihat daftar di bawah) |
| `webhook_secret` | `string` (min 16 chars) | Untuk HMAC signature verification (opsional tapi recommended) |
| `name` | `string` | Nama instance |
| `is_active` | `boolean` | Aktif/nonaktif |

### Format webhook_events (2 cara)

**Cara 1 — Array of strings (recommended):**
```json
{
  "webhook_events": ["message.received", "message.sent", "connection.connected"]
}
```

**Cara 2 — Object boolean (frontend-style):**
```json
{
  "webhook_events": {
    "message_received": true,
    "message_sent": true,
    "connection_update": true
  }
}
```
Sistem otomatis convert ke format dot-notation.

---

## Pertanyaan 3: Event webhook & contoh payload

### Daftar semua event webhook yang tersedia

| Event | Kapan dikirim |
|---|---|
| `message.received` | Ada pesan masuk (incoming) |
| `message.sent` | Pesan terkirim (outgoing) |
| `message.delivered` | Pesan sudah delivered (centang 2) |
| `message.read` | Pesan sudah dibaca (centang biru) |
| `message.failed` | Pengiriman pesan gagal |
| `connection.connected` | Instance berhasil connect ke WA |
| `connection.disconnected` | Instance disconnect |
| `connection.qr_update` | QR code baru tersedia |
| `contact.created` | Kontak baru tersimpan |
| `contact.updated` | Kontak diupdate |
| `broadcast.started` | Broadcast mulai jalan |
| `broadcast.completed` | Broadcast selesai |
| `broadcast.failed` | Broadcast gagal |

### Contoh payload webhook saat pesan masuk (`message.received`)

```json
{
  "event": "message.received",
  "timestamp": "2026-02-14T10:30:00.000Z",
  "instance_id": "4f408b61-1cca-4db9-a124-3f6ea459de38",
  "organization_id": "org-uuid-disini",
  "data": {
    "id": "3EB0A0B2F5C4E1A2B3C4",
    "from": "6281234567890@s.whatsapp.net",
    "chat_jid": "6281234567890@s.whatsapp.net",
    "sender_jid": "6281234567890@s.whatsapp.net",
    "phone_number": "6281234567890",
    "direction": "INCOMING",
    "type": "text",
    "content": "Halo, ini pesan baru",
    "timestamp": 1707900600
  }
}
```

### Contoh payload pesan terkirim (`message.sent`)

```json
{
  "event": "message.sent",
  "timestamp": "2026-02-14T10:31:00.000Z",
  "instance_id": "4f408b61-1cca-4db9-a124-3f6ea459de38",
  "organization_id": "org-uuid-disini",
  "data": {
    "id": "3EB0A0B2F5C4E1A2B3C5",
    "from": "6282119499306@s.whatsapp.net",
    "chat_jid": "6281234567890@s.whatsapp.net",
    "sender_jid": "6282119499306@s.whatsapp.net",
    "phone_number": "6282119499306",
    "direction": "OUTGOING",
    "type": "text",
    "content": "Ini balasan dari kamu",
    "timestamp": 1707900660
  }
}
```

### HTTP Headers yang dikirim ke webhook URL

```
POST /api/webhook/wa HTTP/1.1
Content-Type: application/json
User-Agent: WhatsApp-SaaS-Webhook/1.0
X-Webhook-Event: message.received
X-Webhook-Timestamp: 2026-02-14T10:30:00.000Z
X-Webhook-Signature: sha256=<HMAC-SHA256 dari body pakai webhook_secret>
```

### Cara verifikasi signature di CRM kamu (opsional tapi recommended)

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(body, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Di Express route handler:
app.post('/api/webhook/wa', (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  if (sig && !verifyWebhookSignature(req.body, sig, 'my_secret_key_min16chars')) {
    return res.status(401).send('Invalid signature');
  }
  
  const { event, data } = req.body;
  if (event === 'message.received') {
    console.log('Pesan masuk dari:', data.phone_number);
    console.log('Isi:', data.content);
    // Proses ke CRM...
  }
  
  res.status(200).send('OK');
});
```

---

## Pertanyaan 4: Apakah bisa localhost-to-localhost?

### Jawaban: **YA, BISA!**

CRM backend di `localhost:5000` dan WA API di `localhost:3001` — **tidak perlu ngrok atau URL publik.**

Webhook delivery dilakukan via HTTP POST dari backend WA API (Node.js) ke URL yang di-set. Kalau keduanya jalan di mesin yang sama, `http://localhost:5000/api/webhook/wa` akan bekerja dengan baik.

### Yang perlu dipastikan:
1. CRM backend di port 5000 **sudah jalan** sebelum WA API kirim webhook
2. Endpoint `/api/webhook/wa` di CRM **menerima POST** dan **return 200**
3. Kalau CRM return non-2xx, WA API akan **retry otomatis** (via BullMQ worker)

### Kapan butuh ngrok?
Hanya kalau CRM dan WA API jalan di **mesin yang berbeda** (misal WA API di VPS, CRM di laptop lokal).

---

## Quick Setup — Langkah Lengkap

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"EMAIL","password":"PASS"}' | jq -r '.accessToken')

# 2. Connect instance (scan QR)
curl -X POST http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38/connect \
  -H "Authorization: Bearer $TOKEN"

# 3. Ambil QR, scan dari HP
curl -s http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38/qr \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.qr_code'

# 4. Setelah connected, set webhook
curl -X PATCH http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "http://localhost:5000/api/webhook/wa",
    "webhook_events": ["message.received", "message.sent"],
    "webhook_secret": "crm_webhook_secret_key_2026"
  }'

# 5. Cek status instance
curl -s http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38 \
  -H "Authorization: Bearer $TOKEN" | jq '.data.status, .data.webhook_url'

# Selesai! Sekarang setiap pesan masuk/keluar akan di-POST ke CRM kamu
```

---

## Alternatif: Pakai API Key (tanpa login berulang)

Kalau mau bikin API key supaya tidak perlu login terus:

```bash
# Buat API key (sekali saja, simpan hasilnya!)
curl -X POST http://localhost:3001/api/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CRM Integration",
    "permissions": ["instance:read", "instance:write", "message:send", "message:read"]
  }'

# Response: { "key": "wa_a1b2c3d4..." }  ← SIMPAN INI, hanya muncul sekali!

# Setelah itu, semua request pakai header X-API-Key:
curl http://localhost:3001/api/whatsapp/instances/4f408b61-1cca-4db9-a124-3f6ea459de38 \
  -H "X-API-Key: wa_a1b2c3d4..."
```
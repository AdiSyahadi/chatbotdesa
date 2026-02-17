# Jawaban: LID → Phone Number Resolution & API Endpoints

## Pertanyaan yang Diajukan

> Apakah endpoint `/conversations` dari WA API mengembalikan `phone_number` yang benar untuk setiap conversation?
> WA API mengembalikan `phone_number: null` untuk kontak @lid.
> Apakah ada endpoint lain yang bisa resolve LID → real phone number?
> Butuh dokumentasi endpoint messaging (send-text, send-media), parameter, response format, error handling.

---

## 1. Endpoint `/conversations` — Sudah Auto-Resolve LID

Endpoint `GET /api/v1/conversations` **sudah otomatis mencoba resolve LID → phone number** dari tabel `lid_phone_mappings` internal.

### Response per Conversation:

```json
{
  "chat_jid": "37224598995033@lid",
  "phone_number": "628123456789",
  "is_lid": true,
  "lid_resolved": true,
  "contact_name": "John Doe",
  "instance_id": "uuid",
  "total_messages": 25,
  "unread_count": 3,
  "last_message": {
    "id": "uuid",
    "content": "Halo",
    "message_type": "TEXT",
    "direction": "INCOMING",
    "status": "DELIVERED",
    "created_at": "2026-02-16T12:00:00.000Z"
  },
  "last_message_at": "2026-02-16T12:00:00.000Z"
}
```

### Field Penting:

| Field | Tipe | Keterangan |
|-------|------|------------|
| `chat_jid` | string | JID asli (bisa `@s.whatsapp.net` atau `@lid`) |
| `phone_number` | string | Phone number hasil resolve. **Kosong `""` jika LID belum ter-resolve** |
| `is_lid` | boolean | `true` jika conversation ini menggunakan @lid JID |
| `lid_resolved` | boolean | `true` jika LID berhasil di-resolve ke phone number |

### Kenapa `phone_number` Bisa `null` / `""`?

Karena **WhatsApp belum share phone number** untuk LID tersebut. Ini **limitasi WhatsApp**, bukan bug API. WhatsApp hanya share phone untuk kontak yang:

- Pernah chat langsung
- Ada di contact list
- Tidak menggunakan privacy setting ketat

**Tidak ada cara force-resolve LID → Phone.** Harus menunggu WhatsApp mengirim event `chats.phoneNumberShare` atau data muncul di `contacts.upsert`.

---

## 2. Endpoint Khusus untuk Resolve LID → Phone Number

### a) List Semua LID Mappings

```http
GET /api/v1/lid-mappings
GET /api/v1/lid-mappings?instance_id=uuid-instance
```

**Header:**
```
X-API-Key: wa_xxxxxxxxxxxx
```

**Permission:** `contact:read`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "lid_jid": "37224598995033@lid",
      "phone_jid": "628123456789@s.whatsapp.net",
      "phone_number": "628123456789",
      "instance_id": "uuid",
      "source": "chats.phoneNumberShare",
      "created_at": "2026-02-16T10:30:00.000Z",
      "updated_at": "2026-02-16T10:30:00.000Z"
    }
  ],
  "meta": { "total": 15 }
}
```

### b) Resolve Single LID

```http
GET /api/v1/lid-mappings/resolve/37224598995033@lid
GET /api/v1/lid-mappings/resolve/37224598995033@lid?instance_id=uuid
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "lid_jid": "37224598995033@lid",
    "phone_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "instance_id": "uuid",
    "source": "contacts.upsert",
    "resolved_at": "2026-02-16T10:30:00.000Z"
  }
}
```

**Response (404 Not Found — belum ada mapping):**
```json
{
  "success": false,
  "error": "LID mapping not found. This LID has not been resolved to a phone number yet."
}
```

---

## 3. Bagaimana LID Mapping Terbentuk (Otomatis)

WAAPI menyimpan LID→Phone di tabel `lid_phone_mappings`. Data ini dikumpulkan otomatis dari 3 sumber:

| Source | Event Baileys | Kapan Terjadi |
|--------|---------------|---------------|
| `chats.phoneNumberShare` | WhatsApp aktif share phone dari LID | Saat chat terjadi (Baileys v6.6+) |
| `contacts.upsert` | Contact memiliki field `lid` + `jid` bersamaan | Saat sync contacts |
| `history-sync` | Contact data dari history sync mengandung cross-reference | Saat instance pertama kali connect |

### Backfill Otomatis

Saat LID mapping baru ditemukan, WAAPI juga **otomatis update** semua record Contact yang sebelumnya hanya punya LID JID tanpa phone number.

---

## 4. Webhook Event: Real-time LID Resolution

WAAPI mengirim webhook event `lid.mapping.resolved` setiap kali LID baru ter-resolve:

```json
{
  "event": "lid.mapping.resolved",
  "data": {
    "instanceId": "uuid",
    "lid_jid": "37224598995033@lid",
    "phone_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "contacts_updated": 1
  }
}
```

**Rekomendasi untuk CRM:** Subscribe ke webhook ini dan update contact records di CRM saat event ini diterima. Jadi CRM selalu punya data phone number terbaru.

---

## 5. Endpoint Messaging — Send Text

```http
POST /api/v1/messages/send-text
```

**Header:**
```
X-API-Key: wa_xxxxxxxxxxxx
Content-Type: application/json
```

**Body:**
```json
{
  "instance_id": "uuid-instance",
  "to": "628123456789",
  "message": "Hello World!"
}
```

| Field | Tipe | Required | Keterangan |
|-------|------|----------|------------|
| `instance_id` | string (UUID) | Ya | ID WhatsApp instance |
| `to` | string | Ya | Phone number (format: `628xxx`, tanpa `+`) |
| `message` | string | Ya* | Isi pesan text (max 4096 chars) |
| `text` | string | Ya* | Alias untuk `message` (backwards compatibility) |

*Salah satu `message` atau `text` wajib diisi.

**PENTING: Tidak ada parameter `chat_jid`.** Gunakan `to` dengan phone number biasa. API otomatis convert ke JID internal (`628xxx@s.whatsapp.net`).

### Response (200 OK):

```json
{
  "success": true,
  "data": {
    "message_id": "3EB0F2F7D8B4A1F2E5C3",
    "to": "628123456789",
    "status": "sent",
    "timestamp": "2026-02-16T12:34:56.789Z"
  }
}
```

| Field | Tipe | Keterangan |
|-------|------|------------|
| `message_id` | string | WhatsApp message ID untuk tracking delivery status |

### Phone Number Auto-Normalization:

| Input | Dinormalisasi Ke | JID Internal |
|-------|-----------------|--------------|
| `628123456789` | `628123456789` | `628123456789@s.whatsapp.net` |
| `+628123456789` | `628123456789` | `628123456789@s.whatsapp.net` |
| `0812-3456-789` | `628123456789` | `628123456789@s.whatsapp.net` |
| `08123456789` | `628123456789` | `628123456789@s.whatsapp.net` |

---

## 6. Endpoint Messaging — Send Media

```http
POST /api/v1/messages/send-media
```

**Body:**
```json
{
  "instance_id": "uuid-instance",
  "to": "628123456789",
  "media_url": "https://example.com/image.jpg",
  "media_type": "image",
  "caption": "Caption text",
  "filename": "document.pdf"
}
```

| Field | Tipe | Required | Keterangan |
|-------|------|----------|------------|
| `instance_id` | string (UUID) | Ya | ID WhatsApp instance |
| `to` | string | Ya | Phone number |
| `media_url` | string (URL) | Ya | URL publik file media (HTTPS recommended) |
| `media_type` | enum | Ya | `image`, `video`, `audio`, atau `document` |
| `caption` | string | Tidak | Caption (untuk image/video/document, max 1024 chars) |
| `filename` | string | Tidak | Nama file (untuk document) |

### Media Type Support:

| Type | Format | Max Size | Caption |
|------|--------|----------|---------|
| `image` | JPG, PNG, WEBP | 16 MB | Ya |
| `video` | MP4, MPEG, MOV | 64 MB | Ya |
| `audio` | MP3, WAV, OGG, M4A | 16 MB | Tidak |
| `document` | PDF, DOC, XLS, TXT, ZIP | 100 MB | Ya |

### Response (200 OK):

```json
{
  "success": true,
  "data": {
    "message_id": "3EB0F2F7D8B4A1F2E5C3",
    "to": "628123456789",
    "media_type": "image",
    "status": "sent",
    "timestamp": "2026-02-16T12:34:56.789Z"
  }
}
```

### SSRF Protection:

Media URL divalidasi sebelum di-fetch. URL yang diblokir:
- `file://`, `ftp://` — hanya `http://` dan `https://` yang diizinkan
- IP internal: `127.0.0.1`, `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`
- `localhost`

---

## 7. Endpoint Messaging — Send Location

```http
POST /api/v1/messages/send-location
```

**Body:**
```json
{
  "instance_id": "uuid-instance",
  "to": "628123456789",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "name": "Jakarta",
  "address": "Jakarta, Indonesia"
}
```

| Field | Tipe | Required | Keterangan |
|-------|------|----------|------------|
| `latitude` | number | Ya | -90 sampai 90 |
| `longitude` | number | Ya | -180 sampai 180 |
| `name` | string | Tidak | Nama lokasi |
| `address` | string | Tidak | Alamat lengkap |

---

## 8. Error Handling

### Format Error Response:

```json
{
  "success": false,
  "error": "Error message string"
}
```

### Common Errors:

| Error Message | HTTP Status | Penyebab | Solusi |
|---------------|-------------|----------|--------|
| `Unauthorized` | 401 | API Key tidak valid / missing | Cek header `X-API-Key` |
| `Forbidden - insufficient permissions` | 403 | API Key tidak punya permission yang dibutuhkan | Tambah permission di dashboard |
| `Instance not connected` | 400 | WhatsApp instance offline | Scan QR code ulang di dashboard |
| `Daily message limit reached (50/50)` | 429 | Limit harian tercapai | Tunggu reset midnight atau upgrade warming phase |
| `Invalid media URL: SSRF protection triggered` | 400 | URL media diblokir (internal IP) | Gunakan URL publik HTTPS |
| `Either "message" or "text" field is required` | 400 | Tidak ada isi pesan | Kirim field `message` atau `text` |
| `Rate limit exceeded` | 429 | Terlalu banyak request (>100/menit) | Tambah delay antar request |

---

## 9. Rate Limiting

| Limit | Value |
|-------|-------|
| API request per API Key | 100 request / menit |
| Burst limit | 200 request / menit (kemudian throttled) |
| Message per instance (NEW, 0-7 hari) | 50 / hari |
| Message per instance (WARMING, 8-21 hari) | 200 / hari |
| Message per instance (WARMED, 22-30 hari) | 500 / hari |
| Message per instance (MATURE, 31+ hari) | 1000 / hari |

---

## 10. Ringkasan Jawaban

| Pertanyaan | Jawaban |
|---|---|
| Apakah `/conversations` return `phone_number: null` untuk @lid? | Bisa kosong, tapi **sudah auto-resolve** dari mapping table. Cek field `lid_resolved` |
| Ada endpoint resolve LID → phone? | **Ya**: `GET /api/v1/lid-mappings` dan `GET /api/v1/lid-mappings/resolve/:lid_jid` |
| Ada webhook event saat LID ter-resolve? | **Ya**: event `lid.mapping.resolved` dikirim ke webhook URL |
| Apakah ada parameter `chat_jid` di send endpoint? | **Tidak**. Gunakan `to` dengan phone number biasa |
| Apakah semua LID bisa di-resolve? | **Tidak selalu**. Tergantung WhatsApp share eventnya. Ini limitasi WhatsApp |
| Dokumentasi API lengkap? | Lihat file `API-REFERENCE.md` di root project |

---

## 11. Rekomendasi untuk CRM Integration

### Broadcast Logic yang Benar:

```
1. Ambil contacts dari CRM (phone_number)
2. Kirim ke POST /api/v1/messages/send-text dengan field "to" = phone_number
3. JANGAN kirim ke @lid JID — selalu gunakan phone number
4. Simpan message_id dari response untuk tracking
5. Subscribe webhook "message.delivered" dan "message.read" untuk status update
```

### Handle @lid di Chat Incoming:

```
1. Terima webhook "message.received" — cek field "from"
2. Jika "from" berakhiran "@lid", call GET /api/v1/lid-mappings/resolve/{lid_jid}
3. Jika 200 OK → update CRM contact dengan phone_number yang di-resolve
4. Jika 404 → simpan LID sementara, subscribe webhook "lid.mapping.resolved"
5. Saat "lid.mapping.resolved" event diterima → update CRM contact
```

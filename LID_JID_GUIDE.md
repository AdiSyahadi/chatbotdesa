# WA API — Panduan LID JID & Webhook Phone Number

## 1. Apakah `send-text` support LID JID di field `to`?

**Ya, sekarang sudah support.** (Update: 29 April 2026)

Kamu bisa kirim ke format manapun:

```json
// Format phone number biasa
{ "to": "628123456789", "message": "halo" }

// Format JID lengkap
{ "to": "628123456789@s.whatsapp.net", "message": "halo" }

// Format LID JID — sekarang support
{ "to": "77864099643580@lid", "message": "halo" }
```

**Sebelumnya ada bug:** Field `to` yang berformat `@lid` akan di-strip karakter non-numeriknya sehingga pesan dikirim ke JID yang salah (`77864099643580@s.whatsapp.net`) dan tidak sampai ke penerima meskipun API return `200 OK`. Bug ini sudah diperbaiki.

---

## 2. Webhook `phone_number` null saat sender pakai LID JID

### Kenapa terjadi?

`phone_number` di webhook payload bisa `null` ketika chat JID adalah `@lid` karena:

- LID JID tidak mengandung nomor telepon secara langsung
- Sistem perlu melakukan lookup ke tabel `lid_phone_mappings` untuk resolve LID → phone

### Apakah `batchResolveLidToPhone()` dipanggil sebelum webhook dikirim?

- **Incoming message:** ✅ Ya — ada resolusi LID otomatis sebelum webhook dikirim (cek DB dulu, lalu fallback ke `socket.onWhatsApp()`)
- **Outgoing message (send-text/media/location):** ✅ Sudah diperbaiki — sekarang juga resolve dari DB sebelum emit webhook

### Workflow resolve untuk incoming message:
1. Cek `lid_phone_mappings` di DB (fast path)
2. Kalau tidak ada → query WhatsApp langsung via `socket.onWhatsApp(lid)` (timeout 5 detik)
3. Kalau berhasil → simpan ke DB untuk lookup berikutnya
4. Kalau gagal → `phone_number` tetap `null` di webhook

---

## 3. Kapan tabel `lid_phone_mappings` diisi?

Tabel ini diisi secara **otomatis** oleh sistem pada kondisi berikut:

| Kondisi | Keterangan |
|---|---|
| **Kontak kirim pesan pertama** | Paling reliable — saat pesan masuk dari `@lid`, sistem langsung query WhatsApp dan simpan mapping |
| **`chats.phoneNumberShare` event** | Baileys v6.6+ — WhatsApp aktif membagikan mapping LID↔phone |
| **`contacts.upsert` event** | Saat Baileys sync kontak dan data kontak punya field `lid` + `jid` |
| **History sync** | Setelah QR scan & sync riwayat chat, mapping dari kontak lama ikut masuk |

### Penyebab tabel kosong untuk LID tertentu:
- Kontak belum pernah kirim pesan ke instance ini
- History sync belum selesai atau dinonaktifkan
- WhatsApp belum mengirim `chats.phoneNumberShare` event untuk LID tersebut

---

## 4. Endpoint untuk resolve LID → Phone Number

### Option A: Query string (baru)
```
GET /api/v1/contacts/resolve-lid?jid=77864099643580@lid
GET /api/v1/contacts/resolve-lid?jid=77864099643580@lid&instance_id=<uuid>

Header: X-API-Key: wa_xxxxxxxx
Permission: contact:read
```

### Option B: Path parameter (sudah ada sebelumnya)
```
GET /api/v1/lid-mappings/resolve/77864099643580@lid
GET /api/v1/lid-mappings/resolve/77864099643580@lid?instance_id=<uuid>

Header: X-API-Key: wa_xxxxxxxx
Permission: contact:read
```

### Response sukses:
```json
{
  "success": true,
  "data": {
    "lid_jid": "77864099643580@lid",
    "phone_number": "628123456789",
    "phone_jid": "628123456789@s.whatsapp.net",
    "instance_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "source": "onWhatsApp",
    "resolved_at": "2026-04-29T03:00:00.000Z"
  }
}
```

### Response jika LID belum ter-resolve:
```json
{
  "success": false,
  "error": {
    "code": "LID_MAPPING_NOT_FOUND",
    "message": "LID not resolved yet. Mapping is populated when: (1) contact sends a message, (2) contacts.upsert event fires, or (3) history sync completes."
  }
}
```

---

## 5. Rekomendasi Flow untuk Chatbot

```
Webhook masuk
    │
    ├── phone_number ada? ──→ Gunakan langsung
    │
    └── phone_number null?
            │
            ├── Ambil chat_jid dari payload
            │
            ├── GET /api/v1/contacts/resolve-lid?jid={chat_jid}
            │
            ├── 200 OK → Gunakan phone_number dari response
            │
            └── 404 → Tunggu pesan berikutnya dari kontak ini
                       (mapping akan otomatis masuk setelah pesan pertama diproses)
```

---

## 6. Daftar Semua Endpoint LID

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/v1/contacts/resolve-lid?jid=xxx@lid` | Resolve single LID (query string) |
| `GET` | `/api/v1/lid-mappings/resolve/:lid_jid` | Resolve single LID (path param) |
| `GET` | `/api/v1/lid-mappings` | List semua mapping milik org |
| `GET` | `/api/v1/lid-mappings?lid_jid=xxx@lid` | Filter mapping by LID |
| `GET` | `/api/v1/lid-mappings?instance_id=xxx` | Filter mapping by instance |

Semua endpoint memerlukan header `X-API-Key` dengan permission `contact:read`.

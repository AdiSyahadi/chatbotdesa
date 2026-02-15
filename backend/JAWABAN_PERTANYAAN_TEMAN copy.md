# Jawaban Pertanyaan — WA API Media Endpoint

---

## Status: SEMUA SUDAH DIPERBAIKI ✅

Semua 3 masalah yang dilaporkan sudah di-fix dan di-test.

---

## 1. Bug `reply.sendFile is not a function` → **FIXED (PATCH-053)**

**Root cause**: Config `@fastify/static` punya `decorateReply: false` yang membuat `reply.sendFile()` tidak ditambahkan ke Fastify. Ini satu-satunya registration plugin static, jadi `sendFile` benar-benar tidak ada.

**Fix**: Hapus `decorateReply: false` (default = `true`).

**Hasil test setelah fix**:
```
GET /media/{orgId}/{file}.webp → 200 OK, image/webp, 11626 bytes ✅
```

---

## 2. Endpoint yang benar: `/media/` (publik) atau `/uploads/` (auth)?

**Keduanya ada dan keduanya sudah berfungsi**, tapi untuk keperluan berbeda:

| Endpoint | Auth | Untuk siapa |
|----------|------|-------------|
| `/media/{orgId}/{filename}` | **Tidak perlu** (publik) | CRM / webhook consumer |
| `/uploads/{orgId}/{filename}` | **Perlu** (JWT / API Key) | Dashboard frontend |

**Untuk CRM: gunakan `/media/`** — ini endpoint publik yang sudah didesain untuk webhook consumer.

**`media_url` di webhook sekarang sudah menggunakan `/media/` prefix** (PATCH-052). Contoh:
```
http://localhost:3001/media/5f571cb4-9f44-49cb-b812-da23430b7da5/30d3ba56-8952-46a3-a585-d85972fe0868.webp
```

> **Catatan**: Pesan lama yang disimpan sebelum PATCH-052 mungkin masih punya URL `/uploads/`. Untuk pesan baru, semua `media_url` otomatis pakai `/media/`.

---

## 3. Akses media perlu auth atau tidak?

**TIDAK perlu auth untuk CRM**. Endpoint `/media/*` **publik** — bisa diakses langsung dengan GET request biasa, tanpa API Key maupun JWT.

**Kenapa aman tanpa auth?**
- Filename menggunakan **UUID v4** (122-bit random) — tidak bisa ditebak
- Pola sama seperti S3 pre-signed URL, Telegram CDN, WhatsApp Web CDN
- Disebut **capability URL** — siapa yang punya URL = punya akses

**Cara akses di CRM (Laravel)**:
```php
// Langsung di Blade template
<img src="{{ $message->media_url }}" alt="Sticker" style="max-width: 128px;" />

// Atau download ke lokal
$content = file_get_contents($message->media_url);
Storage::put('wa-media/' . basename($url), $content);
```

---

## Ringkasan Patches yang Terkait

| Patch | Fix |
|-------|-----|
| PATCH-051 | Sticker di ephemeral/viewOnce terdeteksi benar |
| PATCH-052 | Tambah `/media/*` publik + URL webhook pakai `/media/` |
| PATCH-053 | Fix `reply.sendFile is not a function` (`decorateReply` bug) |

---

## Untuk Developer CRM: Panduan Lengkap Render Media

Lihat file **INSTRUKSI-WEBHOOK-CRM.md** untuk:
- Contoh payload tiap tipe media (text/image/sticker/video/audio/document)
- Kode Blade siap pakai (`@switch($message->type)`)
- Kode Controller webhook handler
- Migrasi database (kolom `type` dan `media_url`)
- Cara download media ke storage lokal CRM
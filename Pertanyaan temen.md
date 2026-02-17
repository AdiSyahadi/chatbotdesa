Pertanyaan untuk Developer WA API
Masalah
Endpoint GET /api/v1/messages?chat_jid=... mengembalikan media_url: null untuk semua OUTGOING messages yang bertipe media (STICKER, IMAGE, VIDEO, AUDIO, DOCUMENT). Sementara INCOMING messages bertipe media mengembalikan media_url dengan benar.

Contoh response saat ini:

json
// OUTGOING sticker → media_url null
{"direction":"OUTGOING","message_type":"STICKER","media_url":null, ...}
 
// INCOMING sticker → media_url ada
{"direction":"INCOMING","message_type":"STICKER","media_url":"http://localhost:3001/media/22222222-.../file.webp", ...}
Pertanyaan
Apakah ini memang limitasi WhatsApp (media outgoing tidak disimpan/tidak bisa di-retrieve), atau ini bisa di-fix di sisi WA API?
Apakah webhook message.sent juga mengirim media_url: null untuk outgoing media? Atau apakah media_url tersedia di webhook payload saat pesan pertama kali terkirim?
Jika memang limitasi WhatsApp, apakah ada workaround — misalnya menyimpan media file saat pertama kali dikirim, lalu menyediakan media_url di response?
Kebutuhan CRM
CRM membutuhkan media_url yang valid untuk semua messages (baik INCOMING maupun OUTGOING) agar media bisa ditampilkan di chat UI. Tanpa media_url, sticker/image/video yang dikirim user hanya tampil sebagai teks placeholder [Sticker], [IMAGE], dll.

Yang ideal: Semua message bertipe media (STICKER, IMAGE, VIDEO, AUDIO, DOCUMENT) mengembalikan media_url yang bisa di-download, baik INCOMING maupun OUTGOING.

---

# ✅ JAWABAN — SUDAH DI-FIX (PATCH-063)

## Status: FIXED & DEPLOYED

Tanggal fix: 16 Februari 2026

---

## Jawaban Pertanyaan 1: Apakah ini limitasi WhatsApp?

**BUKAN limitasi WhatsApp.** Ini bug di sisi WA API.

### Root Cause

Di file `baileys.service.ts`, fungsi `handleRealtimeMessage` (handler yang memproses setiap pesan real-time dari WhatsApp) punya guard:

```typescript
// SEBELUM FIX (BUG):
if (DOWNLOADABLE_MEDIA_TYPES.has(messageType) && !fromMe) {
  const mediaResult = await downloadAndSaveMedia(msg, ...);
  // ...
}
```

Guard `!fromMe` menyebabkan **semua outgoing media di-skip** — tidak pernah di-download dan tidak pernah disimpan. Akibatnya `media_url` selalu `null` untuk pesan yang dikirim dari HP.

### Fix yang Diterapkan

```typescript
// SETELAH FIX (PATCH-063):
if (DOWNLOADABLE_MEDIA_TYPES.has(messageType)) {
  const mediaResult = await downloadAndSaveMedia(msg, ...);
  // ...
}
```

Sekarang `downloadAndSaveMedia` berjalan untuk **semua** media message — baik incoming maupun outgoing.

---

## Jawaban Pertanyaan 2: Apakah webhook `message.sent` juga `media_url: null`?

**Sebelum fix:** Ya, webhook `message.sent` juga mengirim `media_url: null` untuk pesan media yang dikirim dari HP (bukan via API). Karena download di-skip, tidak ada file yang disimpan.

**Setelah fix (PATCH-063):** Webhook `message.sent` sekarang mengirim `media_url` yang valid beserta `mime_type`, `file_size`, dan `file_name` (khusus dokumen).

**Catatan:** Untuk pesan media yang dikirim **via API** (`POST /api/v1/messages/send-media`), `media_url` sudah tersedia sebelum fix ini karena disimpan saat API call. PATCH-063 meningkatkan ini — sekarang `media_url` dioverwrite dengan `/media/` URL publik yang lebih baik (file disimpan lokal oleh WAAPI).

---

## Jawaban Pertanyaan 3: Workaround?

**Tidak perlu workaround** — masalah sudah di-fix langsung di root cause-nya.

Yang terjadi sekarang:
1. User kirim sticker/gambar/video/audio/dokumen dari HP
2. Baileys menerima event message
3. `handleRealtimeMessage` berjalan
4. `downloadAndSaveMedia` **berjalan** (guard `!fromMe` dihapus)
5. Media di-download dari WhatsApp server → disimpan ke disk lokal → `media_url` = `/media/org-id/uuid.webp`
6. Message disimpan ke DB **dengan `media_url` yang valid**
7. Webhook `message.sent` dikirim **dengan `media_url` yang valid**
8. `GET /api/v1/messages` mengembalikan **`media_url` yang valid**

---

## Untuk CRM: Yang Berubah

### Sebelum Fix

```json
{"direction":"OUTGOING","message_type":"STICKER","media_url":null}
```

### Setelah Fix

```json
{
  "direction": "OUTGOING",
  "message_type": "STICKER",
  "media_url": "/media/org-uuid/abcdef12-3456.webp"
}
```

### Cara Akses Media di CRM

```javascript
// media_url dari API response
const mediaUrl = message.media_url; // "/media/org-uuid/abcdef12-3456.webp"

// Full URL untuk display di chat UI
const fullUrl = `http://localhost:3001${mediaUrl}`;

// Bisa langsung dipakai di <img>, <video>, <audio> tag
// Tidak perlu auth — URL ini publik
```

### Catatan Penting untuk Existing Data

Pesan outgoing yang dikirim **sebelum fix** tetap punya `media_url: null` karena media-nya tidak pernah di-download. Hanya pesan **baru** setelah fix yang akan punya `media_url` valid.

Jika ingin fix data lama, bisa dilakukan manual via database, tapi media file-nya sudah tidak bisa di-download dari WhatsApp server (expired). Jadi data lama akan tetap `null`.
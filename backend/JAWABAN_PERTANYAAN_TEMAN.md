Ada beberapa hal yang perlu saya sampaikan:

Bug/Info dari WA API Teman Kamu
1. Field send-text masih pakai message, bukan text
Dokumentasi baru bilang field-nya text, tapi API masih validasi message. Ini inkonsistensi di docs vs implementasi. Bukan masalah besar, CRM kita sudah handle pakai message.

2. Duplicate constraint error saat kirim pesan
Tadi saya coba kirim pesan via API dan dapat error:

Unique constraint failed on: messages_wa_message_id_instance_id_key
Ini bug di WA API side — dia gagal simpan pesan outgoing karena duplicate. Mungkin pesan sudah ada di DB tapi dia coba insert lagi. Tanyakan ke teman kamu apakah ini known issue.

3. Message type templateMessage dan placeholderMessage tidak di-handle
WA API mengirim pesan dengan type seperti templateMessage, placeholderMessage yang tidak ada di mapping. Ini bukan bug kritis — saya sudah handle di CRM dengan fallback ke OTHER.

Pertanyaan untuk Teman Kamu
Tolong tanyakan ini:

Apakah WA API mengirim webhook message.sent untuk pesan outgoing yang dikirim via API? — Karena tadi webhook yang masuk cuma message.received, saya perlu tahu apakah pesan yang kita kirim via CRM juga akan di-webhook balik supaya bisa update status di CRM.
Duplicate constraint error di messages_wa_message_id_instance_id_key — apakah ini known bug? Terjadi saat kirim pesan via /api/v1/messages/send-text.
Apakah webhook payload menyertakan phone_number? — Karena beberapa kontak pakai format @lid (JID baru WhatsApp), saya perlu phone_number di webhook payload untuk bisa identifikasi kontak. Kalau tidak ada, pesan dari kontak @lid akan di-skip.

---

## JAWABAN (Update 11 Feb 2026)

Hai bro, semua laporan kamu sudah saya cek dan fix. Berikut jawaban satu per satu:

---

### Bug 1: Field `message` vs `text` di send-text

**Status: SUDAH DIFIX**

Sekarang endpoint `/api/v1/messages/send-text` menerima **KEDUA** field — `message` maupun `text`. Jadi CRM kamu bisa pakai salah satu, keduanya valid.

Contoh request (keduanya work):
```json
// Cara 1 (yang lama, tetap jalan)
{ "instance_id": "xxx", "to": "628xxx", "message": "Halo!" }

// Cara 2 (pakai text, sekarang juga jalan)
{ "instance_id": "xxx", "to": "628xxx", "text": "Halo!" }
```

Kalau dua-duanya diisi, yang dipakai **`message`** (prioritas). **Kamu tidak perlu ubah apa-apa di CRM.**

---

### Bug 2: Duplicate constraint error

**Status: SUDAH DIFIX**

Ini memang bug di sisi kami. Root cause-nya:

1. Saat kamu kirim pesan via API → `sendText()` insert pesan ke DB
2. Lalu WhatsApp (Baileys library) otomatis fire event `messages.upsert` untuk pesan yang sama
3. Handler kami coba insert lagi dengan `wa_message_id` yang sama → **duplicate error**

**Fix yang diterapkan:**
- Semua insert sekarang pakai `upsert` (insert-or-update), bukan `create`
- Kalau message ID sudah ada, dia update instead of error
- Handler event dari Baileys sekarang juga cek `fromMe` — pesan outgoing ditandai benar sebagai `OUTGOING` (sebelumnya semua ditandai `INCOMING`)

**Yang perlu kamu lakukan:** Tidak ada. Error ini sudah tidak akan muncul lagi. Kalau CRM kamu punya retry logic untuk error ini, bisa dihapus.

---

### Bug 3: templateMessage & placeholderMessage tidak di-handle

**Status: SUDAH DIFIX**

Sekarang kami sudah handle tipe pesan berikut yang sebelumnya masuk ke `UNKNOWN`:

| Tipe Pesan | Deskripsi |
|---|---|
| `templateMessage` | Pesan template bisnis |
| `highlyStructuredMessage` | Template i18n |
| `buttonsMessage` | Pesan dengan tombol |
| `listMessage` | Pesan dengan list menu |
| `interactiveMessage` | Pesan interaktif (WA Business) |
| `placeholderMessage` | Placeholder ("waiting for this message") |
| `orderMessage` | Pesan pesanan/commerce |
| `groupInviteMessage` | Undangan grup |
| `invoiceMessage` | Invoice |
| `productMessage` | Katalog produk |

**Yang perlu kamu lakukan:** CRM kamu yang pakai fallback ke `OTHER` sudah aman. Tapi sekarang kamu bisa handle tipe-tipe ini secara spesifik kalau mau (misalnya tampilkan "[Template Message]" atau "[List Menu]" di UI CRM). Field `message_type` di webhook akan mengirim tipe yang benar.

---

### Pertanyaan 1: Webhook `message.sent` untuk pesan outgoing

**SUDAH AKTIF SEKARANG.**

Sebelumnya memang bug — webhook `message.sent` **tidak pernah dikirim** untuk pesan yang dikirim via API. Sekarang sudah difix.

**Behavior baru:**
- Kirim pesan via API → webhook `message.sent` akan dikirim ke URL webhook kamu
- Terima pesan masuk → webhook `message.received` (ini sudah jalan dari dulu)

**Payload `message.sent`:**
```json
{
  "event": "message.sent",
  "timestamp": "2026-02-11T01:00:00.000Z",
  "instance_id": "uuid-xxx",
  "organization_id": "uuid-xxx",
  "data": {
    "id": "3EB0XXXXXXXX",
    "from": "628123456789@s.whatsapp.net",
    "chat_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "direction": "OUTGOING",
    "type": "text",
    "content": "Isi pesan",
    "timestamp": 1739235600
  }
}
```

**Yang perlu kamu lakukan:** Pastikan webhook kamu subscribe ke event `message.sent`. Kalau belum, update config webhook di dashboard atau via API:
```
PATCH /api/v1/webhooks/config
{
  "instance_id": "uuid-xxx",
  "webhook_events": ["message.received", "message.sent", "message.delivered", "message.read"]
}
```

---

### Pertanyaan 2: Duplicate constraint — known bug?

**Ya, ini known bug yang sekarang sudah difix.** Lihat jawaban Bug 2 di atas. Kamu tidak akan dapat error ini lagi.

---

### Pertanyaan 3: `phone_number` di webhook payload

**SUDAH DITAMBAHKAN.**

Sebelumnya webhook payload cuma kirim `from` (raw JID). Sekarang payload diperkaya dengan field tambahan:

| Field | Contoh | Keterangan |
|---|---|---|
| `from` | `628xxx@s.whatsapp.net` | Raw JID (tetap ada, backwards compatible) |
| `chat_jid` | `628xxx@s.whatsapp.net` | Sama dengan `from` |
| `sender_jid` | `628xxx@s.whatsapp.net` | Pengirim (untuk grup, ini member yang kirim) |
| `phone_number` | `628123456789` | **BARU** — nomor telepon yang extracted dari JID |
| `direction` | `INCOMING` / `OUTGOING` | **BARU** — arah pesan |

**Untuk kontak LID (`xxx@lid`):**
- `phone_number` akan bernilai **`null`** karena LID tidak mengandung nomor telepon
- `from` dan `chat_jid` tetap berisi JID asli (`xxx@lid`)
- CRM kamu perlu handle case `phone_number === null` — bisa fallback pakai `from` sebagai identifier

**Yang perlu kamu lakukan:**
1. Update CRM untuk pakai field `phone_number` (bukan extract manual dari `from`)
2. Tambah handling untuk kasus `phone_number` null (kontak LID)
3. Pakai field `direction` untuk bedakan incoming vs outgoing

---

## Ringkasan: Apa yang Harus Kamu Lakukan

| # | Action | Prioritas |
|---|--------|-----------|
| 1 | **Tidak perlu apa-apa** — duplicate error sudah hilang otomatis | ✅ Otomatis |
| 2 | **Tidak perlu apa-apa** — field `message`/`text` keduanya diterima | ✅ Otomatis |
| 3 | Subscribe webhook ke event `message.sent` kalau belum | ⚠️ Perlu update |
| 4 | Update CRM pakai field `phone_number` dari webhook payload | ⚠️ Perlu update |
| 5 | Handle `phone_number: null` untuk kontak LID | ⚠️ Perlu update |
| 6 | (Optional) Handle message type baru yang lebih spesifik di UI | 💡 Opsional |

Semua fix sudah di-deploy. Kalau ada pertanyaan lain, kabarin aja.

---

## UPDATE 2: History Sync Urutan "Random" (11 Feb 2026)

### Pertanyaan: Kenapa data sync bukan dari yang terbaru?

**Penjelasan:**

Ini **bukan bug**, tapi behavior dari WhatsApp sendiri. WhatsApp mengirim history sync dalam batch **per-chat** (per kontak/grup), BUKAN berurutan berdasarkan waktu. Contoh:
- Batch 1: 200 pesan dari Kontak A (campuran pesan lama & baru)
- Batch 2: 150 pesan dari Grup B 
- Batch 3: 50 pesan dari Kontak C
- dst...

Jadi memang datanya "acak" karena WhatsApp yang menentukan urutan pengiriman batch-nya.

**TAPI, ada yang sudah saya fix:**

Sebelumnya, API `GET /api/v1/messages` mengurutkan berdasarkan `created_at` (waktu insert ke DB) — artinya pesan yang *di-sync duluan* muncul di atas, padahal belum tentu itu pesan terbaru.

**Sekarang sudah difix:**
- API mengurutkan berdasarkan `sent_at` (timestamp asli dari WhatsApp) — jadi pesan terbaru **pasti** muncul di atas
- Time range filter (`since`/`until`) juga pakai `sent_at`
- Ditambahkan DB index pada `sent_at` untuk performa query

**Yang perlu kamu lakukan:**
- **Tidak ada.** API output sudah otomatis terurut berdasarkan waktu asli pesan.
- Kalau CRM kamu sorting sendiri, pastikan pakai field `sent_at` (bukan `created_at`).
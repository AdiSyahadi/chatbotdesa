Pertanyaan untuk Fitur Edit Pesan (Edit Message)

---

## 1. Endpoint edit pesan apa?

> Path lengkap, HTTP method, dan contoh URL-nya.

**Endpoint:**

```
POST http://localhost:3001/api/v1/messages/edit
```

**Header:**
```
X-API-Key: 364a8954-fcb5-4ba9-bc63-e09b2328520c
Content-Type: application/json
```

**Contoh curl:**
```bash
curl -X POST http://localhost:3001/api/v1/messages/edit \
  -H "X-API-Key: 364a8954-fcb5-4ba9-bc63-e09b2328520c" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "4f680f68-a8c5-41dd-9377-02bf5915974e",
    "message_id": "3EB0B4A2D1F3C8E7A9",
    "chat_jid": "628123456789@s.whatsapp.net",
    "new_text": "Pesan yang sudah diedit ✏️"
  }'
```

---

## 2. Parameter apa saja yang dibutuhkan?

> Apakah sama kayak delete? Plus field baru?

**Semua field WAJIB (required):**

| Field | Type | Keterangan |
|-------|------|------------|
| `instance_id` | string (uuid) | ID instance WhatsApp kamu (`4f680f68-a8c5-41dd-9377-02bf5915974e`) |
| `message_id` | string | WhatsApp message ID (format `3EB0xxxxx`) — sama kayak di delete |
| `chat_jid` | string | JID chat, contoh: `628123456789@s.whatsapp.net` (personal) atau `120363xxx@g.us` (group) |
| `new_text` | string (max 4096) | Teks baru yang menggantikan isi pesan lama. **Tidak boleh kosong.** |

> 💡 **Lebih simpel dari delete** — tidak perlu `from_me`, `participant`, atau `delete_for`. Karena di WhatsApp kamu **hanya bisa edit pesan sendiri** (fromMe selalu true).

**Contoh request body lengkap:**
```json
{
  "instance_id": "4f680f68-a8c5-41dd-9377-02bf5915974e",
  "message_id": "3EB0B4A2D1F3C8E7A9",
  "chat_jid": "628123456789@s.whatsapp.net",
  "new_text": "Maaf, yang benar harganya Rp 150.000 bukan 100.000"
}
```

---

## 3. Ada batas waktu untuk edit?

> Di WhatsApp resmi ada limit 15 menit setelah kirim. Apakah API ini juga enforce limit waktu?

**Ya, ~15 menit** — tapi batasan ini berasal dari **server WhatsApp**, bukan dari API kita.

- API kita **tidak menolak request** berdasarkan waktu — request akan diteruskan ke WhatsApp server.
- Kalau sudah lewat ~15 menit, **WhatsApp server yang menolak** → API akan return error `MSG_011`.
- Kalau masih dalam ~15 menit → edit berhasil, penerima langsung lihat pesan berubah dengan label *(edited)*.

**Tips untuk CRM kamu:** Simpan `sent_at` setiap pesan, lalu di UI tampilin tombol "Edit" hanya kalau `Date.now() - sent_at < 15 * 60 * 1000` (15 menit). Kalau sudah lewat, sembunyikan tombol edit.

```javascript
// Contoh logic di CRM frontend
const canEdit = (Date.now() - new Date(message.sent_at).getTime()) < 15 * 60 * 1000;
```

---

## 4. Bisa edit pesan media atau hanya text?

> Kalau media, yang bisa diedit apanya? Caption-nya aja atau bisa ganti file juga?

**Bisa keduanya, tapi dengan batasan:**

| Jenis Pesan | Yang Bisa Diedit | File Berubah? |
|-------------|------------------|---------------|
| **Text** | Seluruh isi teks | — |
| **Image + caption** | Caption-nya saja | ❌ Gambar tetap sama |
| **Video + caption** | Caption-nya saja | ❌ Video tetap sama |
| **Document + caption** | Caption-nya saja | ❌ File tetap sama |
| **Audio / Voice note** | ❌ Tidak bisa diedit | — |
| **Sticker** | ❌ Tidak bisa diedit | — |

**Cara edit caption media:** Sama persis — kirim `new_text` dengan caption baru:
```json
{
  "instance_id": "4f680f68-a8c5-41dd-9377-02bf5915974e",
  "message_id": "3EB0C5D6E7F8A1B2C3",
  "chat_jid": "628123456789@s.whatsapp.net",
  "new_text": "Caption gambar yang sudah diperbaiki"
}
```

> ⚠️ **Tidak bisa ganti file/gambar/video.** Kalau mau ganti file, harus delete pesan lama lalu kirim pesan baru dengan file baru.

---

## 5. Response sukses & error seperti apa?

> Contoh response JSON dan error codes yang mungkin muncul.

**✅ Sukses (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "success": true
  }
}
```

**❌ Error — Instance tidak ditemukan (HTTP 404):**
```json
{
  "success": false,
  "error": {
    "code": "INSTANCE_001",
    "message": "Instance not found"
  }
}
```

**❌ Error — Instance tidak terkoneksi (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "INSTANCE_006",
    "message": "Instance is not connected"
  }
}
```

**❌ Error — Gagal edit / sudah lewat 15 menit (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "MSG_011",
    "message": "Failed to edit message"
  }
}
```

**❌ Error — new_text kosong (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION",
    "message": "new_text cannot be empty"
  }
}
```

**❌ Error — Field required missing (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION",
    "message": "body must have required property 'new_text'"
  }
}
```

---

## 6. Apakah ada webhook event saat pesan diedit?

> Baik saat kita yang edit, maupun saat contact edit pesan mereka.

### A. Saat kamu edit pesan outgoing (via API)

**Ya, webhook `message.sent` akan dikirim** dengan `type: "edit"`:

```json
{
  "event": "message.sent",
  "instance_id": "4f680f68-a8c5-41dd-9377-02bf5915974e",
  "data": {
    "message": {
      "id": "3EB0B4A2D1F3C8E7A9",
      "chat_jid": "628123456789@s.whatsapp.net",
      "phone_number": "628123456789",
      "direction": "OUTGOING",
      "type": "edit",
      "content": "Pesan yang sudah diedit ✏️",
      "timestamp": 1771491800
    }
  }
}
```

### B. Saat contact edit pesan incoming mereka

Saat ini **belum ada webhook khusus** untuk incoming edit. WhatsApp mengirim event `messages.update` saat pesan diedit orang lain, tapi handler kita saat ini hanya memproses status update (SENT→DELIVERED→READ), belum memproses edit content.

> 📋 **Catatan:** Kalau nanti kamu butuh webhook untuk incoming edit, bisa dibuatkan di patch selanjutnya. Beritahu aja.

---

## Ringkasan Quick Reference

| Item | Value |
|------|-------|
| **Endpoint** | `POST /api/v1/messages/edit` |
| **Auth** | `X-API-Key` header |
| **Required fields** | `instance_id`, `message_id`, `chat_jid`, `new_text` |
| **Message ID format** | WA internal ID (`3EB0xxxxx`) |
| **Time limit** | ~15 menit (enforced by WhatsApp server) |
| **Text edit** | ✅ Full text replacement |
| **Media caption edit** | ✅ Caption only, file tetap |
| **Audio/Sticker edit** | ❌ Tidak bisa |
| **Ganti file media** | ❌ Tidak bisa (harus delete + kirim baru) |
| **Success response** | `{ "success": true, "data": { "success": true } }` |
| **Error code** | `MSG_011` (gagal edit) |
| **Webhook event** | `message.sent` with `type: "edit"` |
| **Permission** | API key harus punya permission `message:send` |
| **DB effect** | `content` diupdate + `edited_at` diisi timestamp |

---

## Contoh Implementasi di CRM

```javascript
// ========================================
// CRM Backend — Edit Message Function
// ========================================

async function editWhatsAppMessage(localMessageId, newText) {
  // 1. Ambil data pesan dari database CRM
  const message = await db.messages.findById(localMessageId);
  
  if (!message) throw new Error('Message not found');
  
  // 2. Cek apakah masih dalam 15 menit
  const sentAt = new Date(message.sent_at).getTime();
  const fifteenMinutes = 15 * 60 * 1000;
  
  if (Date.now() - sentAt > fifteenMinutes) {
    throw new Error('Pesan sudah lewat 15 menit, tidak bisa diedit');
  }
  
  // 3. Kirim request ke WA API
  const response = await fetch('http://localhost:3001/api/v1/messages/edit', {
    method: 'POST',
    headers: {
      'X-API-Key': '364a8954-fcb5-4ba9-bc63-e09b2328520c',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instance_id: '4f680f68-a8c5-41dd-9377-02bf5915974e',
      message_id: message.wa_message_id,
      chat_jid: message.chat_jid,
      new_text: newText,
    }),
  });
  
  const result = await response.json();
  
  // 4. Update database CRM
  if (result.success) {
    await db.messages.update(localMessageId, {
      content: newText,
      edited_at: new Date(),
      is_edited: true,
    });
    return { success: true };
  } else {
    throw new Error(result.error?.message || 'Gagal edit pesan');
  }
}
```
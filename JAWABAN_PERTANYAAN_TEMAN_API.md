# Jawaban Pertanyaan Integrasi API WhatsApp

Semua jawaban di bawah berdasarkan **kode backend aktif saat ini** (bukan asumsi).

---

## 1. Berapa minimum delay antar pesan? (Phase DAY_1_3 error di 4 detik)

**Minimum delay untuk `DAY_1_3` adalah 5000ms (5 detik).**

Sumber kode langsung di `backend/src/config/constants.ts`:

```
DAY_1_3:    min_delay_ms = 5000   (5 detik)
DAY_4_7:    min_delay_ms = 3000   (3 detik)
DAY_8_14:   min_delay_ms = 2000   (2 detik)
DAY_15_PLUS: min_delay_ms = 1000  (1 detik)
```

Sistem menghitung: `waktu_sekarang - last_message_at`. Jika hasilnya < `min_delay_ms`, kirim **langsung ditolak**.

**Kenapa 4 detik masih error?**
4000ms < 5000ms → sistem menolak. Persis di batas, bukan 1ms pun yang ditoleransi.

**Rekomendasi aman:**
- DAY_1_3: gunakan **6–8 detik** (beri buffer jitter minimal 1 detik dari batas minimum)
- DAY_4_7: gunakan **4–5 detik**
- DAY_8_14: gunakan **3–4 detik**
- DAY_15_PLUS: gunakan **2–3 detik**

> Jangan set tepat di angka minimum. Latency jaringan server + clock drift bisa bikin pengiriman tiba < 1ms sebelum batas terpenuhi.

---

## 2. Health score kontradiktif — API bilang 100, tapi error "Health score too low"

**Threshold blokir di kode adalah `health_score < 20`.**

Jika health score kamu 100, maka blokir health score **tidak** yang terjadi. Artinya ada penyebab lain.

**Cara diagnosis yang benar:**

Error `MSG_001` / `MSG_002` adalah **wrapper generik**. Penyebab spesifik ada di field `message` dalam response error:

```json
{
  "success": false,
  "error": {
    "code": "MSG_001",
    "message": "Penyebab sesungguhnya ada di sini"
  }
}
```

Baca `error.message`, bukan hanya `error.code`.

**Kapan health score turun?**

Setiap gagal kirim pesan → `health_score - 5` (tidak bisa di bawah 0).

**Kapan health score kembali ke 100?**

Saat koneksi WhatsApp berhasil `CONNECTED` → sistem set `health_score = 100` otomatis.

**Kemungkinan penyebab jika health memang turun tanpa sadar:**
- Kirim ke nomor tidak aktif berulang kali
- Koneksi WhatsApp sempat terputus dan reconnect
- Kirim terlalu cepat → error berulang → tiap error kurangi 5 poin

---

## 3. Apakah send-media punya rate limit lebih ketat dari send-text?

**Tidak. Keduanya melewati gate yang persis sama.**

Semua tipe pengiriman — text, media (image/video/document), location, buttons, list — semuanya memanggil fungsi `canSendMessage()` yang sama sebelum dikirim.

Gate yang dicek (berurutan):
1. `daily_message_count >= daily_limit` → tolak
2. `health_score < 20` → tolak
3. `now - last_message_at < min_delay_ms` → tolak (return `wait_ms`)

**Tidak ada gating terpisah untuk media.**

Yang sering membuat media *terasa* lebih lambat:
- Waktu download media dari URL yang diberikan
- Proses encoding/compress sebelum kirim ke WhatsApp
- Jika media URL lambat atau timeout, send gagal meski gating lolos

---

## 4. Ada endpoint untuk cek cooldown / kapan boleh kirim lagi?

**Ya, sudah ada.**

Endpoint baru tersedia sekarang:

```
GET /api/v1/instances/:instanceId/cooldown
Header: X-API-Key: wa_xxxxx
```

**Contoh response:**

```json
{
  "success": true,
  "data": {
    "allowed": false,
    "reason": "Please wait between messages",
    "wait_ms": 3200,
    "next_allowed_at": "2026-03-29T10:05:03.000Z",
    "instance": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "CONNECTED",
      "warming_phase": "DAY_1_3",
      "daily_message_count": 12,
      "daily_limit": 20,
      "health_score": 100,
      "last_message_at": "2026-03-29T10:04:57.800Z"
    },
    "limits": {
      "min_delay_ms": 5000,
      "max_messages_per_hour": 5,
      "health_score_min": 20
    }
  }
}
```

**Cara pakai di bot:**

```js
// Sebelum kirim, cek cooldown dulu
const cd = await fetch(`/api/v1/instances/${instanceId}/cooldown`, {
  headers: { 'X-API-Key': apiKey }
}).then(r => r.json());

if (!cd.data.allowed) {
  await sleep(cd.data.wait_ms + 200); // tambah buffer 200ms
}

// Baru kirim
await sendMessage(...);
```

> Ini jauh lebih andal dibanding trial-and-error retry.

---

## 5. Warming phase bisa di-skip untuk development?

**Tidak ada mode bypass resmi untuk production instance.**

Warming phase adalah perlindungan akun WhatsApp agar tidak kena ban. Jika di-bypass, risiko ban akun WhatsApp-nya sendiri.

**Yang bisa dilakukan untuk mempermudah testing:**

### Opsi A — Pakai instance khusus testing
- Buat instance tersendiri khusus nomor testing
- Nomor testing tidak dipakai untuk produksi
- Warming masih berlaku tapi kerugian jika banned minimal

### Opsi B — Pahami batas warming dan desain test sesuai batas
Tabel batas real saat ini:

| Phase | Daily Limit | Min Delay | Max/Jam |
|---|---|---|---|
| DAY_1_3 | 20 pesan | 5 detik | 5 pesan |
| DAY_4_7 | 50 pesan | 3 detik | 15 pesan |
| DAY_8_14 | 100 pesan | 2 detik | 30 pesan |
| DAY_15_PLUS | 200 pesan | 1 detik | 60 pesan |

### Opsi C — Reset instance untuk testing ulang
Jika perlu reset hitungan warming: minta admin atau gunakan reset script.

---

## 6. Daily limit 1000 tapi sudah kena limit di 76 pesan — kenapa?

**Ada dua layer limit yang berbeda dan sering tertukar:**

| Layer | Lokasi | Pengaturan |
|---|---|---|
| **Org limit** | `organizations.max_messages_per_day` | Batas total organisasi per hari |
| **Instance limit** | `whatsapp_instances.daily_limit` | Batas per instance, dikontrol oleh warming phase |

**Yang kamu lihat (`daily_limit: 1000`) kemungkinan adalah org limit.**

Tapi sistem mengecek **keduanya**. Instance kamu di phase `DAY_1_3` punya `daily_limit = 20`. Jika sudah kirim 20 pesan dari 1 instance itu, instance tersebut **diblokir** meski org masih sisa 924.

**Cara diagnosis:**

Cek endpoint cooldown (lihat jawaban no. 4):
```
GET /api/v1/instances/:instanceId/cooldown
```

Lihat field:
```json
"instance": {
  "daily_message_count": 76,
  "daily_limit": 20,    ← instance limit oleh warming phase
  "warming_phase": "DAY_1_3"
}
```

Jika `daily_message_count >= daily_limit` pada level instance → **blokir**, meski org masih longgar.

**Solusi:**
- Tunggu reset harian (UTC 00:00 — atau saat server restart jika sempat absen tengah malam)
- Jika perlu segera: minta admin reset counter instance tersebut
- Untuk kebutuhan volume tinggi: pakai beberapa instance, distribusi pesan antar instance

---

## Ringkasan Quick Reference

```
Warming DAY_1_3:
  - Min delay : 5 detik (gunakan 6-8 detik)
  - Daily limit: 20 pesan/hari per instance (bukan per org)
  - Max/jam    : 5 pesan

Cek sebelum kirim:
  GET /api/v1/instances/:id/cooldown

Error diagnosis:
  Baca error.message, bukan hanya error.code

Health score:
  Blokir jika < 20. Reset ke 100 saat reconnect CONNECTED.
  Turun 5 poin per kegagalan kirim.

Dua layer limit:
  instance.daily_limit (kecil, warming) vs org.max_messages_per_day (besar, org)
  Keduanya dicek. Yang kecil yang biasanya menghambat.
```

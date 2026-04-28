# Jawaban Pertanyaan User API (Rate Limit, Health Score, Cooldown)

Berikut jawaban resmi berdasarkan behavior backend saat ini.

## 1) Minimum delay antar pesan untuk DAY_1_3

Untuk warming phase `DAY_1_3`, minimum delay yang dipakai sistem adalah **5 detik** (`min_delay_ms = 5000`).

Jadi jika kirim tiap 4 detik, memang akan kena error:
- `Please wait between messages`

Rekomendasi aman di production:
- set delay **6-8 detik** untuk DAY_1_3
- jangan pakai fixed 5.0 detik (beri buffer jitter karena latency/jam server)

## 2) Health score terlihat 100 tapi dapat MSG_001 "Health score too low"

`MSG_001` adalah kode generik untuk gagal kirim text. Penyebab spesifiknya ada di `message` error.

Kondisi yang perlu dipastikan:
- cek **instance_id yang sama persis** antara endpoint status dan endpoint send
- pastikan tidak membaca status cache lama

Di backend, blokir health terjadi bila:
- `health_score < 20`

Kapan health score jadi 100 lagi:
- saat instance berhasil `CONNECTED` (reconnect sukses), health di-set ke 100
- atau saat reset manual instance

## 3) Apakah rate limit text vs image berbeda?

Secara logic throttle internal saat ini, text dan media sama-sama lewat gate yang sama:
- daily limit instance
- health score threshold
- minimum delay antar pesan

Jadi **tidak ada cooldown terpisah khusus media** di guard utama.

Yang berbeda untuk media biasanya karena faktor lain:
- URL media tidak valid/terblokir SSRF
- ukuran/mimetype file
- waktu upload/download media lebih lama

## 4) Ada endpoint cek cooldown (sisa tunggu)?

Saat ini **belum ada endpoint publik khusus cooldown** yang mengembalikan `wait_ms`.

Namun sistem internal memang menghitung `wait_ms` saat terlalu cepat kirim.

Solusi praktis sementara untuk bot:
- gunakan delay konservatif berdasarkan warming phase
- jika kena `Please wait between messages`, retry dengan backoff (misal +2 detik)

Jika dibutuhkan, kita bisa expose endpoint baru misalnya:
- `GET /api/v1/instances/:instanceId/cooldown`
- response: `{ allowed, reason, wait_ms }`

## 5) Warming phase bisa di-skip untuk development?

Saat ini **tidak ada mode development bypass** untuk anti-ban limiter pada instance normal.

Alasan:
- limiter bagian dari proteksi akun WhatsApp agar tidak cepat terflag/banned

Untuk testing cepat:
- pakai nomor/instance khusus testing
- naikkan delay dan hindari blast massal
- gunakan template test batch kecil

## 6) Daily limit 1000 tapi dibatasi di 76 pesan, kenapa?

Jika dibatasi di angka jauh di bawah daily limit, biasanya penyebabnya **bukan daily limit**.

Kemungkinan paling sering:
- kena minimum delay (terlalu rapat antar pesan)
- health score turun akibat beberapa kegagalan kirim beruntun
- limit organisasi/flow lain yang lebih dulu ter-trigger

Cara diagnosis cepat:
1. log error detail per request (`error.message`), bukan hanya code
2. cek status instance saat gagal (health_score, last_message_at, daily_message_count)
3. pastikan interval kirim real di server-side worker, bukan hanya delay di client

---

## Rekomendasi Implementasi Bot (langsung bisa dipakai)

- DAY_1_3: delay 6-8 detik
- DAY_4_7: delay 4-6 detik
- DAY_8_14: delay 3-4 detik
- DAY_15_PLUS: delay 2-3 detik

Tambahkan retry policy:
- jika `Please wait between messages` -> tunggu 2-5 detik lalu retry
- jika `Health score too low` -> stop sementara (cooldown akun), jangan spam retry

---

Jika kamu setuju, saya bisa lanjut implement endpoint cooldown checker supaya bot tidak trial-and-error lagi.
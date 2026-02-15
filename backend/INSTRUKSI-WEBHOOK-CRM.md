# Instruksi Update Webhook Handler CRM-DADI

## Apa yang berubah?

WA API sekarang mengirim **field baru** di webhook payload: `contact_name` dan perbaikan `phone_number` yang sebelumnya `null`.

---

## Struktur Webhook Payload Terbaru

### Event: `message.received` (pesan masuk)

```json
{
  "id": "3EB03A325432E275381096",
  "from": "6289630096698@s.whatsapp.net",
  "chat_jid": "6289630096698@s.whatsapp.net",
  "sender_jid": "6289630096698@s.whatsapp.net",
  "phone_number": "6289630096698",
  "contact_name": "Rifal",
  "direction": "INCOMING",
  "type": "text",
  "content": "nggeh mas",
  "timestamp": 1771133789
}
```

### Event: `message.received` (pesan masuk - GAMBAR/MEDIA)

```json
{
  "id": "3EB0F12A8E4C9B2D76108A",
  "from": "6289630096698@s.whatsapp.net",
  "chat_jid": "6289630096698@s.whatsapp.net",
  "sender_jid": "6289630096698@s.whatsapp.net",
  "phone_number": "6289630096698",
  "contact_name": "Rifal",
  "direction": "INCOMING",
  "type": "image",
  "content": "foto produk",
  "media_url": "http://localhost:3001/media/5f571cb4-9f44-49cb-b812-da23430b7da5/a1b2c3d4-e5f6.jpg",
  "timestamp": 1771133800
}
```

> **`media_url`** hanya ada jika pesan bertipe media (image/video/audio/document/sticker).
> URL ini menggunakan endpoint publik `/media/` — bisa diakses langsung tanpa autentikasi.
> Filename menggunakan UUID v4 (unguessable) sebagai capability URL.

### Event: `message.sent` (pesan keluar)

```json
{
  "id": "AC8E134AFB3733D39CA6F2E9503293B0",
  "from": "6289630096698@s.whatsapp.net",
  "chat_jid": "6289630096698@s.whatsapp.net",
  "sender_jid": "",
  "phone_number": "6289630096698",
  "contact_name": null,
  "direction": "OUTGOING",
  "type": "text",
  "content": "mas rifal",
  "timestamp": 1771133700
}
```

### Event: `connection.connected`

```json
{
  "status": "CONNECTED",
  "phone_number": "6282119499306",
  "wa_display_name": "Adi Syahadi"
}
```

### Event: `connection.disconnected`

```json
{
  "status": "DISCONNECTED"
}
```

---

## Yang Perlu Diupdate di CRM-DADI

### 1. Ambil nama kontak dari field `contact_name`

Di webhook handler (`/api/webhook/wa`), tambahkan:

```php
// Laravel
$contactName = $request->input('contact_name'); // "Rifal", "Adi Syahadi", dll
$phoneNumber = $request->input('phone_number'); // "6289630096698"
```

### 2. Simpan/update nama kontak di database CRM

```php
// Saat terima pesan masuk, update nama kontak jika ada
if ($contactName) {
    Contact::updateOrCreate(
        ['phone_number' => $phoneNumber],
        ['name' => $contactName]
    );
}
```

### 3. Tampilkan nama di UI chat

```php
// Saat render chat list atau chat detail
$displayName = $contact->name ?? $contact->phone_number;
```

---

## Daftar Semua Field Webhook Message

| Field          | Tipe          | Keterangan                                              |
| -------------- | ------------- | ------------------------------------------------------- |
| `id`           | string        | ID pesan WhatsApp                                       |
| `from`         | string        | JID pengirim (format WhatsApp internal)                 |
| `chat_jid`     | string        | JID chat                                                |
| `sender_jid`   | string        | JID pengirim (kosong untuk pesan keluar)                |
| `phone_number` | string / null | **Nomor telepon bersih** (misal `6289630096698`)        |
| `contact_name` | string / null | **BARU — Nama profil WhatsApp** pengirim                |
| `direction`    | string        | `INCOMING` atau `OUTGOING`                              |
| `type`         | string        | `text`, `image`, `video`, `document`, `audio`, `sticker`|
| `content`      | string        | Isi pesan / caption                                     |
| `media_url`    | string / null | **BARU — URL file media** (hanya untuk tipe media)      |
| `timestamp`    | number        | Unix timestamp (detik)                                  |

---

## Daftar Event Types

| Event                      | Kapan dikirim                  |
| -------------------------- | ------------------------------ |
| `message.received`         | Ada pesan masuk                |
| `message.sent`             | Ada pesan keluar               |
| `message.delivered`        | Pesan terkirim (centang 2)     |
| `message.read`             | Pesan dibaca (centang biru)    |
| `connection.connected`     | WhatsApp terhubung             |
| `connection.disconnected`  | WhatsApp terputus              |

---

## Handling Media di CRM (Sticker, Gambar, Video, Audio, Dokumen)

### Masalah Umum

Kalau CRM hanya menampilkan teks `"[Sticker]"` atau `"[Media]"`, itu karena CRM menampilkan field `content` secara literal. Field `content` untuk media hanya berisi **placeholder text** (deskripsi/caption), bukan media itu sendiri.

**Yang benar**: cek field `type`, lalu render dari `media_url`.

### Contoh Payload Sticker

```json
{
  "id": "3EB0A1B2C3D4E5F6789012",
  "from": "6289630096698@s.whatsapp.net",
  "chat_jid": "6289630096698@s.whatsapp.net",
  "sender_jid": "6289630096698@s.whatsapp.net",
  "phone_number": "6289630096698",
  "contact_name": "Rifal",
  "direction": "INCOMING",
  "type": "sticker",
  "content": "[Sticker]",
  "media_url": "http://localhost:3001/media/5f571cb4-9f44-49cb-b812-da23430b7da5/media_1739618220.webp",
  "timestamp": 1739618220
}
```

### Cara Render Tiap Tipe Media

| `type`     | Format file        | Cara tampilkan di CRM                          |
| ---------- | ------------------ | ---------------------------------------------- |
| `text`     | —                  | Tampilkan `content` sebagai teks biasa          |
| `image`    | `.jpg/.png/.gif`   | `<img src="media_url">`                         |
| `sticker`  | `.webp`            | `<img src="media_url">` (max 128x128px)         |
| `video`    | `.mp4/.mov`        | `<video>` player atau link download             |
| `audio`    | `.ogg/.mp3/.m4a`   | `<audio>` player                                |
| `document` | `.pdf/.docx/.xlsx` | Link download dengan nama file                  |

### Implementasi di Laravel (Blade)

```php
{{-- Di webhook controller, simpan type dan media_url ke database --}}
{{-- Contoh: $message->type, $message->media_url, $message->content --}}

@switch($message->type)
    @case('text')
        <p>{{ $message->content }}</p>
        @break

    @case('image')
        @if($message->media_url)
            <img src="{{ $message->media_url }}" alt="Image" style="max-width: 300px; border-radius: 8px;" />
            @if($message->content && $message->content !== '[Image]')
                <p class="caption">{{ $message->content }}</p>
            @endif
        @endif
        @break

    @case('sticker')
        @if($message->media_url)
            <img src="{{ $message->media_url }}" alt="Sticker"
                 style="max-width: 128px; max-height: 128px;" />
        @endif
        @break

    @case('video')
        @if($message->media_url)
            <video controls style="max-width: 300px; border-radius: 8px;">
                <source src="{{ $message->media_url }}" type="video/mp4">
            </video>
            @if($message->content && $message->content !== '[Video]')
                <p class="caption">{{ $message->content }}</p>
            @endif
        @endif
        @break

    @case('audio')
        @if($message->media_url)
            <audio controls>
                <source src="{{ $message->media_url }}">
            </audio>
        @endif
        @break

    @case('document')
        @if($message->media_url)
            <a href="{{ $message->media_url }}" target="_blank" download>
                📄 {{ $message->content ?: 'Download Document' }}
            </a>
        @endif
        @break

    @default
        <p>{{ $message->content }}</p>
@endswitch
```

### Implementasi di Laravel (Controller/Webhook Handler)

```php
// app/Http/Controllers/WebhookController.php

public function handleWhatsApp(Request $request)
{
    $data = $request->all();

    // Simpan ke database — PASTIKAN simpan type DAN media_url
    Message::create([
        'wa_message_id' => $data['id'],
        'phone_number'  => $data['phone_number'],
        'contact_name'  => $data['contact_name'] ?? null,
        'direction'     => $data['direction'],
        'type'          => $data['type'],         // ← PENTING: simpan type
        'content'       => $data['content'],
        'media_url'     => $data['media_url'] ?? null, // ← PENTING: simpan media_url
        'timestamp'     => $data['timestamp'],
    ]);

    return response()->json(['status' => 'ok']);
}
```

### Migrasi Database (jika belum ada kolom)

```php
// Tambah kolom type dan media_url di tabel messages jika belum ada
Schema::table('messages', function (Blueprint $table) {
    $table->string('type')->default('text')->after('direction');
    $table->string('media_url')->nullable()->after('content');
});
```

### Akses Media URL

- **URL publik** — bisa diakses langsung tanpa autentikasi (GET request biasa)
- **Contoh**: `http://localhost:3001/media/{orgId}/{uuid}.webp`
- **Aman**: filename menggunakan UUID v4 (122-bit random, tidak bisa ditebak)
- **Bisa di-download** pakai `file_get_contents()` atau `Http::get()` jika perlu simpan lokal:

```php
// Optional: download dan simpan file media ke storage lokal CRM
if ($data['media_url']) {
    $fileContent = file_get_contents($data['media_url']);
    $extension = pathinfo(parse_url($data['media_url'], PHP_URL_PATH), PATHINFO_EXTENSION);
    $localPath = 'wa-media/' . Str::uuid() . '.' . $extension;
    Storage::put($localPath, $fileContent);
    // Simpan $localPath ke database sebagai backup lokal
}
```

---

## Catatan Penting

- `contact_name` bisa `null` untuk pesan keluar atau jika pengirim belum set nama profil WA
- `phone_number` sekarang sudah diperbaiki — sebelumnya `null` untuk beberapa kontak, sekarang sudah resolve
- Tidak ada perubahan di URL webhook atau event types — hanya **penambahan field baru**
- `media_url` menggunakan endpoint publik `/media/` — **tidak perlu API key atau token** untuk mengaksesnya
- Webhook URL tetap: `http://localhost:5000/api/webhook/wa`
- Method: `POST`
- Content-Type: `application/json`

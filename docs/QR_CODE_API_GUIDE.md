# QR Code API Guide — Integrasi CRM

Ada **2 cara** akses endpoint QR code, pilih sesuai kebutuhan:

| Cara | Auth | Base URL | Cocok untuk |
|------|------|----------|-------------|
| **External API (API Key)** | `X-API-Key` header | `/api/v1/...` | CRM, n8n, Zapier, integrasi external |
| **Internal API (JWT)** | `Authorization: Bearer` | `/api/whatsapp/...` | Dashboard, frontend sendiri |

---

## Cara 1: External API (API Key) — Recommended untuk CRM

### Endpoint

| Method | Endpoint | Permission | Fungsi |
|--------|----------|------------|--------|
| `POST` | `/api/v1/instances/:instanceId/connect` | `instance:write` | Mulai koneksi, generate QR |
| `GET` | `/api/v1/instances/:instanceId/qr` | `instance:read` | Ambil QR code aktif |
| `GET` | `/api/v1/instances/:instanceId/status` | `instance:read` | Cek status koneksi |

### 1. Mulai Koneksi

```
POST /api/v1/instances/:instanceId/connect
X-API-Key: wa_xxxxxxxxxxxx
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "QR_READY",
    "qr_code": "data:image/png;base64,iVBORw0KGgo...",
    "expires_in": 120
  }
}
```

**Jika sudah connected:**
```json
{
  "success": true,
  "data": {
    "status": "CONNECTED"
  }
}
```

### 2. Ambil QR Code

```
GET /api/v1/instances/:instanceId/qr
X-API-Key: wa_xxxxxxxxxxxx
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgo...",
    "expires_in": 95
  }
}
```

| Field | Type | Keterangan |
|-------|------|------------|
| `qr_code` | `string` | **Base64 Data URL** (PNG, 300x300px). Langsung pakai di `<img src="...">` |
| `expires_in` | `number` | Sisa detik sebelum QR expire |

**Error (400) — Belum connect:**
```json
{
  "success": false,
  "error": {
    "code": "QR_NOT_AVAILABLE",
    "message": "QR code not available. Instance status is DISCONNECTED. Call POST /instances/:id/connect first."
  }
}
```

**Error (400) — QR expired:**
```json
{
  "success": false,
  "error": {
    "code": "QR_EXPIRED",
    "message": "QR code expired. Call POST /instances/:id/connect to generate a new one."
  }
}
```

### 3. Cek Status

```
GET /api/v1/instances/:instanceId/status
X-API-Key: wa_xxxxxxxxxxxx
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "CONNECTED"
  }
}
```

### Kemungkinan Status

| Status | Arti |
|--------|------|
| `DISCONNECTED` | Belum terhubung |
| `CONNECTING` | Sedang proses koneksi |
| `QR_READY` | QR code siap di-scan |
| `CONNECTED` | WhatsApp terhubung |
| `BANNED` | Nomor di-ban oleh WhatsApp |

---

## Cara 2: Internal API (JWT Token)

> Untuk frontend / dashboard yang sudah login.

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/api/whatsapp/instances/:id/connect` | Mulai koneksi, generate QR |
| `GET` | `/api/whatsapp/instances/:id/qr` | Ambil QR code aktif |
| `GET` | `/api/whatsapp/instances/:id/status` | Cek status koneksi |

Sama persis response-nya, hanya auth berbeda:

```
POST /api/whatsapp/instances/:id/connect
Authorization: Bearer <JWT_TOKEN>
```

---

## Flow Integrasi untuk CRM

```
┌──────────────────────────────────────────────────────────┐
│  1. POST /api/v1/instances/:id/connect                   │
│     Header: X-API-Key: wa_xxxxxxxxxxxx                   │
│     → Trigger koneksi, dapat QR pertama                  │
│                                                          │
│  2. Tampilkan QR di CRM:                                 │
│     <img src="{qr_code}" />                              │
│                                                          │
│  3. Poll GET /api/v1/instances/:id/qr setiap 3-5 detik  │
│     → QR auto-regenerasi oleh Baileys tiap ~30 detik     │
│     → Update <img> dengan QR terbaru                     │
│                                                          │
│  4. Poll GET /api/v1/instances/:id/status tiap 3-5 detik │
│     → Kalau status = "CONNECTED", stop polling           │
│     → Tampilkan "WhatsApp Terhubung!"                    │
└──────────────────────────────────────────────────────────┘
```

### Contoh Implementasi (JavaScript / CRM)

```javascript
const API_URL = 'https://your-domain.com';
const API_KEY = 'wa_xxxxxxxxxxxx';
const instanceId = 'your-instance-uuid';

// 1. Start connection
const connectRes = await fetch(`${API_URL}/api/v1/instances/${instanceId}/connect`, {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY }
});
const { data } = await connectRes.json();

// 2. Tampilkan QR pertama
document.getElementById('qr-img').src = data.qr_code;

// 3. Poll QR + Status setiap 3 detik
const pollInterval = setInterval(async () => {
  // Cek status
  const statusRes = await fetch(`${API_URL}/api/v1/instances/${instanceId}/status`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const statusData = await statusRes.json();

  if (statusData.data.status === 'CONNECTED') {
    clearInterval(pollInterval);
    document.getElementById('qr-img').style.display = 'none';
    alert('WhatsApp Terhubung!');
    return;
  }

  // Update QR kalau masih QR_READY
  if (statusData.data.status === 'QR_READY') {
    const qrRes = await fetch(`${API_URL}/api/v1/instances/${instanceId}/qr`, {
      headers: { 'X-API-Key': API_KEY }
    });
    const qrData = await qrRes.json();
    if (qrData.success) {
      document.getElementById('qr-img').src = qrData.data.qr_code;
    }
  }
}, 3000);
```

### Contoh cURL

```bash
# 1. Connect
curl -X POST https://your-domain.com/api/v1/instances/INSTANCE_ID/connect \
  -H "X-API-Key: wa_xxxxxxxxxxxx"

# 2. Get QR
curl https://your-domain.com/api/v1/instances/INSTANCE_ID/qr \
  -H "X-API-Key: wa_xxxxxxxxxxxx"

# 3. Check status
curl https://your-domain.com/api/v1/instances/INSTANCE_ID/status \
  -H "X-API-Key: wa_xxxxxxxxxxxx"
```

---

## Cara Mendapatkan API Key

1. Login ke dashboard
2. Buka menu **API Keys**
3. Klik **Create API Key**
4. Pilih permission minimal: `instance:read` + `instance:write`
5. Simpan API key yang muncul (hanya tampil sekali)

---

## Catatan Penting

- **QR = Base64 PNG image** (Data URL), bukan text string. Langsung render di `<img src="...">`.
- **QR expire ~120 detik**, tapi Baileys auto-regenerasi tiap ~30 detik. Selalu poll untuk QR terbaru.
- **API Key** perlu permission `instance:write` untuk `connect`, dan `instance:read` untuk `qr` dan `status`.
- **Rate limit** berlaku per API key. Jangan poll terlalu cepat (3-5 detik cukup).

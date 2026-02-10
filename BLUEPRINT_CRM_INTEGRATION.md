# 🏗️ Blueprint Integrasi CRM dengan WhatsApp API

## Panduan Lengkap untuk Developer CRM

---

## 📌 Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Customer    │────▶│  WhatsApp API    │────▶│  CRM Kamu   │
│  (WhatsApp)  │◀────│  (Server ini)    │◀────│  (Backend)  │
└─────────────┘     └──────────────────┘     └─────────────┘
                     Port: 3001                              
                     Dashboard: 3000                         
```

**WhatsApp API ini adalah JEMBATAN antara WhatsApp dan CRM kamu.**
- Menerima pesan dari customer via WhatsApp
- Mengirimkan ke CRM kamu via webhook (POST request)
- CRM bisa balas pesan via REST API

---

## 🔧 Step 1: Persiapan Awal

### 1.1 Akses Dashboard
```
URL: http://{IP_SERVER}:3000
Login: (credential dari admin)
```

### 1.2 Buat API Key
1. Login dashboard
2. Klik **API Keys** di sidebar
3. Klik **Create API Key**
4. Pilih permissions yang dibutuhkan:
   - ✅ `message:read` — baca pesan
   - ✅ `message:send` — kirim pesan
   - ✅ `contact:read` — baca kontak
   - ✅ `contact:write` — buat/update kontak
   - ✅ `contact:delete` — hapus kontak
   - ✅ `instance:read` — lihat instance WA
   - ✅ `webhook:read` — lihat konfigurasi webhook
   - ✅ `webhook:write` — atur konfigurasi webhook
5. **SIMPAN API Key** — hanya muncul 1x!

### 1.3 Cek Instance WhatsApp
```http
GET http://{IP_SERVER}:3001/api/v1/instances
X-API-Key: wa_xxxxx
```
Catat `instance_id` yang statusnya `CONNECTED`.

---

## 🔧 Step 2: Setup Webhook (CRM Terima Pesan dari WA)

### 2.1 Yang Harus Kamu Buat di CRM

**Buat 1 endpoint POST di CRM kamu yang bisa menerima webhook:**

```python
# Contoh Python (Flask)
@app.route('/webhook/whatsapp', methods=['POST'])
def whatsapp_webhook():
    data = request.json
    event = data['event']
    
    if event == 'message.received':
        # Pesan masuk dari customer
        phone = data['data']['phone_number']
        message = data['data']['content']
        msg_type = data['data']['message_type']  # TEXT, IMAGE, DOCUMENT, dll
        
        # Simpan ke database CRM kamu
        save_incoming_message(phone, message, msg_type)
        
    elif event == 'message.sent':
        # Konfirmasi pesan terkirim
        pass
        
    elif event == 'message.delivered':
        # Pesan sudah dikirim ke HP customer
        pass
        
    elif event == 'message.read':
        # Pesan sudah dibaca customer
        pass
    
    return {'status': 'ok'}, 200
```

```javascript
// Contoh Node.js (Express)
app.post('/webhook/whatsapp', (req, res) => {
    const { event, data } = req.body;
    
    if (event === 'message.received') {
        const { phone_number, content, message_type, media_url } = data;
        // Simpan ke database CRM
        saveIncomingMessage({ phone_number, content, message_type, media_url });
    }
    
    res.json({ status: 'ok' });
});
```

```php
// Contoh PHP (Laravel)
Route::post('/webhook/whatsapp', function (Request $request) {
    $event = $request->input('event');
    $data = $request->input('data');
    
    if ($event === 'message.received') {
        $phone = $data['phone_number'];
        $message = $data['content'];
        // Simpan ke database CRM
        IncomingMessage::create([
            'phone' => $phone,
            'message' => $message,
            'type' => $data['message_type'],
        ]);
    }
    
    return response()->json(['status' => 'ok']);
});
```

### 2.2 Daftarkan Webhook URL

**Via API Key:**
```http
PUT http://{IP_SERVER}:3001/api/v1/webhook/config
X-API-Key: wa_xxxxx
Content-Type: application/json

{
  "instance_id": "instance-uuid-kamu",
  "url": "https://crm-kamu.com/webhook/whatsapp",
  "events": [
    "message.received",
    "message.sent",
    "message.delivered",
    "message.read"
  ],
  "secret": "rahasia-webhook-kamu-min-16-karakter"
}
```

**Atau via Dashboard:**
1. Buka Instance Settings → tab **Webhook**
2. Isi **Webhook URL** dengan URL endpoint CRM kamu
3. Pilih events yang mau diterima
4. Klik **Save Changes**

### 2.3 Format Data Webhook yang Diterima CRM

**Pesan Teks Masuk:**
```json
{
  "event": "message.received",
  "instance_id": "0190b6fe-dae2-4875-9b48-ff074e336b5c",
  "timestamp": "2026-02-10T08:30:00.000Z",
  "data": {
    "id": "msg-uuid",
    "chat_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "content": "Halo, saya mau order produk A",
    "message_type": "TEXT",
    "direction": "INCOMING",
    "status": "RECEIVED",
    "created_at": "2026-02-10T08:30:00.000Z"
  }
}
```

**Pesan Gambar/Media Masuk:**
```json
{
  "event": "message.received",
  "data": {
    "phone_number": "628123456789",
    "content": "Ini bukti transfer",
    "message_type": "IMAGE",
    "media_url": "http://{IP_SERVER}:3001/uploads/media/abc123.jpg",
    "direction": "INCOMING"
  }
}
```
> **Note:** `media_url` bisa diakses langsung (public, tanpa auth). Media otomatis dihapus setelah 30 hari.

**Status Pesan Terkirim:**
```json
{
  "event": "message.sent",
  "data": {
    "id": "msg-uuid",
    "phone_number": "628123456789",
    "content": "Terima kasih, pesanan sedang diproses",
    "status": "SENT"
  }
}
```

---

## 🔧 Step 3: CRM Kirim Pesan ke Customer via API

### 3.1 Kirim Pesan Teks
```http
POST http://{IP_SERVER}:3001/api/v1/messages/send
X-API-Key: wa_xxxxx
Content-Type: application/json

{
  "instance_id": "instance-uuid-kamu",
  "phone_number": "628123456789",
  "message": "Halo! Pesanan kamu sudah kami proses. Nomor resi: JNE1234567"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "msg-uuid",
    "status": "SENT"
  }
}
```

### 3.2 Kirim Media (Gambar/Dokumen)
```http
POST http://{IP_SERVER}:3001/api/v1/messages/send
X-API-Key: wa_xxxxx
Content-Type: application/json

{
  "instance_id": "instance-uuid-kamu",
  "phone_number": "628123456789",
  "message": "Ini invoice kamu",
  "media_url": "https://crm-kamu.com/invoices/INV-001.pdf",
  "media_type": "document"
}
```

---

## 🔧 Step 4: Manajemen Kontak

### 4.1 Buat Kontak Baru
```http
POST http://{IP_SERVER}:3001/api/v1/contacts
X-API-Key: wa_xxxxx
Content-Type: application/json

{
  "instance_id": "instance-uuid-kamu",
  "phone_number": "628123456789",
  "name": "Budi Santoso",
  "tags": ["customer", "jakarta"],
  "notes": "Customer VIP, sering order",
  "custom_fields": {
    "company": "PT Maju Jaya",
    "city": "Jakarta"
  }
}
```

### 4.2 Update Kontak
```http
PATCH http://{IP_SERVER}:3001/api/v1/contacts/{contact_id}
X-API-Key: wa_xxxxx
Content-Type: application/json

{
  "name": "Budi Santoso (VIP)",
  "tags": ["customer", "jakarta", "vip"],
  "notes": "Total order > 10 juta",
  "custom_fields": {
    "company": "PT Maju Jaya",
    "total_order": "Rp 15.000.000"
  }
}
```

### 4.3 Ambil Data Kontak
```http
GET http://{IP_SERVER}:3001/api/v1/contacts/{contact_id}
X-API-Key: wa_xxxxx
```

### 4.4 List Semua Kontak
```http
GET http://{IP_SERVER}:3001/api/v1/contacts?instance_id={id}&page=1&limit=50
X-API-Key: wa_xxxxx
```

### 4.5 Hapus Kontak
```http
DELETE http://{IP_SERVER}:3001/api/v1/contacts/{contact_id}
X-API-Key: wa_xxxxx
```

---

## 🔧 Step 5: Ambil Data Percakapan & Pesan

### 5.1 List Semua Percakapan (Grouped per Kontak)
```http
GET http://{IP_SERVER}:3001/api/v1/conversations?instance_id={id}&page=1&limit=20
X-API-Key: wa_xxxxx
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "chat_jid": "628123456789@s.whatsapp.net",
      "phone_number": "628123456789",
      "contact_name": "Budi Santoso",
      "total_messages": 45,
      "unread_count": 3,
      "last_message": {
        "content": "Kapan barangnya sampai?",
        "message_type": "TEXT",
        "direction": "INCOMING",
        "created_at": "2026-02-10T08:30:00Z"
      },
      "last_message_at": "2026-02-10T08:30:00Z"
    }
  ],
  "pagination": { "total": 23, "page": 1, "limit": 20, "total_pages": 2 }
}
```

### 5.2 Ambil Riwayat Pesan per Kontak
```http
GET http://{IP_SERVER}:3001/api/v1/messages?instance_id={id}&phone_number=628123456789&limit=50
X-API-Key: wa_xxxxx
```

### 5.3 Cari Pesan berdasarkan Keyword
```http
GET http://{IP_SERVER}:3001/api/v1/messages?instance_id={id}&search=invoice&limit=50
X-API-Key: wa_xxxxx
```

---

## 🔌 Step 6: Arsitektur Integrasi CRM

### Alur Lengkap

```
╔══════════════════════════════════════════════════════════════╗
║                    ALUR PESAN MASUK                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Customer WA  ──▶  WhatsApp API  ──webhook──▶  CRM Server   ║
║                    (port 3001)                                ║
║                                                              ║
║  1. Customer kirim pesan WA                                  ║
║  2. WhatsApp API terima & simpan                             ║
║  3. WhatsApp API kirim POST ke webhook URL CRM               ║
║  4. CRM terima data pesan (event: message.received)          ║
║  5. CRM simpan ke database, tampilkan ke agent               ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                    ALUR PESAN KELUAR                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Agent CRM  ──▶  CRM Server  ──API call──▶  WhatsApp API    ║
║                                             ──▶  Customer    ║
║                                                              ║
║  1. Agent ketik balasan di CRM                               ║
║  2. CRM call POST /api/v1/messages/send                      ║
║  3. WhatsApp API kirim pesan ke customer                     ║
║  4. WhatsApp API kirim webhook ke CRM (event: message.sent)  ║
║  5. CRM update status pesan: terkirim ✓                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### Contoh Implementasi CRM (Pseudocode)

```python
# ===== CRM BACKEND =====

# 1. TERIMA WEBHOOK (pesan masuk)
@app.post('/webhook/whatsapp')
def handle_webhook(request):
    event = request.json['event']
    data = request.json['data']
    
    if event == 'message.received':
        # Cari/buat customer di CRM
        customer = find_or_create_customer(data['phone_number'])
        
        # Simpan pesan
        save_message(
            customer_id=customer.id,
            content=data['content'],
            type=data['message_type'],
            media_url=data.get('media_url'),
            direction='incoming'
        )
        
        # Notifikasi agent CRM (via websocket/push)
        notify_agent(customer.assigned_agent, 'new_message', data)
    
    elif event == 'message.delivered':
        update_message_status(data['id'], 'delivered')
    
    elif event == 'message.read':
        update_message_status(data['id'], 'read')
    
    return {'status': 'ok'}


# 2. KIRIM PESAN (agent balas customer)
@app.post('/crm/reply')
def agent_reply(request):
    customer_id = request.json['customer_id']
    message = request.json['message']
    
    customer = get_customer(customer_id)
    
    # Kirim via WhatsApp API
    response = requests.post(
        'http://{IP_SERVER}:3001/api/v1/messages/send',
        headers={'X-API-Key': 'wa_xxxxx'},
        json={
            'instance_id': 'instance-uuid',
            'phone_number': customer.phone,
            'message': message
        }
    )
    
    if response.json()['success']:
        save_message(
            customer_id=customer.id,
            content=message,
            direction='outgoing',
            status='sent'
        )
    
    return response.json()


# 3. SINKRONISASI KONTAK
@app.post('/crm/sync-contacts')
def sync_contacts():
    # Ambil semua kontak dari WhatsApp API
    response = requests.get(
        'http://{IP_SERVER}:3001/api/v1/contacts?instance_id={id}&limit=1000',
        headers={'X-API-Key': 'wa_xxxxx'}
    )
    
    for contact in response.json()['data']:
        find_or_create_customer(
            phone=contact['phone_number'],
            name=contact['name'],
            tags=contact['tags']
        )


# 4. LOAD CHAT HISTORY
@app.get('/crm/chat/{customer_id}')
def get_chat_history(customer_id):
    customer = get_customer(customer_id)
    
    # Ambil dari WhatsApp API
    response = requests.get(
        f'http://{IP_SERVER}:3001/api/v1/messages?instance_id={{id}}&phone_number={customer.phone}&limit=100',
        headers={'X-API-Key': 'wa_xxxxx'}
    )
    
    return response.json()
```

---

## 📋 Checklist Integrasi

### Di Sisi CRM (yang perlu kamu buat):

- [ ] **Endpoint webhook** — `POST /webhook/whatsapp` untuk terima pesan masuk
- [ ] **Fungsi kirim pesan** — call `POST /api/v1/messages/send` untuk balas
- [ ] **Database table** — simpan riwayat chat
- [ ] **UI chat inbox** — tampilan untuk agent baca & balas pesan
- [ ] **Notifikasi** — alert ke agent saat ada pesan baru

### Di Sisi WhatsApp API (sudah tersedia):

- [x] Webhook otomatis kirim pesan masuk ke CRM
- [x] API kirim pesan ke customer
- [x] CRUD kontak
- [x] List percakapan grouped per kontak
- [x] Filter & search pesan
- [x] Konfigurasi webhook via API key
- [x] Auto-cleanup media (30 hari)

---

## ⚠️ Penting

### 1. Webhook URL Harus Accessible
- Webhook URL CRM harus bisa diakses dari server WhatsApp API
- Kalau development di localhost, gunakan **ngrok** atau tools serupa
- Kalau production, pastikan URL-nya public (HTTPS recommended)

### 2. Response Cepat
- Webhook endpoint harus response dalam **< 30 detik**
- Kalau perlu processing lama, terima webhook dulu (return 200), proses di background

### 3. Idempotency
- Webhook bisa di-retry kalau gagal (max 3x)
- Pastikan CRM handle duplikasi (cek message ID sebelum simpan)

### 4. Rate Limiting
- API key punya rate limit (default: 1000 req/15 menit)
- Jangan spam API, gunakan pagination

### 5. Media Files
- Media URL (`/uploads/media/...`) accessible langsung tanpa auth
- Media auto-delete setelah 30 hari
- Download & simpan ke storage CRM sendiri kalau perlu permanent

---

## 🔑 Ringkasan Endpoint yang Dipakai CRM

| Kebutuhan | Method | Endpoint | Permission |
|-----------|--------|----------|------------|
| Kirim pesan | `POST` | `/api/v1/messages/send` | `message:send` |
| Riwayat pesan | `GET` | `/api/v1/messages?phone_number=xxx` | `message:read` |
| Cari pesan | `GET` | `/api/v1/messages?search=keyword` | `message:read` |
| List percakapan | `GET` | `/api/v1/conversations` | `message:read` |
| Buat kontak | `POST` | `/api/v1/contacts` | `contact:write` |
| Update kontak | `PATCH` | `/api/v1/contacts/:id` | `contact:write` |
| Hapus kontak | `DELETE` | `/api/v1/contacts/:id` | `contact:delete` |
| Ambil kontak | `GET` | `/api/v1/contacts/:id` | `contact:read` |
| List kontak | `GET` | `/api/v1/contacts` | `contact:read` |
| List instance | `GET` | `/api/v1/instances` | `instance:read` |
| Setup webhook | `PUT` | `/api/v1/webhook/config` | `webhook:write` |
| Lihat webhook | `GET` | `/api/v1/webhook/config` | `webhook:read` |
| Hapus webhook | `DELETE` | `/api/v1/webhook/config/:instanceId` | `webhook:write` |

**Base URL:** `http://{IP_SERVER}:3001`  
**Auth Header:** `X-API-Key: wa_xxxxx`

---

## ❓ FAQ

**Q: Webhook URL diisi apa?**  
A: URL endpoint di server CRM kamu yang bisa terima POST request. Contoh: `https://crm-kamu.com/webhook/whatsapp`

**Q: Bisa pakai localhost untuk testing?**  
A: Bisa kalau CRM dan WhatsApp API di server yang sama. Kalau beda server, pakai ngrok: `ngrok http 8080` → dapat URL public.

**Q: Gimana kalau webhook gagal?**  
A: Otomatis retry 3x dengan delay 60 detik. Pastikan endpoint CRM selalu return HTTP 200.

**Q: Media (gambar/file) bisa diakses langsung?**  
A: Ya, `media_url` di webhook payload bisa diakses langsung tanpa auth. Tapi auto-delete setelah 30 hari.

**Q: Berapa pesan yang bisa dikirim?**  
A: Rate limit 1000 request/15 menit. Anti-ban delay otomatis 3-7 detik antar pesan.

**Q: Bisa multiple nomor WA?**  
A: Ya, setiap nomor = 1 instance. Bisa create banyak instance per organization.

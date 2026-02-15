# Update Fitur Baru — WA API (Feb 2026)

Dokumen ini berisi perubahan terbaru yang **mempengaruhi integrasi CRM kamu**.

---

## 1. Field Baru: `wa_display_name`

### Apa ini?
Nama profil WhatsApp (yang di-set pemilik akun di Settings → Profile) sekarang **otomatis terdeteksi** dan tersimpan di database saat instance connect.

### Dimana muncul?

**A. GET Instance (single)**
```
GET /api/whatsapp/instances/:id
```
```json
{
  "data": {
    "id": "4f408b61-...",
    "name": "Test",
    "phone_number": "6282119499306",
    "wa_display_name": "Adi Syahadi",
    "status": "CONNECTED",
    ...
  }
}
```

**B. GET Instances (list)**
```
GET /api/whatsapp/instances
```
```json
{
  "data": [
    {
      "id": "4f408b61-...",
      "name": "Test",
      "phone_number": "6282119499306",
      "wa_display_name": "Adi Syahadi",
      "status": "CONNECTED"
    }
  ]
}
```

**C. Webhook `connection.connected` payload**
```json
{
  "event": "connection.connected",
  "timestamp": "2026-02-15T...",
  "instance_id": "4f408b61-...",
  "data": {
    "status": "CONNECTED",
    "phone_number": "6282119499306",
    "wa_display_name": "Adi Syahadi"
  }
}
```

### Yang perlu diubah di CRM

Kalau CRM kamu menyimpan data dari GET instance atau webhook connection, **tambahkan field `wa_display_name`**:

```javascript
// Contoh: di webhook handler
app.post('/api/webhook/wa', (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'connection.connected') {
    // BARU: wa_display_name sekarang tersedia
    console.log('WA terhubung:', data.phone_number);
    console.log('Nama profil WA:', data.wa_display_name); // ← BARU
    
    // Simpan ke database CRM
    db.updateInstance({
      phone_number: data.phone_number,
      wa_display_name: data.wa_display_name, // ← BARU
    });
  }
  
  res.status(200).send('OK');
});
```

```javascript
// Contoh: saat ambil data instance via API
const response = await fetch('http://localhost:3001/api/whatsapp/instances/ID', {
  headers: { 'X-API-Key': 'wa_...' }
});
const { data } = await response.json();

console.log(data.wa_display_name); // "Adi Syahadi" ← BARU
console.log(data.phone_number);    // "6282119499306"
```

### Catatan
- `wa_display_name` bisa `null` kalau instance belum pernah connect
- Otomatis ter-update setiap kali instance reconnect
- Tidak perlu set manual — 100% auto-detect dari profil WA

---

## 2. Perbaikan: `phone_number` Sekarang Bersih

### Masalah lama
```json
"phone_number": "6282119499306:54"
```
Ada suffix `:54` (device ID dari WhatsApp internal). Ini bisa bikin CRM error kalau dipakai buat kirim pesan atau lookup kontak.

### Sekarang
```json
"phone_number": "6282119499306"
```
Bersih, tanpa device suffix.

### Yang perlu diubah di CRM
- **Kalau CRM kamu sudah melakukan strip `:XX` sendiri** → bisa dihapus logic strip-nya, sekarang sudah bersih dari API
- **Kalau CRM kamu menyimpan nomor as-is** → data lama yang sudah tersimpan dengan `:54` perlu di-clean:

```sql
-- Bersihkan data lama di database CRM (jika ada)
UPDATE your_table 
SET phone_number = SUBSTRING_INDEX(phone_number, ':', 1) 
WHERE phone_number LIKE '%:%';
```

```javascript
// Atau di JavaScript kalau perlu backward-compatible
function cleanPhone(phone) {
  return phone ? phone.split(':')[0] : phone;
}
```

---

## Ringkasan Perubahan

| Apa | Sebelum | Sesudah | Impact |
|-----|---------|---------|--------|
| `wa_display_name` | Tidak ada | `"Adi Syahadi"` | **Field baru** di response instance + webhook connection |
| `phone_number` | `"6282119499306:54"` | `"6282119499306"` | **Format berubah** — lebih bersih, tanpa device suffix |

### Endpoint yang terpengaruh
- `GET /api/whatsapp/instances` — ada field baru `wa_display_name`
- `GET /api/whatsapp/instances/:id` — ada field baru `wa_display_name`
- Webhook `connection.connected` — payload ada field baru `wa_display_name`
- Semua response yang return `phone_number` — sekarang tanpa `:device` suffix

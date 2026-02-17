# WAAPI-DADI — API Reference

> **WhatsApp SaaS API** — Complete REST API documentation for sending messages, managing instances, and integrations.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Base URL & Headers](#base-url--headers)
3. [Response Format](#response-format)
4. [Error Codes](#error-codes)
5. [Rate Limiting](#rate-limiting)
6. [Phone Number & JID Handling](#phone-number--jid-handling)
7. [Messaging Endpoints](#messaging-endpoints)
   - [Send Text Message](#send-text-message)
   - [Send Media Message](#send-media-message)
   - [Send Location Message](#send-location-message)
8. [Instance Management](#instance-management)
9. [Broadcast API](#broadcast-api)
10. [Contact Management](#contact-management)
11. [Webhook Integration](#webhook-integration)

---

## Authentication

All API requests require an **API Key** sent via the `X-API-Key` header.

### Generate API Key

1. Login to dashboard → **Settings** → **API Keys**
2. Click **Create New API Key**
3. Set permissions:
   - `instance:read` - Read instance status
   - `instance:write` - Create/update instances
   - `message:send` - Send messages
   - `message:read` - Read message history
   - `contact:read` - Read contacts
   - `contact:write` - Create/update contacts
   - `webhook:read` - Read webhooks
   - `webhook:write` - Create/update webhooks
4. Copy the generated key (e.g., `wa_1234567890abcdef`)

### Using API Key

```bash
curl -H "X-API-Key: wa_1234567890abcdef" \
     https://your-domain.com/api/v1/instances
```

---

## Base URL & Headers

| Environment | Base URL |
|-------------|----------|
| Local Docker | `http://localhost:3001/api/v1` |
| Production | `https://api.your-domain.com/api/v1` |

### Required Headers

```http
X-API-Key: wa_your_api_key_here
Content-Type: application/json
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "total_pages": 3
  }
}
```

---

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_001` | Unauthorized - Invalid or missing API key | 401 |
| `AUTH_002` | Forbidden - Insufficient permissions | 403 |
| `RATE_LIMIT_001` | Rate limit exceeded | 429 |
| `INSTANCE_001` | Instance not found | 404 |
| `INSTANCE_002` | Instance not connected | 400 |
| `INSTANCE_003` | Daily message limit reached | 429 |
| `VALIDATION` | Invalid request parameters | 400 |
| `BROADCAST_001` | Broadcast not found | 404 |
| `BROADCAST_002` | Cannot edit running broadcast | 400 |
| `CONTACT_001` | Contact not found | 404 |
| `WEBHOOK_001` | Webhook not found | 404 |

---

## Rate Limiting

### Per API Key Limits

- **Requests**: 100 requests per minute per API key
- **Burst**: Up to 200 requests in 1 minute (then throttled)

Rate limit headers are included in every response:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

### Per Instance Message Limits

Each WhatsApp instance has a **daily message limit** to prevent bans:

| Warming Phase | Daily Limit | Min Delay Between Messages |
|---------------|-------------|----------------------------|
| NEW (0-7 days) | 50 messages | 10 seconds |
| WARMING (8-21 days) | 200 messages | 5 seconds |
| WARMED (22-30 days) | 500 messages | 3 seconds |
| MATURE (31+ days) | 1000 messages | 2 seconds |

When daily limit is reached, the API returns:

```json
{
  "success": false,
  "error": "Daily message limit reached (50/50). Resets at midnight."
}
```

---

## Phone Number & JID Handling

### Phone Number Format

The API accepts **international format without "+" symbol**:

| Input | Normalized | JID Created |
|-------|-----------|-------------|
| `628123456789` | `628123456789` | `628123456789@s.whatsapp.net` |
| `+628123456789` | `628123456789` | `628123456789@s.whatsapp.net` |
| `0812-3456-789` | `628123456789` | `628123456789@s.whatsapp.net` |
| `08123456789` | `628123456789` | `628123456789@s.whatsapp.net` |

**Rules:**
1. Remove all non-numeric characters (`+`, `-`, spaces)
2. If starts with `0`, replace with `62` (Indonesia country code)
3. Append `@s.whatsapp.net` to create JID

### JID Types Explained

WhatsApp uses different JID formats:

#### 1. Standard JID (Phone-based)
```
628123456789@s.whatsapp.net
```
- Most common format
- Can extract phone number: `628123456789`
- Used for regular WhatsApp accounts

#### 2. LID JID (Privacy Accounts)
```
LID:1234567890abcdef@lid
```
- Used when user has **privacy settings** enabled
- **Cannot extract phone number** from LID
- Must be resolved via `batchResolveLidToPhone()` function

#### 3. Device-Linked JID
```
628123456789:54@s.whatsapp.net
```
- Has `:device_id` suffix
- Used for multi-device WhatsApp accounts
- Extract phone by removing suffix: `628123456789`

#### 4. Group JID
```
120363123456789012@g.us
```
- Group chat identifier
- Not used in direct messaging

### LID Resolution

When you receive a message from an LID JID, you cannot directly extract the phone number. The API handles this internally:

```typescript
// Internal LID resolution (automatic)
const lidToPhoneMap = await batchResolveLidToPhone(socket, [
  'LID:abc123@lid',
  'LID:def456@lid'
]);

// Result:
{
  'LID:abc123@lid': '628123456789',
  'LID:def456@lid': '628987654321'
}
```

**For broadcast send logic:**
- Store the **original JID** (whether standard or LID) in `broadcast_recipients.phone_number`
- API will use stored JID directly for sending
- No need to manually handle LID conversion

---

## Messaging Endpoints

### Send Text Message

Send a plain text message to a WhatsApp number.

**Endpoint:** `POST /api/v1/messages/send-text`

**Permission Required:** `message:send`

#### Request Body

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628123456789",
  "message": "Hello World!"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instance_id` | string (UUID) | ✅ | WhatsApp instance ID |
| `to` | string | ✅ | Phone number (e.g., `628123456789`) |
| `message` | string | ✅ | Text message content (max 4096 chars) |
| `text` | string | ❌ | Alias for `message` (backwards compatibility) |

#### Response

**Success (200 OK):**

```json
{
  "success": true,
  "data": {
    "message_id": "3EB0F2F7D8B4A1F2E5C3",
    "to": "628123456789",
    "status": "sent",
    "timestamp": "2026-02-16T12:34:56.789Z"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `message_id` | string | WhatsApp message ID (used for tracking) |
| `to` | string | Recipient phone number |
| `status` | string | Message status (`sent`) |
| `timestamp` | string (ISO 8601) | When message was sent |

**Error (400 Bad Request):**

```json
{
  "success": false,
  "error": "Instance not connected"
}
```

**Error (429 Too Many Requests):**

```json
{
  "success": false,
  "error": "Daily message limit reached (50/50). Resets at midnight."
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-text \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "message": "Hello from WAAPI!"
  }'
```

#### JavaScript Example

```javascript
const response = await fetch('http://localhost:3001/api/v1/messages/send-text', {
  method: 'POST',
  headers: {
    'X-API-Key': 'wa_your_api_key_here',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    instance_id: '550e8400-e29b-41d4-a716-446655440000',
    to: '628123456789',
    message: 'Hello from JavaScript!'
  })
});

const result = await response.json();
console.log(result.data.message_id);
```

#### Python Example

```python
import requests

response = requests.post(
    'http://localhost:3001/api/v1/messages/send-text',
    headers={
        'X-API-Key': 'wa_your_api_key_here',
        'Content-Type': 'application/json'
    },
    json={
        'instance_id': '550e8400-e29b-41d4-a716-446655440000',
        'to': '628123456789',
        'message': 'Hello from Python!'
    }
)

data = response.json()
print(data['data']['message_id'])
```

---

### Send Media Message

Send an image, video, audio, or document file.

**Endpoint:** `POST /api/v1/messages/send-media`

**Permission Required:** `message:send`

#### Request Body

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628123456789",
  "media_url": "https://example.com/image.jpg",
  "media_type": "image",
  "caption": "Check this out!"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instance_id` | string (UUID) | ✅ | WhatsApp instance ID |
| `to` | string | ✅ | Phone number |
| `media_url` | string (URL) | ✅ | Public URL of the media file |
| `media_type` | enum | ✅ | `image`, `video`, `audio`, or `document` |
| `caption` | string | ❌ | Caption text (for image/video/document, max 1024 chars) |
| `filename` | string | ❌ | Custom filename (for document type) |

#### Supported Media Types

| Type | Accepted Formats | Max Size | Caption Support |
|------|------------------|----------|-----------------|
| `image` | JPG, PNG, WEBP | 16 MB | ✅ Yes |
| `video` | MP4, MPEG, MOV, WEBM | 64 MB | ✅ Yes |
| `audio` | MP3, WAV, OGG, M4A | 16 MB | ❌ No |
| `document` | PDF, DOC, XLS, TXT, ZIP, etc. | 100 MB | ✅ Yes |

#### Security Notes

- **SSRF Protection**: API validates media URLs to prevent Server-Side Request Forgery attacks
- Blocked schemes: `file://`, `ftp://`, internal IPs (127.0.0.1, 10.x.x.x, 192.168.x.x)
- Only `http://` and `https://` URLs are allowed
- Media URL must be **publicly accessible** (no auth required)

#### Response

**Success (200 OK):**

```json
{
  "success": true,
  "data": {
    "message_id": "3EB0F2F7D8B4A1F2E5C3",
    "to": "628123456789",
    "media_type": "image",
    "status": "sent",
    "timestamp": "2026-02-16T12:34:56.789Z"
  }
}
```

**Error (400 Bad Request):**

```json
{
  "success": false,
  "error": "Invalid media URL: SSRF protection triggered"
}
```

#### cURL Examples

**Send Image:**

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-media \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "media_url": "https://example.com/promo.jpg",
    "media_type": "image",
    "caption": "Special promo just for you!"
  }'
```

**Send Document:**

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-media \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "media_url": "https://example.com/invoice.pdf",
    "media_type": "document",
    "caption": "Your invoice #12345",
    "filename": "Invoice-12345.pdf"
  }'
```

**Send Audio:**

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-media \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "media_url": "https://example.com/voice-note.mp3",
    "media_type": "audio"
  }'
```

#### JavaScript Example

```javascript
async function sendImage(instanceId, phoneNumber, imageUrl, caption) {
  const response = await fetch('http://localhost:3001/api/v1/messages/send-media', {
    method: 'POST',
    headers: {
      'X-API-Key': 'wa_your_api_key_here',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      instance_id: instanceId,
      to: phoneNumber,
      media_url: imageUrl,
      media_type: 'image',
      caption: caption
    })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Image sent! Message ID:', result.data.message_id);
  } else {
    console.error('Failed:', result.error);
  }
  
  return result;
}

// Usage
await sendImage(
  '550e8400-e29b-41d4-a716-446655440000',
  '628123456789',
  'https://example.com/product.jpg',
  'Check out this new product!'
);
```

---

### Send Location Message

Send a location pin with optional name and address.

**Endpoint:** `POST /api/v1/messages/send-location`

**Permission Required:** `message:send`

#### Request Body

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628123456789",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "name": "Jakarta",
  "address": "Jakarta, Indonesia"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `instance_id` | string (UUID) | ✅ | WhatsApp instance ID |
| `to` | string | ✅ | Phone number |
| `latitude` | number | ✅ | Latitude (-90 to 90) |
| `longitude` | number | ✅ | Longitude (-180 to 180) |
| `name` | string | ❌ | Location name/title |
| `address` | string | ❌ | Full address text |

#### Response

**Success (200 OK):**

```json
{
  "success": true,
  "data": {
    "message_id": "3EB0F2F7D8B4A1F2E5C3",
    "to": "628123456789",
    "latitude": -6.200000,
    "longitude": 106.816666,
    "status": "sent",
    "timestamp": "2026-02-16T12:34:56.789Z"
  }
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-location \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "latitude": -6.175110,
    "longitude": 106.865036,
    "name": "Monas",
    "address": "Jl. Medan Merdeka, Jakarta Pusat"
  }'
```

---

## Instance Management

### List Instances

Get all WhatsApp instances for your organization.

**Endpoint:** `GET /api/v1/instances`

**Permission Required:** `instance:read`

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Support WhatsApp",
      "phone_number": "628123456789",
      "wa_display_name": "Customer Support",
      "status": "CONNECTED",
      "is_active": true,
      "connected_at": "2026-02-15T10:30:00.000Z",
      "daily_message_count": 45,
      "daily_limit": 50,
      "warming_phase": "NEW",
      "health_score": 95,
      "created_at": "2026-02-14T08:00:00.000Z"
    }
  ]
}
```

### Get Instance Status

Check connection status of a specific instance.

**Endpoint:** `GET /api/v1/instances/:instanceId/status`

**Permission Required:** `instance:read`

#### Response

```json
{
  "success": true,
  "data": {
    "status": "CONNECTED",
    "connected_at": "2026-02-15T10:30:00.000Z",
    "phone_number": "628123456789",
    "daily_message_count": 45,
    "daily_limit": 50,
    "health_score": 95
  }
}
```

---

## Broadcast API

Complete broadcast/bulk messaging system with scheduling and progress tracking.

### Create Broadcast

**Endpoint:** `POST /api/v1/broadcasts`

**Permission Required:** `message:send`

#### Request Body

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Monthly Newsletter",
  "message_type": "text",
  "content": "Hi {{name}}, your invoice {{invoice_no}} is ready!",
  "recipient_type": "selected_tags",
  "recipient_filter": {
    "tags": ["VIP", "Premium"]
  },
  "delay_min_ms": 2000,
  "delay_max_ms": 4000,
  "scheduled_at": "2026-02-17T10:00:00Z"
}
```

#### Recipient Types

| Type | Description |
|------|-------------|
| `ALL_CONTACTS` | Send to all contacts in the instance |
| `SELECTED_TAGS` | Send to contacts with specific tags |
| `SELECTED_CONTACTS` | Send to manually selected contact IDs |
| `MANUAL` | Add recipients manually via phone numbers |

### Start Broadcast

**Endpoint:** `POST /api/v1/broadcasts/:id/start`

Starts sending messages to all recipients.

### Broadcast Stats

**Endpoint:** `GET /api/v1/broadcasts/:id/stats`

```json
{
  "success": true,
  "data": {
    "total_recipients": 1000,
    "pending": 200,
    "sent": 700,
    "delivered": 650,
    "read": 400,
    "failed": 100
  }
}
```

**See full broadcast documentation in [CRM_INTEGRATION_GUIDE.md](backend/CRM_INTEGRATION_GUIDE.md#broadcast-messaging)**

---

## Contact Management

### List Contacts

**Endpoint:** `GET /api/v1/contacts`

**Query Parameters:**

- `page` (default: 1)
- `limit` (default: 50)
- `search` - Search by name or phone
- `tags` - Filter by tags (comma-separated)
- `instance_id` - Filter by instance

### Create Contact

**Endpoint:** `POST /api/v1/contacts`

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "phone_number": "628123456789",
  "name": "John Doe",
  "notes": "VIP customer",
  "tags": ["VIP", "Premium"]
}
```

---

## Webhook Integration

### Create Webhook

**Endpoint:** `POST /api/v1/webhooks`

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://your-crm.com/webhook/whatsapp",
  "events": ["message.received", "message.sent"],
  "is_active": true
}
```

### Webhook Events

| Event | Description |
|-------|-------------|
| `message.received` | Incoming message from customer |
| `message.sent` | Message sent successfully |
| `message.delivered` | Message delivered to recipient |
| `message.read` | Message read by recipient |
| `message.failed` | Message failed to send |
| `instance.connected` | Instance connected to WhatsApp |
| `instance.disconnected` | Instance disconnected |
| `qr_code.updated` | New QR code generated |

### Webhook Payload Example

```json
{
  "event": "message.received",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "message_id": "3EB0F2F7D8B4A1F2E5C3",
    "from": "628123456789",
    "message_type": "text",
    "content": "Hello, I need help",
    "timestamp": "2026-02-16T12:34:56.789Z"
  }
}
```

**See full webhook documentation in [CRM_INTEGRATION_GUIDE.md](backend/CRM_INTEGRATION_GUIDE.md#webhooks)**

---

## Common Use Cases

### 1. Send Transactional Message (OTP, Invoice)

```bash
# Send OTP
curl -X POST http://localhost:3001/api/v1/messages/send-text \
  -H "X-API-Key: wa_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "message": "Your OTP code is: 123456. Valid for 5 minutes."
  }'
```

### 2. Send Marketing Campaign with Image

```bash
curl -X POST http://localhost:3001/api/v1/messages/send-media \
  -H "X-API-Key: wa_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628123456789",
    "media_url": "https://cdn.yoursite.com/promo-feb.jpg",
    "media_type": "image",
    "caption": "🎉 Big Sale Feb 2026! Discount up to 70%. Click link: https://shop.com/sale"
  }'
```

### 3. Bulk Send to Multiple Contacts (Broadcast)

```javascript
// Step 1: Create broadcast
const createResponse = await fetch('http://localhost:3001/api/v1/broadcasts', {
  method: 'POST',
  headers: {
    'X-API-Key': 'wa_your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    instance_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Product Launch Announcement',
    message_type: 'text',
    content: 'Hi {{name}}, check out our new product!',
    recipient_type: 'selected_tags',
    recipient_filter: { tags: ['customer'] },
    delay_min_ms: 2000,
    delay_max_ms: 4000
  })
});

const broadcast = await createResponse.json();
const broadcastId = broadcast.data.id;

// Step 2: Start broadcast
await fetch(`http://localhost:3001/api/v1/broadcasts/${broadcastId}/start`, {
  method: 'POST',
  headers: { 'X-API-Key': 'wa_your_api_key' }
});

// Step 3: Monitor progress
const statsResponse = await fetch(`http://localhost:3001/api/v1/broadcasts/${broadcastId}/stats`, {
  headers: { 'X-API-Key': 'wa_your_api_key' }
});

const stats = await statsResponse.json();
console.log(`Sent: ${stats.data.sent}/${stats.data.total_recipients}`);
```

---

## Testing & Development

### Postman Collection

Import the API into Postman:

1. Download: [WAAPI-Postman-Collection.json](./postman/WAAPI-Collection.json) *(to be created)*
2. Import into Postman
3. Set environment variable `api_key` to your API key
4. Set `base_url` to `http://localhost:3001/api/v1`

### Test with cURL

```bash
# Health check
curl http://localhost:3001/health

# List instances
curl -H "X-API-Key: wa_your_key" http://localhost:3001/api/v1/instances

# Send test message
curl -X POST http://localhost:3001/api/v1/messages/send-text \
  -H "X-API-Key: wa_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "your-instance-id",
    "to": "your-phone-number",
    "message": "Test message"
  }'
```

---

## API Limits & Best Practices

### Message Sending Best Practices

1. **Respect warming phases**: Don't send too many messages when instance is NEW (0-7 days)
2. **Add delays**: Use 2-5 second delays between messages to avoid spam detection
3. **Monitor health score**: If health score drops below 70, reduce sending rate
4. **Handle errors gracefully**: Implement retry logic with exponential backoff

### Optimal Broadcast Settings

```json
{
  "delay_min_ms": 3000,
  "delay_max_ms": 5000
}
```

- Randomized delays make sending look more human
- 3-5 seconds is safe for most accounts
- NEW accounts: use 10+ seconds delay

### Error Handling Pattern

```javascript
async function sendMessageWithRetry(payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('http://localhost:3001/api/v1/messages/send-text', {
        method: 'POST',
        headers: {
          'X-API-Key': 'wa_your_key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        return result;
      }

      // Handle specific errors
      if (result.error === 'Daily message limit reached') {
        console.log('Limit reached, stopping...');
        break; // Don't retry for daily limit
      }

      if (result.error === 'Instance not connected') {
        console.log('Instance offline, waiting 30s...');
        await sleep(30000);
        continue; // Retry after wait
      }

      throw new Error(result.error);

    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`Retry ${attempt}/${maxRetries} in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }
}
```

---

## Troubleshooting

### "Instance not connected"

**Cause**: WhatsApp instance is disconnected.

**Solution:**
1. Check instance status: `GET /api/v1/instances/:id/status`
2. If status is `DISCONNECTED` or `QR_READY`, scan QR code in dashboard
3. Wait for status to become `CONNECTED`

### "Daily message limit reached"

**Cause**: Instance has reached daily sending limit.

**Solution:**
1. Wait until midnight (limit resets daily)
2. Or upgrade instance warming phase (send consistently for 30+ days to reach MATURE phase with 1000/day limit)
3. Or use multiple instances and distribute load

### "Invalid media URL"

**Causes:**
- SSRF protection triggered (private IP, localhost, file://)
- URL is not publicly accessible (requires authentication)
- Media file is too large

**Solution:**
1. Use publicly accessible HTTPS URL
2. Check file size limits (image: 16MB, video: 64MB, document: 100MB)
3. Host media on CDN or cloud storage (S3, Google Cloud Storage)

### Rate Limit Errors

**Cause**: Sending too many API requests (>100/min per API key).

**Solution:**
1. Add delay between API calls
2. Use batch operations where available
3. Cache instance status instead of polling frequently
4. Implement exponential backoff retry logic

---

## Support & Resources

- **Docker Deployment**: See [DOCKER-DEPLOY.md](./DOCKER-DEPLOY.md)
- **CRM Integration**: See [CRM_INTEGRATION_GUIDE.md](./backend/CRM_INTEGRATION_GUIDE.md)
- **GitHub Repository**: https://github.com/AdiSyahadi/WAAPI-DADI.git
- **Issues & Bug Reports**: GitHub Issues
- **Production Setup**: See [DOCKER-DEPLOY.md](./DOCKER-DEPLOY.md#deploy-di-vps--server-production)

---

*Last updated: February 2026*
*API Version: 1.0*

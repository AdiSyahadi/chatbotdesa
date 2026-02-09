# 📡 WhatsApp SaaS API - CRM Integration Guide

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Quick Start](#quick-start)
- [API Endpoints Reference](#api-endpoints-reference)
- [Webhooks](#webhooks)
- [Best Practices](#best-practices)
- [Code Examples](#code-examples)
- [Common Integration Patterns](#common-integration-patterns)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

---

## Overview

### What is this API?

The WhatsApp SaaS API provides a REST interface to send and receive WhatsApp messages programmatically using the unofficial Baileys library. Built on Fastify with TypeScript, it's designed for CRM, automation tools, and custom integrations.

### Main Use Cases

- **Customer Communication**: Send transactional messages, notifications, and marketing campaigns
- **Two-Way Chat**: Build chatbots and interactive customer service flows
- **Broadcast Messaging**: Send bulk messages to multiple contacts with rate limiting
- **CRM Integration**: Connect with n8n, Make, Zapier, or custom systems
- **WhatsApp Automation**: Automate replies, contact management, and workflow triggers

### Key Features

✅ Multiple WhatsApp instances per organization  
✅ Send text, media (image/video/audio/document), and location messages  
✅ Receive incoming messages via webhooks  
✅ Contact and tag management  
✅ Broadcast campaigns with scheduled delivery  
✅ Webhook auto-reply (respond to incoming messages via webhook response)  
✅ Rate limiting and anti-ban protection  
✅ Message warming phases for new accounts  
✅ API key-based authentication for external integrations  

### Base URL

```
Production: https://your-domain.com/api/v1
Development: http://localhost:3001/api/v1
```

---

## Authentication

### Authentication Methods

The API supports two authentication methods:

1. **JWT Bearer Token** (for frontend/dashboard)
2. **API Key** (for external integrations - **RECOMMENDED**)

### Getting an API Key

#### Step 1: Create an API Key via Dashboard

```bash
POST /api/api-keys
Authorization: Bearer <your_jwt_token>
Content-Type: application/json

{
  "name": "My CRM Integration",
  "permissions": [
    "message:send",
    "message:read",
    "contact:read",
    "contact:write",
    "instance:read"
  ],
  "rate_limit": 1000,
  "expires_at": "2027-12-31T23:59:59Z"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "apikey-uuid-here",
    "name": "My CRM Integration",
    "key_prefix": "wa_5f8a2",
    "api_key": "wa_5f8a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z",
    "permissions": ["message:send", "message:read", ...],
    "rate_limit": 1000,
    "is_active": true,
    "created_at": "2026-02-09T10:00:00Z"
  },
  "message": "API key created successfully. Please save the api_key value - it will only be shown once!"
}
```

⚠️ **IMPORTANT**: The full `api_key` value is only shown once. Store it securely!

#### Step 2: Use the API Key

Add the API key to the `X-API-Key` header in all requests:

```bash
curl -H "X-API-Key: wa_5f8a2b3c4d5e6f..." \
     https://your-domain.com/api/v1/health
```

### Available Permissions

| Permission | Description |
|-----------|-------------|
| `instance:read` | View WhatsApp instances |
| `instance:write` | Create/update instances |
| `instance:delete` | Delete instances |
| `message:send` | Send messages |
| `message:read` | Read message history |
| `contact:read` | View contacts |
| `contact:write` | Create/update contacts |
| `contact:delete` | Delete contacts |
| `broadcast:read` | View broadcasts |
| `broadcast:write` | Create/send broadcasts |
| `broadcast:delete` | Delete broadcasts |
| `webhook:read` | View webhook config |
| `webhook:write` | Configure webhooks |
| `full_access` | All permissions |

### Rate Limiting

Each API key has a configurable rate limit (10-10,000 requests/hour). The default is 1,000 requests/hour.

Rate limit headers are returned in responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1675234567
```

---

## Quick Start

### 1. Get Your WhatsApp Instance ID

List your instances to get the `instance_id`:

```bash
curl -X GET "https://your-domain.com/api/v1/instances" \
  -H "X-API-Key: wa_your_api_key_here"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "My WhatsApp",
      "phone_number": "628123456789",
      "status": "CONNECTED",
      "is_active": true,
      "created_at": "2026-02-01T10:00:00Z"
    }
  ]
}
```

### 2. Check Instance Status

```bash
curl -X GET "https://your-domain.com/api/v1/instances/{instance_id}/status" \
  -H "X-API-Key: wa_your_api_key_here"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "CONNECTED",
    "phone_number": "628123456789",
    "is_online": true,
    "connected_at": "2026-02-09T08:00:00Z"
  }
}
```

### 3. Send Your First Message

```bash
curl -X POST "https://your-domain.com/api/v1/messages/send-text" \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628987654321",
    "message": "Hello from WhatsApp API!"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message_id": "msg_abc123",
    "wa_message_id": "3EB0XXXXXXXXXXXXX",
    "status": "SENT",
    "timestamp": "2026-02-09T10:30:00Z"
  }
}
```

✅ **Done!** You've sent your first WhatsApp message via the API.

---

## API Endpoints Reference

### Instance Management

#### List Instances

```http
GET /api/v1/instances
```

**Query Parameters:**
- None required

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Customer Service",
      "phone_number": "628123456789",
      "status": "CONNECTED",
      "is_active": true,
      "health_score": 95,
      "daily_message_count": 45,
      "daily_limit": 500,
      "warming_phase": "STABLE",
      "created_at": "2026-02-01T10:00:00Z"
    }
  ]
}
```

#### Get Instance Status

```http
GET /api/v1/instances/:instanceId/status
```

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "CONNECTED",
    "phone_number": "628123456789",
    "is_online": true,
    "qr_code": null,
    "connected_at": "2026-02-09T08:00:00Z",
    "last_seen": "2026-02-09T10:29:00Z"
  }
}
```

---

### Messaging Endpoints

#### Send Text Message

```http
POST /api/v1/messages/send-text
```

**Permission:** `message:send`

**Request Body:**

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628987654321",
  "message": "Hello! Your order #12345 has been shipped."
}
```

**Phone Number Format:**
- Use international format without `+` or `-`
- Indonesia: `628123456789` (not `+62-812-3456-789`)
- US: `14155552671` (not `+1-415-555-2671`)

**Response:**

```json
{
  "success": true,
  "data": {
    "message_id": "msg_abc123",
    "wa_message_id": "3EB0XXXXXXXXXXXXX",
    "status": "SENT",
    "timestamp": "2026-02-09T10:30:00Z"
  }
}
```

#### Send Media Message

```http
POST /api/v1/messages/send-media
```

**Permission:** `message:send`

**Request Body:**

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628987654321",
  "media_url": "https://example.com/images/product.jpg",
  "media_type": "image",
  "caption": "Check out our new product!"
}
```

**Media Types:**
- `image` - JPG, PNG (max 5MB, recommended < 1MB)
- `video` - MP4 (max 16MB, recommended < 5MB)
- `audio` - MP3, OGG (max 16MB)
- `document` - PDF, DOCX, etc. (max 100MB)

**For Documents:**

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628987654321",
  "media_url": "https://example.com/invoice-12345.pdf",
  "media_type": "document",
  "filename": "Invoice_12345.pdf",
  "caption": "Your invoice is attached"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message_id": "msg_def456",
    "wa_message_id": "3EB0YYYYYYYYYY",
    "status": "SENT",
    "media_type": "image",
    "timestamp": "2026-02-09T10:31:00Z"
  }
}
```

#### Send Location

```http
POST /api/v1/messages/send-location
```

**Permission:** `message:send`

**Request Body:**

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "628987654321",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "name": "Our Store",
  "address": "Jl. Sudirman No. 123, Jakarta"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "message_id": "msg_ghi789",
    "wa_message_id": "3EB0ZZZZZZZZZ",
    "status": "SENT",
    "timestamp": "2026-02-09T10:32:00Z"
  }
}
```

#### Get Message History

```http
GET /api/v1/messages
```

**Permission:** `message:read`

**Query Parameters:**
- `instance_id` (optional) - Filter by instance
- `direction` (optional) - `INCOMING` or `OUTGOING`
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Example:**

```bash
curl "https://your-domain.com/api/v1/messages?instance_id=550e8400-e29b-41d4-a716-446655440000&direction=INCOMING&limit=50" \
  -H "X-API-Key: wa_your_api_key_here"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "msg_123",
      "instance_id": "550e8400-e29b-41d4-a716-446655440000",
      "direction": "INCOMING",
      "chat_jid": "628987654321@s.whatsapp.net",
      "sender_jid": "628987654321@s.whatsapp.net",
      "message_type": "text",
      "content": "Hello, I need help",
      "status": "RECEIVED",
      "timestamp": "2026-02-09T10:25:00Z",
      "wa_message_id": "3EB0AAAAAAAAA"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "total_pages": 3
  }
}
```

---

### Contact Management

#### List Contacts

```http
GET /api/v1/contacts
```

**Permission:** `contact:read`

**Query Parameters:**
- `instance_id` (optional) - Filter by instance
- `search` (optional) - Search by name or phone
- `page` (default: 1)
- `limit` (default: 20)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "contact_abc",
      "instance_id": "550e8400-e29b-41d4-a716-446655440000",
      "phone_number": "628987654321",
      "name": "John Doe",
      "notes": "VIP customer",
      "tags": ["customer", "vip"],
      "last_message_at": "2026-02-09T10:25:00Z",
      "created_at": "2026-02-01T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 250,
    "page": 1,
    "limit": 20,
    "total_pages": 13
  }
}
```

#### Create Contact

```http
POST /api/v1/contacts
```

**Permission:** `contact:write`

**Request Body:**

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "phone_number": "628987654321",
  "name": "Jane Smith",
  "notes": "Contacted via website form",
  "tags": ["lead", "website"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "contact_xyz",
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "phone_number": "628987654321",
    "name": "Jane Smith",
    "notes": "Contacted via website form",
    "tags": ["lead", "website"],
    "created_at": "2026-02-09T10:35:00Z"
  }
}
```

---

### Health Check

#### Verify API Key

```http
GET /api/v1/health
```

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "api_key_id": "apikey_123",
    "organization_id": "org_456",
    "permissions": ["message:send", "message:read", "contact:read"],
    "rate_limit": 1000,
    "timestamp": "2026-02-09T10:36:00Z"
  }
}
```

---

## Webhooks

### What are Webhooks?

Webhooks allow you to receive real-time notifications when events occur (incoming messages, connection status changes, etc.). Your server receives HTTP POST requests with event data.

### Supported Event Types

| Event | Description |
|-------|-------------|
| `message.received` | New incoming message |
| `message.sent` | Message sent successfully |
| `message.delivered` | Message delivered to recipient |
| `message.read` | Message read by recipient |
| `message.failed` | Message send failed |
| `connection.connected` | Instance connected |
| `connection.disconnected` | Instance disconnected |
| `connection.qr_update` | QR code updated |
| `contact.created` | New contact created |
| `contact.updated` | Contact updated |
| `broadcast.started` | Broadcast started |
| `broadcast.completed` | Broadcast completed |
| `broadcast.failed` | Broadcast failed |

### Configuring Webhooks

You configure webhooks per WhatsApp instance via the dashboard or API (requires JWT auth, not API key):

```http
PUT /api/webhooks/config
Authorization: Bearer <jwt_token>
```

**Request Body:**

```json
{
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "webhook_url": "https://your-server.com/webhooks/whatsapp",
  "webhook_events": [
    "message.received",
    "message.sent",
    "connection.connected",
    "connection.disconnected"
  ],
  "webhook_secret": "your_random_secret_string_here"
}
```

### Webhook Payload Structure

All webhooks follow this structure:

```json
{
  "event": "message.received",
  "timestamp": "2026-02-09T10:40:00Z",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "org_456",
  "data": {
    // Event-specific data
  }
}
```

### Event Payload Examples

#### `message.received` - Incoming Message

```json
{
  "event": "message.received",
  "timestamp": "2026-02-09T10:40:00Z",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "org_456",
  "data": {
    "message_id": "msg_incoming_123",
    "wa_message_id": "3EB0BBBBBBBBBBB",
    "from": "628987654321@s.whatsapp.net",
    "chat_jid": "628987654321@s.whatsapp.net",
    "sender_jid": "628987654321@s.whatsapp.net",
    "message_type": "text",
    "content": "I need help with my order",
    "timestamp": "2026-02-09T10:40:00Z",
    "status": "RECEIVED"
  }
}
```

#### `message.received` - Image with Caption

```json
{
  "event": "message.received",
  "timestamp": "2026-02-09T10:41:00Z",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "org_456",
  "data": {
    "message_id": "msg_incoming_124",
    "wa_message_id": "3EB0CCCCCCCCCCC",
    "from": "628987654321@s.whatsapp.net",
    "chat_jid": "628987654321@s.whatsapp.net",
    "sender_jid": "628987654321@s.whatsapp.net",
    "message_type": "image",
    "content": "Here's a photo of the issue",
    "media_url": "https://your-domain.com/storage/media/xyz.jpg",
    "timestamp": "2026-02-09T10:41:00Z",
    "status": "RECEIVED"
  }
}
```

#### `connection.connected`

```json
{
  "event": "connection.connected",
  "timestamp": "2026-02-09T11:00:00Z",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "org_456",
  "data": {
    "status": "CONNECTED",
    "phone_number": "628123456789"
  }
}
```

#### `connection.disconnected`

```json
{
  "event": "connection.disconnected",
  "timestamp": "2026-02-09T11:30:00Z",
  "instance_id": "550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "org_456",
  "data": {
    "status": "DISCONNECTED",
    "reason": "Connection lost"
  }
}
```

### Webhook Auto-Reply Feature

**Powerful feature**: If your webhook endpoint returns a JSON response with a `message` field when receiving `message.received` events, the API will automatically send that as a reply to the sender.

**Example Webhook Response:**

```json
{
  "message": "Thank you for contacting us! We'll respond shortly."
}
```

**Supported response keys:**
- `message`
- `text`
- `reply`
- `output`

Or return plain text (non-HTML, non-JSON).

This enables **zero-code auto-responders** using n8n, Make, or Zapier!

### Webhook Delivery & Retries

- **Timeout**: 30 seconds
- **Retry Policy**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Success**: HTTP status 200-299
- **Failure**: Any other status or timeout

Webhook delivery logs are stored and can be viewed via the dashboard.

---

## Best Practices

### 1. Rate Limiting

**Per Instance Limits:**

WhatsApp doesn't publish official rate limits, but based on real-world usage:

- **New accounts (< 7 days)**: 20-50 messages/day
- **Warming phase (7-30 days)**: 100-300 messages/day
- **Established accounts (> 30 days)**: 500-1000+ messages/day

**API enforces warming phases:**

| Phase | Days | Daily Limit | Hourly Limit |
|-------|------|-------------|--------------|
| `NEW` | 0-7 | 50 | 10 |
| `WARMING_UP` | 7-14 | 150 | 20 |
| `GROWING` | 14-30 | 300 | 40 |
| `STABLE` | 30+ | 1000 | 100 |

**Best Practices:**
- Start slow with new numbers
- Gradually increase volume over 30 days
- Spread messages evenly throughout the day
- Use delays between messages (3-10 seconds)

### 2. Error Handling

Always check the `success` field and handle errors gracefully:

```python
response = requests.post(url, json=payload, headers=headers)
data = response.json()

if data.get('success'):
    print(f"Message sent: {data['data']['message_id']}")
else:
    error = data.get('error', {})
    print(f"Error {error.get('code')}: {error.get('message')}")
    
    # Handle specific errors
    if error.get('code') == 'MESSAGE_004':
        # Daily limit reached - wait and retry tomorrow
        schedule_retry_tomorrow(payload)
```

**Common Error Codes:**

| Code | Meaning | Action |
|------|---------|--------|
| `INSTANCE_003` | Not connected | Check QR code, reconnect |
| `MESSAGE_002` | Invalid number | Validate phone format |
| `MESSAGE_004` | Daily limit reached | Queue for tomorrow |
| `MESSAGE_005` | Rate limit exceeded | Slow down, add delays |
| `AUTH_002` | Token expired | Refresh API key |

### 3. Anti-Ban Strategies

🚫 **Avoid These:**
- Sending identical messages to many people (looks like spam)
- No delays between messages
- Messaging users who never replied
- Not warming up new accounts
- Using URL shorteners
- Sending promotional content 24/7

✅ **Do These:**
- Personalize each message (use name, order ID, etc.)
- Add random delays (3-10 seconds)
- Only message engaged users
- Follow warming phase limits
- Use full URLs or branded links
- Respect business hours (9am-9pm)
- Let users opt-out easily

### 4. Message Queuing

For high-volume sending, use a queue system:

```python
# Pseudocode
queue = []

# Add messages to queue
for customer in customers:
    queue.append({
        'to': customer.phone,
        'message': f"Hi {customer.name}, your order {customer.order_id} is ready!"
    })

# Process queue with delays
for msg in queue:
    send_message(msg)
    time.sleep(random.randint(5, 15))  # Random delay
    
    # Check daily limit
    if messages_sent_today >= daily_limit:
        save_remaining_to_queue()
        schedule_resume_tomorrow()
        break
```

### 5. Monitoring & Health Checks

Monitor instance health regularly:

```bash
curl -X GET "https://your-domain.com/api/v1/instances/{instance_id}/status" \
  -H "X-API-Key: wa_your_key"
```

Check these metrics:
- `status`: Should be `CONNECTED`
- `is_online`: Should be `true`
- `health_score`: Should be > 80
- `daily_message_count`: Track usage
- `last_seen`: Recent activity

Set up alerts if:
- Instance disconnects
- Health score drops below 70
- Messages fail repeatedly

---

## Code Examples

### Node.js (JavaScript)

```javascript
const axios = require('axios');

const API_URL = 'https://your-domain.com/api/v1';
const API_KEY = 'wa_your_api_key_here';
const INSTANCE_ID = '550e8400-e29b-41d4-a716-446655440000';

async function sendMessage(to, message) {
  try {
    const response = await axios.post(
      `${API_URL}/messages/send-text`,
      {
        instance_id: INSTANCE_ID,
        to: to,
        message: message
      },
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Message sent:', response.data.data.message_id);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
sendMessage('628987654321', 'Hello from Node.js!');
```

**Send Media:**

```javascript
async function sendImage(to, imageUrl, caption) {
  const response = await axios.post(
    `${API_URL}/messages/send-media`,
    {
      instance_id: INSTANCE_ID,
      to: to,
      media_url: imageUrl,
      media_type: 'image',
      caption: caption
    },
    {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

sendImage(
  '628987654321',
  'https://example.com/product.jpg',
  'Check out our new product!'
);
```

### Python

```python
import requests
import time

API_URL = 'https://your-domain.com/api/v1'
API_KEY = 'wa_your_api_key_here'
INSTANCE_ID = '550e8400-e29b-41d4-a716-446655440000'

headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
}

def send_message(to, message):
    """Send a text message"""
    payload = {
        'instance_id': INSTANCE_ID,
        'to': to,
        'message': message
    }
    
    response = requests.post(
        f'{API_URL}/messages/send-text',
        json=payload,
        headers=headers
    )
    
    data = response.json()
    
    if data.get('success'):
        print(f"✓ Message sent: {data['data']['message_id']}")
        return data['data']
    else:
        error = data.get('error', {})
        print(f"✗ Error: {error.get('message')}")
        raise Exception(error.get('message'))

# Send to multiple contacts with delays
contacts = [
    {'phone': '628987654321', 'name': 'John'},
    {'phone': '628123456789', 'name': 'Jane'},
]

for contact in contacts:
    message = f"Hi {contact['name']}, this is a personalized message for you!"
    send_message(contact['phone'], message)
    time.sleep(5)  # 5 second delay between messages
```

**Send Location:**

```python
def send_location(to, lat, lng, name, address):
    """Send a location message"""
    payload = {
        'instance_id': INSTANCE_ID,
        'to': to,
        'latitude': lat,
        'longitude': lng,
        'name': name,
        'address': address
    }
    
    response = requests.post(
        f'{API_URL}/messages/send-location',
        json=payload,
        headers=headers
    )
    
    return response.json()

send_location(
    '628987654321',
    -6.200000,
    106.816666,
    'Our Office',
    'Jl. Sudirman No. 123, Jakarta'
)
```

### PHP

```php
<?php

class WhatsAppAPI {
    private $apiUrl = 'https://your-domain.com/api/v1';
    private $apiKey = 'wa_your_api_key_here';
    private $instanceId = '550e8400-e29b-41d4-a716-446655440000';
    
    private function request($endpoint, $method = 'GET', $data = null) {
        $ch = curl_init();
        
        $headers = [
            'X-API-Key: ' . $this->apiKey,
            'Content-Type: application/json'
        ];
        
        $url = $this->apiUrl . $endpoint;
        
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        return json_decode($response, true);
    }
    
    public function sendMessage($to, $message) {
        $data = [
            'instance_id' => $this->instanceId,
            'to' => $to,
            'message' => $message
        ];
        
        return $this->request('/messages/send-text', 'POST', $data);
    }
    
    public function sendMedia($to, $mediaUrl, $mediaType, $caption = null) {
        $data = [
            'instance_id' => $this->instanceId,
            'to' => $to,
            'media_url' => $mediaUrl,
            'media_type' => $mediaType,
            'caption' => $caption
        ];
        
        return $this->request('/messages/send-media', 'POST', $data);
    }
    
    public function getMessages($page = 1, $limit = 20) {
        return $this->request(
            "/messages?instance_id={$this->instanceId}&page={$page}&limit={$limit}"
        );
    }
}

// Usage
$wa = new WhatsAppAPI();

$result = $wa->sendMessage('628987654321', 'Hello from PHP!');

if ($result['success']) {
    echo "Message sent: " . $result['data']['message_id'];
} else {
    echo "Error: " . $result['error']['message'];
}
?>
```

### cURL

**Send Text Message:**

```bash
curl -X POST "https://your-domain.com/api/v1/messages/send-text" \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628987654321",
    "message": "Hello from cURL!"
  }'
```

**Send Image:**

```bash
curl -X POST "https://your-domain.com/api/v1/messages/send-media" \
  -H "X-API-Key: wa_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "instance_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "628987654321",
    "media_url": "https://example.com/image.jpg",
    "media_type": "image",
    "caption": "Check this out!"
  }'
```

**Get Message History:**

```bash
curl -X GET "https://your-domain.com/api/v1/messages?instance_id=550e8400-e29b-41d4-a716-446655440000&limit=50" \
  -H "X-API-Key: wa_your_api_key_here"
```

---

## Common Integration Patterns

### 1. Two-Way Chat (Send + Receive)

**Setup Webhook → Process → Reply**

#### Step 1: Configure Webhook

Set your webhook URL to receive messages:

```
https://your-server.com/webhooks/whatsapp
```

#### Step 2: Handle Incoming Messages

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/webhooks/whatsapp', methods=['POST'])
def webhook_handler():
    data = request.json
    
    if data['event'] == 'message.received':
        sender = data['data']['from']
        message = data['data']['content']
        
        print(f"Received from {sender}: {message}")
        
        # Simple auto-reply logic
        if 'help' in message.lower():
            reply = "How can I help you today?"
        elif 'price' in message.lower():
            reply = "Our pricing starts at $99/month"
        else:
            reply = "Thanks for your message! Our team will respond soon."
        
        # Return reply (auto-reply feature)
        return jsonify({"message": reply})
    
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    app.run(port=5000)
```

Or manually send reply via API:

```python
def send_reply(to, message):
    payload = {
        'instance_id': INSTANCE_ID,
        'to': to,
        'message': message
    }
    requests.post(f'{API_URL}/messages/send-text', json=payload, headers=headers)

@app.route('/webhooks/whatsapp', methods=['POST'])
def webhook_handler():
    data = request.json
    
    if data['event'] == 'message.received':
        sender = extract_phone(data['data']['from'])  # Extract from JID
        message = data['data']['content']
        
        # Process and reply
        reply = process_message(message)
        send_reply(sender, reply)
    
    return jsonify({"status": "ok"})
```

### 2. Broadcast Messages

Send personalized messages to a list:

```python
import csv
import time
import random

def send_broadcast_campaign():
    # Load recipients from CSV
    with open('customers.csv', 'r') as f:
        reader = csv.DictReader(f)
        customers = list(reader)
    
    print(f"Sending to {len(customers)} customers...")
    
    for i, customer in enumerate(customers, 1):
        # Personalized message
        message = f"""
Hi {customer['name']}! 👋

We have a special offer just for you:
🎉 20% OFF on your next purchase!

Use code: {customer['name'].upper()}20

Valid until Feb 15, 2026.
        """.strip()
        
        try:
            result = send_message(customer['phone'], message)
            print(f"[{i}/{len(customers)}] ✓ Sent to {customer['name']}")
            
            # Random delay (5-15 seconds)
            delay = random.randint(5, 15)
            time.sleep(delay)
            
        except Exception as e:
            print(f"[{i}/{len(customers)}] ✗ Failed for {customer['name']}: {e}")
            continue

send_broadcast_campaign()
```

### 3. Contact Synchronization

Sync contacts from your CRM to WhatsApp API:

```python
def sync_contacts_from_crm():
    """Sync contacts from your CRM to WhatsApp API"""
    
    # Get contacts from your CRM
    crm_contacts = get_contacts_from_crm()  # Your CRM fetch logic
    
    for contact in crm_contacts:
        try:
            # Create contact in WhatsApp API
            payload = {
                'instance_id': INSTANCE_ID,
                'phone_number': contact['phone'],
                'name': contact['name'],
                'notes': f"CRM ID: {contact['id']}, Last purchase: {contact['last_purchase']}",
                'tags': contact['tags']
            }
            
            response = requests.post(
                f'{API_URL}/contacts',
                json=payload,
                headers=headers
            )
            
            if response.json().get('success'):
                print(f"✓ Synced: {contact['name']}")
            else:
                print(f"✗ Failed: {contact['name']}")
                
        except Exception as e:
            print(f"Error syncing {contact['name']}: {e}")

sync_contacts_from_crm()
```

### 4. Auto-Reply Workflows

Build complex workflows using webhook auto-reply:

**n8n Workflow Example:**

1. **Webhook trigger** - Receive `message.received`
2. **Switch node** - Check message content
3. **HTTP Request** - Fetch data from database
4. **Set node** - Format response message
5. **Webhook response** - Return `{ "message": "..." }`

**Make.com Scenario:**

1. **Webhooks** - Custom webhook
2. **Router** - Multiple paths based on message
3. **Google Sheets** - Lookup customer data
4. **Text aggregator** - Create response
5. **Webhook response** - Return JSON with `message` field

---

## Troubleshooting

### Instance Not Connected

**Problem:** Getting `INSTANCE_003: Instance not connected` error

**Solutions:**
1. Check instance status:
   ```bash
   curl "https://your-domain.com/api/v1/instances/{instance_id}/status" \
     -H "X-API-Key: wa_your_key"
   ```
2. Get QR code and scan with WhatsApp app
3. Restart instance if session corrupted
4. Check if phone has internet connection

### Invalid Phone Number

**Problem:** `MESSAGE_002: Invalid phone number`

**Solutions:**
- Use international format without `+` or `-`
- Remove spaces and special characters
- Correct format: `628123456789` (Indonesia), `14155552671` (US)
- Wrong format: `+62 812-3456-789`, `062-812-3456-789`

### Daily Limit Reached

**Problem:** `MESSAGE_004: Daily limit reached`

**Solutions:**
- Check warming phase limits
- Distribute messages across multiple instances
- Queue remaining messages for next day
- Upgrade account age (wait for STABLE phase)

### Messages Not Being Received

**Problem:** Messages sent but not appearing in recipient's WhatsApp

**Possible Causes:**
1. **Recipient blocked you** - No error returned, message just won't deliver
2. **Number doesn't exist** - Check if number is valid
3. **Recipient's phone offline** - Message will deliver when they come online
4. **Anti-spam filter** - Too many messages too fast

**Solutions:**
- Test with your own number first
- Add delays between messages
- Verify phone number format
- Check instance health score

### Webhook Not Receiving Events

**Problem:** Configured webhook but not receiving POST requests

**Solutions:**
1. **Test webhook endpoint:**
   ```bash
   curl -X POST https://your-server.com/webhooks/whatsapp \
     -H "Content-Type: application/json" \
     -d '{"test": "payload"}'
   ```
2. **Check webhook logs** in dashboard
3. **Verify webhook URL** is publicly accessible (not localhost)
4. **Check SSL certificate** (webhook URL should be HTTPS)
5. **Verify events** are selected in webhook config
6. **Check firewall** rules on your server

### Rate Limit Exceeded

**Problem:** `MESSAGE_005: Rate limit exceeded` or `429 Too Many Requests`

**Solutions:**
- Slow down requests
- Add delays between API calls
- Check API key rate limit
- Implement exponential backoff
- Distribute load across multiple API keys

---

## Security

### API Key Security

🔐 **Best Practices:**

1. **Never expose API keys in:**
   - Frontend JavaScript code
   - Git repositories
   - Public documentation
   - Log files

2. **Store securely:**
   - Use environment variables
   - Use secret management tools (AWS Secrets Manager, HashiCorp Vault)
   - Encrypt at rest

3. **Rotate regularly:**
   - Create new API key
   - Update applications
   - Delete old API key

4. **Use least privilege:**
   - Only grant required permissions
   - Create separate keys for different services
   - Use `message:send` only if service just sends messages

### Webhook Signature Verification

Verify webhooks are from your API server using the webhook secret:

```python
import hmac
import hashlib

def verify_webhook_signature(payload, signature, secret):
    """Verify webhook signature"""
    expected = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected, signature)

@app.route('/webhooks/whatsapp', methods=['POST'])
def webhook_handler():
    # Get signature from header
    signature = request.headers.get('X-Webhook-Signature')
    
    # Get raw payload
    payload = request.get_data(as_text=True)
    
    # Verify signature
    if not verify_webhook_signature(payload, signature, WEBHOOK_SECRET):
        return jsonify({"error": "Invalid signature"}), 401
    
    # Process webhook
    data = request.json
    # ... handle event
    
    return jsonify({"status": "ok"})
```

### HTTPS Only

Always use HTTPS for:
- API requests
- Webhook endpoints
- Media URLs

### IP Whitelisting

For extra security, whitelist API server IPs at your firewall.

### Monitor for Abuse

Set up alerts for:
- Unusual API usage patterns
- Failed authentication attempts
- Rapid message sending
- High error rates

---

## Additional Resources

### API Documentation
- **Swagger UI**: `https://your-domain.com/docs`
- **OpenAPI Spec**: Available at `/docs/json`

### Status Page
- Monitor API uptime and performance

### Support
- Email: support@yourdomain.com
- Documentation: docs.yourdomain.com
- GitHub Issues: github.com/yourorg/whatsapp-api

### Rate Limits Summary

| Resource | Limit |
|----------|-------|
| API requests | 1000/hour (configurable per key) |
| Message sending | Based on warming phase |
| Webhook deliveries | No limit |
| Contact creation | 100/minute |

---

## Changelog

**v1.0.0** (February 2026)
- Initial release
- Text, media, location messaging
- Webhook support with auto-reply
- Contact management
- Broadcast campaigns
- Multi-instance support
- Rate limiting & warming phases

---

## License & Terms

This is an **unofficial** WhatsApp API using the open-source Baileys library. Use at your own risk. WhatsApp may ban accounts that violate their Terms of Service.

**Not affiliated with Meta/WhatsApp.**

---

**Questions? Issues? Contact us or open a GitHub issue!**

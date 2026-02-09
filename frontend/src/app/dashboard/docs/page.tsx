"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Book,
  Code,
  Terminal,
  Webhook,
  MessageSquare,
  Users,
  Key,
  Smartphone,
  Copy,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language = "bash" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Kode disalin ke clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 hover:bg-zinc-700"
        onClick={copyCode}
      >
        {copied ? (
          <CheckCircle className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4 text-zinc-400" />
        )}
      </Button>
    </div>
  );
}

interface EndpointProps {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  body?: { name: string; type: string; required: boolean; description: string }[];
  response?: string;
}

function Endpoint({ method, path, description, params, body, response }: EndpointProps) {
  const methodColors = {
    GET: "bg-green-100 text-green-700",
    POST: "bg-blue-100 text-blue-700",
    PUT: "bg-yellow-100 text-yellow-700",
    DELETE: "bg-red-100 text-red-700",
    PATCH: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Badge className={methodColors[method]}>{method}</Badge>
        <code className="text-sm font-mono">{path}</code>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>

      {params && params.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Query Parameters</h4>
          <div className="bg-muted/50 rounded p-3 space-y-2">
            {params.map((param) => (
              <div key={param.name} className="text-sm">
                <code className="text-primary">{param.name}</code>
                <span className="text-muted-foreground"> ({param.type})</span>
                {param.required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
                <p className="text-muted-foreground text-xs mt-1">{param.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {body && body.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Request Body</h4>
          <div className="bg-muted/50 rounded p-3 space-y-2">
            {body.map((field) => (
              <div key={field.name} className="text-sm">
                <code className="text-primary">{field.name}</code>
                <span className="text-muted-foreground"> ({field.type})</span>
                {field.required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
                <p className="text-muted-foreground text-xs mt-1">{field.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {response && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Response Example</h4>
          <CodeBlock code={response} language="json" />
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Book className="h-6 w-6" />
          Dokumentasi API
        </h1>
        <p className="text-muted-foreground">
          Panduan lengkap untuk menggunakan WhatsApp API
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Terminal className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Quick Start</p>
              <p className="text-xs text-muted-foreground">Mulai dalam 5 menit</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Code className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Code Examples</p>
              <p className="text-xs text-muted-foreground">Contoh implementasi</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Webhook className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Webhooks</p>
              <p className="text-xs text-muted-foreground">Event notifications</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Key className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Authentication</p>
              <p className="text-xs text-muted-foreground">API key & JWT</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="getting-started" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
          <TabsTrigger value="instances">Instances</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        {/* Getting Started */}
        <TabsContent value="getting-started" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Start Guide</CardTitle>
              <CardDescription>
                Mulai menggunakan WhatsApp API dalam beberapa langkah sederhana
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1 */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">1</span>
                  Dapatkan API Key
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  Buat API key di halaman <a href="/dashboard/api-keys" className="text-primary underline">API Keys</a> untuk mengautentikasi request Anda.
                </p>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">2</span>
                  Buat Instance WhatsApp
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  Buat instance baru dan scan QR code untuk menghubungkan nomor WhatsApp Anda.
                </p>
                <div className="pl-8">
                  <CodeBlock code={`curl -X POST "${API_BASE_URL}/api/instances" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My WhatsApp"}'`} />
                </div>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm">3</span>
                  Kirim Pesan Pertama
                </h3>
                <p className="text-sm text-muted-foreground pl-8">
                  Setelah instance terhubung, kirim pesan pertama Anda.
                </p>
                <div className="pl-8">
                  <CodeBlock code={`curl -X POST "${API_BASE_URL}/api/messages/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "instance_id": "YOUR_INSTANCE_ID",
    "to": "6281234567890",
    "type": "text",
    "content": {
      "text": "Hello from API!"
    }
  }'`} />
                </div>
              </div>

              {/* Base URL */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Base URL</h4>
                <code className="text-sm bg-background px-2 py-1 rounded">{API_BASE_URL}/api</code>
              </div>

              {/* Authentication */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Authentication</h4>
                <p className="text-sm text-muted-foreground">
                  Semua request harus menyertakan header Authorization:
                </p>
                <CodeBlock code={`Authorization: Bearer YOUR_API_KEY`} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Instances */}
        <TabsContent value="instances" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Instance Management
              </CardTitle>
              <CardDescription>
                API endpoints untuk mengelola instance WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Endpoint
                method="GET"
                path="/api/instances"
                description="Dapatkan daftar semua instance"
                params={[
                  { name: "page", type: "number", required: false, description: "Nomor halaman (default: 1)" },
                  { name: "limit", type: "number", required: false, description: "Jumlah per halaman (default: 20)" },
                ]}
                response={`{
  "success": true,
  "data": {
    "instances": [
      {
        "id": "uuid",
        "name": "My WhatsApp",
        "phone_number": "6281234567890",
        "status": "connected",
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
}`}
              />

              <Endpoint
                method="POST"
                path="/api/instances"
                description="Buat instance baru"
                body={[
                  { name: "name", type: "string", required: true, description: "Nama instance" },
                ]}
                response={`{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My WhatsApp",
    "status": "disconnected"
  }
}`}
              />

              <Endpoint
                method="GET"
                path="/api/instances/:id/qr"
                description="Dapatkan QR code untuk login"
                response={`{
  "success": true,
  "data": {
    "qr": "data:image/png;base64,..."
  }
}`}
              />

              <Endpoint
                method="DELETE"
                path="/api/instances/:id"
                description="Hapus instance"
                response={`{
  "success": true,
  "message": "Instance deleted"
}`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages */}
        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Messaging API
              </CardTitle>
              <CardDescription>
                API endpoints untuk mengirim dan menerima pesan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Endpoint
                method="POST"
                path="/api/messages/send"
                description="Kirim pesan baru"
                body={[
                  { name: "instance_id", type: "string", required: true, description: "ID instance" },
                  { name: "to", type: "string", required: true, description: "Nomor tujuan (format: 628xxx)" },
                  { name: "type", type: "string", required: true, description: "Tipe pesan: text, image, document, audio, video" },
                  { name: "content", type: "object", required: true, description: "Konten pesan" },
                ]}
                response={`{
  "success": true,
  "data": {
    "message_id": "uuid",
    "status": "pending"
  }
}`}
              />

              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <h4 className="font-medium">Content Format by Type</h4>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Text Message:</p>
                  <CodeBlock code={`{
  "type": "text",
  "content": {
    "text": "Hello World!"
  }
}`} language="json" />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Image Message:</p>
                  <CodeBlock code={`{
  "type": "image",
  "content": {
    "url": "https://example.com/image.jpg",
    "caption": "Optional caption"
  }
}`} language="json" />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Document Message:</p>
                  <CodeBlock code={`{
  "type": "document",
  "content": {
    "url": "https://example.com/file.pdf",
    "filename": "document.pdf"
  }
}`} language="json" />
                </div>
              </div>

              <Endpoint
                method="GET"
                path="/api/messages"
                description="Dapatkan riwayat pesan"
                params={[
                  { name: "instance_id", type: "string", required: false, description: "Filter by instance" },
                  { name: "direction", type: "string", required: false, description: "inbound atau outbound" },
                  { name: "page", type: "number", required: false, description: "Nomor halaman" },
                  { name: "limit", type: "number", required: false, description: "Jumlah per halaman" },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Contacts API
              </CardTitle>
              <CardDescription>
                API endpoints untuk mengelola kontak
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Endpoint
                method="GET"
                path="/api/contacts"
                description="Dapatkan daftar kontak"
                params={[
                  { name: "search", type: "string", required: false, description: "Cari berdasarkan nama/nomor" },
                  { name: "tag_id", type: "string", required: false, description: "Filter by tag" },
                  { name: "page", type: "number", required: false, description: "Nomor halaman" },
                ]}
              />

              <Endpoint
                method="POST"
                path="/api/contacts"
                description="Tambah kontak baru"
                body={[
                  { name: "name", type: "string", required: true, description: "Nama kontak" },
                  { name: "phone_number", type: "string", required: true, description: "Nomor telepon" },
                  { name: "email", type: "string", required: false, description: "Email" },
                  { name: "notes", type: "string", required: false, description: "Catatan" },
                  { name: "tags", type: "string[]", required: false, description: "Array of tag IDs" },
                ]}
              />

              <Endpoint
                method="PUT"
                path="/api/contacts/:id"
                description="Update kontak"
                body={[
                  { name: "name", type: "string", required: false, description: "Nama kontak" },
                  { name: "email", type: "string", required: false, description: "Email" },
                  { name: "notes", type: "string", required: false, description: "Catatan" },
                ]}
              />

              <Endpoint
                method="DELETE"
                path="/api/contacts/:id"
                description="Hapus kontak"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhooks
              </CardTitle>
              <CardDescription>
                Terima notifikasi real-time untuk event WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Endpoint
                method="POST"
                path="/api/webhooks"
                description="Buat webhook baru"
                body={[
                  { name: "instance_id", type: "string", required: true, description: "ID instance" },
                  { name: "url", type: "string", required: true, description: "URL endpoint webhook" },
                  { name: "events", type: "string[]", required: true, description: "Array of event types" },
                ]}
              />

              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <h4 className="font-medium">Available Events</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-sm">
                    <code className="text-primary">message.received</code>
                    <p className="text-muted-foreground text-xs">Pesan masuk diterima</p>
                  </div>
                  <div className="text-sm">
                    <code className="text-primary">message.sent</code>
                    <p className="text-muted-foreground text-xs">Pesan berhasil dikirim</p>
                  </div>
                  <div className="text-sm">
                    <code className="text-primary">message.delivered</code>
                    <p className="text-muted-foreground text-xs">Pesan terdelivery</p>
                  </div>
                  <div className="text-sm">
                    <code className="text-primary">message.read</code>
                    <p className="text-muted-foreground text-xs">Pesan dibaca</p>
                  </div>
                  <div className="text-sm">
                    <code className="text-primary">connection.connected</code>
                    <p className="text-muted-foreground text-xs">Instance terhubung</p>
                  </div>
                  <div className="text-sm">
                    <code className="text-primary">connection.disconnected</code>
                    <p className="text-muted-foreground text-xs">Instance terputus</p>
                  </div>
                  <div className="text-sm">
                    <code className="text-primary">qr.updated</code>
                    <p className="text-muted-foreground text-xs">QR code berubah</p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                <h4 className="font-medium">Webhook Payload Example</h4>
                <CodeBlock code={`{
  "event": "message.received",
  "timestamp": "2026-01-01T00:00:00Z",
  "instance_id": "uuid",
  "data": {
    "message_id": "uuid",
    "from": "6281234567890",
    "type": "text",
    "content": {
      "text": "Hello!"
    },
    "timestamp": "2026-01-01T00:00:00Z"
  }
}`} language="json" />
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-medium text-yellow-800">Webhook Security</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Setiap webhook request menyertakan header <code className="bg-yellow-100 px-1 rounded">X-Webhook-Signature</code> 
                  yang berisi HMAC-SHA256 signature dari payload. Gunakan secret key Anda untuk memverifikasi signature.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Help */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Butuh Bantuan?</h3>
              <p className="text-sm text-muted-foreground">
                Hubungi tim support kami jika Anda memiliki pertanyaan
              </p>
            </div>
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Hubungi Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

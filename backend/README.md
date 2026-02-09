# WhatsApp SaaS Backend

Backend API untuk WhatsApp SaaS menggunakan Baileys (Unofficial WhatsApp API).

## 📋 Prerequisites

Sebelum mulai, pastikan sudah install:

- **Node.js** 20.x atau lebih tinggi
- **MySQL** 8.0 atau lebih tinggi
- **Redis** 7.x atau lebih tinggi

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

Copy `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Edit `.env` dan sesuaikan dengan konfigurasi Anda (terutama `DATABASE_URL`).

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

### 4. Run Database Migrations

```bash
npm run prisma:migrate
```

### 5. (Optional) Seed Database

```bash
npm run prisma:seed
```

### 6. Start Development Server

```bash
npm run dev
```

Server akan running di: `http://localhost:3000`

## 📚 API Documentation

Setelah server running, buka Swagger UI:

```
http://localhost:3000/api/docs
```

## 🏗️ Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Database seeder
├── src/
│   ├── config/                # Configuration files
│   │   ├── index.ts           # Main config
│   │   ├── database.ts        # Prisma client
│   │   ├── redis.ts           # Redis client
│   │   └── logger.ts          # Logger config
│   ├── middleware/            # Fastify middlewares
│   │   ├── auth.ts            # Authentication
│   │   └── rbac.ts            # Role-based access control
│   ├── modules/               # Feature modules
│   │   ├── auth/              # Authentication module
│   │   │   └── auth.routes.ts
│   │   ├── organizations/     # Organizations module
│   │   ├── whatsapp/          # WhatsApp instances module
│   │   └── ...
│   ├── types/                 # TypeScript types
│   │   └── index.ts
│   ├── utils/                 # Utility functions
│   │   ├── crypto.ts
│   │   └── helpers.ts
│   └── index.ts               # Application entry point
├── storage/                   # File storage (local)
├── .env.example               # Environment template
├── package.json
└── tsconfig.json
```

## 🔐 Authentication

API menggunakan JWT (JSON Web Token) untuk authentication.

### Register

```bash
POST /api/auth/register
{
  "email": "owner@example.com",
  "password": "password123",
  "full_name": "John Doe",
  "organization_name": "My Company",
  "phone": "081234567890"
}
```

### Login

```bash
POST /api/auth/login
{
  "email": "owner@example.com",
  "password": "password123"
}
```

Response akan berisi `access_token` dan `refresh_token`.

### Menggunakan Token

Tambahkan header di setiap request:

```
Authorization: Bearer <access_token>
```

## 🗄️ Database

### View Database

```bash
npm run prisma:studio
```

Prisma Studio akan terbuka di browser: `http://localhost:5555`

### Reset Database

```bash
npx prisma migrate reset
```

⚠️ **WARNING**: Ini akan menghapus semua data!

## 📦 Available Scripts

- `npm run dev` - Start development server dengan hot reload
- `npm run build` - Build untuk production
- `npm start` - Run production build
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:seed` - Seed database
- `npm run worker` - Start background worker
- `npm run lint` - Lint code
- `npm run format` - Format code dengan Prettier

## 🔧 Development Tips

### Hot Reload

Development server menggunakan `tsx watch` untuk auto-reload saat ada perubahan file.

### Debugging

Tambahkan `debugger` di code, lalu run:

```bash
node --inspect -r tsx/cjs src/index.ts
```

Buka Chrome DevTools: `chrome://inspect`

### Database Changes

Setiap kali ubah `schema.prisma`:

```bash
npm run prisma:migrate
npm run prisma:generate
```

## ⚠️ Important Notes

1. **Baileys Library**: Library ini **UNOFFICIAL** dan bisa break kapan saja
2. **WhatsApp ToS**: Menggunakan WhatsApp API unofficial melanggar Terms of Service
3. **Account Ban Risk**: Ada risiko WhatsApp account di-ban
4. **Anti-Ban**: Gunakan anti-ban strategy yang sudah disediakan

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### MySQL Connection Error

- Pastikan MySQL service running
- Check `DATABASE_URL` di `.env`
- Check MySQL user & password

### Redis Connection Error

- Pastikan Redis service running
- Check `REDIS_URL` di `.env`

### Prisma Errors

```bash
# Clear Prisma cache
npx prisma generate
npx prisma migrate reset
```

## 📞 Support

Untuk bug reports atau feature requests, silakan buat issue di repository.

## 📄 License

MIT

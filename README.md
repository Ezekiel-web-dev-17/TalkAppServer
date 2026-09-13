# TalkApp Backend Server 🚀

A production-ready, scalable backend API server for **TalkApp**, built with Express, TypeScript, Prisma ORM, PostgreSQL, Redis, and Arcjet security.

---

## ⚡ Tech Stack

- **Runtime:** [Node.js](https://nodejs.org/) (v22 / ES Modules)
- **Language:** [TypeScript](https://www.typescriptlang.org/) (Strict mode, NodeNext resolution)
- **Framework:** [Express.js](https://expressjs.com/) v5
- **Database & ORM:** [PostgreSQL](https://www.postgresql.org/) (16) via [Prisma ORM](https://www.prisma.io/)
- **Caching:** [Redis](https://redis.io/) (v7) via [ioredis](https://github.com/redis/ioredis)
- **Security & Rate Limiting:** [Arcjet](https://arcjet.com/) (WAF Shield, Bot Detection, Sliding Window Rate Limiting)
- **Containerization:** [Docker](https://www.docker.com/) & Docker Compose (Multi-stage builds)

---

## 🌟 Key Features

- **Modular Architecture:** Clean separation of Express configuration (`app.ts`) and server lifecycle (`index.ts`).
- **Route Versioning:** Structured API versioning under `/api/v1`.
- **Arcjet Protection:**
  - **Shield:** Automated protection against SQL Injection, XSS, SSRF, and OWASP Top 10 exploits.
  - **Bot Detection:** Blocks malicious bots and scrapers while permitting legitimate search engines, webhooks, and developer tools (`curl`, `Postman`).
  - **Rate Limiting:** IP-based sliding window rate limiter (100 req/min).
- **Redis Response Caching:** Built-in route-level caching middleware with graceful failover.
- **Centralized Error Handling:** Standardized `ApiError` class with safe Prisma exception formatting (internal stack traces stripped in production).
- **Health Checks:** Comprehensive `/health` probe reporting real-time database and cache connection status.

---

## 📁 Project Structure

```text
TalkAppServer/
├── docker-compose.yml       # Local PostgreSQL & Redis services
├── Dockerfile               # Multi-stage production container image
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma        # Prisma data models & migrations
└── src/
    ├── app.ts               # Express configuration, middlewares, & routes
    ├── index.ts             # Server entry point & graceful shutdown
    ├── config/
    │   └── env.config.ts    # Environment variables validation & loading
    ├── lib/
    │   ├── prisma.ts        # Prisma client singleton
    │   └── redis.ts         # Redis connection client
    ├── middlewares/
    │   ├── arcjet.middleware.ts  # Arcjet Shield & Bot detection
    │   ├── error.middleware.ts   # Operational API error & 404 handler
    │   └── redis.middleware.ts   # Redis route response caching
    ├── controllers/         # Request handlers (to be added)
    ├── models/              # Data schemas & types
    └── routes/              # Express domain route modules
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Ezekiel-web-dev-17/TalkAppServer.git
cd TalkAppServer
npm install
```

### 3. Environment Configuration
Create your local environment file from the template:
```bash
cp .env.example .env.development.local
```

Configure your variables in `.env.development.local`:
```env
PORT=5000
NODE_ENV=development

# PostgreSQL (Docker default port 5433)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/talkapp?schema=public"

# Redis (Docker default port 6380)
REDIS_URL="redis://localhost:6380"

# JWT Secret
JWT_SECRET="super-secret-jwt-key-change-in-production"

# Arcjet Security (Get free key at https://app.arcjet.com)
ARCJET_KEY=""
ARCJET_ENV="development"
```

### 4. Start Infrastructure (PostgreSQL & Redis)
Spin up the local database and Redis cache containers:
```bash
docker compose up -d
```

### 5. Generate Prisma Client
```bash
npm run db:generate
```

### 6. Run the Development Server
```bash
npm run dev
```
The server will start on `http://localhost:5000` with live hot-reloading enabled.

---

## 📡 API Endpoints

| Method | Endpoint | Description | Cache |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | System health check (PostgreSQL & Redis connectivity) | Real-time |
| `GET` | `/` | Server root overview | Cached (120s) |
| `GET` | `/api/v1/` | API v1 status and operational verification | Cached (120s) |
| `GET` | `/api/v1/health` | API v1 service health status | Real-time |

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts server in watch mode using `tsx` |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs compiled production server from `dist/index.js` |
| `npm run db:generate` | Generates Prisma client types |
| `npm run db:migrate` | Runs database migrations in development |
| `npm run db:studio` | Opens Prisma Studio visual database GUI |

---

## 🐳 Docker Deployment

To build and run the production image:
```bash
# Build production Docker image
docker build -t talkapp-server .

# Run container
docker run -p 5000:5000 --env-file .env.development.local talkapp-server
```

---

## 📄 License
ISC License.

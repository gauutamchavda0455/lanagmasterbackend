# My Backend

A production-ready REST API built with NestJS, TypeORM, PostgreSQL, Redis, and SHA-256 token authentication.

---

## Table of Contents

- [Tech Stack & Why Each Technology](#tech-stack--why-each-technology)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Step-by-Step Setup Guide](#step-by-step-setup-guide)
- [API Endpoints](#api-endpoints)
- [Authentication (SHA-256 Token Auth)](#authentication-sha-256-token-auth)
- [Scripts](#scripts)
- [Features](#features)

---

## Tech Stack & Why Each Technology

### 1. NestJS (Framework)

**What:** A progressive Node.js framework built with TypeScript for building scalable server-side applications.

**Why NestJS?**
- **Modular Architecture** - Organizes code into modules (AuthModule, UsersModule, etc.) making the codebase maintainable as it grows. Each feature is self-contained.
- **Dependency Injection** - Built-in DI container automatically manages class dependencies. You declare what a class needs, and NestJS provides it.
- **Decorator-Based** - Uses decorators like `@Controller()`, `@Get()`, `@Post()`, `@UseGuards()` making code readable and declarative.
- **Built-in Support** - Comes with first-class support for WebSockets, microservices, GraphQL, queues, caching, and more out of the box.
- **TypeScript First** - Full TypeScript support means fewer runtime errors, better IDE autocompletion, and safer refactoring.
- **Enterprise Ready** - Used by companies like Adidas, Roche, and Autodesk. Battle-tested for production workloads.

**How it works in this project:**
```
AppModule (root)
├── ConfigModule      → Loads environment variables
├── DatabaseModule    → PostgreSQL connection
├── AuthModule        → Authentication (SHA-256 tokens)
├── UsersModule       → User CRUD operations
├── MailModule        → Email sending
├── UploadModule      → File uploads
├── NotificationsModule → WebSocket notifications
├── CacheModule       → Redis caching
├── QueueModule       → Background job processing
├── LoggerModule      → Logging with Winston
└── HealthModule      → Health check endpoints
```

---

### 2. PostgreSQL (Database)

**What:** An open-source relational database known for reliability, data integrity, and advanced features.

**Why PostgreSQL?**
- **ACID Compliant** - Guarantees that database transactions are processed reliably. If a user registration fails halfway, nothing gets saved (no partial data).
- **UUID Support** - Native UUID type for primary keys. Every user, token, and notification gets a unique ID like `a1b2c3d4-e5f6-...` instead of auto-incrementing integers (better for distributed systems).
- **JSON Support** - Can store and query JSON data natively, useful for flexible data like notification metadata.
- **Enum Types** - Native enum support for fields like `role` (user/admin) and `status` (active/inactive).
- **Soft Delete** - Combined with TypeORM's `@DeleteDateColumn()`, records are marked as deleted instead of actually removed, preserving data history.
- **Scalable** - Handles millions of rows efficiently with proper indexing. Supports read replicas for scaling.

**How it works in this project:**

Database tables are auto-created from TypeORM entities:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Stores user accounts | id, email, password (bcrypt), firstName, lastName, role, status |
| `access_tokens` | Stores hashed access tokens | id, tokenHash (SHA-256), userId, expiresAt, isRevoked |
| `refresh_tokens` | Stores hashed refresh tokens | id, token (SHA-256), userId, expiresAt, isRevoked |
| `notifications` | Stores notifications | id, userId, title, message, isRead |

**Configuration:** `src/config/database.config.ts` reads from `.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=my_backend
DB_SYNCHRONIZE=true    ← Auto-creates tables (dev only, disable in production!)
```

---

### 3. SHA-256 Token Authentication

**What:** A custom token-based authentication system that uses SHA-256 hashing instead of JWT (JSON Web Tokens).

**Why SHA-256 Token Auth instead of JWT?**
- **Revocable** - Tokens can be instantly revoked by marking them as `isRevoked: true` in the database. JWT tokens cannot be revoked until they expire.
- **No Secret Key Risk** - JWTs rely on a secret key. If the secret leaks, all tokens are compromised. SHA-256 tokens are random strings — there's no secret to leak.
- **Server-Side Control** - The server has full control over every active session. You can see all active tokens, revoke specific ones, or revoke all tokens for a user.
- **Simpler** - No need to manage JWT secrets, token signing, or token decoding. Generate a random string, hash it, store the hash.
- **Secure** - SHA-256 is a one-way hash. Even if the database is compromised, attackers cannot reverse the hash to get the actual tokens.

**How it works:**

```
REGISTER/LOGIN FLOW:
1. User sends email + password
2. Server generates a random 48-byte token (96 hex characters)
3. Server hashes the token with SHA-256
4. Server stores the HASH in the database (access_tokens table)
5. Server returns the RAW token to the user

PROTECTED REQUEST FLOW:
1. User sends request with header: Authorization: Bearer <raw-token>
2. Server extracts the token from the header
3. Server hashes the token with SHA-256
4. Server looks up the hash in the access_tokens table
5. If found, not expired, and not revoked → request is authenticated
6. Server loads the user from the database and attaches to request

LOGOUT FLOW:
1. Server marks all user's tokens as isRevoked: true
2. All sessions are immediately invalidated
```

**Token comparison:**

| Feature | SHA-256 Token | JWT |
|---------|--------------|-----|
| Revocable | Yes (instant) | No (wait for expiry) |
| Stateless | No (needs DB lookup) | Yes |
| Database required | Yes | No |
| Secret key needed | No | Yes |
| Token size | 96 chars | ~300+ chars |
| Server control | Full | Limited |

**Files involved:**
- `src/common/utils/crypto.util.ts` — `generateToken()` and `hashSha256()` functions
- `src/modules/auth/entities/access-token.entity.ts` — Database entity for storing hashed tokens
- `src/modules/auth/guards/token-auth.guard.ts` — Guard that validates tokens on every request
- `src/modules/auth/auth.service.ts` — Token generation and authentication logic

---

### 4. Redis (Cache & Queue)

**What:** An in-memory data store used as a cache and message broker for background jobs.

**Why Redis?**
- **Speed** - Data is stored in memory (RAM), making reads/writes 10-100x faster than database queries. A typical Redis read takes < 1ms vs 5-50ms for PostgreSQL.
- **Caching** - Frequently accessed data (like user profiles) is cached in Redis. Instead of hitting the database every time, the app checks Redis first.
- **Job Queues** - Background tasks like sending emails and push notifications are added to Redis-backed Bull queues. This means the API responds instantly while the email is sent in the background.
- **TTL (Time-To-Live)** - Cached data automatically expires. Set a 60-second TTL and Redis deletes stale data for you.
- **Pub/Sub** - Redis can broadcast messages between services, useful for real-time notifications.

**How Redis is used in this project:**

| Use Case | Module | How It Works |
|----------|--------|-------------|
| **Caching** | `src/shared/cache/` | Stores frequently accessed data in Redis with `cache-manager-redis-yet`. Default TTL: 60 seconds. |
| **Email Queue** | `src/shared/queue/` | When a user registers, a "send welcome email" job is added to the Bull `email` queue. A background processor picks it up and sends the email without blocking the API response. |
| **Notification Queue** | `src/shared/queue/` | Push notifications are queued and processed in the background via the `notification` queue. |

**Cache flow example:**
```
GET /api/users/123

1. Check Redis: "Do we have user 123 cached?"
   → YES: Return cached data instantly (< 1ms)
   → NO: Query PostgreSQL, store result in Redis (TTL: 60s), return data

Next request within 60 seconds → served from Redis (fast!)
After 60 seconds → cache expired, query DB again
```

**Queue flow example:**
```
POST /api/auth/register

1. Create user in PostgreSQL
2. Generate tokens
3. Add "send welcome email" job to Redis queue ← non-blocking
4. Return response to user immediately (fast!)

Background (async):
5. Email processor picks up the job from Redis
6. Sends the welcome email via SMTP
7. Job marked as completed
```

**Configuration:** `src/config/redis.config.ts` reads from `.env`:
```
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          ← empty for local development
```

---

### 5. TypeORM (ORM)

**What:** An Object-Relational Mapper that lets you interact with the database using TypeScript classes instead of raw SQL.

**Why TypeORM?**
- **Entity Classes** - Define database tables as TypeScript classes with decorators. No need to write `CREATE TABLE` SQL.
- **Auto-Migration** - With `synchronize: true`, TypeORM automatically creates/updates tables based on your entity classes.
- **Query Builder** - Build complex queries with a fluent API instead of writing raw SQL.
- **Relationships** - Define `@ManyToOne`, `@OneToMany` relationships between entities easily.
- **NestJS Integration** - `@nestjs/typeorm` provides seamless integration with dependency injection.

**Example entity → database table:**
```typescript
@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;          →  email VARCHAR UNIQUE

  @Column()
  password: string;       →  password VARCHAR

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;             →  role ENUM('user','admin') DEFAULT 'user'
}
```

---

### 6. TypeScript (Language)

**What:** A typed superset of JavaScript that compiles to plain JavaScript.

**Why TypeScript?**
- **Type Safety** - Catches errors at compile time, not runtime. If you pass a string where a number is expected, TypeScript tells you before the code runs.
- **Better IDE Support** - Autocomplete, go-to-definition, rename refactoring all work perfectly.
- **Self-Documenting** - Types serve as documentation. Looking at a function signature tells you exactly what it accepts and returns.
- **Required by NestJS** - NestJS is built with and for TypeScript.

---

### 7. Other Technologies

| Technology | Why It's Used |
|-----------|---------------|
| **bcrypt** | Hashes user passwords with salt. Even if the database leaks, passwords can't be reversed. |
| **class-validator** | Validates incoming request data (is email valid? is password strong enough?) using decorators on DTO classes. |
| **class-transformer** | Transforms plain objects to class instances and back. Works with class-validator for request validation. |
| **Passport.js** | Authentication middleware. The `local` strategy validates email/password on login. |
| **Swagger/OpenAPI** | Auto-generates interactive API documentation at `/api/docs`. Frontend developers can test endpoints directly. |
| **Winston** | Production-grade logging library. Logs to console in development and can log to files/services in production. |
| **Bull** | Redis-backed job queue for processing tasks in the background (emails, notifications). |
| **Multer** | Handles `multipart/form-data` for file uploads. Saves uploaded files to the `./uploads` directory. |
| **Socket.IO** | Enables real-time WebSocket connections for instant notifications to connected clients. |
| **Terminus** | Health check library. The `/api/health` endpoint verifies the database connection is alive. |
| **Throttler** | Rate limiting. Prevents abuse by limiting each IP to 10 requests per 60 seconds. |
| **Handlebars** | Email template engine. Email templates (welcome, reset password) are written in `.hbs` files with dynamic variables. |
| **Docker** | Containerizes the app + PostgreSQL + Redis so anyone can run the entire stack with one command. |

---

## Project Structure

```
src/
├── main.ts                          # App entry point - bootstraps NestJS
├── app.module.ts                    # Root module - imports all feature modules
├── app.controller.ts                # Root controller (GET /api → Hello World)
├── app.service.ts                   # Root service
│
├── config/                          # All configuration (reads from .env)
│   ├── app.config.ts                # APP_PORT, APP_NAME, APP_ENV
│   ├── database.config.ts           # DB_HOST, DB_PORT, DB_PASSWORD...
│   ├── jwt.config.ts                # Token expiry settings
│   ├── mail.config.ts               # SMTP settings
│   ├── redis.config.ts              # REDIS_HOST, REDIS_PORT
│   ├── storage.config.ts            # File upload settings
│   └── config.module.ts             # Registers all config files
│
├── database/                        # Database setup
│   ├── database.module.ts           # TypeORM connection to PostgreSQL
│   ├── migrations/                  # Database migration files
│   ├── seeds/                       # Seed data for development
│   └── subscribers/                 # TypeORM entity subscribers
│
├── modules/                         # Feature modules
│   ├── auth/                        # Authentication
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts       # Login, register, logout endpoints
│   │   ├── auth.service.ts          # Token generation, validation logic
│   │   ├── auth.repository.ts
│   │   ├── dto/                     # Request validation schemas
│   │   │   ├── login.dto.ts
│   │   │   ├── register.dto.ts
│   │   │   ├── refresh-token.dto.ts
│   │   │   ├── forgot-password.dto.ts
│   │   │   └── reset-password.dto.ts
│   │   ├── entities/
│   │   │   ├── access-token.entity.ts   # SHA-256 hashed access tokens
│   │   │   └── refresh-token.entity.ts  # SHA-256 hashed refresh tokens
│   │   ├── strategies/
│   │   │   ├── local.strategy.ts    # Email + password validation
│   │   │   ├── jwt.strategy.ts      # (Legacy) JWT validation
│   │   │   └── jwt-refresh.strategy.ts
│   │   ├── guards/
│   │   │   ├── token-auth.guard.ts  # SHA-256 token authentication guard
│   │   │   ├── jwt-auth.guard.ts    # (Legacy) JWT guard
│   │   │   ├── local-auth.guard.ts  # Login guard
│   │   │   └── roles.guard.ts       # Role-based access control
│   │   └── decorators/
│   │       ├── current-user.decorator.ts  # @CurrentUser() → get logged-in user
│   │       ├── roles.decorator.ts         # @Roles('admin') → restrict access
│   │       └── public.decorator.ts        # @Public() → skip auth
│   │
│   ├── users/                       # User management
│   │   ├── users.module.ts
│   │   ├── users.controller.ts      # CRUD endpoints for users
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   ├── dto/
│   │   ├── entities/
│   │   │   └── user.entity.ts       # User table definition
│   │   └── interfaces/
│   │
│   ├── mail/                        # Email sending
│   │   ├── mail.module.ts           # SMTP configuration
│   │   ├── mail.service.ts          # Send emails
│   │   └── templates/               # Handlebars email templates
│   │       ├── welcome.hbs
│   │       ├── reset-password.hbs
│   │       ├── verify-email.hbs
│   │       └── otp.hbs
│   │
│   ├── upload/                      # File upload
│   │   ├── upload.module.ts
│   │   ├── upload.service.ts
│   │   └── upload.controller.ts
│   │
│   └── notifications/               # Real-time notifications
│       ├── notifications.module.ts
│       ├── notifications.service.ts
│       ├── notifications.gateway.ts  # WebSocket gateway
│       └── entities/
│
├── common/                          # Shared utilities used across all modules
│   ├── decorators/                  # Custom decorators
│   ├── dto/                         # Shared DTOs (pagination, id params)
│   ├── entities/
│   │   └── base.entity.ts          # Base entity (id, createdAt, updatedAt, deletedAt)
│   ├── enums/
│   │   ├── role.enum.ts            # USER, ADMIN
│   │   └── status.enum.ts          # ACTIVE, INACTIVE
│   ├── filters/                     # Exception filters
│   ├── guards/                      # Throttle guard
│   ├── interceptors/
│   │   ├── response.interceptor.ts  # Wraps responses in { success, data, timestamp }
│   │   ├── logging.interceptor.ts   # Logs every request
│   │   └── timeout.interceptor.ts   # 30s request timeout
│   ├── pipes/                       # Validation & transform pipes
│   ├── utils/
│   │   ├── hash.util.ts            # bcrypt password hashing
│   │   ├── crypto.util.ts          # generateToken() + hashSha256()
│   │   ├── pagination.util.ts
│   │   ├── date.util.ts
│   │   └── string.util.ts
│   └── constants/
│       ├── app.constants.ts
│       ├── error-messages.ts
│       └── success-messages.ts
│
└── shared/                          # Shared infrastructure modules
    ├── cache/
    │   ├── cache.module.ts          # Redis cache configuration
    │   └── cache.service.ts         # get(), set(), del() wrapper
    ├── queue/
    │   ├── queue.module.ts          # Bull queue configuration
    │   └── processors/
    │       ├── email.processor.ts   # Processes email jobs
    │       └── notification.processor.ts
    ├── logger/
    │   ├── logger.module.ts
    │   └── logger.service.ts        # Winston logger
    ├── swagger/
    │   ├── swagger.config.ts
    │   └── swagger.setup.ts         # Swagger UI at /api/docs
    └── health/
        ├── health.module.ts
        └── health.controller.ts     # GET /api/health
```

---

## Prerequisites

Before you start, install these on your system:

| Software | Version | Purpose | Install Command (Windows) |
|----------|---------|---------|--------------------------|
| **Node.js** | >= 18 | JavaScript runtime | Download from [nodejs.org](https://nodejs.org) |
| **PostgreSQL** | >= 16 | Database | Download from [postgresql.org](https://www.postgresql.org/download) |
| **Redis** | >= 7 | Cache & queues | `winget install Redis.Redis` |
| **Git** | Latest | Version control | `winget install Git.Git` |

---

## Step-by-Step Setup Guide

### Step 1: Clone the project

```bash
git clone <your-repo-url>
cd my-backend
```

### Step 2: Install Node.js dependencies

```bash
npm install
```

This installs all packages listed in `package.json` into the `node_modules/` folder.

### Step 3: Set up PostgreSQL

**3a. Verify PostgreSQL is running:**

```bash
# Windows (PowerShell)
Get-Service -Name 'postgresql*'

# Or connect directly
psql -U postgres -h localhost
```

**3b. Create the database:**

```bash
psql -U postgres -h localhost -c "CREATE DATABASE my_backend;"
```

> If `psql` is not in your PATH, use the full path:
> `"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE my_backend;"`

### Step 4: Set up Redis

**4a. Install Redis (Windows):**

```bash
winget install Redis.Redis
```

**4b. Verify Redis is running:**

```bash
# Check service status (PowerShell)
Get-Service -Name 'Redis'

# Test connection
redis-cli ping
# Expected output: PONG
```

> If `redis-cli` is not in your PATH, use the full path:
> `"C:\Program Files\Redis\redis-cli.exe" ping`

### Step 5: Configure environment variables

```bash
cp .env.example .env
```

Edit the `.env` file with your actual values:

```env
# Application
APP_PORT=3000
APP_NAME=my-backend
APP_ENV=development
API_PREFIX=api

# PostgreSQL Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password    ← Change this!
DB_NAME=my_backend
DB_SYNCHRONIZE=true                   ← Set to false in production!
DB_LOGGING=false

# Token Settings
JWT_SECRET=any-random-string
JWT_EXPIRES_IN=15m                    ← Access token valid for 15 minutes
JWT_REFRESH_SECRET=another-random-string
JWT_REFRESH_EXPIRES_IN=7d             ← Refresh token valid for 7 days

# Email (Optional - for sending emails)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=noreply@example.com

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# File Upload
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./uploads

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### Step 6: Start the application

```bash
# Development mode (auto-reload on file changes)
npm run start:dev
```

You should see:

```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [RoutesResolver] AppController {/api}:
[Nest] LOG [RouterExplorer] Mapped {/api, GET} route
[Nest] LOG [RouterExplorer] Mapped {/api/auth/register, POST} route
[Nest] LOG [RouterExplorer] Mapped {/api/auth/login, POST} route
...
Application running on port 3000
```

### Step 7: Test the API

**7a. Health check:**
```bash
curl http://localhost:3000/api
# Response: {"success":true,"data":"Hello World!","timestamp":"..."}
```

**7b. Register a user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234","firstName":"John","lastName":"Doe"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid...", "email": "test@example.com", ... },
    "accessToken": "a1b2c3d4e5f6...96 chars...hex",
    "refreshToken": "x1y2z3...96 chars...hex"
  }
}
```

**7c. Use the token to access protected routes:**
```bash
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**7d. View Swagger docs:**

Open `http://localhost:3000/api/docs` in your browser.

---

## Running with Docker

Start the entire stack (app + PostgreSQL + Redis) with one command:

```bash
docker-compose up -d
```

This creates:
- **app** container → NestJS API on port 3000
- **postgres** container → PostgreSQL on port 5432
- **redis** container → Redis on port 6379

Stop everything:
```bash
docker-compose down
```

---

## API Endpoints

### Root

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api` | No | Hello World / health check |

### Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register a new user. Returns access + refresh tokens. |
| POST | `/api/auth/login` | No | Login with email & password. Returns access + refresh tokens. |
| POST | `/api/auth/refresh` | No | Exchange a refresh token for new access + refresh tokens. |
| POST | `/api/auth/forgot-password` | No | Request a password reset email. |
| POST | `/api/auth/reset-password` | No | Reset password using the reset token. |
| POST | `/api/auth/logout` | Bearer Token | Revoke all tokens for the logged-in user. |

### Users (`/api/users`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/users` | Bearer Token | Create a new user. |
| GET | `/api/users` | Bearer Token | List all users (paginated). |
| GET | `/api/users/:id` | Bearer Token | Get a single user by UUID. |
| PATCH | `/api/users/:id` | Bearer Token | Update a user. |
| DELETE | `/api/users/:id` | Bearer Token | Soft-delete a user. |

### Upload (`/api/upload`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/upload` | Bearer Token | Upload a file (multipart/form-data). |

### Health (`/api/health`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Health check with database ping. |

### Swagger Docs

Interactive API documentation available at: `http://localhost:3000/api/docs`

---

## Authentication (SHA-256 Token Auth)

### Register

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongP@ss1",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongP@ss1"
}
```

### Use Token

```bash
GET /api/users
Authorization: Bearer <your-access-token>
```

### Refresh Token

```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<your-refresh-token>"
}
```

### Logout

```bash
POST /api/auth/logout
Authorization: Bearer <your-access-token>
```

---

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `APP_PORT` | Server port | `3000` | No |
| `APP_NAME` | Application name | `my-backend` | No |
| `APP_ENV` | Environment (development/staging/production) | `development` | No |
| `API_PREFIX` | Global route prefix | `api` | No |
| `DB_HOST` | PostgreSQL host | `localhost` | Yes |
| `DB_PORT` | PostgreSQL port | `5432` | Yes |
| `DB_USERNAME` | PostgreSQL username | `postgres` | Yes |
| `DB_PASSWORD` | PostgreSQL password | - | Yes |
| `DB_NAME` | Database name | `my_backend` | Yes |
| `DB_SYNCHRONIZE` | Auto-sync schema (disable in production) | `true` | No |
| `DB_LOGGING` | Enable SQL query logging | `false` | No |
| `JWT_EXPIRES_IN` | Access token lifetime | `15m` | No |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` | No |
| `MAIL_HOST` | SMTP server host | `smtp.gmail.com` | No |
| `MAIL_PORT` | SMTP server port | `587` | No |
| `MAIL_USER` | SMTP username | - | No |
| `MAIL_PASSWORD` | SMTP password | - | No |
| `MAIL_FROM` | Default sender address | `noreply@example.com` | No |
| `REDIS_HOST` | Redis host | `localhost` | Yes |
| `REDIS_PORT` | Redis port | `6379` | Yes |
| `REDIS_PASSWORD` | Redis password | - | No |
| `STORAGE_DRIVER` | File storage driver | `local` | No |
| `STORAGE_LOCAL_PATH` | Local upload directory | `./uploads` | No |
| `FRONTEND_URL` | Frontend application URL | `http://localhost:3000` | No |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Start the application |
| `npm run start:dev` | Start with hot-reload (development) |
| `npm run start:debug` | Start with debug mode |
| `npm run start:prod` | Start production build |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run lint` | Run ESLint to check code quality |
| `npm run format` | Format code with Prettier |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:cov` | Run tests with coverage report |
| `npm run test:e2e` | Run end-to-end tests |

---

## Features

| Feature | Description |
|---------|-------------|
| **SHA-256 Token Auth** | Secure, revocable token authentication with hashed tokens stored in database |
| **Role-Based Access Control** | `@Roles('admin')` decorator restricts endpoints to specific roles |
| **Input Validation** | DTOs validated with class-validator (email format, password strength, required fields) |
| **Global Error Handling** | Consistent error responses with HTTP status codes and error messages |
| **Response Interceptor** | All responses wrapped in `{ success, data, timestamp }` format |
| **Rate Limiting** | 10 requests per 60 seconds per IP to prevent abuse |
| **Request Logging** | Every request logged with method, URL, status code, and duration |
| **Request Timeout** | Requests automatically timeout after 30 seconds |
| **Pagination** | Built-in pagination with `?page=1&limit=10` query parameters |
| **Email Templates** | Handlebars templates for welcome, reset password, verify email, and OTP |
| **File Upload** | Upload files via multipart/form-data, stored locally |
| **WebSocket Notifications** | Real-time notifications pushed to connected clients via Socket.IO |
| **Background Jobs** | Email and notification processing via Bull queues (Redis-backed) |
| **Redis Caching** | Frequently accessed data cached in Redis for fast retrieval |
| **Health Checks** | `/api/health` endpoint verifies database connectivity |
| **Swagger Docs** | Auto-generated interactive API documentation at `/api/docs` |
| **Docker Support** | One-command deployment with Docker Compose |
| **Soft Delete** | Records are marked as deleted, not permanently removed |

---

## License

UNLICENSED

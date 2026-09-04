# MeetMind SaaS Backend API (`meeting-recorder-api`)

[![NestJS](https://img.shields.io/badge/NestJS-10.4.15-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.4.1-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Argon2id](https://img.shields.io/badge/Security-Argon2id-green?style=flat-square)](https://github.com/ranisalt/node-argon2)
[![Tests Passing](https://img.shields.io/badge/Tests-56%2F56%20Passing-brightgreen?style=flat-square)](https://jestjs.io/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](#license)

The core SaaS backend engine for **MeetMind**. Engineered with **NestJS**, **Prisma ORM**, and **PostgreSQL**, this service orchestrates unified authentication, offline cryptographic license generation, subscription lifecycle management, usage enforcement, administrative RBAC, and real-time infrastructure telemetry.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Core Capabilities](#-core-capabilities)
- [Database Schema & Architecture](#-database-schema--architecture)
- [Prerequisites](#-prerequisites)
- [Environment Configuration](#-environment-configuration)
- [Local Development Setup](#-local-development-setup)
  - [1. Database Initialization](#1-database-initialization)
  - [2. Prisma Schema Push & Client Generation](#2-prisma-schema-push--client-generation)
  - [3. Database Seeding & RBAC Initialization](#3-database-seeding--rbac-initialization)
  - [4. Starting the Dev Server](#4-starting-the-dev-server)
- [REST API Catalog](#-rest-api-catalog)
  - [Authentication & Account Security](#1-authentication--account-security-v1auth)
  - [Session Management](#2-session-management-v1sessions)
  - [Device Registration](#3-device-registration-v1devices)
  - [Entitlements & Cryptographic Licenses](#4-entitlements--cryptographic-licenses-v1entitlements)
  - [Billing & Invoices](#5-billing--invoices-v1billing)
  - [Recordings Telemetry](#6-recordings-telemetry-v1recordings)
  - [Admin Operations](#7-admin-operations-v1admin)
  - [System Health](#8-system-health-v1health)
- [Security & Cryptography Guarantees](#-security--cryptography-guarantees)
- [Automated Testing](#-automated-testing)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [License](#-license)

---

## 🏛 System Architecture

```
                                  ┌───────────────────────────┐
                                  │      Client Layers        │
                                  │  Web App   /  Desktop UI  │
                                  └─────────────┬─────────────┘
                                                │ HTTPS / JSON
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ MeetMind API Gateway (Port 3001)                                                         │
│                                                                                           │
│   [Helmet Headers]  ──►  [Throttler Rate Limit]  ──►  [Class-Validator ValidationPipe]    │
│                                                                                           │
│   ├── AuthModule              (Argon2id Hashing, JWT Access [15m], Refresh Tokens [30d])  │
│   ├── SessionsModule          (IP/User-Agent tracking, active session revocation)         │
│   ├── EntitlementsModule      (HMAC-SHA256 device-bound offline license token generator)  │
│   ├── BillingModule           (Stripe webhook handler + built-in dev billing provider)   │
│   ├── RecordingsModule        (Session start/heartbeat/complete telemetry tracking)       │
│   ├── AdminApiModule          (Strict RBAC, trial extensions, quota resets, user audit)   │
│   └── HealthModule            (Dynamic PostgreSQL latency ping, memory, service status)   │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │ Prisma ORM
                                              ▼
                             ┌───────────────────────────────────┐
                             │       PostgreSQL Database         │
                             │ (Port 5433: meeting_recorder_dev) │
                             └───────────────────────────────────┘
```

---

## 🌟 Core Capabilities

1. **Unified Identity & Argon2id Passwords**:
   - Secure registration, login, and password resets using state-of-the-art **Argon2id** password hashing (`m=65536, t=3, p=1`).
   - Dual-token architecture: Short-lived access JWTs (15 minutes) and long-lived cryptographically hashed refresh tokens (30 days) stored in PostgreSQL.
   - Email verification system with anti-enumeration protections, token invalidation, and rate-limited resend triggers (`POST /v1/auth/resend-verification`).

2. **Customer Session Management**:
   - Every login registers an active session with IP address, user-agent string, and last activity timestamp.
   - Customers can inspect all active logins and execute individual session revocation or nuclear **"Revoke all other sessions"** from both web and desktop.

3. **Cryptographic Offline Entitlement Licensing**:
   - Generates compact, tamper-proof license tokens signed with **HMAC-SHA256** (`OFFLINE_ENTITLEMENT_SECRET`).
   - Tokens bind to the client's unique machine identifier (`installationId`), encoding tier features, daily recording limits, and a 7-day offline validity window.
   - Allows the desktop engine (`recorder-core`) to record meetings seamlessly when disconnected from the internet.

4. **Tiered Subscription & Quota Enforcement**:
   - **Free Trial**: 30-day evaluation with an enforced **30-minute daily recording limit** (1800 seconds).
   - **Silver ($19/mo)** & **Gold ($39/mo)**: Unlimited daily recording, hardware video acceleration, and priority processing.
   - Real-time proration preview (`POST /v1/billing/preview-plan-change`) computing exact credit adjustments before confirming plan upgrades or downgrades.

5. **Multi-Role Administrative RBAC**:
   - Granular administrative permissions (`SUPER_ADMIN`, `SUPPORT_ADMIN`, `BILLING_ADMIN`, `ANALYTICS_ADMIN`, `READ_ONLY_ADMIN`).
   - Operational tools: Extend trial by 7 or custom days, reset daily usage quota, revoke sessions, modify plans, add staff notes, and inspect system audit logs.

6. **Infrastructure Telemetry & Dynamic Health**:
   - Real-time health check endpoint (`GET /v1/health` and `GET /v1/admin/system-health`) performing live PostgreSQL query ping latency checks, reporting heap memory usage, and evaluating provider connectivity.

---

## 🗄 Database Schema & Architecture

Prisma models mapped to PostgreSQL:

| Model | Table | Purpose |
| :--- | :--- | :--- |
| `User` | `users` | Primary identity record with status (`ACTIVE`, `DISABLED`) and verified email flag. |
| `UserProfile` | `user_profiles` | Timezone, country, language, avatar, and notification preferences. |
| `Session` | `sessions` | Active customer sessions with hashed refresh tokens, user agents, and IP addresses. |
| `AdminUser` | `admin_users` | Dedicated administrative identity records isolated from customer users. |
| `Role` / `Permission`| `roles` / `permissions` | Granular RBAC definitions for administrative operations. |
| `Device` | `devices` | Registered desktop installations tied to hardware installation IDs. |
| `Plan` / `PlanFeature`| `plans` / `plan_features`| Tier definitions (Trial, Silver, Gold), prices, and daily recording quotas. |
| `Subscription` | `subscriptions` | Active billing subscription with period start/end and provider references. |
| `Trial` | `trials` | 30-day customer trial state with extension audit metadata. |
| `DailyUsage` | `daily_usage` | Aggregated daily recording seconds, meeting counts, and AI requests per user. |
| `RecordingSession` | `recording_sessions` | Meeting metadata, platform (`google_meet`, `zoom`, `manual`), encoder, and timestamps. |
| `Invoice` / `Payment` | `invoices` / `payments` | Customer invoices with download links and transaction records. |
| `PaymentMethod` | `payment_methods` | Masked tokenized cards (brand, last4, expMonth, expYear). |
| `AuditLog` | `audit_logs` | Immutable audit trail capturing actor, entity, action, IP, and JSON payload. |
| `ApiHealthCheck` | `api_health_checks`| Historical infrastructure health records and latency measurements. |
| `EmailVerificationToken` | `email_verification_tokens` | Secure token hashes with expiry and revocation timestamps. |

---

## ⚙️ Prerequisites

- **Node.js**: `v18.17.0` or higher (tested on `v20.x` and `v22.x`)
- **PostgreSQL**: Version 14+ (Local dev runs on port `5433`)
- **OpenSSL / Libcrypto**: Required for Prisma engine and HMAC generation

---

## 🔧 Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Configuration Matrix

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | `number` | `3001` | Port on which the NestJS HTTP server listens. |
| `NODE_ENV` | `string` | `development` | Runtime environment (`development`, `production`, `test`). |
| `DATABASE_URL` | `string` (URI) | `postgresql://postgres@127.0.0.1:5433/meeting_recorder_dev?schema=public` | PostgreSQL connection string. |
| `JWT_ACCESS_SECRET` | `string` | — | Secret key for signing 15-minute access JWTs. |
| `JWT_REFRESH_SECRET` | `string` | — | Secret key for signing 30-day refresh JWTs. |
| `JWT_ACCESS_EXPIRATION` | `string` | `15m` | Lifetime of access tokens. |
| `JWT_REFRESH_EXPIRATION`| `string` | `30d` | Lifetime of refresh tokens. |
| `OFFLINE_ENTITLEMENT_SECRET` | `string` | — | Secret key used to generate HMAC-SHA256 offline license tokens. |
| `STRIPE_SECRET_KEY` | `string` | `sk_test_...` | Stripe API secret key (optional in dev mode). |
| `STRIPE_WEBHOOK_SECRET` | `string` | `whsec_...` | Stripe webhook signing secret. |
| `ADMIN_SEED_ENABLED` | `boolean`| `true` (dev) | Set to `true` to seed the default admin in local dev. **Must be `false` in production.** |
| `ADMIN_SEED_EMAIL` | `string` | `admin@meetingrecorder.local` | Email of initial seeded super admin. |
| `ADMIN_SEED_PASSWORD` | `string` | — | Plaintext seed password (hashed with Argon2id upon seeding). |
| `ADMIN_SEED_NAME` | `string` | `Super Administrator` | Display name of the seeded admin account. |

> [!CAUTION]
> **Production Security**: In production environments, set `ADMIN_SEED_ENABLED=false`. Never commit passwords or private API keys to version control.

---

## 🚀 Local Development Setup

### 1. Database Initialization
Ensure a local PostgreSQL instance is running on port `5433`:

```bash
# Verify PostgreSQL is accepting connections
pg_isready -h 127.0.0.1 -p 5433
```

### 2. Prisma Schema Push & Client Generation

Synchronize the PostgreSQL schema with the Prisma data model without writing migration scripts:

```bash
npm run prisma:generate
npm run prisma:push
```

### 3. Database Seeding & RBAC Initialization

Seed initial permissions, administrative roles, default subscription plans (`TRIAL`, `SILVER`, `GOLD`), and the local administrator user:

```bash
npm run prisma:seed
```

### 4. Starting the Dev Server

Launch the NestJS application with hot reloading:

```bash
npm run start:dev
```

Verify the API is operational:

```bash
curl http://localhost:3001/v1/health
```

Expected response:
```json
{
  "status": "HEALTHY",
  "database": "UP",
  "latencyMs": 4,
  "timestamp": "2026-09-04T13:45:00.000Z"
}
```

---

## 📡 REST API Catalog

All endpoints are prefixed with `/v1`.

### 1. Authentication & Account Security (`/v1/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/auth/register` | Public | Create new account; hashes password with Argon2id; provisions 30-day Free Trial. |
| `POST` | `/v1/auth/login` | Public | Authenticate with email/password; records session; returns access & refresh tokens. |
| `POST` | `/v1/auth/refresh` | Refresh JWT | Issues new 15-minute access token using valid 30-day refresh token. |
| `POST` | `/v1/auth/logout` | Bearer JWT | Revokes the current session refresh token in PostgreSQL. |
| `POST` | `/v1/auth/forgot-password` | Public | Initiates password reset flow; returns generic response to prevent email enumeration. |
| `POST` | `/v1/auth/reset-password` | Public | Validates reset token and sets new Argon2id password hash. |
| `POST` | `/v1/auth/verify-email` | Public | Verifies email confirmation token. |
| `POST` | `/v1/auth/resend-verification` | Public / Bearer | Generates a fresh verification token, revokes superseded tokens, and rate limits. |
| `GET` | `/v1/auth/me` | Bearer JWT | Retrieves the authenticated customer profile, active tier, and trial metadata. |

### 2. Session Management (`/v1/sessions`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/sessions` | Bearer JWT | Lists all active user sessions with IP, user-agent, creation date, and last activity. |
| `DELETE` | `/v1/sessions/:id` | Bearer JWT | Revokes a specific session by ID. |
| `DELETE` | `/v1/sessions` | Bearer JWT | Revokes all active sessions *except* the currently authenticated one. |

### 3. Device Registration (`/v1/devices`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/devices` | Bearer JWT | Lists desktop devices bound to the customer's account. |
| `POST` | `/v1/devices/register` | Bearer JWT | Registers a new desktop installation with hardware ID, platform, and app version. |
| `DELETE` | `/v1/devices/:id` | Bearer JWT | Revokes device authorization, invalidating offline licenses. |

### 4. Entitlements & Cryptographic Licenses (`/v1/entitlements`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/entitlements` | Bearer JWT | Returns current subscription plan, active features, daily limits, and remaining quota. |
| `POST` | `/v1/entitlements/verify` | Bearer JWT | Validates if the user is authorized to record right now based on daily limits. |
| `GET` | `/v1/entitlements/license-token` | Bearer JWT | Issues an HMAC-SHA256 signed offline license token bound to `installationId`. |

### 5. Billing & Invoices (`/v1/billing`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/billing/summary` | Bearer JWT | Overview of current tier, next billing date, card on file, and unpaid balance. |
| `POST` | `/v1/billing/checkout` | Bearer JWT | Initializes checkout session with Stripe or dev billing provider. |
| `POST` | `/v1/billing/preview-plan-change`| Bearer JWT | Calculates exact prorated credit and net payment for tier upgrade/downgrade. |
| `POST` | `/v1/billing/change-plan` | Bearer JWT | Applies immediate subscription tier switch with invoice generation. |
| `POST` | `/v1/billing/cancel-subscription`| Bearer JWT | Schedules subscription cancellation at current period end. |
| `GET` | `/v1/billing/invoices` | Bearer JWT | Returns past customer invoices with status, amounts, and period dates. |
| `GET` | `/v1/billing/invoices/:id/download` | Bearer JWT | Generates and streams invoice PDF document. |
| `GET` | `/v1/billing/payment-methods` | Bearer JWT | Lists tokenized credit cards on file. |

### 6. Recordings Telemetry (`/v1/recordings`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/recordings` | Bearer JWT | Lists recording sessions metadata (duration, platform, status). |
| `POST` | `/v1/recordings/start` | Bearer JWT | Begins a recording session; validates daily quota limits. |
| `POST` | `/v1/recordings/:id/heartbeat` | Bearer JWT | 30-second heartbeat incrementing daily recording usage seconds. |
| `POST` | `/v1/recordings/:id/complete` | Bearer JWT | Finalizes recording session duration and updates daily aggregates. |

### 7. Admin Operations (`/v1/admin`)

Requires Admin JWT with designated role permissions:

| Method | Endpoint | Required Permission | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/admin/login` | Public | Authenticates admin user with Argon2id check. |
| `GET` | `/v1/admin/dashboard` | `analytics.read` | Retrieves MRR, active trials, paying counts, system alerts. |
| `GET` | `/v1/admin/users` | `users.read` | Searchable user directory with status filters. |
| `GET` | `/v1/admin/users/:id` | `users.read` | Complete user inspector (profile, sessions, notes, usage). |
| `PATCH`| `/v1/admin/users/:id/status` | `users.delete` | Toggle customer status between `ACTIVE` and `DISABLED`. |
| `POST` | `/v1/admin/users/:id/extend-trial` | `trial.extend` | Extends customer trial by 7 days or custom day count. |
| `POST` | `/v1/admin/users/:id/reset-quota` | `trial.extend` | Resets customer's daily recording usage seconds to 0. |
| `POST` | `/v1/admin/users/:id/revoke-sessions` | `users.write` | Revokes all active customer sessions immediately. |
| `POST` | `/v1/admin/users/:id/change-plan` | `subscriptions.change_plan` | Administratively switches customer tier. |
| `POST` | `/v1/admin/users/:id/override-subscription`| `subscription.override` | Overrides subscription status, dates, or parameters. |
| `GET` | `/v1/admin/trials` | `users.read` | Trial conversion pipeline with expiration timelines. |
| `GET` | `/v1/admin/system-health` | `system.health` | Live PostgreSQL latency, service status, and memory metrics. |
| `GET` | `/v1/admin/audit-logs` | `audit.read` | Searchable administrative audit log ledger. |

### 8. System Health (`/v1/health`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/v1/health` | Public | Lightweight liveness probe reporting PostgreSQL status and ping latency in ms. |

---

## 🔒 Security & Cryptography Guarantees

1. **Password Security**: Passwords are never stored in plaintext. They are hashed using **Argon2id** (`timeCost=3`, `memoryCost=65536`, `parallelism=1`), offering resilience against GPU and ASIC brute-force attacks.
2. **Timing-Attack Resistance**: Authentication and password reset verification employ constant-time comparison checks.
3. **Anti-Enumeration Safeguards**: Password reset and verification endpoints return uniform generic responses regardless of whether the submitted email address exists in the database.
4. **Offline HMAC Licensing**: Offline licenses are signed with HMAC-SHA256 and bound to the host hardware ID (`installationId`). Any client-side modification of plan limits or expiration timestamps invalidates the signature.
5. **No Raw Media Hosting**: The API strictly manages metadata, authorization tokens, and telemetry. It **never** receives or stores recording video or audio files.

---

## 🧪 Automated Testing

The backend includes a comprehensive Jest test suite verifying controllers, services, guards, and database transactions:

```bash
# Run all unit and integration tests (in-band for DB safety)
npm test

# Run tests in watch mode during development
npm run test:watch

# Generate code coverage report
npm run test:cov
```

### Current Verification Status
- **Test Suites**: 4 passed, 4 total
- **Tests**: **56 passed, 56 total** (100% pass rate)
- **Coverage**: Auth, Billing, Sessions, Entitlements, Admin API, and System Health modules.

---

## ❓ Troubleshooting & FAQ

### 1. Database Connection Error (`P1001: Can't reach database server`)
- Verify PostgreSQL is running on port `5433`:
  ```bash
  ps aux | grep postgres
  ```
- Check your `DATABASE_URL` in `.env`. Ensure port matches `5433`:
  ```bash
  DATABASE_URL="postgresql://postgres@127.0.0.1:5433/meeting_recorder_dev?schema=public"
  ```

### 2. Admin Login fails with 401 Unauthorized
- Ensure database was seeded:
  ```bash
  npm run prisma:seed
  ```
- Check that `ADMIN_SEED_ENABLED=true` was set when running the seed script.

### 3. Rate Limit Triggered (`429 Too Many Requests`)
- The API applies Throttler guards to sensitive endpoints (e.g. login, registration, verification resend).
- Wait 60 seconds for the throttling bucket to reset, or adjust the rate limits in `src/common/guards/throttler.guard.ts` during development.

---

## 📄 License

Proprietary Software. All rights reserved © 2026 MeetMind Inc.

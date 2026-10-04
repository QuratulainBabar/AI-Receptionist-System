# AI Receptionist API

Node.js + Express + Prisma + PostgreSQL authentication service.

## Setup

1. Create a PostgreSQL database named `ai_receptionist`.
2. Copy env file and set your DB password:

```bash
cp .env.example .env
```

3. Install and migrate:

```bash
npm install
npx prisma migrate dev --name init_auth
npm run seed
npm run dev
```

API base: `http://localhost:4000`

## Auth endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | No | Patient/doctor signup |
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/auth/forgot-password` | No | Create reset token |
| POST | `/api/auth/reset-password` | No | Set new password with token |
| GET | `/api/auth/me` | Bearer JWT | Current user |
| GET | `/api/auth/patient-only` | Patient JWT | Role check |
| GET | `/api/auth/doctor-only` | Doctor JWT | Role check |

### Signup body

```json
{
  "fullName": "Maya Okonkwo",
  "email": "maya@example.com",
  "password": "Password123",
  "role": "patient"
}
```

`role` must be `"patient"` or `"doctor"`.

### Login body

```json
{
  "email": "patient@example.com",
  "password": "Patient123"
}
```

### Demo seed accounts

- Patient: `patient@example.com` / `Patient123`
- Doctor: `doctor@example.com` / `Doctor123`

In development, forgot-password responses include `resetToken` and `resetUrl` so you can test without email.

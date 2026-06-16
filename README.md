# IYIÉ Style — Email Admin

A branded email signup page + admin dashboard wired to Resend.

## Setup (5 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Then open `.env` and fill in:

| Variable | What to put |
|---|---|
| `RESEND_API_KEY` | Your key from resend.com → API Keys |
| `FROM_EMAIL` | e.g. `IYIÉ Style <hello@iyiestyle.com>` (must be verified on Resend) |
| `ADMIN_PASSWORD` | Whatever password you want for the dashboard |

### 3. Get your Resend API key
1. Go to [resend.com](https://resend.com) and sign up (free, no credit card)
2. Verify your email or domain under **Domains**
3. Go to **API Keys** → Create API Key → copy it into `.env`

> **Testing without a domain?** Use `onboarding@resend.dev` as your FROM_EMAIL.
> Emails will only send to your own verified email address in test mode.

### 4. Run it
```bash
npm start
```

Or with auto-reload during development:
```bash
npm run dev
```

---

## Pages

| URL | What it is |
|---|---|
| `http://localhost:3000` | Public signup page |
| `http://localhost:3000/admin.html` | Admin dashboard (password protected) |

---

## Features

- **Signup page** — IYIÉ-branded, collects name + email
- **Auto welcome email** — fires instantly when someone signs up
- **Admin dashboard** — see all subscribers, stats, remove people
- **Blast emails** — write + send to everyone, with `{{firstName}}` personalization
- **Unsubscribe** — automatic unsubscribe link in every email
- **Subscribers stored** in `data/subscribers.json` (no database needed)

---

## Sending blasts

1. Go to `http://localhost:3000/admin.html`
2. Log in with your admin password
3. Click **Send blast** in the sidebar
4. Write your subject + body
5. Use `{{firstName}}` in the body to personalize per subscriber
6. Hit **Send to all subscribers**

HTML is supported in the email body, so you can style it however you want.
# IyieCollections

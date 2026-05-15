# EC Travel and Tours - Backend Server (PayMongo)

Backend server handling PayMongo payments, webhook events, email notifications, and Google Sheet updates.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```
PAYMONGO_SECRET_KEY=your_paymongo_secret_key_here
PAYMONGO_WEBHOOK_SECRET=
EMAILJS_PRIVATE_KEY=your_emailjs_private_key
FRONTEND_URL=https://yoursite.com
PORT=3000
```

### 3. Register PayMongo Webhook (one-time)
```bash
node register-webhook.js https://your-render-url.onrender.com
```
Copy the printed `PAYMONGO_WEBHOOK_SECRET` into your `.env`, then restart.

### 4. Run the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```

### Save Booking
```
POST /save-booking
```
Saves booking data to Google Sheet.

### PayMongo — Create Checkout Session
```
POST /api/paymongo/create-checkout
```
Creates a PayMongo checkout session and returns `checkoutUrl`.

### PayMongo — Verify Payment
```
POST /api/paymongo/verify-payment
```
Verifies payment status after user returns from PayMongo.

### PayMongo — Webhook
```
POST /api/paymongo/webhook
```
Receives PayMongo payment events. Paste this URL into the PayMongo dashboard.

### Email Proxy
```
POST /api/send-email
```
Proxies EmailJS email sends from the backend.

## Deploy on Render

See `render.yaml` for deployment config. Set all environment variables in the Render dashboard — never commit real credentials.

## Webhook URL for PayMongo Dashboard
```
https://your-render-url.onrender.com/api/paymongo/webhook
```

## Notes

- Webhook signature verification is enabled automatically when `PAYMONGO_WEBHOOK_SECRET` is set
- All timestamps are in UTC
- Store secrets only in `.env` and never commit real credentials

## Troubleshooting

1. **"Missing Twilio Credentials"** - Ensure `.env` file is properly configured
2. **"Booking save failed"** - Verify the Apps Script Web App URL and deployment permissions
3. **"Missing required fields"** - Ensure `firstName`, `lastName`, and `email` are sent in request body

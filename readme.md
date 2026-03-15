# EC Travel and Tours - Backend Server

Backend server for server-side integrations (including PayPal order create + capture).

## Important

For PayPal-required booking flow, this backend is required because PayPal API credentials must stay on server-side.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the backend directory:
```
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_ENV=sandbox
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
PORT=3000
```

### 3. Run the Server

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
Returns server status.

### Save Booking
```
POST /save-booking
Content-Type: application/json

{
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "email": "guest@example.com",
  "travelDate": "2026-03-10",
  "package": "CORON - EL NIDO"
}
```

### Create PayPal Order
```
POST /paypal/create-order
Content-Type: application/json

{
  "amount": 10000,
  "currency": "PHP",
  "guestName": "Juan Dela Cruz",
  "email": "guest@example.com",
  "description": "Down payment",
  "successUrl": "https://your-site.com/booking.html?paypal=success",
  "cancelUrl": "https://your-site.com/booking.html?paypal=cancelled"
}
```

### Capture PayPal Order
```
POST /paypal/capture-order/:orderId
```

### PayPal Webhook Receiver
```
POST /paypal/webhook
```
Receives and verifies PayPal webhook events using `PAYPAL_WEBHOOK_ID`.

**Response:**
```json
{
  "success": true,
  "message": "Booking saved successfully",
  "timestamp": "2026-01-20T...",
  "sheetUpdated": true
}
```

## Notes

- Booking save uses the Google Apps Script Web App URL configured in `server.js`
- `/save-booking` forwards booking data to Apps Script with `action: 'save_booking'`
- PayPal endpoints require `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in backend `.env`
- Webhook verification also requires `PAYPAL_WEBHOOK_ID` in backend `.env`
- All timestamps are in UTC
- Store secrets only in `.env` and never commit real credentials

## Render Deploy Checklist

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Required env vars: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID`
- Optional env var: `PORT` (Render usually sets this automatically)

## Troubleshooting

1. **"Missing PayPal Credentials"** - Ensure `.env` has `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
2. **"Booking save failed"** - Verify the Apps Script Web App URL and deployment permissions
3. **"Missing required fields"** - Ensure `firstName`, `lastName`, and `email` are sent in request body

# EC Travel and Tours - Backend Server

Optional backend server for advanced server-side features.

## Important

For the current production setup, booking data is saved directly from `booking.html`
to a Google Apps Script Web App, so this backend is **not required** for the current booking flow.
Use this backend only if you need private server-side integrations.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the backend directory:
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
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
- All timestamps are in UTC
- Store secrets only in `.env` and never commit real credentials

## Troubleshooting

1. **"Missing Twilio Credentials"** - Ensure `.env` file is properly configured
2. **"Booking save failed"** - Verify the Apps Script Web App URL and deployment permissions
3. **"Missing required fields"** - Ensure `firstName`, `lastName`, and `email` are sent in request body

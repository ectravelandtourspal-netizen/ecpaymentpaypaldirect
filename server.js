const express = require('express');
const cors = require('cors');
require('dotenv').config();


const app = express();
app.use(express.json());
app.use(cors());



// Import shared booking logic and cache
const { pendingBookings, saveBookingToSheet } = require('./booking-utils');
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// Note: Mark coupon endpoint removed - coupons now support multiple uses with no expiry

// Save booking endpoint (original: save directly to Google Sheet)
app.post('/save-booking', async (req, res) => {
  const bookingData = req.body;
  if (!bookingData.firstName || !bookingData.lastName || !bookingData.email) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: firstName, lastName, email'
    });
  }
  try {
    console.log(`\n📝 Saving Booking:`);
    console.log(`   Guest: ${bookingData.firstName} ${bookingData.lastName}`);
    console.log(`   Email: ${bookingData.email}`);
    const sheetUpdated = await saveBookingToSheet(bookingData);
    if (sheetUpdated) {
      res.json({
        success: true,
        message: 'Booking saved successfully',
        timestamp: new Date(),
        sheetUpdated: true
      });
    } else {
      res.json({
        success: true,
        message: 'Booking recorded (sheet update may have failed)',
        timestamp: new Date(),
        sheetUpdated: false
      });
    }
  } catch (error) {
    console.error('❌ Error saving booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});


// Integrate PayPal webhook route
const paypalWebhookRouter = require('./paypal-webhook');
app.use('/', paypalWebhookRouter);

// --- NEW: PayPal direct payment booking endpoint ---
const fetch = require('node-fetch');

// Replace with your PayPal credentials
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || 'YOUR_PAYPAL_CLIENT_SECRET';
const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com'; // Use sandbox for testing

// Util: Get PayPal access token
async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

// Util: Create PayPal order
async function createPayPalOrder(bookingData, downpayment) {
  const accessToken = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'PHP',
            value: String(downpayment),
          },
          custom_id: bookingData.email, // This is how we link payment to booking
        },
      ],
      application_context: {
        brand_name: 'EC Travel and Tours',
        user_action: 'PAY_NOW',
        // Set your actual frontend URL for return/cancel
        return_url: 'https://ectravelandtours.com/booking-success.html',
        cancel_url: 'https://ectravelandtours.com/booking-cancelled.html',
      },
    }),
  });
  const data = await res.json();
  return data;
}

// POST /api/booking: Store booking, create PayPal order, return PayPal URL
app.post('/api/booking', async (req, res) => {
  try {
    const bookingData = req.body;
    if (!bookingData.email) {
      return res.status(400).json({ success: false, error: 'Missing email' });
    }
    // Calculate downpayment (use frontend logic or override here)
    const downpayment = bookingData.downpayment || 5000 * (parseInt(bookingData.numberOfGuests, 10) || 1);
    // Store booking in pendingBookings
    pendingBookings[bookingData.email] = bookingData;
    // Create PayPal order
    const order = await createPayPalOrder(bookingData, downpayment);
    const approveUrl = order.links && order.links.find(l => l.rel === 'approve');
    if (approveUrl) {
      return res.json({ success: true, paypalUrl: approveUrl.href });
    } else {
      return res.status(500).json({ success: false, error: 'Failed to create PayPal order', details: order });
    }
  } catch (err) {
    console.error('❌ /api/booking error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 EC Travel Backend Server running on http://localhost:${PORT}`);
  console.log('\n✅ Endpoints:');
  console.log(`  - GET  /health`);
  console.log(`  - POST /save-booking (Saves booking to Google Sheet)`);
  console.log(`  - POST /paypal-webhook (PayPal payment webhook)`);
});

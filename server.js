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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 EC Travel Backend Server running on http://localhost:${PORT}`);
  console.log('\n✅ Endpoints:');
  console.log(`  - GET  /health`);
  console.log(`  - POST /save-booking (Saves booking to Google Sheet)`);
  console.log(`  - POST /paypal-webhook (PayPal payment webhook)`);
});

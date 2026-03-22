const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { saveBookingToSheet } = require('./server'); // Reuse booking save logic

// Util: Send confirmation email (implement as needed)
async function sendConfirmationEmail(bookingData) {
  // TODO: Integrate with your email service (e.g., nodemailer, SendGrid, EmailJS)
  console.log('📧 [MOCK] Sending confirmation email to:', bookingData.email);
  return true;
}

// PayPal Webhook endpoint
router.post('/paypal-webhook', async (req, res) => {
  const event = req.body;
  // PayPal webhook event types: https://developer.paypal.com/docs/api-basics/notifications/webhooks/event-names/
  if (!event || !event.event_type) {
    return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
  }

  // Only process completed payments
  if (event.event_type === 'PAYMENT.SALE.COMPLETED' || event.event_type === 'CHECKOUT.ORDER.APPROVED') {
    try {
      // Custom field should contain the user's email (set in PayPal redirect)
      const payerEmail = event.resource.custom || event.resource.payer?.email_address;
      if (!payerEmail) {
        return res.status(400).json({ success: false, error: 'No payer email in webhook' });
      }
      // Retrieve booking data (should be stored by email, e.g., in a DB or in-memory cache)
      // For demo: assume booking data is sent in webhook (custom integration needed for production)
      const bookingData = event.resource.bookingData || null;
      if (!bookingData) {
        // In production, look up bookingData by payerEmail from your DB/cache
        return res.status(400).json({ success: false, error: 'No booking data found for email' });
      }
      // Save booking to Google Sheet
      await saveBookingToSheet(bookingData);
      // Send confirmation email
      await sendConfirmationEmail(bookingData);
      return res.json({ success: true, message: 'Booking processed after PayPal payment' });
    } catch (err) {
      console.error('❌ PayPal webhook error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  // Ignore other event types
  res.json({ success: true, message: 'Event ignored' });
});

module.exports = router;

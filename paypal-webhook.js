const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { saveBookingToSheet, pendingBookings } = require('./booking-utils'); // Reuse booking save logic and cache

// Util: Send confirmation email using EmailJS from Node.js
const emailjs = require('@emailjs/nodejs');

// These should be set in your .env or hardcoded for now
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || 'oICGyBSpy8vOU95iJ';
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_71wxksu';
const EMAILJS_TEMPLATE_GUEST = process.env.EMAILJS_TEMPLATE_GUEST || 'template_xzc9veh';
const EMAILJS_TEMPLATE_COMPANY = process.env.EMAILJS_TEMPLATE_COMPANY || 'template_102pzgp';

async function sendConfirmationEmail(bookingData) {
  try {
    // 1️⃣ Email to GUEST
    const guestEmailParams = {
      to_email: bookingData.email,
      user_email: bookingData.email,
      email: bookingData.email,
      recipient_email: bookingData.email,
      recipient: bookingData.email,
      // Content
      guest_name: bookingData.firstName + ' ' + bookingData.lastName,
      travel_date: bookingData.travelDate,
      package: bookingData.package,
      number_of_guests: bookingData.numberOfGuests,
      total_price: bookingData.totalPrice,
      payment_method: bookingData.paymentMethod,
      // Add more fields as needed
    };
    const guestResponse = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_GUEST, guestEmailParams, EMAILJS_PUBLIC_KEY);
    console.log('✅ Guest email sent! Status:', guestResponse.status);

    // 2️⃣ Email to COMPANY
    const companyEmailParams = {
      to_email: 'ectravelandtourspal@gmail.com',
      user_email: 'ectravelandtourspal@gmail.com',
      email: 'ectravelandtourspal@gmail.com',
      recipient_email: 'ectravelandtourspal@gmail.com',
      recipient: 'ectravelandtourspal@gmail.com',
      // Content
      company_name: 'EC Travel and Tours',
      guest_name: bookingData.firstName + ' ' + bookingData.lastName,
      guest_email: bookingData.email,
      guest_phone: bookingData.phone,
      guest_address: bookingData.address,
      guest_city: bookingData.city,
      guest_country: bookingData.country,
      travel_date: bookingData.travelDate,
      package: bookingData.package,
      number_of_guests: bookingData.numberOfGuests,
      total_price: bookingData.totalPrice,
      payment_method: bookingData.paymentMethod,
      // Add more fields as needed
    };
    const companyResponse = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_COMPANY, companyEmailParams, EMAILJS_PUBLIC_KEY);
    console.log('✅ Company email sent! Status:', companyResponse.status);
    return true;
  } catch (error) {
    console.error('❌ Error sending emails:', error);
    return false;
  }
}

// PayPal Webhook endpoint
router.post('/paypal-webhook', async (req, res) => {
  const event = req.body;
  console.log('\n🔔 PayPal Webhook called');
  console.log('Event payload:', JSON.stringify(event, null, 2));
  // PayPal webhook event types: https://developer.paypal.com/docs/api-basics/notifications/webhooks/event-names/
  if (!event || !event.event_type) {
    console.error('❌ Invalid webhook payload');
    return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
  }

  console.log('Event type:', event.event_type);

  // Only process completed payments
  if (event.event_type === 'PAYMENT.SALE.COMPLETED' || event.event_type === 'CHECKOUT.ORDER.APPROVED') {
    try {
      // Custom field should contain the user's email (set in PayPal redirect)
      const payerEmail = event.resource.custom || event.resource.payer?.email_address;
      console.log('Payer email from webhook:', payerEmail);
      if (!payerEmail) {
        console.error('❌ No payer email in webhook');
        return res.status(400).json({ success: false, error: 'No payer email in webhook' });
      }
      // Retrieve booking data from in-memory cache
      const bookingData = pendingBookings && pendingBookings[payerEmail] ? pendingBookings[payerEmail] : null;
      if (!bookingData) {
        console.error('❌ No booking data found for email:', payerEmail);
        return res.status(400).json({ success: false, error: 'No booking data found for email' });
      }
      console.log('✅ Booking data found in cache:', JSON.stringify(bookingData, null, 2));
      // Optionally: remove from cache after use
      if (pendingBookings) delete pendingBookings[payerEmail];
      // Save booking to Google Sheet
      const sheetResult = await saveBookingToSheet(bookingData);
      console.log('Google Sheet save result:', sheetResult);
      // Send confirmation email
      const emailResult = await sendConfirmationEmail(bookingData);
      console.log('Email send result:', emailResult);
      return res.json({ success: true, message: 'Booking processed after PayPal payment' });
    } catch (err) {
      console.error('❌ PayPal webhook error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  // Ignore other event types
  console.log('Event type ignored:', event.event_type);
  res.json({ success: true, message: 'Event ignored' });
});

module.exports = router;

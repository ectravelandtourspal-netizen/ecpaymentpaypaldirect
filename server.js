const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// PayPal webhook needs raw body for signature verification — must be before express.json()
app.post('/api/paypal/webhook', express.raw({ type: 'application/json' }), handlePayPalWebhook);

app.use(express.json());

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8000';
const ALLOWED_ORIGINS = FRONTEND_URL.split(',').map(u => u.trim());
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Google Apps Script Web App URL for updating Google Sheet
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyyQv8WPzCU60mUc2nJRTpVNJDfnK4yMm7h8B22bUQs8iMROcTrAGHeS5tdw6TS62tE/exec';

// ================= PAYPAL CONFIGURATION =================
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_BASE_URL = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';

// Get PayPal access token
async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal auth failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Create PayPal order
async function createPayPalOrder(amount, currency, description, returnUrl, cancelUrl) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toFixed(2),
        },
        description: description,
      }],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        brand_name: 'EC Travel and Tours',
        user_action: 'PAY_NOW',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal order creation failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// Capture PayPal order
async function capturePayPalOrder(orderId) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal capture failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}
// Note: Using single URL for both coupon and booking operations - differentiated by "action" field

// Update Google Sheet using Google Apps Script - Mark coupon as used
async function markCouponAsUsedInSheet(couponCode, guestName, guestEmail) {
  try {
    console.log(`\n📝 Updating Google Sheet via Apps Script for coupon: ${couponCode}`);
    console.log(`   Guest: ${guestName}`);
    console.log(`   Email: ${guestEmail}`);
    
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'mark_coupon',
        couponCode: couponCode,
        guestName: guestName,
        guestEmail: guestEmail,
        remark: 'website',
        newStatus: 'used'
      })
    });

    const result = await response.json();
    
    if (result.success && result.updated) {
      console.log(`✅ Sheet updated successfully!`);
      console.log(`   Coupon: ${couponCode} marked as used by ${guestName}`);
      return true;
    } else {
      console.error(`❌ Sheet update failed:`, result.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating Google Sheet via Apps Script:');
    console.error('   Message:', error.message);
    return false;
  }
}

// Save booking data to Google Sheet
async function saveBookingToSheet(bookingData) {
  try {
    console.log(`\n📋 Saving booking to Google Sheet...`);
    console.log(`   Guest: ${bookingData.firstName} ${bookingData.lastName}`);
    console.log(`   Email: ${bookingData.email}`);
    console.log(`   Package: ${bookingData.package}`);
    
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save_booking',
        bookingDateSubmitted: bookingData.bookingDateSubmitted || new Date().toISOString(),
        travelDate: bookingData.travelDate,
        firstName: bookingData.firstName,
        lastName: bookingData.lastName,
        email: bookingData.email,
        phone: bookingData.phone,
        address: bookingData.address,
        city: bookingData.city,
        country: bookingData.country,
        numberOfGuests: bookingData.numberOfGuests,
        package: bookingData.package,
        foodRestriction: bookingData.foodRestriction,
        specialRequests: bookingData.specialRequests,
        emergencyTitle: bookingData.emergencyTitle,
        emergencyFirstName: bookingData.emergencyFirstName,
        emergencyLastName: bookingData.emergencyLastName,
        emergencyPhone: bookingData.emergencyPhone,
        emergencyRelationship: bookingData.emergencyRelationship,
        couponCode: bookingData.couponCode,
        discountAmount: bookingData.discountAmount,
        paymentMethod: bookingData.paymentMethod,
        paymentFee: bookingData.paymentFee,
        totalPrice: bookingData.totalPrice,
        birthday: bookingData.birthday,
        nationality: bookingData.nationality
      })
    });

    const result = await response.json();
    
    if (result.success && result.saved) {
      console.log(`✅ Booking saved successfully!`);
      console.log(`   Guest: ${bookingData.firstName} ${bookingData.lastName}`);
      return true;
    } else {
      console.error(`❌ Booking save failed:`, result.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.error('❌ Error saving booking to Google Sheet:');
    console.error('   Message:', error.message);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// Note: Mark coupon endpoint removed - coupons now support multiple uses with no expiry

// Save booking endpoint
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

// ================= PAYPAL ENDPOINTS =================

// Create PayPal order — called by frontend before redirecting user to PayPal
app.post('/api/paypal/create-order', async (req, res) => {
  const { amount, currency, description } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid amount' });
  }
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ success: false, error: 'PayPal credentials not configured' });
  }

  try {
    const primaryOrigin = ALLOWED_ORIGINS[0];
    const returnUrl = `${primaryOrigin}/booking.html?paypal=capture`;
    const cancelUrl = `${primaryOrigin}/booking.html?paypal=cancelled`;

    const order = await createPayPalOrder(
      parseFloat(amount),
      currency || 'PHP',
      description || 'EC Travel Booking Downpayment',
      returnUrl,
      cancelUrl
    );

    const approvalLink = order.links.find(link => link.rel === 'approve');
    if (!approvalLink) {
      return res.status(500).json({ success: false, error: 'No approval URL from PayPal' });
    }

    console.log(`✅ PayPal order created: ${order.id} for ₱${amount}`);

    res.json({
      success: true,
      orderId: order.id,
      approvalUrl: approvalLink.href,
    });
  } catch (error) {
    console.error('❌ PayPal create-order error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Capture PayPal order — called by frontend after user returns from PayPal
app.post('/api/paypal/capture-order', async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Missing orderId' });
  }

  try {
    const captureData = await capturePayPalOrder(orderId);

    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    const transactionId = capture?.id || '';
    const status = captureData.status; // COMPLETED
    const grossAmount = capture?.amount?.value || '0';
    const receivedCurrency = capture?.amount?.currency_code || 'PHP';

    // Net amount = what you actually receive after PayPal fees
    const breakdown = capture?.seller_receivable_breakdown;
    const netAmount = breakdown?.net_amount?.value || grossAmount;
    const paypalFee = breakdown?.paypal_fee?.value || '0';

    console.log(`✅ PayPal payment captured: ${transactionId} — ${receivedCurrency} gross: ${grossAmount}, net: ${netAmount}, fee: ${paypalFee} — Status: ${status}`);

    res.json({
      success: status === 'COMPLETED',
      transactionId,
      status,
      receivedAmount: netAmount,
      grossAmount,
      paypalFee,
      receivedCurrency,
    });
  } catch (error) {
    console.error('❌ PayPal capture-order error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= EMAIL PROXY =================
// Proxy EmailJS calls through the backend to avoid IPv6 connectivity issues

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

app.post('/api/send-email', async (req, res) => {
  const { service_id, template_id, template_params, user_id } = req.body;

  if (!service_id || !template_id || !template_params || !user_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const response = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id, template_id, template_params, user_id }),
    });

    const text = await response.text();

    if (response.ok) {
      console.log(`✅ Email sent via ${template_id}`);
      res.json({ success: true, status: response.status, text });
    } else {
      console.error(`❌ EmailJS error: ${response.status} ${text}`);
      res.status(response.status).json({ success: false, error: text });
    }
  } catch (error) {
    console.error('❌ Email proxy error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= PAYPAL WEBHOOK =================

// Verify PayPal webhook signature using PayPal's verification API
async function verifyWebhookSignature(headers, rawBody) {
  if (!PAYPAL_WEBHOOK_ID) {
    console.warn('⚠️ PAYPAL_WEBHOOK_ID not set — skipping signature verification');
    return false;
  }

  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Webhook signature verification request failed:', errorText);
    return false;
  }

  const result = await response.json();
  return result.verification_status === 'SUCCESS';
}

// Map PayPal event types to sheet-friendly payment statuses
function mapEventToPaymentStatus(eventType) {
  const statusMap = {
    'PAYMENT.CAPTURE.COMPLETED': 'Paid',
    'PAYMENT.CAPTURE.REFUNDED': 'Refunded',
    'PAYMENT.CAPTURE.REVERSED': 'Reversed',
    'PAYMENT.CAPTURE.DENIED': 'Denied',
    'PAYMENT.CAPTURE.PENDING': 'Pending',
  };
  return statusMap[eventType] || eventType;
}

// Update Google Sheet payment status via Apps Script
async function updatePaymentStatusInSheet(transactionId, newStatus, eventType, eventDetails) {
  try {
    console.log(`📋 Updating Google Sheet: Transaction ${transactionId} → ${newStatus}`);

    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_payment_status',
        paypalTransactionId: transactionId,
        paymentStatus: newStatus,
        eventType: eventType,
        eventDetails: eventDetails,
      }),
    });

    const result = await response.json();
    if (result.success || result.status === 'success') {
      console.log(`✅ Sheet updated: ${transactionId} → ${newStatus} (rows: ${result.updatedRows || 0})`);
      return true;
    } else {
      console.error('❌ Sheet update failed:', result.error || result.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating sheet via Apps Script:', error.message);
    return false;
  }
}

// PayPal webhook handler
async function handlePayPalWebhook(req, res) {
  const rawBody = req.body.toString('utf8');

  console.log('\n🔔 PayPal Webhook received');

  // Parse event
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('❌ Invalid webhook JSON');
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event.event_type;
  console.log(`   Event: ${eventType}`);
  console.log(`   ID: ${event.id}`);

  // Verify signature (if webhook ID is configured)
  if (PAYPAL_WEBHOOK_ID) {
    try {
      const isValid = await verifyWebhookSignature(req.headers, rawBody);
      if (!isValid) {
        console.error('❌ Webhook signature verification FAILED — rejecting');
        return res.status(401).json({ error: 'Signature verification failed' });
      }
      console.log('   ✅ Signature verified');
    } catch (verifyError) {
      console.error('❌ Webhook verification error:', verifyError.message);
      return res.status(500).json({ error: 'Verification error' });
    }
  }

  // Handle payment capture events
  const HANDLED_EVENTS = [
    'PAYMENT.CAPTURE.COMPLETED',
    'PAYMENT.CAPTURE.REFUNDED',
    'PAYMENT.CAPTURE.REVERSED',
    'PAYMENT.CAPTURE.DENIED',
    'PAYMENT.CAPTURE.PENDING',
  ];

  if (HANDLED_EVENTS.includes(eventType)) {
    const resource = event.resource || {};
    // For refund events, the transaction ID is in resource.links or resource.id
    // For capture events, it's resource.id
    let transactionId = '';

    if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      // Refund event: resource is the refund object, parent capture ID is in links
      const captureLink = (resource.links || []).find(l => l.rel === 'up');
      if (captureLink && captureLink.href) {
        // Extract capture ID from URL: .../captures/CAPTURE_ID
        const parts = captureLink.href.split('/');
        transactionId = parts[parts.length - 1];
      }
      // Fallback: check supplementary_data
      if (!transactionId) {
        transactionId = resource.supplementary_data?.related_ids?.capture_id || resource.id || '';
      }
    } else {
      // For COMPLETED, DENIED, PENDING, REVERSED — resource.id IS the capture/transaction ID
      transactionId = resource.id || '';
    }

    const newStatus = mapEventToPaymentStatus(eventType);
    const eventDetails = `${eventType} at ${event.create_time || new Date().toISOString()}`;

    console.log(`   Transaction: ${transactionId}`);
    console.log(`   New Status: ${newStatus}`);

    if (transactionId) {
      await updatePaymentStatusInSheet(transactionId, newStatus, eventType, eventDetails);
    } else {
      console.warn('⚠️ Could not extract transaction ID from webhook event');
    }
  } else {
    console.log(`   ℹ️ Unhandled event type: ${eventType} — ignored`);
  }

  // Always return 200 to PayPal so it doesn't retry
  res.status(200).json({ received: true });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 EC Travel Backend Server running on http://localhost:${PORT}`);
  console.log(`   PayPal Mode: ${PAYPAL_MODE}`);
  console.log(`   Frontend URL: ${FRONTEND_URL}`);
  console.log('\n✅ Endpoints:');
  console.log(`  - GET  /health`);
  console.log(`  - POST /save-booking (Saves booking to Google Sheet)`);
  console.log(`  - POST /api/paypal/create-order (Create PayPal checkout)`);
  console.log(`  - POST /api/paypal/capture-order (Capture PayPal payment)`);
  console.log(`  - POST /api/paypal/webhook (PayPal event notifications)`);
  console.log(`  - POST /api/send-email (Email proxy via EmailJS)`);
  if (PAYPAL_WEBHOOK_ID) {
    console.log(`\n🔔 Webhook signature verification: ENABLED`);
  } else {
    console.log(`\n⚠️  Webhook signature verification: DISABLED (set PAYPAL_WEBHOOK_ID to enable)`);
  }
});

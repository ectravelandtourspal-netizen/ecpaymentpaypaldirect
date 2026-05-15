const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const app = express();

// PayMongo webhook needs raw body for signature verification — must be before express.json()
app.post('/api/paymongo/webhook', express.raw({ type: 'application/json' }), handlePayMongoWebhook);

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
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMRGcupMkfPF1s76W8wek9B-GvvjsJyf7TSkuhcBsifMR4hygOdvD_1fkFALnTd9g/exec';

// ================= PAYMONGO CONFIGURATION =================
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET || '';
const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';

// In-memory store for pending bookings (webhook uses this for email data)
const pendingBookings = new Map();
// Clean up entries older than 24 hours every hour
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, entry] of pendingBookings) {
    if (entry.createdAt < cutoff) pendingBookings.delete(id);
  }
}, 60 * 60 * 1000);

// Create PayMongo checkout session
async function createPayMongoCheckout(amount, currency, description, successUrl, cancelUrl, metadata) {
  const auth = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');

  const requestBody = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        description: description,
        line_items: [{
          currency: currency,
          amount: Math.round(amount * 100), // PayMongo uses centavos
          name: description,
          quantity: 1,
        }],
        payment_method_types: [
          'gcash', 'card'
        ],
        metadata: metadata || {},
        success_url: successUrl,
        cancel_url: cancelUrl,
      }
    }
  };

  console.log('📤 PayMongo request:', JSON.stringify(requestBody, null, 2));
  console.log('📤 Auth key starts with:', PAYMONGO_SECRET_KEY?.substring(0, 10) + '...');

  const response = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ PayMongo API response:', response.status, errorText);
    throw new Error(`PayMongo checkout creation failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// Retrieve PayMongo checkout session
async function retrievePayMongoCheckout(checkoutSessionId) {
  const auth = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');
  const response = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayMongo retrieve failed: ${response.status} - ${errorText}`);
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

// ================= PAYMONGO ENDPOINTS =================

// Create PayMongo checkout session — called by frontend before redirecting user
app.post('/api/paymongo/create-checkout', async (req, res) => {
  const { amount, currency, description, returnUrl, bookingMetadata } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid amount' });
  }
  if (!PAYMONGO_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'PayMongo credentials not configured' });
  }

  try {
    // Use returnUrl from frontend if provided, otherwise fall back to origin-based URL
    const baseUrl = returnUrl || `${req.headers.origin || ALLOWED_ORIGINS[0]}/booking.html`;
    const successUrl = `${baseUrl}?paymongo=success`;
    const cancelUrl = `${baseUrl}?paymongo=cancelled`;

    // Build metadata for PayMongo (all values must be strings)
    const metadata = {};
    if (bookingMetadata) {
      for (const [key, val] of Object.entries(bookingMetadata)) {
        metadata[key] = String(val ?? '');
      }
    }

    const checkout = await createPayMongoCheckout(
      parseFloat(amount),
      currency || 'PHP',
      description || 'EC Travel Booking Downpayment',
      successUrl,
      cancelUrl,
      metadata
    );

    const checkoutUrl = checkout.data.attributes.checkout_url;
    const checkoutId = checkout.data.id;

    if (!checkoutUrl) {
      return res.status(500).json({ success: false, error: 'No checkout URL from PayMongo' });
    }

    // Store booking data for webhook to use when sending email
    if (bookingMetadata) {
      pendingBookings.set(checkoutId, {
        bookingData: bookingMetadata,
        createdAt: Date.now()
      });
    }

    console.log(`✅ PayMongo checkout created: ${checkoutId} for ₱${amount}`);

    res.json({
      success: true,
      checkoutId: checkoutId,
      checkoutUrl: checkoutUrl,
    });
  } catch (error) {
    console.error('❌ PayMongo create-checkout error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify PayMongo payment — called by frontend after user returns from PayMongo
app.post('/api/paymongo/verify-payment', async (req, res) => {
  const { checkoutId } = req.body;

  if (!checkoutId) {
    return res.status(400).json({ success: false, error: 'Missing checkoutId' });
  }

  try {
    const checkoutData = await retrievePayMongoCheckout(checkoutId);
    const attributes = checkoutData.data.attributes;
    const paymentStatus = attributes.status; // e.g. 'paid', 'expired', 'active'
    const payments = attributes.payments || [];
    
    let transactionId = '';
    let grossAmount = '0';
    let netAmount = '0';
    let fee = '0';
    let receivedCurrency = 'PHP';

    if (payments.length > 0) {
      const payment = payments[0];
      transactionId = payment.id || '';
      const paymentAttrs = payment.attributes || {};
      grossAmount = (paymentAttrs.amount / 100).toFixed(2); // PayMongo stores in centavos
      netAmount = paymentAttrs.net_amount ? (paymentAttrs.net_amount / 100).toFixed(2) : grossAmount;
      fee = paymentAttrs.fee ? (paymentAttrs.fee / 100).toFixed(2) : '0';
      receivedCurrency = paymentAttrs.currency || 'PHP';
    }

    const isPaid = paymentStatus === 'paid' || (payments.length > 0 && payments[0].attributes?.status === 'paid');

    console.log(`✅ PayMongo payment verified: ${transactionId} — ${receivedCurrency} gross: ${grossAmount}, net: ${netAmount}, fee: ${fee} — Status: ${paymentStatus}`);

    res.json({
      success: isPaid,
      transactionId,
      status: paymentStatus,
      receivedAmount: netAmount,
      grossAmount,
      paymongoFee: fee,
      receivedCurrency,
    });
  } catch (error) {
    console.error('❌ PayMongo verify-payment error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update sheet status by checkoutId — frontend fallback in case webhook is delayed
app.post('/api/paymongo/update-sheet-status', async (req, res) => {
  const { checkoutId, transactionId, receivedAmount, paymentStatus } = req.body;

  if (!checkoutId) {
    return res.status(400).json({ success: false, error: 'Missing checkoutId' });
  }

  try {
    const updated = await updatePaymentByCheckoutId(checkoutId, transactionId, receivedAmount, paymentStatus);
    res.json({ success: updated });
  } catch (error) {
    console.error('❌ update-sheet-status error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= EMAIL PROXY =================
// Proxy EmailJS calls through the backend to avoid IPv6 connectivity issues

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';

app.post('/api/send-email', async (req, res) => {
  const { service_id, template_id, template_params, user_id } = req.body;

  if (!service_id || !template_id || !template_params || !user_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const emailPayload = { service_id, template_id, template_params, user_id };
    if (EMAILJS_PRIVATE_KEY) {
      emailPayload.accessToken = EMAILJS_PRIVATE_KEY;
    }

    const response = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
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

// ================= PAYMONGO WEBHOOK =================

// Send confirmation email via EmailJS (used by webhook)
async function sendConfirmationEmailFromWebhook(bookingData, transactionId, receivedAmount) {
  try {
    const guestEmailParams = {
      to_email: bookingData.email,
      user_email: bookingData.email,
      email: bookingData.email,
      recipient_email: bookingData.email,
      recipient: bookingData.email,
      guest_name: `${bookingData.firstName} ${bookingData.lastName}`,
      package_name: bookingData.packageName || '',
      travel_date: bookingData.travelDate || '',
      number_of_guests: bookingData.numberOfGuests || '',
      guest_address: bookingData.address || '',
      guest_city: bookingData.city || '',
      guest_country: bookingData.country || '',
      guest_phone: bookingData.phone || '',
      emergency_contact_title: bookingData.emergencyTitle || '',
      emergency_contact_first_name: bookingData.emergencyFirstName || '',
      emergency_contact_last_name: bookingData.emergencyLastName || '',
      emergency_contact_phone: bookingData.emergencyPhone || '',
      emergency_contact_relationship: bookingData.emergencyRelationship || '',
      subtotal_price: bookingData.subtotalPrice ? `₱${parseFloat(bookingData.subtotalPrice).toLocaleString()}` : '',
      coupon_code: bookingData.couponCode || 'None',
      discount_percentage: bookingData.discountPercentage || '0',
      discount_amount: bookingData.discountAmount && parseFloat(bookingData.discountAmount) > 0 ? `-₱${parseFloat(bookingData.discountAmount).toLocaleString()}` : 'None',
      payment_fee: bookingData.paymentFee ? `₱${parseFloat(bookingData.paymentFee).toLocaleString()}` : '₱0',
      total_price: bookingData.totalPrice ? `₱${parseFloat(bookingData.totalPrice).toLocaleString()}` : '',
      food_restriction: bookingData.foodRestriction || 'None',
      additional_guests: bookingData.additionalGuests || 'None',
      payment_method: 'PayMongo',
      payment_instructions: `Payment confirmed via PayMongo. Transaction ID: ${transactionId}. Amount paid: ₱${parseFloat(receivedAmount || 0).toLocaleString()}`
    };

    const emailPayload = {
      service_id: 'service_71wxksu',
      template_id: 'template_xzc9veh',
      template_params: guestEmailParams,
      user_id: 'oICGyBSpy8vOU95iJ'
    };
    if (EMAILJS_PRIVATE_KEY) {
      emailPayload.accessToken = EMAILJS_PRIVATE_KEY;
    }

    const guestRes = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload),
    });
    if (guestRes.ok) {
      console.log(`✅ Webhook: Guest confirmation email sent to ${bookingData.email}`);
    } else {
      const errText = await guestRes.text();
      console.error(`❌ Webhook: Guest email failed: ${guestRes.status} ${errText}`);
    }

    // Company notification email
    const companyEmailParams = {
      to_email: 'ectravelandtourspal@gmail.com',
      user_email: 'ectravelandtourspal@gmail.com',
      email: 'ectravelandtourspal@gmail.com',
      recipient_email: 'ectravelandtourspal@gmail.com',
      recipient: 'ectravelandtourspal@gmail.com',
      company_name: 'EC Travel and Tours',
      guest_name: `${bookingData.firstName} ${bookingData.lastName}`,
      guest_email: bookingData.email,
      guest_phone: bookingData.phone || '',
      guest_address: bookingData.address || '',
      guest_city: bookingData.city || '',
      guest_country: bookingData.country || '',
      emergency_contact_title: bookingData.emergencyTitle || '',
      emergency_contact_first_name: bookingData.emergencyFirstName || '',
      emergency_contact_last_name: bookingData.emergencyLastName || '',
      emergency_contact_phone: bookingData.emergencyPhone || '',
      emergency_contact_relationship: bookingData.emergencyRelationship || '',
      package_name: bookingData.packageName || '',
      travel_date: bookingData.travelDate || '',
      number_of_guests: bookingData.numberOfGuests || '',
      subtotal_price: bookingData.subtotalPrice ? `₱${parseFloat(bookingData.subtotalPrice).toLocaleString()}` : '',
      coupon_code: bookingData.couponCode || 'None',
      discount_percentage: bookingData.discountPercentage || '0',
      discount_amount: bookingData.discountAmount && parseFloat(bookingData.discountAmount) > 0 ? `-₱${parseFloat(bookingData.discountAmount).toLocaleString()}` : 'None',
      payment_fee: bookingData.paymentFee ? `₱${parseFloat(bookingData.paymentFee).toLocaleString()}` : '₱0',
      total_price: bookingData.totalPrice ? `₱${parseFloat(bookingData.totalPrice).toLocaleString()}` : '',
      food_restriction: bookingData.foodRestriction || 'None',
      additional_guests: bookingData.additionalGuests || 'None',
      payment_method: 'PayMongo (Paid)',
      payment_instructions: `PayMongo Transaction ID: ${transactionId} | Amount: ₱${parseFloat(receivedAmount || 0).toLocaleString()}`
    };

    const companyPayload = {
      service_id: 'service_71wxksu',
      template_id: 'template_102pzgp',
      template_params: companyEmailParams,
      user_id: 'oICGyBSpy8vOU95iJ'
    };
    if (EMAILJS_PRIVATE_KEY) {
      companyPayload.accessToken = EMAILJS_PRIVATE_KEY;
    }

    const companyRes = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyPayload),
    });
    if (companyRes.ok) {
      console.log(`✅ Webhook: Company notification email sent`);
    } else {
      const errText = await companyRes.text();
      console.error(`❌ Webhook: Company email failed: ${companyRes.status} ${errText}`);
    }
  } catch (error) {
    console.error('❌ Webhook: Email sending error:', error.message);
  }
}

// Update Google Sheet by checkoutId — replaces checkoutId with real transactionId and sets status
async function updatePaymentByCheckoutId(checkoutId, transactionId, receivedAmount, newStatus) {
  try {
    console.log(`📋 Updating Google Sheet: checkout ${checkoutId} → txn ${transactionId}, status ${newStatus}`);

    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_payment_by_checkout',
        checkoutId: checkoutId,
        transactionId: transactionId,
        receivedAmount: receivedAmount,
        paymentStatus: newStatus,
      }),
    });

    const result = await response.json();
    if (result.success || result.status === 'success') {
      console.log(`✅ Sheet updated: ${checkoutId} → ${transactionId} (${newStatus}) — rows: ${result.updatedRows || 0}`);
      return true;
    } else {
      console.error('❌ Sheet update failed:', result.error || result.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating sheet:', error.message);
    return false;
  }
}

// Verify PayMongo webhook signature using HMAC-SHA256
function verifyPayMongoWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  if (!webhookSecret) {
    console.warn('⚠️ PAYMONGO_WEBHOOK_SECRET not set — skipping signature verification');
    return false;
  }

  // PayMongo signature header format: t=<timestamp>,te=,li=<signature>
  // or t=<timestamp>,te=<test_signature>,li=<live_signature>
  const parts = {};
  signatureHeader.split(',').forEach(part => {
    const [key, value] = part.split('=');
    parts[key] = value;
  });

  const timestamp = parts['t'];
  const testSignature = parts['te'];
  const liveSignature = parts['li'];
  const signatureToVerify = liveSignature || testSignature;

  if (!timestamp || !signatureToVerify) {
    console.error('❌ Missing timestamp or signature in header');
    return false;
  }

  // Compute HMAC-SHA256: concat timestamp + '.' + rawBody
  const payload = `${timestamp}.${rawBody}`;
  const computedSignature = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(computedSignature, 'hex'),
    Buffer.from(signatureToVerify, 'hex')
  );
}

// Map PayMongo event types to sheet-friendly payment statuses
function mapPayMongoEventToPaymentStatus(eventType) {
  const statusMap = {
    'checkout_session.payment.paid': 'Paid',
    'payment.paid': 'Paid',
    'payment.failed': 'Failed',
    'payment.refunded': 'Refunded',
    'payment.refund.updated': 'Refunded',
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
        paymongoTransactionId: transactionId,
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

// PayMongo webhook handler
async function handlePayMongoWebhook(req, res) {
  const rawBody = req.body.toString('utf8');

  console.log('\n🔔 PayMongo Webhook received');

  // Parse event
  let event;
  try {
    const parsed = JSON.parse(rawBody);
    event = parsed.data;
  } catch (err) {
    console.error('❌ Invalid webhook JSON');
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event?.attributes?.type;
  console.log(`   Event: ${eventType}`);
  console.log(`   ID: ${event?.id}`);

  // Verify signature (if webhook secret is configured)
  if (PAYMONGO_WEBHOOK_SECRET) {
    const signatureHeader = req.headers['paymongo-signature'] || '';
    try {
      const isValid = verifyPayMongoWebhookSignature(rawBody, signatureHeader, PAYMONGO_WEBHOOK_SECRET);
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

  // Handle payment events
  const HANDLED_EVENTS = [
    'checkout_session.payment.paid',
    'payment.paid',
    'payment.failed',
    'payment.refunded',
    'payment.refund.updated',
  ];

  if (HANDLED_EVENTS.includes(eventType)) {
    const resource = event?.attributes?.data || {};
    const resourceAttrs = resource?.attributes || {};

    // For checkout_session events, extract payment ID from payments array
    let transactionId = '';
    let checkoutId = '';
    let receivedAmount = '0';
    const metadata = resourceAttrs.metadata || {};

    if (eventType === 'checkout_session.payment.paid') {
      checkoutId = resource?.id || '';
      const payments = resourceAttrs.payments || [];
      if (payments.length > 0) {
        transactionId = payments[0].id || '';
        const paymentAttrs = payments[0].attributes || {};
        receivedAmount = paymentAttrs.amount ? (paymentAttrs.amount / 100).toFixed(2) : '0';
      }
    } else {
      transactionId = resource?.id || '';
      const amount = resourceAttrs.amount;
      receivedAmount = amount ? (amount / 100).toFixed(2) : '0';
    }

    const newStatus = mapPayMongoEventToPaymentStatus(eventType);
    const eventDetails = `${eventType} at ${new Date().toISOString()}`;

    console.log(`   Checkout: ${checkoutId}`);
    console.log(`   Transaction: ${transactionId}`);
    console.log(`   Amount: ₱${receivedAmount}`);
    console.log(`   New Status: ${newStatus}`);

    // Update Google Sheet — find by checkoutId and set real transactionId + status
    if (checkoutId) {
      await updatePaymentByCheckoutId(checkoutId, transactionId, receivedAmount, newStatus);
    } else if (transactionId) {
      await updatePaymentStatusInSheet(transactionId, newStatus, eventType, eventDetails);
    }

    // Send confirmation email on successful payment
    if (newStatus === 'Paid' && (checkoutId || transactionId)) {
      // Get booking data from in-memory store or from PayMongo metadata
      const pendingEntry = pendingBookings.get(checkoutId);
      const bookingData = pendingEntry?.bookingData || metadata;

      if (bookingData && bookingData.email) {
        console.log(`   📧 Sending confirmation email to ${bookingData.email}...`);
        await sendConfirmationEmailFromWebhook(bookingData, transactionId, receivedAmount);
        // Clean up
        if (checkoutId) pendingBookings.delete(checkoutId);
      } else {
        console.warn('⚠️ No booking data available for email — user will rely on frontend fallback');
      }
    }
  } else {
    console.log(`   ℹ️ Unhandled event type: ${eventType} — ignored`);
  }

  // Always return 200 to PayMongo so it doesn't retry
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
  console.log(`   PayMongo: ${PAYMONGO_SECRET_KEY ? 'Configured' : 'NOT configured'}`);
  console.log(`   Frontend URL: ${FRONTEND_URL}`);
  console.log('\n✅ Endpoints:');
  console.log(`  - GET  /health`);
  console.log(`  - POST /save-booking (Saves booking to Google Sheet)`);
  console.log(`  - POST /api/paymongo/create-checkout (Create PayMongo checkout session)`);
  console.log(`  - POST /api/paymongo/verify-payment (Verify PayMongo payment)`);
  console.log(`  - POST /api/paymongo/webhook (PayMongo event notifications)`);
  console.log(`  - POST /api/send-email (Email proxy via EmailJS)`);
  if (PAYMONGO_WEBHOOK_SECRET) {
    console.log(`\n🔔 Webhook signature verification: ENABLED`);
  } else {
    console.log(`\n⚠️  Webhook signature verification: DISABLED (set PAYMONGO_WEBHOOK_SECRET to enable)`);
  }
});

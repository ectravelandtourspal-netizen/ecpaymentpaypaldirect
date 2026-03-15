const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Google Apps Script Web App URL for updating Google Sheet
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby09WxzfRyR6OMAO8804veQUItQ4k4-amM1OvemDVUpuHiyimb0U11JPXdE26oHk0DT/exec';
// Note: Using single URL for both coupon and booking operations - differentiated by "action" field
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const PAYPAL_BASE_URL = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

function ensurePayPalConfig() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not configured on backend');
  }
}

async function getPayPalAccessToken() {
  ensurePayPalConfig();

  const basicToken = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || 'Failed to get PayPal access token');
  }

  return result.access_token;
}

async function payPalRequest(path, method, body) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const result = await response.json();
  if (!response.ok) {
    const details = result?.details?.map(item => item?.description).filter(Boolean).join(', ');
    throw new Error(details || result?.message || `PayPal API request failed (${response.status})`);
  }

  return result;
}

async function verifyPayPalWebhookSignature(headers, webhookEvent) {
  if (!PAYPAL_WEBHOOK_ID) {
    throw new Error('PAYPAL_WEBHOOK_ID is not configured on backend');
  }

  const payload = {
    transmission_id: headers['paypal-transmission-id'] || '',
    transmission_time: headers['paypal-transmission-time'] || '',
    cert_url: headers['paypal-cert-url'] || '',
    auth_algo: headers['paypal-auth-algo'] || '',
    transmission_sig: headers['paypal-transmission-sig'] || '',
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: webhookEvent
  };

  if (!payload.transmission_id || !payload.transmission_time || !payload.cert_url || !payload.auth_algo || !payload.transmission_sig) {
    throw new Error('Missing required PayPal webhook headers');
  }

  const result = await payPalRequest('/v1/notifications/verify-webhook-signature', 'POST', payload);
  return String(result?.verification_status || '').toUpperCase() === 'SUCCESS';
}

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

app.post('/paypal/create-order', async (req, res) => {
  try {
    const {
      amount,
      currency = 'PHP',
      guestName = 'Guest',
      email = '',
      description = 'Booking down payment',
      successUrl,
      cancelUrl,
      metadata = {}
    } = req.body || {};

    const amountNumber = Number(amount);
    if (!isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ success: false, error: 'Missing successUrl or cancelUrl' });
    }

    const amountAsString = amountNumber.toFixed(2);
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description,
          amount: {
            currency_code: currency,
            value: amountAsString
          },
          custom_id: `${Date.now()}`,
          soft_descriptor: 'EC Travel'
        }
      ],
      application_context: {
        brand_name: 'EC Travel and Tours',
        user_action: 'PAY_NOW',
        return_url: successUrl,
        cancel_url: cancelUrl,
        shipping_preference: 'NO_SHIPPING'
      }
    };

    const result = await payPalRequest('/v2/checkout/orders', 'POST', payload);
    const orderId = result?.id;
    const approvalLink = (result?.links || []).find(link => link.rel === 'approve');
    const approvalUrl = approvalLink?.href;

    if (!orderId || !approvalUrl) {
      return res.status(500).json({ success: false, error: 'PayPal did not return approval URL/order ID' });
    }

    return res.json({
      success: true,
      orderId,
      approvalUrl,
      metadata: {
        guestName,
        email,
        ...metadata
      }
    });
  } catch (error) {
    console.error('❌ PayPal create order error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/paypal/capture-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId' });
    }

    const result = await payPalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, 'POST', {});
    const status = String(result?.status || '').toUpperCase();
    const paid = status === 'COMPLETED';

    return res.json({
      success: true,
      paid,
      orderId,
      status
    });
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('order already captured')) {
      return res.json({ success: true, paid: true, orderId: req.params.orderId, status: 'COMPLETED' });
    }

    console.error('❌ PayPal capture order error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/paypal/webhook', async (req, res) => {
  try {
    const webhookEvent = req.body || {};
    const verified = await verifyPayPalWebhookSignature(req.headers || {}, webhookEvent);

    if (!verified) {
      console.warn('⚠️ PayPal webhook signature verification failed');
      return res.status(400).json({ success: false, error: 'Invalid PayPal webhook signature' });
    }

    const eventType = String(webhookEvent?.event_type || 'UNKNOWN');
    const resource = webhookEvent?.resource || {};

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      console.log('✅ PayPal webhook: PAYMENT.CAPTURE.COMPLETED', {
        id: resource.id || '',
        amount: resource.amount?.value || '',
        currency: resource.amount?.currency_code || ''
      });
    } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
      console.warn('⚠️ PayPal webhook: PAYMENT.CAPTURE.DENIED', { id: resource.id || '' });
    } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      console.warn('ℹ️ PayPal webhook: PAYMENT.CAPTURE.REFUNDED', { id: resource.id || '' });
    } else {
      console.log('ℹ️ PayPal webhook received:', eventType);
    }

    return res.json({ success: true, received: true, eventType });
  } catch (error) {
    console.error('❌ PayPal webhook error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
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
  console.log('\n✅ Endpoints:');
  console.log(`  - GET  /health`);
  console.log(`  - POST /save-booking (Saves booking to Google Sheet)`);
});

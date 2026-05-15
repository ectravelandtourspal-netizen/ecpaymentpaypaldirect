/**
 * register-webhook.js
 *
 * One-time setup script: Registers the PayMongo webhook URL and prints the
 * secret key you need to paste into your .env as PAYMONGO_WEBHOOK_SECRET.
 *
 * Usage:
 *   node register-webhook.js <PUBLIC_BACKEND_URL>
 *
 * Example (local via ngrok):
 *   node register-webhook.js https://abc123.ngrok-free.app
 *
 * Example (production):
 *   node register-webhook.js https://api.ectravelandtours.com
 *
 * After running, copy the printed PAYMONGO_WEBHOOK_SECRET value into your .env,
 * then restart your server.
 */

require('dotenv').config();

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;

if (!PAYMONGO_SECRET_KEY) {
  console.error('❌ PAYMONGO_SECRET_KEY is not set in .env');
  process.exit(1);
}

const publicBaseUrl = process.argv[2];
if (!publicBaseUrl) {
  console.error('❌ Usage: node register-webhook.js <PUBLIC_BACKEND_URL>');
  console.error('   Example: node register-webhook.js https://abc123.ngrok-free.app');
  process.exit(1);
}

const webhookUrl = `${publicBaseUrl.replace(/\/$/, '')}/api/paymongo/webhook`;

const EVENTS = [
  'checkout_session.payment.paid',
  'payment.paid',
  'payment.failed',
  'payment.refunded',
  'payment.refund.updated',
];

async function main() {
  const auth = Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString('base64');

  console.log(`\n🔗 Registering PayMongo webhook...`);
  console.log(`   URL: ${webhookUrl}`);
  console.log(`   Events: ${EVENTS.join(', ')}\n`);

  // List existing webhooks first to avoid duplicates
  const listRes = await fetch('https://api.paymongo.com/v1/webhooks', {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    console.error(`❌ Failed to list existing webhooks: ${listRes.status} ${err}`);
    process.exit(1);
  }

  const listData = await listRes.json();
  const existing = (listData.data || []).find(
    w => w.attributes.url === webhookUrl
  );

  if (existing) {
    console.log(`ℹ️  Webhook already registered (ID: ${existing.id})`);
    console.log(`   Status: ${existing.attributes.status}`);
    console.log(`\n🔑 PAYMONGO_WEBHOOK_SECRET=${existing.attributes.secret_key}`);
    console.log('\n✅ Copy the value above into your .env file, then restart the server.\n');
    return;
  }

  // Register new webhook
  const createRes = await fetch('https://api.paymongo.com/v1/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          url: webhookUrl,
          events: EVENTS,
        },
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error(`❌ Webhook registration failed: ${createRes.status} ${err}`);
    process.exit(1);
  }

  const created = await createRes.json();
  const webhook = created.data;

  console.log(`✅ Webhook registered successfully!`);
  console.log(`   ID: ${webhook.id}`);
  console.log(`   Status: ${webhook.attributes.status}`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔑 PAYMONGO_WEBHOOK_SECRET=${webhook.attributes.secret_key}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Copy the PAYMONGO_WEBHOOK_SECRET value above`);
  console.log(`   2. Open backend/.env and paste it as PAYMONGO_WEBHOOK_SECRET=<value>`);
  console.log(`   3. Restart your backend server (npm start)\n`);
}

main().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});

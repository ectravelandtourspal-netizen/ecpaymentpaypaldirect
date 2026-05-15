#!/usr/bin/env node

/**
 * Quick test script to verify Twilio WhatsApp configuration
 * Run: node test-twilio.js
 */

const twilio = require('twilio');

// Twilio Configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'YOUR_TWILIO_ACCOUNT_SID';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'YOUR_TWILIO_AUTH_TOKEN';
const twilioPhoneNumber = 'whatsapp:+14155238886';

console.log('🔍 Testing Twilio WhatsApp Configuration...\n');
console.log('Account SID:', accountSid.substring(0, 8) + '...');
console.log('Auth Token:', authToken.substring(0, 8) + '...');
console.log('Phone Number:', twilioPhoneNumber);

try {
  const client = twilio(accountSid, authToken);
  console.log('✅ Twilio client initialized successfully!\n');

  // List recent messages to verify connection
  client.messages.list({ limit: 1 })
    .then(messages => {
      console.log('✅ Successfully connected to Twilio API!\n');
      
      if (messages.length > 0) {
        console.log('Last message sent:');
        console.log('  SID:', messages[0].sid);
        console.log('  From:', messages[0].from);
        console.log('  To:', messages[0].to);
        console.log('  Status:', messages[0].status);
        console.log('  Date:', messages[0].dateSent);
      } else {
        console.log('No messages sent yet. Send a test message to verify the connection.');
      }
      
      console.log('\n✅ Twilio is ready to send WhatsApp messages!\n');
      console.log('📌 IMPORTANT - Sandbox Registration:');
      console.log('Before sending messages, phone numbers must be registered:');
      console.log('1. Open WhatsApp on your phone');
      console.log('2. Send message to: +14155238886');
      console.log('3. Message content: join ectravel');
      console.log('4. Wait for confirmation');
      console.log('5. Repeat for other phone numbers\n');
    })
    .catch(error => {
      console.error('❌ Error connecting to Twilio API:');
      console.error('   Message:', error.message);
      console.error('   Code:', error.code);
      
      if (error.message.includes('Unauthorized')) {
        console.error('\n⚠️  Invalid credentials! Check Account SID and Auth Token\n');
      }
    });

} catch (error) {
  console.error('❌ Error initializing Twilio client:', error.message);
}

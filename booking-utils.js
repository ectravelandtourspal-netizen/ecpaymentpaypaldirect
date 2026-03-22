// booking-utils.js
// Shared booking logic and cache for backend

const fetch = require('node-fetch');

// In-memory cache for pending bookings (keyed by email)
const pendingBookings = {};

// Google Apps Script Web App URL for updating Google Sheet
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby09WxzfRyR6OMAO8804veQUItQ4k4-amM1OvemDVUpuHiyimb0U11JPXdE26oHk0DT/exec';

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

module.exports = {
  pendingBookings,
  saveBookingToSheet
};

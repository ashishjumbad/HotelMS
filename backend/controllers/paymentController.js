const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Order
exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // in paise
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Verify Payment
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false });
  }
};

// const pool = require("../config/db");
const db = require("../config/db");

exports.getPayments = (req, res) => {
  const { startDate, endDate, hotelId } = req.query;

  let query = `
    SELECT p.*, h.name as hotelName, s.name as planName
    FROM payments p
    JOIN hotels h ON p.hotel_id = h.id
    JOIN subscriptions s ON p.subscription_id = s.id
    WHERE 1=1
  `;

  const values = [];

  if (startDate && endDate) {
    query += ` AND DATE(p.payment_date) BETWEEN ? AND ?`;
    values.push(startDate, endDate);
  }

  if (hotelId) {
    query += ` AND p.hotel_id = ?`;
    values.push(hotelId);
  }

  query += ` ORDER BY p.payment_date DESC`;

  db.query(query, values, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }

    res.json(results || []);   // ✅ Always return array
  });
};
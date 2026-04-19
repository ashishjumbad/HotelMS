// const express = require("express");
// const router = express.Router();

// const { createOrder, verifyPayment, getPayments } = require("../controllers/paymentController");
// const { isAuth } = require("../middleware/authMiddleware");

// // Create Razorpay order
// router.post("/create-order", isAuth, createOrder);

// // Verify Razorpay payment
// router.post("/verify", isAuth, verifyPayment);

// // Get payment history (with filters)
// router.get("/", isAuth, getPayments);

// module.exports = router;

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Payment routes working' });
});

module.exports = router;
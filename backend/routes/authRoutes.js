const express = require('express');
const { body } = require('express-validator');
const {
  registerHotelAdmin, 
  login, 
  logout,
  getMe, 
  checkAuth,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');

const router = express.Router();
const paymentReceiptUpload = createUploadMiddleware('payment-receipts');

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('fullName').notEmpty().trim(),
  body('phone').optional().isMobilePhone(),
  body('hotelName').notEmpty().trim(),
  body('hotelAddress').optional().trim(),
  body('hotelPhone').optional().isMobilePhone(),
  body('subscriptionPlanId').notEmpty().isUUID(),
  body('subscriptionBillingCycle').optional().isIn(['monthly', 'yearly'])
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('confirmPassword').isLength({ min: 6 })
];

const resetPasswordValidation = [
  body('password').isLength({ min: 6 })
];

// Routes
router.post('/register/hotel', paymentReceiptUpload.single('paymentReceipt'), registerValidation, registerHotelAdmin);
router.post('/login', loginValidation, login);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/reset-password/:token', resetPasswordValidation, resetPassword);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.get('/check', checkAuth);

module.exports = router;

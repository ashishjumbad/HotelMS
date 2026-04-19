const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { isSuperAdmin } = require('../middleware/roleMiddleware');
const {
  getAllHotels,
  getHotelDetails,
  updateHotelStatus,
  deleteHotel,
  getAllSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  getAllPayments,
  getDashboardStats
} = require('../controllers/superAdminController');

const router = express.Router();

// All routes require super admin authentication
router.use(protect, isSuperAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Hotel management
router.get('/hotels', getAllHotels);
router.get('/hotels/:id', getHotelDetails);
router.put('/hotels/:id/status', updateHotelStatus);
router.delete('/hotels/:id', deleteHotel);

// Subscription management
router.get('/subscriptions', getAllSubscriptions);
router.post('/subscriptions', createSubscription);
router.put('/subscriptions/:id', updateSubscription);
router.delete('/subscriptions/:id', deleteSubscription);

// Payment management
router.get('/payments', getAllPayments);

module.exports = router;

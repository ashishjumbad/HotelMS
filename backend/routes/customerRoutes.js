const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getMenu,
  createOrder,
  getOrderStatus,
  cancelOrder,
  getMyOrders
} = require('../controllers/customerController');

const router = express.Router();

// Public routes
router.get('/menu/:hotelId', getMenu);
router.post('/orders', createOrder);
router.get('/orders/:orderId', getOrderStatus);
router.put('/orders/:orderId/cancel', cancelOrder);

// Protected routes (require authentication)
router.get('/my-orders', protect, getMyOrders);

module.exports = router;

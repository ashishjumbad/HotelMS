const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { isHotelAdmin } = require('../middleware/roleMiddleware');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');
const {
  // Tables
  getTables,
  createTable,
  updateTable,
  deleteTable,
  
  // Dishes
  getDishes,
  createDish,
  updateDish,
  deleteDish,
  
  // Categories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  
  // Orders
  getOrders,
  updateOrderStatus,
  deleteOrder,
  
  // Employees
  getEmployees,
  createEmployee,
  
  // Dashboard
  getDashboardStats
} = require('../controllers/hotelAdminController');

const router = express.Router();
const dishUpload = createUploadMiddleware('dishes');

// All routes require hotel admin authentication.
router.use(protect, isHotelAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Table management
router.get('/tables', getTables);
router.post('/tables', createTable);
router.put('/tables/:id', updateTable);
router.delete('/tables/:id', deleteTable);

// Category management
router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Dish management
router.get('/dishes', getDishes);
router.post('/dishes', dishUpload.single('image'), createDish);
router.put('/dishes/:id', dishUpload.single('image'), updateDish);
router.delete('/dishes/:id', deleteDish);

// Order management
router.get('/orders', getOrders);
router.put('/orders/:id/status', updateOrderStatus);
router.delete('/orders/:id', deleteOrder);

// Employee management
router.get('/employees', getEmployees);
router.post('/employees', createEmployee);

module.exports = router;

// // const express = require("express");
// // const router = express.Router();

// // router.get("/", (req, res) => {
// //   res.json({ message: "Dashboard route working" });
// // });

// // module.exports = router;
// const router = require("express").Router();
// const { isAuth } = require("../middleware/authMiddleware");
// const { getDashboardStats } = require("../controllers/dashboardController");

// router.get("/", isAuth, getDashboardStats);

// module.exports = router;


const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { isSuperAdminOrHotelAdmin } = require('../middleware/roleMiddleware');
const db = require('../config/db');

const router = express.Router();

// @desc    Get dashboard stats based on user role
// @route   GET /api/dashboard/stats
// @access  Private (SuperAdmin or HotelAdmin)
router.get('/stats', protect, isSuperAdminOrHotelAdmin, async (req, res) => {
  try {
    const user = req.user;
    let stats = {};

    if (user.role === 'super_admin') {
      // Super admin stats
      const result = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM hotels) as total_hotels,
          (SELECT COUNT(*) FROM hotels WHERE subscription_status = 'active') as active_hotels,
          (SELECT COUNT(*) FROM hotels WHERE subscription_status = 'pending') as pending_hotels,
          (SELECT COUNT(*) FROM users WHERE role = 'hotel_admin') as total_admins,
          (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions,
          (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed') as total_revenue,
          (SELECT COUNT(*) FROM payments WHERE DATE(created_at) = CURRENT_DATE) as today_payments,
          (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE DATE(created_at) = CURRENT_DATE) as today_revenue
      `);
      stats = result.rows[0];
    } 
    else if (user.role === 'hotel_admin' && user.hotel_id) {
      // Hotel admin stats
      const result = await db.query(
        `SELECT 
          (SELECT COUNT(*) FROM tables WHERE hotel_id = $1) as total_tables,
          (SELECT COUNT(*) FROM dishes WHERE hotel_id = $1) as total_dishes,
          (SELECT COUNT(*) FROM dishes WHERE hotel_id = $1 AND is_available = true) as available_dishes,
          (SELECT COUNT(*) FROM employees WHERE hotel_id = $1) as total_employees,
          (SELECT COUNT(*) FROM orders WHERE hotel_id = $1) as total_orders,
          (SELECT COUNT(*) FROM orders WHERE hotel_id = $1 AND DATE(created_at) = CURRENT_DATE) as today_orders,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE hotel_id = $1) as total_revenue,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE hotel_id = $1 AND DATE(created_at) = CURRENT_DATE) as today_revenue
        `,
        [user.hotel_id]
      );
      stats = result.rows[0];
    }

    res.json({ stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get recent activity
// @route   GET /api/dashboard/recent-activity
// @access  Private (SuperAdmin or HotelAdmin)
router.get('/recent-activity', protect, isSuperAdminOrHotelAdmin, async (req, res) => {
  try {
    const user = req.user;
    let activity = [];

    if (user.role === 'super_admin') {
      // Get recent hotel registrations
      const hotels = await db.query(
        `SELECT id, name, 'hotel_registered' as type, created_at 
         FROM hotels 
         ORDER BY created_at DESC 
         LIMIT 10`
      );
      
      // Get recent payments
      const payments = await db.query(
        `SELECT p.id, h.name, 'payment_made' as type, p.created_at, p.amount 
         FROM payments p
         JOIN hotels h ON p.hotel_id = h.id
         WHERE p.status = 'completed'
         ORDER BY p.created_at DESC 
         LIMIT 10`
      );

      activity = [
        ...hotels.rows.map(h => ({ ...h, description: `New hotel registered: ${h.name}` })),
        ...payments.rows.map(p => ({ ...p, description: `Payment received: ₹${p.amount} from ${p.name}` }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    }
    else if (user.role === 'hotel_admin' && user.hotel_id) {
      // Get recent orders
      const orders = await db.query(
        `SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
                t.table_number
         FROM orders o
         LEFT JOIN tables t ON o.table_id = t.id
         WHERE o.hotel_id = $1
         ORDER BY o.created_at DESC 
         LIMIT 10`,
        [user.hotel_id]
      );

      activity = orders.rows.map(o => ({
        id: o.id,
        type: 'order',
        description: `Order #${o.order_number} - ${o.status} - ₹${o.total_amount}${o.table_number ? ` (Table ${o.table_number})` : ''}`,
        created_at: o.created_at
      }));
    }

    res.json({ activity });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get chart data
// @route   GET /api/dashboard/chart-data
// @access  Private (SuperAdmin or HotelAdmin)
router.get('/chart-data', protect, isSuperAdminOrHotelAdmin, async (req, res) => {
  try {
    const user = req.user;
    const { period = 'week' } = req.query;
    
    let dateFilter = '';
    if (period === 'week') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    } else if (period === 'year') {
      dateFilter = "AND created_at >= NOW() - INTERVAL '1 year'";
    }

    if (user.role === 'super_admin') {
      // Revenue over time for super admin
      const revenueData = await db.query(`
        SELECT 
          DATE(created_at) as date,
          SUM(amount) as revenue
        FROM payments
        WHERE status = 'completed'
        ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date
      `);

      // New hotels over time
      const hotelsData = await db.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM hotels
        WHERE 1=1
        ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date
      `);

      res.json({
        revenue: revenueData.rows,
        hotels: hotelsData.rows
      });
    }
    else if (user.role === 'hotel_admin' && user.hotel_id) {
      // Daily orders for hotel admin
      const ordersData = await db.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as order_count,
          SUM(total_amount) as revenue
        FROM orders
        WHERE hotel_id = $1
        ${dateFilter.replace(/AND/g, 'AND')}
        GROUP BY DATE(created_at)
        ORDER BY date`,
        [user.hotel_id]
      );

      // Popular dishes
      const popularDishes = await db.query(
        `SELECT 
          d.name,
          COUNT(oi.id) as order_count,
          SUM(oi.quantity) as total_quantity
        FROM dishes d
        LEFT JOIN order_items oi ON d.id = oi.dish_id
        LEFT JOIN orders o ON oi.order_id = o.id
        WHERE d.hotel_id = $1
        ${dateFilter.replace(/AND/g, 'AND o.')}
        GROUP BY d.id, d.name
        ORDER BY total_quantity DESC
        LIMIT 5`,
        [user.hotel_id]
      );

      res.json({
        orders: ordersData.rows,
        popularDishes: popularDishes.rows
      });
    }
  } catch (error) {
    console.error('Chart data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
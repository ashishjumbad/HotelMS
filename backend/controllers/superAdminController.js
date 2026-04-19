const db = require('../config/db');
const { hashPassword } = require('../utils/helpers');

const latestSubscriptionJoin = `
  LEFT JOIN LATERAL (
    SELECT
      s.id,
      COALESCE(
        s.plan_id,
        (
          SELECT sp_match.id
          FROM subscription_plans sp_match
          WHERE LOWER(sp_match.name) = LOWER(s.plan_name)
          ORDER BY sp_match.created_at DESC
          LIMIT 1
        )
      ) AS resolved_plan_id,
      s.plan_name,
      s.status,
      s.start_date,
      s.end_date,
      s.created_at,
      s.payment_receipt_url,
      COALESCE(
        sp.name,
        (
          SELECT sp_match.name
          FROM subscription_plans sp_match
          WHERE LOWER(sp_match.name) = LOWER(s.plan_name)
          ORDER BY sp_match.created_at DESC
          LIMIT 1
        )
      ) AS subscription_plan_name,
      COALESCE(
        sp.plan_code,
        (
          SELECT sp_match.plan_code
          FROM subscription_plans sp_match
          WHERE LOWER(sp_match.name) = LOWER(s.plan_name)
          ORDER BY sp_match.created_at DESC
          LIMIT 1
        )
      ) AS subscription_plan_code,
      COALESCE(
        sp.plan_number,
        (
          SELECT sp_match.plan_number
          FROM subscription_plans sp_match
          WHERE LOWER(sp_match.name) = LOWER(s.plan_name)
          ORDER BY sp_match.created_at DESC
          LIMIT 1
        )
      ) AS subscription_plan_number
    FROM subscriptions s
    LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.hotel_id = h.id
    ORDER BY
      CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
      s.created_at DESC,
      s.start_date DESC
    LIMIT 1
  ) latest_subscription ON true
`;

// @desc    Get all hotels
// @route   GET /api/super-admin/hotels
// @access  Private/SuperAdmin
const getAllHotels = async (req, res) => {
  try {
    const hotelsResult = await db.query(`
      SELECT
        h.*,
        COALESCE(h.registered_at, h.created_at) AS registered_at,
        latest_subscription.resolved_plan_id AS selected_plan_id,
        latest_subscription.subscription_plan_code AS selected_plan_code,
        latest_subscription.subscription_plan_number AS selected_plan_number,
        COALESCE(latest_subscription.subscription_plan_name, latest_subscription.plan_name) AS selected_plan_name,
        COALESCE(latest_subscription.status, h.subscription_status) AS selected_plan_status,
        latest_subscription.start_date AS selected_plan_start_date,
        latest_subscription.end_date AS selected_plan_end_date,
        latest_subscription.payment_receipt_url AS selected_payment_receipt_url,
        latest_subscription.id AS selected_subscription_id
      FROM hotels h
      ${latestSubscriptionJoin}
      ORDER BY COALESCE(h.registered_at, h.created_at) DESC
    `);

    res.json({
      hotels: hotelsResult.rows,
      pagination: {
        page: 1,
        limit: 100,
        total: hotelsResult.rows.length,
        pages: 1
      }
    });
  } catch (error) {
    console.error('Get hotels error:', error.message, error.stack);
    res.status(500).json({ message: 'Database error: ' + error.message });
  }
};

// @desc    Get hotel details
// @route   GET /api/super-admin/hotels/:id
// @access  Private/SuperAdmin
const getHotelDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const hotelResult = await db.query(
      `SELECT h.*, 
        u.email as admin_email,
        u.full_name as admin_name,
        u.phone as admin_phone,
        latest_subscription.resolved_plan_id AS selected_plan_id,
        latest_subscription.subscription_plan_code AS selected_plan_code,
        latest_subscription.subscription_plan_number AS selected_plan_number,
        COALESCE(latest_subscription.subscription_plan_name, latest_subscription.plan_name) AS selected_plan_name,
        COALESCE(latest_subscription.status, h.subscription_status) AS selected_plan_status,
        latest_subscription.start_date AS selected_plan_start_date,
        latest_subscription.end_date AS selected_plan_end_date,
        latest_subscription.payment_receipt_url AS selected_payment_receipt_url,
        latest_subscription.id AS selected_subscription_id
      FROM hotels h
      LEFT JOIN users u ON h.admin_id = u.id
      ${latestSubscriptionJoin}
      WHERE h.id = $1`,
      [id]
    );

    if (hotelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    const hotel = hotelResult.rows[0];

    // Get statistics
    const statsResult = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM tables WHERE hotel_id = $1) as total_tables,
        (SELECT COUNT(*) FROM dishes WHERE hotel_id = $1) as total_dishes,
        (SELECT COUNT(*) FROM employees WHERE hotel_id = $1) as total_employees,
        (SELECT COUNT(*) FROM orders WHERE hotel_id = $1) as total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE hotel_id = $1) as total_revenue
      `,
      [id]
    );

    res.json({
      ...hotel,
      stats: statsResult.rows[0],
      recent_subscriptions: []
    });
  } catch (error) {
    console.error('Get hotel details error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update hotel status
// @route   PUT /api/super-admin/hotels/:id/status
// @access  Private/SuperAdmin
const updateHotelStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    await db.query(
      'UPDATE hotels SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [is_active, id]
    );

    // Also update admin user status
    await db.query(
      `UPDATE users SET is_active = $1 
       WHERE id = (SELECT admin_id FROM hotels WHERE id = $2)`,
      [is_active, id]
    );

    res.json({ 
      message: `Hotel ${is_active ? 'activated' : 'deactivated'} successfully` 
    });
  } catch (error) {
    console.error('Update hotel status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete hotel
// @route   DELETE /api/super-admin/hotels/:id
// @access  Private/SuperAdmin
const deleteHotel = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query('BEGIN');

    try {
      const hotelResult = await db.query(
        'SELECT id, admin_id, name FROM hotels WHERE id = $1',
        [id]
      );

      if (hotelResult.rows.length === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({ message: 'Hotel not found' });
      }

      const hotel = hotelResult.rows[0];

      await db.query(
        'DELETE FROM hotels WHERE id = $1',
        [id]
      );

      if (hotel.admin_id) {
        await db.query(
          "DELETE FROM users WHERE id = $1 AND role = 'hotel_admin'",
          [hotel.admin_id]
        );
      }

      await db.query('COMMIT');

      res.json({ message: `${hotel.name} deleted successfully` });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Delete hotel error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all subscription plans
// @route   GET /api/super-admin/subscriptions
// @access  Private/SuperAdmin
const getAllSubscriptions = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM subscription_plans ORDER BY created_at DESC, id DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.json([]);
  }
};

// @desc    Create subscription plan
// @route   POST /api/super-admin/subscriptions
// @access  Private/SuperAdmin
const createSubscription = async (req, res) => {
  try {
    const { name, monthly_price, yearly_price, max_tables, max_employees } = req.body;

    const result = await db.query(
      `WITH next_code AS (
         SELECT 'PLAN-' || LPAD((COALESCE(MAX(SUBSTRING(plan_code FROM 6)::int), 0) + 1)::text, 4, '0') AS value
         FROM subscription_plans
         WHERE plan_code ~ '^PLAN-[0-9]{4,}$'
       ),
       next_number AS (
         SELECT COALESCE(MAX(plan_number), 0) + 1 AS value
         FROM subscription_plans
       )
       INSERT INTO subscription_plans (plan_code, plan_number, name, monthly_price, yearly_price, max_tables, max_employees)
       SELECT next_code.value, next_number.value, $1, $2, $3, $4, $5
       FROM next_code
       CROSS JOIN next_number
       RETURNING *`,
      [name, monthly_price, yearly_price, max_tables, max_employees]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all payments
// @route   GET /api/super-admin/payments
// @access  Private/SuperAdmin
const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, 
        h.name as hotel_name,
        s.plan_name as subscription_plan
      FROM payments p
      JOIN hotels h ON p.hotel_id = h.id
      LEFT JOIN subscriptions s ON p.subscription_id = s.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const paymentsResult = await db.query(query, params);

    // Get total count
    const countResult = await db.query(
      'SELECT COUNT(*) FROM payments'
    );

    res.json({
      payments: paymentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/super-admin/dashboard
// @access  Private/SuperAdmin
const getDashboardStats = async (req, res) => {
  try {
    const statsResult = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM hotels) as total_hotels,
        (SELECT COUNT(*) FROM users WHERE role = 'hotel_admin') as total_admins,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed') as total_revenue,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed' AND DATE(created_at) = CURRENT_DATE) as today_revenue
    `);

    const statusCountsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE subscription_status = 'active') as active_hotels,
        COUNT(*) FILTER (WHERE subscription_status = 'pending') as pending_hotels,
        COUNT(*) FILTER (WHERE subscription_status = 'expired') as expired_hotels,
        COUNT(*) FILTER (WHERE subscription_status = 'cancelled') as cancelled_hotels
      FROM hotels
    `);

    const revenueOverviewResult = await db.query(`
      SELECT
        TO_CHAR(month_start, 'Mon') as label,
        COALESCE(SUM(p.amount), 0) as revenue
      FROM generate_series(
        DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
        DATE_TRUNC('month', CURRENT_DATE),
        INTERVAL '1 month'
      ) AS month_start
      LEFT JOIN payments p
        ON DATE_TRUNC('month', p.created_at) = month_start
       AND p.status = 'completed'
      GROUP BY month_start
      ORDER BY month_start
    `);

    const recentHotelsResult = await db.query(
      `SELECT id, name, COALESCE(registered_at, created_at) as registered_at, subscription_status
       FROM hotels
       ORDER BY COALESCE(registered_at, created_at) DESC
       LIMIT 5`
    );

    const recentPaymentsResult = await db.query(
      `SELECT p.*, h.name as hotel_name
       FROM payments p
       JOIN hotels h ON p.hotel_id = h.id
       ORDER BY p.created_at DESC
       LIMIT 5`
    );

    const statusCounts = statusCountsResult.rows[0] || {};
    const statsRow = statsResult.rows[0] || {};

    res.json({
      stats: {
        ...statsRow,
        total_hotels: Number(statsRow.total_hotels || 0),
        total_admins: Number(statsRow.total_admins || 0),
        total_revenue: Number(statsRow.total_revenue || 0),
        today_revenue: Number(statsRow.today_revenue || 0),
        active_hotels: Number(statusCounts.active_hotels || 0),
        pending_hotels: Number(statusCounts.pending_hotels || 0),
        expired_hotels: Number(statusCounts.expired_hotels || 0),
        cancelled_hotels: Number(statusCounts.cancelled_hotels || 0)
      },
      subscription_status_counts: {
        active: Number(statusCounts.active_hotels || 0),
        pending: Number(statusCounts.pending_hotels || 0),
        expired: Number(statusCounts.expired_hotels || 0),
        cancelled: Number(statusCounts.cancelled_hotels || 0)
      },
      revenue_overview: revenueOverviewResult.rows.map((row) => ({
        label: row.label,
        revenue: Number(row.revenue || 0)
      })),
      recent_hotels: recentHotelsResult.rows,
      recent_payments: recentPaymentsResult.rows
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update subscription plan
// @route   PUT /api/super-admin/subscriptions/:id
// @access  Private/SuperAdmin
const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, monthly_price, yearly_price, max_tables, max_employees } = req.body;

    const result = await db.query(
      `UPDATE subscription_plans
       SET name = $1, monthly_price = $2, yearly_price = $3, max_tables = $4, max_employees = $5
       WHERE id = $6
       RETURNING *`,
      [name, monthly_price, yearly_price, max_tables, max_employees, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete subscription plan
// @route   DELETE /api/super-admin/subscriptions/:id
// @access  Private/SuperAdmin
const deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM subscription_plans WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    res.json({ message: 'Subscription plan deleted successfully' });
  } catch (error) {
    console.error('Delete subscription error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
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
};

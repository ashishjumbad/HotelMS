const db = require('../config/db');
const { validationResult } = require('express-validator');
const { hashPassword, comparePassword } = require('../utils/helpers');

const getUploadedPaymentReceiptUrl = (req) => {
  if (!req.file) {
    return null;
  }

  return `${req.protocol}://${req.get('host')}/uploads/payment-receipts/${req.file.filename}`;
};

// @desc    Register a new hotel admin
// @route   POST /api/auth/register/hotel
// @access  Public
const registerHotelAdmin = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Payment receipt is required' });
    }

    const {
      email,
      password,
      fullName,
      phone,
      hotelName,
      hotelAddress,
      hotelPhone,
      subscriptionPlanId,
      subscriptionBillingCycle = 'monthly'
    } = req.body;
    const normalizedBillingCycle = subscriptionBillingCycle === 'yearly' ? 'yearly' : 'monthly';

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const userResult = await db.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, email, full_name, role`,
        [email, hashedPassword, fullName, phone, 'hotel_admin', true]
      );

      const user = userResult.rows[0];

      let selectedPlan = null;

      if (subscriptionPlanId) {
        const planResult = await db.query(
          `SELECT id, name, monthly_price, yearly_price
           FROM subscription_plans
           WHERE id = $1 AND is_active = true`,
          [subscriptionPlanId]
        );

        if (planResult.rows.length === 0) {
          await db.query('ROLLBACK');
          return res.status(400).json({ message: 'Selected subscription plan is invalid' });
        }

        selectedPlan = planResult.rows[0];
      }

      // Create hotel
      const hotelResult = await db.query(
        `INSERT INTO hotels (admin_id, name, address, phone, email, subscription_status, registered_at) 
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
         RETURNING id, name, registered_at`,
        [user.id, hotelName, hotelAddress, hotelPhone, email, 'pending']
      );

      const hotel = hotelResult.rows[0];

      const selectedPrice = selectedPlan
        ? normalizedBillingCycle === 'yearly'
          ? selectedPlan.yearly_price
          : selectedPlan.monthly_price
        : null;

      await db.query(
        `INSERT INTO hotel_registration_history (
          hotel_id,
          admin_id,
          hotel_name,
          hotel_address,
          hotel_phone,
          hotel_email,
          admin_name,
          admin_email,
          admin_phone,
          subscription_plan_id,
          subscription_plan_name,
          subscription_billing_cycle,
          subscription_price,
          registered_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          hotel.id,
          user.id,
          hotelName,
          hotelAddress,
          hotelPhone,
          email,
          fullName,
          email,
          phone,
          selectedPlan?.id || null,
          selectedPlan?.name || null,
          selectedPlan ? normalizedBillingCycle : null,
          selectedPrice,
          hotel.registered_at
        ]
      );

      if (selectedPlan) {
        const endDateInterval = normalizedBillingCycle === 'yearly'
          ? '1 year'
          : '30 days';
        const paymentReceiptUrl = getUploadedPaymentReceiptUrl(req);

        await db.query(
          `INSERT INTO subscriptions (hotel_id, plan_id, plan_name, price, start_date, end_date, status, payment_receipt_url)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($5::text)::interval, 'active', $6)`,
          [
            hotel.id,
            selectedPlan.id,
            `${selectedPlan.name} (${normalizedBillingCycle})`,
            selectedPrice,
            endDateInterval,
            paymentReceiptUrl
          ]
        );
      }

      // Commit transaction
      await db.query('COMMIT');

      res.status(201).json({
        message: 'Hotel admin registered successfully. Please login.',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          hotelId: hotel.id,
          hotelName: hotel.name
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Get user from database
    const userResult = await db.query(
      'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ message: 'Account is deactivated' });
    }

    // Check password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Get hotel info for hotel admin
    let hotelInfo = null;
    if (user.role === 'hotel_admin') {
      const hotelResult = await db.query(
        'SELECT id, name, subscription_status FROM hotels WHERE admin_id = $1',
        [user.id]
      );
      if (hotelResult.rows.length > 0) {
        hotelInfo = hotelResult.rows[0];
      }
    }

    // Set session
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.hotelId = hotelInfo?.id;

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        hotelId: hotelInfo?.id,
        hotelName: hotelInfo?.name,
        subscriptionStatus: hotelInfo?.subscription_status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = req.user;
    
    // Get additional data based on role
    if (user.role === 'hotel_admin' && user.hotel_id) {
      const statsResult = await db.query(
        `SELECT 
          (SELECT COUNT(*) FROM tables WHERE hotel_id = $1) as total_tables,
          (SELECT COUNT(*) FROM dishes WHERE hotel_id = $1) as total_dishes,
          (SELECT COUNT(*) FROM orders WHERE hotel_id = $1 AND DATE(created_at) = CURRENT_DATE) as today_orders
         `,
        [user.hotel_id]
      );
      
      user.stats = statsResult.rows[0];
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Check if user is authenticated
// @route   GET /api/auth/check
// @access  Public
const checkAuth = (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
};

// @desc    Reset password directly using email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const userResult = await db.query(
      `SELECT id, is_active
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'No account found with this email' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(400).json({ message: 'Account is deactivated' });
    }

    const hashedPassword = await hashPassword(password);

    await db.query(
      `UPDATE users
       SET password_hash = $1,
           reset_password_token_hash = NULL,
           reset_password_expires_at = NULL
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    return res.json({ message: 'Password has been reset successfully. Please sign in.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Server error while processing password reset' });
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.params;
    const { password } = req.body;
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const userResult = await db.query(
      `SELECT id
       FROM users
       WHERE reset_password_token_hash = $1
         AND reset_password_expires_at IS NOT NULL
         AND reset_password_expires_at > CURRENT_TIMESTAMP`,
      [resetTokenHash]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    const hashedPassword = await hashPassword(password);

    await db.query(
      `UPDATE users
       SET password_hash = $1,
           reset_password_token_hash = NULL,
           reset_password_expires_at = NULL
       WHERE id = $2`,
      [hashedPassword, userResult.rows[0].id]
    );

    return res.json({ message: 'Password has been reset successfully. Please sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Server error while resetting password' });
  }
};

module.exports = {
  registerHotelAdmin,
  login,
  logout,
  getMe,
  checkAuth,
  forgotPassword,
  resetPassword
};

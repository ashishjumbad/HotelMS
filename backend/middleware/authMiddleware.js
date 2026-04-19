const db = require('../config/db');

const protect = async (req, res, next) => {
  // Check if user is logged in via session
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: 'Not authorized, please login' });
  }

  try {
    // Get user from database
    const userResult = await db.query(
      'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (userResult.rows.length === 0) {
      req.session.destroy();
      return res.status(401).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      req.session.destroy();
      return res.status(401).json({ message: 'User account is deactivated' });
    }

    // Get hotel info if user is hotel_admin
    if (user.role === 'hotel_admin') {
      try {
        const hotelResult = await db.query(
          'SELECT id, name, subscription_status FROM hotels WHERE admin_id = $1',
          [user.id]
        );
        if (hotelResult.rows.length > 0) {
          user.hotel_id = hotelResult.rows[0].id;
          user.hotel_name = hotelResult.rows[0].name;
          user.subscription_status = hotelResult.rows[0].subscription_status;
        }
      } catch (e) {
        // Fallback if subscription_status column doesn't exist
        const hotelResult = await db.query(
          'SELECT id, name FROM hotels WHERE admin_id = $1',
          [user.id]
        );
        if (hotelResult.rows.length > 0) {
          user.hotel_id = hotelResult.rows[0].id;
          user.hotel_name = hotelResult.rows[0].name;
          user.subscription_status = 'active';
        }
      }
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { protect };
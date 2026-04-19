const db = require('../config/db');

const checkSubscription = async (req, res, next) => {
  try {
    // Skip for super admin
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check if user has hotel_id
    if (!req.user.hotel_id) {
      return res.status(403).json({ 
        message: 'No hotel associated with this account' 
      });
    }

    // Check hotel subscription status
    const hotelResult = await db.query(
      `SELECT subscription_status, subscription_end_date 
       FROM hotels WHERE id = $1`,
      [req.user.hotel_id]
    );

    if (hotelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    const hotel = hotelResult.rows[0];
    const normalizedStatus = (hotel.subscription_status || 'pending').toLowerCase();

    // Allow legacy records with missing status and only block explicitly inactive states.
    if (normalizedStatus === 'expired' || normalizedStatus === 'cancelled') {
      return res.status(403).json({ 
        message: 'Subscription is not active',
        status: normalizedStatus
      });
    }

    // Only evaluate expiry when an end date exists.
    if (hotel.subscription_end_date && new Date(hotel.subscription_end_date) < new Date()) {
      // Auto-update status to expired
      await db.query(
        `UPDATE hotels SET subscription_status = 'expired' WHERE id = $1`,
        [req.user.hotel_id]
      );
      
      return res.status(403).json({ 
        message: 'Subscription has expired' 
      });
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { checkSubscription };

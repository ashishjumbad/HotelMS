const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required role: ${roles.join(' or ')}` 
      });
    }

    next();
  };
};

// Specific role middlewares
const isSuperAdmin = roleMiddleware('super_admin');
const isHotelAdmin = roleMiddleware('hotel_admin');
const isCustomer = roleMiddleware('customer');
const isSuperAdminOrHotelAdmin = roleMiddleware('super_admin', 'hotel_admin');

module.exports = {
  roleMiddleware,
  isSuperAdmin,
  isHotelAdmin,
  isCustomer,
  isSuperAdminOrHotelAdmin
};
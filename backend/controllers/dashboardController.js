// const pool = require("../config/db");

// exports.getStats = async (req, res) => {
//   const totalHotels = await pool.query("SELECT COUNT(*) FROM hotels");
//   const revenue = await pool.query(
//     "SELECT SUM(amount) FROM payments WHERE payment_status='success'"
//   );

//   res.json({
//     totalHotels: totalHotels.rows[0].count,
//     totalRevenue: revenue.rows[0].sum || 0
//   });
// };
const pool = require("../config/db");

exports.getDashboardStats = async (req, res) => {
  try {
    const totalHotels = await pool.query(
      "SELECT COUNT(*) FROM hotels"
    );

    const activeSubscriptions = await pool.query(
      "SELECT COUNT(*) FROM hotel_subscriptions WHERE status='active'"
    );

    const expiredSubscriptions = await pool.query(
      "SELECT COUNT(*) FROM hotel_subscriptions WHERE status='expired'"
    );

    const totalRevenue = await pool.query(
      "SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_status='success'"
    );

    const monthlyRevenue = await pool.query(
      `SELECT COALESCE(SUM(amount),0) 
       FROM payments 
       WHERE payment_status='success' 
       AND DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    res.json({
      totalHotels: totalHotels.rows[0].count,
      activeSubscriptions: activeSubscriptions.rows[0].count,
      expiredSubscriptions: expiredSubscriptions.rows[0].count,
      totalRevenue: totalRevenue.rows[0].coalesce,
      monthlyRevenue: monthlyRevenue.rows[0].coalesce
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error" });
  }
};
const pool = require("../config/db");

exports.getHotels = async (req, res) => {
  try {
    const hotels = await pool.query("SELECT * FROM hotels");
    res.json(hotels.rows);
  } catch (error) {
    console.error("Get hotels error:", error);
    return res.status(500).json({ message: "Failed to retrieve hotels" });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query(
      "UPDATE hotels SET status=$1 WHERE id=$2",
      [status, req.params.id]
    );
    res.json({ message: "Updated" });
  } catch (error) {
    console.error("Update status error:", error);
    return res.status(500).json({ message: "Failed to update status" });
  }
};

const pool = require("../config/db");

exports.createPlan = async (req, res) => {
  try {
    const { name, monthly_price, yearly_price, max_tables, max_employees } = req.body;

    await pool.query(
      `WITH next_code AS (
        SELECT 'PLAN-' || LPAD((COALESCE(MAX(SUBSTRING(plan_code FROM 6)::int), 0) + 1)::text, 4, '0') AS value
        FROM subscription_plans
        WHERE plan_code ~ '^PLAN-[0-9]{4,}$'
      ),
      next_number AS (
        SELECT COALESCE(MAX(plan_number), 0) + 1 AS value
        FROM subscription_plans
      )
      INSERT INTO subscription_plans
      (plan_code, plan_number, name, monthly_price, yearly_price, max_tables, max_employees)
      SELECT next_code.value, next_number.value, $1, $2, $3, $4, $5
      FROM next_code
      CROSS JOIN next_number`,
      [name, monthly_price, yearly_price, max_tables, max_employees]
    );

    res.json({ message: "Plan Created" });
  } catch (error) {
    console.error("Create plan error:", error);
    return res.status(500).json({ message: "Failed to create plan" });
  }
};

exports.getPlans = async (req, res) => {
  try {
    const plans = await pool.query("SELECT * FROM subscription_plans");
    res.json(plans.rows);
  } catch (error) {
    console.error("Get plans error:", error);
    return res.status(500).json({ message: "Failed to retrieve plans" });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    await pool.query("DELETE FROM subscription_plans WHERE id=$1", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (error) {
    console.error("Delete plan error:", error);
    return res.status(500).json({ message: "Failed to delete plan" });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { name, monthly_price, yearly_price, max_tables, max_employees } = req.body;
    const { id } = req.params;

    console.log(`updatePlan called by session adminId=${req.session?.adminId} for id=${id}`, req.body);

    await pool.query(
      `UPDATE subscription_plans
       SET name=$1, monthly_price=$2, yearly_price=$3, max_tables=$4, max_employees=$5
       WHERE id=$6`,
      [name, monthly_price, yearly_price, max_tables, max_employees, id]
    );

    const updated = await pool.query("SELECT * FROM subscription_plans WHERE id=$1", [id]);
    res.json({ message: "Updated", plan: updated.rows[0] });
  } catch (error) {
    console.error("Update plan error:", error);
    return res.status(500).json({ message: "Failed to update plan" });
  }
};

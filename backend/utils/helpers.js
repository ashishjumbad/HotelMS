const bcrypt = require('bcryptjs');

// Hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const formatOrderNumber = (counterDate, sequenceNumber) => {
  const year = counterDate.getUTCFullYear();
  const month = String(counterDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(counterDate.getUTCDate()).padStart(2, '0');
  const paddedSequence = String(sequenceNumber).padStart(4, '0');

  return `ORD-${year}${month}${day}-${paddedSequence}`;
};

const generateOrderNumber = async (dbClient) => {
  const today = new Date();
  const dateKey = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`;
  const counterResult = await dbClient.query(
    `
      INSERT INTO order_counters (counter_date, last_number)
      VALUES (
        CURRENT_DATE,
        COALESCE(
          (
            SELECT MAX(RIGHT(order_number, 4)::int)
            FROM orders
            WHERE order_number ~ $1
          ),
          0
        ) + 1
      )
      ON CONFLICT (counter_date)
      DO UPDATE SET last_number = GREATEST(
        order_counters.last_number + 1,
        COALESCE(
          (
            SELECT MAX(RIGHT(order_number, 4)::int) + 1
            FROM orders
            WHERE order_number ~ $1
          ),
          1
        )
      )
      RETURNING counter_date, last_number
    `,
    [`^ORD-${dateKey}-[0-9]{4}$`]
  );

  const { counter_date: counterDate, last_number: lastNumber } = counterResult.rows[0];
  return formatOrderNumber(new Date(counterDate), lastNumber);
};

module.exports = {
  hashPassword,
  comparePassword,
  generateOrderNumber
};

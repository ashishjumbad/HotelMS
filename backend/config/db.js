const { Pool } = require('pg');
const { URL } = require('url');
const { hashPassword } = require('../utils/helpers');
require('dotenv').config();

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const normalizeDatabaseUrl = (databaseUrl) => {
  if (!databaseUrl) {
    return databaseUrl;
  }

  const parsedUrl = new URL(databaseUrl);

  // Keep current secure behavior and silence the pg warning about future sslmode changes.
  if (parsedUrl.searchParams.get('sslmode') === 'require') {
    parsedUrl.searchParams.set('sslmode', 'verify-full');
  }

  return parsedUrl.toString();
};

const getSslConfig = (host) => {
  const dbSsl = process.env.DB_SSL;

  if (typeof dbSsl === 'string') {
    if (dbSsl.toLowerCase() === 'false') {
      return false;
    }

    return {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    };
  }

  return LOCAL_DB_HOSTS.has(host) ? false : { rejectUnauthorized: false };
};

const buildPoolConfig = () => {
  const connectionTimeoutMillis = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 30000);
  const idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS || 30000);

  if (process.env.DATABASE_URL) {
    const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
    const parsedUrl = new URL(connectionString);
    const host = parsedUrl.hostname;
    const config = {
      connectionString,
      connectionTimeoutMillis,
      idleTimeoutMillis,
      keepAlive: true
    };

    // Only set ssl explicitly when using a local URL override. For managed hosts,
    // let pg derive SSL behavior from the URL query parameters.
    if (!parsedUrl.searchParams.has('sslmode') && !parsedUrl.searchParams.has('ssl')) {
      config.ssl = getSslConfig(host);
    }

    return config;
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hotelms',
    ssl: getSslConfig(process.env.DB_HOST || 'localhost'),
    connectionTimeoutMillis,
    idleTimeoutMillis,
    keepAlive: true
  };
};

const pool = new Pool(buildPoolConfig());

const formatOrderDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const buildFormattedOrderNumber = (dateKey, sequenceNumber) => {
  return `ORD-${dateKey}-${String(sequenceNumber).padStart(4, '0')}`;
};

const backfillLegacyOrderNumbers = async () => {
  const legacyOrdersResult = await pool.query(
    `
      SELECT id, created_at::date AS order_date
      FROM orders
      WHERE order_number !~ '^ORD-[0-9]{8}-[0-9]{4}$'
      ORDER BY created_at, id
    `
  );

  if (legacyOrdersResult.rows.length === 0) {
    return;
  }

  const nextSequenceByDate = new Map();

  for (const order of legacyOrdersResult.rows) {
    const dateKey = formatOrderDateKey(order.order_date);

    if (!nextSequenceByDate.has(dateKey)) {
      const maxSequenceResult = await pool.query(
        `
          SELECT COALESCE(MAX(RIGHT(order_number, 4)::int), 0) AS max_sequence
          FROM orders
          WHERE order_number ~ $1
        `,
        [`^ORD-${dateKey}-[0-9]{4}$`]
      );

      nextSequenceByDate.set(dateKey, (maxSequenceResult.rows[0]?.max_sequence || 0) + 1);
    }

    const nextSequence = nextSequenceByDate.get(dateKey);
    const nextOrderNumber = buildFormattedOrderNumber(dateKey, nextSequence);

    await pool.query(
      'UPDATE orders SET order_number = $1 WHERE id = $2',
      [nextOrderNumber, order.id]
    );

    nextSequenceByDate.set(dateKey, nextSequence + 1);
  }
};

const getColumnType = async (tableName, columnName) => {
  const result = await pool.query(
    `
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
    `,
    [tableName, columnName]
  );

  return result.rows[0] || null;
};

const migrateLegacySubscriptionTables = async () => {
  const planIdType = await getColumnType('subscription_plans', 'id');

  if (planIdType && planIdType.udt_name !== 'uuid') {
    await pool.query(`
      CREATE TABLE subscription_plans_new (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_code VARCHAR(20) UNIQUE,
        plan_number INTEGER UNIQUE,
        name VARCHAR(100) NOT NULL,
        monthly_price DECIMAL(10, 2) NOT NULL,
        yearly_price DECIMAL(10, 2) NOT NULL,
        max_tables INTEGER DEFAULT 10,
        max_employees INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      INSERT INTO subscription_plans_new (
        plan_code,
        plan_number,
        name,
        monthly_price,
        yearly_price,
        max_tables,
        max_employees,
        is_active,
        created_at,
        updated_at
      )
      SELECT
        NULL,
        NULL,
        name,
        monthly_price,
        yearly_price,
        COALESCE(max_tables, 10),
        COALESCE(max_employees, 5),
        true,
        COALESCE(created_at, CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      FROM subscription_plans
    `);

    await pool.query(`DROP TABLE subscription_plans`);
    await pool.query(`ALTER TABLE subscription_plans_new RENAME TO subscription_plans`);
  }

  const paymentIdType = await getColumnType('payments', 'id');

  if (paymentIdType && paymentIdType.udt_name !== 'uuid') {
    const paymentCountResult = await pool.query(`SELECT COUNT(*)::int AS count FROM payments`);
    const paymentCount = paymentCountResult.rows[0]?.count || 0;

    if (paymentCount > 0) {
      throw new Error(
        'Legacy payments table uses integer IDs and contains data. Manual migration is required before startup can continue.'
      );
    }

    await pool.query(`DROP TABLE payments`);
  }
};

const ensureDefaultSuperAdmin = async () => {
  const adminEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL || 'admin@restaurant.com';
  const adminPassword = process.env.DEFAULT_SUPER_ADMIN_PASSWORD || 'Admin@123';
  const adminName = process.env.DEFAULT_SUPER_ADMIN_NAME || 'Super Admin';

  const existingAdmin = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [adminEmail]
  );

  if (existingAdmin.rows.length > 0) {
    return;
  }

  const passwordHash = await hashPassword(adminPassword);

  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminEmail, passwordHash, adminName, 'super_admin', true]
  );

  console.log(`Default super admin ensured for ${adminEmail}`);
};

const ensureSubscriptionPlanCodes = async () => {
  await pool.query(`
    ALTER TABLE subscription_plans
    ADD COLUMN IF NOT EXISTS plan_code VARCHAR(20)
  `);

  await pool.query(`
    WITH existing_max AS (
      SELECT COALESCE(MAX(SUBSTRING(plan_code FROM 6)::int), 0) AS max_code
      FROM subscription_plans
      WHERE plan_code ~ '^PLAN-[0-9]{4,}$'
    ),
    missing_codes AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY created_at, id) AS row_num
      FROM subscription_plans
      WHERE plan_code IS NULL OR plan_code = ''
    )
    UPDATE subscription_plans sp
    SET plan_code = 'PLAN-' || LPAD((existing_max.max_code + missing_codes.row_num)::text, 4, '0')
    FROM missing_codes
    CROSS JOIN existing_max
    WHERE sp.id = missing_codes.id
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_plan_code
    ON subscription_plans(plan_code)
  `);
};

const ensureSubscriptionPlanNumbers = async () => {
  await pool.query(`
    ALTER TABLE subscription_plans
    ADD COLUMN IF NOT EXISTS plan_number INTEGER
  `);

  await pool.query(`
    WITH existing_max AS (
      SELECT COALESCE(MAX(plan_number), 0) AS max_number
      FROM subscription_plans
    ),
    missing_numbers AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY created_at, id) AS row_num
      FROM subscription_plans
      WHERE plan_number IS NULL
    )
    UPDATE subscription_plans sp
    SET plan_number = existing_max.max_number + missing_numbers.row_num
    FROM missing_numbers
    CROSS JOIN existing_max
    WHERE sp.id = missing_numbers.id
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_plan_number
    ON subscription_plans(plan_number)
  `);
};

const initializeDatabase = async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'hotel_admin', 'customer')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS hotels (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        address TEXT,
        phone VARCHAR(20),
        email VARCHAR(255),
        logo_url TEXT,
        cover_image_url TEXT,
        subscription_status VARCHAR(50) DEFAULT 'pending' CHECK (subscription_status IN ('pending', 'active', 'expired', 'cancelled')),
        subscription_start_date TIMESTAMP,
        subscription_end_date TIMESTAMP,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        orders JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        table_number INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        qr_code TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hotel_id, table_number)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hotel_id, name)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS dishes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        image_url TEXT,
        is_available BOOLEAN DEFAULT true,
        is_vegetarian BOOLEAN DEFAULT false,
        preparation_time INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        position VARCHAR(100) NOT NULL,
        salary DECIMAL(10, 2),
        hire_date DATE DEFAULT CURRENT_DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
        customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
        order_number VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
        payment_method VARCHAR(50),
        special_instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        dish_id UUID REFERENCES dishes(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        special_instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_counters (
        counter_date DATE PRIMARY KEY,
        last_number INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_code VARCHAR(20) UNIQUE,
        plan_number INTEGER UNIQUE,
        name VARCHAR(100) NOT NULL,
        monthly_price DECIMAL(10, 2) NOT NULL,
        yearly_price DECIMAL(10, 2) NOT NULL,
        max_tables INTEGER DEFAULT 10,
        max_employees INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await migrateLegacySubscriptionTables();
    await ensureSubscriptionPlanCodes();
    await ensureSubscriptionPlanNumbers();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
        plan_name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
        payment_receipt_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
        subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_hotels_admin ON hotels(admin_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tables_hotel ON tables(hotel_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dishes_hotel ON dishes(hotel_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dishes_category ON dishes(category_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_hotel ON orders(hotel_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`);

    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await pool.query(`DROP TRIGGER IF EXISTS update_users_updated_at ON users`);
    await pool.query(`CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
    await pool.query(`DROP TRIGGER IF EXISTS update_hotels_updated_at ON hotels`);
    await pool.query(`CREATE TRIGGER update_hotels_updated_at BEFORE UPDATE ON hotels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
    await pool.query(`DROP TRIGGER IF EXISTS update_dishes_updated_at ON dishes`);
    await pool.query(`CREATE TRIGGER update_dishes_updated_at BEFORE UPDATE ON dishes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
    await pool.query(`DROP TRIGGER IF EXISTS update_orders_updated_at ON orders`);
    await pool.query(`CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
    await pool.query(`DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions`);
    await pool.query(`CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);

    await pool.query(`
      ALTER TABLE hotels
      ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS reset_password_token_hash VARCHAR(64)
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS reset_password_expires_at TIMESTAMP
    `);

    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)
    `);

    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20)
    `);

    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_address TEXT
    `);

    await pool.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT
    `);

    await pool.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS orders JSONB DEFAULT '[]'::jsonb
    `);

    await pool.query(`
      UPDATE hotels
      SET registered_at = COALESCE(registered_at, created_at, CURRENT_TIMESTAMP)
      WHERE registered_at IS NULL
    `);

    await backfillLegacyOrderNumbers();

    await ensureDefaultSuperAdmin();

    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization failed:', error.stack);
    throw error;
  }
};

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    const targetHost = process.env.DB_HOST
      || (process.env.DATABASE_URL ? new URL(normalizeDatabaseUrl(process.env.DATABASE_URL)).hostname : 'localhost');

    console.error(`Error connecting to the database host "${targetHost}":`, err.stack);
  } else {
    console.log('Successfully connected to PostgreSQL');
    release();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  initializeDatabase,
  buildPoolConfig
};

const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { pool } = require('./config/db');

dotenv.config();

const createSuperAdmin = async () => {
  try {
    console.log('Creating super admin...');

    // Check if super admin already exists
    // const checkResult = await pool.query(
    //   "SELECT id FROM users WHERE role = 'super_admin'"
    // );

    // if (checkResult.rows.length > 0) {
    //   console.log('Super admin already exists');
    //   process.exit(0);
    // }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('Admin@123', salt);

    // Create super admin
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, full_name, role`,
      ['admin@gmail.com', hashedPassword, 'Super Admin', 'super_admin', true]
    );

    console.log('Super admin created successfully:');
    console.log({
      email: 'admin@gmail.com',
      password: 'Admin@123',
      ...result.rows[0]
    });

  } catch (error) {
    console.error('Error creating super admin:', error);
  } finally {
    await pool.end();
  }
};

createSuperAdmin();

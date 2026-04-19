const db = require('../config/db');
const { generateQRCode } = require('../utils/generateQR');
const { getDatabaseErrorMessage } = require('../utils/dbError');
const { hashPassword } = require('../utils/helpers');

const getFrontendOrigin = (req) => req.get('x-frontend-origin') || '';

const parseBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
};

const getUploadedImageUrl = (req) => {
  if (!req.file) {
    return null;
  }

  return `${req.protocol}://${req.get('host')}/uploads/dishes/${req.file.filename}`;
};

// ==================== TABLE MANAGEMENT ====================

// @desc    Get all tables
// @route   GET /api/hotel-admin/tables
// @access  Private/HotelAdmin
const getTables = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const frontendOrigin = getFrontendOrigin(req);

    const tablesResult = await db.query(
      `SELECT * FROM tables 
       WHERE hotel_id = $1 
       ORDER BY table_number`,
      [hotelId]
    );

    const tables = await Promise.all(
      tablesResult.rows.map(async (table) => {
        const qrCode = await generateQRCode(table, frontendOrigin);
        const nextTable = {
          ...table,
          qr_code: qrCode
        };

        if (table.qr_code !== qrCode) {
          await db.query(
            'UPDATE tables SET qr_code = $1 WHERE id = $2',
            [qrCode, table.id]
          );
        }

        return nextTable;
      })
    );

    res.json({ tables });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Create table
// @route   POST /api/hotel-admin/tables
// @access  Private/HotelAdmin
const createTable = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const frontendOrigin = getFrontendOrigin(req);
    const { table_number, capacity } = req.body;

    // Check if table number already exists
    const existingTable = await db.query(
      'SELECT id FROM tables WHERE hotel_id = $1 AND table_number = $2',
      [hotelId, table_number]
    );

    if (existingTable.rows.length > 0) {
      return res.status(400).json({ message: 'Table number already exists' });
    }

    // Create table
    const tableResult = await db.query(
      `INSERT INTO tables (hotel_id, table_number, capacity) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [hotelId, table_number, capacity]
    );

    const table = tableResult.rows[0];

    // Generate QR code
    const qrCode = await generateQRCode(table, frontendOrigin);
    
    // Update table with QR code
    await db.query(
      'UPDATE tables SET qr_code = $1 WHERE id = $2',
      [qrCode, table.id]
    );

    table.qr_code = qrCode;

    res.status(201).json({
      message: 'Table created successfully',
      table
    });
  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Update table
// @route   PUT /api/hotel-admin/tables/:id
// @access  Private/HotelAdmin
const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;
    const frontendOrigin = getFrontendOrigin(req);
    const { table_number, capacity, is_active } = req.body;
    const normalizedIsActive = parseBoolean(is_active);
    const normalizedTableNumber = table_number === '' || table_number == null ? null : Number(table_number);
    const normalizedCapacity = capacity === '' || capacity == null ? null : Number(capacity);

    // Check if table exists and belongs to hotel
    const tableCheck = await db.query(
      'SELECT id FROM tables WHERE id = $1 AND hotel_id = $2',
      [id, hotelId]
    );

    if (tableCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }

    // Check if new table number is available
    if (normalizedTableNumber) {
      const existingTable = await db.query(
        'SELECT id FROM tables WHERE hotel_id = $1 AND table_number = $2 AND id != $3',
        [hotelId, normalizedTableNumber, id]
      );

      if (existingTable.rows.length > 0) {
        return res.status(400).json({ message: 'Table number already exists' });
      }
    }

    // Update table
    const tableResult = await db.query(
      `UPDATE tables 
       SET table_number = COALESCE($1, table_number),
           capacity = COALESCE($2, capacity),
           is_active = COALESCE($3::boolean, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND hotel_id = $5
       RETURNING *`,
      [normalizedTableNumber, normalizedCapacity, normalizedIsActive, id, hotelId]
    );

    if (tableResult.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }

    const updatedTable = tableResult.rows[0];
    const qrCode = await generateQRCode(updatedTable, frontendOrigin);

    if (updatedTable.qr_code !== qrCode) {
      await db.query(
        'UPDATE tables SET qr_code = $1 WHERE id = $2',
        [qrCode, id]
      );
    }

    res.json({
      message: 'Table updated successfully',
      table: {
        ...updatedTable,
        qr_code: qrCode
      }
    });
  } catch (error) {
    console.error('Update table error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Delete table
// @route   DELETE /api/hotel-admin/tables/:id
// @access  Private/HotelAdmin
const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;

    const result = await db.query(
      'DELETE FROM tables WHERE id = $1 AND hotel_id = $2 RETURNING id',
      [id, hotelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Table not found' });
    }

    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// ==================== DISH MANAGEMENT ====================

// @desc    Get all dishes
// @route   GET /api/hotel-admin/dishes
// @access  Private/HotelAdmin
const getDishes = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const { category, available } = req.query;

    let query = `
      SELECT d.*, c.name as category_name 
      FROM dishes d
      LEFT JOIN categories c ON d.category_id = c.id
      WHERE d.hotel_id = $1
    `;
    
    const params = [hotelId];
    let paramIndex = 2;

    if (category) {
      query += ` AND d.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (available === 'true') {
      query += ` AND d.is_available = true`;
    }

    query += ` ORDER BY d.created_at DESC`;

    const dishesResult = await db.query(query, params);

    res.json({ dishes: dishesResult.rows });
  } catch (error) {
    console.error('Get dishes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create dish
// @route   POST /api/hotel-admin/dishes
// @access  Private/HotelAdmin
const createDish = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const { name, description, price, category_id, preparation_time } = req.body;
    const isVegetarian = parseBoolean(req.body.is_vegetarian) || false;
    const imageUrl = getUploadedImageUrl(req);
    const normalizedCategoryId = category_id || null;
    const normalizedPreparationTime = preparation_time === '' || preparation_time == null
      ? null
      : Number(preparation_time);

    const dishResult = await db.query(
      `INSERT INTO dishes (hotel_id, name, description, price, category_id, is_vegetarian, preparation_time, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [hotelId, name, description, price, normalizedCategoryId, isVegetarian, normalizedPreparationTime, imageUrl]
    );

    res.status(201).json({
      message: 'Dish created successfully',
      dish: dishResult.rows[0]
    });
  } catch (error) {
    console.error('Create dish error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Update dish
// @route   PUT /api/hotel-admin/dishes/:id
// @access  Private/HotelAdmin
const updateDish = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;
    const { name, description, price, category_id, preparation_time } = req.body;
    const isAvailable = parseBoolean(req.body.is_available);
    const isVegetarian = parseBoolean(req.body.is_vegetarian);
    const imageUrl = getUploadedImageUrl(req);
    const normalizedCategoryId = category_id === '' ? null : category_id;
    const normalizedPreparationTime = preparation_time === '' || preparation_time == null
      ? null
      : Number(preparation_time);

    const dishResult = await db.query(
      `UPDATE dishes 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           category_id = COALESCE($4, category_id),
           is_available = COALESCE($5, is_available),
           is_vegetarian = COALESCE($6, is_vegetarian),
           preparation_time = COALESCE($7, preparation_time),
           image_url = COALESCE($8, image_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND hotel_id = $10
       RETURNING *`,
      [name, description, price, normalizedCategoryId, isAvailable, isVegetarian, normalizedPreparationTime, imageUrl, id, hotelId]
    );

    if (dishResult.rows.length === 0) {
      return res.status(404).json({ message: 'Dish not found' });
    }

    res.json({
      message: 'Dish updated successfully',
      dish: dishResult.rows[0]
    });
  } catch (error) {
    console.error('Update dish error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Delete dish
// @route   DELETE /api/hotel-admin/dishes/:id
// @access  Private/HotelAdmin
const deleteDish = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;

    const result = await db.query(
      'DELETE FROM dishes WHERE id = $1 AND hotel_id = $2 RETURNING id',
      [id, hotelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dish not found' });
    }

    res.json({ message: 'Dish deleted successfully' });
  } catch (error) {
    console.error('Delete dish error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== CATEGORY MANAGEMENT ====================

// @desc    Get all categories
// @route   GET /api/hotel-admin/categories
// @access  Private/HotelAdmin
const getCategories = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;

    const categoriesResult = await db.query(
      `SELECT * FROM categories 
       WHERE hotel_id = $1 
       ORDER BY display_order, name`,
      [hotelId]
    );

    res.json({ categories: categoriesResult.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create category
// @route   POST /api/hotel-admin/categories
// @access  Private/HotelAdmin
const createCategory = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const { name, description, display_order } = req.body;
    const normalizedDisplayOrder = display_order === '' || display_order == null
      ? 0
      : Number(display_order);

    const categoryResult = await db.query(
      `INSERT INTO categories (hotel_id, name, description, display_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [hotelId, name, description, normalizedDisplayOrder]
    );

    res.status(201).json({
      message: 'Category created successfully',
      category: categoryResult.rows[0]
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Update category
// @route   PUT /api/hotel-admin/categories/:id
// @access  Private/HotelAdmin
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;
    const { name, description, display_order, is_active } = req.body;
    const normalizedDisplayOrder = display_order === '' || display_order == null
      ? null
      : Number(display_order);
    const normalizedIsActive = parseBoolean(is_active);

    const categoryResult = await db.query(
      `UPDATE categories
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           display_order = COALESCE($3, display_order),
           is_active = COALESCE($4, is_active)
       WHERE id = $5 AND hotel_id = $6
       RETURNING *`,
      [name, description, normalizedDisplayOrder, normalizedIsActive, id, hotelId]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      message: 'Category updated successfully',
      category: categoryResult.rows[0]
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Delete category
// @route   DELETE /api/hotel-admin/categories/:id
// @access  Private/HotelAdmin
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;

    const categoryUsageResult = await db.query(
      'SELECT COUNT(*)::int AS dish_count FROM dishes WHERE category_id = $1 AND hotel_id = $2',
      [id, hotelId]
    );

    if (categoryUsageResult.rows[0]?.dish_count > 0) {
      return res.status(400).json({ message: 'Category is assigned to dishes and cannot be deleted' });
    }

    const result = await db.query(
      'DELETE FROM categories WHERE id = $1 AND hotel_id = $2 RETURNING id',
      [id, hotelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// ==================== ORDER MANAGEMENT ====================

// @desc    Get all orders
// @route   GET /api/hotel-admin/orders
// @access  Private/HotelAdmin
const getOrders = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const { status, date, table } = req.query;

    let query = `
      SELECT o.*, 
        t.table_number,
        u.full_name as customer_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.customer_id = u.id
      WHERE o.hotel_id = $1
    `;
    
    const params = [hotelId];
    let paramIndex = 2;

    if (status) {
      query += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (date) {
      query += ` AND DATE(o.created_at) = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (table) {
      query += ` AND o.table_id = $${paramIndex}`;
      params.push(table);
      paramIndex++;
    }

    query += ` ORDER BY o.created_at DESC`;

    const ordersResult = await db.query(query, params);

    // Get order items for each order
    const ordersWithItems = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await db.query(
          `SELECT oi.*, d.name as dish_name 
           FROM order_items oi
           LEFT JOIN dishes d ON oi.dish_id = d.id
           WHERE oi.order_id = $1`,
          [order.id]
        );
        return { ...order, items: itemsResult.rows };
      })
    );

    res.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update order status
// @route   PUT /api/hotel-admin/orders/:id/status
// @access  Private/HotelAdmin
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const hotelId = req.user.hotel_id;
    const allowedStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    const orderResult = await db.query(
      `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND hotel_id = $3
       RETURNING *`,
      [status, id, hotelId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      message: 'Order status updated successfully',
      order: orderResult.rows[0]
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== EMPLOYEE MANAGEMENT ====================

// @desc    Get all employees
// @route   GET /api/hotel-admin/employees
// @access  Private/HotelAdmin
const getEmployees = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;

    const employeesResult = await db.query(
      `SELECT e.*, u.email, u.full_name, u.phone 
       FROM employees e
       JOIN users u ON e.user_id = u.id
       WHERE e.hotel_id = $1`,
      [hotelId]
    );

    res.json({ employees: employeesResult.rows });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create employee
// @route   POST /api/hotel-admin/employees
// @access  Private/HotelAdmin
const createEmployee = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;
    const { email, full_name, phone, position, salary } = req.body;
    const normalizedSalary = salary === '' || salary == null ? null : Number(salary);
    const tempPasswordHash = await hashPassword('ChangeMe123!');

    // Start transaction
    await db.query('BEGIN');

    // Create user
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [email, tempPasswordHash, full_name, phone, 'customer', true]
    );

    const userId = userResult.rows[0].id;

    // Create employee record
    const employeeResult = await db.query(
      `INSERT INTO employees (hotel_id, user_id, position, salary)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [hotelId, userId, position, normalizedSalary]
    );

    await db.query('COMMIT');

    res.status(201).json({
      message: 'Employee created successfully',
      employee: employeeResult.rows[0],
      temporary_password: 'ChangeMe123!'
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Create employee error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// @desc    Delete order
// @route   DELETE /api/hotel-admin/orders/:id
// @access  Private/HotelAdmin
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const hotelId = req.user.hotel_id;

    const orderResult = await db.query(
      'DELETE FROM orders WHERE id = $1 AND hotel_id = $2 RETURNING id',
      [id, hotelId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: getDatabaseErrorMessage(error) });
  }
};

// ==================== DASHBOARD ====================

// @desc    Get dashboard statistics
// @route   GET /api/hotel-admin/dashboard
// @access  Private/HotelAdmin
const getDashboardStats = async (req, res) => {
  try {
    const hotelId = req.user.hotel_id;

    const statsResult = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM tables WHERE hotel_id = $1) as total_tables,
        (SELECT COUNT(*) FROM dishes WHERE hotel_id = $1) as total_dishes,
        (SELECT COUNT(*) FROM dishes WHERE hotel_id = $1 AND is_available = true) as available_dishes,
        (SELECT COUNT(*) FROM employees WHERE hotel_id = $1) as total_employees,
        (SELECT COUNT(*) FROM orders WHERE hotel_id = $1) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE hotel_id = $1 AND DATE(created_at) = CURRENT_DATE) as today_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE hotel_id = $1) as total_revenue,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE hotel_id = $1 AND DATE(created_at) = CURRENT_DATE) as today_revenue
      `,
      [hotelId]
    );

    // Get recent orders
    const recentOrdersResult = await db.query(
      `SELECT o.*, t.table_number 
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       WHERE o.hotel_id = $1 
       ORDER BY o.created_at DESC 
       LIMIT 5`,
      [hotelId]
    );

    // Get best-selling dishes for the current month
    const monthlyBestSellingDishesResult = await db.query(
      `SELECT
         d.id,
         d.name,
         d.price,
         COALESCE(SUM(oi.quantity), 0)::int as sold_quantity
       FROM dishes d
       LEFT JOIN order_items oi ON d.id = oi.dish_id
       LEFT JOIN orders o ON oi.order_id = o.id
       WHERE d.hotel_id = $1
         AND (
           o.id IS NULL OR (
             DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', CURRENT_DATE)
             AND o.status != 'cancelled'
           )
         )
       GROUP BY d.id, d.name, d.price
       ORDER BY sold_quantity DESC, d.name ASC
       LIMIT 5`,
      [hotelId]
    );

    res.json({
      stats: statsResult.rows[0],
      recent_orders: recentOrdersResult.rows,
      monthly_best_selling_dishes: monthlyBestSellingDishesResult.rows
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  // Tables
  getTables,
  createTable,
  updateTable,
  deleteTable,
  
  // Dishes
  getDishes,
  createDish,
  updateDish,
  deleteDish,
  
  // Categories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  
  // Orders
  getOrders,
  updateOrderStatus,
  deleteOrder,
  
  // Employees
  getEmployees,
  createEmployee,
  
  // Dashboard
  getDashboardStats
};

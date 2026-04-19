const db = require('../config/db');
const { generateOrderNumber } = require('../utils/helpers');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getUuidLookupValue = (value) => UUID_PATTERN.test(value) ? value : null;

const getPublicAssetUrl = (req, assetUrl) => {
  if (!assetUrl) {
    return assetUrl;
  }

  try {
    const parsedUrl = new URL(assetUrl);

    if (!parsedUrl.pathname.startsWith('/uploads/')) {
      return assetUrl;
    }

    return `${req.protocol}://${req.get('host')}${parsedUrl.pathname}`;
  } catch (error) {
    if (assetUrl.startsWith('/uploads/')) {
      return `${req.protocol}://${req.get('host')}${assetUrl}`;
    }

    return assetUrl;
  }
};

// @desc    Get menu for a hotel/table
// @route   GET /api/customer/menu/:hotelId
// @access  Public
const getMenu = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { tableId } = req.query;

    // Get hotel info
    const hotelResult = await db.query(
      'SELECT id, name, logo_url, cover_image_url FROM hotels WHERE id = $1 AND is_active = true',
      [hotelId]
    );

    if (hotelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Hotel not found' });
    }

    // Get categories with dishes
    const categoriesResult = await db.query(
      `SELECT c.*, 
        json_agg(
          json_build_object(
            'id', d.id,
            'name', d.name,
            'description', d.description,
            'price', d.price,
            'image_url', d.image_url,
            'is_vegetarian', d.is_vegetarian,
            'preparation_time', d.preparation_time
          ) ORDER BY d.name
        ) FILTER (WHERE d.id IS NOT NULL) as dishes
       FROM categories c
       LEFT JOIN dishes d ON c.id = d.category_id AND d.is_available = true
       WHERE c.hotel_id = $1 AND c.is_active = true
       GROUP BY c.id
       ORDER BY c.display_order, c.name`,
      [hotelId]
    );

    // Get table info if provided
    let tableInfo = null;
    if (tableId) {
      const tableResult = await db.query(
        'SELECT id, table_number, capacity FROM tables WHERE id = $1 AND hotel_id = $2 AND is_active = true',
        [tableId, hotelId]
      );
      if (tableResult.rows.length > 0) {
        tableInfo = tableResult.rows[0];
      }
    }

    const hotel = {
      ...hotelResult.rows[0],
      logo_url: getPublicAssetUrl(req, hotelResult.rows[0].logo_url),
      cover_image_url: getPublicAssetUrl(req, hotelResult.rows[0].cover_image_url)
    };

    const menu = categoriesResult.rows.map((category) => ({
      ...category,
      dishes: (category.dishes || []).map((dish) => ({
        ...dish,
        image_url: getPublicAssetUrl(req, dish.image_url)
      }))
    }));

    res.json({
      hotel,
      table: tableInfo,
      menu
    });
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create order
// @route   POST /api/customer/orders
// @access  Public (with optional customer authentication)
const createOrder = async (req, res) => {
  try {
    const { hotelId, tableId, items, customerInfo, specialInstructions } = req.body;
    const customerId = req.user?.id; // If authenticated

    if (!customerInfo?.name || !customerInfo?.phone) {
      return res.status(400).json({ message: 'Customer name and phone are required' });
    }

    // Validate items
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must have at least one item' });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Calculate total amount
      let totalAmount = 0;
      const orderItems = [];

      for (const item of items) {
        const dishResult = await db.query(
          'SELECT id, price, name FROM dishes WHERE id = $1 AND hotel_id = $2 AND is_available = true',
          [item.dishId, hotelId]
        );

        if (dishResult.rows.length === 0) {
          throw new Error(`Dish ${item.dishId} not found or not available`);
        }

        const dish = dishResult.rows[0];
        const subtotal = dish.price * item.quantity;
        totalAmount += subtotal;

        orderItems.push({
          dish_id: dish.id,
          dish_name: dish.name,
          quantity: item.quantity,
          unit_price: dish.price,
          subtotal,
          special_instructions: item.specialInstructions
        });
      }

      let orderResult;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const orderNumber = await generateOrderNumber(db);

        try {
          orderResult = await db.query(
            `INSERT INTO orders (
              hotel_id,
              table_id,
              customer_id,
              order_number,
              status,
              total_amount,
              payment_method,
              customer_name,
              customer_phone,
              customer_address,
              special_instructions
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
              hotelId,
              tableId,
              customerId,
              orderNumber,
              'pending',
              totalAmount,
              null,
              customerInfo.name,
              customerInfo.phone,
              customerInfo.address || null,
              specialInstructions
            ]
          );
          break;
        } catch (insertError) {
          if (insertError.code !== '23505' || attempt === 2) {
            throw insertError;
          }
        }
      }

      const order = orderResult.rows[0];

      // Create order items
      for (const item of orderItems) {
        await db.query(
          `INSERT INTO order_items (order_id, dish_id, quantity, unit_price, subtotal, special_instructions)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.dish_id, item.quantity, item.unit_price, item.subtotal, item.special_instructions]
        );
      }

      const customerOrderSummary = {
        order_id: order.id,
        order_number: order.order_number,
        hotel_id: hotelId,
        table_id: tableId,
        payment_method: null,
        total_amount: totalAmount,
        ordered_at: order.created_at,
        dishes: orderItems.map((item) => ({
          dish_id: item.dish_id,
          dish_name: item.dish_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        }))
      };

      const existingCustomerResult = await db.query(
        `SELECT id
         FROM customers
         WHERE phone = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [customerInfo.phone]
      );

      let customerProfileId;

      if (existingCustomerResult.rows.length > 0) {
        const updatedCustomerResult = await db.query(
          `UPDATE customers
           SET name = $1,
               address = COALESCE($2, address),
               orders = COALESCE(orders, '[]'::jsonb) || $3::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING id`,
          [
            customerInfo.name,
            customerInfo.address || null,
            JSON.stringify([customerOrderSummary]),
            existingCustomerResult.rows[0].id
          ]
        );

        customerProfileId = updatedCustomerResult.rows[0].id;
      } else {
        const createdCustomerResult = await db.query(
          `INSERT INTO customers (name, phone, address, orders)
           VALUES ($1, $2, $3, $4::jsonb)
           RETURNING id`,
          [
            customerInfo.name,
            customerInfo.phone,
            customerInfo.address || null,
            JSON.stringify([customerOrderSummary])
          ]
        );

        customerProfileId = createdCustomerResult.rows[0].id;
      }

      const hotelNameResult = await db.query(
        'SELECT name FROM hotels WHERE id = $1',
        [hotelId]
      );

      await db.query(
        `INSERT INTO customer_visit_history (
          hotel_id,
          customer_id,
          user_id,
          order_id,
          table_id,
          hotel_name,
          customer_name,
          customer_phone,
          customer_address,
          order_number,
          total_amount,
          visit_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          hotelId,
          customerProfileId,
          customerId || null,
          order.id,
          tableId || null,
          hotelNameResult.rows[0]?.name || 'Unknown hotel',
          customerInfo.name,
          customerInfo.phone,
          customerInfo.address || null,
          order.order_number,
          totalAmount,
          order.created_at
        ]
      );

      await db.query('COMMIT');

      res.status(201).json({
        message: 'Order created successfully',
        order: {
          ...order,
          items: orderItems
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get order status
// @route   GET /api/customer/orders/:orderId
// @access  Public (with order number)
const getOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderUuid = getUuidLookupValue(orderId);

    const orderResult = await db.query(
      `SELECT o.*, 
        h.name as hotel_name,
        t.table_number,
        json_agg(
          json_build_object(
            'id', oi.id,
            'dish_name', d.name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'subtotal', oi.subtotal,
            'special_instructions', oi.special_instructions
          )
        ) as items
       FROM orders o
       JOIN hotels h ON o.hotel_id = h.id
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN dishes d ON oi.dish_id = d.id
       WHERE ($2::uuid IS NOT NULL AND o.id = $2::uuid) OR o.order_number = $1
       GROUP BY o.id, h.name, t.table_number`,
      [orderId, orderUuid]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order: orderResult.rows[0] });
  } catch (error) {
    console.error('Get order status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Cancel customer order
// @route   PUT /api/customer/orders/:orderId/cancel
// @access  Public
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { phone } = req.body;
    const orderUuid = getUuidLookupValue(orderId);

    if (!phone) {
      return res.status(400).json({ message: 'Customer phone is required' });
    }

    const orderLookupResult = await db.query(
      `
        SELECT id, status, customer_phone
        FROM orders
        WHERE ($2::uuid IS NOT NULL AND id = $2::uuid) OR order_number = $1
        LIMIT 1
      `,
      [orderId, orderUuid]
    );

    if (orderLookupResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = orderLookupResult.rows[0];

    if (order.customer_phone !== phone) {
      return res.status(403).json({ message: 'You cannot cancel this order' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });
    }

    const updateResult = await db.query(
      `
        UPDATE orders
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [order.id]
    );

    res.json({
      message: 'Order cancelled successfully',
      order: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get customer orders (authenticated)
// @route   GET /api/customer/my-orders
// @access  Private/Customer
const getMyOrders = async (req, res) => {
  try {
    const customerId = req.user.id;

    const ordersResult = await db.query(
      `SELECT o.*, 
        h.name as hotel_name,
        h.logo_url as hotel_logo
       FROM orders o
       JOIN hotels h ON o.hotel_id = h.id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC`,
      [customerId]
    );

    res.json({ orders: ordersResult.rows });
  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getMenu,
  createOrder,
  getOrderStatus,
  cancelOrder,
  getMyOrders
};

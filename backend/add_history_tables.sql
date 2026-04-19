CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS hotel_registration_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    hotel_name VARCHAR(255) NOT NULL,
    hotel_address TEXT,
    hotel_phone VARCHAR(20),
    hotel_email VARCHAR(255),
    admin_name VARCHAR(255),
    admin_email VARCHAR(255),
    admin_phone VARCHAR(20),
    subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    subscription_plan_name VARCHAR(100),
    subscription_billing_cycle VARCHAR(20) CHECK (subscription_billing_cycle IN ('monthly', 'yearly')),
    subscription_price DECIMAL(10, 2),
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_visit_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    hotel_name VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_address TEXT,
    order_number VARCHAR(50),
    total_amount DECIMAL(10, 2),
    visit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hotel_registration_history_hotel
    ON hotel_registration_history(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_registration_history_registered
    ON hotel_registration_history(registered_at);
CREATE INDEX IF NOT EXISTS idx_customer_visit_history_hotel
    ON customer_visit_history(hotel_id);
CREATE INDEX IF NOT EXISTS idx_customer_visit_history_customer
    ON customer_visit_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_visit_history_order
    ON customer_visit_history(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_visit_history_visit_at
    ON customer_visit_history(visit_at);

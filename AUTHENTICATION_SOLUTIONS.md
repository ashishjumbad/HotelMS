# Authentication & Code Solutions - HotelMST

## Overview
This document provides solutions for all issues identified in `AUTHENTICATION_ISSUES.md`.

---

# PART 1: ESLint Warning Fixes

## 1. Fix navbar.js - Remove Unused Import

**File:** `src/components/common/navbar.js`

**Change Line 4-9 FROM:**
```javascript
import {
  HomeIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ShoppingBagIcon
} from '@heroicons/react/24/outline';
```

**TO:**
```javascript
import {
  HomeIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
```

---

## 2. Fix AuthContext.js - Missing Hook Dependency

**File:** `src/context/AuthContext.js`

**Change Lines 19-35 FROM:**
```javascript
useEffect(() => {
  checkAuth();
}, []);

const checkAuth = async () => {
  try {
    const response = await authApi.checkAuth();
    if (response.authenticated) {
      await loadUser();
    } else {
      setLoading(false);
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    setLoading(false);
  }
};
```

**TO:**
```javascript
const checkAuth = useCallback(async () => {
  try {
    const response = await authApi.checkAuth();
    if (response.authenticated) {
      await loadUser();
    } else {
      setLoading(false);
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    setLoading(false);
  }
}, []);

useEffect(() => {
  checkAuth();
}, [checkAuth]);
```

**Also add import at top:**
```javascript
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
```

---

## 3. Fix Menu.js - Remove Unused Variables

**File:** `src/pages/customer/Menu.js`

**Change Line 8-17 FROM:**
```javascript
import {
  ShoppingBagIcon,
  PlusIcon,
  MinusIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  FireIcon,
  ClockIcon,
  UserIcon
} from '@heroicons/react/24/outline';
```

**TO:**
```javascript
import {
  ShoppingBagIcon,
  PlusIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  FireIcon,
  ClockIcon,
  UserIcon
} from '@heroicons/react/24/outline';
```

**Change Line 25-26 FROM:**
```javascript
const { isAuthenticated, user } = useAuth();
const { addToCart, cart, getCartCount, setRestaurant, setTable } = useCart();
```

**TO:**
```javascript
const { isAuthenticated } = useAuth();
const { addToCart, getCartCount, setRestaurant, setTable } = useCart();
```

---

## 4. Fix Dashboard.js - Remove Unused Import

**File:** `src/pages/hotelAdmin/Dashboard.js`

**Change Lines 4-11 FROM:**
```javascript
import {
  ChartBarIcon,
  ShoppingBagIcon,
  UserGroupIcon,
  CreditCardIcon,
  CubeIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
```

**TO:**
```javascript
import {
  ShoppingBagIcon,
  UserGroupIcon,
  CreditCardIcon,
  CubeIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
```

---

## 5. Fix Tables.js - Remove Unused Import

**File:** `src/pages/hotelAdmin/Tables.js`

**Change Lines 1-12 FROM:**
```javascript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { hotelAdminApi } from '../../api/hotelAdminApi';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  QrCodeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
```

**TO:**
```javascript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { hotelAdminApi } from '../../api/hotelAdminApi';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  QrCodeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
```

---

## 6. Fix Subscriptions.js - Remove Duplicate Functions & Use Axios Instance

**File:** `src/pages/superAdmin/Subscriptions.js`

**COMPLETE REWRITE:**
```javascript
import { useState, useEffect } from "react";
import axiosInstance from "../../api/axios";
import "./Subscription.css";

function Subscriptions() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    monthly_price: "",
    yearly_price: "",
    max_tables: "",
    max_employees: ""
  });
  const [editingId, setEditingId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await axiosInstance.get("/subscriptions");
      setPlans(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Fetch plans error:", err);
      setError(err.response?.data?.message || "Failed to load subscription plans");
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const createPlan = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await axiosInstance.put(`/subscriptions/${editingId}`, formData);
        setEditingId(null);
      } else {
        await axiosInstance.post("/subscriptions", formData);
      }

      setFormData({
        name: "",
        monthly_price: "",
        yearly_price: "",
        max_tables: "",
        max_employees: ""
      });
      setShowModal(false);
      fetchPlans();
    } catch (err) {
      console.error("Create/Update plan error:", err);
      setError(err.response?.data?.message || (editingId ? "Failed to update plan" : "Failed to create plan"));
    }
  };

  const editPlan = (plan) => {
    setShowModal(true);
    setFormData({
      name: plan.name || "",
      monthly_price: plan.monthly_price ?? "",
      yearly_price: plan.yearly_price ?? "",
      max_tables: plan.max_tables ?? "",
      max_employees: plan.max_employees ?? ""
    });
    setEditingId(plan.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: "",
      monthly_price: "",
      yearly_price: "",
      max_tables: "",
      max_employees: ""
    });
    setShowModal(false);
  };

  const deletePlan = async (id) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;

    try {
      await axiosInstance.delete(`/subscriptions/${id}`);
      fetchPlans();
    } catch (err) {
      console.error("Delete plan error:", err);
      setError(err.response?.data?.message || "Failed to delete plan");
    }
  };

  // Payment handler using Razorpay
  const handlePayment = async (planId, amount, billingCycle) => {
    try {
      const response = await axiosInstance.post("/payments/create-order", {
        amount,
        planId,
        billingCycle
      });

      const order = response.data;

      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY,
        amount: order.amount,
        currency: "INR",
        name: "HotelMS",
        description: `Subscription Payment`,
        order_id: order.id,
        handler: async function (response) {
          try {
            await axiosInstance.post("/payments/verify", response);
            alert("Payment Successful!");
            fetchPlans();
          } catch (error) {
            alert("Payment verification failed");
          }
        },
        prefill: {
          email: "",
          contact: ""
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Payment error:", error);
      alert("Failed to initiate payment");
    }
  };

  if (loading) return <div style={{ padding: "20px" }}>Loading...</div>;

  return (
    <div className="page-container subscription-page">
      <div className="page-card">
        <div className="page-header">
          <div>
            <h2>Subscription Management</h2>
            <p className="page-subtitle">Manage subscription plans</p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowModal(true)}
          >
            + Add Plan
          </button>
        </div>

        {error && <p style={{ color: "red", padding: "10px" }}>{error}</p>}

        {showModal && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header">
                {editingId ? "Edit Plan" : "Create New Plan"}
              </div>
              <form onSubmit={createPlan}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Plan Name</label>
                      <input
                        name="name"
                        type="text"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Monthly Price</label>
                      <input
                        name="monthly_price"
                        type="number"
                        value={formData.monthly_price}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Yearly Price</label>
                      <input
                        name="yearly_price"
                        type="number"
                        value={formData.yearly_price}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Tables</label>
                      <input
                        name="max_tables"
                        type="number"
                        value={formData.max_tables}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Max Employees</label>
                      <input
                        name="max_employees"
                        type="number"
                        value={formData.max_employees}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingId ? "Update Plan" : "Create Plan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {plans.length === 0 ? (
        <p style={{ padding: "20px" }}>No subscription plans found</p>
      ) : (
        <table className="styled-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Monthly Price</th>
              <th>Yearly Price</th>
              <th>Max Tables</th>
              <th>Max Employees</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.id}</td>
                <td>{plan.name}</td>
                <td>₹{plan.monthly_price}</td>
                <td>₹{plan.yearly_price}</td>
                <td>{plan.max_tables}</td>
                <td>{plan.max_employees}</td>
                <td>
                  <button
                    className="btn-edit"
                    onClick={() => editPlan(plan)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => deletePlan(plan.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Subscriptions;
```

---

## 7. Fix AppRoutes.js - Remove Unused Variable

**File:** `src/routes/AppRoutes.js`

**Change Lines 30-32 FROM:**
```javascript
const AppRoutes = () => {
  const { isAuthenticated } = useAuth();

  return (
```

**TO:**
```javascript
const AppRoutes = () => {
  return (
```

**Also remove the import if useAuth is no longer used:**
```javascript
// Remove this line if not needed elsewhere:
// import { useAuth } from '../context/AuthContext';
```

---

# PART 2: Authentication Feature Fixes

## 1. Add Server Error Display to Signup Form

**File:** `src/pages/signup.js`

**Add state for general error:**
```javascript
const [generalError, setGeneralError] = useState('');
```

**Update handleSubmit:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setGeneralError(''); // Clear previous error

  const newErrors = validateForm();
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }

  setLoading(true);

  const result = await registerHotelAdmin({
    email: formData.email,
    password: formData.password,
    fullName: formData.fullName,
    phone: formData.phone,
    hotelName: formData.hotelName,
    hotelAddress: formData.hotelAddress,
    hotelPhone: formData.hotelPhone
  });

  if (result.success) {
    navigate('/login');
  } else {
    // Show server error on form
    setGeneralError(result.error);
  }

  setLoading(false);
};
```

**Add error display in JSX (after form tag opens):**
```javascript
<form onSubmit={handleSubmit}>
  {generalError && (
    <div className="error-alert" style={{ marginBottom: '1.5rem' }}>
      <p>{generalError}</p>
    </div>
  )}
  {/* ... rest of form */}
</form>
```

---

## 2. Add Password Visibility Toggle

**Create a reusable component:**

**File:** `src/components/common/PasswordInput.js`
```javascript
import React, { useState } from 'react';
import { EyeIcon, EyeSlashIcon, LockClosedIcon } from '@heroicons/react/24/outline';

const PasswordInput = ({
  name,
  value,
  onChange,
  placeholder,
  className = '',
  error = false
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="input-wrapper" style={{ position: 'relative' }}>
      <LockClosedIcon className="input-icon" />
      <input
        name={name}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`form-input ${error ? 'error' : ''} ${className}`}
        style={{ paddingRight: '3rem' }}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        style={{
          position: 'absolute',
          right: '1rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          color: '#718096'
        }}
        tabIndex={-1}
      >
        {showPassword ? (
          <EyeSlashIcon style={{ width: '1.25rem', height: '1.25rem' }} />
        ) : (
          <EyeIcon style={{ width: '1.25rem', height: '1.25rem' }} />
        )}
      </button>
    </div>
  );
};

export default PasswordInput;
```

**Usage in Login.js:**
```javascript
import PasswordInput from '../components/common/PasswordInput';

// Replace password input with:
<PasswordInput
  name="password"
  value={formData.password}
  onChange={handleChange}
  placeholder="Enter your password"
/>
```

---

## 3. Add Phone Number Validation

**File:** `src/pages/signup.js`

**Add to validateForm function:**
```javascript
const validateForm = () => {
  const newErrors = {};

  // ... existing validations ...

  // Phone validation (optional field but validate format if provided)
  const phoneRegex = /^[+]?[\d\s-]{10,15}$/;

  if (formData.phone && !phoneRegex.test(formData.phone)) {
    newErrors.phone = 'Please enter a valid phone number';
  }

  if (formData.hotelPhone && !phoneRegex.test(formData.hotelPhone)) {
    newErrors.hotelPhone = 'Please enter a valid hotel phone number';
  }

  return newErrors;
};
```

---

## 4. Create Forgot Password Page

**File:** `src/pages/ForgotPassword.js`
```javascript
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import axiosInstance from '../api/axios';
import toast from 'react-hot-toast';
import './Login.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await axiosInstance.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success('Password reset link sent to your email');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h2>Reset Password</h2>
          <p>
            Remember your password?{' '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>

        <div className="login-card">
          <div className="login-card-content">
            {sent ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <h3 style={{ color: '#48bb78', marginBottom: '1rem' }}>Check Your Email</h3>
                <p style={{ color: '#718096' }}>
                  We've sent a password reset link to <strong>{email}</strong>
                </p>
                <p style={{ color: '#a0aec0', fontSize: '0.9rem', marginTop: '1rem' }}>
                  Didn't receive the email? Check your spam folder or{' '}
                  <button
                    onClick={() => setSent(false)}
                    style={{ color: '#667eea', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    try again
                  </button>
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ color: '#718096', marginBottom: '1.5rem' }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <div className="input-wrapper">
                    <EnvelopeIcon className="input-icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="form-input"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`submit-button ${loading ? 'loading' : ''}`}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
```

**Add route in AppRoutes.js:**
```javascript
import ForgotPassword from '../pages/ForgotPassword';

// Add inside Routes:
<Route path="/forgot-password" element={<ForgotPassword />} />
```

**Update Login.js forgot password link:**
```javascript
// Change from:
<a href="/forgot-password">Forgot password?</a>

// To:
<Link to="/forgot-password">Forgot password?</Link>
```

---

## 5. Add Environment Variable for Razorpay

**File:** `.env` (create in frontend root)
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_RAZORPAY_KEY=your_razorpay_key_here
```

**File:** `.env.example` (for documentation)
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_RAZORPAY_KEY=rzp_test_xxxxxxxxxxxxx
```

---

# PART 3: Backend Fixes

## 1. Add Rate Limiting

**Install package:**
```bash
cd backend
npm install express-rate-limit
```

**File:** `backend/middleware/rateLimiter.js`
```javascript
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    message: 'Too many requests, please try again later.'
  }
});

// Stricter limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    message: 'Too many login attempts, please try again after 15 minutes.'
  },
  skipSuccessfulRequests: true // Don't count successful logins
});

// Password reset limiter
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 requests per hour
  message: {
    message: 'Too many password reset attempts, please try again later.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter
};
```

**File:** `backend/routes/authRoutes.js` (update)
```javascript
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to login
router.post('/login', authLimiter, loginValidation, login);

// Apply rate limiting to registration
router.post('/register/hotel', authLimiter, registerValidation, registerHotelAdmin);

// Apply rate limiting to password reset
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
```

---

## 2. Add Forgot Password Backend

**File:** `backend/controllers/authController.js` (add function)
```javascript
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const userResult = await db.query(
      'SELECT id, email, full_name FROM users WHERE email = $1',
      [email]
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const user = userResult.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    // Save token to database
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetTokenHash, resetExpires, user.id]
    );

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Configure nodemailer (example with Gmail)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      to: user.email,
      subject: 'Password Reset - HotelMS',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.full_name},</p>
        <p>You requested to reset your password. Click the link below:</p>
        <a href="${resetUrl}" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  // ... existing exports
  forgotPassword
};
```

---

# PART 4: Quick Copy-Paste Fixes

## Fix All ESLint Warnings at Once

Run these commands to see what needs to be fixed:
```bash
cd frontend
npx eslint src --fix --ext .js,.jsx
```

## Files Summary to Edit

| File | Action |
|------|--------|
| `src/components/common/navbar.js` | Remove `ShoppingBagIcon` import |
| `src/context/AuthContext.js` | Add `useCallback`, wrap `checkAuth` |
| `src/pages/customer/Menu.js` | Remove `MinusIcon`, `user`, `cart` |
| `src/pages/hotelAdmin/Dashboard.js` | Remove `ChartBarIcon` import |
| `src/pages/hotelAdmin/Tables.js` | Remove `QRCode` import |
| `src/pages/superAdmin/Subscriptions.js` | Complete rewrite (see above) |
| `src/routes/AppRoutes.js` | Remove `isAuthenticated` |

---

# PART 5: Testing Checklist

After applying fixes, verify:

- [ ] `npm start` shows no ESLint warnings
- [ ] Login page works correctly
- [ ] Signup page shows server errors
- [ ] Password toggle shows/hides password
- [ ] Forgot password sends email (if backend configured)
- [ ] Subscriptions page loads without errors
- [ ] Rate limiting blocks excessive requests
- [ ] All routes work correctly

---

*Document created on: 2026-03-05*
*Total Fixes Provided: 15+ code changes*

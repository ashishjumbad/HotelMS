# HotelMS Project - Solutions Guide

## Critical Errors Solutions

### 1. Missing .env File

**Problem:** The project uses `dotenv` but no `.env` file exists.

**Solution:**
1. Create a new file named `.env` in the `backend/` directory
2. Add the following environment variables:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=hotelms
DB_PORT=3306
SESSION_SECRET=your_secure_random_session_secret
PORT=5000
```
3. Generate a strong session secret using a random string generator (minimum 32 characters)
4. Add `.env` to `.gitignore` to prevent committing sensitive data to version control

---

### 2. Hardcoded Database Credentials

**Problem:** Database password is hardcoded in `backend/config/db.js:5-8`.

**Solution:**
1. Replace the hardcoded credentials with environment variables
2. In `db.js`, update the connection configuration:
```javascript
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hotelms',
    port: process.env.DB_PORT || 3306
});
```
3. Ensure `require('dotenv').config()` is called at the top of the application entry point before database connection is established

---

### 3. Hardcoded Session Secret

**Problem:** Session secret is hardcoded as `"supersecret"` in `backend/app.js:16`.

**Solution:**
1. Replace the hardcoded secret with an environment variable
2. In `app.js`, update the session configuration:
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
```
3. Add validation to ensure SESSION_SECRET is defined before starting the server:
```javascript
if (!process.env.SESSION_SECRET) {
    console.error('FATAL ERROR: SESSION_SECRET is not defined');
    process.exit(1);
}
```

---

## Backend Errors Solutions

### 4. Missing Error Handling in authController.js

**Problem:** The `login` function in `backend/controllers/authController.js:4-25` lacks try-catch block.

**Solution:**
Wrap the entire login function logic in a try-catch block:
```javascript
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Database query and authentication logic here
        // ...

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
```

---

### 5. Missing Error Handling in subscriptionController.js

**Problem:** `createPlan`, `getPlans`, and `deletePlan` functions lack try-catch blocks.

**Solution:**
Add try-catch blocks to all three functions:

**createPlan:**
```javascript
const createPlan = async (req, res) => {
    try {
        // Plan creation logic
    } catch (error) {
        console.error('Create plan error:', error);
        return res.status(500).json({ message: 'Failed to create plan' });
    }
};
```

**getPlans:**
```javascript
const getPlans = async (req, res) => {
    try {
        // Get plans logic
    } catch (error) {
        console.error('Get plans error:', error);
        return res.status(500).json({ message: 'Failed to retrieve plans' });
    }
};
```

**deletePlan:**
```javascript
const deletePlan = async (req, res) => {
    try {
        // Delete plan logic
    } catch (error) {
        console.error('Delete plan error:', error);
        return res.status(500).json({ message: 'Failed to delete plan' });
    }
};
```

---

### 6. Unused Hotel Controller Functions

**Problem:** `getHotels` and `updateStatus` functions are defined in `hotelController.js` but not used in `hotelRoutes.js`.

**Solution:**
1. Import the missing functions in `hotelRoutes.js`:
```javascript
const { createHotel, getHotels, updateStatus } = require('../controllers/hotelController');
```

2. Add the missing routes:
```javascript
router.get('/', getHotels);           // GET /api/hotels - List all hotels
router.patch('/:id/status', updateStatus);  // PATCH /api/hotels/:id/status - Update hotel status
```

---

## Frontend Errors Solutions

### 7. Empty Page Files

**Problem:** `frontend/src/pages/Hotels.js` and `frontend/src/pages/Subscriptions.js` are empty/incomplete.

**Solution:**

**Hotels.js:**
```javascript
import React, { useState, useEffect } from 'react';

const Hotels = () => {
    const [hotels, setHotels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchHotels();
    }, []);

    const fetchHotels = async () => {
        try {
            const response = await fetch('/api/hotels');
            const data = await response.json();
            setHotels(data);
            setLoading(false);
        } catch (err) {
            setError('Failed to load hotels');
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div>{error}</div>;

    return (
        <div>
            <h1>Hotels</h1>
            {/* Hotel list rendering */}
        </div>
    );
};

export default Hotels;
```

**Subscriptions.js:**
```javascript
import React, { useState, useEffect } from 'react';

const Subscriptions = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        try {
            const response = await fetch('/api/subscriptions');
            const data = await response.json();
            setPlans(data);
            setLoading(false);
        } catch (err) {
            setError('Failed to load subscription plans');
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div>{error}</div>;

    return (
        <div>
            <h1>Subscription Plans</h1>
            {/* Plans list rendering */}
        </div>
    );
};

export default Subscriptions;
```

---

### 8. No React Router Configuration

**Problem:** `react-router-dom` is installed but not configured in `frontend/src/App.js`.

**Solution:**
1. Import React Router components in `App.js`:
```javascript
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
```

2. Import page components:
```javascript
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hotels from './pages/Hotels';
import Subscriptions from './pages/Subscriptions';
```

3. Configure routes in the App component:
```javascript
function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login setAuth={setIsAuthenticated} />} />
                <Route
                    path="/dashboard"
                    element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />}
                />
                <Route
                    path="/hotels"
                    element={isAuthenticated ? <Hotels /> : <Navigate to="/login" />}
                />
                <Route
                    path="/subscriptions"
                    element={isAuthenticated ? <Subscriptions /> : <Navigate to="/login" />}
                />
                <Route path="/" element={<Navigate to="/login" />} />
            </Routes>
        </Router>
    );
}
```

---

### 9. Hardcoded Test Credentials in App.js

**Problem:** Test email and password are hardcoded in `frontend/src/App.js:39-40`.

**Solution:**
1. Remove hardcoded test credentials from the production code
2. If testing is needed, use environment variables:
```javascript
// Only use in development
const testEmail = process.env.REACT_APP_TEST_EMAIL || '';
const testPassword = process.env.REACT_APP_TEST_PASSWORD || '';
```
3. Better approach: Create a separate test file or use a testing framework (Jest, React Testing Library) for authentication tests
4. For form default values, leave them empty:
```javascript
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
```

---

## Implementation Priority

| Priority | Error | Reason |
|----------|-------|--------|
| 1 | Missing .env File | Foundation for other fixes |
| 2 | Hardcoded Database Credentials | Security critical |
| 3 | Hardcoded Session Secret | Security critical |
| 4 | Missing Error Handling (authController) | Server stability |
| 5 | Missing Error Handling (subscriptionController) | Server stability |
| 6 | Unused Hotel Controller Functions | Feature completeness |
| 7 | React Router Configuration | Frontend navigation |
| 8 | Empty Page Files | Frontend functionality |
| 9 | Hardcoded Test Credentials | Code cleanliness |

---

## Additional Recommendations

1. **Create a `.env.example` file** with placeholder values to document required environment variables
2. **Add input validation** using a library like `express-validator` for all API endpoints
3. **Implement centralized error handling middleware** in Express to handle errors consistently
4. **Add authentication middleware** to protect routes that require login
5. **Use HTTPS** in production for secure data transmission

const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const { initializeDatabase } = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.stack);
    process.exit(1);
  }
};

startServer();

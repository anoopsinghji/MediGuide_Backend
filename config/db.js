const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGO_URI || 'mongodb://localhost:27017/mediaguide-nextgen',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );

    console.log('\n✅ MongoDB Connected Successfully');
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Host: ${conn.connection.host}\n`);

    return conn;
  } catch (err) {
    console.error('\n❌ MongoDB Connection Failed');
    console.error(`Error: ${err.message}`);
    // In production we must not silently fall back — fail fast so the platform
    // (Render/Heroku) shows the process as unhealthy and restarts it.
    if (process.env.NODE_ENV === 'production') {
      console.error('❗ Production DB connection failed — exiting.');
      console.error('If you expect the server to run without a DB, set NODE_ENV!=production.');
      process.exit(1);
    }

    // For development/demo environments keep the existing behavior.
    console.log('⚠️  Falling back to IN-MEMORY DEMO MODE\n');
    process.env.DEMO_MODE = 'true';
  }
};

module.exports = connectDB;

import mongoose from 'mongoose';

/**
 * MongoDB Atlas Connection
 * Handles connection with retry logic and event listeners
 */
const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    console.error('❌ MONGO_URI is not defined in environment variables');
    process.exit(1);
  }

  // Mongoose connection options
  const options = {
    maxPoolSize: 10,           // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying for 5 seconds
    socketTimeoutMS: 45000,    // Close sockets after 45s of inactivity
    bufferCommands: false,     // Disable mongoose buffering
  };

  // Connection state tracking
  let retries = 0;
  const maxRetries = 5;

  const attemptConnection = async () => {
    try {
      const conn = await mongoose.connect(mongoURI, options);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      console.log(`📊 Database: ${conn.connection.name}`);
      console.log(`🔌 Connection State: ${conn.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
      return conn;
    } catch (error) {
      retries++;
      console.error(`❌ MongoDB Connection Attempt ${retries}/${maxRetries} Failed:`, error.message);

      if (retries >= maxRetries) {
        console.error('❌ Max retries reached. Exiting...');
        process.exit(1);
      }

      // Exponential backoff: 2s, 4s, 8s, 16s
      const delay = Math.pow(2, retries) * 1000;
      console.log(`⏳ Retrying in ${delay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return attemptConnection();
    }
  };

  // Initial connection
  await attemptConnection();

  // Event Listeners for connection monitoring
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Runtime Error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB Disconnected. Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB Reconnected');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('🔌 MongoDB Connection Closed (App Termination)');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await mongoose.connection.close();
    console.log('🔌 MongoDB Connection Closed (SIGTERM)');
    process.exit(0);
  });
};

export default connectDB;
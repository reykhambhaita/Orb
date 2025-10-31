// backend/db.js - FIXED VERSION
import crypto from 'crypto';
import mongoose from 'mongoose';

// --- ENCRYPTION SETUP ---
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// CRITICAL: Validate encryption key
if (!ENCRYPTION_KEY) {
  console.error('❌ FATAL: ENCRYPTION_KEY environment variable is not set!');
  console.error('Set ENCRYPTION_KEY in your Vercel environment variables');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  throw new Error('ENCRYPTION_KEY is required');
}

if (ENCRYPTION_KEY.length !== 64) {
  console.error('❌ FATAL: ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  throw new Error('Invalid ENCRYPTION_KEY length');
}

console.log('✅ Encryption key loaded (length:', ENCRYPTION_KEY.length, ')');

// Encryption helper functions
const encrypt = (text) => {
  if (!text) return null;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );

    let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
};

const decrypt = (encryptedData) => {
  if (!encryptedData) return null;

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      console.error('Invalid encrypted data format');
      return null;
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  encryptedLocation: { type: String },
  landmarks: [String],
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Virtual field to decrypt location when accessed
userSchema.virtual('location').get(function() {
  return this.encryptedLocation ? decrypt(this.encryptedLocation) : null;
});

// Ensure virtuals are included in JSON output
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const mechanicSchema = new mongoose.Schema({
  name: String,
  phone: String,
  location: {
    type: { type: String, default: 'Point' },
    coordinates: [Number]
  },
  specialties: [String],
  rating: Number,
  available: { type: Boolean, default: true }
});

mechanicSchema.index({ location: '2dsphere' });

// --- MODELS ---
const User = mongoose.model('User', userSchema);
const Mechanic = mongoose.model('Mechanic', mechanicSchema);

// --- CONNECTION ---
export const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    console.log('✅ MongoDB already connected');
    return;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  // CRITICAL: Validate MongoDB URI
  if (!MONGODB_URI) {
    console.error('❌ FATAL: MONGODB_URI environment variable is not set!');
    throw new Error('MONGODB_URI is required');
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully');
    console.log('   Database:', mongoose.connection.name);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
};

// --- ENSURE USER EXISTS ---
export const ensureUserExists = async (userId) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  await connectDB();

  try {
    // Check if user already exists
    let user = await User.findOne({ userId });

    if (user) {
      console.log('✅ User already exists:', userId);
      return user;
    }

    // Create new user
    user = await User.create({
      userId,
      landmarks: [],
      lastUpdated: new Date(),
      createdAt: new Date()
    });

    console.log('✅ Created new user in MongoDB:', userId);
    return user;
  } catch (error) {
    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      console.log('ℹ️ User already exists (race condition):', userId);
      return await User.findOne({ userId });
    }

    console.error('❌ Error ensuring user exists:', error);
    throw error;
  }
};

// --- UPDATE USER LOCATION ---
export const updateUserLocation = async (userId, location, landmarks = []) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!location || !location.latitude || !location.longitude) {
    throw new Error('Valid location with latitude and longitude is required');
  }

  await connectDB();

  try {
    // Ensure user exists first
    await ensureUserExists(userId);

    // Encrypt the location data
    const encryptedLocation = encrypt({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      timestamp: location.timestamp || new Date()
    });

    const user = await User.findOneAndUpdate(
      { userId },
      {
        encryptedLocation,
        landmarks,
        lastUpdated: new Date()
      },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found after ensure');
    }

    console.log('✅ Updated location for user:', userId);
    return user;
  } catch (error) {
    console.error('❌ Error updating user location:', error);
    throw error;
  }
};

// --- GET NEARBY MECHANICS ---
export const getNearbyMechanics = async (lat, lng, radius = 5000) => {
  if (!lat || !lng) {
    throw new Error('Latitude and longitude are required');
  }

  await connectDB();

  try {
    return await Mechanic.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radius
        }
      },
      available: true
    }).limit(20);
  } catch (error) {
    console.error('❌ Error fetching nearby mechanics:', error);
    throw error;
  }
};

// --- GET LANDMARKS NEAR LOCATION ---
export const getLandmarksNearLocation = async (lat, lng, radius = 1000) => {
  if (!lat || !lng) {
    throw new Error('Latitude and longitude are required');
  }

  await connectDB();

  try {
    // Fetch all users and decrypt their locations for proximity check
    const allUsers = await User.find({});
    const nearbyUsers = allUsers.filter(user => {
      if (!user.encryptedLocation) return false;

      const location = decrypt(user.encryptedLocation);
      if (!location) return false;

      const latDiff = Math.abs(location.latitude - lat);
      const lngDiff = Math.abs(location.longitude - lng);

      // Approximately 1km = 0.01 degrees
      const radiusDegrees = radius / 100000;
      return latDiff <= radiusDegrees && lngDiff <= radiusDegrees;
    });

    const landmarks = new Set();
    nearbyUsers.forEach(user => {
      if (user.landmarks) {
        user.landmarks.forEach(landmark => landmarks.add(landmark));
      }
    });

    return Array.from(landmarks);
  } catch (error) {
    console.error('❌ Error fetching landmarks:', error);
    throw error;
  }
};

// --- HEALTH CHECK ---
export const checkDatabaseHealth = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { status: 'disconnected', ready: false };
    }

    // Ping the database
    await mongoose.connection.db.admin().ping();

    return {
      status: 'connected',
      ready: true,
      database: mongoose.connection.name,
      host: mongoose.connection.host
    };
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return {
      status: 'error',
      ready: false,
      error: error.message
    };
  }
};

// --- EXPORT MODELS ---
export { Mechanic, User };

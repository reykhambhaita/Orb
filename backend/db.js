// backend/db.js
import crypto from 'crypto';
import mongoose from 'mongoose';

// --- ENCRYPTION SETUP ---
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Encryption helper functions
const encrypt = (text) => {
  if (!text) return null;
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
};

const decrypt = (encryptedData) => {
  if (!encryptedData) return null;

  const parts = encryptedData.split(':');
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
};

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  encryptedLocation: { type: String }, // Encrypted location data
  landmarks: [String],
  lastUpdated: { type: Date, default: Date.now }
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
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/locationtracker',
    {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  );
};

// --- FUNCTIONS ---
export const updateUserLocation = async (userId, location, landmarks = []) => {
  await connectDB();

  // Encrypt the location data
  const encryptedLocation = encrypt({
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    timestamp: new Date()
  });

  return await User.findOneAndUpdate(
    { userId },
    {
      encryptedLocation,
      landmarks,
      lastUpdated: new Date()
    },
    { upsert: true, new: true }
  );
};

export const getNearbyMechanics = async (lat, lng, radius = 5000) => {
  await connectDB();
  return await Mechanic.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radius
      }
    },
    available: true
  }).limit(20);
};

export const getLandmarksNearLocation = async (lat, lng, radius = 1000) => {
  await connectDB();

  // Fetch all users and decrypt their locations for proximity check
  const allUsers = await User.find({});
  const nearbyUsers = allUsers.filter(user => {
    if (!user.encryptedLocation) return false;

    const location = decrypt(user.encryptedLocation);
    if (!location) return false;

    const latDiff = Math.abs(location.latitude - lat);
    const lngDiff = Math.abs(location.longitude - lng);

    return latDiff <= 0.01 && lngDiff <= 0.01;
  });

  const landmarks = new Set();
  nearbyUsers.forEach(user => {
    if (user.landmarks) {
      user.landmarks.forEach(landmark => landmarks.add(landmark));
    }
  });

  return Array.from(landmarks);
};

// --- EXPORT MODELS TOO ---
export { Mechanic, User };

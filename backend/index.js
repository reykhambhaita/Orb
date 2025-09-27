import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/location-tracker';

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// MongoDB Schemas (based on models.js)
const userLocationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  encryptedLat: {
    type: String,
    required: true
  },
  encryptedLng: {
    type: String,
    required: true
  },
  // For API compatibility, also store unencrypted coordinates
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    default: 10
  },
  source: {
    type: String,
    enum: ['gps', 'wifi', 'bluetooth', 'deadReckoning', 'beacon', 'fusion'],
    default: 'gps'
  },
  locatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

const mechanicSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  location: {
    lat: { type: String, required: true }, // encrypted in production
    lng: { type: String, required: true }, // encrypted in production
    locatedAt: { type: Date, default: Date.now }
  },
  // For query compatibility, store unencrypted coordinates
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  services: [{ type: String, trim: true, required: true }],
  ratings: [{ type: Number, min: 0, max: 5 }],
  organisation: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  timestamp: { type: Date, default: Date.now },
  lastSyncVersion: { type: Number, default: 1 },
  region: { type: String, index: true },
  priority: { type: Number, default: 0 }
}, { timestamps: true });

const landmarkSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  region: { type: String, index: true },
  lastSyncVersion: { type: Number, default: 1 },
  priority: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes for geospatial queries
mechanicSchema.index({ latitude: 1, longitude: 1 });
mechanicSchema.index({ isActive: 1, region: 1 });
landmarkSchema.index({ 'location.lat': 1, 'location.lng': 1 });
userLocationSchema.index({ latitude: 1, longitude: 1 });

// Models
const UserLocation = mongoose.model('UserLocation', userLocationSchema);
const Mechanic = mongoose.model('Mechanic', mechanicSchema);
const Landmark = mongoose.model('Landmark', landmarkSchema);

// Utility functions
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Earth's radius in meters
  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// Simple encryption placeholder (in production, use proper encryption)
const encryptCoordinate = (coord) => {
  // For demo purposes, just convert to string. Use proper encryption in production.
  return Buffer.from(coord.toString()).toString('base64');
};

const decryptCoordinate = (encryptedCoord) => {
  // For demo purposes, just decode. Use proper decryption in production.
  try {
    return parseFloat(Buffer.from(encryptedCoord, 'base64').toString());
  } catch {
    return 0;
  }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    data: {
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

// POST /api/location/enhanced - Save single location with nearby data
app.post('/api/location/enhanced', async (req, res) => {
  try {
    console.log('📍 POST /api/location/enhanced - Request body:', JSON.stringify(req.body, null, 2));

    const { latitude, longitude, accuracy = 10, userId, source = 'gps', includeNearby = true, radius = 10000 } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
        data: null
      });
    }

    // Create location record
    const locationData = {
      latitude,
      longitude,
      accuracy,
      source,
      userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      encryptedLat: encryptCoordinate(latitude),
      encryptedLng: encryptCoordinate(longitude),
      locatedAt: new Date()
    };

    const savedLocation = await UserLocation.create(locationData);
    console.log('✅ Location saved:', savedLocation._id);

    let responseData = {
      location: savedLocation
    };

    // Include nearby mechanics and landmarks if requested
    if (includeNearby) {
      console.log(`🔍 Finding nearby data within ${radius}m radius...`);

      // Find nearby mechanics
      const mechanics = await Mechanic.find({ isActive: true }).lean();
      const nearbyMechanics = mechanics
        .map(mechanic => ({
          ...mechanic,
          distance: calculateDistance(latitude, longitude, mechanic.latitude, mechanic.longitude)
        }))
        .filter(mechanic => mechanic.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20); // Limit to 20 nearest

      // Find nearby landmarks
      const landmarks = await Landmark.find().lean();
      const nearbyLandmarks = landmarks
        .map(landmark => ({
          ...landmark,
          distance: calculateDistance(latitude, longitude, landmark.location.lat, landmark.location.lng)
        }))
        .filter(landmark => landmark.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20); // Limit to 20 nearest

      responseData.nearbyMechanics = nearbyMechanics;
      responseData.nearbyLandmarks = nearbyLandmarks;

      console.log(`📊 Found ${nearbyMechanics.length} mechanics and ${nearbyLandmarks.length} landmarks`);
    }

    res.json({
      success: true,
      message: 'Location saved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error saving location:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
});

// POST /api/location/bulk-sync - Bulk save offline locations
app.post('/api/location/bulk-sync', async (req, res) => {
  try {
    console.log('📦 POST /api/location/bulk-sync - Request body:', JSON.stringify(req.body, null, 2));

    const { locations } = req.body;

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Locations array is required and must not be empty',
        data: null
      });
    }

    // Prepare locations for bulk insert
    const bulkLocations = locations.map(loc => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy || 10,
      source: loc.source || 'offline',
      userId: loc.userId ? new mongoose.Types.ObjectId(loc.userId) : undefined,
      encryptedLat: encryptCoordinate(loc.latitude),
      encryptedLng: encryptCoordinate(loc.longitude),
      locatedAt: loc.timestamp ? new Date(loc.timestamp) : new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const result = await UserLocation.insertMany(bulkLocations, { ordered: false });

    console.log(`✅ Bulk sync completed: ${result.length}/${locations.length} locations saved`);

    res.json({
      success: true,
      message: `Successfully synced ${result.length} locations`,
      data: {
        total: locations.length,
        count: result.length,
        insertedIds: result.map(doc => doc._id)
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk sync:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
});

// POST /api/mechanics/offline-sync - Get mechanics for offline storage
app.post('/api/mechanics/offline-sync', async (req, res) => {
  try {
    console.log('🔧 POST /api/mechanics/offline-sync - Request body:', JSON.stringify(req.body, null, 2));

    const { location, radius = 50000, includeInactive = false, decryptCoordinates = true } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({
        success: false,
        message: 'Location with lat and lng is required',
        data: null
      });
    }

    const query = includeInactive ? {} : { isActive: true };
    const mechanics = await Mechanic.find(query).lean();

    // Filter by radius and add distance
    const mechanicsWithDistance = mechanics
      .map(mechanic => {
        const distance = calculateDistance(location.lat, location.lng, mechanic.latitude, mechanic.longitude);

        // Return mechanic with decrypted coordinates if requested
        let processedMechanic = { ...mechanic };
        if (decryptCoordinates && mechanic.location) {
          processedMechanic.location = {
            ...mechanic.location,
            lat: mechanic.latitude, // Use unencrypted for client
            lng: mechanic.longitude  // Use unencrypted for client
          };
        }

        return {
          ...processedMechanic,
          distance
        };
      })
      .filter(mechanic => mechanic.distance <= radius)
      .sort((a, b) => {
        // Sort by priority first, then distance
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.distance - b.distance;
      });

    console.log(`🔍 Found ${mechanicsWithDistance.length} mechanics within ${radius}m`);

    res.json({
      success: true,
      message: `Found ${mechanicsWithDistance.length} mechanics`,
      data: {
        mechanics: mechanicsWithDistance,
        syncVersion: Date.now(),
        location: location,
        radius: radius
      }
    });

  } catch (error) {
    console.error('❌ Error fetching mechanics:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
});

// POST /api/landmarks/offline-sync - Get landmarks for offline storage
app.post('/api/landmarks/offline-sync', async (req, res) => {
  try {
    console.log('🗺️ POST /api/landmarks/offline-sync - Request body:', JSON.stringify(req.body, null, 2));

    const { location, radius = 30000 } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({
        success: false,
        message: 'Location with lat and lng is required',
        data: null
      });
    }

    const landmarks = await Landmark.find().lean();

    // Filter by radius and add distance
    const landmarksWithDistance = landmarks
      .map(landmark => ({
        ...landmark,
        distance: calculateDistance(location.lat, location.lng, landmark.location.lat, landmark.location.lng)
      }))
      .filter(landmark => landmark.distance <= radius)
      .sort((a, b) => {
        // Sort by priority first, then distance
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.distance - b.distance;
      });

    console.log(`🔍 Found ${landmarksWithDistance.length} landmarks within ${radius}m`);

    res.json({
      success: true,
      message: `Found ${landmarksWithDistance.length} landmarks`,
      data: {
        landmarks: landmarksWithDistance,
        syncVersion: Date.now(),
        location: location,
        radius: radius
      }
    });

  } catch (error) {
    console.error('❌ Error fetching landmarks:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
});

// GET /api/locations - Get user locations with optional filtering
app.get('/api/locations', async (req, res) => {
  try {
    console.log('📍 GET /api/locations - Query params:', req.query);

    const { userId, limit = 50, skip = 0, source } = req.query;

    let query = {};
    if (userId) {
query.userId = new mongoose.Types.ObjectId(userId);    }
    if (source) {
      query.source = source;
    }

    const locations = await UserLocation.find(query)
      .sort({ locatedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await UserLocation.countDocuments(query);

    res.json({
      success: true,
      message: `Retrieved ${locations.length} locations`,
      data: {
        locations,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching locations:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    data: null
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    data: null
  });
});


// Start server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Gracefully shutting down...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM. Gracefully shutting down...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed.');
  process.exit(0);
});

// Start the server
startServer();

// Export app for testing or other use cases
export default app;
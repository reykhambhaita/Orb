import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import { Landmark, Mechanic, User, UserLocation } from './models.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/roadmechanic')
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Encryption setup
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_KEY || "supersecretkey")
  .digest();
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text.toString(), "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  const [ivHex, encryptedText] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return parseFloat(decrypted);
}

// Haversine distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateAverageRating(ratings) {
  if (!ratings || ratings.length === 0) return 0;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function determineRegion(lat, lng) {
  const latZone = Math.floor(lat / 5) * 5;
  const lngZone = Math.floor(lng / 5) * 5;
  return `region_${latZone}_${lngZone}`;
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Road Mechanic Backend API',
    version: '2.0',
    endpoints: [
      'POST /api/location/enhanced - Save location and get nearby data',
      'POST /api/location/bulk-sync - Bulk sync offline locations',
      'POST /api/mechanics/offline-sync - Download mechanics for offline',
      'POST /api/landmarks/offline-sync - Download landmarks for offline',
      'GET /api/debug/db-stats - Database statistics',
      'GET /api/health - Health check'
    ]
  });
});

// CORE LOCATION ENDPOINT - matches MultiModalLocationTracker
app.post('/api/location/enhanced', async (req, res) => {
  try {
    const { latitude, longitude, userId = 'user123', accuracy, source, includeNearby = true, radius = 10000 } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Missing latitude or longitude' });
    }

    console.log(`Saving location: ${latitude}, ${longitude} from ${source || 'unknown'}`);

    // Encrypt and save location
    const encryptedLat = encrypt(latitude);
    const encryptedLng = encrypt(longitude);

    const userLocation = new UserLocation({
      userId,
      encryptedLat,
      encryptedLng,
      locatedAt: new Date()
    });
    await userLocation.save();

    // Update user record
    const region = determineRegion(latitude, longitude);
    await User.findByIdAndUpdate(
      userId,
      {
        lastLocation: userLocation._id,
        lastOfflineSync: new Date(),
        $addToSet: { preferredRegions: region }
      },
      { upsert: true }
    );

    let response = {
      success: true,
      message: 'Location saved successfully',
      region: region,
      locationId: userLocation._id
    };

    if (includeNearby) {
      // Get nearby mechanics
      const mechanics = await Mechanic.find({ isActive: true });
      const nearbyMechanics = mechanics
        .map(m => {
          try {
            const mechLat = decrypt(m.location.lat);
            const mechLng = decrypt(m.location.lng);
            const distance = calculateDistance(latitude, longitude, mechLat, mechLng);
            return {
              id: m._id,
              username: m.username,
              address: m.address,
              latitude: mechLat,
              longitude: mechLng,
              organisation: m.organisation,
              avgRating: calculateAverageRating(m.ratings),
              ratingCount: m.ratings.length,
              services: m.services,
              phone: m.phone,
              distance: Math.round(distance)
            };
          } catch (error) {
            console.error('Error decrypting mechanic location:', m._id);
            return null;
          }
        })
        .filter(m => m !== null && m.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

      // Get nearby landmarks
      const landmarks = await Landmark.find({});
      const nearbyLandmarks = landmarks
        .map(l => {
          const distance = calculateDistance(latitude, longitude, l.location.lat, l.location.lng);
          return {
            id: l._id,
            name: l.name,
            category: l.category,
            location: l.location,
            distance: Math.round(distance)
          };
        })
        .filter(l => l.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

      response.nearbyMechanics = nearbyMechanics;
      response.nearbyLandmarks = nearbyLandmarks;
    }

    res.json(response);

  } catch (error) {
    console.error('Location save error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// BULK SYNC - matches MultiModalLocationTracker offline sync
app.post('/api/location/bulk-sync', async (req, res) => {
  try {
    const { locations } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Locations array required' });
    }

    console.log(`Processing bulk sync for ${locations.length} locations`);

    const results = {
      success: true,
      data: {
        total: locations.length,
        count: 0,
        failed: 0,
        errors: []
      }
    };

    for (const locationData of locations) {
      try {
        const { latitude, longitude, userId = 'user123', timestamp, source } = locationData;

        if (latitude && longitude) {
          const encryptedLat = encrypt(latitude);
          const encryptedLng = encrypt(longitude);

          const userLocation = new UserLocation({
            userId,
            encryptedLat,
            encryptedLng,
            locatedAt: timestamp ? new Date(timestamp) : new Date()
          });

          await userLocation.save();
          results.data.count++;

          // Update user's last location
          const region = determineRegion(latitude, longitude);
          await User.findByIdAndUpdate(
            userId,
            {
              lastLocation: userLocation._id,
              lastOfflineSync: new Date(),
              $addToSet: { preferredRegions: region }
            },
            { upsert: true }
          );

        } else {
          results.data.failed++;
          results.data.errors.push('Missing latitude or longitude');
        }
      } catch (error) {
        results.data.failed++;
        results.data.errors.push(error.message);
      }
    }

    console.log(`Bulk sync completed: ${results.data.count}/${results.data.total} successful`);
    res.json(results);

  } catch (error) {
    console.error('Bulk sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk sync failed',
      details: error.message
    });
  }
});

// OFFLINE MECHANICS SYNC
app.post('/api/mechanics/offline-sync', async (req, res) => {
  try {
    const { location, radius = 50000, decryptCoordinates = true } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }

    const { lat, lng } = location;
    const region = determineRegion(lat, lng);

    const mechanics = await Mechanic.find({ isActive: true }).sort({ priority: -1 });

    const nearbyMechanics = mechanics
      .map(m => {
        try {
          const mechLat = decrypt(m.location.lat);
          const mechLng = decrypt(m.location.lng);
          const distance = calculateDistance(lat, lng, mechLat, mechLng);

          const mechanicData = {
            _id: m._id,
            username: m.username,
            phone: m.phone,
            address: m.address,
            services: m.services,
            ratings: m.ratings,
            organisation: m.organisation,
            isActive: m.isActive,
            region: m.region || region,
            priority: m.priority || 0,
            distance: distance
          };

          if (decryptCoordinates) {
            mechanicData.location = {
              lat: mechLat,
              lng: mechLng,
              locatedAt: m.location.locatedAt
            };
          }

          return mechanicData;
        } catch (error) {
          console.error('Error processing mechanic:', m._id);
          return null;
        }
      })
      .filter(m => m !== null && m.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      data: {
        mechanics: nearbyMechanics,
        syncVersion: Math.floor(Date.now() / 1000),
        region: region,
        downloadedAt: new Date().toISOString(),
        totalCount: nearbyMechanics.length
      }
    });

  } catch (error) {
    console.error('Mechanic sync error:', error);
    res.status(500).json({ error: 'Failed to sync mechanics', details: error.message });
  }
});

// OFFLINE LANDMARKS SYNC
app.post('/api/landmarks/offline-sync', async (req, res) => {
  try {
    const { location, radius = 30000, categories } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }

    const { lat, lng } = location;
    const region = determineRegion(lat, lng);

    let query = {};
    if (categories && categories.length > 0) {
      query.category = { $in: categories };
    }

    const landmarks = await Landmark.find(query).sort({ priority: -1 });

    const nearbyLandmarks = landmarks
      .map(l => {
        const distance = calculateDistance(lat, lng, l.location.lat, l.location.lng);
        return {
          _id: l._id,
          name: l.name,
          category: l.category,
          location: l.location,
          region: l.region || region,
          priority: l.priority || 0,
          distance: distance
        };
      })
      .filter(l => l.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      data: {
        landmarks: nearbyLandmarks,
        syncVersion: Math.floor(Date.now() / 1000),
        region: region,
        downloadedAt: new Date().toISOString(),
        totalCount: nearbyLandmarks.length
      }
    });

  } catch (error) {
    console.error('Landmark sync error:', error);
    res.status(500).json({ error: 'Failed to sync landmarks', details: error.message });
  }
});

// DEBUG ENDPOINT - Check database content from laptop
app.get('/api/debug/db-stats', async (req, res) => {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      collections: {
        users: await User.countDocuments(),
        mechanics: await Mechanic.countDocuments(),
        activeMechanics: await Mechanic.countDocuments({ isActive: true }),
        landmarks: await Landmark.countDocuments(),
        userLocations: await UserLocation.countDocuments(),
        recentLocations: await UserLocation.countDocuments({
          locatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      }
    };

    // Get recent locations for debugging
    const recentLocations = await UserLocation.find()
      .sort({ locatedAt: -1 })
      .limit(10);

    const locationDetails = recentLocations.map(loc => {
      try {
        return {
          id: loc._id,
          userId: loc.userId,
          latitude: decrypt(loc.encryptedLat),
          longitude: decrypt(loc.encryptedLng),
          timestamp: loc.locatedAt
        };
      } catch (error) {
        return {
          id: loc._id,
          userId: loc.userId,
          error: 'Decryption failed',
          timestamp: loc.locatedAt
        };
      }
    });

    stats.recentLocationDetails = locationDetails;

    res.json(stats);

  } catch (error) {
    console.error('Debug stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

// HEALTH CHECK
app.get('/api/health', async (req, res) => {
  try {
    // Test DB connection
    await mongoose.connection.db.admin().ping();

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'Connected',
      version: '2.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

export default app;
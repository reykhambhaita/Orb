import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken'; // Make sure you have this import
import mongoose from 'mongoose';
import { Landmark, Mechanic, User, UserLocation } from './models.js';


const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'bc69d12cea91ad4da39bda024903751e', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};


const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/roadmechanic')
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

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

// Haversine formula (updated to return meters)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters (changed from km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate average rating
function calculateAverageRating(ratings) {
  if (!ratings || ratings.length === 0) return 0;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

// Determine region based on coordinates (simple implementation)
function determineRegion(lat, lng) {
  // You can implement more sophisticated region detection here
  const latZone = Math.floor(lat / 5) * 5; // Group by 5-degree zones
  const lngZone = Math.floor(lng / 5) * 5;
  return `region_${latZone}_${lngZone}`;
}



// Save user location & return nearby mechanics
app.post('/api/location', async (req, res) => {
  try {
    const { latitude, longitude, userId } = req.body;
    if (!latitude || !longitude || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Encrypt coordinates
    const encryptedLat = encrypt(latitude);
    const encryptedLng = encrypt(longitude);

    // Save user location
    const userLocation = new UserLocation({
      userId,
      encryptedLat,
      encryptedLng,
      locatedAt: new Date()
    });
    await userLocation.save();

    // Update user's lastLocation reference and sync preferences
    const region = determineRegion(latitude, longitude);
    await User.findByIdAndUpdate(userId, {
      lastLocation: userLocation._id,
      lastOfflineSync: new Date(),
      $addToSet: { preferredRegions: region }
    });

    // Find nearby mechanics (within 10km)
    const mechanics = await Mechanic.find({ isActive: true });
    const nearbyMechanics = mechanics
      .map(m => {
        const mechLat = decrypt(m.location.lat);
        const mechLng = decrypt(m.location.lng);
        const distance = calculateDistance(latitude, longitude, mechLat, mechLng);
        return { ...m.toObject(), distance };
      })
      .filter(m => m.distance <= 10000) // 10km in meters
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    res.json({
      success: true,
      message: 'Location saved successfully',
      region: region,
      nearbyMechanics: nearbyMechanics.map(m => ({
        id: m._id,
        username: m.username,
        address: m.address,
        organisation: m.organisation,
        avgRating: calculateAverageRating(m.ratings),
        ratingCount: m.ratings.length,
        services: m.services,
        phone: m.phone,
        distance: Math.round(m.distance)
      }))
    });

  } catch (error) {
    console.error('❌ Error saving location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get nearby mechanics for a user
app.get('/api/mechanics/nearby/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { radius = 30000, services } = req.query; // Default 30km radius

    const userLocation = await UserLocation.findOne({ userId }).sort({ locatedAt: -1 });
    if (!userLocation) return res.status(404).json({ error: 'User location not found' });

    const latitude = decrypt(userLocation.encryptedLat);
    const longitude = decrypt(userLocation.encryptedLng);

    let query = { isActive: true };
    if (services) {
      const serviceArray = services.split(',');
      query.services = { $in: serviceArray };
    }

    const mechanics = await Mechanic.find(query);
    const nearbyMechanics = mechanics
      .map(m => {
        const mechLat = decrypt(m.location.lat);
        const mechLng = decrypt(m.location.lng);
        const distance = calculateDistance(latitude, longitude, mechLat, mechLng);
        return { ...m.toObject(), distance };
      })
      .filter(m => m.distance <= parseInt(radius))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    res.json({
      nearbyMechanics: nearbyMechanics.map(m => ({
        id: m._id,
        username: m.username,
        address: m.address,
        organisation: m.organisation,
        avgRating: calculateAverageRating(m.ratings),
        ratingCount: m.ratings.length,
        services: m.services,
        phone: m.phone,
        distance: Math.round(m.distance)
      }))
    });

  } catch (error) {
    console.error('❌ Error fetching nearby mechanics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/location/enhanced', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, includeNearby = true, radius = 10000 } = req.body;
    const userId = req.user.uid; // Get from authenticated user

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Missing coordinates' });
    }

    // Encrypt coordinates
    const encryptedLat = encrypt(latitude);
    const encryptedLng = encrypt(longitude);

    // Save user location using Firebase UID
    const userLocation = new UserLocation({
      userId,
      encryptedLat,
      encryptedLng,
      locatedAt: new Date()
    });
    await userLocation.save();

    // Rest of your existing location logic...
    const region = determineRegion(latitude, longitude);

    let response = {
      success: true,
      message: 'Location saved successfully',
      region: region,
      locationId: userLocation._id,
      userType: req.user.userType // Include user type in response
    };

    // ... rest of your existing nearby logic

    res.json(response);
  } catch (error) {
    console.error('Error saving enhanced location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protect other routes - example updates:

// Mechanics routes - only mechanics and admins can access
app.get('/api/mechanics/nearby/:userId', authenticateToken, async (req, res) => {
  // Your existing logic, but use req.user.uid instead of params
  const userId = req.user.uid;
  // ... rest of existing code
});

// Admin only routes

// Mechanic registration/update route

// Get current user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get additional data based on user type
    let additionalData = {};

    if (req.user.userType === 'mechanic') {
      const mechanicData = await Mechanic.findOne({ userId });
      if (mechanicData) {
        additionalData.mechanicProfile = {
          address: mechanicData.address,
          services: mechanicData.services,
          organisation: mechanicData.organisation,
          ratings: mechanicData.ratings,
          avgRating: calculateAverageRating(mechanicData.ratings)
        };
      }
    }

    res.json({
      user: req.user,
      ...additionalData
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Sync user data between Firebase and MongoDB
app.post('/api/sync/user-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Update MongoDB User collection with Firebase data
    await User.findOneAndUpdate(
      { firebaseUid: userId },
      {
        firebaseUid: userId,
        username: req.user.username,
        phone: req.user.phone,
        email: req.user.email,
        userType: req.user.userType,
        isActive: req.user.isActive,
        lastSyncAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'User data synchronized' });
  } catch (error) {
    console.error('Error syncing user data:', error);
    res.status(500).json({ error: 'Failed to sync user data' });
  }
});

// Public endpoint for testing (no auth required)
app.get('/api/public/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Public endpoint working'
  });
});
// OFFLINE SYNC ENDPOINTS

// Download mechanics for offline use
app.post('/api/mechanics/offline-sync', async (req, res) => {
  try {
    const { location, radius = 50000, includeInactive = false, decryptCoordinates = true } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }

    const { lat, lng } = location;
    const region = determineRegion(lat, lng);

    // Build query
    let query = {};
    if (!includeInactive) {
      query.isActive = true;
    }

    // Get all mechanics and filter by distance
    const mechanics = await Mechanic.find(query).sort({ priority: -1, updatedAt: -1 });

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
            lastSyncVersion: m.lastSyncVersion || 1,
            distance: distance
          };

          // Include decrypted coordinates if requested
          if (decryptCoordinates) {
            mechanicData.location = {
              lat: mechLat,
              lng: mechLng,
              locatedAt: m.location.locatedAt
            };
          } else {
            mechanicData.location = m.location;
          }

          return mechanicData;
        } catch (error) {
          console.error('Error processing mechanic:', m._id, error);
          return null;
        }
      })
      .filter(m => m !== null && m.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    const currentSyncVersion = Math.floor(Date.now() / 1000); // Unix timestamp

    res.json({
      success: true,
      mechanics: nearbyMechanics,
      syncVersion: currentSyncVersion,
      region: region,
      downloadedAt: new Date().toISOString(),
      totalCount: nearbyMechanics.length
    });

  } catch (error) {
    console.error('❌ Error in offline mechanic sync:', error);
    res.status(500).json({ error: 'Failed to sync mechanics for offline use' });
  }
});

// Download landmarks for offline use
app.post('/api/landmarks/offline-sync', async (req, res) => {
  try {
    const { location, radius = 50000, categories } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ error: 'Location coordinates required' });
    }

    const { lat, lng } = location;
    const region = determineRegion(lat, lng);

    // Build query
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
          lastSyncVersion: l.lastSyncVersion || 1,
          distance: distance
        };
      })
      .filter(l => l.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    const currentSyncVersion = Math.floor(Date.now() / 1000);

    res.json({
      success: true,
      landmarks: nearbyLandmarks,
      syncVersion: currentSyncVersion,
      region: region,
      downloadedAt: new Date().toISOString(),
      totalCount: nearbyLandmarks.length
    });

  } catch (error) {
    console.error('❌ Error in offline landmark sync:', error);
    res.status(500).json({ error: 'Failed to sync landmarks for offline use' });
  }
});

// Get sync status for a user
app.get('/api/sync/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const lastLocation = await UserLocation.findById(user.lastLocation);

    res.json({
      lastOfflineSync: user.lastOfflineSync,
      preferredRegions: user.preferredRegions || [],
      offlineRadius: user.offlineRadius || 50000,
      lastLocation: lastLocation ? {
        lat: decrypt(lastLocation.encryptedLat),
        lng: decrypt(lastLocation.encryptedLng),
        timestamp: lastLocation.locatedAt
      } : null
    });

  } catch (error) {
    console.error('❌ Error fetching sync status:', error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});


// Get all mechanics
app.get('/api/mechanics/all', async (req, res) => {
  try {
    const { includeInactive = false, region, limit = 1000 } = req.query;

    let query = {};
    if (!includeInactive) {
      query.isActive = true;
    }
    if (region) {
      query.region = region;
    }

    const mechanics = await Mechanic.find(query)
      .limit(parseInt(limit))
      .sort({ priority: -1, updatedAt: -1 });

    res.json({
      mechanics: mechanics.map(m => ({
        ...m.toObject(),
        avgRating: calculateAverageRating(m.ratings),
        ratingCount: m.ratings.length
      })),
      totalCount: mechanics.length
    });
  } catch (error) {
    console.error('❌ Error fetching all mechanics:', error);
    res.status(500).json({ error: 'Failed to fetch mechanics' });
  }
});

// Get all landmarks
app.get('/api/landmarks/all', async (req, res) => {
  try {
    const { category, region, limit = 1000 } = req.query;

    let query = {};
    if (category) {
      query.category = category;
    }
    if (region) {
      query.region = region;
    }

    const landmarks = await Landmark.find(query)
      .limit(parseInt(limit))
      .sort({ priority: -1, updatedAt: -1 });

    res.json({
      landmarks: landmarks,
      totalCount: landmarks.length
    });
  } catch (error) {
    console.error('❌ Error fetching landmarks:', error);
    res.status(500).json({ error: 'Failed to fetch landmarks' });
  }
});

// ADMIN ENDPOINTS


// Bulk update mechanic regions (for initial setup)
app.post('/api/admin/mechanics/update-regions', async (req, res) => {
  try {
    const mechanics = await Mechanic.find({});
    let updated = 0;

    for (const mechanic of mechanics) {
      try {
        const lat = decrypt(mechanic.location.lat);
        const lng = decrypt(mechanic.location.lng);
        const region = determineRegion(lat, lng);

        await Mechanic.findByIdAndUpdate(mechanic._id, {
          region: region,
          lastSyncVersion: 1
        });
        updated++;
      } catch (error) {
        console.error(`Failed to update mechanic ${mechanic._id}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Updated regions for ${updated} mechanics`
    });
  } catch (error) {
    console.error('❌ Error updating mechanic regions:', error);
    res.status(500).json({ error: 'Failed to update mechanic regions' });
  }
});

// Bulk update landmark regions
app.post('/api/admin/landmarks/update-regions', async (req, res) => {
  try {
    const landmarks = await Landmark.find({});
    let updated = 0;

    for (const landmark of landmarks) {
      const region = determineRegion(landmark.location.lat, landmark.location.lng);

      await Landmark.findByIdAndUpdate(landmark._id, {
        region: region,
        lastSyncVersion: 1
      });
      updated++;
    }

    res.json({
      success: true,
      message: `Updated regions for ${updated} landmarks`
    });
  } catch (error) {
    console.error('❌ Error updating landmark regions:', error);
    res.status(500).json({ error: 'Failed to update landmark regions' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});


// Add these new endpoints to your existing index.js

// Enhanced location endpoint with nearby data response
app.post('/api/location/enhanced', async (req, res) => {
  try {
    const { latitude, longitude, userId, includeNearby = true, radius = 10000 } = req.body;
    if (!latitude || !longitude || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Encrypt coordinates
    const encryptedLat = encrypt(latitude);
    const encryptedLng = encrypt(longitude);

    // Save user location
    const userLocation = new UserLocation({
      userId,
      encryptedLat,
      encryptedLng,
      locatedAt: new Date()
    });
    await userLocation.save();

    // Update user's lastLocation reference and sync preferences
    const region = determineRegion(latitude, longitude);
    await User.findByIdAndUpdate(userId, {
      lastLocation: userLocation._id,
      lastOfflineSync: new Date(),
      $addToSet: { preferredRegions: region }
    });

    let response = {
      success: true,
      message: 'Location saved successfully',
      region: region,
      locationId: userLocation._id
    };

    if (includeNearby) {
      // Find nearby mechanics
      const mechanics = await Mechanic.find({ isActive: true });
      const nearbyMechanics = mechanics
        .map(m => {
          const mechLat = decrypt(m.location.lat);
          const mechLng = decrypt(m.location.lng);
          const distance = calculateDistance(latitude, longitude, mechLat, mechLng);
          return {
            ...m.toObject(),
            latitude: mechLat,
            longitude: mechLng,
            distance
          };
        })
        .filter(m => m.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

      // Find nearby landmarks
      const landmarks = await Landmark.find({});
      const nearbyLandmarks = landmarks
        .map(l => {
          const distance = calculateDistance(latitude, longitude, l.location.lat, l.location.lng);
          return { ...l.toObject(), distance };
        })
        .filter(l => l.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

      response.nearbyMechanics = nearbyMechanics.map(m => ({
        id: m._id,
        username: m.username,
        address: m.address,
        latitude: m.latitude,
        longitude: m.longitude,
        organisation: m.organisation,
        avgRating: calculateAverageRating(m.ratings),
        ratingCount: m.ratings.length,
        services: m.services,
        phone: m.phone,
        distance: Math.round(m.distance)
      }));

      response.nearbyLandmarks = nearbyLandmarks.map(l => ({
        id: l._id,
        name: l.name,
        category: l.category,
        location: l.location,
        distance: Math.round(l.distance)
      }));
    }

    res.json(response);

  } catch (error) {
    console.error('Error saving enhanced location:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk location history for analysis
app.get('/api/location/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const locations = await UserLocation.find({
      userId,
      locatedAt: { $gte: startDate }
    })
    .sort({ locatedAt: -1 })
    .limit(parseInt(limit));

    const decryptedLocations = locations.map(loc => ({
      id: loc._id,
      latitude: decrypt(loc.encryptedLat),
      longitude: decrypt(loc.encryptedLng),
      timestamp: loc.locatedAt,
      region: determineRegion(decrypt(loc.encryptedLat), decrypt(loc.encryptedLng))
    }));

    res.json({
      locations: decryptedLocations,
      totalCount: decryptedLocations.length
    });

  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({ error: 'Failed to fetch location history' });
  }
});

// Enhanced offline sync with user preferences
app.post('/api/sync/user-preferences', async (req, res) => {
  try {
    const { userId, location, preferences = {} } = req.body;

    if (!userId || !location) {
      return res.status(400).json({ error: 'UserId and location required' });
    }

    const {
      mechanicRadius = 50000,
      landmarkRadius = 30000,
      maxMechanics = 100,
      maxLandmarks = 50,
      serviceFilter = [],
      categoryFilter = []
    } = preferences;

    // Update user preferences
    await User.findByIdAndUpdate(userId, {
      offlineRadius: Math.max(mechanicRadius, landmarkRadius),
      lastOfflineSync: new Date(),
      $addToSet: { preferredRegions: determineRegion(location.lat, location.lng) }
    });

    // Get mechanics with preferences
    let mechanicQuery = { isActive: true };
    if (serviceFilter.length > 0) {
      mechanicQuery.services = { $in: serviceFilter };
    }

    const mechanics = await Mechanic.find(mechanicQuery);
    const nearbyMechanics = mechanics
      .map(m => {
        try {
          const mechLat = decrypt(m.location.lat);
          const mechLng = decrypt(m.location.lng);
          const distance = calculateDistance(location.lat, location.lng, mechLat, mechLng);

          return {
            _id: m._id,
            username: m.username,
            phone: m.phone,
            address: m.address,
            latitude: mechLat,
            longitude: mechLng,
            services: m.services,
            ratings: m.ratings,
            organisation: m.organisation,
            isActive: m.isActive,
            region: m.region || determineRegion(mechLat, mechLng),
            priority: m.priority || 0,
            distance: distance
          };
        } catch (error) {
          console.error('Error processing mechanic:', m._id);
          return null;
        }
      })
      .filter(m => m !== null && m.distance <= mechanicRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxMechanics);

    // Get landmarks with preferences
    let landmarkQuery = {};
    if (categoryFilter.length > 0) {
      landmarkQuery.category = { $in: categoryFilter };
    }

    const landmarks = await Landmark.find(landmarkQuery);
    const nearbyLandmarks = landmarks
      .map(l => {
        const distance = calculateDistance(location.lat, location.lng, l.location.lat, l.location.lng);
        return { ...l.toObject(), distance };
      })
      .filter(l => l.distance <= landmarkRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxLandmarks);

    const currentSyncVersion = Math.floor(Date.now() / 1000);

    res.json({
      success: true,
      mechanics: nearbyMechanics,
      landmarks: nearbyLandmarks,
      syncVersion: currentSyncVersion,
      region: determineRegion(location.lat, location.lng),
      downloadedAt: new Date().toISOString(),
      preferences: preferences
    });

  } catch (error) {
    console.error('Error in user preference sync:', error);
    res.status(500).json({ error: 'Failed to sync with user preferences' });
  }
});

// Get optimal location for user (compare multiple recent locations)
app.get('/api/location/optimal/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeWindow = 30 } = req.query; // minutes

    const startTime = new Date();
    startTime.setMinutes(startTime.getMinutes() - parseInt(timeWindow));

    const recentLocations = await UserLocation.find({
      userId,
      locatedAt: { $gte: startTime }
    }).sort({ locatedAt: -1 }).limit(10);

    if (recentLocations.length === 0) {
      return res.status(404).json({ error: 'No recent locations found' });
    }

    // Decrypt and analyze locations
    const decryptedLocations = recentLocations.map(loc => ({
      id: loc._id,
      latitude: decrypt(loc.encryptedLat),
      longitude: decrypt(loc.encryptedLng),
      timestamp: loc.locatedAt
    }));

    // Find the most accurate/central location
    let optimalLocation;
    if (decryptedLocations.length === 1) {
      optimalLocation = decryptedLocations[0];
    } else {
      // Calculate centroid and find closest actual location
      const avgLat = decryptedLocations.reduce((sum, loc) => sum + loc.latitude, 0) / decryptedLocations.length;
      const avgLng = decryptedLocations.reduce((sum, loc) => sum + loc.longitude, 0) / decryptedLocations.length;

      optimalLocation = decryptedLocations.reduce((closest, loc) => {
        const distFromCenter = calculateDistance(avgLat, avgLng, loc.latitude, loc.longitude);
        const closestDistFromCenter = calculateDistance(avgLat, avgLng, closest.latitude, closest.longitude);
        return distFromCenter < closestDistFromCenter ? loc : closest;
      });
    }

    res.json({
      optimalLocation,
      totalLocations: decryptedLocations.length,
      timeWindow: timeWindow,
      region: determineRegion(optimalLocation.latitude, optimalLocation.longitude)
    });

  } catch (error) {
    console.error('Error finding optimal location:', error);
    res.status(500).json({ error: 'Failed to find optimal location' });
  }
});

// Cleanup old location data (run periodically)
app.post('/api/admin/cleanup-locations', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await UserLocation.deleteMany({
      locatedAt: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      cutoffDate: cutoffDate.toISOString()
    });

  } catch (error) {
    console.error('Error cleaning up locations:', error);
    res.status(500).json({ error: 'Failed to cleanup old locations' });
  }
});

// Health check with database stats
app.get('/api/health/detailed', async (req, res) => {
  try {
    const stats = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        mechanics: await Mechanic.countDocuments(),
        activeMechanics: await Mechanic.countDocuments({ isActive: true }),
        landmarks: await Landmark.countDocuments(),
        users: await User.countDocuments(),
        recentLocations: await UserLocation.countDocuments({
          locatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // last 24 hours
        })
      }
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Batch update locations (for bulk operations)
app.post('/api/location/batch', async (req, res) => {
  try {
    const { locations } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({ error: 'Locations array required' });
    }

    const results = [];
    for (const locationData of locations) {
      const { userId, latitude, longitude, timestamp } = locationData;

      if (userId && latitude && longitude) {
        const encryptedLat = encrypt(latitude);
        const encryptedLng = encrypt(longitude);

        const userLocation = new UserLocation({
          userId,
          encryptedLat,
          encryptedLng,
          locatedAt: timestamp ? new Date(timestamp) : new Date()
        });

        await userLocation.save();
        results.push({
          success: true,
          locationId: userLocation._id,
          userId
        });
      } else {
        results.push({
          success: false,
          error: 'Missing required fields',
          locationData
        });
      }
    }

    res.json({
      success: true,
      results,
      processed: results.length,
      successful: results.filter(r => r.success).length
    });

  } catch (error) {
    console.error('Error in batch location save:', error);
    res.status(500).json({ error: 'Batch operation failed' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Offline sync endpoints available`);
  console.log(`🔒 Encryption enabled for coordinates`);
});




export default app;
// backend/index.js - FIXED VERSION
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import {
  checkDatabaseHealth,
  ensureUserExists,
  getLandmarksNearLocation,
  getNearbyMechanics,
  updateUserLocation
} from './db.js';

dotenv.config();

const app = express();

// CORS configuration
app.use(cors({
  origin: '*', // For development; restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// === ROUTES ===

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'ORMS Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      userInit: '/api/user/init (POST, protected)',
      location: '/api/user/location (POST, protected)',
      mechanics: '/api/mechanics/nearby (GET, protected)',
      landmarks: '/api/landmarks (GET, protected)'
    }
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      environment: {
        nodeVersion: process.version,
        platform: process.platform
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// User initialization endpoint
app.post('/api/user/init', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'No userId in authentication token'
      });
    }

    console.log('📝 Initializing user:', userId);

    // Create user in MongoDB if doesn't exist
    const user = await ensureUserExists(userId);

    res.json({
      success: true,
      message: 'User initialized successfully',
      data: {
        userId: user.userId,
        createdAt: user.createdAt,
        lastUpdated: user.lastUpdated,
        hasLocation: !!user.encryptedLocation
      }
    });
  } catch (error) {
    console.error('❌ User init error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update user location
app.post('/api/user/location', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { location, landmarks } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'No userId in authentication token'
      });
    }

    if (!location?.latitude || !location?.longitude) {
      return res.status(400).json({
        success: false,
        error: 'Missing required location data (latitude, longitude)'
      });
    }

    // Validate location data
    if (
      typeof location.latitude !== 'number' ||
      typeof location.longitude !== 'number' ||
      isNaN(location.latitude) ||
      isNaN(location.longitude)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid location coordinates'
      });
    }

    // Validate ranges
    if (
      location.latitude < -90 || location.latitude > 90 ||
      location.longitude < -180 || location.longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        error: 'Coordinates out of valid range'
      });
    }

    console.log('📍 Updating location for user:', userId, {
      lat: location.latitude.toFixed(6),
      lng: location.longitude.toFixed(6),
      accuracy: location.accuracy
    });

    const result = await updateUserLocation(userId, location, landmarks || []);

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        userId: result.userId,
        lastUpdated: result.lastUpdated,
        landmarkCount: result.landmarks?.length || 0
      }
    });
  } catch (error) {
    console.error('❌ Location update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get nearby mechanics
app.get('/api/mechanics/nearby', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: lat, lng'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = radius ? parseInt(radius) : 5000;

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates'
      });
    }

    console.log('🔍 Searching mechanics near:', latitude, longitude, 'radius:', searchRadius);

    const mechanics = await getNearbyMechanics(latitude, longitude, searchRadius);

    res.json({
      success: true,
      data: mechanics,
      count: mechanics.length,
      query: { lat: latitude, lng: longitude, radius: searchRadius }
    });
  } catch (error) {
    console.error('❌ Nearby mechanics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get nearby landmarks
app.get('/api/landmarks', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: lat, lng'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = radius ? parseInt(radius) : 1000;

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates'
      });
    }

    console.log('🏛️ Searching landmarks near:', latitude, longitude, 'radius:', searchRadius);

    const landmarks = await getLandmarksNearLocation(latitude, longitude, searchRadius);

    res.json({
      success: true,
      data: landmarks,
      count: landmarks.length,
      query: { lat: latitude, lng: longitude, radius: searchRadius }
    });
  } catch (error) {
    console.error('❌ Landmarks error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// === SERVER ===
const PORT = process.env.PORT || 3000;

// Start server only if this file is run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  app.listen(PORT, () => {
    console.log('🚀 Server starting...');
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   MongoDB URI configured: ${!!process.env.MONGODB_URI}`);
    console.log(`   Encryption key configured: ${!!process.env.ENCRYPTION_KEY}`);
    console.log(`   Clerk configured: ${!!process.env.CLERK_SECRET_KEY}`);
    console.log('✅ Server ready at http://localhost:' + PORT);
  });
}

export default app;
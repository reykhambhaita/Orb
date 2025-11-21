// backend/index.js

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { getCurrentUser, login, signup } from './auth.js';
import { authenticateToken, optionalAuth, requireMechanic } from './authMiddleware.js';
import {
  createLandmarkHandler,
  deleteLandmarkHandler,
  getNearbyLandmarksHandler
} from './controllers/landmarkController.js';
import {
  createMechanicProfileHandler,
  getMechanicProfileHandler,
  getNearbyMechanicsHandler,
  updateMechanicAvailabilityHandler,
  updateMechanicLocationHandler
} from './controllers/mechanicController.js';
import {
  connectDB,
  getLandmarksNearLocation,
  getUserLocationHistory,
  updateUserLocation
} from './db.js';

dotenv.config();

const app = express();

// IMPORTANT: Enable trust proxy BEFORE rate limiters
// This is required when running behind a proxy (AWS Lambda, nginx, etc.)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Rate limiters configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Database connection middleware
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    next();
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Database connection failed'
    });
  }
});

// === PUBLIC ROUTES ===

app.get('/', (req, res) => {
  res.json({
    message: 'ORMS Backend API',
    version: '2.0',
    endpoints: {
      auth: '/api/auth/*',
      landmarks: '/api/landmarks/*',
      mechanics: '/api/mechanics/*',
      user: '/api/user/*'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// === AUTH ROUTES ===

app.post('/api/auth/signup', authLimiter, signup);
app.post('/api/auth/login', authLimiter, login);
app.get('/api/auth/me', authenticateToken, getCurrentUser);

// === USER LOCATION ROUTES (Protected) ===

app.post('/api/user/location', authenticateToken, async (req, res) => {
  try {
    const { location, landmarks } = req.body;

    if (!location?.latitude || !location?.longitude) {
      return res.status(400).json({ error: 'Missing required location fields' });
    }

    const result = await updateUserLocation(req.userId, location, landmarks);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/location-history', authenticateToken, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const history = await getUserLocationHistory(req.userId, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// === LANDMARK ROUTES ===

app.get('/api/landmarks/nearby', optionalAuth, getNearbyLandmarksHandler);

// Create a new landmark (authenticated users)
app.post('/api/landmarks', authenticateToken, createLandmarkHandler);

// Delete a landmark (authenticated, creator only)
app.delete('/api/landmarks/:id', authenticateToken, deleteLandmarkHandler);

// Get landmarks near location (legacy endpoint)
app.get('/api/landmarks', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng' });
    }

    const landmarks = await getLandmarksNearLocation(
      parseFloat(lat),
      parseFloat(lng),
      radius ? parseInt(radius) : 1000
    );
    res.json({ success: true, data: landmarks });
  } catch (error) {
    console.error('Get landmarks error:', error);
    res.status(500).json({ error: error.message });
  }
});

// === MECHANIC ROUTES ===

app.post(
  '/api/mechanics/profile',
  authenticateToken,
  requireMechanic,
  createMechanicProfileHandler
);

app.get(
  '/api/mechanics/profile',
  authenticateToken,
  requireMechanic,
  getMechanicProfileHandler
);

app.patch(
  '/api/mechanics/location',
  authenticateToken,
  requireMechanic,
  updateMechanicLocationHandler
);

app.patch(
  '/api/mechanics/availability',
  authenticateToken,
  requireMechanic,
  updateMechanicAvailabilityHandler
);

app.get('/api/mechanics/nearby', optionalAuth, getNearbyMechanicsHandler);

// === ERROR HANDLING ===

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// === SERVER STARTUP ===
const PORT = process.env.PORT || 3000;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log('✅ MongoDB connected');
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    })
    .catch((error) => {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      console.error('Server cannot start without database connection');
      process.exit(1);
    });
}

export default app;
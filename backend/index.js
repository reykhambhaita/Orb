// backend/index.js

import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import {
  forgotPassword,
  getCurrentUser,
  login,
  resendOTP,
  resetPassword,
  signup,
  updateProfile,
  uploadAvatar,
  verifyForgotPasswordOTP,
  verifyOTP
} from './auth.js';
import { authenticateToken, optionalAuth, requireMechanic } from './authMiddleware.js';
import {
  createLandmarkHandler,
  deleteLandmarkHandler,
  getNearbyLandmarksHandler,
  syncOpenStreetMapHandler
} from './controllers/landmarkController.js';
import {
  createMechanicProfileHandler,
  getMechanicProfileHandler,
  getNearbyMechanicsHandler,
  updateMechanicAvailabilityHandler,
  updateMechanicLocationHandler,
  updateMechanicUPIHandler
} from './controllers/mechanicController.js';
import {
  capturePayPalPaymentHandler,
  createPayPalOrderHandler,
  createUPIPaymentHandler,
  createUPIPaymentOrderHandler,
  expireOldPaymentsHandler,
  getPaymentHistoryHandler,
  getPaymentStatusHandler,
  manualVerifyPaymentHandler,
  verifyUPIPaymentHandler
} from './controllers/paymentController.js';
import {
  createReviewHandler,
  getMechanicReviewsHandler,
  getMyReviewsHandler
} from './controllers/reviewController.js';
import {
  CallLog,
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
  max: 500, // Increased from 100 to 500 for frequent location syncs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Increased from 5 to 10
  message: { error: 'Too many authentication attempts, please try again later.' },
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
    message: 'Orb Backend API',
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
app.post('/api/auth/verify-otp', authLimiter, verifyOTP);
app.post('/api/auth/resend-otp', authLimiter, resendOTP);
app.post('/api/auth/forgot-password', authLimiter, forgotPassword);
app.post('/api/auth/verify-forgot-password-otp', authLimiter, verifyForgotPasswordOTP);
app.post('/api/auth/reset-password', authLimiter, resetPassword);
app.get('/api/auth/me', authenticateToken, getCurrentUser);

// === USER LOCATION ROUTES (Protected) ===

app.post('/api/user/location', authenticateToken, async (req, res) => {
  try {
    const { location, landmarks, address, sources } = req.body;

    if (!location?.latitude || !location?.longitude) {
      return res.status(400).json({ error: 'Missing required location fields' });
    }

    // Validate coordinates
    if (
      location.latitude < -90 ||
      location.latitude > 90 ||
      location.longitude < -180 ||
      location.longitude > 180
    ) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Enhanced location object with metadata
    const enhancedLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy || null,
      address: address || null,
      sources: sources || [], // Track which sources contributed (gps, wifi, etc)
      timestamp: new Date(),
    };

    const result = await updateUserLocation(
      req.userId,
      enhancedLocation,
      landmarks || []
    );

    res.json({
      success: true,
      data: {
        id: result._id,
        timestamp: result.timestamp,
      }
    });
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
app.patch('/api/auth/update-profile', authenticateToken, updateProfile);
app.patch('/api/auth/upload-avatar', authenticateToken, uploadAvatar);
// === LANDMARK ROUTES ===

app.get('/api/landmarks/nearby', optionalAuth, getNearbyLandmarksHandler);

// Create a new landmark (authenticated users)
app.post('/api/landmarks', authenticateToken, createLandmarkHandler);

// Sync landmarks from OpenStreetMap
app.post('/api/landmarks/sync-osm', optionalAuth, syncOpenStreetMapHandler);

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

app.patch(
  '/api/mechanics/upi',
  authenticateToken,
  requireMechanic,
  updateMechanicUPIHandler
);

app.get('/api/mechanics/nearby', optionalAuth, getNearbyMechanicsHandler);



// === REVIEW ROUTES ===
app.post('/api/reviews', authenticateToken, createReviewHandler);
app.get('/api/reviews/mechanic/:mechanicId', getMechanicReviewsHandler);
app.get('/api/reviews/my-reviews', authenticateToken, getMyReviewsHandler);

// === PAYMENT ROUTES ===
app.post('/api/payments/create-order', authenticateToken, createPayPalOrderHandler);
app.post('/api/payments/capture', authenticateToken, capturePayPalPaymentHandler);
app.post('/api/payments/create-upi-payment', authenticateToken, createUPIPaymentHandler);
app.post('/api/payments/verify-upi-payment', authenticateToken, verifyUPIPaymentHandler);
app.get('/api/payments/history', authenticateToken, getPaymentHistoryHandler);

// UPI Deep Link Routes (New Expo-compatible approach)
app.post('/api/payments/upi/create-order', authenticateToken, createUPIPaymentOrderHandler);
app.get('/api/payments/upi/status/:transactionId', authenticateToken, getPaymentStatusHandler);
app.post('/api/payments/upi/manual-verify', authenticateToken, manualVerifyPaymentHandler);
app.post('/api/payments/upi/expire-old', authenticateToken, expireOldPaymentsHandler);

/**
 * Server-side reverse geocoding endpoint using Geoapify
 */
app.post('/api/location/reverse-geocode', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Missing coordinates',
        message: 'Both latitude and longitude are required'
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: 'Invalid coordinates',
        message: 'Coordinates out of valid range'
      });
    }

    // Call OpenStreetMap (Nominatim) Reverse Geocoding API
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse`,
      {
        params: {
          lat: latitude,
          lon: longitude,
          format: 'jsonv2',
        },
        headers: {
          'User-Agent': 'Orb-App/1.0'
        },
        timeout: 10000,
      }
    );

    if (response.data) {
      const result = response.data;
      const address = result.display_name;

      res.json({
        success: true,
        data: {
          address,
          components: {
            streetNumber: result.address?.house_number || '',
            route: result.address?.road || '',
            city: result.address?.city || result.address?.town || result.address?.village || '',
            state: result.address?.state || '',
            country: result.address?.country || '',
            postalCode: result.address?.postcode || '',
          },
          placeId: result.place_id,
          source: 'osm',
        },
      });
      return;
    }

    res.status(404).json({
      error: 'Address not found',
      message: 'No address found for these coordinates'
    });
  } catch (error) {
    console.error('Reverse geocoding error:', error.message);
    res.status(500).json({
      error: 'Geocoding failed',
      message: error.message,
    });
  }
});


/**
 * Reverse geocoding proxy endpoint using Geoapify
 */
app.post('/api/geocode/reverse', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    // Use Nominatim for reverse geocoding
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`;

    try {
      const osmResponse = await axios.get(osmUrl, {
        headers: {
          'User-Agent': 'Orb-App/1.0'
        },
        timeout: 10000
      });

      if (osmResponse.status === 200 && osmResponse.data) {
        const result = osmResponse.data;
        return res.json({
          success: true,
          data: {
            address: result.display_name,
            components: {
              streetNumber: result.address?.house_number || '',
              route: result.address?.road || '',
              city: result.address?.city || result.address?.town || result.address?.village || '',
              state: result.address?.state || '',
              country: result.address?.country || '',
              postalCode: result.address?.postcode || '',
            },
            placeId: result.place_id,
            source: 'osm'
          }
        });
      }
    } catch (osmError) {
      console.error('OSM geocoding failed:', osmError.message);
    }

    res.status(404).json({
      success: false,
      error: 'No address found for these coordinates'
    });

  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reverse geocode'
    });
  }
});


/**
 * Batch reverse geocoding endpoint using Geoapify
 * Process multiple coordinates in one request (max 10)
 */
app.post('/api/location/batch-reverse-geocode', authenticateToken, async (req, res) => {
  try {
    const { locations } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'locations must be a non-empty array'
      });
    }

    if (locations.length > 10) {
      return res.status(400).json({
        error: 'Too many locations',
        message: 'Maximum 10 locations per batch request'
      });
    }

    const results = [];

    // Process each location using Nominatim
    for (const loc of locations) {
      const { latitude, longitude, id } = loc;

      if (!latitude || !longitude) {
        results.push({
          id: id || null,
          success: false,
          error: 'Missing coordinates',
        });
        continue;
      }

      try {
        const response = await axios.get(
          `https://nominatim.openstreetmap.org/reverse`,
          {
            params: {
              lat: latitude,
              lon: longitude,
              format: 'jsonv2',
            },
            headers: {
              'User-Agent': 'Orb-App/1.0'
            },
            timeout: 10000,
          }
        );

        if (response.data) {
          const result = response.data;
          results.push({
            id: id || null,
            success: true,
            address: result.display_name,
            placeId: result.place_id,
            source: 'osm',
          });
        } else {
          results.push({
            id: id || null,
            success: false,
            error: 'Address not found',
          });
        }

        // Nominatim rate limiting: max 1 request/second
        // Wait 1000ms between requests to be safe
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({
          id: id || null,
          success: false,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Batch geocoding error:', error);
    res.status(500).json({
      error: 'Batch geocoding failed',
      message: error.message,
    });
  }
});


/**
 * Get location statistics and insights
 */
app.get('/api/user/location-stats', authenticateToken, async (req, res) => {
  try {
    const history = await getUserLocationHistory(req.userId, 1000);

    if (!history || history.length === 0) {
      return res.json({
        success: true,
        data: {
          totalLocations: 0,
          timeRange: null,
          averageAccuracy: null,
          uniqueLocations: 0,
        },
      });
    }

    // Calculate statistics
    let totalAccuracy = 0;
    let accuracyCount = 0;
    const uniqueLocations = new Set();

    history.forEach((record) => {
      if (record.location) {
        const { latitude, longitude, accuracy } = record.location;

        // Round to ~50m for unique location counting
        const locKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
        uniqueLocations.add(locKey);

        if (accuracy) {
          totalAccuracy += accuracy;
          accuracyCount++;
        }
      }
    });

    res.json({
      success: true,
      data: {
        totalLocations: history.length,
        timeRange: {
          oldest: history[history.length - 1].timestamp,
          newest: history[0].timestamp,
        },
        averageAccuracy: accuracyCount > 0
          ? Math.round(totalAccuracy / accuracyCount)
          : null,
        uniqueLocations: uniqueLocations.size,
      },
    });
  } catch (error) {
    console.error('Location stats error:', error);
    res.status(500).json({ error: error.message });
  }
});



// === CALL LOG ROUTES ===
app.post('/api/call-logs', authenticateToken, async (req, res) => {
  try {
    const { mechanicId, phoneNumber, callStartTime } = req.body;

    if (!mechanicId || !phoneNumber || !callStartTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const callLog = new CallLog({
      userId: req.userId,
      mechanicId,
      phoneNumber,
      callStartTime: new Date(callStartTime),
      createdAt: new Date()
    });

    await callLog.save();

    res.status(201).json({
      success: true,
      data: { id: callLog._id }
    });
  } catch (error) {
    console.error('Create call log error:', error);
    res.status(500).json({ error: 'Failed to create call log' });
  }
});

app.patch('/api/call-logs/:id/end', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { callEndTime } = req.body;

    const callLog = await CallLog.findById(id);
    if (!callLog) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    if (callLog.userId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    callLog.callEndTime = new Date(callEndTime);
    callLog.duration = Math.round((callLog.callEndTime - callLog.callStartTime) / 1000);
    await callLog.save();

    res.json({
      success: true,
      data: { duration: callLog.duration }
    });
  } catch (error) {
    console.error('End call log error:', error);
    res.status(500).json({ error: 'Failed to update call log' });
  }
});

app.get('/api/call-logs/pending-reviews', authenticateToken, async (req, res) => {
  try {
    const pendingCalls = await CallLog.find({
      userId: req.userId,
      reviewed: false,
      callEndTime: { $exists: true }
    })
      .populate('mechanicId', 'name phone rating')
      .sort({ createdAt: -1 })
      .limit(10);

    const transformedCalls = pendingCalls.map(call => ({
      id: call._id,
      mechanicId: call.mechanicId._id,
      mechanicName: call.mechanicId.name,
      mechanicPhone: call.mechanicId.phone,
      mechanicRating: call.mechanicId.rating,
      duration: call.duration,
      callStartTime: call.callStartTime,
      callEndTime: call.callEndTime
    }));

    res.json({
      success: true,
      data: transformedCalls
    });
  } catch (error) {
    console.error('Get pending reviews error:', error);
    res.status(500).json({ error: 'Failed to get pending reviews' });
  }
});

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
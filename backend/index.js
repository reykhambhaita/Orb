// backend/index.js
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import {
  getLandmarksNearLocation,
  getNearbyMechanics,
  updateUserLocation
} from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// === CLERK AUTHENTICATION MIDDLEWARE ===
const authenticateClerkToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    // Verify token with Clerk
    const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    
    if (!CLERK_SECRET_KEY) {
      console.error('CLERK_SECRET_KEY not set in environment');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch('https://api.clerk.com/v1/tokens/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const verification = await response.json();
    req.userId = verification.sub; // Clerk user ID
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// === ROUTES ===

app.get('/', (req, res) => {
  res.send('Welcome to the ORMS backend API');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected route - Update user location
app.post('/api/user/location', authenticateClerkToken, async (req, res) => {
  try {
    const { location, landmarks } = req.body;
    const userId = req.userId; // From auth middleware
    
    if (!location?.latitude || !location?.longitude) {
      return res.status(400).json({ error: 'Missing location data' });
    }

    const result = await updateUserLocation(userId, location, landmarks || []);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Protected route - Get nearby mechanics
app.get('/api/mechanics/nearby', authenticateClerkToken, async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng' });
    }

    const mechanics = await getNearbyMechanics(
      parseFloat(lat),
      parseFloat(lng),
      radius ? parseInt(radius) : 5000
    );
    res.json({ success: true, data: mechanics });
  } catch (error) {
    console.error('Mechanics query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Protected route - Get nearby landmarks
app.get('/api/landmarks', authenticateClerkToken, async (req, res) => {
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
    console.error('Landmarks query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// === ERROR HANDLING ===
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// === SERVER ===
const PORT = process.env.PORT || 3000;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;

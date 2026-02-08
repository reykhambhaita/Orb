// backend/controllers/mechanicController.js
import {
  createMechanicProfile,
  getNearbyMechanics,
  Mechanic,
  updateMechanicLocation,
  updateMechanicUPI
} from '../db.js';

/**
 * Create mechanic profile
 * POST /api/mechanics/profile
 * Body: { name, phone, latitude, longitude, specialties, available }
 * Note: User must have 'mechanic' role
 */
export const createMechanicProfileHandler = async (req, res) => {
  try {
    const { name, phone, latitude, longitude, specialties, available } = req.body;

    // Validation
    if (!name || !phone) {
      return res.status(400).json({
        error: 'Name and phone are required'
      });
    }

    const lat = latitude ? Number(latitude) : 0;
    const lng = longitude ? Number(longitude) : 0;

    // Validate coordinates if provided
    if ((lat !== 0 || lng !== 0) && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
      return res.status(400).json({
        error: 'Invalid coordinates'
      });
    }

    // Create mechanic profile
    const mechanic = await createMechanicProfile(req.userId, {
      name,
      phone,
      latitude: lat,
      longitude: lng,
      specialties: Array.isArray(specialties) ? specialties : [],
      available: available !== undefined ? available : true
    });

    res.status(201).json({
      success: true,
      data: {
        id: mechanic._id,
        name: mechanic.name,
        phone: mechanic.phone,
        location: {
          latitude: mechanic.location.coordinates[1],
          longitude: mechanic.location.coordinates[0]
        },
        specialties: mechanic.specialties,
        rating: mechanic.rating,
        available: mechanic.available,
        upiId: mechanic.decryptedUpiId,
        upiQrCode: mechanic.upiQrCode,
        createdAt: mechanic.createdAt
      }
    });
  } catch (error) {
    console.error('Create mechanic profile error:', error);

    if (error.message === 'Mechanic profile already exists for this user') {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to create mechanic profile' });
  }
};

/**
 * Update mechanic location
 * PATCH /api/mechanics/location
 * Body: { latitude, longitude }
 */
export const updateMechanicLocationHandler = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    // Validation
    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Latitude and longitude are required'
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: 'Invalid coordinates'
      });
    }

    const mechanic = await updateMechanicLocation(
      req.userId,
      latitude,
      longitude
    );

    if (!mechanic) {
      return res.status(404).json({
        error: 'Mechanic profile not found. Please create a profile first.'
      });
    }

    res.json({
      success: true,
      data: {
        id: mechanic._id,
        location: {
          latitude: mechanic.location.coordinates[1],
          longitude: mechanic.location.coordinates[0]
        }
      }
    });
  } catch (error) {
    console.error('Update mechanic location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

/**
 * Get mechanic's own profile
 * GET /api/mechanics/profile
 */
export const getMechanicProfileHandler = async (req, res) => {
  try {
    const mechanic = await Mechanic.findOne({ userId: req.userId })
      .populate('userId', 'username email');

    if (!mechanic) {
      return res.status(404).json({
        error: 'Mechanic profile not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: mechanic._id,
        name: mechanic.name,
        phone: mechanic.phone,
        location: {
          latitude: mechanic.location.coordinates[1],
          longitude: mechanic.location.coordinates[0]
        },
        specialties: mechanic.specialties,
        rating: mechanic.rating,
        available: mechanic.available,
        upiId: mechanic.decryptedUpiId,
        upiQrCode: mechanic.upiQrCode,
        user: {
          username: mechanic.userId.username,
          email: mechanic.userId.email
        },
        createdAt: mechanic.createdAt
      }
    });
  } catch (error) {
    console.error('Get mechanic profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

/**
 * Update mechanic availability
 * PATCH /api/mechanics/availability
 * Body: { available: true/false }
 */
export const updateMechanicAvailabilityHandler = async (req, res) => {
  try {
    const { available } = req.body;

    if (typeof available !== 'boolean') {
      return res.status(400).json({
        error: 'Available must be a boolean value'
      });
    }

    const mechanic = await Mechanic.findOneAndUpdate(
      { userId: req.userId },
      { available },
      { new: true }
    );

    if (!mechanic) {
      return res.status(404).json({
        error: 'Mechanic profile not found'
      });
    }

    res.json({
      success: true,
      data: {
        available: mechanic.available
      }
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
};

/**
 * Get nearby mechanics (public/authenticated)
 * GET /api/mechanics/nearby?lat=23.0225&lng=70.77&radius=5000
 */
export const getNearbyMechanicsHandler = async (req, res) => {
  try {
    // console.log('🔍 [getNearbyMechanicsHandler] Request received');
    // console.log('   Query params:', req.query);
    // console.log('   Headers:', {
    //   origin: req.headers.origin,
    //   'user-agent': req.headers['user-agent'],
    //   authorization: req.headers.authorization ? 'Present' : 'None'
    // });

    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      console.log('❌ [getNearbyMechanicsHandler] Missing coordinates');
      return res.status(400).json({
        error: 'Latitude and longitude are required'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      console.log('❌ [getNearbyMechanicsHandler] Invalid coordinates:', { lat, lng });
      return res.status(400).json({
        error: 'Invalid coordinates'
      });
    }

    // console.log('✅ [getNearbyMechanicsHandler] Parsed coordinates:', { latitude, longitude });

    const searchRadius = radius ? parseInt(radius) : 5000; // Default 5km (in meters)

    // console.log(`🔍 [getNearbyMechanicsHandler] Searching [${latitude}, ${longitude}] with radius ${searchRadius}m`);

    const mechanics = await getNearbyMechanics(latitude, longitude, searchRadius);

    // console.log('✅ [getNearbyMechanicsHandler] Query complete, found:', mechanics.length, 'mechanics');

    // Transform response
    const transformedMechanics = mechanics.map(mechanic => ({
      id: mechanic._id,
      name: mechanic.name,
      phone: mechanic.phone,
      location: {
        latitude: mechanic.location.coordinates[1],
        longitude: mechanic.location.coordinates[0]
      },
      specialties: mechanic.specialties,
      rating: mechanic.rating,
      available: mechanic.available,
      upiId: mechanic.decryptedUpiId,
      upiQrCode: mechanic.upiQrCode,
      username: mechanic.userId?.username || 'Unknown'
    }));

    // console.log('✅ [getNearbyMechanicsHandler] Sending response with', transformedMechanics.length, 'mechanics');

    res.json({
      success: true,
      count: transformedMechanics.length,
      data: transformedMechanics
    });
  } catch (error) {
    console.error('❌ [getNearbyMechanicsHandler] Error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      error: 'Failed to get nearby mechanics',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
/**
 * Update mechanic UPI ID
 * PATCH /api/mechanics/upi
 * Body: { upiId }
 */
export const updateMechanicUPIHandler = async (req, res) => {
  try {
    const { upiId } = req.body;

    const mechanic = await updateMechanicUPI(req.userId, upiId);

    res.json({
      success: true,
      data: {
        upiId: mechanic.decryptedUpiId,
        upiQrCode: mechanic.upiQrCode
      }
    });
  } catch (error) {
    console.error('Update UPI error:', error);
    res.status(500).json({ error: 'Failed to update UPI details' });
  }
};

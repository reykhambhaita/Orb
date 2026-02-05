// backend/controllers/landmarkController.js
// CHANGES: Removed syncOpenStreetMapHandler entirely

import { createLandmark, getNearbyLandmarks, Landmark } from '../db.js';
import { fetchOSMLandmarks } from '../utils/externalLandmarks.js';

/**
 * Create a new landmark
 */
export const createLandmarkHandler = async (req, res) => {
  try {
    const { name, description, category, latitude, longitude } = req.body;

    if (!name || !latitude || !longitude) {
      return res.status(400).json({
        error: 'Name, latitude, and longitude are required'
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: 'Invalid coordinates'
      });
    }

    const validCategories = ['restaurant', 'gas_station', 'hospital', 'parking', 'landmark', 'shop', 'other'];
    if (category && !validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    const landmark = await createLandmark(req.userId, {
      name,
      description,
      category: category || 'other',
      latitude,
      longitude
    });

    res.status(201).json({
      success: true,
      data: {
        id: landmark._id,
        name: landmark.name,
        description: landmark.description,
        category: landmark.category,
        location: {
          latitude: landmark.location.coordinates[1],
          longitude: landmark.location.coordinates[0]
        },
        verified: landmark.verified,
        createdBy: landmark.userId,
        createdAt: landmark.createdAt
      }
    });
  } catch (error) {
    console.error('Create landmark error:', error);
    res.status(500).json({ error: 'Failed to create landmark' });
  }
};

/**
 * Get nearby landmarks
 */
export const getNearbyLandmarksHandler = async (req, res) => {
  try {
    const { lat, lng, radius, category } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Latitude and longitude are required'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: 'Invalid coordinates'
      });
    }

    const searchRadius = radius ? parseInt(radius) : 5000;
    const landmarks = await getNearbyLandmarks(
      latitude,
      longitude,
      searchRadius,
      category || null
    );

    const transformedLandmarks = landmarks.map(landmark => ({
      id: landmark._id,
      name: landmark.name,
      description: landmark.description,
      category: landmark.category,
      location: {
        latitude: landmark.location.coordinates[1],
        longitude: landmark.location.coordinates[0]
      },
      verified: landmark.verified,
      createdBy: landmark.userId?._id || 'Unknown',
      createdByUsername: landmark.userId?.username || 'Unknown',
      createdAt: landmark.createdAt
    }));

    res.json({
      success: true,
      count: transformedLandmarks.length,
      data: transformedLandmarks
    });
  } catch (error) {
    console.error('Get nearby landmarks error:', error);
    res.status(500).json({ error: 'Failed to get landmarks' });
  }
};

/**
 * Delete a landmark (creator only)
 * DELETE /api/landmarks/:id
 */
export const deleteLandmarkHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const landmark = await Landmark.findById(id);

    if (!landmark) {
      return res.status(404).json({
        error: 'Landmark not found'
      });
    }

    // Check if the user is the creator
    if (landmark.userId.toString() !== req.userId) {
      return res.status(403).json({
        error: 'You can only delete landmarks you created'
      });
    }

    await Landmark.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Landmark deleted successfully'
    });
  } catch (error) {
    console.error('Delete landmark error:', error);
    res.status(500).json({ error: 'Failed to delete landmark' });
  }
};

/**
 * Sync landmarks from OpenStreetMap
 * POST /api/landmarks/sync-osm
 */
export const syncOpenStreetMapHandler = async (req, res) => {
  try {
    const { lat, lng, radius } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Latitude and longitude are required'
      });
    }

    const searchRadius = radius ? parseInt(radius) : 5000;
    const osmLandmarks = await fetchOSMLandmarks(lat, lng, searchRadius);

    if (osmLandmarks.length === 0) {
      return res.json({
        success: true,
        message: 'No new landmarks found in this area',
        count: 0
      });
    }

    let savedCount = 0;
    for (const data of osmLandmarks) {
      // Check if landmark already exists (by name and approximate location)
      const existing = await Landmark.findOne({
        name: data.name,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [data.longitude, data.latitude] },
            $maxDistance: 50 // Within 50 meters
          }
        }
      });

      if (!existing) {
        await createLandmark(req.userId || null, data);
        savedCount++;
      }
    }

    res.json({
      success: true,
      message: `Successfully synced ${savedCount} new landmarks from OpenStreetMap`,
      count: savedCount,
      total_found: osmLandmarks.length
    });
  } catch (error) {
    console.error('OSM sync error:', error);
    res.status(500).json({ error: 'Failed to sync with OpenStreetMap' });
  }
};
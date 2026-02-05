import axios from 'axios';
import { createLandmark, getNearbyLandmarks, Landmark } from '../db.js';

/**
 * Maps OSM tags to our internal categories
 */
function mapOSMCategory(tags) {
  if (tags.amenity === 'fuel') return 'gas_station';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'parking') return 'parking';
  if (tags.amenity === 'restaurant' || tags.amenity === 'cafe') return 'restaurant';
  if (tags.shop) return 'shop';
  if (tags.historic || tags.landmark) return 'landmark';
  return 'other';
}

/**
 * Fetch landmarks from OpenStreetMap using the Overpass API
 */
const fetchOSMLandmarks = async (lat, lng, radius = 5000) => {
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ];

  const query = `
    [out:json][timeout:25];
    (
      node["amenity"~"fuel|hospital|parking|restaurant|police|pharmacy"](around:${radius},${lat},${lng});
      node["shop"~"convenience|supermarket"](around:${radius},${lat},${lng});
      node["historic"~"landmark|monument"](around:${radius},${lat},${lng});
      way["amenity"~"fuel|hospital|parking|restaurant|police|pharmacy"](around:${radius},${lat},${lng});
      way["shop"~"convenience|supermarket"](around:${radius},${lat},${lng});
      way["historic"~"landmark|monument"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  for (const mirror of mirrors) {
    try {
      console.log(`📡 Attempting OSM fetch from mirror: ${mirror}`);
      const response = await axios.post(mirror,
        `data=${encodeURIComponent(query)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      );

      if (!response.data || !response.data.elements) {
        continue;
      }

      const landmarks = response.data.elements
        .filter(el => el.tags && (el.tags.name || el.tags.amenity || el.tags.shop || el.tags.historic))
        .map(el => {
          const latitude = el.lat || el.center?.lat;
          const longitude = el.lon || el.center?.lon;

          if (!latitude || !longitude) {
            return null;
          }

          return {
            name: el.tags.name || el.tags.amenity || el.tags.shop || el.tags.historic || 'Unnamed Landmark',
            description: el.tags.brand || el.tags.description || `OSM ${el.tags.amenity || el.tags.shop || 'landmark'}`,
            category: mapOSMCategory(el.tags),
            latitude,
            longitude,
            osmId: el.id,
            source: 'OpenStreetMap'
          };
        })
        .filter(l => l !== null);

      console.log(`✅ OSM fetch successful from ${mirror}, found ${landmarks.length} landmarks`);
      return landmarks.slice(0, 50);
    } catch (error) {
      console.warn(`⚠️ OSM mirror ${mirror} failed: ${error.message}`);
    }
  }

  console.error('❌ All OSM mirrors failed');
  return [];
};

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

    // First attempt to get from DB
    let landmarks = await getNearbyLandmarks(
      latitude,
      longitude,
      searchRadius,
      category || null
    );

    // If no landmarks found, attempt to sync from OSM automatically
    if (landmarks.length === 0) {
      console.log(`🔍 No landmarks in DB for [${latitude}, ${longitude}]. Triggering OSM sync...`);
      try {
        const osmLandmarks = await fetchOSMLandmarks(latitude, longitude, searchRadius);

        if (osmLandmarks.length > 0) {
          let savedCount = 0;
          for (const data of osmLandmarks) {
            // Check if landmark already exists (by name and approximate location) - redundant but safe
            const existing = await Landmark.findOne({
              name: data.name,
              location: {
                $near: {
                  $geometry: { type: 'Point', coordinates: [data.longitude, data.latitude] },
                  $maxDistance: 100 // Within 100 meters
                }
              }
            });

            if (!existing) {
              await createLandmark(req.userId || null, data);
              savedCount++;
            }
          }
          console.log(`✅ Auto-synced ${savedCount} new landmarks from OSM`);

          // Re-fetch from DB after sync
          landmarks = await getNearbyLandmarks(
            latitude,
            longitude,
            searchRadius,
            category || null
          );
        }
      } catch (syncError) {
        console.error('❌ Automatic OSM sync failed:', syncError.message);
        // Continue with empty results or whatever was found
      }
    }

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
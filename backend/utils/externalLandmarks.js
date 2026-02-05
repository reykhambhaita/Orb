// backend/utils/externalLandmarks.js
import axios from 'axios';

/**
 * Fetch landmarks from OpenStreetMap using the Overpass API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in meters
 * @returns {Promise<Array>} - Array of landmark objects
 */
export const fetchOSMLandmarks = async (lat, lng, radius = 5000) => {
  try {
    // Overpass QL query to find amenities and significant landmarks
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"fuel|hospital|parking|restaurant|police|pharmacy"](around:${radius},${lat},${lng});
        way["amenity"~"fuel|hospital|parking|restaurant|police|pharmacy"](around:${radius},${lat},${lng});
        node["shop"~"convenience|supermarket"](around:${radius},${lat},${lng});
        way["shop"~"convenience|supermarket"](around:${radius},${lat},${lng});
        node["historic"~"landmark|monument"](around:${radius},${lat},${lng});
        way["historic"~"landmark|monument"](around:${radius},${lat},${lng});
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await axios.post('https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    if (!response.data || !response.data.elements) {
      return [];
    }

    // Transform OSM elements into our landmark format
    const landmarks = response.data.elements
      .filter(el => el.tags && (el.tags.name || el.tags.amenity || el.tags.shop || el.tags.historic))
      .map(el => {
        let latitude = el.lat;
        let longitude = el.lon;

        // For ways (polygons), we might not have a direct lat/lon in the body
        // but the 'center' might be provided if we used 'out center;'
        // Since we used 'out body;', we'll mostly get nodes here.
        // Ways would need nodes to be resolved, but Overpass 'out center' is better.
        // For simplicity, we'll focus on nodes or elements with lat/lon.

        if (!latitude || !longitude) {
          // If it's a way and we don't have center, we skip for now or use nodes.
          // However, Overpass usually returns nodes that compose the way too.
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

    // Limit to top 50 to avoid overwhelming
    return landmarks.slice(0, 50);
  } catch (error) {
    console.error('OSM fetch error:', error.message);
    return [];
  }
};

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

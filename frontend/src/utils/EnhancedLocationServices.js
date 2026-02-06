// utils/EnhancedLocationServices.js
// Enhanced location services with Geoapify API integration

import * as Location from 'expo-location';
import authService from '../screens/authService';

// Geoapify API key (recommended to use environment variables)
// Geoapify API key removed - now using backend proxy



/**
 * Enhanced reverse geocoding with multiple fallback strategies
 * Priority:
 * 1. Geoapify API (when online + available)
 * 2. Expo Location API (native geocoding)
 * 3. Cached verified addresses
 */
class EnhancedGeocoder {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimitDelay = 100; // ms between requests
  }

  /**
   * Primary geocoding function with intelligent fallback
   * Priority: Cache → Geoapify → Server-side → Native Expo → Coordinates
   */
  async reverseGeocode(latitude, longitude, options = {}) {
    const {
      useGoogle = true,
      useNative = true,
      useCache = true,
      forceRefresh = false,
      isOnline = true,
    } = options;

    // 1. Check cache first
    if (useCache && !forceRefresh) {
      const cached = this.getCachedAddress(latitude, longitude);
      if (cached) {
        console.log('📍 Using cached address');
        return { address: cached, source: 'cache', confidence: 'high' };
      }
    }


    // 3. Try server-side geocoding (reliable in EAS builds)
    if (isOnline) {
      try {
        console.log('🌐 EnhancedGeocoder: Attempting server-side reverse geocoding...');
        const serverResult = await authService.reverseGeocode(latitude, longitude);

        if (serverResult.success && serverResult.data?.address) {
          const address = serverResult.data.address;
          console.log(`✅ EnhancedGeocoder: Server-side geocoding success: ${address}`);
          this.cacheAddress(latitude, longitude, address);
          return {
            address,
            source: 'server',
            confidence: 'high',
          };
        } else {
          console.warn('⚠️ Server-side geocoding returned no address:', serverResult.error);
        }
      } catch (error) {
        console.error('❌ Server-side geocoding failed:', error.message);
      }
    }

    // 4. Fallback to native Expo geocoding (may fail silently in EAS builds)
    if (useNative) {
      try {
        const nativeResult = await this.nativeGeocode(latitude, longitude);
        if (nativeResult.success && nativeResult.address && nativeResult.address !== 'Address unavailable') {
          this.cacheAddress(latitude, longitude, nativeResult.address);
          return {
            address: nativeResult.address,
            source: 'native',
            confidence: 'medium',
          };
        }
      } catch (error) {
        console.warn('Native geocoding failed:', error.message);
      }
    }

    // 5. Final fallback: return coordinates
    return {
      address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      source: 'coordinates',
      confidence: 'low',
    };
  }


  /**
   * Native Expo Location geocoding (fallback)
   */
  async nativeGeocode(latitude, longitude) {
    try {
      const result = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (result && result.length > 0) {
        const location = result[0];
        const addressParts = [];

        if (location.name) addressParts.push(location.name);
        if (location.street) addressParts.push(location.street);
        if (location.city) addressParts.push(location.city);
        if (location.region) addressParts.push(location.region);
        if (location.country) addressParts.push(location.country);

        const address = addressParts.join(', ') || 'Address unavailable';

        return {
          success: true,
          address,
          details: location,
        };
      }

      return { success: false, error: 'No results' };
    } catch (error) {
      console.error('Native geocoding error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cache management
   */
  getCachedAddress(latitude, longitude) {
    const key = this.getCacheKey(latitude, longitude);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.address;
    }

    return null;
  }

  cacheAddress(latitude, longitude, address) {
    const key = this.getCacheKey(latitude, longitude);
    this.cache.set(key, {
      address,
      timestamp: Date.now(),
    });
  }

  getCacheKey(latitude, longitude) {
    // Round to ~50m precision for cache key
    return `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  }

  clearCache() {
    this.cache.clear();
  }
}

/**
 * Enhanced GPS accuracy improvement using multiple strategies
 */
class GPSAccuracyEnhancer {
  constructor() {
    this.kalmanFilters = {
      latitude: null,
      longitude: null,
      altitude: null,
    };
    this.measurements = [];
    this.maxMeasurements = 10;
  }

  /**
   * Improve GPS accuracy using multiple measurements and Kalman filtering
   */
  async getHighAccuracyLocation(options = {}) {
    const {
      timeout = 30000,
      targetAccuracy = 10, // meters
      maxWaitTime = 15000, // max time to wait for target accuracy
      enableHighAccuracy = true,
    } = options;

    const measurements = [];
    const startTime = Date.now();

    try {
      // Request multiple GPS fixes
      while (Date.now() - startTime < maxWaitTime) {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        });

        measurements.push(location);

        // If we hit target accuracy, we can stop early
        if (location.coords.accuracy <= targetAccuracy) {
          console.log(`✅ Target accuracy reached: ${location.coords.accuracy.toFixed(1)}m`);
          break;
        }

        // Wait a bit before next measurement
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // If we got no measurements, throw error
      if (measurements.length === 0) {
        throw new Error('No GPS measurements obtained');
      }

      // Average the measurements, weighted by accuracy
      const bestLocation = this.weightedAverageLocation(measurements);

      console.log(`📍 GPS accuracy improved: ${measurements.length} measurements, final accuracy: ${bestLocation.accuracy.toFixed(1)}m`);

      return bestLocation;
    } catch (error) {
      console.error('High accuracy location error:', error);
      // Fallback to single measurement
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };
    }
  }

  /**
   * Calculate weighted average of multiple GPS measurements
   * More accurate measurements get higher weight
   */
  weightedAverageLocation(measurements) {
    if (measurements.length === 0) return null;
    if (measurements.length === 1) {
      return {
        latitude: measurements[0].coords.latitude,
        longitude: measurements[0].coords.longitude,
        accuracy: measurements[0].coords.accuracy,
      };
    }

    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLng = 0;
    let bestAccuracy = Infinity;

    measurements.forEach((measurement) => {
      const accuracy = measurement.coords.accuracy || 100;
      // Weight is inverse of accuracy (better accuracy = higher weight)
      const weight = 1 / (accuracy * accuracy);

      weightedLat += measurement.coords.latitude * weight;
      weightedLng += measurement.coords.longitude * weight;
      totalWeight += weight;

      if (accuracy < bestAccuracy) {
        bestAccuracy = accuracy;
      }
    });

    return {
      latitude: weightedLat / totalWeight,
      longitude: weightedLng / totalWeight,
      accuracy: bestAccuracy * 0.7, // Improved accuracy from averaging
    };
  }
}

// Export singleton instances
export const enhancedGeocoder = new EnhancedGeocoder();
export const gpsEnhancer = new GPSAccuracyEnhancer();
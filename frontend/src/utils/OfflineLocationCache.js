// frontend/src/utils/OfflineLocationCache.js
import dbManager from './database';

/**
 * Offline Location Cache
 * Stores geocoded addresses locally to enable offline reverse geocoding
 * and reduce API calls for frequent locations.
 */
class OfflineLocationCache {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize the cache and ensure the table exists
   */
  async init() {
    if (this.initialized) return;

    try {
      this.db = await dbManager.getDatabase();

      // Create address_cache table if it doesn't exist
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS address_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          address TEXT NOT NULL,
          source TEXT,
          confidence TEXT,
          details TEXT,
          visit_count INTEGER DEFAULT 1,
          last_visit INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_address_cache_location ON address_cache(latitude, longitude);
      `);

      this.initialized = true;
      // console.log('✅ OfflineLocationCache initialized');
    } catch (error) {
      console.error('❌ OfflineLocationCache init failed:', error);
    }
  }

  /**
   * Get a cached address near the specified coordinates
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusInMeters
   * @returns {Promise<Object|null>}
   */
  async getCachedAddress(latitude, longitude, radiusInMeters = 50) {
    await this.init();
    if (!this.db) return null;

    try {
      // Calculate coordinate deltas for the bounding box
      const latDelta = (radiusInMeters / 111320);
      const lngDelta = (radiusInMeters / (111320 * Math.cos(latitude * Math.PI / 180)));

      // Query for nearby addresses
      const results = await this.db.getAllAsync(
        `SELECT * FROM address_cache
         WHERE latitude BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?
         ORDER BY visit_count DESC
         LIMIT 5;`,
        [
          latitude - latDelta,
          latitude + latDelta,
          longitude - lngDelta,
          longitude + lngDelta
        ]
      );

      if (results && results.length > 0) {
        // Find the best match (closest or highest visit count)
        const bestMatch = results[0];

        // Update visit count asynchronously
        this.incrementVisitCount(bestMatch.id);

        return {
          address: bestMatch.address,
          visitCount: bestMatch.visit_count,
          source: bestMatch.source,
          confidence: bestMatch.confidence
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching from address cache:', error);
      return null;
    }
  }

  /**
   * Predict an address based on the nearest cached location
   * Used when offline and no exact match is found
   */
  async predictAddress(latitude, longitude, maxRadiusInMeters = 500) {
    await this.init();
    if (!this.db) return null;

    try {
      // Query for nearest address within a larger bounding box
      const latDelta = (maxRadiusInMeters / 111320);
      const lngDelta = (maxRadiusInMeters / (111320 * Math.cos(latitude * Math.PI / 180)));

      const results = await this.db.getAllAsync(
        `SELECT *,
         ((latitude - ?)*(latitude - ?) + (longitude - ?)*(longitude - ?)) as dist_sq
         FROM address_cache
         WHERE latitude BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?
         ORDER BY dist_sq ASC
         LIMIT 1;`,
        [
          latitude, latitude, longitude, longitude,
          latitude - latDelta, latitude + latDelta,
          longitude - lngDelta, longitude + lngDelta
        ]
      );

      if (results && results.length > 0) {
        const closest = results[0];
        const distance = Math.sqrt(closest.dist_sq) * 111320; // Rough conversion to meters

        return {
          address: closest.address,
          distance: distance
        };
      }

      return null;
    } catch (error) {
      console.error('Error predicting address:', error);
      return null;
    }
  }

  /**
   * Cache a new address or update an existing one
   */
  async cacheAddress(latitude, longitude, address, details = {}) {
    await this.init();
    if (!this.db || !address) return;

    try {
      const now = Date.now();

      // Check if this specific address already exists nearby
      const existing = await this.db.getAllAsync(
        `SELECT id FROM address_cache
         WHERE address = ?
         AND ABS(latitude - ?) < 0.0001
         AND ABS(longitude - ?) < 0.0001
         LIMIT 1;`,
        [address, latitude, longitude]
      );

      if (existing && existing.length > 0) {
        await this.incrementVisitCount(existing[0].id);
      } else {
        await this.db.runAsync(
          `INSERT INTO address_cache
           (latitude, longitude, address, source, confidence, details, visit_count, last_visit, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);`,
          [
            latitude,
            longitude,
            address,
            details.source || 'unknown',
            details.confidence || 'low',
            JSON.stringify(details.addressComponents || {}),
            now,
            now
          ]
        );
      }
    } catch (error) {
      console.error('Error caching address:', error);
    }
  }

  /**
   * Increment the visit count for a cached address
   */
  async incrementVisitCount(id) {
    if (!this.db) return;
    try {
      await this.db.runAsync(
        `UPDATE address_cache SET visit_count = visit_count + 1, last_visit = ? WHERE id = ?;`,
        [Date.now(), id]
      );
    } catch (error) {
      console.error('Error updating visit count:', error);
    }
  }

  /**
   * Clear old cache entries (> 30 days)
   */
  async cleanup() {
    await this.init();
    if (!this.db) return;

    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      await this.db.runAsync(`DELETE FROM address_cache WHERE last_visit < ?;`, [thirtyDaysAgo]);
    } catch (error) {
      console.error('Error cleaning up address cache:', error);
    }
  }
}

// Export a singleton instance
const offlineCache = new OfflineLocationCache();
export default offlineCache;
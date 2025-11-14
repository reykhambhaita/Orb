// src/services/authService.js
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = 'https://backend-three-sepia-16.vercel.app';
const TOKEN_KEY = 'orms_auth_token';
const USER_KEY = 'orms_user_data';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

class AuthService {
  constructor() {
    this.token = null;
    this.user = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userData = await SecureStore.getItemAsync(USER_KEY);

      if (token && userData) {
        this.token = token;
        this.user = JSON.parse(userData);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      this.initialized = true;
    }
  }

  // === AUTHENTICATION METHODS ===

  async signup(email, username, password, role = 'user', mechanicData = null) {
    try {
      await this.initialize();

      const body = { email, username, password, role };

      if (role === 'mechanic' && mechanicData) {
        body.mechanicData = mechanicData;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      await this.storeAuthData(data.token, data.user);

      return {
        success: true,
        user: data.user,
        mechanicProfile: data.mechanicProfile
      };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: error.message };
    }
  }

  async login(email, password) {
    try {
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      await this.storeAuthData(data.token, data.user);

      return {
        success: true,
        user: data.user,
        mechanicProfile: data.mechanicProfile
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  async logout() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      this.token = null;
      this.user = null;
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  }

  async getCurrentUser() {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      // Return cached user immediately if offline
      if (!this.isOnline()) {
        console.log('Offline mode: returning cached user');
        return {
          success: true,
          user: this.user,
          mechanicProfile: null,
          offline: true
        };
      }

      // Try to fetch from server
      try {
        const response = await Promise.race([
          fetch(`${API_BASE_URL}/api/auth/me`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.token}`,
            },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 5000)
          )
        ]);

        const data = await response.json();

        if (!response.ok) {
          // Only logout if explicitly unauthorized, not on network errors
          if (response.status === 401 && (data.code === 'INVALID_TOKEN' || data.code === 'NO_TOKEN')) {
            await this.logout();
            throw new Error(data.error || 'Authentication expired');
          }
          throw new Error(data.error || 'Failed to get user');
        }

        this.user = data.user;
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));

        return {
          success: true,
          user: data.user,
          mechanicProfile: data.mechanicProfile
        };
      } catch (fetchError) {
        // If network error but we have cached user, use it
        if (this.user && (fetchError.message === 'timeout' || fetchError.message.includes('Network'))) {
          console.log('Network error, using cached user');
          return {
            success: true,
            user: this.user,
            mechanicProfile: null,
            offline: true
          };
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Get current user error:', error);
      // Return cached user if available, otherwise fail
      if (this.user) {
        return {
          success: true,
          user: this.user,
          mechanicProfile: null,
          offline: true
        };
      }
      return { success: false, error: error.message };
    }
  }

  async isAuthenticated() {
    await this.initialize();
    return !!this.token;
  }

  async getToken() {
    await this.initialize();
    return this.token;
  }

  async getUser() {
    await this.initialize();
    return this.user;
  }

  async hasRole(role) {
    await this.initialize();
    return this.user?.role === role;
  }

  async isMechanic() {
    return await this.hasRole('mechanic');
  }

  async storeAuthData(token, user) {
    try {
      if (!token || !user) {
        throw new Error('Invalid auth data');
      }

      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      this.token = token;
      this.user = user;

      console.log('Auth data stored successfully');
    } catch (error) {
      console.error('Failed to store auth data:', error);
      throw error;
    }
  }

  // Helper: Check if online
  isOnline() {
    return navigator?.onLine !== false;
  }

  // === LANDMARK METHODS ===

  /**
   * Create a new landmark
   */
  async createLandmark(name, description, category, latitude, longitude) {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${API_BASE_URL}/api/landmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          name,
          description,
          category,
          latitude,
          longitude
        })
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, data: data.data };
      } else {
        return { success: false, error: data.error || 'Failed to create landmark' };
      }
    } catch (error) {
      console.error('Create landmark error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get nearby landmarks from database
   */
  async getNearbyLandmarks(latitude, longitude, radius = 5000, category = null) {
    try {
      await this.initialize();

      const params = new URLSearchParams({
        lat: latitude.toString(),
        lng: longitude.toString(),
        radius: radius.toString(),
      });

      if (category) {
        params.append('category', category);
      }

      const headers = {
        'Content-Type': 'application/json'
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await Promise.race([
        fetch(`${API_BASE_URL}/api/landmarks/nearby?${params}`, {
          method: 'GET',
          headers
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data: data.data || [],
          source: 'database'
        };
      } else {
        console.error('Landmark fetch failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to fetch landmarks',
          data: []
        };
      }
    } catch (error) {
      console.error('Landmark API error:', error.message);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  /**
   * Fetch from OpenStreetMap and return places
   */
  async fetchOpenStreetMapNearby(latitude, longitude, radius = 5000) {
    try {
      const radiusMeters = radius;

      const query = `
        [out:json][timeout:25];
        (
          node["amenity"~"restaurant|cafe|fast_food|fuel|hospital|pharmacy|parking"](around:${radiusMeters},${latitude},${longitude});
          node["shop"](around:${radiusMeters},${latitude},${longitude});
          node["tourism"](around:${radiusMeters},${latitude},${longitude});
          node["historic"](around:${radiusMeters},${latitude},${longitude});
        );
        out body;
      `;

      const response = await Promise.race([
        fetch(OVERPASS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `data=${encodeURIComponent(query)}`,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15000)
        )
      ]);

      if (!response.ok) {
        throw new Error('Failed to fetch from OpenStreetMap');
      }

      const data = await response.json();

      const places = (data.elements || []).map(element => ({
        id: element.id,
        name: element.tags?.name || 'Unnamed Place',
        latitude: element.lat,
        longitude: element.lon,
        category: this.mapOSMTagToCategory(element.tags),
        description: this.getOSMDescription(element.tags),
        tags: element.tags,
      }));

      const namedPlaces = places.filter(p => p.name !== 'Unnamed Place');

      return {
        success: true,
        places: namedPlaces,
        source: 'osm'
      };
    } catch (error) {
      console.error('OpenStreetMap API error:', error);
      return {
        success: false,
        error: error.message,
        places: []
      };
    }
  }

  /**
   * Sync OpenStreetMap places to backend database
   */
  async syncOpenStreetMapToBackend(latitude, longitude, radius = 5000) {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      console.log('🌍 Starting OpenStreetMap sync...');

      const response = await fetch(`${API_BASE_URL}/api/landmarks/sync-osm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          latitude,
          longitude,
          radius
        })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Sync successful:', data);
        return {
          success: true,
          synced: data.synced,
          duplicate: data.duplicate,
          failed: data.failed,
          total: data.total
        };
      } else {
        console.error('❌ Sync failed:', data.error);
        return { success: false, error: data.error || 'Failed to sync' };
      }
    } catch (error) {
      console.error('Sync OpenStreetMap error:', error);
      return { success: false, error: error.message };
    }
  }

  mapOSMTagToCategory(tags) {
    if (!tags) return 'other';

    if (tags.amenity) {
      const amenityMap = {
        restaurant: 'restaurant',
        cafe: 'restaurant',
        fast_food: 'restaurant',
        food_court: 'restaurant',
        fuel: 'gas_station',
        charging_station: 'gas_station',
        hospital: 'hospital',
        clinic: 'hospital',
        pharmacy: 'hospital',
        doctors: 'hospital',
        parking: 'parking',
        parking_space: 'parking',
      };
      if (amenityMap[tags.amenity]) {
        return amenityMap[tags.amenity];
      }
    }

    if (tags.shop) {
      return 'shop';
    }

    if (tags.tourism || tags.historic) {
      return 'landmark';
    }

    return 'other';
  }

  getOSMDescription(tags) {
    const parts = [];

    if (tags.amenity) parts.push(tags.amenity.replace(/_/g, ' '));
    if (tags.shop) parts.push(`${tags.shop} shop`.replace(/_/g, ' '));
    if (tags.cuisine) parts.push(`Cuisine: ${tags.cuisine}`);
    if (tags.opening_hours) parts.push(`Hours: ${tags.opening_hours}`);
    if (tags['addr:street']) parts.push(tags['addr:street']);

    return parts.join(', ') || 'No description available';
  }

  // === MECHANIC METHODS ===

  async createMechanicProfile(name, phone, latitude, longitude, specialties = [], available = true) {
    return await this.authenticatedRequest('/api/mechanics/profile', {
      method: 'POST',
      body: JSON.stringify({
        name,
        phone,
        latitude,
        longitude,
        specialties,
        available,
      }),
    });
  }

  async getMechanicProfile() {
    return await this.authenticatedRequest('/api/mechanics/profile', {
      method: 'GET',
    });
  }

  async updateMechanicLocation(latitude, longitude) {
    return await this.authenticatedRequest('/api/mechanics/location', {
      method: 'PATCH',
      body: JSON.stringify({
        latitude,
        longitude,
      }),
    });
  }

  async updateMechanicAvailability(available) {
    return await this.authenticatedRequest('/api/mechanics/availability', {
      method: 'PATCH',
      body: JSON.stringify({
        available,
      }),
    });
  }

  /**
   * Get nearby mechanics from database
   */
  async getNearbyMechanics(latitude, longitude, radius = 5000) {
    try {
      await this.initialize();

      const params = new URLSearchParams({
        lat: latitude.toString(),
        lng: longitude.toString(),
        radius: radius.toString(),
      });

      const headers = {
        'Content-Type': 'application/json'
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await Promise.race([
        fetch(`${API_BASE_URL}/api/mechanics/nearby?${params}`, {
          method: 'GET',
          headers
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          data: data.data || [],
          source: 'database'
        };
      } else {
        console.error('Mechanics fetch failed:', data.error);
        return {
          success: false,
          error: data.error || 'Failed to fetch mechanics',
          data: []
        };
      }
    } catch (error) {
      console.error('Mechanic API error:', error.message);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  async deleteLandmark(landmarkId) {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${API_BASE_URL}/api/landmarks/${landmarkId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to delete landmark' };
      }
    } catch (error) {
      console.error('Delete landmark error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generic authenticated request helper
   */
  async authenticatedRequest(endpoint, options = {}) {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      };

      const response = await Promise.race([
        fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);

      const data = await response.json();

      if (response.ok) {
        return { success: true, data: data.data || data };
      } else {
        return { success: false, error: data.error || 'Request failed' };
      }
    } catch (error) {
      console.error('Authenticated request error:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new AuthService();
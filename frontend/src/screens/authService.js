import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = 'https://backend-three-sepia-16.vercel.app';
const TOKEN_KEY = 'orb_auth_token';
const USER_KEY = 'orb_user_data';

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

  async handleResponse(response) {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        const text = await response.text();
        console.warn(`⚠️ Non-JSON response received from ${response.url}:`, text.substring(0, 100));

        if (response.status === 429) {
          return { error: 'Too many requests. Please try again later.' };
        }
        return { error: text || `Server error (${response.status})` };
      }
    } catch (error) {
      console.error('Error parsing response:', error);
      return { error: 'Failed to parse server response' };
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

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Note: We don't store auth data here anymore because email needs verification
      // The JWT will be returned by verifyOTP

      return {
        success: true,
        message: data.message,
        email: data.email,
        role: data.role
      };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: error.message };
    }
  }

  async verifyOTP(email, otp) {
    try {
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp }),
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      await this.storeAuthData(data.token, data.user);

      return {
        success: true,
        user: data.user,
        mechanicProfile: data.mechanicProfile
      };
    } catch (error) {
      console.error('Verify OTP error:', error);
      return { success: false, error: error.message };
    }
  }

  async resendOTP(email) {
    try {
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Resend failed');
      }

      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      console.error('Resend OTP error:', error);
      return { success: false, error: error.message };
    }
  }

  async forgotPassword(email) {
    try {
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      console.error('Forgot password error:', error);
      return { success: false, error: error.message };
    }
  }

  async verifyForgotPasswordOTP(email, otp) {
    try {
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/auth/verify-forgot-password-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp }),
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      console.error('Verify forgot password OTP error:', error);
      return { success: false, error: error.message };
    }
  }

  async resetPassword(email, otp, newPassword) {
    try {
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otp, newPassword }),
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Password reset failed');
      }

      return {
        success: true,
        message: data.message
      };
    } catch (error) {
      console.error('Reset password error:', error);
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

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      console.log('🔑 Login successful, user role:', data.user?.role);
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

        const data = await this.handleResponse(response);

        if (!response.ok) {
          if (response.status === 401 && (data.code === 'INVALID_TOKEN' || data.code === 'NO_TOKEN')) {
            await this.logout();
            throw new Error(data.error || 'Authentication expired');
          }
          if (response.status === 404) {
            console.warn('⚠️ User not found on server, logging out...');
            await this.logout();
            throw new Error('User not found');
          }
          throw new Error(data.error || 'Failed to get user');
        }

        this.user = data.user;
        console.log('👤 Current user fetched, role:', data.user?.role);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));

        return {
          success: true,
          user: data.user,
          mechanicProfile: data.mechanicProfile
        };
      } catch (fetchError) {
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
  // Add this method to your AuthService class in authService.js
  // Place it after the getCurrentUser method

  async updateProfile(updates) {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/update-profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(updates)
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update cached user data
      this.user = { ...this.user, ...data.user };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(this.user));

      return {
        success: true,
        user: data.user
      };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: error.message };
    }
  }

  async uploadAvatar(avatarBase64) {
    try {
      await this.initialize();

      if (!this.token) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/upload-avatar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ avatar: avatarBase64 })
      });

      const data = await this.handleResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload avatar');
      }

      // Update cached user data
      this.user = { ...this.user, ...data.user };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(this.user));

      return {
        success: true,
        user: data.user
      };
    } catch (error) {
      console.error('Upload avatar error:', error);
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

  isOnline() {
    return navigator?.onLine !== false;
  }

  // === LANDMARK METHODS ===

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

      const data = await this.handleResponse(response);

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

  async getNearbyLandmarks(latitude, longitude, radius = 10000, category = null) {
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

      const data = await this.handleResponse(response);

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

      const data = await this.handleResponse(response);

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

  async updateMechanicUPI(upiId) {
    return await this.authenticatedRequest('/api/mechanics/upi', {
      method: 'PATCH',
      body: JSON.stringify({
        upiId,
      }),
    });
  }

  async getNearbyMechanics(latitude, longitude, radius = 10000) {
    try {
      await this.initialize();

      // console.log('🔍 [authService.getNearbyMechanics] Starting request');
      // console.log('   API_BASE_URL:', API_BASE_URL);
      // console.log('   Params:', { latitude, longitude, radius });
      // console.log('   Has token:', !!this.token);

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

      const url = `${API_BASE_URL}/api/mechanics/nearby?${params}`;
      // console.log('   Full URL:', url);

      const response = await Promise.race([
        fetch(url, {
          method: 'GET',
          headers
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);

      // console.log('✅ [authService.getNearbyMechanics] Response received');
      // console.log('   Status:', response.status);
      // console.log('   OK:', response.ok);

      const data = await this.handleResponse(response);
      // console.log('   Response data:', JSON.stringify(data, null, 2));

      if (response.ok) {
        // console.log('✅ [authService.getNearbyMechanics] Success! Found', data.data?.length || 0, 'mechanics');
        return {
          success: true,
          data: data.data || [],
          source: 'database'
        };
      } else {
        console.error('❌ [authService.getNearbyMechanics] Fetch failed:', data.error);
        console.error('   Full error response:', JSON.stringify(data, null, 2));
        return {
          success: false,
          error: data.error || 'Failed to fetch mechanics',
          data: []
        };
      }
    } catch (error) {
      console.error('❌ [authService.getNearbyMechanics] Exception:', error.message);
      console.error('   Error type:', error.name);
      console.error('   Stack:', error.stack);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

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

      const data = await this.handleResponse(response);

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

  async createReview(mechanicId, rating, comment = '', callDuration = 0) {
    return await this.authenticatedRequest('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        mechanicId,
        rating,
        comment,
        callDuration
      })
    });
  }

  async getMechanicReviews(mechanicId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/reviews/mechanic/${mechanicId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await this.handleResponse(response);

      if (response.ok) {
        return { success: true, data: data.data || [] };
      } else {
        return { success: false, error: data.error || 'Failed to get reviews' };
      }
    } catch (error) {
      console.error('Get mechanic reviews error:', error);
      return { success: false, error: error.message };
    }
  }

  async getMyReviews() {
    return await this.authenticatedRequest('/api/reviews/my-reviews', {
      method: 'GET'
    });
  }

  // === PAYMENT METHODS ===

  async createPayPalOrder(amount, mechanicId, description = '') {
    return await this.authenticatedRequest('/api/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        mechanicId,
        description
      })
    });
  }

  async capturePayPalPayment(orderId, paymentId) {
    return await this.authenticatedRequest('/api/payments/capture', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        paymentId
      })
    });
  }

  async createUPIPayment(amount, mechanicId, description = '') {
    return await this.authenticatedRequest('/api/payments/create-upi-payment', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        mechanicId,
        description
      })
    });
  }

  async verifyUPIPayment(paymentId, upiTransactionId, upiResponse, status) {
    return await this.authenticatedRequest('/api/payments/verify-upi-payment', {
      method: 'POST',
      body: JSON.stringify({
        paymentId,
        upiTransactionId,
        upiResponse,
        status
      })
    });
  }

  async getPaymentHistory() {
    return await this.authenticatedRequest('/api/payments/history', {
      method: 'GET'
    });
  }

  // === UPI DEEP LINK PAYMENT METHODS (New Expo-compatible approach) ===

  async createUPIPaymentOrder(amount, mechanicId, description = '') {
    return await this.authenticatedRequest('/api/payments/upi/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        mechanicId,
        description
      })
    });
  }

  async getPaymentStatus(transactionId) {
    return await this.authenticatedRequest(`/api/payments/upi/status/${transactionId}`, {
      method: 'GET'
    });
  }

  async manualVerifyPayment(transactionId, status, upiTransactionId = '') {
    return await this.authenticatedRequest('/api/payments/upi/manual-verify', {
      method: 'POST',
      body: JSON.stringify({
        transactionId,
        status,
        upiTransactionId
      })
    });
  }

  // === CALL LOG METHODS ===

  async createCallLog(mechanicId, phoneNumber, callStartTime) {
    return await this.authenticatedRequest('/api/call-logs', {
      method: 'POST',
      body: JSON.stringify({
        mechanicId,
        phoneNumber,
        callStartTime: callStartTime.toISOString()
      })
    });
  }

  async endCallLog(callLogId, callEndTime) {
    return await this.authenticatedRequest(`/api/call-logs/${callLogId}/end`, {
      method: 'PATCH',
      body: JSON.stringify({
        callEndTime: callEndTime.toISOString()
      })
    });
  }

  async getPendingReviews() {
    return await this.authenticatedRequest('/api/call-logs/pending-reviews', {
      method: 'GET'
    });
  }

  // === LOCATION METHODS ===

  async reverseGeocode(latitude, longitude) {
    try {
      console.log(`🌐 AuthService: Requesting reverse geocode for ${latitude}, ${longitude}`);
      await this.initialize();

      const response = await fetch(`${API_BASE_URL}/api/geocode/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ latitude, longitude }),
      });

      const data = await this.handleResponse(response);

      // Ensure we properly check for success
      if (response.ok && data.success && data.data?.address) {
        return data;
      }

      console.warn('Server geocoding returned no address:', data);
      return { success: false, error: data.error || 'No address found' };
    } catch (error) {
      console.error('Reverse geocode request failed:', error);
      return { success: false, error: error.message };
    }
  }


}




export default new AuthService();
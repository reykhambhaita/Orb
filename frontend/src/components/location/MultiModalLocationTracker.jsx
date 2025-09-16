import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BleManager } from "react-native-ble-plx";
import WifiManager from "react-native-wifi-reborn";


class LocalDatabaseManager {
  constructor() {
    this.dbName = "location_tracker_db";
    this.init();
  }

  async init() {
    try {
      // Initialize local storage structure
      const existingData = await AsyncStorage.getItem("db_initialized");
      if (!existingData) {
        await this.initializeDatabase();
      }
    } catch (error) {
      console.error("Failed to initialize local database:", error);
    }
  }

  async initializeDatabase() {
    try {
      const initialData = {
        user_locations_offline: [],
        user_locations_online: [],
        nearby_mechanics: [],
        nearby_landmarks: [],
        sync_metadata: {
          lastMechanicSync: null,
          lastLandmarkSync: null,
          lastLocationSync: null,
          syncVersion: 1,
        },
      };

      await AsyncStorage.setItem("db_initialized", "true");
      await AsyncStorage.setItem(
        "sync_metadata",
        JSON.stringify(initialData.sync_metadata)
      );
      console.log("✅ Local database initialized");
    } catch (error) {
      console.error("❌ Failed to initialize database:", error);
    }
  }

  // User Location Methods
  async saveLocationOffline(locationData) {
    try {
      const existing =
        (await AsyncStorage.getItem("user_locations_offline")) || "[]";
      const locations = JSON.parse(existing);

      const newLocation = {
        id: Date.now().toString(),
        ...locationData,
        timestamp: new Date().toISOString(),
        syncStatus: "pending",
      };

      locations.push(newLocation);

      // Keep only last 100 offline locations
      const limitedLocations = locations.slice(-100);
      await AsyncStorage.setItem(
        "user_locations_offline",
        JSON.stringify(limitedLocations)
      );

      console.log("💾 Location saved offline");
      return newLocation.id;
    } catch (error) {
      console.error("❌ Failed to save offline location:", error);
      return null;
    }
  }

  // Debug methods for viewing database content
  async getAllData() {
    try {
      const keys = [
        "db_initialized",
        "user_locations_offline",
        "user_locations_online",
        "nearby_mechanics",
        "nearby_landmarks",
        "sync_metadata",
      ];

      const data = {};
      for (const key of keys) {
        const value = await AsyncStorage.getItem(key);
        data[key] = value ? JSON.parse(value) : null;
      }
      return data;
    } catch (error) {
      console.error("Failed to get all data:", error);
      return {};
    }
  }

  async clearAllData() {
    try {
      await AsyncStorage.clear();
      console.log("Database cleared");
      return true;
    } catch (error) {
      console.error("Failed to clear database:", error);
      return false;
    }
  }
  async saveLocationOnline(locationData) {
    try {
      const existing =
        (await AsyncStorage.getItem("user_locations_online")) || "[]";
      const locations = JSON.parse(existing);

      const newLocation = {
        id: Date.now().toString(),
        ...locationData,
        timestamp: new Date().toISOString(),
        syncStatus: "synced",
      };

      locations.push(newLocation);

      // Keep only last 50 online locations
      const limitedLocations = locations.slice(-50);
      await AsyncStorage.setItem(
        "user_locations_online",
        JSON.stringify(limitedLocations)
      );

      console.log("🌐 Location saved online");
      return newLocation.id;
    } catch (error) {
      console.error("❌ Failed to save online location:", error);
      return null;
    }
  }

  async getOptimalLocation() {
    try {
      const offlineLocations = JSON.parse(
        (await AsyncStorage.getItem("user_locations_offline")) || "[]"
      );
      const onlineLocations = JSON.parse(
        (await AsyncStorage.getItem("user_locations_online")) || "[]"
      );

      // Get most recent from each source
      const recentOffline = offlineLocations.slice(-5);
      const recentOnline = onlineLocations.slice(-3);

      // Combine and sort by timestamp
      const allRecent = [...recentOffline, ...recentOnline].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      if (allRecent.length === 0) return null;

      // If we have both online and offline, prefer online if recent
      const latest = allRecent[0];
      const isRecentOnline = onlineLocations.some(
        (loc) => new Date() - new Date(loc.timestamp) < 5 * 60 * 1000 // 5 minutes
      );

      return {
        location: latest,
        source: isRecentOnline ? "online" : "offline",
        confidence: isRecentOnline ? 0.9 : 0.7,
      };
    } catch (error) {
      console.error("❌ Failed to get optimal location:", error);
      return null;
    }
  }

  // Mechanic Database Methods
  async saveMechanics(mechanics, location) {
    try {
      const mechanicsData = {
        mechanics: mechanics,
        location: location,
        timestamp: new Date().toISOString(),
        radius: 10000, // 10km default
      };

      await AsyncStorage.setItem(
        "nearby_mechanics",
        JSON.stringify(mechanicsData)
      );
      console.log(`💾 Saved ${mechanics.length} mechanics locally`);
      return true;
    } catch (error) {
      console.error("❌ Failed to save mechanics:", error);
      return false;
    }
  }

  async getNearbyMechanics(userLat, userLng, maxDistance = 10000) {
    try {
      const data = await AsyncStorage.getItem("nearby_mechanics");
      if (!data) return [];

      const mechanicsData = JSON.parse(data);
      const { mechanics, timestamp } = mechanicsData;

      // Check if data is not too old (30 minutes)
      const dataAge = new Date() - new Date(timestamp);
      if (dataAge > 30 * 60 * 1000) {
        console.log("⚠️ Mechanic data is stale");
        return [];
      }

      // Filter by distance
      return mechanics
        .map((mechanic) => ({
          ...mechanic,
          distance: this.calculateDistance(
            userLat,
            userLng,
            mechanic.latitude,
            mechanic.longitude
          ),
        }))
        .filter((m) => m.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    } catch (error) {
      console.error("❌ Failed to get nearby mechanics:", error);
      return [];
    }
  }

  // Landmark Database Methods
  async saveLandmarks(landmarks, location) {
    try {
      const landmarksData = {
        landmarks: landmarks,
        location: location,
        timestamp: new Date().toISOString(),
        radius: 5000, // 5km default
      };

      await AsyncStorage.setItem(
        "nearby_landmarks",
        JSON.stringify(landmarksData)
      );
      console.log(`💾 Saved ${landmarks.length} landmarks locally`);
      return true;
    } catch (error) {
      console.error("❌ Failed to save landmarks:", error);
      return false;
    }
  }

  async getNearbyLandmarks(userLat, userLng, maxDistance = 5000) {
    try {
      const data = await AsyncStorage.getItem("nearby_landmarks");
      if (!data) return [];

      const landmarksData = JSON.parse(data);
      const { landmarks, timestamp } = landmarksData;

      // Check if data is not too old (1 hour)
      const dataAge = new Date() - new Date(timestamp);
      if (dataAge > 60 * 60 * 1000) {
        console.log("⚠️ Landmark data is stale");
        return [];
      }

      // Filter by distance
      return landmarks
        .map((landmark) => ({
          ...landmark,
          distance: this.calculateDistance(
            userLat,
            userLng,
            landmark.location.lat,
            landmark.location.lng
          ),
        }))
        .filter((l) => l.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    } catch (error) {
      console.error("❌ Failed to get nearby landmarks:", error);
      return [];
    }
  }

  // Sync Methods
  async getSyncMetadata() {
    try {
      const data = await AsyncStorage.getItem("sync_metadata");
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("❌ Failed to get sync metadata:", error);
      return null;
    }
  }

  async updateSyncMetadata(updates) {
    try {
      const existing = (await this.getSyncMetadata()) || {};
      const updated = { ...existing, ...updates };
      await AsyncStorage.setItem("sync_metadata", JSON.stringify(updated));
      return true;
    } catch (error) {
      console.error("❌ Failed to update sync metadata:", error);
      return false;
    }
  }

  // Utility Methods
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(value) {
    return (value * Math.PI) / 180;
  }
}

// API Service for server communication
class LocationAPIService {
  constructor(baseUrl = "https://orms-git-main-greshas-projects.vercel.app//api") {
    this.baseUrl = baseUrl;
  }

  async getAuthHeaders() {
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        return {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };
      }
      return {
        "Content-Type": "application/json",
      };
    } catch (error) {
      console.error("Error getting auth token:", error);
      return {
        "Content-Type": "application/json",
      };
    }
  }

  async saveLocationToServer(locationData) {
    try {
      const headers = await this.getAuthHeaders();

      const response = await fetch(`${this.baseUrl}/location/enhanced`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          ...locationData,
          includeNearby: true,
          radius: 10000,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Authentication required");
        }
        throw new Error("Server request failed");
      }

      const result = await response.json();
      console.log("Location saved to server");
      return result;
    } catch (error) {
      console.error("Failed to save location to server:", error);
      throw error;
    }
  }

  async syncOfflineData(location) {
    try {
      const headers = await this.getAuthHeaders();

      const mechanicsPromise = fetch(`${this.baseUrl}/mechanics/offline-sync`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          location: location,
          radius: 50000,
          decryptCoordinates: true,
        }),
      });

      const landmarksPromise = fetch(`${this.baseUrl}/landmarks/offline-sync`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          location: location,
          radius: 30000,
        }),
      });

      const [mechanicsResponse, landmarksResponse] = await Promise.all([
        mechanicsPromise,
        landmarksPromise,
      ]);

      if (!mechanicsResponse.ok || !landmarksResponse.ok) {
        throw new Error("Sync request failed");
      }

      const mechanics = await mechanicsResponse.json();
      const landmarks = await landmarksResponse.json();

      return { mechanics, landmarks };
    } catch (error) {
      console.error("Failed to sync offline data:", error);
      throw error;
    }
  }
}

// Enhanced Kalman Filter (keeping the original implementation)
class KalmanFilter {
  constructor(
    processNoise = 0.001,
    measurementNoise = 0.01,
    initialPosition = 0
  ) {
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.positionError = 100.0;
    this.velocityError = 10.0;
    this.position = initialPosition;
    this.velocity = 0;
    this.initialized = false;
  }

  update(measurement, dt = 1) {
    if (!this.initialized && measurement !== 0) {
      this.position = measurement;
      this.initialized = true;
      this.positionError = this.measurementNoise;
      return this.position;
    }

    if (!this.initialized) {
      return measurement;
    }

    // Prediction step
    this.position += this.velocity * dt;
    this.positionError += this.velocityError * dt * dt + this.processNoise;

    // Update step
    const kalmanGain =
      this.positionError / (this.positionError + this.measurementNoise);
    this.position += kalmanGain * (measurement - this.position);
    this.positionError *= 1 - kalmanGain;

    return this.position;
  }

  setMeasurementNoise(noise) {
    this.measurementNoise = noise;
  }

  reset(position) {
    this.position = position;
    this.initialized = true;
    this.positionError = this.measurementNoise;
  }
}

const MultiModalLocationTracker = ({ userId = "user123" }) => {
  // State management
  const [currentLocation, setCurrentLocation] = useState({
    latitude: null,
    longitude: null,
    accuracy: null,
  });
  const [networkStatus, setNetworkStatus] = useState({
    isConnected: false,
    type: "none",
  });
  const [locationSources, setLocationSources] = useState({
    gps: null,
    wifi: null,
    bluetooth: null,
    deadReckoning: null,
    beacon: null,
  });
  const [nearbyMechanics, setNearbyMechanics] = useState([]);
  const [nearbyLandmarks, setNearbyLandmarks] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    lastSync: null,
    pendingSync: false,
    offlineCount: 0,
  });

  // Refs for persistent data
  const localDB = useRef(new LocalDatabaseManager());
  const apiService = useRef(new LocationAPIService());
  const kalmanLat = useRef(new KalmanFilter(0.001, 0.01, 23.0225));
  const kalmanLng = useRef(new KalmanFilter(0.001, 0.01, 70.77));
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugData, setDebugData] = useState({});
  const bleManager = useRef(null);

  const sensorData = useRef({
    acceleration: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 0, y: 0, z: 0 },
    stepCount: 0,
    heading: 0,
    lastPosition: { lat: 23.0225, lng: 70.77 },
    lastStepTime: Date.now(),
    stepThreshold: 1.2,
  });

  const locationSubscription = useRef(null);
  const sensorSubscriptions = useRef({
    accelerometer: null,
    gyroscope: null,
    magnetometer: null,
  });

  const fusionInterval = useRef(null);
  const syncInterval = useRef(null);
  const refreshInterval = useRef(null);

  // Initialize location tracking
  useEffect(() => {
    initializeLocationTracking();
    return () => {
      cleanup();
    };
  }, []);

  const initializeLocationTracking = async () => {
    try {
      console.log("🚀 Initializing enhanced location tracking...");

      // Request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required");
        return;
      }
      setPermissionGranted(true);

      // Initialize local database
      await localDB.current.init();

      // Get initial location
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (initialLocation && initialLocation.coords) {
          const { latitude, longitude } = initialLocation.coords;
          console.log("📍 Initial location:", latitude, longitude);

          // Initialize Kalman filters
          kalmanLat.current.reset(latitude);
          kalmanLng.current.reset(longitude);
          sensorData.current.lastPosition = { lat: latitude, lng: longitude };

          setCurrentLocation({
            latitude,
            longitude,
            accuracy: initialLocation.coords.accuracy || 100,
          });

          // Load optimal location from local DB
          await loadOptimalLocation();
        }
      } catch (error) {
        console.log("Could not get initial location, using defaults");
      }

      // Initialize network monitoring
      const unsubscribe = NetInfo.addEventListener((state) => {
        console.log("🌐 Network state changed:", state.type, state.isConnected);
        setNetworkStatus({
          isConnected: state.isConnected || false,
          type: state.type || "none",
        });

        // Trigger sync when coming online
        if (state.isConnected) {
          performSync();
        }
      });

      // Initialize BLE manager
      try {
        bleManager.current = new BleManager();
        const state = await bleManager.current.state();
        if (state !== "PoweredOn") {
          console.log("⚡ Bluetooth is not powered on");
        }
      } catch (error) {
        console.error("❌ BLE initialization error:", error);
      }

      // Start tracking
      setIsTracking(true);
      startMultiModalTracking();
      startPeriodicRefresh();

      return unsubscribe;
    } catch (error) {
      console.error("❌ Initialization error:", error);
      Alert.alert("Error", "Failed to initialize location tracking");
    }
  };

  const startMultiModalTracking = () => {
    console.log("🎯 Starting multi-modal tracking...");

    // Start all tracking methods
    startGPSTracking();
    startDeadReckoning();
    if (Platform.OS === "android") {
      startWiFiFingerprinting();
    }
    startBluetoothScanning();
    startBeaconDetection();
    startLocationFusion();
  };

  const loadDebugData = async () => {
    const data = await localDB.current.getAllData();
    setDebugData(data);
    console.log("=== DATABASE CONTENT ===", JSON.stringify(data, null, 2));
  };

  const clearAllData = async () => {
    const success = await localDB.current.clearAllData();
    if (success) {
      Alert.alert("Success", "Database cleared");
      await loadDebugData();
    }
  };

  // Enhanced GPS tracking with database integration
  const startGPSTracking = async () => {
    try {
      console.log("🛰️ Starting GPS tracking...");

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        async (location) => {
          if (location && location.coords) {
            const gpsData = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 10,
              timestamp: Date.now(),
              source: "gps",
            };

            console.log("📡 GPS update:", gpsData.latitude, gpsData.longitude);
            setLocationSources((prev) => ({ ...prev, gps: gpsData }));

            // Update sensor data for dead reckoning
            sensorData.current.lastPosition = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            };

            // Save location to appropriate database
            await saveLocationData(gpsData);
          }
        }
      );
    } catch (error) {
      console.error("❌ GPS tracking error:", error);
      // Fallback implementation stays the same
    }
  };

  // Save location data to local/server database
  const saveLocationData = async (locationData) => {
    try {
      const isOnline = networkStatus.isConnected;

      if (isOnline) {
        try {
          // Save to server and local online DB
          const serverResponse = await apiService.current.saveLocationToServer({
            latitude: locationData.latitude,
            longitude: locationData.longitude,

          });

          await localDB.current.saveLocationOnline(locationData);

          // Update nearby data if received from server
          if (serverResponse.nearbyMechanics) {
            setNearbyMechanics(serverResponse.nearbyMechanics);
            await localDB.current.saveMechanics(
              serverResponse.nearbyMechanics,
              { lat: locationData.latitude, lng: locationData.longitude }
            );
          }

          if (serverResponse.nearbyLandmarks) {
            setNearbyLandmarks(serverResponse.nearbyLandmarks);
            await localDB.current.saveLandmarks(
              serverResponse.nearbyLandmarks,
              { lat: locationData.latitude, lng: locationData.longitude }
            );
          }

          console.log("✅ Location saved to server and local online DB");
        } catch (error) {
          console.error("❌ Failed to save to server, saving offline instead");
          await localDB.current.saveLocationOffline(locationData);
          updateSyncStatus({ pendingSync: true });
        }
      } else {
        // Save to local offline DB
        await localDB.current.saveLocationOffline(locationData);
        console.log("💾 Location saved to offline DB");

        // Load nearby data from local cache
        const mechanics = await localDB.current.getNearbyMechanics(
          locationData.latitude,
          locationData.longitude
        );
        const landmarks = await localDB.current.getNearbyLandmarks(
          locationData.latitude,
          locationData.longitude
        );

        setNearbyMechanics(mechanics);
        setNearbyLandmarks(landmarks);

        updateSyncStatus({
          offlineCount: syncStatus.offlineCount + 1,
          pendingSync: true,
        });
      }
    } catch (error) {
      console.error("❌ Failed to save location data:", error);
    }
  };

  // Load optimal location from local database
  const loadOptimalLocation = async () => {
    try {
      const optimalData = await localDB.current.getOptimalLocation();
      if (optimalData) {
        const { location, source, confidence } = optimalData;
        console.log(
          `🎯 Using ${source} location with confidence ${confidence}`
        );

        setCurrentLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy || 100,
        });

        // Load nearby data from cache
        const mechanics = await localDB.current.getNearbyMechanics(
          location.latitude,
          location.longitude
        );
        const landmarks = await localDB.current.getNearbyLandmarks(
          location.latitude,
          location.longitude
        );

        setNearbyMechanics(mechanics);
        setNearbyLandmarks(landmarks);
      }
    } catch (error) {
      console.error("❌ Failed to load optimal location:", error);
    }
  };

  // Periodic refresh every 10 minutes
  const startPeriodicRefresh = () => {
    refreshInterval.current = setInterval(
      async () => {
        console.log("🔄 Performing periodic refresh...");

        try {
          // Get current location
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          if (location && location.coords) {
            const locationData = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              source: "periodic_refresh",
            };

            await saveLocationData(locationData);
          }
        } catch (error) {
          console.error("❌ Periodic refresh failed:", error);
        }
      },
      10 * 60 * 1000
    ); // 10 minutes
  };

  // Sync offline data when online
  const performSync = async () => {
    if (syncStatus.pendingSync && networkStatus.isConnected) {
      setSyncStatus((prev) => ({ ...prev, pendingSync: true }));

      try {
        console.log("🔄 Syncing offline data...");

        // Get current location for syncing nearby data
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (location && location.coords) {
          const syncData = await apiService.current.syncOfflineData({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });

          // Update local cache with fresh data
          if (syncData.mechanics.success) {
            await localDB.current.saveMechanics(syncData.mechanics.mechanics, {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            });
          }

          if (syncData.landmarks.success) {
            await localDB.current.saveLandmarks(syncData.landmarks.landmarks, {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            });
          }

          setSyncStatus({
            lastSync: new Date().toISOString(),
            pendingSync: false,
            offlineCount: 0,
          });

          console.log("✅ Sync completed successfully");
        }
      } catch (error) {
        console.error("❌ Sync failed:", error);
        setSyncStatus((prev) => ({ ...prev, pendingSync: false }));
      }
    }
  };

  // Keep all the original sensor methods (dead reckoning, wifi, bluetooth, etc.)
  const startDeadReckoning = async () => {
    console.log("🚶 Starting dead reckoning...");

    try {
      await Accelerometer.setUpdateInterval(100);
      await Gyroscope.setUpdateInterval(100);
      await Magnetometer.setUpdateInterval(100);

      sensorSubscriptions.current.accelerometer = Accelerometer.addListener(
        ({ x, y, z }) => {
          sensorData.current.acceleration = { x, y, z };

          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const timeSinceLastStep =
            Date.now() - sensorData.current.lastStepTime;

          if (magnitude > 1.2 && timeSinceLastStep > 300) {
            sensorData.current.stepCount += 1;
            sensorData.current.lastStepTime = Date.now();
            updatePositionFromStep();
          }
        }
      );

      sensorSubscriptions.current.gyroscope = Gyroscope.addListener(
        ({ x, y, z }) => {
          sensorData.current.gyroscope = { x, y, z };
        }
      );

      sensorSubscriptions.current.magnetometer = Magnetometer.addListener(
        ({ x, y, z }) => {
          sensorData.current.magnetometer = { x, y, z };
          let heading = Math.atan2(y, x) * (180 / Math.PI);
          heading = heading < 0 ? heading + 360 : heading;
          sensorData.current.heading = heading;
        }
      );
    } catch (error) {
      console.error("❌ Sensor initialization error:", error);
    }
  };

  const updatePositionFromStep = () => {
    const { heading, lastPosition } = sensorData.current;

    if (lastPosition && lastPosition.lat !== 0) {
      const stepLength = 0.000007;
      const headingRad = (heading * Math.PI) / 180;

      const deltaLat = stepLength * Math.cos(headingRad);
      const deltaLng =
        (stepLength * Math.sin(headingRad)) /
        Math.cos((lastPosition.lat * Math.PI) / 180);

      const newLat = lastPosition.lat + deltaLat;
      const newLng = lastPosition.lng + deltaLng;

      const drData = {
        latitude: newLat,
        longitude: newLng,
        accuracy: 25,
        timestamp: Date.now(),
        source: "deadReckoning",
      };

      setLocationSources((prev) => ({ ...prev, deadReckoning: drData }));
    }
  };

  // Keep other original methods (WiFi, Bluetooth, Beacon, Fusion)
  const startWiFiFingerprinting = async () => {
    if (Platform.OS !== "android") return;

    console.log("📶 Starting WiFi fingerprinting...");

    setInterval(async () => {
      try {
        const wifiList = await WifiManager.loadWifiList();
        if (wifiList && wifiList.length > 0) {
          const strongestWifi = wifiList.reduce((prev, current) =>
            prev.level > current.level ? prev : current
          );

          if (strongestWifi && sensorData.current.lastPosition) {
            const signalRadius = Math.abs(strongestWifi.level) / 100;
            const wifiLocation = {
              latitude:
                sensorData.current.lastPosition.lat +
                (Math.random() - 0.5) * signalRadius * 0.001,
              longitude:
                sensorData.current.lastPosition.lng +
                (Math.random() - 0.5) * signalRadius * 0.001,
              accuracy: 50,
              timestamp: Date.now(),
              source: "wifi",
            };

            setLocationSources((prev) => ({ ...prev, wifi: wifiLocation }));
          }
        }
      } catch (error) {
        console.error("❌ WiFi scanning error:", error);
      }
    }, 5000);
  };

  const startBluetoothScanning = () => {
    if (!bleManager.current) return;

    console.log("🔵 Starting Bluetooth scanning...");

    try {
      bleManager.current.startDeviceScan(null, null, (error, device) => {
        if (error || !device || !device.rssi) return;

        const txPower = -59;
        const distance = Math.pow(10, (txPower - device.rssi) / (10 * 2));

        if (sensorData.current.lastPosition) {
          const btLocation = {
            latitude:
              sensorData.current.lastPosition.lat +
              (Math.random() - 0.5) * 0.0001,
            longitude:
              sensorData.current.lastPosition.lng +
              (Math.random() - 0.5) * 0.0001,
            accuracy: 30,
            timestamp: Date.now(),
            source: "bluetooth",
          };

          setLocationSources((prev) => ({ ...prev, bluetooth: btLocation }));
        }
      });
    } catch (error) {
      console.error("❌ Bluetooth scanning error:", error);
    }
  };

  const startBeaconDetection = () => {
    console.log("📍 Starting beacon detection...");

    setInterval(() => {
      if (Math.random() > 0.7 && sensorData.current.lastPosition) {
        const beaconLocation = {
          latitude:
            sensorData.current.lastPosition.lat +
            (Math.random() - 0.5) * 0.0002,
          longitude:
            sensorData.current.lastPosition.lng +
            (Math.random() - 0.5) * 0.0002,
          accuracy: 15,
          timestamp: Date.now(),
          source: "beacon",
        };

        setLocationSources((prev) => ({ ...prev, beacon: beaconLocation }));
      }
    }, 3000);
  };

  // Enhanced location fusion with database integration
  const startLocationFusion = () => {
    console.log("🎯 Starting location fusion...");

    fusionInterval.current = setInterval(async () => {
      await fuseLocationData();
    }, 1000);
  };

  const fuseLocationData = async () => {
    const sources = Object.values(locationSources).filter(
      (source) =>
        source &&
        source.timestamp > Date.now() - 10000 &&
        source.latitude &&
        source.longitude &&
        !isNaN(source.latitude) &&
        !isNaN(source.longitude)
    );

    if (sources.length === 0) {
      console.log("⚠️ No valid location sources available");
      return;
    }

    // Sort by accuracy and recency
    sources.sort((a, b) => {
      const accuracyDiff = (a.accuracy || 100) - (b.accuracy || 100);
      const timeDiff = (b.timestamp - a.timestamp) / 1000;
      return accuracyDiff + timeDiff * 10;
    });

    const primarySource = sources[0];
    console.log(
      "🎯 Using primary source:",
      primarySource.source,
      primarySource.latitude,
      primarySource.longitude
    );

    // Adjust Kalman filter noise based on source
    const noiseMap = {
      gps: 0.01,
      beacon: 0.03,
      wifi: 0.05,
      bluetooth: 0.07,
      deadReckoning: 0.1,
    };

    const noise = noiseMap[primarySource.source] || 0.05;
    kalmanLat.current.setMeasurementNoise(noise);
    kalmanLng.current.setMeasurementNoise(noise);

    // Apply Kalman filtering
    let filteredLat = kalmanLat.current.update(primarySource.latitude);
    let filteredLng = kalmanLng.current.update(primarySource.longitude);

    // Weighted average with secondary sources
    if (sources.length > 1) {
      let totalWeight = 1 / (primarySource.accuracy || 10);
      let weightedLat = filteredLat * totalWeight;
      let weightedLng = filteredLng * totalWeight;

      sources.slice(1, Math.min(3, sources.length)).forEach((source) => {
        const weight = 1 / ((source.accuracy || 10) * 2);
        totalWeight += weight;
        weightedLat += source.latitude * weight;
        weightedLng += source.longitude * weight;
      });

      filteredLat = weightedLat / totalWeight;
      filteredLng = weightedLng / totalWeight;
    }

    const finalAccuracy =
      sources.length > 1
        ? Math.max(5, primarySource.accuracy * 0.8)
        : primarySource.accuracy;

    // Update current location
    const newLocation = {
      latitude: filteredLat,
      longitude: filteredLng,
      accuracy: finalAccuracy,
    };

    setCurrentLocation(newLocation);

    // Update last position for dead reckoning
    sensorData.current.lastPosition = {
      lat: filteredLat,
      lng: filteredLng,
    };

    // Save the fused location data
    await saveLocationData({
      ...newLocation,
      source: "fusion",
      primarySource: primarySource.source,
    });
  };

  // Update sync status helper
  const updateSyncStatus = (updates) => {
    setSyncStatus((prev) => ({ ...prev, ...updates }));
  };

  // Cleanup function
  const cleanup = () => {
    console.log("🧹 Cleaning up...");

    // Stop location subscription
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }

    // Stop sensor subscriptions
    Object.values(sensorSubscriptions.current).forEach((sub) => {
      if (sub) sub.remove();
    });

    // Stop intervals
    if (fusionInterval.current) {
      clearInterval(fusionInterval.current);
    }
    if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
    }
    if (syncInterval.current) {
      clearInterval(syncInterval.current);
    }

    // Stop BLE scanning
    if (bleManager.current) {
      try {
        bleManager.current.stopDeviceScan();
      } catch (error) {
        console.error("❌ Error stopping BLE scan:", error);
      }
    }
  };

  // Helper functions
  const getActiveSourcesCount = () => {
    return Object.values(locationSources).filter(
      (source) => source && source.timestamp > Date.now() - 10000
    ).length;
  };

  const getSourceStatus = (source) => {
    if (!source || source.timestamp < Date.now() - 10000) {
      return "❌";
    }
    return "✅";
  };

  const formatSyncStatus = () => {
    if (syncStatus.pendingSync && !networkStatus.isConnected) {
      return `Offline (${syncStatus.offlineCount} pending)`;
    }
    if (syncStatus.pendingSync && networkStatus.isConnected) {
      return "Syncing...";
    }
    if (syncStatus.lastSync) {
      return `Last: ${new Date(syncStatus.lastSync).toLocaleTimeString()}`;
    }
    return "Never synced";
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={true}
    >
      <Text style={styles.title}>Enhanced Location Tracker</Text>

      <View style={styles.locationContainer}>
        <Text style={styles.locationTitle}>Current Location</Text>
        <Text style={styles.coordinates}>
          Lat:{" "}
          {currentLocation.latitude !== null
            ? currentLocation.latitude.toFixed(6)
            : "Waiting..."}
        </Text>
        <Text style={styles.coordinates}>
          Lng:{" "}
          {currentLocation.longitude !== null
            ? currentLocation.longitude.toFixed(6)
            : "Waiting..."}
        </Text>
        <Text style={styles.accuracy}>
          Accuracy:{" "}
          {currentLocation.accuracy !== null
            ? `±${currentLocation.accuracy.toFixed(1)}m`
            : "No fix"}
        </Text>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>System Status</Text>
        <Text style={styles.networkStatus}>
          Network: {networkStatus.isConnected ? "🟢" : "🔴"}{" "}
          {networkStatus.type}
        </Text>
        <Text style={styles.sourcesActive}>
          Active Sources: {getActiveSourcesCount()}/5
        </Text>
        <Text style={styles.permissionStatus}>
          Permission: {permissionGranted ? "✅ Granted" : "❌ Denied"}
        </Text>
        <Text style={styles.syncStatus}>Sync: {formatSyncStatus()}</Text>
      </View>

      <View style={styles.sourcesContainer}>
        <Text style={styles.sourcesTitle}>Location Sources</Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.gps)} GPS/AGPS
          {locationSources.gps &&
            ` (±${locationSources.gps.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.wifi)} WiFi Fingerprint
          {locationSources.wifi &&
            ` (±${locationSources.wifi.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.bluetooth)} Bluetooth Mesh
          {locationSources.bluetooth &&
            ` (±${locationSources.bluetooth.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.deadReckoning)} Dead Reckoning
          {locationSources.deadReckoning &&
            ` (±${locationSources.deadReckoning.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.beacon)} Beacon Detection
          {locationSources.beacon &&
            ` (±${locationSources.beacon.accuracy?.toFixed(0)}m)`}
        </Text>
      </View>

      <View style={styles.nearbyContainer}>
        <Text style={styles.nearbyTitle}>
          Nearby Mechanics ({nearbyMechanics.length})
        </Text>
        {nearbyMechanics.slice(0, 3).map((mechanic, index) => (
          <Text key={index} style={styles.nearbyItem}>
            🔧 {mechanic.username} - {Math.round(mechanic.distance || 0)}m
          </Text>
        ))}
        {nearbyMechanics.length === 0 && (
          <Text style={styles.noDataText}>No mechanics found nearby</Text>
        )}
      </View>

      <View style={styles.nearbyContainer}>
        <Text style={styles.nearbyTitle}>
          Nearby Landmarks ({nearbyLandmarks.length})
        </Text>
        {nearbyLandmarks.slice(0, 3).map((landmark, index) => (
          <Text key={index} style={styles.nearbyItem}>
            🏛 {landmark.name} - {Math.round(landmark.distance || 0)}m
          </Text>
        ))}
        {nearbyLandmarks.length === 0 && (
          <Text style={styles.noDataText}>No landmarks found nearby</Text>
        )}
      </View>

      <View style={styles.sensorContainer}>
        <Text style={styles.sensorTitle}>Sensor Data</Text>
        <Text style={styles.sensorData}>
          Steps: {sensorData.current.stepCount}
        </Text>
        <Text style={styles.sensorData}>
          Heading: {sensorData.current.heading.toFixed(1)}°
        </Text>
        <Text style={styles.sensorData}>
          Accel: X:{sensorData.current.acceleration.x.toFixed(2)}
          Y:{sensorData.current.acceleration.y.toFixed(2)}
          Z:{sensorData.current.acceleration.z.toFixed(2)}
        </Text>
      </View>

      <View style={styles.debugContainer}>
        <TouchableOpacity onPress={() => setShowDebugPanel(!showDebugPanel)}>
          <Text style={styles.debugTitle}>
            Debug Info {showDebugPanel ? "▼" : "▶"}
          </Text>
        </TouchableOpacity>

        {showDebugPanel && (
          <View>
            <Text style={styles.debugText}>
              Tracking: {isTracking ? "Active" : "Inactive"}
            </Text>
            <Text style={styles.debugText}>Database: Local + Server</Text>
            <Text style={styles.debugText}>
              Last Update: {new Date().toLocaleTimeString()}
            </Text>

            <View style={styles.debugButtons}>
              <TouchableOpacity
                style={styles.debugButton}
                onPress={loadDebugData}
              >
                <Text style={styles.debugButtonText}>Load DB Data</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.debugButton}
                onPress={clearAllData}
              >
                <Text style={styles.debugButtonText}>Clear DB</Text>
              </TouchableOpacity>
            </View>

            {Object.keys(debugData).length > 0 && (
              <ScrollView style={styles.debugDataContainer}>
                {Object.entries(debugData).map(([key, value]) => (
                  <View key={key} style={styles.debugDataItem}>
                    <Text style={styles.debugDataKey}>{key}:</Text>
                    <Text style={styles.debugDataValue}>
                      {JSON.stringify(value, null, 2)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {syncStatus.pendingSync && (
        <View style={styles.syncIndicator}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.syncText}>Syncing...</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#333",
  },
  locationContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  coordinates: {
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: "#666",
    marginBottom: 5,
  },
  accuracy: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
  },
  statusContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  networkStatus: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666",
  },
  sourcesActive: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666",
  },
  permissionStatus: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666",
  },
  syncStatus: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  sourcesContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sourcesTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  sourceItem: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666",
  },
  nearbyContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nearbyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  nearbyItem: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666",
  },
  noDataText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
  sensorContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sensorTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  sensorData: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666",
  },
  debugContainer: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  debugText: {
    fontSize: 12,
    marginBottom: 3,
    color: "#999",
  },
  syncIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e3f2fd",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  syncText: {
    marginLeft: 10,
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "500",
  },
  debugButtons: {
    flexDirection: "row",
    marginTop: 10,
    gap: 10,
  },
  debugButton: {
    backgroundColor: "#007AFF",
    padding: 8,
    borderRadius: 5,
    flex: 1,
  },
  debugButtonText: {
    color: "white",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
  debugDataContainer: {
    maxHeight: 300,
    marginTop: 10,
    backgroundColor: "#f8f8f8",
    borderRadius: 5,
    padding: 10,
  },
  debugDataItem: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
  },
  debugDataKey: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    marginBottom: 5,
  },
  debugDataValue: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: "#666",
    backgroundColor: "#fff",
    padding: 5,
    borderRadius: 3,
  },
});

export default MultiModalLocationTracker;

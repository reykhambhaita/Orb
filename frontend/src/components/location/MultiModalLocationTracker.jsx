import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
import * as SQLite from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, // Add this
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
import authService from "../../screens/authService";

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
    if (!this.initialized) return measurement;
    this.position += this.velocity * dt;
    this.positionError += this.velocityError * dt * dt + this.processNoise;
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

const RAJKOT_COORDS = { lat: 23.0225, lng: 70.77 };
const STEP_THRESHOLD = 1.2;
const STEP_DEBOUNCE_MS = 300;
const STEP_LENGTH_DEGREES = 0.000007;
const SOURCE_TIMEOUT_MS = 10000;
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const NOISE_MAP = {
  gps: 0.01,
  beacon: 0.03,
  wifi: 0.05,
  bluetooth: 0.07,
  deadReckoning: 0.1,
};

const MultiModalLocationTracker = ({ onLocationUpdate }) => {
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
  const [isTracking, setIsTracking] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [connectionTest, setConnectionTest] = useState(null);
  const [user, setUser] = useState(null);
  const [initStatus, setInitStatus] = useState('Initializing...');
  const kalmanLat = useRef(new KalmanFilter(0.001, 0.01, RAJKOT_COORDS.lat));
  const kalmanLng = useRef(new KalmanFilter(0.001, 0.01, RAJKOT_COORDS.lng));
  const bleManager = useRef(null);
  const db = useRef(null);
  const syncTimer = useRef(null);
  const netInfoUnsubscribe = useRef(null);

  const sensorData = useRef({
    acceleration: { x: 0, y: 0, z: 0 },
    gyroscope: { x: 0, y: 0, z: 0 },
    magnetometer: { x: 0, y: 0, z: 0 },
    stepCount: 0,
    heading: 0,
    lastPosition: RAJKOT_COORDS,
    lastStepTime: Date.now(),
  });

  const bluetoothBeacons = useRef(new Map());
  const subscriptions = useRef({
    location: null,
    accelerometer: null,
    gyroscope: null,
    magnetometer: null,
    fusion: null,
    deadReckoning: null,
  });

  // ---------- Token Management with authService ----------
  const getToken = async () => {
    try {
      return await authService.getToken();
    } catch (error) {
      console.error("Error getting token:", error);
      return null;
    }
  };

  // ---------- sqlite promise wrappers ----------
  const openDatabase = () => {
    return SQLite.openDatabase("locationtracker.db");
  };

  const execSqlAsync = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      if (!db.current) return resolve(null);
      db.current.transaction(
        (tx) => {
          tx.executeSql(
            sql,
            params,
            (_, result) => resolve(result),
            (_, err) => {
              reject(err);
              return false;
            }
          );
        },
        (txErr) => reject(txErr)
      );
    });
  };

  const testBackendConnection = async () => {
    try {
      setConnectionTest('Testing...');

      // Check if authenticated
      const isAuth = await authService.isAuthenticated();
      if (!isAuth) {
        setConnectionTest('Error: Not authenticated');
        return;
      }

      // Test authenticated request
      const result = await authService.authenticatedRequest(
        '/api/user/location',
        {
          method: 'POST',
          body: JSON.stringify({
            location: {
              latitude: 23.0225,
              longitude: 70.77,
              accuracy: 10,
              timestamp: Date.now()
            },
            landmarks: [],
          }),
        }
      );

      setConnectionTest(
        result.success
          ? 'Success - Connected & Authenticated!'
          : `Error: ${result.error}`
      );
    } catch (error) {
      setConnectionTest(`Error: ${error.message}`);
    }
  };




  // ---------- DB helpers ----------
  const initializeDatabase = async () => {
    try {
      db.current = openDatabase();
      await execSqlAsync(`CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        timestamp INTEGER NOT NULL,
        synced INTEGER DEFAULT 0,
        sources TEXT
      );`);
      await execSqlAsync(
        "CREATE INDEX IF NOT EXISTS idx_synced ON locations(synced);"
      );
      await updateUnsyncedCount();
    } catch (error) {
      console.error("Database initialization error:", error);
    }
  };

  const saveLocationLocally = async (location) => {
    if (!db.current || !location) return;
    try {
      const sources = JSON.stringify(locationSources || {});
      const ts = Date.now();
      await execSqlAsync(
        "INSERT INTO locations (latitude, longitude, accuracy, timestamp, synced, sources) VALUES (?, ?, ?, ?, 0, ?);",
        [
          location.latitude,
          location.longitude,
          location.accuracy || null,
          ts,
          sources,
        ]
      );
      await updateUnsyncedCount();
    } catch (error) {
      console.error("Error saving location locally:", error);
    }
  };

  const updateUnsyncedCount = async () => {
    if (!db.current) return;
    try {
      const res = await execSqlAsync(
        "SELECT COUNT(*) as c FROM locations WHERE synced = 0;"
      );
      const count = res?.rows?.item
        ? res.rows.item(0).c
        : res?.rows?._array?.length || 0;
      setUnsyncedCount(count || 0);
    } catch (error) {
      console.error("Error counting unsynced rows:", error);
    }
  };

  const fetchUnsyncedBatch = async (limit = 50) => {
    const res = await execSqlAsync(
      "SELECT * FROM locations WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?;",
      [limit]
    );
    return res?.rows?._array || [];
  };

  const markRowsSynced = async (ids = []) => {
    if (!ids.length) return;
    const placeholders = ids.map(() => "?").join(",");
    await execSqlAsync(
      `UPDATE locations SET synced = 1 WHERE id IN (${placeholders});`,
      ids
    );
    await updateUnsyncedCount();
  };

  // ---------- sync logic with authenticated requests ----------
  const syncWithBackend = async () => {
    if (!db.current || !networkStatus.isConnected) return;

    try {
      const token = await getToken();
      if (!token) {
        console.log('No auth token, skipping sync');
        return;
      }

      const rows = await fetchUnsyncedBatch(50);
      if (!rows.length) return;

      const syncedIds = [];
      for (let r of rows) {
        try {
          const body = {
            location: {
              latitude: r.latitude,
              longitude: r.longitude,
              accuracy: r.accuracy,
              timestamp: r.timestamp,
            },
            landmarks: [],
          };

          // Use authService for authenticated request
          const result = await authService.authenticatedRequest(
            '/api/user/location',
            {
              method: 'POST',
              body: JSON.stringify(body),
            }
          );

          if (result.success) {
            syncedIds.push(r.id);
          }
        } catch (e) {
          console.warn('Failed to sync row', r.id, e);
        }
      }

      if (syncedIds.length) await markRowsSynced(syncedIds);
    } catch (error) {
      console.error('syncWithBackend error:', error);
    }
  };

  const startSyncTimer = () => {
    if (syncTimer.current) return;
    syncTimer.current = setInterval(() => {
      if (networkStatus.isConnected) syncWithBackend();
    }, SYNC_INTERVAL_MS);
  };

  const stopSyncTimer = () => {
    if (syncTimer.current) {
      clearInterval(syncTimer.current);
      syncTimer.current = null;
    }
  };

  // ---------- Load user on mount ----------
  useEffect(() => {
    const loadUser = async () => {
      const userData = await authService.getUser();
      setUser(userData);
    };
    loadUser();
  }, []);

  // ---------- lifecycle ----------
  useEffect(() => {
    initializeDatabase();
    initializeLocationTracking();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- location initialization & tracking ----------
  const initializeLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required");
        return;
      }
      setPermissionGranted(true);
      setInitStatus('Getting initial GPS fix...');
      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (initialLocation?.coords) {
          const { latitude, longitude, accuracy } = initialLocation.coords;
          kalmanLat.current.reset(latitude);
          kalmanLng.current.reset(longitude);
          sensorData.current.lastPosition = { lat: latitude, lng: longitude };
          setCurrentLocation({
            latitude,
            longitude,
            accuracy: accuracy || 100,
          });

          setInitStatus('Location ready.');


          if (onLocationUpdate) {
            onLocationUpdate({
              latitude,
              longitude,
              accuracy: accuracy || 100,
            });
          }




        }
      } catch (e) {
        console.log("No initial GPS:", e);
        setInitStatus('No GPS fix yet, using defaults.');
      }

      netInfoUnsubscribe.current = NetInfo.addEventListener((state) => {
        const previouslyDisconnected = !networkStatus.isConnected;
        const nowOnline = !!state.isConnected;
        setNetworkStatus({
          isConnected: nowOnline,
          type: state.type || "none",
        });
        if (previouslyDisconnected && nowOnline) {
          syncWithBackend();
        }
      });

      try {
        bleManager.current = new BleManager();
        await bleManager.current.state();
      } catch (error) {
        console.error("BLE init error:", error);
      }

      setIsTracking(true);
      startGPSTracking();
      startDeadReckoning();
      if (Platform.OS === "android") startWiFiFingerprinting();
      startBluetoothScanning();
      startBeaconDetection();
      startLocationFusion();
      startSyncTimer();
    } catch (err) {
      console.error("init error:", err);
      Alert.alert("Error", "Failed to initialize location tracking");
    }
  };

  const startGPSTracking = async () => {
    try {
      subscriptions.current.location = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (location) => {
          if (location?.coords) {
            const gpsData = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 10,
              timestamp: Date.now(),
              source: "gps",
            };
            setLocationSources((prev) => ({ ...prev, gps: gpsData }));
            sensorData.current.lastPosition = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            };
          }
        }
      );
    } catch (e) {
      console.warn("gps tracking failed, fallback", e);
      try {
        subscriptions.current.location = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          (location) => {
            if (location?.coords) {
              setLocationSources((prev) => ({
                ...prev,
                gps: {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  accuracy: (location.coords.accuracy || 50) * 1.5,
                  timestamp: Date.now(),
                  source: "gps",
                },
              }));
            }
          }
        );
      } catch (err) {
        console.error("gps fallback failed", err);
      }
    }
  };

  const startDeadReckoning = async () => {
    try {
      await Accelerometer.setUpdateInterval(100);
      await Gyroscope.setUpdateInterval(100);
      await Magnetometer.setUpdateInterval(100);

      subscriptions.current.accelerometer = Accelerometer.addListener(
        ({ x, y, z }) => {
          sensorData.current.acceleration = { x, y, z };
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          const timeSinceLastStep =
            Date.now() - sensorData.current.lastStepTime;
          if (
            magnitude > STEP_THRESHOLD &&
            timeSinceLastStep > STEP_DEBOUNCE_MS
          ) {
            sensorData.current.stepCount++;
            sensorData.current.lastStepTime = Date.now();
            updatePositionFromStep();
          }
        }
      );

      subscriptions.current.gyroscope = Gyroscope.addListener(({ x, y, z }) => {
        sensorData.current.gyroscope = { x, y, z };
      });

      subscriptions.current.magnetometer = Magnetometer.addListener(
        ({ x, y, z }) => {
          sensorData.current.magnetometer = { x, y, z };
          let heading = Math.atan2(y, x) * (180 / Math.PI);
          sensorData.current.heading = heading < 0 ? heading + 360 : heading;
        }
      );

      subscriptions.current.deadReckoning = setInterval(
        updatePositionFromStep,
        2000
      );
    } catch (error) {
      console.error("sensor init error:", error);
    }
  };

  const updatePositionFromStep = () => {
    const { heading, lastPosition } = sensorData.current;
    if (lastPosition?.lat !== 0) {
      const headingRad = (heading * Math.PI) / 180;
      const deltaLat = STEP_LENGTH_DEGREES * Math.cos(headingRad);
      const deltaLng =
        (STEP_LENGTH_DEGREES * Math.sin(headingRad)) /
        Math.cos((lastPosition.lat * Math.PI) / 180);
      setLocationSources((prev) => ({
        ...prev,
        deadReckoning: {
          latitude: lastPosition.lat + deltaLat,
          longitude: lastPosition.lng + deltaLng,
          accuracy: 25,
          timestamp: Date.now(),
          source: "deadReckoning",
        },
      }));
    }
  };

  const startWiFiFingerprinting = async () => {
    setInterval(async () => {
      try {
        const wifiList = await WifiManager.loadWifiList();
        if (!wifiList?.length) return;
        const strongest = wifiList.reduce((p, c) =>
          p.level > c.level ? p : c
        );
        if (strongest && sensorData.current.lastPosition) {
          const signalRadius = Math.abs(strongest.level) / 100;
          setLocationSources((prev) => ({
            ...prev,
            wifi: {
              latitude:
                sensorData.current.lastPosition.lat +
                (Math.random() - 0.5) * signalRadius * 0.001,
              longitude:
                sensorData.current.lastPosition.lng +
                (Math.random() - 0.5) * signalRadius * 0.001,
              accuracy: 50,
              timestamp: Date.now(),
              source: "wifi",
            },
          }));
        }
      } catch (e) {
        console.error("wifi fingerprint error:", e);
      }
    }, 5000);
  };

  const startBluetoothScanning = () => {
    if (!bleManager.current) return;
    try {
      bleManager.current.startDeviceScan(null, null, (error, device) => {
        if (error || !device?.rssi) return;
        const txPower = -59;
        const distance = Math.pow(10, (txPower - device.rssi) / 20);
        bluetoothBeacons.current.set(device.id, {
          id: device.id,
          name: device.name,
          rssi: device.rssi,
          distance,
          timestamp: Date.now(),
        });
        if (
          bluetoothBeacons.current.size >= 2 &&
          sensorData.current.lastPosition
        ) {
          setLocationSources((prev) => ({
            ...prev,
            bluetooth: {
              latitude:
                sensorData.current.lastPosition.lat +
                (Math.random() - 0.5) * 0.0001,
              longitude:
                sensorData.current.lastPosition.lng +
                (Math.random() - 0.5) * 0.0001,
              accuracy: 30,
              timestamp: Date.now(),
              source: "bluetooth",
            },
          }));
        }
      });
    } catch (err) {
      console.error("ble scan error:", err);
    }
  };

  const startBeaconDetection = () => {
    setInterval(() => {
      if (Math.random() > 0.7 && sensorData.current.lastPosition) {
        setLocationSources((prev) => ({
          ...prev,
          beacon: {
            latitude:
              sensorData.current.lastPosition.lat +
              (Math.random() - 0.5) * 0.0002,
            longitude:
              sensorData.current.lastPosition.lng +
              (Math.random() - 0.5) * 0.0002,
            accuracy: 15,
            timestamp: Date.now(),
            source: "beacon",
          },
        }));
      }
    }, 3000);
  };

  const startLocationFusion = () => {
    subscriptions.current.fusion = setInterval(fuseLocationData, 1000);
  };


  const fuseLocationData = () => {
    const sources = Object.values(locationSources).filter(
      (source) =>
        source?.timestamp > Date.now() - SOURCE_TIMEOUT_MS &&
        source.latitude &&
        source.longitude &&
        !isNaN(source.latitude) &&
        !isNaN(source.longitude)
    );
    if (sources.length === 0) return;

    sources.sort((a, b) => {
      const accuracyDiff = (a.accuracy || 100) - (b.accuracy || 100);
      const timeDiff = (b.timestamp - a.timestamp) / 1000;
      return accuracyDiff + timeDiff * 10;
    });

    const primarySource = sources[0];
    const noise = NOISE_MAP[primarySource.source] || 0.05;
    kalmanLat.current.setMeasurementNoise(noise);
    kalmanLng.current.setMeasurementNoise(noise);

    let filteredLat = kalmanLat.current.update(primarySource.latitude);
    let filteredLng = kalmanLng.current.update(primarySource.longitude);

    if (sources.length > 1) {
      let totalWeight = 1 / (primarySource.accuracy || 10);
      let weightedLat = filteredLat * totalWeight;
      let weightedLng = filteredLng * totalWeight;

      sources.slice(1, 3).forEach((source) => {
        const weight = 1 / ((source.accuracy || 10) * 2);
        totalWeight += weight;
        weightedLat += source.latitude * weight;
        weightedLng += source.longitude * weight;
      });

      filteredLat = weightedLat / totalWeight;
      filteredLng = weightedLng / totalWeight;
    }

    const fusedLocation = {
      latitude: filteredLat,
      longitude: filteredLng,
      accuracy:
        sources.length > 1
          ? Math.max(5, primarySource.accuracy * 0.8)
          : primarySource.accuracy,
    };

    setCurrentLocation(fusedLocation);
    sensorData.current.lastPosition = { lat: filteredLat, lng: filteredLng };
    saveLocationLocally(fusedLocation);

    // NEW: Pass location to parent component
    if (onLocationUpdate) {
      onLocationUpdate(fusedLocation);
    }
  };

  const cleanup = () => {
    subscriptions.current.location?.remove?.();
    subscriptions.current.accelerometer?.remove?.();
    subscriptions.current.gyroscope?.remove?.();
    subscriptions.current.magnetometer?.remove?.();
    if (netInfoUnsubscribe.current) netInfoUnsubscribe.current();
    if (subscriptions.current.fusion)
      clearInterval(subscriptions.current.fusion);
    if (subscriptions.current.deadReckoning)
      clearInterval(subscriptions.current.deadReckoning);
    stopSyncTimer();
    try {
      bleManager.current?.stopDeviceScan();
    } catch (e) {
      /* ignore */
    }
  };

  const getActiveSourcesCount = () =>
    Object.values(locationSources).filter(
      (s) => s?.timestamp > Date.now() - SOURCE_TIMEOUT_MS
    ).length;

  const getSourceStatus = (source) =>
    source?.timestamp > Date.now() - SOURCE_TIMEOUT_MS ? "✓" : "✗";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >


      {(!currentLocation?.latitude || !currentLocation?.longitude) && (
        <View style={[styles.card, styles.statusCard]}>
          <Text style={styles.statusTitle}>📍 {initStatus}</Text>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      )}
      <Text style={styles.title}>Multi-Modal Location Tracker</Text>

      {/* User Info Card */}
      {user && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 User</Text>
          <Text style={styles.statusText}>
            Username: {user.username}
          </Text>
          <Text style={styles.statusText}>
            Email: {user.email}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📍 Current Location</Text>
        <Text style={styles.coordinates}>
          Lat: {currentLocation.latitude?.toFixed(6) ?? "Waiting..."}
        </Text>
        <Text style={styles.coordinates}>
          Lng: {currentLocation.longitude?.toFixed(6) ?? "Waiting..."}
        </Text>
        <Text style={styles.accuracy}>
          🎯 Accuracy:{" "}
          {currentLocation.accuracy
            ? `±${currentLocation.accuracy.toFixed(1)}m`
            : "No fix"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📶 Tracking Status</Text>
        <Text style={styles.statusText}>
          📡 Network: {networkStatus.isConnected ? "🟢 Online" : "🔴 Offline"}{" "}
          ({networkStatus.type})
        </Text>
        <Text style={styles.statusText}>
          🔌 Active Sources: {getActiveSourcesCount()}/5
        </Text>
        <Text style={styles.statusText}>
          📍 Permission: {permissionGranted ? "🟢 Granted" : "🔴 Denied"}
        </Text>
        <Text style={styles.statusText}>
          💾 Unsynced: {unsyncedCount} records
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧭 Location Sources</Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.gps)} GPS/AGPS{" "}
          {locationSources.gps &&
            ` (±${locationSources.gps.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.wifi)} WiFi Fingerprint{" "}
          {locationSources.wifi &&
            ` (±${locationSources.wifi.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.bluetooth)} Bluetooth Mesh{" "}
          {locationSources.bluetooth &&
            ` (±${locationSources.bluetooth.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.deadReckoning)} Dead Reckoning{" "}
          {locationSources.deadReckoning &&
            ` (±${locationSources.deadReckoning.accuracy?.toFixed(0)}m)`}
        </Text>
        <Text style={styles.sourceItem}>
          {getSourceStatus(locationSources.beacon)} Beacon Detection{" "}
          {locationSources.beacon &&
            ` (±${locationSources.beacon.accuracy?.toFixed(0)}m)`}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Sensor Data</Text>
        <Text style={styles.sensorText}>
          👣 Steps: {sensorData.current.stepCount}
        </Text>
        <Text style={styles.sensorText}>
          🧭 Heading: {sensorData.current.heading.toFixed(1)}°
        </Text>
        <Text style={styles.sensorText}>
          📈 Accel: X:{sensorData.current.acceleration.x.toFixed(2)} Y:
          {sensorData.current.acceleration.y.toFixed(2)} Z:
          {sensorData.current.acceleration.z.toFixed(2)}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🧪 Debug Info</Text>
        <Text style={styles.debugText}>
          ⚡ Tracking: {isTracking ? "✓ Active" : "✗ Inactive"}
        </Text>
        <Text style={styles.debugText}>
          ⏰ Last Update: {new Date().toLocaleTimeString()}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔗 Backend Connection Test</Text>
        <TouchableOpacity
          style={styles.testButton}
          onPress={testBackendConnection}
        >
          <Text style={styles.testButtonText}>
            🚀 Test Authenticated Connection
          </Text>
        </TouchableOpacity>
        {connectionTest && (
          <Text style={styles.debugText}>{connectionTest}</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  contentContainer: {
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
  card: {
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
  cardTitle: {
    fontSize: 16,
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
    fontStyle: "italic"
  },
  statusText: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666"
  },
  sourceItem: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666"
  },
  sensorText: {
    fontSize: 14,
    marginBottom: 5,
    color: "#666"
  },
  debugText: {
    fontSize: 12,
    marginBottom: 3,
    color: "#999"
  },
  testButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  testButtonText: {
    color: "white",
    fontWeight: "600",
  },
});

export default MultiModalLocationTracker;
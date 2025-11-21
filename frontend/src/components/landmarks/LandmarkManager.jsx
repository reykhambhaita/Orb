// src/components/landmarks/LandmarkManager.jsx
import NetInfo from "@react-native-community/netinfo";
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import authService from '../../screens/authService';

const CATEGORIES = [
  { value: 'restaurant', label: '🍽️ Restaurant', emoji: '🍽️' },
  { value: 'gas_station', label: '⛽ Gas Station', emoji: '⛽' },
  { value: 'hospital', label: '🏥 Hospital', emoji: '🏥' },
  { value: 'parking', label: '🅿️ Parking', emoji: '🅿️' },
  { value: 'landmark', label: '🗿 Landmark', emoji: '🗿' },
  { value: 'shop', label: '🛒 Shop', emoji: '🛒' },
  { value: 'other', label: '📍 Other', emoji: '📍' },
];

const LandmarkManager = ({ currentLocation, onLandmarksUpdate }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [nearbyLandmarks, setNearbyLandmarks] = useState([]);

  // FIX: Use the synchronous API properly
  const [db, setDb] = useState(null);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const initDb = async () => {
      try {
        const database = await SQLite.openDatabaseAsync('locationtracker.db');

        // CREATE TABLE IF NOT EXISTS - this fixes the error
        await database.execAsync(`
        CREATE TABLE IF NOT EXISTS landmarks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          category TEXT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          timestamp INTEGER NOT NULL,
          synced INTEGER DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_landmarks_location ON landmarks(latitude, longitude);
      `);

        setDb(database);
      } catch (error) {
        console.error('Failed to open database:', error);
      }
    };
    initDb();
  }, []);


  // Get current user ID
  useEffect(() => {
    const loadUser = async () => {
      const user = await authService.getUser();
      if (user?.id) {
        setCurrentUserId(user.id);
      }
    };
    loadUser();
  }, []);

  // Auto-load landmarks
  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude && db) {
      loadLandmarks();
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, db]);

  const loadLandmarks = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude || !db) return;

    setLoading(true);

    try {
      // First, load from cache
      const cached = await getCachedLandmarks(
        currentLocation.latitude,
        currentLocation.longitude
      );

      if (cached.length > 0) {
        setNearbyLandmarks(cached);
        if (onLandmarksUpdate) {
          onLandmarksUpdate(cached);
        }
      }

      // Then try to fetch from backend if online
      if (isOnline) {
        const result = await authService.getNearbyLandmarks(
          currentLocation.latitude,
          currentLocation.longitude,
          10000
        );

        if (result.success && result.data) {
          await cacheLandmarks(result.data);
          setNearbyLandmarks(result.data);
          if (onLandmarksUpdate) {
            onLandmarksUpdate(result.data);
          }
        }
      }
    } catch (error) {
      console.error('Load landmarks error:', error);
      // Use cached data on error
      const cached = await getCachedLandmarks(
        currentLocation.latitude,
        currentLocation.longitude
      );
      setNearbyLandmarks(cached);
      if (onLandmarksUpdate) {
        onLandmarksUpdate(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  const getCachedLandmarks = async (latitude, longitude) => {
    if (!db) return [];

    try {
      const latDelta = 10 / 111.32;
      const lngDelta = 10 / (111.32 * Math.cos(latitude * Math.PI / 180));

      const result = await db.getAllAsync(
        `SELECT * FROM landmarks
         WHERE latitude BETWEEN ? AND ?
         AND longitude BETWEEN ? AND ?
         ORDER BY timestamp DESC;`,
        [
          latitude - latDelta,
          latitude + latDelta,
          longitude - lngDelta,
          longitude + lngDelta
        ]
      );

      return result || [];
    } catch (error) {
      console.error('Get cached landmarks error:', error);
      return [];
    }
  };

  const cacheLandmarks = async (landmarks) => {
    if (!db || !landmarks || landmarks.length === 0) return;

    try {
      const now = Date.now();
      for (const landmark of landmarks) {
        const id = landmark._id || landmark.id;
        const lat = landmark.location?.latitude || landmark.latitude;
        const lng = landmark.location?.longitude || landmark.longitude;

        if (!id || !lat || !lng) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO landmarks
          (id, name, description, category, latitude, longitude, timestamp, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1);`,
          [id, landmark.name, landmark.description || '', landmark.category || 'other', lat, lng, now]
        );
      }
    } catch (error) {
      console.error('Cache landmarks error:', error);
    }
  };

  const handleAddLandmark = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a landmark name');
      return;
    }

    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      Alert.alert('Error', 'GPS location not available');
      return;
    }

    if (!db) {
      Alert.alert('Error', 'Database not ready');
      return;
    }

    const landmarkData = {
      id: `offline_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      category,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      timestamp: Date.now(),
      synced: 0
    };

    try {
      // Save to local database first (offline-first approach)
      await db.runAsync(
        `INSERT INTO landmarks (id, name, description, category, latitude, longitude, timestamp, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          landmarkData.id,
          landmarkData.name,
          landmarkData.description,
          landmarkData.category,
          landmarkData.latitude,
          landmarkData.longitude,
          landmarkData.timestamp,
          0
        ]
      );

      // Try to sync with backend if online
      if (isOnline) {
        try {
          const result = await authService.createLandmark(
            landmarkData.name,
            landmarkData.description,
            landmarkData.category,
            landmarkData.latitude,
            landmarkData.longitude
          );

          if (result.success) {
            // Update with server ID
            await db.runAsync(
              'UPDATE landmarks SET id = ?, synced = 1 WHERE id = ?;',
              [result.data.id, landmarkData.id]
            );
            Alert.alert('Success', 'Landmark added and synced!');
          }
        } catch (syncError) {
          console.log('Sync failed, saved offline:', syncError);
          Alert.alert('Saved Offline', 'Landmark saved locally. Will sync when online.');
        }
      } else {
        Alert.alert('Saved Offline', 'Landmark saved locally. Will sync when online.');
      }

      setName('');
      setDescription('');
      setCategory('other');
      setModalVisible(false);
      loadLandmarks();
    } catch (error) {
      console.error('Add landmark error:', error);
      Alert.alert('Error', `Failed to save landmark: ${error.message}`);
    }
  };

  const handleDeleteLandmark = async (landmarkId, landmarkName) => {
    if (!db) {
      Alert.alert('Error', 'Database not ready');
      return;
    }

    Alert.alert(
      'Delete Landmark',
      `Delete "${landmarkName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from local database
              await db.runAsync('DELETE FROM landmarks WHERE id = ?;', [landmarkId]);

              // Try to delete from backend if online
              if (isOnline && !landmarkId.startsWith('offline_')) {
                try {
                  await authService.deleteLandmark(landmarkId);
                } catch (syncError) {
                  console.log('Backend delete failed:', syncError);
                }
              }

              Alert.alert('Success', 'Landmark deleted');
              loadLandmarks();
            } catch (error) {
              console.error('Delete landmark error:', error);
              Alert.alert('Error', `Failed to delete landmark: ${error.message}`);
            }
          }
        }
      ]
    );
  };

  const getCategoryEmoji = (cat) => {
    const found = CATEGORIES.find(c => c.value === cat);
    return found ? found.emoji : '📍';
  };

  const hasLocation = currentLocation?.latitude && currentLocation?.longitude;

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>🗺️ Landmarks</Text>
          {!isOnline && <Text style={styles.offlineBadge}>🔴 Offline Mode</Text>}
        </View>

        {!hasLocation && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⏳ Waiting for GPS...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, (!hasLocation || !db) && styles.buttonDisabled]}
          onPress={() => setModalVisible(true)}
          disabled={!hasLocation || !db}
        >
          <Text style={styles.buttonText}>➕ Add Landmark</Text>
        </TouchableOpacity>

        {nearbyLandmarks.length > 0 && (
          <View style={styles.landmarksList}>
            <Text style={styles.listTitle}>
              Nearby ({nearbyLandmarks.length})
            </Text>

            <ScrollView style={styles.scrollView} nestedScrollEnabled={true}>
              {nearbyLandmarks.map((landmark, index) => {
                const landmarkId = landmark.id || landmark._id;
                const isOffline = !landmark.synced || landmarkId?.startsWith('offline_');

                return (
                  <View key={landmarkId || index} style={styles.landmarkItem}>
                    <View style={styles.landmarkHeader}>
                      <View style={styles.landmarkMainInfo}>
                        <Text style={styles.landmarkName}>
                          {getCategoryEmoji(landmark.category)} {landmark.name}
                          {isOffline && <Text style={styles.offlineIndicator}> 🔄</Text>}
                        </Text>
                        {landmark.description && (
                          <Text style={styles.landmarkDescription}>{landmark.description}</Text>
                        )}
                      </View>

                      {landmarkId && (
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleDeleteLandmark(landmarkId, landmark.name)}
                        >
                          <Text style={styles.deleteButtonText}>🗑️</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {loading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
      </View>

      {/* Add Landmark Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Landmark</Text>

            <TextInput
              style={styles.input}
              placeholder="Landmark Name"
              value={name}
              onChangeText={setName}
            />

            <TextInput
              style={styles.input}
              placeholder="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Category:</Text>
            <ScrollView style={styles.categoryScroll}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.categoryButton,
                    category === cat.value && styles.categoryButtonActive,
                  ]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Text
                    style={[
                      styles.categoryButtonText,
                      category === cat.value && styles.categoryButtonTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleAddLandmark}
              >
                <Text style={styles.submitButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  offlineBadge: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '600',
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  warningBanner: {
    backgroundColor: '#FFF3CD',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  warningText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '500',
  },
  landmarksList: {
    marginTop: 15,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  scrollView: {
    maxHeight: 300,
  },
  landmarkItem: {
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  landmarkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  landmarkMainInfo: {
    flex: 1,
  },
  landmarkName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  offlineIndicator: {
    fontSize: 12,
    color: '#FF9500',
  },
  landmarkDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 10,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  loader: {
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  categoryScroll: {
    maxHeight: 200,
    marginBottom: 20,
  },
  categoryButton: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  categoryButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 16,
    color: '#666',
  },
  categoryButtonTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default LandmarkManager;
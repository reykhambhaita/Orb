// src/components/landmarks/LandmarkManager.jsx
import { Ionicons } from '@expo/vector-icons';
import NetInfo from "@react-native-community/netinfo";
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import authService from '../../screens/authService';
import dbManager from '../../utils/database';

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'gas_station', label: 'Gas Station' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'parking', label: 'Parking' },
  { value: 'landmark', label: 'Landmark' },
  { value: 'shop', label: 'Shop' },
  { value: 'other', label: 'Other' },
];

const LandmarkManager = forwardRef(({ currentLocation, onLandmarksUpdate, onLandmarkClick, searchQuery }, ref) => {
  const [listModalVisible, setListModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [previousOnlineState, setPreviousOnlineState] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);
  const [nearbyLandmarks, setNearbyLandmarks] = useState([]);
  const [dbReady, setDbReady] = useState(false);

  useImperativeHandle(ref, () => ({
    openLandmarkList: () => setListModalVisible(true),
    openAddLandmark: () => setAddModalVisible(true)
  }));

  // Drag gesture state
  const translateY = useSharedValue(800);
  const context = useSharedValue({ y: 0 });
  const SCREEN_HEIGHT = Dimensions.get('window').height;

  const addModalTranslateY = useSharedValue(600);

  useEffect(() => {
    if (listModalVisible) {
      translateY.value = withSpring(0, {
        damping: 18,
        stiffness: 90,
      });
    } else {
      translateY.value = 800;
    }
  }, [listModalVisible]);

  useEffect(() => {
    if (addModalVisible) {
      addModalTranslateY.value = withSpring(0, {
        damping: 15,
        stiffness: 90,
      });
    } else {
      addModalTranslateY.value = 600;
    }
  }, [addModalVisible]);

  // Monitor network status and trigger sync when coming online
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      setIsOnline(online);

      // If we just came online (transition from offline to online), sync pending changes
      if (online && !previousOnlineState && dbReady) {
        console.log('Network restored, syncing pending changes...');
        syncAllPendingChanges();
      }

      setPreviousOnlineState(online);
    });

    return () => unsubscribe();
  }, [previousOnlineState, dbReady]);

  // Initialize database on mount
  useEffect(() => {
    let mounted = true;

    const initDb = async () => {
      try {
        console.log('LandmarkManager: Getting database connection...');
        await dbManager.getDatabase();

        if (mounted) {
          console.log('LandmarkManager: Database ready');
          setDbReady(true);
        }
      } catch (error) {
        console.error('LandmarkManager: Database initialization error:', error);
        if (mounted) {
          Alert.alert(
            'Database Error',
            'Failed to initialize database. Please restart the app.\n\nError: ' + error.message
          );
          setDbReady(false);
        }
      }
    };

    initDb();

    return () => {
      mounted = false;
    };
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
    if (currentLocation?.latitude && currentLocation?.longitude && dbReady) {
      loadLandmarks();
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, dbReady]);

  const loadLandmarks = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      console.log('Cannot load landmarks: missing location');
      return;
    }

    setLoading(true);

    try {
      const db = await dbManager.getDatabase();

      // First, load from cache
      const cached = await getCachedLandmarks(
        currentLocation.latitude,
        currentLocation.longitude,
        db
      );

      if (cached.length > 0) {
        console.log(`Loaded ${cached.length} cached landmarks`);
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
          console.log(`Loaded ${result.data.length} landmarks from server`);
          await cacheLandmarks(result.data, db);
          setNearbyLandmarks(result.data);
          if (onLandmarksUpdate) {
            onLandmarksUpdate(result.data);
          }
        }
      }
    } catch (error) {
      console.error('Load landmarks error:', error);
      // Use cached data on error
      try {
        const db = await dbManager.getDatabase();
        const cached = await getCachedLandmarks(
          currentLocation.latitude,
          currentLocation.longitude,
          db
        );
        setNearbyLandmarks(cached);
        if (onLandmarksUpdate) {
          onLandmarksUpdate(cached);
        }
      } catch (cacheError) {
        console.error('Cache read error:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  };

  const getCachedLandmarks = async (latitude, longitude, db = null) => {
    try {
      const database = db || await dbManager.getDatabase();

      if (!database) {
        console.warn('Database not available for reading');
        return [];
      }

      const latDelta = 10 / 111.32;
      const lngDelta = 10 / (111.32 * Math.cos(latitude * Math.PI / 180));

      const result = await database.getAllAsync(
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

  const cacheLandmarks = async (landmarks, db = null) => {
    if (!landmarks || landmarks.length === 0) {
      return;
    }

    try {
      const database = db || await dbManager.getDatabase();

      if (!database) {
        console.warn('Database not available for caching');
        return;
      }

      const now = Date.now();

      // Use withTransactionAsync for atomic operations
      await database.withTransactionAsync(async () => {
        for (const landmark of landmarks) {
          const id = landmark._id || landmark.id;
          const lat = landmark.location?.latitude || landmark.latitude;
          const lng = landmark.location?.longitude || landmark.longitude;

          if (!id || !lat || !lng) continue;

          await database.runAsync(
            'INSERT OR REPLACE INTO landmarks (id, name, description, category, latitude, longitude, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
            [id, landmark.name, landmark.description || '', landmark.category || 'other', lat, lng, now]
          );
        }
      });

      console.log(`Cached ${landmarks.length} landmarks`);
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

    const landmarkData = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      description: description.trim(),
      category,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      timestamp: Date.now(),
      synced: 0
    };

    try {
      console.log('Saving landmark to local database...');

      // Get database reference
      const db = await dbManager.getDatabase();

      if (!db) {
        throw new Error('Database not available');
      }

      // Save to local database first using transaction
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'INSERT INTO landmarks (id, name, description, category, latitude, longitude, timestamp, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
      });

      console.log('Landmark saved to local database successfully');

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
            await db.withTransactionAsync(async () => {
              await db.runAsync(
                'UPDATE landmarks SET id = ?, synced = 1 WHERE id = ?',
                [result.data.id, landmarkData.id]
              );
            });
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
      setAddModalVisible(false);
      await loadLandmarks();
    } catch (error) {
      console.error('Add landmark error:', error);
      Alert.alert('Error', `Failed to save landmark: ${error.message}`);
    }
  };

  const handleDeleteLandmark = (landmarkId, landmarkName) => {
    Alert.alert(
      'Delete Landmark',
      `Delete "${landmarkName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => performDelete(landmarkId)
        }
      ]
    );
  };

  const performDelete = async (landmarkId) => {
    try {
      console.log('Deleting landmark from local database:', landmarkId);

      // Get database reference
      const db = await dbManager.getDatabase();

      if (!db) {
        throw new Error('Database not available');
      }

      // Delete from local database using transaction
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM landmarks WHERE id = ?', [landmarkId]);
      });

      console.log('Landmark deleted from local database');

      // Try to delete from backend if online
      if (isOnline && !landmarkId.startsWith('offline_')) {
        try {
          console.log('Attempting to delete from backend...');
          await authService.deleteLandmark(landmarkId);
          console.log('Landmark deleted from backend');
        } catch (syncError) {
          console.log('Backend delete failed (expected if offline):', syncError);
        }
      }

      Alert.alert('Success', 'Landmark deleted');
      await loadLandmarks();
    } catch (error) {
      console.error('Delete landmark error:', error);
      Alert.alert('Error', `Failed to delete landmark: ${error.message}`);
    }
  };

  const syncAllPendingChanges = async () => {
    if (syncing) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    setSyncing(true);
    console.log('Starting sync of all pending changes...');

    try {
      await syncPendingLandmarks();
      await loadLandmarks(); // Refresh the list after sync
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const syncPendingLandmarks = async () => {
    try {
      const db = await dbManager.getDatabase();

      if (!db) {
        console.warn('Database not available for sync');
        return;
      }

      // Get all unsynced landmarks
      const unsyncedLandmarks = await db.getAllAsync(
        'SELECT * FROM landmarks WHERE synced = 0'
      );

      if (unsyncedLandmarks.length === 0) {
        console.log('No pending landmarks to sync');
        return;
      }

      console.log(`Syncing ${unsyncedLandmarks.length} pending landmarks...`);

      let successCount = 0;
      let failCount = 0;

      for (const landmark of unsyncedLandmarks) {
        try {
          // Check if this is an offline-created landmark
          if (landmark.id.startsWith('offline_')) {
            console.log(`Syncing offline landmark: ${landmark.name}`);

            const result = await authService.createLandmark(
              landmark.name,
              landmark.description,
              landmark.category,
              landmark.latitude,
              landmark.longitude
            );

            if (result.success && result.data) {
              // Update local database with server ID and mark as synced
              await db.withTransactionAsync(async () => {
                await db.runAsync(
                  'UPDATE landmarks SET id = ?, synced = 1 WHERE id = ?',
                  [result.data.id, landmark.id]
                );
              });

              console.log(`Synced landmark: ${landmark.name} (new ID: ${result.data.id})`);
              successCount++;
            } else {
              console.error(`Failed to sync landmark: ${landmark.name}`, result.error);
              failCount++;
            }
          } else {
            // This landmark has a server ID but wasn't marked as synced
            // Just mark it as synced (it probably already exists on server)
            await db.withTransactionAsync(async () => {
              await db.runAsync(
                'UPDATE landmarks SET synced = 1 WHERE id = ?',
                [landmark.id]
              );
            });
            successCount++;
          }
        } catch (error) {
          console.error(`Error syncing landmark ${landmark.name}:`, error);
          failCount++;
        }
      }

      if (successCount > 0) {
        Alert.alert(
          'Sync Complete',
          `Successfully synced ${successCount} landmark${successCount > 1 ? 's' : ''}${failCount > 0 ? `. ${failCount} failed.` : '.'}`
        );
      } else if (failCount > 0) {
        Alert.alert(
          'Sync Failed',
          `Failed to sync ${failCount} landmark${failCount > 1 ? 's' : ''}. Will retry when online.`
        );
      }

      console.log(`Sync complete: ${successCount} succeeded, ${failCount} failed`);
    } catch (error) {
      console.error('Sync pending landmarks error:', error);
    }
  };

  const hasLocation = currentLocation?.latitude && currentLocation?.longitude;

  // Filter landmarks based on search query
  const filteredLandmarks = nearbyLandmarks.filter(landmark =>
    landmark.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (landmark.description && landmark.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Close modal function
  const closeModal = () => {
    translateY.value = withTiming(800, { duration: 250 }, () => {
      runOnJS(setListModalVisible)(false);
    });
  };

  const closeAddModal = () => {
    addModalTranslateY.value = withTiming(600, { duration: 250 }, () => {
      runOnJS(setAddModalVisible)(false);
    });
  };

  // Pan gesture for dragging
  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      // Only allow dragging down
      translateY.value = Math.max(0, context.value.y + event.translationY);
    })
    .onEnd((event) => {
      // If dragged down more than 150px or velocity is high, close modal
      if (translateY.value > 150 || event.velocityY > 500) {
        translateY.value = withSpring(SCREEN_HEIGHT, {}, () => {
          runOnJS(closeModal)();
        });
      } else {
        // Snap back to original position
        translateY.value = withSpring(0);
      }
    });

  // Animated style for modal
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const addModalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: addModalTranslateY.value }],
  }));

  const getCategoryLabel = (value) => {
    const cat = CATEGORIES.find(c => c.value === value);
    return cat ? cat.label : 'Other';
  };

  return (
    <>
      {/* Landmarks List - Modal implementation */}
      <Modal
        visible={listModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeModal}
          />
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.listModalContent, animatedStyle]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Landmarks</Text>
                <View style={styles.headerRight}>
                  {syncing && (
                    <View style={styles.syncIndicator}>
                      <ActivityIndicator size="small" color="#001f3f" />
                      <Text style={styles.syncText}>Syncing...</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={closeModal}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Add Landmark Button */}
              <TouchableOpacity
                style={[styles.addButton, (!hasLocation || !dbReady) && styles.buttonDisabled]}
                onPress={() => {
                  translateY.value = withTiming(800, { duration: 200 }, () => {
                    runOnJS(setListModalVisible)(false);
                    runOnJS(setAddModalVisible)(true);
                  });
                }}
                disabled={!hasLocation || !dbReady}
              >
                <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
                <Text style={styles.addButtonText}>Add Landmark</Text>
              </TouchableOpacity>

              {/* Landmarks List */}
              {loading && <ActivityIndicator size="small" color="#001f3f" style={styles.loader} />}

              {filteredLandmarks.length > 0 ? (
                <ScrollView
                  style={styles.landmarksScrollView}
                  showsVerticalScrollIndicator={false}
                >
                  {filteredLandmarks.map((landmark, index) => {
                    const landmarkId = landmark.id || landmark._id;
                    const isOffline = !landmark.synced || landmarkId?.startsWith('offline_');

                    const handleLandmarkPress = () => {
                      if (onLandmarkClick) {
                        onLandmarkClick(landmark);
                        closeModal();
                      }
                    };

                    return (
                      <TouchableOpacity
                        key={landmarkId || index}
                        style={styles.landmarkItem}
                        onPress={handleLandmarkPress}
                        activeOpacity={0.7}
                      >
                        <View style={styles.landmarkHeader}>
                          <View style={styles.landmarkMainInfo}>
                            <Text style={styles.landmarkName}>
                              {landmark.name}
                            </Text>
                            {landmark.description && (
                              <Text style={styles.landmarkDescription}>{landmark.description}</Text>
                            )}
                          </View>

                          {landmarkId && (
                            <TouchableOpacity
                              style={styles.deleteButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteLandmark(landmarkId, landmark.name);
                              }}
                            >
                              <Ionicons name="trash-outline" size={18} color="#6b7280" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'No landmarks match your search' : 'No landmarks nearby'}
                  </Text>
                </View>
              )}
            </Animated.View>
          </GestureDetector>
        </View>
      </Modal>

      <Modal
        visible={addModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeAddModal}
          />
          <Animated.View style={[styles.modalContent, addModalAnimatedStyle]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add New Landmark</Text>

            {/* Name and Category Row */}
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                placeholder="Landmark Name"
                value={name}
                onChangeText={setName}
              />

              {/* Category Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => setCategoryDropdownVisible(!categoryDropdownVisible)}
                >
                  <Text style={styles.dropdownButtonText}>{getCategoryLabel(category)}</Text>
                  <Ionicons
                    name={categoryDropdownVisible ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#666"
                  />
                </TouchableOpacity>

                {categoryDropdownVisible && (
                  <View style={styles.dropdownList}>
                    <ScrollView style={styles.dropdownScrollView}>
                      {CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat.value}
                          style={[
                            styles.dropdownItem,
                            category === cat.value && styles.dropdownItemActive
                          ]}
                          onPress={() => {
                            setCategory(cat.value);
                            setCategoryDropdownVisible(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              category === cat.value && styles.dropdownItemTextActive
                            ]}
                          >
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            <TextInput
              style={[styles.input, styles.descriptionInput]}
              placeholder="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeAddModal}
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
          </Animated.View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
    marginTop: -10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  syncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
  },
  syncText: {
    fontSize: 12,
    color: '#001f3f',
    fontWeight: '500',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  landmarksScrollView: {
    flex: 1,
  },
  landmarkItem: {
    padding: 12,
    backgroundColor: '#f8f9fa',
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
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  landmarkDescription: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
    lineHeight: 16,
  },
  deleteButton: {
    padding: 6,
    marginLeft: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  loader: {
    marginVertical: 10,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 24,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  nameInput: {
    flex: 1,
  },
  descriptionInput: {
    marginBottom: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dropdownContainer: {
    width: 130,
    position: 'relative',
  },
  dropdownButton: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  dropdownList: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  dropdownScrollView: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemActive: {
    backgroundColor: '#E3F2FD',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#666',
  },
  dropdownItemTextActive: {
    color: '#001f3f',
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
    backgroundColor: '#111111',
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
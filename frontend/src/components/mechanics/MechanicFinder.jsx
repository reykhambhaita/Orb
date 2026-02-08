// src/components/mechanics/MechanicFinder.jsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import authService from '../../screens/authService.js';
import dbManager from '../../utils/database';

const MechanicFinder = forwardRef(({ searchLocation, searchLocationName, onResetToGPS, onMechanicsUpdate, navigation, targetMechanicId }, ref) => {
  const { theme, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [mechanics, setMechanics] = useState([]);
  const [selectedMechanic, setSelectedMechanic] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [lastFetchPosition, setLastFetchPosition] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  const translateY = useSharedValue(600);

  useEffect(() => {
    if (detailModalVisible) {
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 90,
      });
    } else {
      translateY.value = 600;
    }
  }, [detailModalVisible]);

  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const closeDetailModal = () => {
    translateY.value = withTiming(600, { duration: 250 }, () => {
      runOnJS(setDetailModalVisible)(false);
      runOnJS(setSelectedMechanic)(null);
      runOnJS(setHasAutoOpened)(false);
    });
  };

  useEffect(() => {
    if (searchLocation?.latitude && searchLocation?.longitude) {
      const now = Date.now();
      const distanceMoved = lastFetchPosition
        ? calculateDistance(
          searchLocation.latitude,
          searchLocation.longitude,
          lastFetchPosition.latitude,
          lastFetchPosition.longitude
        ) * 1000 // In meters
        : Infinity;

      const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
      const DISTANCE_THRESHOLD_M = 50;

      if (distanceMoved > DISTANCE_THRESHOLD_M || (now - lastFetchTime) > CACHE_EXPIRY_MS) {
        const moveReason = distanceMoved === Infinity ? 'initial load' : `moved ${distanceMoved.toFixed(0)}m`;
        console.log(`🔄 Fetching fresh mechanics: ${distanceMoved > DISTANCE_THRESHOLD_M ? moveReason : `cache expired (${((now - lastFetchTime) / 60000).toFixed(1)} min)`}`);
        loadMechanics();
        setLastFetchPosition({
          latitude: searchLocation.latitude,
          longitude: searchLocation.longitude
        });
        setLastFetchTime(now);
      } else {
        // Just update distance from user for existing mechanics if we didn't fetch fresh ones
        console.log(`✅ Using cached mechanics (moved ${distanceMoved.toFixed(0)}m, cache age ${((now - lastFetchTime) / 60000).toFixed(1)} min)`);
        setMechanics(prev => prev.map(m => ({
          ...m,
          distanceFromUser: calculateDistance(
            searchLocation.latitude,
            searchLocation.longitude,
            m.latitude,
            m.longitude
          )
        })).sort((a, b) => a.distanceFromUser - b.distanceFromUser));
      }
    }
  }, [searchLocation]);

  // Handle deep-linking to a specific mechanic
  useEffect(() => {
    if (targetMechanicId && mechanics.length > 0 && !hasAutoOpened) {
      const mechanic = mechanics.find(m => (m.id || m._id) === targetMechanicId);
      if (mechanic) {
        setSelectedMechanic(mechanic);
        setDetailModalVisible(true);
        setHasAutoOpened(true);
        console.log(`🎯 Deep-link success: Auto-opening modal for ${mechanic.name}`);

        // Clear the navigation param so it doesn't trigger again on re-mounts
        if (navigation?.setParams) {
          navigation.setParams({ mechanicId: undefined });
        }
      }
    }
  }, [targetMechanicId, mechanics, hasAutoOpened]);

  // Reset auto-open flag when targetMechanicId changes to a new one
  useEffect(() => {
    if (targetMechanicId) {
      setHasAutoOpened(false);
    }
  }, [targetMechanicId]);

  const loadMechanics = async () => {
    if (!searchLocation?.latitude || !searchLocation?.longitude) return;

    setLoading(true);

    try {
      // console.log('🔧 Loading mechanics from location:', {
      //   lat: searchLocation.latitude,
      //   lng: searchLocation.longitude,
      //   name: searchLocationName || 'GPS'
      // });

      // STEP 1: Always load from cache first (offline-first principle)
      // console.log('📦 [CACHE] Loading mechanics from local SQLite cache...');
      const cached = await getCachedMechanics(
        searchLocation.latitude,
        searchLocation.longitude,
        100 // 100km radius for testing
      );

      // if (cached.length > 0) {
      //   console.log(`✅ [CACHE HIT] Found ${cached.length} cached mechanics`);
      //   cached.forEach((m, i) => {
      //     console.log(`   ${i + 1}. ${m.name} (cached at ${new Date(m.timestamp).toLocaleString()})`);
      //   });
      // } else {
      //   console.log('❌ [CACHE MISS] No mechanics found in local cache');
      // }

      // Calculate distances and display cached results immediately
      if (cached.length > 0) {
        const mechanicsWithDistance = cached
          .map(mechanic => ({
            ...mechanic,
            dataSource: 'cache', // Mark as cached data
            distanceFromUser: calculateDistance(
              searchLocation.latitude,
              searchLocation.longitude,
              mechanic.latitude,
              mechanic.longitude
            )
          }))
          .filter(m => m.distanceFromUser !== null)
          .sort((a, b) => a.distanceFromUser - b.distanceFromUser);

        // console.log('📱 [DISPLAY] Showing cached mechanics to user');
        setMechanics(mechanicsWithDistance);
        if (onMechanicsUpdate) {
          onMechanicsUpdate(mechanicsWithDistance);
        }
      } else {
        // No cached data
        // console.log('📱 [DISPLAY] No mechanics to display (cache empty)');
        setMechanics([]);
        if (onMechanicsUpdate) {
          onMechanicsUpdate([]);
        }
      }

      // Stop loading spinner immediately
      setLoading(false);

      // STEP 2: Try background refresh from backend (don't block UI)
      try {
        const radiusMeters = 100000; // 100km in meters
        console.log(`🌐 [SYNC] Attempting fresh sync with backend...`);

        const result = await authService.getNearbyMechanics(
          searchLocation.latitude,
          searchLocation.longitude,
          radiusMeters
        );

        if (result.success && result.data && result.data.length > 0) {
          console.log(`✅ [SYNC SUCCESS] Received ${result.data.length} mechanics from server. Updating cache.`);

          // Cache the fresh data and clear old ones for a full refresh
          await cacheMechanics(result.data, true);

          // Update UI with fresh data
          const mechanicsWithDistance = result.data
            .map(mechanic => {
              const lat = mechanic.location?.latitude || mechanic.latitude;
              const lng = mechanic.location?.longitude || mechanic.longitude;

              return {
                ...mechanic,
                dataSource: 'backend', // Mark as fresh backend data
                latitude: lat,
                longitude: lng,
                distanceFromUser: calculateDistance(
                  searchLocation.latitude,
                  searchLocation.longitude,
                  lat,
                  lng
                )
              };
            })
            .filter(m => m.distanceFromUser !== null)
            .sort((a, b) => a.distanceFromUser - b.distanceFromUser);

          setMechanics(mechanicsWithDistance);
          if (onMechanicsUpdate) {
            onMechanicsUpdate(mechanicsWithDistance);
          }
        } else if (result.success && result.data && result.data.length === 0) {
          console.log('ℹ️ [SYNC] Backend confirmed 0 mechanics nearby. Clearing local cache.');
          await cacheMechanics([], true);
          setMechanics([]);
          if (onMechanicsUpdate) {
            onMechanicsUpdate([]);
          }
        } else {
          console.log('⚠️ [SYNC FAILED] Backend request unsuccessful. Staying with offline data.');
        }
      } catch (networkError) {
        // Network error - this is OK in offline-first architecture
        console.log('📴 [OFFLINE] Sync failed (Network/Offline). Displaying local cached data.');
        if (cached.length > 0) {
          console.log(`✅ [OFFLINE] Showing ${cached.length} mechanics from local storage.`);
        } else {
          console.log('⚠️ [OFFLINE] No cached data available to show.');
        }
      }

    } catch (error) {
      console.error('❌ [ERROR] Load mechanics error:', error);
      console.log('🔄 [FALLBACK] Attempting to load from cache as fallback...');
      setLoading(false);

      try {
        const cached = await getCachedMechanics(
          searchLocation.latitude,
          searchLocation.longitude,
          100
        );

        if (cached.length > 0) {
          console.log(`✅ [FALLBACK SUCCESS] Loaded ${cached.length} mechanics from cache`);
          const mechanicsWithDistance = cached
            .map(mechanic => ({
              ...mechanic,
              dataSource: 'cache-fallback', // Mark as fallback cached data
              distanceFromUser: calculateDistance(
                searchLocation.latitude,
                searchLocation.longitude,
                mechanic.latitude,
                mechanic.longitude
              )
            }))
            .filter(m => m.distanceFromUser !== null)
            .sort((a, b) => a.distanceFromUser - b.distanceFromUser);

          console.log('📱 [DISPLAY] Showing fallback cached data');
          setMechanics(mechanicsWithDistance);
          if (onMechanicsUpdate) {
            onMechanicsUpdate(mechanicsWithDistance);
          }
        } else {
          console.log('❌ [FALLBACK FAILED] No cached data available');
        }
      } catch (cacheError) {
        console.error('❌ [FALLBACK ERROR] Failed to load cached mechanics:', cacheError);
      }
    }
  };


  useImperativeHandle(ref, () => ({
    refreshMechanics: async () => {
      console.log('🔄 Refreshing mechanics list...');
      if (searchLocation?.latitude && searchLocation?.longitude) {
        await loadMechanics();
      }
    }
  }));


  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
      console.warn('Invalid coordinates for distance calculation:', { lat1, lon1, lat2, lon2 });
      return null;
    }

    if (lat1 === lat2 && lon1 === lon2) {
      return 0;
    }

    const R = 6371; // Earth's radius in kilometers
    const toRad = (degrees) => degrees * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers

    // Log first calculation for debugging
    if (!calculateDistance.logged) {
      console.log('📏 Distance calculation example:', {
        from: { lat: lat1, lon: lon1 },
        to: { lat: lat2, lon: lon2 },
        distanceKm: distance.toFixed(2),
        distanceM: (distance * 1000).toFixed(0)
      });
      calculateDistance.logged = true;
    }

    return distance;
  };

  const getCachedMechanics = async (latitude, longitude, radiusKm = 100) => {
    try {
      // console.log(`🗄️  [CACHE READ] Querying SQLite for mechanics within ${radiusKm}km...`);
      const db = await dbManager.getDatabase();
      const latDelta = radiusKm / 111.32;
      const lngDelta = radiusKm / (111.32 * Math.cos(latitude * Math.PI / 180));

      // console.log(`🗄️  [CACHE READ] Search bounds: lat [${(latitude - latDelta).toFixed(4)}, ${(latitude + latDelta).toFixed(4)}], lng [${(longitude - lngDelta).toFixed(4)}, ${(longitude + lngDelta).toFixed(4)}]`);

      const result = await db.getAllAsync(
        `SELECT * FROM mechanics
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

      // console.log(`🗄️  [CACHE READ] SQLite query returned ${result?.length || 0} rows`);

      const mechanics = (result || []).map(m => ({
        ...m,
        specialties: JSON.parse(m.specialties || '[]'),
        available: m.available === 1
      }));

      return mechanics;
    } catch (error) {
      console.error('❌ [CACHE READ ERROR] Get cached mechanics error:', error);
      return [];
    }
  };

  const cacheMechanics = async (mechanics, shouldClear = false) => {
    try {
      const db = await dbManager.getDatabase();

      if (shouldClear) {
        // console.log('🧹 [CACHE CLEAR] Removing all old mechanics from local cache');
        await db.runAsync('DELETE FROM mechanics;');
      }

      if (!mechanics || mechanics.length === 0) {
        // console.log('⚠️  [CACHE WRITE] No mechanics to cache (empty array)');
        return;
      }

      // console.log(`💾 [CACHE WRITE] Starting to cache ${mechanics.length} mechanics to SQLite...`);
      const now = Date.now();
      let successCount = 0;
      let skipCount = 0;

      for (const mechanic of mechanics) {
        const id = mechanic._id || mechanic.id;
        const lat = mechanic.location?.latitude || mechanic.latitude;
        const lng = mechanic.location?.longitude || mechanic.longitude;

        if (!id || !lat || !lng) {
          // console.warn(`⚠️  [CACHE WRITE] Skipping mechanic "${mechanic.name}" - missing id or coordinates`);
          skipCount++;
          continue;
        }

        await db.runAsync(
          `INSERT OR REPLACE INTO mechanics
          (id, name, phone, latitude, longitude, specialties, rating, available, upiId, upiQrCode, timestamp, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
          [
            id,
            mechanic.name,
            mechanic.phone || '',
            lat,
            lng,
            JSON.stringify(mechanic.specialties || []),
            mechanic.rating || 0,
            mechanic.available ? 1 : 0,
            mechanic.upiId || null,
            mechanic.upiQrCode || null,
            now
          ]
        );
        successCount++;
      }

      // console.log(`✅ [CACHE WRITE] Successfully cached ${successCount} mechanics${skipCount > 0 ? `, skipped ${skipCount}` : ''}`);
    } catch (error) {
      console.error('❌ [CACHE WRITE ERROR] Cache mechanics error:', error);
    }
  };

  const handleCallMechanic = (mechanicId, mechanicName, phone) => {
    if (!phone) {
      Alert.alert('No Phone Number', 'This mechanic has no contact number.');
      return;
    }

    Alert.alert(
      'Call Mechanic',
      `Call ${mechanicName} at ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: async () => {
            try {
              const callStartTime = new Date();
              const result = await authService.createCallLog(
                mechanicId,
                phone,
                callStartTime
              );

              if (result.success) {
                console.log('Call log created:', result.data.id);
                await AsyncStorage.setItem('current_call_log_id', result.data.id);
                await AsyncStorage.setItem('current_call_mechanic_id', mechanicId);
                await AsyncStorage.setItem('current_call_start_time', callStartTime.toISOString());
              }

              Linking.openURL(`tel:${phone}`);
            } catch (error) {
              console.error('Call log error:', error);
              Linking.openURL(`tel:${phone}`);
            }
          }
        }
      ]
    );
  };

  const handleEndCallAndReview = async (mechanicId, mechanicName) => {
    try {
      const callLogId = await AsyncStorage.getItem('current_call_log_id');
      const storedMechanicId = await AsyncStorage.getItem('current_call_mechanic_id');

      if (!callLogId || storedMechanicId !== mechanicId) {
        navigation.navigate('ReviewMechanic', { mechanicId, mechanicName });
        return;
      }

      const callEndTime = new Date();
      const result = await authService.endCallLog(callLogId, callEndTime);

      await AsyncStorage.removeItem('current_call_log_id');
      await AsyncStorage.removeItem('current_call_mechanic_id');
      await AsyncStorage.removeItem('current_call_start_time');

      navigation.navigate('ReviewMechanic', {
        mechanicId,
        mechanicName,
        callDuration: result.data?.duration || 0
      });
    } catch (error) {
      console.error('End call error:', error);
      navigation.navigate('ReviewMechanic', { mechanicId, mechanicName });
    }
  };

  const hasLocation = searchLocation?.latitude && searchLocation?.longitude;

  const openDetailModal = (mechanic) => {
    setSelectedMechanic(mechanic);
    setDetailModalVisible(true);
  };

  return (
    <>
      <View style={styles.mechanicsContainer}>
        <View style={styles.containerHeader}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.containerTitle, { color: theme.text }]}>
              {mechanics.length > 0
                ? `${mechanics.length} Mechanic${mechanics.length > 1 ? 's' : ''} nearby`
                : 'Find Mechanics'}
            </Text>
          </View>
          {searchLocationName && (
            <View style={styles.searchLocationRow}>
              <View style={styles.searchLocationBadge}>
                <Ionicons name="location" size={12} color={isDark ? '#FFFFFF' : '#0A4D4D'} />
                <Text style={[styles.searchLocationText, { color: theme.textSecondary }]}>{searchLocationName}</Text>
              </View>
              <TouchableOpacity
                style={[styles.resetButton, { backgroundColor: isDark ? '#222222' : '#f3f4f6' }]}
                onPress={onResetToGPS}
              >
                <Ionicons name="navigate" size={14} color={isDark ? '#FFFFFF' : '#0A4D4D'} />
                <Text style={[styles.resetButtonText, { color: theme.text }]}>My Location</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {loading && <ActivityIndicator size="small" color="#0A4D4D" style={styles.loader} />}

        {mechanics.length > 0 ? (
          <ScrollView
            style={styles.mechanicsScrollView}
            showsVerticalScrollIndicator={false}
          >
            {mechanics.map((mechanic, index) => (
              <TouchableOpacity
                key={mechanic.id || mechanic._id || index}
                style={[
                  styles.mechanicCard,
                  {
                    backgroundColor: isDark ? '#000000' : '#ffffff',
                    borderColor: isDark ? '#222222' : '#f0f0f0'
                  }
                ]}
                onPress={() => openDetailModal(mechanic)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardLeft}>
                    <Text style={[styles.mechanicName, { color: isDark ? '#FFFFFF' : '#111111' }]}>{mechanic.name}</Text>
                    <View style={styles.starRating}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= Math.round(mechanic.rating || 0) ? 'star' : 'star-outline'}
                          size={14}
                          color={isDark ? '#FFFFFF' : '#000000'}
                        />
                      ))}
                      <Text style={[styles.ratingValue, { color: isDark ? '#A0A0A0' : '#888888' }]}>
                        {(mechanic.rating || 0).toFixed(1)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.distanceBadge, { backgroundColor: isDark ? '#222222' : '#f3f4f6' }]}>
                    <Text style={[styles.distanceText, { color: isDark ? '#FFFFFF' : '#111111' }]}>
                      {mechanic.distanceFromUser != null
                        ? mechanic.distanceFromUser < 1
                          ? `${(mechanic.distanceFromUser * 1000).toFixed(0)}m`
                          : `${mechanic.distanceFromUser.toFixed(1)}km`
                        : '0km'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="construct-outline" size={48} color="#C0C0C0" />
            <Text style={styles.emptyText}>
              {!hasLocation
                ? 'Waiting for location...'
                : 'No mechanics found nearby'}
            </Text>
          </View>
        )}
      </View>

      {selectedMechanic && (
        <Modal
          visible={detailModalVisible}
          animationType="fade"
          transparent={true}
          onRequestClose={closeDetailModal}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={closeDetailModal}
            />
            <Animated.View style={[
              styles.modalContent,
              animatedContentStyle,
              { backgroundColor: isDark ? '#000000' : '#FFFFFF' }
            ]}>
              <View style={[styles.modalHandle, { backgroundColor: isDark ? '#333333' : '#E5E7EB' }]} />

              <View style={styles.modalHeader}>
                <View>
                  <Text style={[styles.modalTitle, { color: isDark ? '#FFFFFF' : '#111111' }]}>{selectedMechanic.name}</Text>
                  <View style={styles.modalRating}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={star <= Math.round(selectedMechanic.rating || 0) ? 'star' : 'star-outline'}
                        size={16}
                        color={isDark ? '#FFFFFF' : '#000000ff'}
                      />
                    ))}
                    <Text style={[styles.modalRatingText, { color: isDark ? '#A0A0A0' : '#888888' }]}>
                      {(selectedMechanic.rating || 0).toFixed(1)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={closeDetailModal}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={isDark ? '#FFFFFF' : '#6B7280'} />
                </TouchableOpacity>
              </View>

              <View style={[styles.modalDistance, { backgroundColor: isDark ? '#111111' : '#F9FAFB' }]}>
                <Ionicons name="location-outline" size={18} color={isDark ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.modalDistanceText, { color: isDark ? '#FFFFFF' : '#6B7280' }]}>
                  {selectedMechanic.distanceFromUser != null
                    ? selectedMechanic.distanceFromUser < 1
                      ? `${(selectedMechanic.distanceFromUser * 1000).toFixed(0)} meters away`
                      : `${selectedMechanic.distanceFromUser.toFixed(1)} km away`
                    : '0.0 km away'}
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.callButton, isDark && { backgroundColor: '#FFFFFF' }]}
                  onPress={() => {
                    closeDetailModal();
                    handleCallMechanic(
                      selectedMechanic.id || selectedMechanic._id,
                      selectedMechanic.name,
                      selectedMechanic.phone
                    );
                  }}
                >
                  <Ionicons name="call" size={20} color={isDark ? '#000000' : '#FFFFFF'} />
                  <Text style={[styles.callButtonText, isDark && { color: '#000000' }]}>Call Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.walletButton, isDark && { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }]}
                  onPress={() => {
                    closeDetailModal();
                    navigation.navigate('Payment', {
                      mechanicId: selectedMechanic.id || selectedMechanic._id,
                      mechanicName: selectedMechanic.name,
                      mechanicPhone: selectedMechanic.phone,
                      upiId: selectedMechanic.upiId,
                      upiQrCode: selectedMechanic.upiQrCode
                    });
                  }}
                >
                  <Ionicons name="wallet-outline" size={20} color="#000000" />
                  <Text style={[styles.walletButtonText, { color: '#000000' }]}>Payment</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.reviewButton, isDark && { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }]}
                  onPress={() => {
                    closeDetailModal();
                    handleEndCallAndReview(
                      selectedMechanic.id || selectedMechanic._id,
                      selectedMechanic.name
                    );
                  }}
                >
                  <Ionicons name="star-outline" size={20} color="#000000" />
                  <Text style={[styles.reviewButtonText, { color: '#000000' }]}>Leave a review</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  mechanicsContainer: {
    marginBottom: 20,
    marginTop: 10,
  },
  containerHeader: {
    marginBottom: 16,
  },
  containerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterButton: {
    padding: 4,
  },
  searchLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  searchLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  searchLocationText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resetButtonText: {
    fontSize: 11,
    color: '#111111',
    fontWeight: '600',
  },
  loader: {
    marginVertical: 20,
  },
  mechanicsScrollView: {
    paddingBottom: 10,
  },
  mechanicCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: {
    flex: 1,
    gap: 6,
  },
  mechanicName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 2,
  },
  starRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
    marginLeft: 6,
  },
  distanceBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111111',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '75%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },
  modalRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  modalRatingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888888',
    marginLeft: 6,
  },
  closeButton: {
    padding: 4,
  },
  modalDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 24,
  },
  modalDistanceText: {
    fontSize: 14,
    color: '#888888',
    fontWeight: '500',
  },
  modalActions: {
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  callButton: {
    backgroundColor: '#111111',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  walletButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  walletButtonText: {
    color: '#0A4D4D',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewButton: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reviewButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});

MechanicFinder.displayName = 'MechanicFinder';

export default MechanicFinder;
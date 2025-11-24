// src/components/mechanics/MechanicFinder.jsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import authService from '../../screens/authService.js';



const MechanicFinder = forwardRef(({ currentLocation, onMechanicsUpdate, navigation }, ref) => {
  const [loading, setLoading] = useState(false);
  const [mechanics, setMechanics] = useState([]);

  const db = SQLite.openDatabaseSync('locationtracker.db');

  useEffect(() => {
    if (currentLocation?.latitude && currentLocation?.longitude) {
      loadMechanics();
    }
  }, [currentLocation?.latitude, currentLocation?.longitude]);

  const loadMechanics = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude) return;

    setLoading(true);

    try {
      console.log('📍 Loading mechanics from location:', {
        lat: currentLocation.latitude,
        lng: currentLocation.longitude
      });

      // Load from cache first
      const cached = await getCachedMechanics(
        currentLocation.latitude,
        currentLocation.longitude
      );

      console.log('💾 Cached mechanics:', cached.length);

      if (cached.length > 0) {
        const mechanicsWithDistance = cached.map(mechanic => {
          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            mechanic.latitude,
            mechanic.longitude
          );

          return {
            ...mechanic,
            distanceFromUser: distance
          };
        }).filter(m => m.distanceFromUser !== null);

        mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

        setMechanics(mechanicsWithDistance);
        if (onMechanicsUpdate) {
          onMechanicsUpdate(mechanicsWithDistance);
        }
      }

      // Fetch from backend
      const result = await authService.getNearbyMechanics(
        currentLocation.latitude,
        currentLocation.longitude,
        50000 // 50km radius
      );

      console.log('📡 Backend result:', result);

      if (result.success && result.data) {
        console.log('✅ Found mechanics:', result.data.length);

        // Cache to SQLite
        await cacheMechanics(result.data);

        // Calculate distances with detailed logging
        const mechanicsWithDistance = result.data.map(mechanic => {
          const lat = mechanic.location?.latitude || mechanic.latitude;
          const lng = mechanic.location?.longitude || mechanic.longitude;

          console.log(`Mechanic "${mechanic.name}": lat=${lat}, lng=${lng}`);

          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            lat,
            lng
          );

          return {
            ...mechanic,
            latitude: lat,
            longitude: lng,
            distanceFromUser: distance
          };
        }).filter(m => m.distanceFromUser !== null);

        mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

        console.log('Sorted mechanics by distance:', mechanicsWithDistance.map(m => ({
          name: m.name,
          distance: m.distanceFromUser?.toFixed(2) + 'km'
        })));

        setMechanics(mechanicsWithDistance);
        if (onMechanicsUpdate) {
          onMechanicsUpdate(mechanicsWithDistance);
        }
      } else {
        console.log('❌ Failed to load mechanics:', result.error);
      }
    } catch (error) {
      console.error('Load mechanics error:', error);

      // Use cached data on error
      const cached = await getCachedMechanics(
        currentLocation.latitude,
        currentLocation.longitude
      );

      const mechanicsWithDistance = cached.map(mechanic => ({
        ...mechanic,
        distanceFromUser: calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          mechanic.latitude,
          mechanic.longitude
        )
      })).filter(m => m.distanceFromUser !== null);

      mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

      setMechanics(mechanicsWithDistance);
      if (onMechanicsUpdate) {
        onMechanicsUpdate(mechanicsWithDistance);
      }
    } finally {
      setLoading(false);
    }
  };

  // Expose refreshMechanics method to parent via ref
  useImperativeHandle(ref, () => ({
    refreshMechanics: async () => {
      console.log('🔄 Refreshing mechanics list...');
      if (currentLocation?.latitude && currentLocation?.longitude) {
        // Clear cached mechanics for this location to force fresh data
        try {
          await db.runAsync('DELETE FROM mechanics;');
          console.log('✅ Cleared mechanic cache');
        } catch (error) {
          console.error('Failed to clear mechanic cache:', error);
        }
        // Reload mechanics
        await loadMechanics();
      }
    }
  }));

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    // Validate inputs
    if (!lat1 || !lon1 || !lat2 || !lon2) {
      console.warn('Invalid coordinates for distance calculation:', { lat1, lon1, lat2, lon2 });
      return null;
    }

    // Earth's radius in kilometers
    const R = 6371;

    // Convert degrees to radians
    const toRad = (degrees) => degrees * (Math.PI / 180);

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers

    console.log(`Distance calculated: ${distance.toFixed(2)}km between (${lat1}, ${lon1}) and (${lat2}, ${lon2})`);

    return distance;
  };

  // Update loadMechanics - replace mechanicsWithDistance mapping:


  const getCachedMechanics = async (latitude, longitude) => {
    try {
      const latDelta = 50 / 111.32; // 50km
      const lngDelta = 50 / (111.32 * Math.cos(latitude * Math.PI / 180));

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

      // Parse specialties JSON
      return (result || []).map(m => ({
        ...m,
        specialties: JSON.parse(m.specialties || '[]'),
        available: m.available === 1
      }));
    } catch (error) {
      console.error('Get cached mechanics error:', error);
      return [];
    }
  };

  const cacheMechanics = async (mechanics) => {
    if (!mechanics || mechanics.length === 0) return;

    try {
      const now = Date.now();
      for (const mechanic of mechanics) {
        const id = mechanic._id || mechanic.id;
        const lat = mechanic.location?.latitude || mechanic.latitude;
        const lng = mechanic.location?.longitude || mechanic.longitude;

        if (!id || !lat || !lng) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO mechanics
          (id, name, phone, latitude, longitude, specialties, rating, available, timestamp, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
          [
            id,
            mechanic.name,
            mechanic.phone || '',
            lat,
            lng,
            JSON.stringify(mechanic.specialties || []),
            mechanic.rating || 0,
            mechanic.available ? 1 : 0,
            now
          ]
        );
      }
    } catch (error) {
      console.error('Cache mechanics error:', error);
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
              // Log call start
              const callStartTime = new Date();
              const result = await authService.createCallLog(
                mechanicId,
                phone,
                callStartTime
              );

              if (result.success) {
                console.log('Call log created:', result.data.id);

                // Store call log ID for ending later
                await AsyncStorage.setItem('current_call_log_id', result.data.id);
                await AsyncStorage.setItem('current_call_mechanic_id', mechanicId);
                await AsyncStorage.setItem('current_call_start_time', callStartTime.toISOString());
              }

              // Make the call
              Linking.openURL(`tel:${phone}`);

              // Note: Detecting when call ends is not directly possible in React Native
              // We'll provide a manual "End Call & Review" button instead
            } catch (error) {
              console.error('Call log error:', error);
              // Still make the call even if logging fails
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
        // No active call for this mechanic
        navigation.navigate('ReviewMechanic', { mechanicId, mechanicName });
        return;
      }

      // End the call log
      const callEndTime = new Date();
      const result = await authService.endCallLog(callLogId, callEndTime);

      // Clear stored call data
      await AsyncStorage.removeItem('current_call_log_id');
      await AsyncStorage.removeItem('current_call_mechanic_id');
      await AsyncStorage.removeItem('current_call_start_time');

      // Navigate to review screen
      navigation.navigate('ReviewMechanic', {
        mechanicId,
        mechanicName,
        callDuration: result.data?.duration || 0
      });
    } catch (error) {
      console.error('End call error:', error);
      // Still navigate to review screen
      navigation.navigate('ReviewMechanic', { mechanicId, mechanicName });
    }
  };

  const hasLocation = currentLocation?.latitude && currentLocation?.longitude;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Find Mechanics</Text>

      {!hasLocation && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>Waiting for GPS...</Text>
        </View>
      )}

      {loading && (
        <ActivityIndicator size="small" color="#FF6B35" style={styles.loader} />
      )}

      {mechanics.length > 0 && (
        <View style={styles.mechanicsList}>
          <Text style={styles.listTitle}>
            Nearby Mechanics ({mechanics.length})
          </Text>

          <ScrollView
            style={styles.mechanicsScrollView}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {mechanics.map((mechanic, index) => (
              <View key={mechanic.id || mechanic._id || index} style={styles.mechanicCard}>
                <View style={styles.mechanicHeader}>
                  <View style={styles.mechanicInfo}>
                    <Text style={styles.mechanicName}>{mechanic.name}</Text>
                    <View style={styles.ratingRow}>
                      <Text style={styles.rating}>⭐ {mechanic.rating?.toFixed(1) || 'New'}</Text>
                      {mechanic.available && (
                        <Text style={styles.availableBadge}>Available</Text>
                      )}
                    </View>
                  </View>
                </View>

                {mechanic.specialties && mechanic.specialties.length > 0 && (
                  <View style={styles.specialtiesContainer}>
                    <Text style={styles.specialtiesLabel}>Specialties:</Text>
                    <Text style={styles.specialtiesText}>
                      {mechanic.specialties.join(', ')}
                    </Text>
                  </View>
                )}

                <View style={styles.distanceRow}>
                  <Text style={styles.distanceText}>
                    📍 {mechanic.distanceFromUser != null
                      ? mechanic.distanceFromUser < 1
                        ? `${(mechanic.distanceFromUser * 1000).toFixed(0)}m away`
                        : `${mechanic.distanceFromUser.toFixed(2)}km away`
                      : 'Distance unknown'}
                  </Text>
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.callButton]}
                    onPress={() => handleCallMechanic(
                      mechanic.id || mechanic._id,
                      mechanic.name,
                      mechanic.phone
                    )}
                  >
                    <Text style={styles.callButtonText}>
                      📞 Call
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.payButton]}
                    onPress={() => navigation.navigate('Payment', {
                      mechanicId: mechanic.id || mechanic._id,
                      mechanicName: mechanic.name,
                      mechanicPhone: mechanic.phone
                    })}
                  >
                    <Text style={styles.payButtonText}>
                      💳 Pay
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.reviewButton]}
                    onPress={() => handleEndCallAndReview(
                      mechanic.id || mechanic._id,
                      mechanic.name
                    )}
                  >
                    <Text style={styles.reviewButtonText}>
                      ⭐ Review
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {!loading && mechanics.length === 0 && hasLocation && (
        <Text style={styles.emptyText}>
          No mechanics found nearby. Try again or check your connection.
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  warningBanner: {
    backgroundColor: '#FFF3CD',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  warningText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '500',
  },
  loader: {
    marginVertical: 10,
  },
  mechanicsList: {
    marginTop: 10,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  mechanicsScrollView: {
    maxHeight: 400,
  },
  mechanicCard: {
    backgroundColor: '#FFF5F0',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
  },
  mechanicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  mechanicInfo: {
    flex: 1,
  },
  mechanicName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rating: {
    fontSize: 14,
    color: '#666',
  },
  availableBadge: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  specialtiesContainer: {
    marginBottom: 8,
  },
  specialtiesLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  specialtiesText: {
    fontSize: 14,
    color: '#666',
  },
  distanceRow: {
    marginBottom: 10,
  },
  distanceText: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
  },
  callButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    padding: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  reviewButton: {
    backgroundColor: '#FF9500',
  },
  reviewButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  payButton: {
    backgroundColor: '#007AFF',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

});

MechanicFinder.displayName = 'MechanicFinder';

export default MechanicFinder;
// src/components/mechanics/MechanicFinder.jsx
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
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

const MechanicFinder = ({ currentLocation, onMechanicsUpdate }) => {
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
      console.log('ðŸ” Loading mechanics...');

      // Load from cache first
      const cached = await getCachedMechanics(
        currentLocation.latitude,
        currentLocation.longitude
      );

      console.log('ðŸ“¦ Cached mechanics:', cached.length);

      if (cached.length > 0) {
        const mechanicsWithDistance = cached.map(mechanic => ({
          ...mechanic,
          distanceFromUser: calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            mechanic.latitude,
            mechanic.longitude
          )
        }));
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
        50000 // 50km radius for testing
      );

      console.log('ðŸŒ Backend result:', result);

      if (result.success && result.data) {
        console.log('âœ… Found mechanics:', result.data.length);

        // Cache to SQLite
        await cacheMechanics(result.data);

        // Calculate distances
        const mechanicsWithDistance = result.data.map(mechanic => {
          const lat = mechanic.location?.latitude || mechanic.latitude;
          const lng = mechanic.location?.longitude || mechanic.longitude;

          console.log('Mechanic location:', { name: mechanic.name, lat, lng });

          return {
            ...mechanic,
            latitude: lat,
            longitude: lng,
            distanceFromUser: calculateDistance(
              currentLocation.latitude,
              currentLocation.longitude,
              lat,
              lng
            )
          };
        });

        mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

        setMechanics(mechanicsWithDistance);
        if (onMechanicsUpdate) {
          onMechanicsUpdate(mechanicsWithDistance);
        }
      } else {
        console.log('âŒ Failed to load mechanics:', result.error);
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
      }));
      mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

      setMechanics(mechanicsWithDistance);
      if (onMechanicsUpdate) {
        onMechanicsUpdate(mechanicsWithDistance);
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  const handleCallMechanic = (phone) => {
    if (!phone) {
      Alert.alert('No Phone Number', 'This mechanic has no contact number.');
      return;
    }

    Alert.alert(
      'Call Mechanic',
      `Call ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            Linking.openURL(`tel:${phone}`);
          }
        }
      ]
    );
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
                      <Text style={styles.rating}>â­ {mechanic.rating?.toFixed(1) || 'New'}</Text>
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

                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => handleCallMechanic(mechanic.phone)}
                >
                  <Text style={styles.callButtonText}>
                    Call {mechanic.phone || 'N/A'}
                  </Text>
                </TouchableOpacity>
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
};

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
});

export default MechanicFinder;
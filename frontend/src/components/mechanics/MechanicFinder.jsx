// src/components/mechanics/MechanicFinder.jsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import authService from '../../screens/authService';

const MechanicFinder = ({ currentLocation }) => {
  const [loading, setLoading] = useState(false);
  const [mechanics, setMechanics] = useState([]);
  const [nearbyLandmarks, setNearbyLandmarks] = useState([]);
  const [showMechanics, setShowMechanics] = useState(false);
  const [showLandmarkMode, setShowLandmarkMode] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Calculate distance between two coordinates (in km)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Find mechanics directly near user's location
  const findNearbyMechanics = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      Alert.alert('Location Not Ready', 'Please wait for GPS to acquire your location.');
      return;
    }

    setLoading(true);
    setShowLandmarkMode(false);

    try {
      const result = await authService.getNearbyMechanics(
        currentLocation.latitude,
        currentLocation.longitude,
        5000 // 5km radius
      );

      setLoading(false);

      if (result.success && result.data?.length > 0) {
        // Found mechanics via API
        const mechanicsWithDistance = result.data.map(mechanic => {
          const mechLat = mechanic.location?.latitude || mechanic.location?.coordinates?.[1];
          const mechLng = mechanic.location?.longitude || mechanic.location?.coordinates?.[0];
          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            mechLat,
            mechLng
          );
          return { ...mechanic, distanceFromUser: distance };
        });

        // Sort by distance from user
        mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

        setMechanics(mechanicsWithDistance);
        setDataSource('database');
        setShowMechanics(true);
      } else {
        // No mechanics found near user, try landmark-based approach
        Alert.alert(
          'No Mechanics Found',
          'No mechanics found in your immediate area. Would you like to search near landmarks?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Search Near Landmarks', onPress: handleLandmarkBasedSearch }
          ]
        );
      }
    } catch (error) {
      setLoading(false);
      console.error('Error finding mechanics:', error);
      Alert.alert(
        'Error',
        'Failed to find mechanics. Would you like to search near landmarks?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try Landmarks', onPress: handleLandmarkBasedSearch }
        ]
      );
    }
  };

  // Landmark-based mechanic finding
  const handleLandmarkBasedSearch = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      Alert.alert('Location Not Ready', 'GPS is still initializing.');
      return;
    }

    setLoading(true);

    try {
      // Get nearby landmarks from database
      const landmarkResult = await authService.getNearbyLandmarks(
        currentLocation.latitude,
        currentLocation.longitude,
        5000
      );

      setLoading(false);

      if (landmarkResult.success && landmarkResult.data?.length > 0) {
        setNearbyLandmarks(landmarkResult.data);
        setDataSource(landmarkResult.source);
        setShowLandmarkMode(true);
        setShowMechanics(false);
        setModalVisible(true);
      } else {
        Alert.alert(
          'No Reference Points',
          'Could not find nearby landmarks in the database. Please try:\n\n' +
          '1. Sync OpenStreetMap data in the Landmarks section\n' +
          '2. Add landmarks manually\n' +
          '3. Try again when you have better network connection'
        );
      }
    } catch (error) {
      setLoading(false);
      console.error('Error finding landmarks:', error);
      Alert.alert('Error', 'Failed to find reference landmarks. Please check your connection and try again.');
    }
  };

  // Find mechanics near a specific landmark
  const findMechanicsNearLandmark = async (landmark) => {
    setSelectedLandmark(landmark);
    setLoading(true);
    setModalVisible(false);

    try {
      const lat = landmark.location?.latitude || landmark.latitude;
      const lng = landmark.location?.longitude || landmark.longitude;

      const result = await authService.getNearbyMechanics(lat, lng, 3000); // 3km from landmark

      setLoading(false);

      if (result.success && result.data?.length > 0) {
        // Add distance from user to each mechanic
        const mechanicsWithDistance = result.data.map(mechanic => {
          const mechLat = mechanic.location?.latitude || mechanic.location?.coordinates?.[1];
          const mechLng = mechanic.location?.longitude || mechanic.location?.coordinates?.[0];
          const distance = calculateDistance(
            currentLocation.latitude,
            currentLocation.longitude,
            mechLat,
            mechLng
          );
          return { ...mechanic, distanceFromUser: distance };
        });

        // Sort by distance from user
        mechanicsWithDistance.sort((a, b) => a.distanceFromUser - b.distanceFromUser);

        setMechanics(mechanicsWithDistance);
        setDataSource('database');
        setShowMechanics(true);
        setShowLandmarkMode(false);
      } else {
        // No mechanics found near this landmark
        Alert.alert(
          'No Mechanics Found',
          `No mechanics found near ${landmark.name}. Try selecting a different landmark or search directly from your location.`
        );
        setModalVisible(true); // Reopen modal to select another landmark
      }
    } catch (error) {
      setLoading(false);
      console.error('Error finding mechanics near landmark:', error);
      Alert.alert(
        'Error',
        `Failed to find mechanics near ${landmark.name}. Please try again.`
      );
      setModalVisible(true); // Reopen modal to select another landmark
    }
  };

  const handleCallMechanic = (phone) => {
    if (!phone) {
      Alert.alert('No Phone Number', 'This mechanic has no contact number on file.');
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

  const getDataSourceLabel = () => {
    switch (dataSource) {
      case 'database':
        return '☁️ Live Data';
      default:
        return '';
    }
  };

  const hasLocation = currentLocation?.latitude && currentLocation?.longitude;

  return (
    <>
      <View style={styles.container}>
        <Text style={styles.title}>🔧 Find Mechanics</Text>

        {!hasLocation && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⏳ Waiting for GPS location...
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            styles.primaryButton,
            !hasLocation && styles.buttonDisabled
          ]}
          onPress={findNearbyMechanics}
          disabled={loading || !hasLocation}
        >
          {loading && !showLandmarkMode ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>🔍 Find Nearby Mechanics</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.helperText}>
          No mechanics nearby? Try searching near landmarks as reference points!
        </Text>

        {showMechanics && (
          <View style={styles.mechanicsList}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>
                Mechanics Found ({mechanics.length})
              </Text>
              {dataSource && (
                <Text style={styles.dataSourceBadge}>
                  {getDataSourceLabel()}
                </Text>
              )}
            </View>

            {selectedLandmark && (
              <View style={styles.landmarkRefBanner}>
                <Text style={styles.landmarkRefText}>
                  📍 Near: {selectedLandmark.name}
                </Text>
              </View>
            )}

            <ScrollView
              style={styles.mechanicsScrollView}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              {mechanics.map((mechanic, index) => (
                <View key={mechanic._id || mechanic.id || index} style={styles.mechanicCard}>
                  <View style={styles.mechanicHeader}>
                    <View style={styles.mechanicInfo}>
                      <Text style={styles.mechanicName}>{mechanic.name}</Text>
                      <View style={styles.ratingRow}>
                        <Text style={styles.rating}>⭐ {mechanic.rating?.toFixed(1) || 'N/A'}</Text>
                        {mechanic.available && (
                          <Text style={styles.availableBadge}>✅ Available</Text>
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
                      📍 {mechanic.distanceFromUser?.toFixed(2) || 'N/A'} km away
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.callButton}
                    onPress={() => handleCallMechanic(mechanic.phone)}
                  >
                    <Text style={styles.callButtonText}>📞 Call {mechanic.phone || 'N/A'}</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {mechanics.length === 0 && (
                <Text style={styles.emptyText}>No mechanics found</Text>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Landmark Selection Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Choose Nearby Landmark
            </Text>
            <Text style={styles.modalSubtitle}>
              Select a landmark near you to find mechanics in that area
            </Text>

            {nearbyLandmarks.length === 0 && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>
                  ℹ️ No landmarks available. Try syncing OpenStreetMap data first.
                </Text>
              </View>
            )}

            <ScrollView style={styles.landmarkScroll}>
              {nearbyLandmarks.map((landmark, index) => {
                const lat = landmark.location?.latitude || landmark.latitude;
                const lng = landmark.location?.longitude || landmark.longitude;
                const distance = calculateDistance(
                  currentLocation.latitude,
                  currentLocation.longitude,
                  lat,
                  lng
                );

                return (
                  <TouchableOpacity
                    key={landmark._id || landmark.id || index}
                    style={styles.landmarkOption}
                    onPress={() => findMechanicsNearLandmark(landmark)}
                  >
                    <View style={styles.landmarkOptionContent}>
                      <Text style={styles.landmarkOptionName}>
                        📍 {landmark.name}
                      </Text>
                      <Text style={styles.landmarkOptionCategory}>
                        {landmark.category}
                      </Text>
                      <Text style={styles.landmarkOptionDistance}>
                        {distance.toFixed(2)} km from you
                      </Text>
                    </View>
                    <Text style={styles.landmarkOptionArrow}>→</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: '#FF6B35',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 15,
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
  mechanicsList: {
    marginTop: 15,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dataSourceBadge: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  landmarkRefBanner: {
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  landmarkRefText: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '500',
  },
  infoBanner: {
    backgroundColor: '#E3F2FD',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoText: {
    color: '#1565C0',
    fontSize: 13,
  },
  mechanicsScrollView: {
    maxHeight: 400,
  },
  mechanicCard: {
    backgroundColor: '#f9f9f9',
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
    fontWeight: '500',
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
    fontWeight: '500',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 15,
  },
  landmarkScroll: {
    maxHeight: 400,
    marginBottom: 15,
  },
  landmarkOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  landmarkOptionContent: {
    flex: 1,
  },
  landmarkOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  landmarkOptionCategory: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  landmarkOptionDistance: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '500',
  },
  landmarkOptionArrow: {
    fontSize: 24,
    color: '#999',
  },
  closeButton: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default MechanicFinder;
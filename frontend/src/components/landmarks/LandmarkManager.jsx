// src/components/landmarks/LandmarkManager.jsx
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

const LandmarkManager = ({ currentLocation, onLandmarkAdded }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncingOSM, setSyncingOSM] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [nearbyLandmarks, setNearbyLandmarks] = useState([]);
  const [showNearby, setShowNearby] = useState(false);
  const [dataSource, setDataSource] = useState(null);

  // Get current user ID on mount
  useEffect(() => {
    const loadUser = async () => {
      const user = await authService.getUser();
      if (user?.id) {
        setCurrentUserId(user.id);
      }
    };
    loadUser();
  }, []);

  const handleAddLandmark = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a landmark name');
      return;
    }

    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      Alert.alert(
        'Location Not Ready',
        'GPS is still initializing. Please wait a few seconds and try again.'
      );
      return;
    }

    setLoading(true);

    try {
      const result = await authService.createLandmark(
        name.trim(),
        description.trim(),
        category,
        currentLocation.latitude,
        currentLocation.longitude
      );

      setLoading(false);

      if (result.success) {
        Alert.alert('Success', 'Landmark added successfully!');
        setName('');
        setDescription('');
        setCategory('other');
        setModalVisible(false);

        if (onLandmarkAdded) {
          onLandmarkAdded(result.data);
        }

        // Refresh the list
        handleFetchNearby();
      } else {
        Alert.alert('Error', result.error || 'Failed to add landmark');
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
    }
  };

  const handleFetchNearby = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      Alert.alert(
        'Location Not Ready',
        'GPS is still initializing. Please wait for a location fix.'
      );
      return;
    }

    setLoading(true);

    try {
      const result = await authService.getNearbyLandmarks(
        currentLocation.latitude,
        currentLocation.longitude,
        5000
      );

      setLoading(false);

      if (result.success) {
        setNearbyLandmarks(result.data || []);
        setDataSource(result.source || 'database');
        setShowNearby(true);

        // Show helpful message if no landmarks found
        if (result.data?.length === 0) {
          Alert.alert(
            'No Landmarks Found',
            'No landmarks found in the database. Try:\n\n' +
            '1. Sync OpenStreetMap to import nearby places\n' +
            '2. Add landmarks manually\n' +
            '3. Check your network connection'
          );
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to fetch landmarks');
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
    }
  };

  const handleDeleteLandmark = async (landmarkId, landmarkName) => {
    Alert.alert(
      'Delete Landmark',
      `Are you sure you want to delete "${landmarkName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await authService.deleteLandmark(landmarkId);
              setLoading(false);

              if (result.success) {
                Alert.alert('Success', 'Landmark deleted successfully!');
                // Remove from list
                setNearbyLandmarks(prev => prev.filter(l => (l._id || l.id) !== landmarkId));
              } else {
                Alert.alert('Error', result.error || 'Failed to delete landmark');
              }
            } catch (error) {
              setLoading(false);
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const handleSyncOpenStreetMap = async () => {
    if (!currentLocation?.latitude || !currentLocation?.longitude) {
      Alert.alert('Error', 'Location not available. Please wait for GPS fix.');
      return;
    }

    Alert.alert(
      'Sync OpenStreetMap',
      'This will fetch nearby places from OpenStreetMap and save them to your database. This may take a few moments.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync',
          onPress: async () => {
            setSyncingOSM(true);

            try {
              const result = await authService.syncOpenStreetMapToBackend(
                currentLocation.latitude,
                currentLocation.longitude,
                5000
              );

              setSyncingOSM(false);

              if (result.success) {
                const message = result.synced > 0
                  ? `Successfully synced ${result.synced} new places!\n\n` +
                    `Duplicates skipped: ${result.duplicate || 0}\n` +
                    `Failed: ${result.failed || 0}\n` +
                    `Total found: ${result.total || 0}`
                  : `No new places to sync.\n\n` +
                    `Duplicates skipped: ${result.duplicate || 0}\n` +
                    `Total found: ${result.total || 0}`;

                Alert.alert(
                  'Sync Complete! 🎉',
                  message,
                  [{ text: 'OK', onPress: () => handleFetchNearby() }]
                );
              } else {
                Alert.alert('Sync Failed', result.error || 'Failed to sync places from OpenStreetMap');
              }
            } catch (error) {
              setSyncingOSM(false);
              Alert.alert('Error', error.message || 'Failed to sync OpenStreetMap data');
            }
          },
        },
      ]
    );
  };

  const getCategoryEmoji = (cat) => {
    const found = CATEGORIES.find(c => c.value === cat);
    return found ? found.emoji : '📍';
  };

  const getDataSourceLabel = () => {
    switch (dataSource) {
      case 'database':
        return '☁️ Database';
      case 'osm':
        return '🗺️ OpenStreetMap';
      default:
        return '☁️ Live Data';
    }
  };

  const hasLocation = currentLocation?.latitude && currentLocation?.longitude;

  return (
    <>
      <View style={styles.container}>
        <Text style={styles.title}>🗺️ Landmarks</Text>

        {!hasLocation && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⏳ Waiting for GPS location...</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton, !hasLocation && styles.buttonDisabled]}
            onPress={() => setModalVisible(true)}
            disabled={!hasLocation}
          >
            <Text style={styles.buttonText}>➕ Add Landmark</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, !hasLocation && styles.buttonDisabled]}
            onPress={handleFetchNearby}
            disabled={loading || !hasLocation}
          >
            {loading && !syncingOSM ? (
              <ActivityIndicator color="#007AFF" size="small" />
            ) : (
              <Text style={styles.buttonTextSecondary}>🔍 View Nearby</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.osmButton, !hasLocation && styles.buttonDisabled]}
          onPress={handleSyncOpenStreetMap}
          disabled={syncingOSM || !hasLocation}
        >
          {syncingOSM ? (
            <View style={styles.syncingContainer}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={[styles.buttonText, styles.syncingText]}>Syncing...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>🗺️ Sync OpenStreetMap</Text>
          )}
        </TouchableOpacity>

        {showNearby && (
          <View style={styles.landmarksList}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Nearby Landmarks ({nearbyLandmarks.length})</Text>
              {dataSource && (
                <Text style={styles.dataSourceBadge}>{getDataSourceLabel()}</Text>
              )}
            </View>

            <ScrollView style={styles.scrollView} nestedScrollEnabled={true}>
              {nearbyLandmarks.map((landmark, index) => {
                const landmarkId = landmark._id || landmark.id;
                const isCreator = landmark.createdBy === currentUserId;

                return (
                  <View key={landmarkId || index} style={styles.landmarkItem}>
                    <View style={styles.landmarkHeader}>
                      <View style={styles.landmarkMainInfo}>
                        <Text style={styles.landmarkName}>
                          {getCategoryEmoji(landmark.category)} {landmark.name}
                        </Text>
                        {landmark.description && (
                          <Text style={styles.landmarkDescription}>{landmark.description}</Text>
                        )}
                        <Text style={styles.landmarkCategory}>
                          Category: {landmark.category}
                          {landmark.createdByUsername && ` • By ${landmark.createdByUsername}`}
                        </Text>
                      </View>

                      {isCreator && landmarkId && (
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
              {nearbyLandmarks.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No landmarks found nearby</Text>
                  <Text style={styles.emptyHint}>
                    Try syncing OpenStreetMap or adding landmarks manually
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}
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
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              editable={!loading}
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
                  disabled={loading}
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
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleAddLandmark}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Add</Text>
                )}
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  osmButton: {
    backgroundColor: '#7EBC89',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  syncingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncingText: {
    marginLeft: 8,
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
  landmarksList: {
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
  landmarkDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  landmarkCategory: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 10,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    fontSize: 16,
    marginBottom: 8,
  },
  emptyHint: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 12,
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
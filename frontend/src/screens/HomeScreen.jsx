// src/screens/HomeScreen.jsx
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LandmarkManager from '../components/landmarks/LandmarkManager';
import MultiModalLocationTracker from '../components/location/MultiModalLocationTracker';
import OfflineMapView from '../components/map/OfflineMapView';
import MechanicFinder from '../components/mechanics/MechanicFinder';
import authService from '../screens/authService';

const HomeScreen = ({ navigation, route }) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [landmarks, setLandmarks] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const mechanicFinderRef = useRef(null);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            const result = await authService.logout();
            if (result.success) {
              navigation.replace('Login');
            } else {
              Alert.alert('Error', 'Failed to logout');
            }
          },
        },
      ]
    );
  };

  const handleLocationUpdate = (location) => {
    setCurrentLocation(location);
  };

  const handleLandmarksUpdate = (landmarkList) => {
    setLandmarks(landmarkList);
  };

  const handleMechanicsUpdate = (mechanicList) => {
    setMechanics(mechanicList);
  };

  // Handle refresh when returning from review screen
  useEffect(() => {
    if (route?.params?.refreshMechanics && mechanicFinderRef.current) {
      console.log('Refreshing mechanics after review submission');
      mechanicFinderRef.current.refreshMechanics();
      // Clear the parameter to avoid repeated refreshes
      navigation.setParams({ refreshMechanics: false });
    }
  }, [route?.params?.refreshMechanics]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <MultiModalLocationTracker
          onLocationUpdate={handleLocationUpdate}
          onLandmarksUpdate={handleLandmarksUpdate}
          onMechanicsUpdate={handleMechanicsUpdate}
        />

        <OfflineMapView
          currentLocation={currentLocation}
          landmarks={landmarks}
          mechanics={mechanics}
        />

        <MechanicFinder
          ref={mechanicFinderRef}
          currentLocation={currentLocation}
          onMechanicsUpdate={handleMechanicsUpdate}
          navigation={navigation}
        />

        <LandmarkManager
          currentLocation={currentLocation}
          onLandmarksUpdate={handleLandmarksUpdate}
        />
      </ScrollView>

      <TouchableOpacity
        style={styles.profileButton}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.profileButtonText}>👤 Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutButtonText}>🔒 Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  profileButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  profileButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreen;
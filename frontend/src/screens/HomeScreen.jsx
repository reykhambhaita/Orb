// src/screens/HomeScreen.jsx
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LandmarkManager from '../components/landmarks/LandmarkManager';
import MultiModalLocationTracker from '../components/location/MultiModalLocationTracker';
import MechanicFinder from '../components/mechanics/MechanicFinder';
import authService from '../screens/authService';

const HomeScreen = ({ navigation }) => {
  const [currentLocation, setCurrentLocation] = useState(null);

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

  const handleLandmarkAdded = (landmark) => {
    console.log('Landmark added:', landmark);
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <MultiModalLocationTracker
          onLocationUpdate={handleLocationUpdate}
        />

        {/* NEW: Mechanic Finder Component */}
        <MechanicFinder
          currentLocation={currentLocation}
        />

        <LandmarkManager
          currentLocation={currentLocation}
          onLandmarkAdded={handleLandmarkAdded}
        />
      </ScrollView>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutButtonText}>🚪 Logout</Text>
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
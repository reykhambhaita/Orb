// src/screens/MainScreen.jsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import MultiModalLocationTracker from '../components/location/MultiModalLocationTracker';
import CustomBottomNavigation from '../components/navigation/CustomBottomNavigation';
import { useTheme } from '../context/ThemeContext';
import authService from './authService';
import HomeScreen from './HomeScreen';
import ProfileScreen from './ProfileScreen';
import SearchScreen from './SearchScreen';

const MainScreen = ({ navigation, route }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('Home');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [landmarks, setLandmarks] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [user, setUser] = useState(null);
  const trackerRef = useRef(null);

  useEffect(() => {
    const fetchUser = async () => {
      const result = await authService.getCurrentUser();
      if (result.success) {
        setUser(result.user);
      }
    };
    fetchUser();
  }, []);

  // Switch to Search tab if a mechanicId is passed via navigation params (e.g., from Map tooltips)
  useEffect(() => {
    if (route.params?.mechanicId) {
      console.log('🔄 MainScreen: Deep-link detected, switching to Search tab');
      setActiveTab('Search');
    }
  }, [route.params?.mechanicId]);

  useLayoutEffect(() => {
    // Ensure header is shown for Home and Profile
    // We don't set the title here for Home because HomeScreen has a custom header component
    if (activeTab === 'Home' || activeTab === 'Profile') {
      navigation.setOptions({
        headerShown: true,
      });
    } else if (activeTab === 'Search') {
      // Optional: Hide header for search if desired, or set a simple title
      navigation.setOptions({
        headerShown: false,
        headerTitle: 'Search',
      });
    }
  }, [navigation, activeTab]);


  const handleLocationUpdate = (location) => {
    setCurrentLocation(location);
  };

  const handleLandmarksUpdate = (landmarkList) => {
    setLandmarks(landmarkList);
  };

  const handleMechanicsUpdate = (mechanicList) => {
    setMechanics(mechanicList);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return (
          <HomeScreen
            navigation={navigation}
            route={route}
            currentLocation={currentLocation}
            landmarks={landmarks}
            mechanics={mechanics}
            trackerRef={trackerRef}
            user={user}
          />
        );
      case 'Search':
        return (
          <SearchScreen
            navigation={navigation}
            route={route}
            currentLocation={currentLocation}
            onLandmarksUpdate={handleLandmarksUpdate}
            onMechanicsUpdate={handleMechanicsUpdate}
          />
        );
      case 'Profile':
        return (
          <ProfileScreen
            navigation={navigation}
            route={route}
          />
        );
      default:
        return null;
    }
  };

  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 1000 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.background }, animatedStyle]}>
      <MultiModalLocationTracker
        ref={trackerRef}
        onLocationUpdate={handleLocationUpdate}
        onLandmarksUpdate={handleLandmarksUpdate}
        onMechanicsUpdate={handleMechanicsUpdate}
      />

      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      <CustomBottomNavigation
        activeTab={activeTab}
        onTabPress={setActiveTab}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
});

export default MainScreen;

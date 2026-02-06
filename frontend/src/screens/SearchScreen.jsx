import { Ionicons } from '@expo/vector-icons';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import LandmarkManager from '../components/landmarks/LandmarkManager';
import MechanicFinder from '../components/mechanics/MechanicFinder';
import { useTheme } from '../context/ThemeContext';

const SearchScreen = ({ navigation, route, currentLocation, onLandmarksUpdate, onMechanicsUpdate }) => {
  const { theme, isDark } = useTheme();
  const [searchLocation, setSearchLocation] = useState(currentLocation);
  const [searchLocationName, setSearchLocationName] = useState(null);
  const [landmarkSearchQuery, setLandmarkSearchQuery] = useState('');
  const mechanicFinderRef = useRef(null);
  const landmarkManagerRef = useRef(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    if (!searchLocationName) {
      setSearchLocation(currentLocation);
    }
  }, [currentLocation, searchLocationName]);

  const handleLandmarkClick = (landmark) => {
    const landmarkLocation = {
      latitude: landmark.latitude,
      longitude: landmark.longitude,
    };
    setSearchLocation(landmarkLocation);
    setSearchLocationName(landmark.name);
  };

  const handleResetToGPS = () => {
    setSearchLocation(currentLocation);
    setSearchLocationName(null);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search Bar Row */}
          <View style={styles.searchRow}>
            <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search clues or landmarks..."
                placeholderTextColor={theme.textSecondary}
                value={landmarkSearchQuery}
                onChangeText={(text) => {
                  setLandmarkSearchQuery(text);
                  if (text.length > 0) {
                    landmarkManagerRef.current?.openLandmarkList();
                  }
                }}
              />
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: isDark ? '#fff' : (theme.primary || '#111111') }]}
              onPress={() => landmarkManagerRef.current?.openAddLandmark()}
            >
              <Ionicons name="add" size={24} color={isDark ? '#000' : '#fff'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: isDark ? '#fff' : (theme.primary || '#111111') }]}
              onPress={() => landmarkManagerRef.current?.openLandmarkList()}
            >
              <Ionicons name="map-outline" size={22} color={isDark ? '#000' : '#fff'} />
            </TouchableOpacity>
          </View>

          <MechanicFinder
            ref={mechanicFinderRef}
            searchLocation={searchLocation}
            searchLocationName={searchLocationName}
            onResetToGPS={handleResetToGPS}
            onMechanicsUpdate={onMechanicsUpdate}
            navigation={navigation}
            onFilterPress={() => landmarkManagerRef.current?.openLandmarkList()}
            targetMechanicId={route.params?.mechanicId}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <LandmarkManager
        ref={landmarkManagerRef}
        currentLocation={currentLocation}
        onLandmarksUpdate={onLandmarksUpdate}
        onLandmarkClick={handleLandmarkClick}
        searchQuery={landmarkSearchQuery}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 43,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 100, // Space for bottom bar
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    padding: 0,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SearchScreen;

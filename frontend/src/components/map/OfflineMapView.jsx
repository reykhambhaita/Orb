import { Ionicons } from '@expo/vector-icons';
import * as MapLibreGL from '@maplibre/maplibre-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

MapLibreGL.setConnected(true);

const OfflineMapView = ({ currentLocation, landmarks = [], mechanics = [], navigation, isFullScreen }) => {
  const handleMechanicClick = (mechanic) => {
    if (navigation) {
      console.log('🗺️ Map: Navigating to Main with mechanicId', mechanic.id || mechanic._id);
      navigation.navigate('Main', { mechanicId: mechanic.id || mechanic._id });
    }
  };

  const centerCoordinate = currentLocation?.latitude && currentLocation?.longitude
    ? [currentLocation.longitude, currentLocation.latitude]
    : [0, 0];

  return (
    <View style={[styles.container, isFullScreen && styles.fullScreenContainer]}>
      {!isFullScreen && (
        <View style={styles.mapHeader}>
          <Ionicons name="map-outline" size={20} color="#111111" />
          <Text style={styles.title}>Live Mechanics Map</Text>
        </View>
      )}

      <View style={styles.mapArea}>
        <MapLibreGL.MapView
          style={styles.map}
          mapStyle={require('../../../assets/maps/streets-v4-style.json')}
          compassEnabled={true}
          logoEnabled={false}
          scaleBarEnabled={true}
        >
          <MapLibreGL.Camera
            zoomLevel={14}
            centerCoordinate={centerCoordinate}
            animationMode="flyTo"
            animationDuration={1000}
          />

          <MapLibreGL.UserLocation
            visible={true}
            showsUserHeadingIndicator={true}
          />

          {/* User Location Marker with Pulse */}
          {currentLocation?.latitude && currentLocation?.longitude && (
            <MapLibreGL.PointAnnotation
              id="user-location"
              coordinate={[currentLocation.longitude, currentLocation.latitude]}
            >
              <View style={[styles.marker, styles.userMarker]}>
                <View style={styles.userPulse} />
                <View style={styles.userDot} />
              </View>
            </MapLibreGL.PointAnnotation>
          )}

          {/* Landmark Markers */}
          {landmarks.map((landmark, index) => {
            const lng = landmark.longitude || landmark.location?.longitude;
            const lat = landmark.latitude || landmark.location?.latitude;

            if (!lng || !lat) return null;

            return (
              <MapLibreGL.PointAnnotation
                key={`landmark-${landmark.id || landmark._id || index}`}
                id={`landmark-${landmark.id || landmark._id || index}`}
                coordinate={[lng, lat]}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={styles.landmarkMarker}>
                  <View style={styles.landmarkDot} />
                  <View style={styles.landmarkLabelContainer}>
                    <Text style={styles.landmarkLabel}>{landmark.name}</Text>
                  </View>
                </View>
              </MapLibreGL.PointAnnotation>
            );
          })}

          {/* Mechanic Markers */}
          {mechanics.map((mechanic, index) => {
            const lng = mechanic.longitude || mechanic.location?.longitude;
            const lat = mechanic.latitude || mechanic.location?.latitude;

            if (!lng || !lat) return null;

            return (
              <MapLibreGL.PointAnnotation
                key={`mechanic-${mechanic.id || mechanic._id || index}`}
                id={`mechanic-${mechanic.id || mechanic._id || index}`}
                coordinate={[lng, lat]}
                anchor={{ x: 0.5, y: 1 }}
              >
                <TouchableOpacity
                  onPress={() => handleMechanicClick(mechanic)}
                  activeOpacity={0.8}
                  style={styles.tooltipContainer}
                >
                  <View style={styles.tooltipContent}>
                    <Text style={styles.tooltipName} numberOfLines={1}>{mechanic.name}</Text>
                    <View style={styles.tooltipRating}>
                      <Ionicons name="star" size={10} color="#FFD700" />
                      <Text style={styles.tooltipRatingText}>{(mechanic.rating || 0).toFixed(1)}</Text>
                    </View>
                  </View>
                  <View style={styles.tooltipArrow} />
                </TouchableOpacity>
              </MapLibreGL.PointAnnotation>
            );
          })}
        </MapLibreGL.MapView>

        {/* Mechanic Count Overlay */}
        {isFullScreen && (
          <View style={styles.countOverlay}>
            <View style={styles.countBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.countText}>
                {mechanics.length} mechanics active in your area
              </Text>
            </View>
          </View>
        )}
      </View>

      {!isFullScreen && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {mechanics.length} mechanics active • Tap to view details
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 380,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  fullScreenContainer: {
    height: '100%',
    width: '100%',
    borderRadius: 0,
    marginBottom: 0,
    borderWidth: 0,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarker: {
    zIndex: 10,
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  userPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  landmarkMarker: {
    alignItems: 'center',
  },
  landmarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    opacity: 0.6,
  },
  landmarkLabelContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  landmarkLabel: {
    fontSize: 9,
    color: '#065F46',
    fontWeight: '600',
  },
  tooltipContainer: {
    alignItems: 'center',
    zIndex: 5,
  },
  tooltipContent: {
    backgroundColor: '#111111',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  tooltipName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 90,
  },
  tooltipRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tooltipRatingText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#111111',
    marginTop: -1,
  },
  countOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 20,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: -0.2,
  },
  footer: {
    padding: 12,
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '500',
  }
});

export default OfflineMapView;
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';

const LocationHeaderModal = ({
  visible,
  onClose,
  currentLocation,
  networkStatus,
  locationSources,
  showAddressFeedback,
  onAddressCorrect,
  onAddressIncorrect,
}) => {
  const { theme, isDark } = useTheme();
  // Calculate active sources
  const getActiveSources = () => {
    if (!locationSources) return [];
    const now = Date.now();
    const SOURCE_TIMEOUT_MS = 10000;

    return Object.entries(locationSources)
      .filter(([_, source]) =>
        source?.timestamp > now - SOURCE_TIMEOUT_MS &&
        source.latitude !== null &&
        source.longitude !== null
      )
      .map(([name, source]) => ({
        name,
        accuracy: source.accuracy,
      }));
  };

  const activeSources = getActiveSources();
  const translateY = useSharedValue(600);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 90,
      });
    } else {
      translateY.value = 600;
    }
  }, [visible]);

  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleClose = () => {
    translateY.value = withTiming(600, { duration: 250 }, () => {
      runOnJS(onClose)();
    });
  };

  const textColor = isDark ? '#FFFFFF' : '#111111';
  const textSecondaryColor = isDark ? '#A0A0A0' : '#888888';
  const iconColor = isDark ? '#FFFFFF' : '#666666';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[styles.modalContent, animatedContentStyle, { backgroundColor: isDark ? '#000000' : '#ffffff' }]}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Ionicons name="close" size={24} color={iconColor} />
          </TouchableOpacity>

          {/* Address */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textSecondaryColor }]}>📍 Current Location</Text>
              {currentLocation?.addressSource && (
                <View style={[styles.sourceBadge, { backgroundColor: isDark ? '#333' : '#f3f4f6' }]}>
                  <Text style={[styles.sourceBadgeText, { color: textSecondaryColor }]}>
                    {currentLocation.addressSource.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.addressText, { color: textColor }]}>
              {currentLocation?.address || 'Acquiring location...'}
            </Text>
          </View>

          {/* Address Feedback Buttons */}
          {showAddressFeedback &&
            currentLocation?.address &&
            currentLocation.address !== 'Address unavailable' && (
              <View style={styles.feedbackContainer}>
                <TouchableOpacity
                  style={[styles.feedbackButton, { borderColor: textColor }]}
                  onPress={onAddressCorrect}
                >
                  <Text style={[styles.feedbackButtonText, { color: textColor }]}>✓ Correct</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackButton, styles.feedbackButtonIncorrect, { borderColor: isDark ? '#444' : '#e5e7eb' }]}
                  onPress={onAddressIncorrect}
                >
                  <Text style={[styles.feedbackButtonText, { color: textColor }]}>✗ Not quite right</Text>
                </TouchableOpacity>
              </View>
            )}

          {/* Coordinates */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSecondaryColor }]}>Coordinates</Text>
            <Text style={[styles.coordsText, { color: textColor }]}>
              Lat: {currentLocation?.latitude?.toFixed(6) || 'N/A'}
              {'\n'}
              Lng: {currentLocation?.longitude?.toFixed(6) || 'N/A'}
            </Text>
          </View>

          {/* Network Status */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSecondaryColor }]}>Network Status</Text>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusIndicator,
                networkStatus?.isConnected ? styles.statusOnline : styles.statusOffline
              ]} />
              <Text style={[styles.statusText, { color: textColor }]}>
                {networkStatus?.isConnected ? 'Online' : 'Offline'}
                {networkStatus?.type && networkStatus.type !== 'none'
                  ? ` (${networkStatus.type})`
                  : ''}
              </Text>
            </View>
          </View>

          {/* Accuracy & Resources */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSecondaryColor }]}>Accuracy & Resources</Text>
            <Text style={[styles.accuracyText, { color: textColor }]}>
              Accuracy: {currentLocation?.accuracy
                ? `±${currentLocation.accuracy.toFixed(1)}m`
                : 'N/A'}
            </Text>
            {activeSources.length > 0 && (
              <View style={styles.sourcesContainer}>
                <Text style={[styles.sourcesLabel, { color: textSecondaryColor }]}>Active Sources:</Text>
                {activeSources.map((source, index) => (
                  <View key={index} style={styles.sourceItem}>
                    <Text style={[styles.sourceText, { color: textColor }]}>
                      • {source.name.toUpperCase()}: ±{source.accuracy?.toFixed(1) || 'N/A'}m
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
    padding: 5,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  addressText: {
    fontSize: 16,
    color: '#111111',
    fontWeight: '600',
    lineHeight: 24,
  },
  feedbackContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  feedbackButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#111111',
    alignItems: 'center',
  },
  feedbackButtonIncorrect: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
  },
  feedbackButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  coordsText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#333',
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  statusOffline: {
    backgroundColor: '#F44336',
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  accuracyText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 10,
  },
  sourcesContainer: {
    marginTop: 8,
  },
  sourcesLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    fontWeight: '500',
  },
  sourceItem: {
    marginLeft: 8,
    marginBottom: 4,
  },
  sourceText: {
    fontSize: 12,
    color: '#555',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

export default LocationHeaderModal;

import { RussoOne_400Regular, useFonts } from '@expo-google-fonts/russo-one';
import { Ionicons } from '@expo/vector-icons';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

const PermissionsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [fontsLoaded] = useFonts({
    RussoOne_400Regular,
  });

  const [permissions, setPermissions] = useState({
    location: false,
    camera: false,
    photos: false,
    notification: false,
  });

  const [isLoading, setIsLoading] = useState(true);

  const checkPermissions = async () => {
    try {
      // 1. Location
      const { status: locationStatus } = await Location.getForegroundPermissionsAsync();

      // 2. Camera
      const { status: cameraStatus } = await Camera.getCameraPermissionsAsync();

      // 3. Photos
      const { status: photoStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();

      // 4. Notifications
      const { status: notificationStatus } = await Notifications.getPermissionsAsync();

      setPermissions({
        location: locationStatus === 'granted',
        camera: cameraStatus === 'granted',
        photos: photoStatus === 'granted',
        notification: notificationStatus === 'granted',
      });
    } catch (error) {
      console.error('Error checking permissions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkPermissions();

    // Refresh permissions when app comes back from background (user returns from settings)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleOpenSettings = () => {
    Alert.alert(
      'Permission Required',
      'Please enable this permission in your device settings to use this feature.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
  };

  const togglePermission = async (key) => {
    // If it's already true, we can't easily revoke it from JS on most OSes.
    // We should tell them to go to settings if they want to disable it.
    if (permissions[key]) {
      Alert.alert(
        'Disable Permission',
        'To disable this permission, please go to your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // Otherwise, attempt to request it
    try {
      let result;
      switch (key) {
        case 'location':
          result = await Location.requestForegroundPermissionsAsync();
          if (result.status !== 'granted') handleOpenSettings();
          break;
        case 'camera':
          result = await Camera.requestCameraPermissionsAsync();
          if (result.status !== 'granted') handleOpenSettings();
          break;
        case 'photos':
          result = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (result.status !== 'granted') handleOpenSettings();
          break;
        case 'notification':
          result = await Notifications.requestPermissionsAsync();
          if (result.status !== 'granted') handleOpenSettings();
          break;
      }
      // Re-verify after request
      checkPermissions();
    } catch (error) {
      console.error(`Error requesting ${key} permission:`, error);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: 'App Permissions',
      headerStyle: {
        backgroundColor: theme.card,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      },
      headerTintColor: theme.text,
      headerTitleStyle: {
        fontWeight: '600',
      },
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginLeft: 16 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme]);

  if (!fontsLoaded) {
    return null;
  }

  const PermissionItem = ({ icon, label, description, value, onToggle }) => (
    <View style={[styles.permissionItem, { borderBottomColor: theme.border }]}>
      <View style={styles.permissionIconContainer}>
        <Ionicons name={icon} size={24} color={theme.text} />
      </View>
      <View style={styles.permissionTextContainer}>
        <Text style={[styles.permissionLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.permissionDescription, { color: theme.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: theme.border, true: '#111' }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>APP PERMISSIONS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <PermissionItem
              icon="location-outline"
              label="Location"
              description="Find mechanics near you"
              value={permissions.location}
              onToggle={() => togglePermission('location')}
            />
            <PermissionItem
              icon="camera-outline"
              label="Camera (optional)"
              description="Take photos of vehicle issues"
              value={permissions.camera}
              onToggle={() => togglePermission('camera')}
            />
            <PermissionItem
              icon="images-outline"
              label="Photos"
              description="Select avatar from your library"
              value={permissions.photos}
              onToggle={() => togglePermission('photos')}
            />
            <PermissionItem
              icon="notifications-outline"
              label="Notifications"
              description="Get updates on your requests"
              value={permissions.notification}
              onToggle={() => togglePermission('notification')}
            />
          </View>
        </View>

        <View style={styles.infoSection}>
          <Ionicons name="shield-checkmark-outline" size={32} color={theme.textSecondary} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Your privacy is important to us. These permissions allow the app to function properly and provide you with the best experience.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: 1,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  permissionIconContainer: {
    width: 40,
    alignItems: 'center',
  },
  permissionTextContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  permissionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  permissionDescription: {
    fontSize: 12,
  },
  infoSection: {
    marginTop: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});

export default PermissionsScreen;

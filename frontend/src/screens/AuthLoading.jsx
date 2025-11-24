// src/screens/AuthLoadingScreen.jsx
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import authService from './authService';

const AuthLoadingScreen = ({ navigation }) => {
  const [statusMessage, setStatusMessage] = useState('Initializing...');

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setStatusMessage('Checking authentication...');

      // Initialize auth service
      await authService.initialize();

      // Check if user is authenticated (has token)
      const isAuthenticated = await authService.isAuthenticated();

      if (isAuthenticated) {
        setStatusMessage('Verifying credentials...');

        // Verify token is still valid by fetching current user
        const result = await authService.getCurrentUser();

        if (result.success) {
          // User is authenticated (either online or offline with cached data)
          if (result.offline) {
            console.log('Offline mode: Using cached user data');
            setStatusMessage('Offline mode - Using cached data');
          } else {
            console.log('User authenticated:', result.user);
            setStatusMessage('Authentication successful!');
          }

          // Small delay to show success message
          setTimeout(() => {
            navigation.replace('Home');
          }, 100);
        } else {
          // Token is invalid or expired, go to login
          console.log('Token invalid, redirecting to login');
          setStatusMessage('Session expired');
          setTimeout(() => {
            navigation.replace('Login');
          }, 100);
        }
      } else {
        // Not authenticated, go to login
        console.log('Not authenticated, redirecting to login');
        setStatusMessage('Please log in');
        setTimeout(() => {
          navigation.replace('Login');
        }, 100);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setStatusMessage('Error checking authentication');

      // On error, try to use cached credentials if available
      try {
        const isAuthenticated = await authService.isAuthenticated();
        if (isAuthenticated) {
          console.log('Network error, but user has cached credentials');
          setStatusMessage('Offline mode - Using cached data');
          setTimeout(() => {
            navigation.replace('Home');
          }, 100);
          return;
        }
      } catch (cacheError) {
        console.error('Cache check error:', cacheError);
      }

      // If no cached credentials, go to login
      setTimeout(() => {
        navigation.replace('Login');
      }, 100);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ORMS</Text>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.subtitle}>{statusMessage}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default AuthLoadingScreen;
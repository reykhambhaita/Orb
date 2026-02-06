import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AuthLoadingScreen from './src/screens/AuthLoading';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import GetStartedScreen from './src/screens/GetStartedScreen';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';
import MechanicDetailScreen from './src/screens/MechanicDetailScreen';
import OTPScreen from './src/screens/OTPScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import PermissionsScreen from './src/screens/PermissionsScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import ReviewMechanicScreen from './src/screens/ReviewMechanicScreen';
import RoleSelectionScreen from './src/screens/RoleSelectionScreen';
import SignupScreen from './src/screens/SignupScreen';
import authService from './src/screens/authService';
import syncManager from './src/utils/SyncManager';
import config from './tamagui.config';

const Stack = createNativeStackNavigator();

function NavigationStack() {
  const { isDark, theme } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="AuthLoading"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
            animation: 'fade',
          }}
        >
          {/* Auth Loading Screen - checks if user is logged in */}
          <Stack.Screen
            name="AuthLoading"
            component={AuthLoadingScreen}
            options={{ headerShown: false }}
          />

          <Stack.Screen
            name="GetStarted"
            component={GetStartedScreen}
            options={{ headerShown: false }}
          />

          {/* Auth Screens */}
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          <Stack.Screen
            name="OTP"
            component={OTPScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          <Stack.Screen
            name="RoleSelection"
            component={RoleSelectionScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          <Stack.Screen
            name="MechanicDetail"
            component={MechanicDetailScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right'
            }}
          />

          {/* Main App Screens */}
          <Stack.Screen
            name="Main"
            component={MainScreen}
            options={{
              headerShown: true,
            }}
          />

          <Stack.Screen
            name="ReviewMechanic"
            component={ReviewMechanicScreen}
            options={{
              headerShown: true,
              title: 'Rate Mechanic',
              headerStyle: {
                backgroundColor: theme.card,
                shadowColor: theme.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              },
              headerTintColor: theme.text,
              headerTitleStyle: {
                fontWeight: '600',
              },
            }}
          />

          {/* Payment Screen */}
          <Stack.Screen
            name="Payment"
            component={PaymentScreen}
            options={{
              headerShown: true,
              title: 'Make Payment',
              headerStyle: {
                backgroundColor: theme.card,
                shadowColor: theme.shadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              },
              headerTintColor: theme.text,
              headerTitleStyle: {
                fontWeight: '600',
              },
            }}
          />
          <Stack.Screen
            name="Permissions"
            component={PermissionsScreen}
            options={{
              headerShown: true,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [userName, setUserName] = useState('Welcome');

  useEffect(() => {
    // Initialize SyncManager and fetch user data
    const initializeApp = async () => {
      try {
        // Wait for SyncManager to initialize (ensures network status is known)
        await syncManager.init();
        console.log('✅ SyncManager initialized');

        // Fetch user data
        const result = await authService.getCurrentUser();
        if (result.success && result.user) {
          setUserName(result.user.username || 'Welcome');
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('📱 App going to background, syncing pending items...');
        syncManager.syncAllPendingChanges();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TamaguiProvider config={config} defaultTheme="light">
        <ThemeProvider>
          <SafeAreaProvider>
            <NavigationStack />
          </SafeAreaProvider>
        </ThemeProvider>
      </TamaguiProvider>
    </GestureHandlerRootView>
  );
}
// App.js or your navigation file
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthLoadingScreen from './src/screens/AuthLoading';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="AuthLoading"
        screenOptions={{
          headerShown: false,
        }}
      >
        {/* Auth Loading Screen - checks if user is logged in */}
        <Stack.Screen
          name="AuthLoading"
          component={AuthLoadingScreen}
          options={{ headerShown: false }}
        />

        {/* Auth Screens */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Signup"
          component={SignupScreen}
          options={{ headerShown: false }}
        />

        {/* Main App Screens */}
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerShown: true,
            title: 'ORMS Tracker',
            headerStyle: {
              backgroundColor: '#007AFF',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
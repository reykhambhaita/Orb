// src/screens/SignupScreen.jsx
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import authService from '../screens/authService';

const SignupScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('user');

  // NEW: Mechanic-specific fields
  const [mechanicName, setMechanicName] = useState('');
  const [mechanicPhone, setMechanicPhone] = useState('');

  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !username || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // Validate mechanic fields if role is mechanic
    if (role === 'mechanic') {
      if (!mechanicName || !mechanicPhone) {
        Alert.alert('Error', 'Please provide your name and phone number');
        return;
      }
      if (mechanicPhone.length < 10) {
        Alert.alert('Error', 'Please provide a valid phone number');
        return;
      }
    }


    setLoading(true);

    // NEW: Prepare mechanic data if applicable
    const mechanicData = role === 'mechanic' ? {
      name: mechanicName,
      phone: mechanicPhone,
      specialties: [],
      available: true
    } : undefined;

    const result = await authService.signup(email, username, password, role, mechanicData);
    setLoading(false);

    if (result.success) {
      console.log('Signup successful:', result.user);
      navigation.replace('Home');
    } else {
      Alert.alert('Signup Failed', result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join ORMS today</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />

          {/* Role Selection */}
          <View style={styles.roleContainer}>
            <Text style={styles.roleLabel}>I am a:</Text>
            <View style={styles.roleButtons}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'user' && styles.roleButtonActive,
                ]}
                onPress={() => setRole('user')}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    role === 'user' && styles.roleButtonTextActive,
                  ]}
                >
                  👤 User
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'mechanic' && styles.roleButtonActive,
                ]}
                onPress={() => setRole('mechanic')}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.roleButtonText,
                    role === 'mechanic' && styles.roleButtonTextActive,
                  ]}
                >
                  🔧 Mechanic
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* NEW: Mechanic-specific fields */}
          {role === 'mechanic' && (
            <View style={styles.mechanicFields}>
              <Text style={styles.sectionTitle}>Mechanic Profile</Text>

              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={mechanicName}
                onChangeText={setMechanicName}
                editable={!loading}
              />

              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                value={mechanicPhone}
                onChangeText={setMechanicPhone}
                keyboardType="phone-pad"
                editable={!loading}
              />

              <Text style={styles.helperText}>
                📍 Your location will be set when you start the app
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Login')}
            disabled={loading}
          >
            <Text style={styles.linkText}>
              Already have an account? Login
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  roleContainer: {
    marginBottom: 20,
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  roleButton: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  roleButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  roleButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  roleButtonTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  mechanicFields: {
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#007AFF',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: -5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
});

export default SignupScreen;
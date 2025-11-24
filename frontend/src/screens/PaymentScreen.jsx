// src/screens/PaymentScreen.jsx
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
import authService from './authService';

const PaymentScreen = ({ route, navigation }) => {
  const { mechanicId, mechanicName, mechanicPhone } = route.params || {};

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    const paymentAmount = parseFloat(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount');
      return;
    }

    if (!mechanicId) {
      Alert.alert('Error', 'Mechanic information is missing');
      return;
    }

    Alert.alert(
      'Confirm Payment',
      `Pay $${paymentAmount.toFixed(2)} to ${mechanicName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay',
          onPress: async () => {
            setLoading(true);

            try {
              // Create PayPal order
              const orderResult = await authService.createPayPalOrder(
                paymentAmount,
                mechanicId,
                description || `Payment to ${mechanicName}`
              );

              if (!orderResult.success) {
                throw new Error(orderResult.error || 'Failed to create payment order');
              }

              const { orderId, paymentId } = orderResult.data;

              // In a real app, you would open PayPal checkout here
              // For now, we'll simulate immediate capture
              Alert.alert(
                'PayPal Integration',
                'In a production app, PayPal checkout would open here. For testing, we\'ll simulate payment completion.',
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
                  {
                    text: 'Simulate Payment',
                    onPress: async () => {
                      try {
                        // Capture the payment
                        const captureResult = await authService.capturePayPalPayment(
                          orderId,
                          paymentId
                        );

                        setLoading(false);

                        if (captureResult.success) {
                          Alert.alert(
                            'Payment Successful',
                            `Payment of $${paymentAmount.toFixed(2)} completed!`,
                            [
                              {
                                text: 'OK',
                                onPress: () => navigation.goBack()
                              }
                            ]
                          );
                        } else {
                          Alert.alert('Payment Failed', captureResult.error || 'Payment capture failed');
                        }
                      } catch (error) {
                        setLoading(false);
                        Alert.alert('Error', error.message);
                      }
                    }
                  }
                ]
              );
            } catch (error) {
              setLoading(false);
              console.error('Payment error:', error);
              Alert.alert('Payment Error', error.message);
            }
          }
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Make Payment</Text>

          {/* Mechanic Info */}
          <View style={styles.mechanicCard}>
            <Text style={styles.mechanicLabel}>Paying to:</Text>
            <Text style={styles.mechanicName}>{mechanicName}</Text>
            {mechanicPhone && (
              <Text style={styles.mechanicPhone}>📞 {mechanicPhone}</Text>
            )}
          </View>

          {/* Amount Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Amount (USD)</Text>
            <View style={styles.amountInputWrapper}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                editable={!loading}
              />
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Description (Optional)</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="What is this payment for?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* Payment Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>💳 Payment Method</Text>
            <Text style={styles.infoText}>
              This payment will be processed through PayPal. You'll be redirected to complete the payment securely.
            </Text>
          </View>

          {/* Pay Button */}
          <TouchableOpacity
            style={[styles.payButton, loading && styles.buttonDisabled]}
            onPress={handlePayment}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payButtonText}>
                Pay ${amount ? parseFloat(amount).toFixed(2) : '0.00'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
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
    padding: 20,
    paddingTop: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  mechanicCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  mechanicLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  mechanicName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  mechanicPhone: {
    fontSize: 14,
    color: '#666',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4CAF50',
    paddingHorizontal: 15,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginRight: 5,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    paddingVertical: 15,
  },
  descriptionInput: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  infoBox: {
    backgroundColor: '#E3F2FD',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
  payButton: {
    backgroundColor: '#4CAF50',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});

export default PaymentScreen;

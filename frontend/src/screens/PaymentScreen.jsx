// src/screens/PaymentScreen.jsx
import { RussoOne_400Regular, useFonts } from '@expo-google-fonts/russo-one';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import QRScannerModal from '../components/payment/QRScannerModal';
import { useTheme } from '../context/ThemeContext';
import usePaymentPolling from '../hooks/usePaymentPolling';
import authService from './authService';
const PaymentScreen = ({ route, navigation }) => {
  const { theme, isDark } = useTheme();
  const [fontsLoaded] = useFonts({
    RussoOne_400Regular,
  });

  const { mechanicId, mechanicName, mechanicPhone, upiId, upiQrCode } = route.params || {};

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentState, setPaymentState] = useState('idle'); // idle | creating | waiting | polling | completed | failed
  const [transactionId, setTransactionId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showExpandedQR, setShowExpandedQR] = useState(false);

  const { paymentStatus, isPolling, error: pollingError, startPolling, stopPolling, reset } = usePaymentPolling();

  // Handle payment status updates from polling
  useEffect(() => {
    if (paymentStatus) {
      console.log('Payment status updated:', paymentStatus.status);

      if (paymentStatus.status === 'completed') {
        setPaymentState('completed');
        setLoading(false);
        stopPolling();

        Alert.alert(
          'Payment Successful',
          `Payment of ₹${paymentStatus.amount.toFixed(2)} completed successfully!`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else if (paymentStatus.status === 'failed') {
        setPaymentState('failed');
        setLoading(false);
        stopPolling();

        Alert.alert('Payment Failed', 'The payment was not successful. Please try again.');
      } else if (paymentStatus.status === 'expired') {
        setPaymentState('failed');
        setLoading(false);
        stopPolling();

        Alert.alert('Payment Expired', 'The payment window has expired. Please create a new payment.');
      } else if (paymentStatus.status === 'cancelled') {
        setPaymentState('failed');
        setLoading(false);
        stopPolling();

        Alert.alert('Payment Cancelled', 'The payment was cancelled.');
      }
    }
  }, [paymentStatus]);

  // Update time remaining countdown
  useEffect(() => {
    if (paymentStatus && paymentStatus.expiresAt && paymentState === 'polling') {
      const interval = setInterval(() => {
        const remaining = new Date(paymentStatus.expiresAt) - new Date();
        if (remaining > 0) {
          setTimeRemaining(Math.floor(remaining / 1000));
        } else {
          setTimeRemaining(0);
          clearInterval(interval);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [paymentStatus, paymentState]);

  // Handle polling errors
  useEffect(() => {
    if (pollingError) {
      console.error('Polling error:', pollingError);
      // Don't stop polling on network errors, just log them
    }
  }, [pollingError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // Early return after all hooks are called (React Rules of Hooks)
  if (!fontsLoaded) {
    return null;
  }

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
      `Pay ₹${paymentAmount.toFixed(2)} to ${mechanicName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay with UPI',
          onPress: async () => {
            await initiateUPIPayment(paymentAmount);
          }
        }
      ]
    );
  };

  const initiateUPIPayment = async (paymentAmount) => {
    setLoading(true);
    setPaymentState('creating');

    try {
      // Step 1: Create payment order on backend
      const orderResult = await authService.createUPIPaymentOrder(
        paymentAmount,
        mechanicId,
        description || `Payment to ${mechanicName}`
      );

      if (!orderResult.success) {
        throw new Error(orderResult.error || 'Failed to create payment order');
      }

      const { transactionId: txnId, expiresAt } = orderResult.data;
      setTransactionId(txnId);

      // Step 2: Determine VPA (UPI address)
      let vpa = null;

      if (upiId) {
        // Use mechanic's UPI ID if available
        vpa = upiId;
      } else if (mechanicPhone) {
        // Use phone number as UPI address (phone@paytm format is widely supported)
        // Remove any non-digit characters
        const cleanPhone = mechanicPhone.replace(/\D/g, '');
        if (cleanPhone.length === 10) {
          vpa = `${cleanPhone}@pthdfc`; // or @ybl, @oksbi, etc.
        }
      }

      if (!vpa) {
        setLoading(false);
        setPaymentState('idle');
        Alert.alert(
          'Payment Not Available',
          'This mechanic has not set up their UPI payment details yet. Please use an alternative payment method.'
        );
        return;
      }

      // Step 3: Construct UPI deep link
      const upiUrl = constructUPIUrl({
        vpa,
        name: mechanicName,
        amount: paymentAmount,
        transactionId: txnId,
        note: description || `Payment to ${mechanicName}`
      });

      console.log('UPI URL:', upiUrl);
      console.log('Using VPA:', vpa);

      // Step 4: Check if UPI apps are available
      const canOpen = await Linking.canOpenURL(upiUrl);

      if (!canOpen) {
        // Some systems might still fail the canOpenURL check despite config
        // Show a more helpful message and allow the user to try anyway if they're sure
        setLoading(false);
        setPaymentState('idle');

        Alert.alert(
          'UPI App Detection',
          'We couldn\'t verify if a UPI app is installed. This can happen on some devices even if apps are present.\n\nWould you like to try opening the payment anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Try Anyway',
              onPress: async () => {
                setLoading(true);
                setPaymentState('waiting');
                try {
                  await Linking.openURL(upiUrl);
                  setPaymentState('polling');
                  setLoading(false);
                  startPolling(txnId);
                } catch (e) {
                  setLoading(false);
                  setPaymentState('idle');
                  Alert.alert('Error', 'Failed to open any UPI app. Please ensure one is installed.');
                }
              }
            }
          ]
        );
        return;
      }

      // Step 5: Launch UPI app
      setPaymentState('waiting');
      await Linking.openURL(upiUrl);

      // Step 6: Start polling for payment status
      setPaymentState('polling');
      setLoading(false); // Remove loading spinner, show polling state instead
      startPolling(txnId);

      // Show info about polling
      Alert.alert(
        'Payment Initiated',
        'Complete the payment in your UPI app. We\'ll automatically detect when it\'s done.',
        [{ text: 'OK' }]
      );

    } catch (error) {
      setLoading(false);
      setPaymentState('idle');
      console.error('Payment error:', error);
      Alert.alert('Payment Error', error.message);
    }
  };

  const constructUPIUrl = ({ vpa, name, amount, transactionId, note }) => {
    const params = new URLSearchParams({
      pa: vpa,                              // Payee VPA
      pn: name,                             // Payee name (URLSearchParams handles encoding)
      am: amount.toString(),                // Amount
      tr: transactionId,                    // Transaction reference
      tn: note,                             // Transaction note
      cu: 'INR'                             // Currency
    });

    return `upi://pay?${params.toString()}`;
  };

  const handleQRScan = (upiUrl) => {
    setShowScanner(false);
    try {
      const url = new URL(upiUrl);
      const params = new URLSearchParams(url.search);

      const vpa = params.get('pa');
      const name = params.get('pn');
      const am = params.get('am');
      const tn = params.get('tn');

      if (vpa) {
        if (am) setAmount(am);
        if (tn) setDescription(decodeURIComponent(tn));

        Alert.alert(
          'QR Scanned',
          `Payload for ${name || vpa} detected. Proceed with payment?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Proceed', onPress: () => initiateUPIPayment(parseFloat(am || amount || 0)) }
          ]
        );
      }
    } catch (e) {
      console.error('QR Parse error:', e);
      Alert.alert('Error', 'Could not parse UPI QR code');
    }
  };

  const handleCancelPayment = () => {
    if (isPolling) {
      Alert.alert(
        'Cancel Payment',
        'Are you sure you want to stop checking for payment status?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            onPress: () => {
              stopPolling();
              reset();
              setPaymentState('idle');
              setTransactionId(null);
              setTimeRemaining(null);
            }
          }
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusMessage = () => {
    switch (paymentState) {
      case 'creating':
        return 'Creating payment order...';
      case 'waiting':
        return 'Opening UPI app...';
      case 'polling':
        return 'Waiting for payment confirmation...';
      case 'completed':
        return 'Payment completed!';
      case 'failed':
        return 'Payment failed';
      default:
        return '';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0a0a0a' : '#fafafa' }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Form Section */}
        <View style={[styles.formSection, { backgroundColor: isDark ? '#111111' : '#ffffff' }]}>
          <View style={styles.formContent}>
            {/* Mechanic Info */}
            <View style={[styles.mechanicCard, { backgroundColor: isDark ? '#1a1a1a' : '#fafafa', borderColor: isDark ? '#333' : '#f0f0f0' }]}>
              <Text style={[styles.mechanicLabel, { color: isDark ? '#a0a0a0' : '#555' }]}>PAYING TO</Text>
              <Text style={[styles.mechanicName, { color: isDark ? '#FFFFFF' : '#111111' }]}>{mechanicName}</Text>
              {mechanicPhone && (
                <Text style={styles.mechanicPhone}>📞 {mechanicPhone}</Text>
              )}
              {upiId && (
                <Text style={styles.mechanicUpi}>💳 UPI: {upiId}</Text>
              )}
              {!upiId && mechanicPhone && (
                <Text style={styles.mechanicUpi}>💳 UPI: {mechanicPhone.replace(/\D/g, '')}@paytm</Text>
              )}

              {upiQrCode && paymentState === 'idle' && (
                <TouchableOpacity
                  style={[styles.qrBadge, { backgroundColor: isDark ? '#222' : '#fff', borderColor: isDark ? '#444' : '#e5e7eb' }]}
                  onPress={() => setShowExpandedQR(true)}
                  activeOpacity={0.7}
                >
                  <Image source={{ uri: upiQrCode }} style={styles.miniQr} />
                  <View>
                    <Text style={[styles.qrHint, { color: isDark ? '#FFFFFF' : '#111111' }]}>Scan to Pay</Text>
                    <Text style={[styles.tapToExpand, { color: isDark ? '#a0a0a0' : '#888' }]}>Tap to expand</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Amount Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: isDark ? '#a0a0a0' : '#555' }]}>AMOUNT (INR)</Text>
              <View style={[styles.amountInputWrapper, { borderBottomColor: isDark ? '#444' : '#ccc' }]}>
                <Text style={[styles.currencySymbol, { color: isDark ? '#FFFFFF' : '#111111' }]}>₹</Text>
                <TextInput
                  style={[styles.amountInput, { color: isDark ? '#FFFFFF' : '#333' }]}
                  placeholder="0.00"
                  placeholderTextColor={isDark ? '#666' : '#999'}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  editable={!loading && paymentState === 'idle'}
                />
              </View>
            </View>

            {/* Description Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputLabel, { color: isDark ? '#a0a0a0' : '#555' }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.descriptionInput, { color: isDark ? '#FFFFFF' : '#333', borderBottomColor: isDark ? '#444' : '#ccc' }]}
                placeholder="What is this payment for?"
                placeholderTextColor={isDark ? '#666' : '#999'}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!loading && paymentState === 'idle'}
              />
            </View>

            {/* Payment Status Info */}
            {paymentState !== 'idle' && (
              <View style={[styles.statusBox, { backgroundColor: isDark ? '#001a2c' : '#f0f9ff', borderColor: isDark ? '#0c4a6e' : '#bae6fd' }]}>
                <Text style={[styles.statusText, { color: isDark ? '#bae6fd' : '#0c4a6e' }]}>{getStatusMessage()}</Text>
                {isPolling && timeRemaining !== null && (
                  <Text style={[styles.timerText, { color: isDark ? '#7dd3fc' : '#075985' }]}>
                    Time remaining: {formatTime(timeRemaining)}
                  </Text>
                )}
                {isPolling && (
                  <ActivityIndicator color={isDark ? '#FFFFFF' : '#111111'} style={{ marginTop: 12 }} />
                )}
              </View>
            )}

            {/* Payment Info */}
            {paymentState === 'idle' && (
              <View style={[styles.infoBox, { backgroundColor: isDark ? '#1a1a1a' : '#f9fafb', borderColor: isDark ? '#333' : '#f0f0f0' }]}>
                <Text style={[styles.infoText, { color: isDark ? '#a0a0a0' : '#666666' }]}>
                  📱 This payment will be processed securely via UPI.
                  {'\n\n'}
                  {upiId
                    ? `Payment will be sent to the mechanic's UPI ID: ${upiId}`
                    : mechanicPhone
                      ? `Payment will be sent to the mechanic's phone number via UPI.`
                      : 'Payment details not available.'
                  }
                  {'\n\n'}
                  After clicking Pay, you'll be redirected to your UPI app. Complete the payment there, and we'll automatically detect when it's done.
                </Text>
              </View>
            )}

            {/* Pay Button */}
            {paymentState === 'idle' && (
              <TouchableOpacity
                style={[styles.payButton, loading && styles.buttonDisabled]}
                onPress={handlePayment}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.payButtonText}>
                    pay ₹{amount ? parseFloat(amount).toFixed(2) : '0.00'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelPayment}
              disabled={loading && paymentState === 'creating'}
            >
              <Text style={styles.cancelButtonText}>
                {isPolling ? 'Stop Checking' : 'Cancel'}
              </Text>
            </TouchableOpacity>

            {/* Scan QR Button */}
            {paymentState === 'idle' && (
              <TouchableOpacity
                style={[styles.scanQrButton, { backgroundColor: isDark ? '#1a1a1a' : '#fff', borderColor: isDark ? '#333' : '#e5e7eb' }]}
                onPress={() => setShowScanner(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="qr-code-outline" size={20} color={isDark ? '#FFFFFF' : '#111'} style={{ marginRight: 8 }} />
                <Text style={[styles.scanQrButtonText, { color: isDark ? '#FFFFFF' : '#111' }]}>Scan Mechanic's QR</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Expanded QR Modal */}
      <Modal
        visible={showExpandedQR}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExpandedQR(false)}
      >
        <TouchableOpacity
          style={styles.expandedQrOverlay}
          activeOpacity={1}
          onPress={() => setShowExpandedQR(false)}
        >
          <View style={[styles.expandedQrContent, { backgroundColor: isDark ? '#111' : '#fff' }]}>
            <Text style={[styles.expandedQrTitle, { color: isDark ? '#FFFFFF' : '#111' }]}>Payment QR Code</Text>
            <View style={[styles.largeQrContainer, { backgroundColor: '#fff' }]}>
              <Image source={{ uri: upiQrCode }} style={styles.largeQr} />
            </View>
            <Text style={[styles.expandedQrHint, { color: isDark ? '#a0a0a0' : '#888' }]}>Show this to the user to receive payment</Text>
            <TouchableOpacity
              style={[styles.closeExpandedButton, { backgroundColor: isDark ? '#f2f2f2' : '#111' }]}
              onPress={() => setShowExpandedQR(false)}
            >
              <Text style={[styles.closeExpandedText, { color: isDark ? '#000' : '#fff' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQRScan}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollContent: {
    flexGrow: 1,
  },
  formSection: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  formContent: {
    flex: 1,
  },
  mechanicCard: {
    backgroundColor: '#fafafa',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#111111',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  mechanicLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  mechanicName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
  },
  mechanicPhone: {
    fontSize: 12,
    color: '#888888',
  },
  mechanicUpi: {
    fontSize: 12,
    color: '#0284c7',
    marginTop: 4,
  },
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  miniQr: {
    width: 44,
    height: 44,
    marginRight: 10,
  },
  qrHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },
  tapToExpand: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555',
    textTransform: 'uppercase',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111111',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  descriptionInput: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    fontSize: 14,
    color: '#333',
    minHeight: 50,
  },
  statusBox: {
    backgroundColor: '#f0f9ff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0c4a6e',
    textAlign: 'center',
  },
  timerText: {
    fontSize: 12,
    color: '#075985',
    marginTop: 8,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  infoText: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 18,
  },
  payButton: {
    backgroundColor: '#111111',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  payButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 16,
  },
  cancelButtonText: {
    fontSize: 12,
    color: '#6b7280',
  },
  scanQrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  scanQrButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  expandedQrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  expandedQrContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    width: '100%',
  },
  expandedQrTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 20,
    fontFamily: 'RussoOne_400Regular',
  },
  largeQrContainer: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  largeQr: {
    width: 250,
    height: 250,
  },
  expandedQrHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 20,
    textAlign: 'center',
  },
  closeExpandedButton: {
    marginTop: 30,
    paddingVertical: 12,
    paddingHorizontal: 40,
    backgroundColor: '#111',
    borderRadius: 12,
  },
  closeExpandedText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default PaymentScreen;

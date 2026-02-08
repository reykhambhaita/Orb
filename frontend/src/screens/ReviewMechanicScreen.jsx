// src/screens/ReviewMechanicScreen.jsx
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
import { useTheme } from '../context/ThemeContext';
import dbManager from '../utils/database';
import syncManager from '../utils/SyncManager';
import authService from './authService';

const ReviewMechanicScreen = ({ route, navigation }) => {
  const { mechanicId, mechanicName, callDuration = 0 } = route.params || {};
  const { theme, isDark } = useTheme();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmitReview = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a star rating');
      return;
    }

    setLoading(true);

    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const reviewData = {
      id: reviewId,
      mechanic_id: mechanicId,
      mechanic_name: mechanicName,
      rating,
      comment: comment.trim(),
      call_duration: callDuration,
      timestamp: Date.now(),
      synced: 0
    };

    try {
      // 1. Save to local database first
      const db = await dbManager.getDatabase();
      await db.runAsync(
        `INSERT INTO reviews (id, mechanic_id, mechanic_name, rating, comment, call_duration, timestamp, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          reviewData.id,
          reviewData.mechanic_id,
          reviewData.mechanic_name,
          reviewData.rating,
          reviewData.comment,
          reviewData.call_duration,
          reviewData.timestamp
        ]
      );
      console.log('💾 Review saved locally:', reviewId);

      // 2. Try to sync review if online
      try {
        // Wait for SyncManager to be ready
        await syncManager.waitForInit();

        // Check if we're online
        const isOnline = await syncManager.checkNetworkStatus();

        if (!isOnline) {
          console.log('📴 Offline mode: review saved for later sync');
          Alert.alert(
            'Saved Offline',
            'Review saved locally. Will sync when online.',
            [
              {
                text: 'OK',
                onPress: () => {
                  navigation.navigate('Main', { refreshMechanics: true });
                }
              }
            ]
          );
          return;
        }

        console.log('📡 Online - syncing review...');

        const result = await authService.createReview(
          mechanicId,
          rating,
          comment.trim(),
          callDuration
        );

        if (result.success) {
          // Update local DB as synced
          await db.runAsync(
            'UPDATE reviews SET synced = 1 WHERE id = ?',
            [reviewId]
          );

          Alert.alert('Success', 'Thank you for your review!', [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('Main', { refreshMechanics: true });
              }
            }
          ]);
        } else {
          throw new Error(result.error || 'Failed to submit review');
        }
      } catch (networkError) {
        // Network error during sync - review already saved locally
        console.log('📴 Network error during review sync:', networkError.message);
        Alert.alert(
          'Saved Offline',
          'Review saved locally. Will sync when online.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('Main', { refreshMechanics: true });
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('❌ Review error:', error);

      // Check network status to provide appropriate error message
      const isOnline = await syncManager.checkNetworkStatus();

      if (isOnline) {
        Alert.alert('Error', `Failed to submit review: ${error.message}. It has been saved and we will retry later.`);
      } else {
        Alert.alert('Saved Offline', 'Review saved locally. Will sync when online.');
      }

      // Navigate back anyway since it's saved locally
      navigation.navigate('Main', { refreshMechanics: true });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Review',
      'Are you sure you want to skip rating this mechanic?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => navigation.goBack()
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDark ? '#000000' : '#fafafa' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>Rate Your Experience</Text>
          <Text style={[styles.mechanicName, { color: theme.text }]}>{mechanicName}</Text>

          {callDuration > 0 && (
            <Text style={[styles.callDuration, { color: theme.textSecondary }]}>
              Call duration: {Math.floor(callDuration / 60)}m {callDuration % 60}s
            </Text>
          )}

          {/* Star Rating */}
          <View style={[styles.ratingContainer, { backgroundColor: isDark ? '#111111' : '#ffffff', borderColor: isDark ? '#222222' : '#f0f0f0' }]}>
            <Text style={[styles.ratingLabel, { color: theme.text }]}>How was the service?</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  disabled={loading}
                >
                  <Text style={styles.star}>
                    {star <= rating ? '⭐' : '☆'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={[styles.ratingText, { color: theme.text }]}>
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
              </Text>
            )}
          </View>

          {/* Comment */}
          <View style={[styles.commentContainer, { backgroundColor: isDark ? '#111111' : '#ffffff', borderColor: isDark ? '#222222' : '#f0f0f0' }]}>
            <Text style={[styles.commentLabel, { color: theme.text }]}>
              Additional comments (optional)
            </Text>
            <TextInput
              style={[styles.commentInput, { backgroundColor: isDark ? '#000000' : '#fafafa', borderColor: isDark ? '#222222' : '#f0f0f0', color: theme.text }]}
              placeholder="Tell us about your experience..."
              placeholderTextColor={theme.textSecondary}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.buttonDisabled, isDark && { backgroundColor: '#FFFFFF' }]}
            onPress={handleSubmitReview}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={isDark ? '#000000' : '#ffffff'} />
            ) : (
              <Text style={[styles.submitButtonText, isDark && { color: '#000000' }]}>Submit Review</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={loading}
          >
            <Text style={[styles.skipButtonText, { color: theme.textSecondary }]}>Skip for Now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#111111',
  },
  mechanicName: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    color: '#111111',
    fontWeight: '600',
  },
  callDuration: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 32,
    color: '#888888',
  },
  ratingContainer: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    color: '#111111',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  star: {
    fontSize: 36,
  },
  ratingText: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '600',
    marginTop: 8,
  },
  commentContainer: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#111111',
  },
  commentInput: {
    backgroundColor: '#fafafa',
    padding: 16,
    borderRadius: 12,
    fontSize: 14,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    color: '#111111',
  },
  submitButton: {
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
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    padding: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#6b7280',
    fontSize: 12,
  },
});

export default ReviewMechanicScreen;
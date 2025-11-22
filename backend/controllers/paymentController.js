// backend/controllers/reviewController.js
import { Mechanic, Review } from '../db.js';

/**
 * Create a review for a mechanic
 * POST /api/reviews
 * Body: { mechanicId, rating, comment, callDuration }
 */
export const createReviewHandler = async (req, res) => {
  try {
    const { mechanicId, rating, comment, callDuration } = req.body;

    if (!mechanicId || !rating) {
      return res.status(400).json({ error: 'Mechanic ID and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check if mechanic exists
    const mechanic = await Mechanic.findById(mechanicId);
    if (!mechanic) {
      return res.status(404).json({ error: 'Mechanic not found' });
    }

    // Prevent self-review
    if (mechanic.userId.toString() === req.userId) {
      return res.status(400).json({ error: 'Cannot review yourself' });
    }

    // Check if user already reviewed this mechanic
    const existingReview = await Review.findOne({
      userId: req.userId,
      mechanicId
    });

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this mechanic' });
    }

    // Create review
    const review = new Review({
      userId: req.userId,
      mechanicId,
      rating,
      comment: comment || '',
      callDuration: callDuration || 0,
      createdAt: new Date()
    });

    await review.save();

    // Update mechanic's average rating
    await updateMechanicRating(mechanicId);

    res.status(201).json({
      success: true,
      data: {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt
      }
    });
  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
};

/**
 * Get reviews for a mechanic
 * GET /api/reviews/mechanic/:mechanicId
 */
export const getMechanicReviewsHandler = async (req, res) => {
  try {
    const { mechanicId } = req.params;

    const reviews = await Review.find({ mechanicId })
      .populate('userId', 'username')
      .sort({ createdAt: -1 })
      .limit(50);

    const transformedReviews = reviews.map(review => ({
      id: review._id,
      rating: review.rating,
      comment: review.comment,
      username: review.userId?.username || 'Anonymous',
      createdAt: review.createdAt
    }));

    res.json({
      success: true,
      count: transformedReviews.length,
      data: transformedReviews
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: 'Failed to get reviews' });
  }
};

/**
 * Get user's own reviews
 * GET /api/reviews/my-reviews
 */
export const getMyReviewsHandler = async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.userId })
      .populate('mechanicId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(50);

    const transformedReviews = reviews.map(review => ({
      id: review._id,
      rating: review.rating,
      comment: review.comment,
      mechanicName: review.mechanicId?.name || 'Unknown',
      mechanicPhone: review.mechanicId?.phone || '',
      createdAt: review.createdAt
    }));

    res.json({
      success: true,
      count: transformedReviews.length,
      data: transformedReviews
    });
  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({ error: 'Failed to get reviews' });
  }
};

// Helper function to update mechanic's average rating
async function updateMechanicRating(mechanicId) {
  const reviews = await Review.find({ mechanicId });

  if (reviews.length === 0) {
    await Mechanic.findByIdAndUpdate(mechanicId, { rating: 0 });
    return;
  }

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await Mechanic.findByIdAndUpdate(mechanicId, {
    rating: Math.round(avgRating * 10) / 10 // Round to 1 decimal
  });
}
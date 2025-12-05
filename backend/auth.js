// backend/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Mechanic, User } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is not defined in environment variables");
  process.exit(1);
}
const JWT_EXPIRES_IN = '7d';

export const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// UPDATED: Signup handler with automatic mechanic profile creation
export const signup = async (req, res) => {
  try {
    const { email, username, password, role, mechanicData } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({
        error: 'Email, username, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters'
      });
    }

    const userRole = role && ['user', 'mechanic'].includes(role) ? role : 'user';

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Email or username already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      email,
      username,
      password: hashedPassword,
      role: userRole,
      createdAt: new Date()
    });

    await user.save();

    // NEW: If mechanic role, create mechanic profile automatically
    let mechanicProfile = null;
    if (userRole === 'mechanic') {
      // Create mechanic profile with default or provided data
      mechanicProfile = new Mechanic({
        userId: user._id,
        name: mechanicData?.name || username,
        phone: mechanicData?.phone || '',
        location: {
          type: 'Point',
          coordinates: [
            mechanicData?.longitude || 70.77, // Default Rajkot lng
            mechanicData?.latitude || 23.0225  // Default Rajkot lat
          ]
        },
        specialties: mechanicData?.specialties || [],
        available: mechanicData?.available !== undefined ? mechanicData.available : true
      });

      await mechanicProfile.save();
    }

    const token = generateToken(user._id.toString(), user.role);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      },
      mechanicProfile: mechanicProfile ? {
        id: mechanicProfile._id,
        name: mechanicProfile.name,
        phone: mechanicProfile.phone,
        location: {
          latitude: mechanicProfile.location.coordinates[1],
          longitude: mechanicProfile.location.coordinates[0]
        },
        specialties: mechanicProfile.specialties,
        available: mechanicProfile.available
      } : null
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Login handler - UPDATED to include mechanic profile if applicable
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // NEW: Fetch mechanic profile if user is a mechanic
    let mechanicProfile = null;
    if (user.role === 'mechanic') {
      mechanicProfile = await Mechanic.findOne({ userId: user._id });
    }

    const token = generateToken(user._id.toString(), user.role);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      },
      mechanicProfile: mechanicProfile ? {
        id: mechanicProfile._id,
        name: mechanicProfile.name,
        phone: mechanicProfile.phone,
        location: {
          latitude: mechanicProfile.location.coordinates[1],
          longitude: mechanicProfile.location.coordinates[0]
        },
        specialties: mechanicProfile.specialties,
        available: mechanicProfile.available
      } : null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // NEW: Fetch mechanic profile if user is a mechanic
    let mechanicProfile = null;
    if (user.role === 'mechanic') {
      mechanicProfile = await Mechanic.findOne({ userId: user._id });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      },
      mechanicProfile: mechanicProfile ? {
        id: mechanicProfile._id,
        name: mechanicProfile.name,
        phone: mechanicProfile.phone,
        location: {
          latitude: mechanicProfile.location.coordinates[1],
          longitude: mechanicProfile.location.coordinates[0]
        },
        specialties: mechanicProfile.specialties,
        available: mechanicProfile.available
      } : null
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
};
// Add this to backend/auth.js

export const updateProfile = async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username && !email) {
      return res.status(400).json({
        error: 'At least one field (username or email) is required'
      });
    }

    const updates = {};

    // Check if username is being updated and if it's already taken
    if (username) {
      const existingUser = await User.findOne({
        username,
        _id: { $ne: req.userId }
      });

      if (existingUser) {
        return res.status(409).json({
          error: 'Username already exists'
        });
      }
      updates.username = username;
    }

    // Check if email is being updated and if it's already taken
    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: req.userId }
      });

      if (existingUser) {
        return res.status(409).json({
          error: 'Email already exists'
        });
      }
      updates.email = email;
    }

    // Update the user
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Add this route to backend/index.js in the AUTH ROUTES section:
// app.patch('/api/auth/update-profile', authenticateToken, updateProfile);
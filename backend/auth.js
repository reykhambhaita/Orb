// backend/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { Mechanic, OTP, User } from './db.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (mailOptions) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('âš ï¸ EMAIL_USER or EMAIL_PASS not defined. Skipping email sending.');
    const otpMatch = mailOptions.text.match(/\d{6}/);
    if (otpMatch) {
      console.log('ðŸ“¬ [DEBUG OTP] Code is:', otpMatch[0]);
    }
    return true; // Return true as if it was sent to allow flow to continue
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log(`âœ… Email sent to ${mailOptions.to}`);
    return true;
  } catch (error) {
    console.error('â Œ Error sending email:', error);
    const otpMatch = mailOptions.text.match(/\d{6}/);
    if (otpMatch) {
      console.log('ðŸ“¬ [FALLBACK OTP] Code is:', otpMatch[0]);
    }
    return false;
  }
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("JWT_SECRET is not defined in environment variables");
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

    // NEW: Generate and send OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({ email, otp });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Email Verification OTP',
      text: `Your OTP for sign up is ${otp}. It will expire in 10 minutes.`,
    };

    await sendEmail(mailOptions);

    // NEW: If mechanic role, create mechanic profile automatically
    let mechanicProfile = null;
    if (userRole === 'mechanic') {
      // Defer location validation if not provided (will be updated by background service)
      const lat = mechanicData?.latitude ? Number(mechanicData.latitude) : 0;
      const lng = mechanicData?.longitude ? Number(mechanicData.longitude) : 0;

      // Validate coordinates are within valid ranges if provided
      if ((lat !== 0 || lng !== 0) && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        return res.status(400).json({
          error: 'Invalid location coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.'
        });
      }

      // Create mechanic profile with validated data
      mechanicProfile = new Mechanic({
        userId: user._id,
        name: mechanicData.name || username,
        phone: mechanicData.phone || '',
        location: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        specialties: mechanicData.specialties || [],
        available: mechanicData.available !== undefined ? mechanicData.available : true,
        upiId: mechanicData.upiId || ''
      });

      await mechanicProfile.save();
      console.log('✅ [signup] Mechanic profile created with location:', { lat, lng });
    }

    // Return success but no token yet, as email needs verification
    res.status(201).json({
      success: true,
      message: 'Signup successful. Please verify your email with the OTP sent.',
      email: user.email,
      role: user.role
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
        avatar: user.avatar,
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
        available: mechanicProfile.available,
        upiId: mechanicProfile.upiId,
        upiQrCode: mechanicProfile.upiQrCode
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
        avatar: user.avatar,
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
        available: mechanicProfile.available,
        upiId: mechanicProfile.upiId,
        upiQrCode: mechanicProfile.upiQrCode
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
    const { username, email, avatar, role, mechanicData } = req.body;

    if (!username && !email && !avatar && !role) {
      return res.status(400).json({
        error: 'At least one field is required'
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

    // Update avatar if provided
    if (avatar !== undefined) {
      updates.avatar = avatar;
    }

    // Update role if provided
    if (role && ['user', 'mechanic'].includes(role)) {
      updates.role = role;
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

    // Handle mechanic profile creation if role changed to mechanic
    let mechanicProfile = null;
    let newToken = null;

    if (updates.role === 'mechanic' || user.role === 'mechanic') {
      console.log('🔧 [updateProfile] Processing mechanic profile update');
      console.log('   User role:', user.role);
      console.log('   mechanicData received:', mechanicData ? JSON.stringify(mechanicData, null, 2) : 'null');

      const existingMechanic = await Mechanic.findOne({ userId: user._id });

      if (!existingMechanic && updates.role === 'mechanic') {
        console.log('🆕 [updateProfile] Creating NEW mechanic profile');

        // Allow creating profile with default coordinates [0, 0] if not provided
        const lat = mechanicData?.latitude ? Number(mechanicData.latitude) : 0;
        const lng = mechanicData?.longitude ? Number(mechanicData.longitude) : 0;

        // Validate coordinates are within valid ranges if provided
        if ((lat !== 0 || lng !== 0) && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
          return res.status(400).json({
            error: 'Invalid location coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.'
          });
        }

        mechanicProfile = new Mechanic({
          userId: user._id,
          name: mechanicData.name || user.username,
          phone: mechanicData.phone || '',
          location: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          specialties: mechanicData.specialties || [],
          available: mechanicData.available !== undefined ? mechanicData.available : true
        });
        await mechanicProfile.save();
        console.log('✅ [updateProfile] New mechanic profile created with ID:', mechanicProfile._id);
      } else if (existingMechanic) {
        // UPDATE existing mechanic profile if location provided
        console.log('🔄 [updateProfile] Updating existing mechanic ID:', existingMechanic._id);
        console.log('   Current location: [lat:', existingMechanic.location.coordinates[1], ', lng:', existingMechanic.location.coordinates[0], ']');

        if (mechanicData?.latitude !== undefined && mechanicData?.longitude !== undefined) {
          const newLat = Number(mechanicData.latitude);
          const newLng = Number(mechanicData.longitude);

          console.log(`   ➡️  Updating location to [lat: ${newLat}, lng: ${newLng}]`);

          existingMechanic.location = {
            type: 'Point',
            coordinates: [newLng, newLat]
          };

          if (mechanicData.name) existingMechanic.name = mechanicData.name;
          if (mechanicData.phone) existingMechanic.phone = mechanicData.phone;
          if (mechanicData.specialties) existingMechanic.specialties = mechanicData.specialties;
          if (mechanicData.available !== undefined) existingMechanic.available = mechanicData.available;

          await existingMechanic.save();
          console.log('✅ [updateProfile] Mechanic profile saved successfully');
        } else {
          console.log('⚠️ [updateProfile] No location data provided in mechanicData, updating other fields only');
          // Still update other fields if provided
          if (mechanicData?.name) {
            console.log('   Updating name to:', mechanicData.name);
            existingMechanic.name = mechanicData.name;
          }
          if (mechanicData?.phone) {
            console.log('   Updating phone to:', mechanicData.phone);
            existingMechanic.phone = mechanicData.phone;
          }
          if (mechanicData?.available !== undefined) existingMechanic.available = mechanicData.available;
          await existingMechanic.save();
          console.log('✅ [updateProfile] Mechanic profile updated (without location)');
        }
        mechanicProfile = existingMechanic;
      }
    }

    // Generate new token if role was updated (to avoid stale role in JWT)
    if (role && role !== req.userRole) {
      newToken = generateToken(user._id, user.role);
    }

    res.json({
      success: true,
      token: newToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
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
        available: mechanicProfile.available,
        upiId: mechanicProfile.upiId,
        upiQrCode: mechanicProfile.upiQrCode
      } : null
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        error: 'Avatar data is required'
      });
    }

    // Validate base64 format (basic check)
    if (!avatar.startsWith('data:image/')) {
      return res.status(400).json({
        error: 'Invalid avatar format. Must be a base64 encoded image'
      });
    }

    // Update user's avatar
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { avatar } },
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
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
};

// Add these routes to backend/index.js in the AUTH ROUTES section:
// app.patch('/api/auth/update-profile', authenticateToken, updateProfile);
// app.patch('/api/auth/upload-avatar', authenticateToken, uploadAvatar);

// NEW: Forgot Password handlers
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // For security reasons, don't reveal if user exists or not
      // But for this app, we can be more helpful
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete any existing OTP for this email
    await OTP.deleteMany({ email });

    // Generate and send new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({ email, otp });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is ${otp}. It will expire in 10 minutes.`,
    };

    await sendEmail(mailOptions);

    res.json({
      success: true,
      message: 'OTP sent successfully'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

export const verifyForgotPasswordOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const otpDoc = await OTP.findOne({ email, otp });

    if (!otpDoc) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Return success. We don't delete the OTP yet, because we need it to verify the resetRequest
    // Or we could return a temporary token. For simplicity, let's just return success.
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (error) {
    console.error('Verify forgot password OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP and new password are required' });
    }

    // Verify OTP again to ensure it's still valid
    const otpDoc = await OTP.findOne({ email, otp });
    if (!otpDoc) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const user = await User.findOneAndUpdate(
      { email },
      { $set: { password: hashedPassword } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete the OTP as it's used
    await OTP.deleteMany({ email });

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const otpDoc = await OTP.findOne({ email, otp });

    if (!otpDoc) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Mark user as verified
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { isVerified: true } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch mechanic profile if user is a mechanic
    let mechanicProfile = null;
    if (user.role === 'mechanic') {
      mechanicProfile = await Mechanic.findOne({ userId: user._id });
    }

    // Delete the OTP as it's used
    await OTP.deleteOne({ _id: otpDoc._id });

    const token = generateToken(user._id.toString(), user.role);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
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
        available: mechanicProfile.available,
        upiId: mechanicProfile.upiId,
        upiQrCode: mechanicProfile.upiQrCode
      } : null
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete any existing OTP for this email
    await OTP.deleteMany({ email });

    // Generate and send new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({ email, otp });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Email Verification OTP (Resend)',
      text: `Your new OTP for sign up is ${otp}. It will expire in 10 minutes.`,
    };

    await sendEmail(mailOptions);

    res.json({
      success: true,
      message: 'OTP resent successfully'
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
};
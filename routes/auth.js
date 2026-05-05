const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'secret_key');

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

// =====================
// REGISTER ENDPOINT
// =====================
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      preferredLanguage,
      currentLocation,
      nationality,
      age,
      gender,
      existingConditions,
      emergencyContactNumber,
      bloodGroup,
    } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered. Please login or use a different email.',
      });
    }

    // Create new user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password,
      phone,
      nationality,
      preferredLanguage,
      currentLocation,
      age,
      gender,
      existingConditions,
      emergencyContactNumber,
      bloodGroup,
      role: 'tourist',
      isVerified: false,
    });

    // Save user to database
    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: newUser.toJSON(),
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error creating account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// =====================
// LOGIN ENDPOINT
// =====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Compare passwords
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error logging in',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// =====================
// GET CURRENT USER
// =====================
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching user',
    });
  }
});

// =====================
// UPDATE PROFILE
// =====================
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      phone,
      nationality,
      profileImage,
      preferredLanguage,
      currentLocation,
      age,
      gender,
      existingConditions,
      emergencyContactNumber,
      bloodGroup,
    } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        name: name || undefined,
        phone: phone || undefined,
        nationality: nationality || undefined,
        preferredLanguage: preferredLanguage || undefined,
        currentLocation: currentLocation || undefined,
        age: age || undefined,
        gender: gender || undefined,
        existingConditions: existingConditions || undefined,
        emergencyContactNumber: emergencyContactNumber || undefined,
        bloodGroup: bloodGroup || undefined,
        profileImage: profileImage || undefined,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating profile',
    });
  }
});

module.exports = router;

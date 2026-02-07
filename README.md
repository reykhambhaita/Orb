# Orb

**On-Road Mechanic Service** - Connecting stranded motorists with nearby mechanics in real-time.

[![Platform](https://img.shields.io/badge/Platform-Android-green.svg)](https://expo.dev)
[![Built with Expo](https://img.shields.io/badge/Built%20with-Expo-000020.svg)](https://expo.dev)
[![Backend](https://img.shields.io/badge/Backend-Live-success)](https://backend-three-sepia-16.vercel.app/)

---

## 📖 Overview

Orb is an **offline-first**, location-based service platform that bridges the gap between vehicle owners and mechanics during roadside emergencies. The app combines real-time GPS tracking, interactive mapping, and integrated payments to deliver a seamless experience—even without internet connectivity.

### Why Orb?

- Instant Help: Find mechanics near you within seconds
- Works Offline: Critical features work without internet; syncs automatically when connected
- Easy Payments: Integrated UPI payment system
- Trust System: Community-driven ratings and reviews

---

## ✨ Key Features

### For Users

- **Real-time Mechanic Discovery** - Find nearby mechanics on an interactive map using geolocation
- **Direct Communication** - Call mechanics directly from the app
- **Integrated Payments** - Pay securely via UPI with QR code scanning
- **Rating & Reviews** - Rate service quality and read community feedback
- **Service History** - Track all your past service calls

### For Mechanics

- **Professional Profiles** - Showcase skills, rates, and service areas
- **Visibility Control** - Toggle availability and location sharing
- **Payment Integration** - Auto-generated UPI QR codes for instant payments
- **Performance Metrics** - Track ratings and completed jobs

### Technical Highlights

- **Offline-First Architecture** - Local SQLite database with intelligent sync management
- **Enhanced Security** - AES-256 encryption for sensitive data, JWT authentication
- **Geospatial Queries** - MongoDB 2dsphere indexes for efficient proximity searches
- **Cross-Platform Ready** - Built with React Native for future iOS support

---

## 🚀 Quick Start

### For End Users

The easiest way to try Orb:

**[📲 Download Android APK](https://expo.dev/accounts/bbq1536/projects/orb/builds/0b8c3332-6599-4093-86b5-48a55e924bb3)**

The app connects to our live backend automatically—just install and go!

### For Developers

Want to contribute or run locally?

#### Prerequisites

- Node.js 18+
- Android device or emulator
- Expo CLI: `npm install -g expo-cli`
- MongoDB Atlas account (for backend development)

#### Frontend Setup

```bash
# Clone the repository
git clone https://github.com/reykhambhaita/Orb.git
cd Orb/frontend

# Install dependencies
npm install

# Start development server
npx expo start
```

**Development Options:**

- Scan QR code with [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)
- Press `a` to open in Android emulator
- The app will connect to the live backend by default

#### Backend Setup (Optional)

The backend is **already live** at [backend-three-sepia-16.vercel.app](https://backend-three-sepia-16.vercel.app/)

To run locally for development:

```bash
cd Orb/backend

# Install dependencies
npm install

# Create .env file (see Configuration section)
touch .env

# Start development server
npm run dev
```

---

## 📱 How to Use

### Getting Started

1. **Install & Launch** - Download the APK or run via Expo Go
2. **Create Account** - Sign up with phone number and verify OTP
3. **Choose Role** - Select "User" (need help) or "Mechanic" (provide help)
4. **Grant Permissions** - Allow location access for core functionality

### As a User

```
Find Help → View Nearby Mechanics → Contact & Arrange Service → Make Payment → Leave Review
```

1. **Find Mechanics** - The map shows all available mechanics near your location
2. **View Profiles** - Tap markers to see ratings, specialties, and rates
3. **Contact** - Call the mechanic directly or send a service request
4. **Pay Securely** - Scan the mechanic's UPI QR code or enter UPI ID
5. **Rate Experience** - Help the community by leaving honest feedback

### As a Mechanic

```
Setup Profile → Go Online → Receive Requests → Complete Jobs → Get Paid
```

1. **Complete Profile** - Add your UPI ID, specialties, and service rates
2. **Toggle Availability** - Turn on to appear on the map when available
3. **Receive Calls** - Users in your area can contact you directly
4. **Get Reviews** - Build reputation through quality service

---

## ⚙️ Configuration

### Environment Variables

Create `.env` in the `backend` directory:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/orb

# Authentication
JWT_SECRET=your_secure_random_string_here

# Encryption (64-character hex key)
ENCRYPTION_KEY=your_64_char_hex_key_for_aes_256_encryption

# Server
PORT=3000
NODE_ENV=development

```

### Frontend Configuration

Key configuration in `frontend/app.json`:

```json
{
  "expo": {
    "name": "Orb",
    "slug": "orb",
    "version": "1.0.0",
    "android": {
      "package": "com.yourcompany.orb",
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA"
      ]
    }
  }
}
```

To change the API endpoint (for local development), edit `frontend/src/services/api.js`:

```javascript
const API_URL = __DEV__
  ? 'http://localhost:3000'  // Local development
  : 'https://backend-three-sepia-16.vercel.app';  // Production
```

---

## 🛠️ Tech Stack

### Frontend

- **Framework**: React Native 0.79 with Expo SDK 53
- **UI Library**: Tamagui for cross-platform components
- **Navigation**: React Navigation v6
- **Maps**: MapLibre GL for offline-capable mapping
- **Storage**: Expo SQLite for local persistence
- **Camera**: Expo Camera for QR code scanning
- **State Management**: React Context + AsyncStorage

### Backend

- **Runtime**: Node.js 18+ with ES6 modules
- **Framework**: Express 5
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with bcrypt password hashing
- **Security**: AES-256-GCM encryption for sensitive data
- **Payments**: QR code generation for UPI
- **Deployment**: Vercel (serverless)

### Architecture Patterns

- **Offline-First**: Local SQLite with background sync
- **RESTful API**: Clean endpoint design with proper HTTP methods
- **Role-Based Access Control (RBAC)**: Separate permissions for users/mechanics
- **Geospatial Indexing**: MongoDB 2dsphere for location queries

---

## 🔒 Security Features

- **Data Encryption**: Sensitive information (UPI IDs) encrypted with AES-256-GCM
- **JWT Authentication**: Stateless, secure token-based auth
- **Password Hashing**: Bcrypt with salt rounds
- **Rate Limiting**: Protection against brute-force attacks
- **RBAC**: Role-based permissions enforced at API level
- **Input Validation**: All user inputs sanitized and validated

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is **private and proprietary**. All rights reserved.

---

## 👨‍💻 Author

**Rey Khambhaita**

- GitHub: [@reykhambhaita](https://github.com/reykhambhaita)

---

## 🙏 Acknowledgments

- Expo team for the amazing development framework
- MapLibre for open-source mapping solutions
- MongoDB for geospatial query capabilities

---

<div align="center">

Made with ❤️ for stranded motorists everywhere

</div>

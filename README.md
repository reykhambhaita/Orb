## Overview
ORMS (On-Road Mechanic Service) is a feature-rich MVP React Native application that bridges the gap between stranded motorists and available mechanics. Built with modern technologies, this project demonstrates full-stack mobile development capabilities including real-time location tracking, offline data synchronization, and payment integration.
## Key Features
- **Real-time Mechanic Discovery**: Geospatial queries to find nearby mechanics within customizable radius
- **Dual User Roles**: Separate interfaces for customers and mechanics with role-based access control
- **Offline-First Architecture**: SQLite local database with intelligent sync management for uninterrupted service
- **Live Location Tracking**: Continuous GPS tracking with location history and landmark detection
- **Integrated Payments**: PayPal payment processing with transaction history
- **Review System**: Post-call review prompts with rating and feedback mechanism
- **Call Logging**: Automatic call duration tracking and mechanic interaction history
## Tech Stack
### Frontend
- React Native 0.79 with Expo SDK 53
- Tamagui for cross-platform UI components
- React Navigation for routing
- MapLibre for map rendering
- Expo SQLite for local persistence
- React Native BLE for Bluetooth capabilities
### Backend
- Node.js with ES6 modules
- Express 5 for REST API
- MongoDB + Mongoose for data persistence
- JWT for stateless authentication
- PayPal SDK for payment processing
- Rate limiting for API protection
## Installation
### For End Users
Download and install the latest build directly on your Android device:
**Latest Build**: [Download APK](https://expo.dev/accounts/grehehe/projects/frontend/builds/1fa207ff-5e3e-42a6-9893-9990e218e33d)
### For Developers
If you want to run the project locally:
#### Prerequisites
- Node.js 18 or higher
- MongoDB Atlas account or local MongoDB instance
- Expo CLI `npm install -g expo-cli`)
#### Clone and Install
```bash
# Clone the repository
git clone https://github.com/yourusername/ORMS.git
cd ORMS
# Install backend dependencies
cd backend
npm install
# Install frontend dependencies
cd ../frontend
npm install
```
#### Backend Setup
1. Create a `.env` file in the `backend` directory:
```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PORT=3000
```
2. Start the backend server:
```bash
cd backend
npm run dev
```
#### Frontend Setup
1. Update the API endpoint in `frontend/src/screens/authService.js` to point to your backend URL
2. Start the Expo development server:
```bash
cd frontend
npx expo start
```
3. Use the Expo Go app on your phone or an emulator to run the application
## Security Features
- JWT Authentication with secure token-based auth
- Password Hashing using bcrypt
- Rate Limiting (5 attempts per 15 minutes for auth endpoints)
- Role-Based Access Control for mechanic/customer permissions
- Input Validation and sanitization
- CORS Configuration
## Technical Achievements
### Offline-First Architecture
Implemented a sophisticated sync manager that queues operations when offline, automatically syncs when connection is restored, and maintains data consistency across client and server.
### Geospatial Queries
Leveraged MongoDB's geospatial capabilities with 2dsphere indexes for efficient proximity searches:
```javascript
mechanics.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [lng, lat] },
      $maxDistance: radius
    }
  }
})
```
### Real-time Location Tracking
- Background location updates with permission management
- Location history with configurable retention
- Landmark detection and association
### Scalable Backend
- Serverless deployment on Vercel
- Connection pooling for MongoDB
- Middleware-based architecture for maintainability
- Comprehensive error handling

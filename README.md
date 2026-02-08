# Orb - Roadside Assistance App

<div align="center">

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

A comprehensive mobile application that connects stranded motorists with nearby mechanics. Whether you're facing a breakdown in an unfamiliar area or need a quick repair, Orb ensures help is just a few taps away.

[Download APK](https://expo.dev/accounts/bbq1536/projects/orb/builds/a90ec14d-9000-4daf-8853-d61b2b7f2bc6) • [Backend API](https://backend-three-sepia-16.vercel.app/)

</div>

---

## Table of Contents

- [Project Overview](#project-overview)
- [Why Orb Exists](#why-orb-exists)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [User Flow](#user-flow)
- [Configuration](#configuration)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Screens Overview](#screens-overview)
- [Contributing](#contributing)
- [License](#license)

## Project Overview

Orb consists of a **React Native (Expo)** frontend and a **Node.js/Express** backend with **MongoDB**. It features real-time location tracking, offline support for finding mechanics, landmark management, and integrated payment systems (UPI & PayPal).

## Why Orb Exists

Vehicle breakdowns happen unexpectedly, often in unfamiliar locations where finding a reliable mechanic is difficult. Orb bridges the gap between stranded motorists and local mechanics by providing:

- **Immediate Assistance**: Quickly locate the nearest available help
- **Trust & Reliability**: Access mechanic profiles, ratings, and community reviews
- **Convenience**: Integrated calling and payment solutions in one app

## Features

- **Real-time Mechanic Finder**: Locates nearby mechanics based on your current GPS position
- **Offline Mode**: Caches mechanic data locally (SQLite) for access even with poor internet connectivity
- **Mechanic Profiles**: Detailed profiles including specialties, availability, and contact information
- **Landmark System**: Add and search for landmarks to help identify your location
- **Secure Payments**: Support for UPI (with QR code generation)
- **Review System**: Rate and review mechanics after service to help the community
- **Role-based Access**: Separate interfaces for Users (Motorists) and Mechanics
- **Location History**: Encrypted storage of user location history for privacy

## Tech Stack

### Frontend

<div>

![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

</div>

- **Framework**: React Native (via Expo)
- **UI Component Library**: Tamagui
- **Map & Location**: `react-native-maps`, `expo-location`
- **State/Storage**: `@react-native-async-storage/async-storage`, `expo-sqlite`
- **Authentication**: JWT-based custom authentication (integrated with SecureStore)

### Backend

<div>

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)

</div>

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (via Mongoose)
- **Authentication**: `jsonwebtoken`, `bcryptjs`
- **Email Service**: `nodemailer`
- **Encryption**: Built-in `crypto` module for sensitive data
- **Hosting**: Vercel

## User Flow

1. **Registration/Login**: Users sign up via email with OTP verification. Mechanics provide additional details including location and specialties.

2. **Home (Map View)**:
   - Users see their live location on an interactive map
   - Mechanics can toggle their availability and broadcast their location

3. **Search & Discovery**:
   - Users search for landmarks or view a list of nearby mechanics
   - Offline functionality serves cached mechanic data when network is unavailable

4. **Connect**:
   - User selects a mechanic to view their profile details
   - User taps "Call Now" to contact the mechanic directly

5. **Service & Payment**:
   - After service completion, payment is processed via UPI (QR code) or PayPal

6. **Review**:
   - User rates the mechanic and leaves a review to help the community

## Configuration

### Backend Setup

**Deployed Backend**: [https://backend-three-sepia-16.vercel.app/](https://backend-three-sepia-16.vercel.app/)

To run the backend locally, create a `.env` file in the `backend` directory with the following variables:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_32_byte_hex_key
EMAIL_USER=your_email_for_otp
EMAIL_PASS=your_email_password
```

### Frontend Setup

**APK Download**: [https://expo.dev/accounts/bbq1536/projects/orb/builds/a90ec14d-9000-4daf-8853-d61b2b7f2bc6](https://expo.dev/accounts/bbq1536/projects/orb/builds/a90ec14d-9000-4daf-8853-d61b2b7f2bc6)

To run locally:

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npx expo start
   ```

## Screens Overview

### Home Screen
Displays the user's current location on an interactive map. Features a header showing the user's address and quick access to location settings. For mechanics, includes controls to start/stop the background location service.

### Search Screen
Allows users to search for specific landmarks or browse nearby mechanics. Features a "Mechanic Finder" that sorts mechanics by distance and availability status.

### Mechanic Details (Modal)
Displays comprehensive mechanic information when selected:
- **Name & Rating**: Community trust indicators
- **Distance**: Proximity to user's current location
- **Actions**: Quick access buttons for Call, Pay, and Review

### Profile Screen
Manage user account details, switch roles (if applicable), and view past activities or payment history.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some feature'`)
5. Push to the branch (`git push origin feature/your-feature-name`)
6. Open a Pull Request

Please make sure to update tests as appropriate and adhere to the existing coding style.

---

<div align="center">

**Built with ❤️ for stranded motorists everywhere**

[Report Bug](https://github.com/yourusername/orb/issues) • [Request Feature](https://github.com/yourusername/orb/issues)

</div>

# MediaGuide NextGen - Backend

> **AI-Powered Healthcare Navigation & Medical Tourism Platform**
>
> Advanced backend system providing intelligent healthcare services, doctor discovery, appointment management, real-time consultations, and medical tourism support with multilingual and geolocation capabilities.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Running the Server](#running-the-server)
- [Scripts & Utilities](#scripts--utilities)
- [Real-Time Features](#real-time-features)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Team & Academic Context](#team--academic-context)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Project Overview

**MediaGuide NextGen** is a comprehensive healthcare navigation platform designed to bridge the gap between patients and healthcare providers through intelligent recommendations, real-time consultations, and seamless appointment management. The platform supports medical tourism with multilingual interfaces, geolocation-based doctor discovery, and AI-powered symptom analysis.

### Mission

To democratize access to healthcare services by providing patients with intelligent tools to find qualified doctors, understand their health concerns, and connect with medical professionals in real-time—while supporting healthcare providers in managing their practice and expanding their reach globally.

### Target Users

- **Patients**: Seeking healthcare services, medical consultations, and appointment scheduling
- **Doctors**: Looking to expand their practice, manage appointments, and conduct consultations
- **Admins**: Managing platform governance, doctor verification, and system operations

---

## 💻 Tech Stack

### Core Framework
- **Node.js**: JavaScript runtime for server-side application
- **Express.js**: Lightweight web framework for REST API development

### Database
- **MongoDB**: NoSQL database for flexible schema management
- **Mongoose**: ODM (Object Data Modeling) for MongoDB schema validation and utilities

### Authentication & Security
- **JWT (jsonwebtoken)**: Token-based authentication
- **bcryptjs**: Password hashing and encryption
- **express-validator**: Input validation and sanitization
- **express-rate-limit**: API rate limiting to prevent abuse

### Real-Time Communication
- **Socket.IO**: Bidirectional real-time communication for chat and notifications
- **WebRTC**: Peer-to-peer video consultation signaling

### File Handling
- **multer**: File upload middleware for doctor images and prescriptions
- **PDFKit**: PDF generation for prescription documents

### Utilities
- **axios**: HTTP client for external API calls
- **morgan**: HTTP request logging middleware
- **dotenv**: Environment variable management
- **CORS**: Cross-Origin Resource Sharing configuration

### Development Tools
- **nodemon**: Auto-restart server on file changes (dev dependency)

---

## ✨ Key Features

### 1. **AI-Powered Symptom Checker**
- Analyze user symptoms and suggest relevant medical conditions
- Multi-language symptom classification
- Intelligent pattern matching and recommendations

### 2. **Smart Doctor Discovery**
- Filter doctors by specialty, experience, ratings, and location
- Geolocation-based doctor recommendations
- Trust score calculation based on verifications and reviews
- Support for multiple cities and states

### 3. **Real-Time Video Consultations**
- WebRTC-based peer-to-peer video calls
- WebRTC signaling server coordination
- Seamless consultation scheduling and initiation

### 4. **Instant Messaging**
- Real-time chat between patients and doctors
- Socket.IO-powered real-time message delivery
- Message persistence and history retrieval

### 5. **Appointment Management**
- Schedule, reschedule, and cancel appointments
- Calendar integration and availability management
- Appointment confirmations and reminders

### 6. **Digital Prescriptions**
- Generate and store digital prescriptions
- PDF export functionality
- Prescription history tracking

### 7. **Patient Reviews & Ratings**
- Rate and review doctors
- Community-driven trust metrics
- Doctor performance analytics

### 8. **Doctor Verification System**
- Multi-level doctor verification process
- Admin-managed verification workflows
- Trust badges and certifications

### 9. **Complaint Management**
- Patient complaint lodging system
- Admin complaint review and resolution
- Complaint tracking and history

### 10. **Audit Logging**
- Comprehensive system activity tracking
- Admin action logging
- Security and compliance audit trails

### 11. **Multilingual Support**
- Multi-language API responses
- Localized health content
- User language preference management

### 12. **Medical Tourism Support**
- Geolocation-based recommendations
- Clinic location mapping
- International patient support

---

## 📁 Project Structure

```
backend/
├── config/                 # Configuration files
│   └── db.js              # MongoDB connection setup
├── middleware/            # Custom middleware functions
│   ├── auth.js           # JWT authentication & role-based access
│   └── errorHandler.js   # Global error handling middleware
├── models/               # Mongoose database schemas
│   ├── User.js          # Patient/user profile schema
│   ├── Doctor.js        # Doctor profile with specialization & location
│   ├── Appointment.js   # Appointment scheduling schema
│   ├── Chat.js          # Real-time chat message schema
│   ├── Prescription.js  # Digital prescription schema
│   ├── Review.js        # Doctor reviews and ratings
│   ├── Complaint.js     # Patient complaint schema
│   ├── AuditLog.js      # System activity logging
│   └── index.js         # Centralized model exports
├── routes/              # API route handlers
│   ├── auth.js         # Authentication endpoints (register, login, profile)
│   ├── doctor.js       # Doctor profile management
│   ├── doctors.js      # Doctor discovery & search
│   ├── appointments.js # Appointment CRUD operations
│   ├── chat.js         # Chat message endpoints
│   ├── consultation.js # Video consultation coordination
│   ├── prescriptions.js # Prescription management
│   ├── reviews.js      # Review endpoints
│   ├── symptoms.js     # Symptom checker AI
│   └── admin.js        # Admin operations & verification
├── realtime/           # Real-time communication
│   └── webrtcSignaling.js # WebRTC signaling server
├── utils/              # Utility functions
│   └── trustScore.js   # Doctor trust score calculations
├── scripts/            # Automation & maintenance scripts
│   ├── seedData.js     # Populate database with test data
│   ├── resetDB.js      # Reset database to clean state
│   └── backfillDoctorCoordinates.js # Geolocation data update
├── uploads/            # File upload storage
│   └── doctors/        # Doctor profile images
├── server.js           # Main application entry point
├── package.json        # Dependencies and scripts
└── .env               # Environment variables (not in repo)
```

---

## 🗄️ Database Schema

### User Model
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  password: String (hashed),
  phone: String,
  profileImage: String,
  role: String (enum: ['patient', 'doctor', 'admin']),
  age: Number,
  gender: String,
  nationality: String,
  bloodGroup: String,
  preferredLanguage: String,
  currentLocation: {
    city: String,
    state: String,
    coordinates: { lat: Number, lng: Number }
  },
  emergencyContactNumber: String,
  existingConditions: [String],
  verificationStatus: String,
  isVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Doctor Model
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  name: String,
  email: String,
  specialization: String,
  qualifications: [String],
  experience: Number (years),
  licenseNumber: String,
  clinicName: String,
  clinicLocation: {
    city: String,
    state: String,
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  consultationFee: Number,
  languages: [String],
  availability: {
    monday: { start: String, end: String },
    // ... other days
  },
  profileImage: String,
  bio: String,
  rating: Number,
  totalReviews: Number,
  trustScore: Number,
  isVerified: Boolean,
  verificationDate: Date,
  documents: [String],
  createdAt: Date,
  updatedAt: Date
}
```

### Appointment Model
```javascript
{
  _id: ObjectId,
  patientId: ObjectId (ref: User),
  doctorId: ObjectId (ref: Doctor),
  appointmentDate: Date,
  consultationType: String (enum: ['video', 'chat', 'clinic']),
  status: String (enum: ['scheduled', 'completed', 'cancelled', 'no-show']),
  symptoms: [String],
  notes: String,
  meetingLink: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Chat Model
```javascript
{
  _id: ObjectId,
  senderId: ObjectId (ref: User),
  receiverId: ObjectId (ref: User),
  message: String,
  messageType: String (enum: ['text', 'image', 'file']),
  attachmentUrl: String,
  read: Boolean,
  readAt: Date,
  createdAt: Date
}
```

### Prescription Model
```javascript
{
  _id: ObjectId,
  appointmentId: ObjectId (ref: Appointment),
  doctorId: ObjectId (ref: Doctor),
  patientId: ObjectId (ref: User),
  medicines: [{
    name: String,
    dosage: String,
    frequency: String,
    duration: String,
    notes: String
  }],
  diagnosis: String,
  notes: String,
  pdfUrl: String,
  issuedDate: Date,
  createdAt: Date
}
```

### Review Model
```javascript
{
  _id: ObjectId,
  doctorId: ObjectId (ref: Doctor),
  patientId: ObjectId (ref: User),
  rating: Number (1-5),
  review: String,
  communicationRating: Number,
  professionalismRating: Number,
  helpfulnessRating: Number,
  verified: Boolean,
  createdAt: Date
}
```

### Additional Models
- **Complaint**: Patient complaints with status tracking
- **AuditLog**: System activity and admin actions logging

---

## 🔌 API Endpoints

### Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/register` | Register new user (patient/doctor) | No |
| POST | `/login` | User login with email & password | No |
| GET | `/profile` | Get current user profile | Yes |
| PUT | `/profile` | Update user profile | Yes |
| POST | `/logout` | Logout user | Yes |
| POST | `/refresh-token` | Refresh JWT token | Yes |

**Request Examples:**
```bash
# Register
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123",
  "phone": "+1234567890",
  "age": 30,
  "gender": "male",
  "preferredLanguage": "en"
}

# Login
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

---

### Doctor Endpoints

#### Doctor Profile Management (`/api/doctor`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/profile` | Get doctor's own profile | Yes (Doctor) |
| PUT | `/profile` | Update doctor profile | Yes (Doctor) |
| POST | `/availability` | Set doctor availability | Yes (Doctor) |
| GET | `/appointments` | Get doctor's appointments | Yes (Doctor) |
| GET | `/earnings` | Get doctor earnings summary | Yes (Doctor) |
| PUT | `/profileImage` | Upload doctor profile image | Yes (Doctor) |

#### Doctor Discovery (`/api/doctors`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/` | Get all doctors with filters | No |
| GET | `/:id` | Get specific doctor profile | No |
| GET | `/search/nearby` | Find doctors by location | No |
| GET | `/:id/reviews` | Get doctor reviews | No |
| GET | `/:id/availability` | Get doctor availability | No |

**Query Parameters:**
```
GET /api/doctors?
  specialization=cardiology&
  city=NewYork&
  minRating=4&
  language=en&
  maxFee=150&
  limit=20&
  page=1
```

---

### Appointment Endpoints (`/api/appointments`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/` | Create new appointment | Yes (Patient) |
| GET | `/` | Get user's appointments | Yes |
| GET | `/:id` | Get appointment details | Yes |
| PUT | `/:id` | Update appointment | Yes (Patient/Doctor) |
| DELETE | `/:id` | Cancel appointment | Yes (Patient/Doctor) |
| GET | `/status/active` | Get active appointments | Yes |
| POST | `/:id/reschedule` | Reschedule appointment | Yes (Patient) |

**Request Example:**
```bash
POST /api/appointments
{
  "doctorId": "doctor_id",
  "appointmentDate": "2026-05-15T14:30:00Z",
  "consultationType": "video",
  "symptoms": ["fever", "cough"]
}
```

---

### Chat Endpoints (`/api/chat`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/message` | Send message | Yes |
| GET | `/conversations` | Get all conversations | Yes |
| GET | `/:conversationId/messages` | Get conversation messages | Yes |
| PUT | `/:messageId/read` | Mark message as read | Yes |
| GET | `/unread/count` | Get unread message count | Yes |

---

### Consultation Endpoints (`/api/consultation`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/start` | Initiate video consultation | Yes |
| POST | `/end` | End video consultation | Yes |
| GET | `/:appointmentId/status` | Get consultation status | Yes |
| POST | `/generate-token` | Generate WebRTC token | Yes |

---

### Prescription Endpoints (`/api/prescriptions`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/` | Create prescription | Yes (Doctor) |
| GET | `/` | Get user prescriptions | Yes |
| GET | `/:id` | Get prescription details | Yes |
| GET | `/:id/pdf` | Download prescription as PDF | Yes |

**Request Example:**
```bash
POST /api/prescriptions
{
  "appointmentId": "appointment_id",
  "diagnosis": "Common cold with flu symptoms",
  "medicines": [
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "5 days"
    }
  ],
  "notes": "Rest and stay hydrated"
}
```

---

### Review Endpoints (`/api/reviews`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/` | Create/submit review | Yes (Patient) |
| GET | `/doctor/:doctorId` | Get doctor reviews | No |
| PUT | `/:reviewId` | Update review | Yes (Patient) |
| DELETE | `/:reviewId` | Delete review | Yes (Patient) |
| GET | `/my/reviews` | Get user's written reviews | Yes |

**Request Example:**
```bash
POST /api/reviews
{
  "doctorId": "doctor_id",
  "rating": 5,
  "review": "Excellent consultation, very professional",
  "communicationRating": 5,
  "professionalismRating": 5,
  "helpfulnessRating": 4
}
```

---

### Symptom Checker (`/api/symptoms`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/analyze` | Analyze symptoms | No |
| GET | `/list` | Get symptom database | No |
| GET | `/conditions` | Get medical conditions | No |
| POST | `/suggest-specialists` | Suggest doctor specializations | No |

**Request Example:**
```bash
POST /api/symptoms/analyze
{
  "symptoms": ["headache", "fever", "body ache"],
  "duration": "3 days",
  "severity": "moderate",
  "language": "en"
}
```

---

### Admin Endpoints (`/api/admin`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/doctors/pending-verification` | List unverified doctors | Yes (Admin) |
| POST | `/doctors/:doctorId/verify` | Verify doctor | Yes (Admin) |
| POST | `/doctors/:doctorId/reject` | Reject doctor application | Yes (Admin) |
| GET | `/complaints` | Get all complaints | Yes (Admin) |
| POST | `/complaints/:complaintId/resolve` | Resolve complaint | Yes (Admin) |
| GET | `/audit-logs` | View system audit logs | Yes (Admin) |
| POST | `/system/reset` | Reset database (dev only) | Yes (Admin) |
| POST | `/system/seed` | Seed test data | Yes (Admin) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v16.0.0 or higher
- **MongoDB** v4.4 or higher (local or cloud instance via MongoDB Atlas)
- **npm** v7.0.0 or higher
- **Git** for version control

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/mediaguide-nextgen.git
   cd mediaguide-nextgen/backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment configuration:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration (see Environment Configuration section)
   ```

4. **Set up MongoDB:**
   - **Local MongoDB**: Ensure MongoDB service is running
     ```bash
     # macOS with Homebrew
     brew services start mongodb-community
     
     # Windows (if installed as service)
     net start MongoDB
     
     # Linux
     sudo systemctl start mongod
     ```
   
   - **MongoDB Atlas** (Recommended for production):
     1. Create account at https://www.mongodb.com/cloud/atlas
     2. Create a cluster
     3. Get connection string
     4. Add it to `.env` as `MONGO_URI`

5. **Seed initial data (optional):**
   ```bash
   npm run seed
   ```

---

## 🔐 Environment Configuration

Create a `.env` file in the `backend` directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
MONGO_URI=mongodb://localhost:27017/mediaguide-nextgen
# OR for MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/mediaguide-nextgen?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRE=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:3002

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_DIR=./uploads

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
ADMIN_EMAIL=admin@mediaguide.com

# External APIs
GEOLOCATION_API_KEY=your_geolocation_api_key
SYMPTOM_AI_API_KEY=your_symptom_checker_api_key

# Socket.IO Configuration
SOCKET_RECONNECTION_DELAY=1000
SOCKET_RECONNECTION_DELAY_MAX=5000

# WebRTC Configuration
TURN_SERVER_URL=your_turn_server_url
TURN_USERNAME=your_turn_username
TURN_PASSWORD=your_turn_password

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Serve Frontend Assets (development)
SERVE_FRONTEND_ASSETS=false

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

### Environment Variable Reference

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Environment type | development | production |
| `PORT` | Server port | 5000 | 3000 |
| `MONGO_URI` | MongoDB connection string | - | mongodb://localhost:27017/db |
| `JWT_SECRET` | JWT signing secret (REQUIRED in prod) | - | complex_random_string_min_32_chars |
| `JWT_EXPIRE` | JWT expiration time | 7d | 24h |
| `CORS_ORIGIN` | Allowed CORS origins | * | http://localhost:3000,https://app.com |
| `MAX_FILE_SIZE` | Max file upload size (bytes) | 5MB | 5242880 |

### Important Security Notes

⚠️ **Production Checklist:**
- Set `NODE_ENV=production` in production environment
- Use strong, unique `JWT_SECRET` (minimum 32 characters)
- Configure proper `CORS_ORIGIN` values (never use `*`)
- Use MongoDB Atlas with encrypted connection strings
- Implement HTTPS/SSL certificates
- Use environment-specific secrets management (AWS Secrets Manager, HashiCorp Vault)
- Enable MongoDB authentication and access controls
- Rotate credentials regularly

---

## ▶️ Running the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```
Server will start at `http://localhost:5000` and automatically restart on file changes.

### Production Mode
```bash
npm start
```

### Verify Server is Running
```bash
curl http://localhost:5000/health
# Expected response: { "status": "healthy", "database": "connected" }
```

---

## 📚 Scripts & Utilities

### Database Management

**Seed Database with Test Data:**
```bash
npm run seed
```
Populates the database with:
- 10 test patients with varied profiles
- 15 test doctors across multiple specializations
- 20 appointments with different statuses
- Sample chats, reviews, and prescriptions

**Reset Database to Clean State:**
```bash
npm run reset
```
⚠️ **Warning**: This completely clears the database. Use only in development!

**Backfill Doctor Coordinates:**
```bash
npm run backfill:coordinates
```
Updates doctor clinic locations with geolocation coordinates from addresses.

---

## 🔌 Real-Time Features

### WebRTC Video Consultation

The backend provides WebRTC signaling coordination:

1. **Connection Initiation** (`POST /api/consultation/start`)
   ```json
   {
     "appointmentId": "apt_123",
     "initiatorId": "user_123"
   }
   ```

2. **Token Generation** (`POST /api/consultation/generate-token`)
   - Returns tokens for both peer connections
   - Includes TURN server credentials for NAT traversal

3. **Signaling Messages** (via Socket.IO)
   - `offer`: WebRTC offer from caller
   - `answer`: WebRTC answer from recipient
   - `ice-candidate`: ICE candidates for connectivity

### Socket.IO Real-Time Events

**Connection Events:**
```javascript
// Client connects
socket.on('connect', () => { /* ... */ });

// Client disconnects
socket.on('disconnect', () => { /* ... */ });

// User comes online
socket.on('user-online', (userId) => { /* ... */ });

// User goes offline
socket.on('user-offline', (userId) => { /* ... */ });
```

**Chat Events:**
```javascript
// Send message
socket.emit('send-message', { receiverId, message, type: 'text' });

// Receive message
socket.on('receive-message', (message) => { /* ... */ });

// Typing indicator
socket.emit('typing', { receiverId, isTyping: true });
socket.on('user-typing', (senderId, isTyping) => { /* ... */ });

// Message read
socket.emit('message-read', { messageId, conversationId });
```

**Consultation Events:**
```javascript
// Consultation started
socket.emit('consultation-start', { appointmentId, initiatorId });

// Consultation ended
socket.emit('consultation-end', { appointmentId });

// WebRTC signals
socket.emit('webrtc-offer', { to, offer });
socket.emit('webrtc-answer', { to, answer });
socket.emit('webrtc-ice-candidate', { to, candidate });
```

---

## 🔒 Security

### Authentication & Authorization

- **JWT Tokens**: All protected endpoints require Bearer token in Authorization header
  ```
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  ```

- **Role-Based Access Control (RBAC)**:
  - `patient`: Access user appointments, chat, prescriptions
  - `doctor`: Manage profile, availability, appointments, consultations
  - `admin`: System management, doctor verification, complaint resolution

- **Password Security**:
  - Passwords hashed with bcryptjs (10 rounds salt)
  - Never transmitted in plaintext

### Rate Limiting

All API endpoints are protected with rate limiting:
- **Default**: 100 requests per 15-minute window per IP
- **Stricter limits** for auth endpoints: 5 requests per 15 minutes

### Input Validation

- All inputs validated using `express-validator`
- XSS protection through sanitization
- SQL injection protection via Mongoose schema validation
- File upload restrictions (type, size, location)

### CORS Configuration

- Configured to allow only specified origins
- Credentials allowed only from trusted domains
- Methods restricted to GET, POST, PUT, DELETE

### API Response Security

- No sensitive data in error messages
- Stack traces hidden in production
- Rate limiting headers included in responses
- HTTPS enforced in production

---

## 🐛 Troubleshooting

### Database Connection Issues

**Problem**: `MongooseError: Cannot connect to MongoDB`

**Solutions**:
```bash
# Verify MongoDB is running
# Windows:
net start MongoDB

# macOS:
brew services start mongodb-community

# Linux:
sudo systemctl start mongod

# Check connection string in .env
echo $MONGO_URI

# Test connection manually
mongo "mongodb://localhost:27017/mediaguide-nextgen"
```

### JWT Token Errors

**Problem**: `Invalid or expired token`

**Solutions**:
- Verify `JWT_SECRET` is set in `.env`
- Check token format in Authorization header: `Bearer <token>`
- Verify token hasn't expired (default 7 days)
- Ensure token matches the JWT_SECRET used to sign it

### CORS Errors

**Problem**: `Access to XMLHttpRequest blocked by CORS policy`

**Solutions**:
```javascript
// Add your frontend URL to CORS_ORIGIN in .env
CORS_ORIGIN=http://localhost:3000,https://yourdomain.com

// Verify frontend sends credentials if needed
fetch(url, { credentials: 'include' })
```

### File Upload Issues

**Problem**: `File upload failed` or `File too large`

**Solutions**:
```bash
# Check upload directory exists
mkdir -p uploads/doctors

# Verify permissions
chmod 755 uploads/

# Check MAX_FILE_SIZE in .env (default 5MB = 5242880 bytes)
# Increase if needed: MAX_FILE_SIZE=10485760 (10MB)
```

### Memory Leaks / High CPU Usage

**Problem**: Server process growing in memory or high CPU

**Solutions**:
```bash
# Check for unhandled promise rejections
# Enable strict error handling in production

# Monitor with Node.js profiler
node --prof server.js

# Check for socket.io connection leaks
# Ensure proper disconnect handling
```

### WebRTC/Video Consultation Not Working

**Problem**: Video calls fail to establish

**Solutions**:
1. Ensure TURN server credentials are configured
2. Check firewall/NAT traversal settings
3. Verify `TURN_SERVER_URL` and credentials in `.env`
4. Test with direct IP addresses first, then domain names
5. Check browser console for specific WebRTC errors

### Testing the API

Use Postman, Insomnia, or curl for testing:

```bash
# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPassword123"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'

# Get doctors with token
curl -X GET http://localhost:5000/api/doctors \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## 📖 Team & Academic Context

### Project Information

- **Project Name**: MediaGuide NextGen
- **Type**: Capstone Project - Full-Stack Healthcare Platform
- **Institution**: Lovely Professional University (LPU)
- **Academic Year**: 2025-2026
- **Supervised by**: Faculty of Computer Science & Engineering

### Team

- **Project Lead**: MediGuide Development Team
- **Backend Architecture**: Node.js + Express + MongoDB
- **Frontend**: React + TypeScript + Vite
- **Real-Time Systems**: Socket.IO + WebRTC

### Project Goals

1. ✅ Create scalable healthcare navigation platform
2. ✅ Implement AI-powered symptom analysis
3. ✅ Build real-time consultation features
4. ✅ Support medical tourism globally
5. ✅ Ensure secure and compliant system

### Use Cases Addressed

- **Patient Use Case**: Discover qualified doctors, book appointments, conduct video consultations
- **Doctor Use Case**: Manage profile, view appointments, conduct consultations, issue prescriptions
- **Admin Use Case**: Verify doctors, manage complaints, monitor system activity

---

## 🤝 Contributing

### Development Workflow

1. **Create feature branch**:
   ```bash
   git checkout -b feature/new-feature-name
   ```

2. **Make changes and test**:
   ```bash
   npm run dev
   # Test endpoints with Postman/curl
   ```

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

4. **Push to repository**:
   ```bash
   git push origin feature/new-feature-name
   ```

5. **Create Pull Request** with:
   - Clear description of changes
   - Tests performed
   - Any breaking changes
   - Screenshots/logs if applicable

### Code Style & Standards

- Use consistent indentation (2 spaces)
- Follow Express best practices
- Add JSDoc comments for functions
- Keep functions focused and testable
- Use descriptive variable names
- Validate all user inputs

### Commit Message Format

```
type(scope): subject

type: feat, fix, docs, style, refactor, test, chore
scope: models, routes, middleware, utils, etc.
subject: concise description (lowercase, no period)

Example: feat(routes): add doctor availability endpoints
```

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](../LICENSE) file for details.

### License Terms

- ✅ Commercial use permitted
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed
- ❌ No liability (use at your own risk)
- ❌ No warranty provided

---

## 📞 Support & Documentation

### Additional Resources

- **Frontend Documentation**: See `../patient-app/README.md`
- **Doctor App Documentation**: See `../doctor-app/README.md`
- **Admin App Documentation**: See `../admin-app/README.md`
- **Project Architecture**: See `../ARCHITECTURE_GUIDE.md`
- **Getting Started**: See `../GETTING_STARTED.md`

### Reporting Issues

Report issues or bugs on the GitHub repository with:
- Detailed description
- Steps to reproduce
- Expected vs. actual behavior
- Environment info (Node version, OS, MongoDB version)
- Relevant logs/error messages

### API Documentation

For interactive API documentation, consider using:
- **Swagger/OpenAPI**: Add `swagger-ui-express` for auto-generated docs
- **Postman**: Import API collection from `/api-docs/postman-collection.json`
- **Insomnia**: Import workspace from `/api-docs/insomnia-workspace.json`

---

**Last Updated**: May 2026
**Version**: 2.0.0
**Status**: Production Ready ✅


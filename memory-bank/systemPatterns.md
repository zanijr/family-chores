# System Patterns - Family Chore App

## Architecture Overview

### Microservices Pattern (Containerized)
```
┌─────────────────────────────────────────────────────────────┐
│                    family.bananas4life.com                 │
│                  (Nginx Proxy Manager)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS/SSL
┌─────────────────────▼───────────────────────────────────────┐
│                Docker Host (192.168.12.99:8080)           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Nginx     │  │   Node.js   │  │      MySQL 8.0      │  │
│  │ (Frontend)  │◄─┤    API      │◄─┤    (Database)       │  │
│  │   Port 80   │  │  Port 3000  │  │    Port 3306        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                │                     │            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Static    │  │   Uploads   │  │    Persistent       │  │
│  │   Assets    │  │   Volume    │  │     Data            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Design Patterns

### 1. Repository Pattern (Database Access)
```javascript
// Database abstraction layer
class FamilyRepository {
  async findByCode(familyCode) { /* ... */ }
  async create(familyData) { /* ... */ }
  async addMember(familyId, userData) { /* ... */ }
}

class ChoreRepository {
  async findByFamily(familyId) { /* ... */ }
  async create(choreData) { /* ... */ }
  async updateStatus(choreId, status) { /* ... */ }
}
```

### 2. Middleware Pattern (Express.js)
```javascript
// Authentication middleware
app.use('/api/protected', authenticateJWT);
app.use('/api/admin', requireParentRole);

// Validation middleware
app.post('/api/chores', validateChoreInput, createChore);

// Error handling middleware
app.use(globalErrorHandler);
```

### 3. Factory Pattern (User Creation)
```javascript
class UserFactory {
  static createUser(type, data) {
    switch(type) {
      case 'parent': return new ParentUser(data);
      case 'child': return new ChildUser(data);
      default: throw new Error('Invalid user type');
    }
  }
}
```

### 4. Observer Pattern (Real-time Updates)
```javascript
// Event-driven updates
class ChoreEventEmitter extends EventEmitter {
  choreAssigned(choreId, userId) {
    this.emit('chore:assigned', { choreId, userId });
  }
  
  choreCompleted(choreId, submissionData) {
    this.emit('chore:completed', { choreId, submissionData });
  }
}
```

## Data Flow Patterns

### 1. Request/Response Flow
```
Client Request → Nginx → API Gateway → Authentication → 
Validation → Business Logic → Database → Response
```

### 2. Authentication Flow
```
1. Family Code Entry → Family Validation
2. User Selection → User Validation  
3. JWT Generation → Token Storage
4. Protected Route Access → Token Verification
```

### 3. Chore Lifecycle Flow
```
Create → Available → Assigned → Accepted → In Progress → 
Submitted → Under Review → Approved/Rejected → Completed
```

## Component Patterns

### 1. Progressive Web App (PWA) Structure
```
frontend/
├── index.html          # Main application shell
├── app.js             # Alpine.js application logic
├── manifest.json      # PWA manifest
├── sw.js             # Service worker
└── assets/           # Static resources
```

### 2. API Route Organization
```
api/routes/
├── auth.js           # Authentication endpoints
├── families.js       # Family management
├── users.js          # User operations
├── chores.js         # Chore CRUD operations
└── uploads.js        # File upload handling
```

### 3. Database Schema Pattern
```sql
-- Hierarchical family structure
families (1) → users (N)
users (1) → chore_assignments (N)
chores (1) → chore_assignments (N)
chore_assignments (1) → chore_submissions (N)
chore_submissions (1) → completed_tasks (1)
```

## Security Patterns

### 1. Defense in Depth
```
Layer 1: Nginx Proxy Manager (SSL, Rate Limiting)
Layer 2: Docker Network Isolation
Layer 3: Application Authentication (JWT)
Layer 4: Input Validation & Sanitization
Layer 5: Database Access Control
```

### 2. Role-Based Access Control (RBAC)
```javascript
const permissions = {
  parent: ['create_chore', 'assign_chore', 'review_submission', 'manage_family'],
  child: ['view_chores', 'accept_chore', 'submit_completion']
};

function hasPermission(userRole, action) {
  return permissions[userRole]?.includes(action);
}
```

### 3. Secure File Upload Pattern
```javascript
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    cb(null, allowedTypes.includes(file.mimetype));
  }
});
```

## Error Handling Patterns

### 1. Centralized Error Handling
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

const globalErrorHandler = (err, req, res, next) => {
  const { statusCode = 500, message } = err;
  res.status(statusCode).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : message
  });
};
```

### 2. Graceful Degradation
```javascript
// Frontend fallback patterns
if (!navigator.onLine) {
  showOfflineMessage();
  loadFromCache();
}

// API fallback
try {
  const data = await fetchFromAPI();
} catch (error) {
  const cachedData = await loadFromLocalStorage();
  return cachedData || defaultData;
}
```

## Performance Patterns

### 1. Caching Strategy
```javascript
// In-memory cache for frequent queries
const cache = new Map();

async function getFamilyMembers(familyId) {
  const cacheKey = `family:${familyId}:members`;
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  const members = await db.query(/* ... */);
  cache.set(cacheKey, members, { ttl: 300 }); // 5 minutes
  return members;
}
```

### 2. Database Connection Pooling
```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

### 3. Lazy Loading Pattern
```javascript
// Frontend lazy loading
function loadChoreDetails(choreId) {
  return import('./components/ChoreDetails.js')
    .then(module => module.render(choreId));
}

// Image lazy loading
const imageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      imageObserver.unobserve(img);
    }
  });
});
```

## Deployment Patterns

### 1. Container Orchestration
```yaml
# docker-compose.yml pattern
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    depends_on: [api]
    
  api:
    build: ./api
    depends_on: [mysql]
    
  mysql:
    image: mysql:8.0
    volumes: [mysql_data:/var/lib/mysql]
```

### 2. Health Check Pattern
```javascript
// API health endpoint
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});
```

### 3. Configuration Management
```javascript
// Environment-based configuration
const config = {
  development: {
    db: { host: 'localhost', port: 3306 },
    jwt: { expiresIn: '1h' }
  },
  production: {
    db: { host: process.env.DB_HOST, port: process.env.DB_PORT },
    jwt: { expiresIn: '24h' }
  }
};

module.exports = config[process.env.NODE_ENV || 'development'];
```

## Integration Patterns

### 1. API Gateway Pattern
```javascript
// Single entry point for all API requests
app.use('/api/v1', apiRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/families', familyRouter);
app.use('/api/v1/chores', choreRouter);
```

### 2. Event-Driven Architecture
```javascript
// Decoupled event handling
eventEmitter.on('chore:completed', async (data) => {
  await updateUserEarnings(data.userId, data.reward);
  await sendNotification(data.parentId, 'Chore completed');
  await logActivity(data);
});
```

### 3. Adapter Pattern (External Services)
```javascript
// Abstraction for external integrations
class NotificationAdapter {
  async send(message, recipient) {
    // Could be email, SMS, push notification, etc.
    return await this.provider.send(message, recipient);
  }
}

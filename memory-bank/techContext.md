# Technical Context - Family Chore App

## Technology Stack

### Frontend
- **Framework**: Progressive Web App (PWA)
- **JavaScript**: Alpine.js 3.x for reactive components
- **CSS**: Tailwind CSS for responsive design
- **Build**: Vanilla HTML/CSS/JS (no build process required)
- **Features**: Service worker for offline capability, manifest for app installation

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer for photo handling
- **Validation**: Express-validator for input sanitization
- **Security**: Helmet.js, CORS, rate limiting

### Database
- **Engine**: MySQL 8.0
- **ORM**: Native MySQL2 driver (no ORM for simplicity)
- **Schema**: Comprehensive family/user/chore management
- **Backup**: Automated mysqldump scripts

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx (internal reverse proxy)
- **SSL**: Handled by user's nginx proxy manager
- **Storage**: Docker volumes for persistence
- **Networking**: Internal Docker network + external port 8080

## Architecture Patterns

### API Design
- **Style**: RESTful API
- **Authentication**: JWT-based with role checking
- **Error Handling**: Consistent JSON error responses
- **Validation**: Input sanitization and validation middleware
- **File Handling**: Secure upload with type/size restrictions

### Database Schema
```sql
families -> users -> chores -> assignments -> submissions -> completed_tasks
```

### Security Model
- **Authentication**: Family code + user selection
- **Authorization**: Role-based (parent/child permissions)
- **Data Protection**: Input validation, SQL injection prevention
- **File Security**: Upload restrictions, secure file serving

## Development Environment

### Local Development
- **Requirements**: Docker Desktop, Node.js 18+
- **Setup**: `docker-compose up --build`
- **Database**: Auto-initialization with schema
- **Hot Reload**: Volume mounts for development

### Production Deployment
- **Server**: User's server at 192.168.12.99
- **Port**: Internal 8080, external via nginx proxy manager
- **Domain**: family.bananas4life.com
- **SSL**: Managed by nginx proxy manager
- **Persistence**: Named Docker volumes

## Configuration Management

### Environment Variables
```bash
# Database
DB_HOST=mysql
DB_PORT=3306
DB_USER=chores_user
DB_PASSWORD=secure_password
DB_NAME=family_chores

# Application
NODE_ENV=production
JWT_SECRET=secure_jwt_secret
PORT=3000

# File Upload
UPLOAD_MAX_SIZE=5242880
UPLOAD_PATH=/app/uploads
```

### Docker Configuration
- **Services**: nginx, api, mysql
- **Networks**: Internal bridge network
- **Volumes**: mysql_data, uploads, frontend
- **Health Checks**: All services monitored

## Performance Considerations

### Frontend Optimization
- **Lazy Loading**: Images and components loaded on demand
- **Caching**: Service worker caches static assets
- **Compression**: Gzip compression via nginx
- **Responsive Images**: Optimized for different screen sizes

### Backend Optimization
- **Connection Pooling**: MySQL connection pool
- **Rate Limiting**: API endpoint protection
- **Compression**: Response compression middleware
- **Caching**: In-memory caching for frequent queries

### Database Optimization
- **Indexing**: Proper indexes on foreign keys and search fields
- **Query Optimization**: Efficient joins and pagination
- **Backup Strategy**: Regular automated backups
- **Connection Management**: Pool size optimization

## Security Implementation

### Authentication Flow
1. Family code validation
2. User selection from family
3. JWT token generation
4. Token validation on protected routes

### Data Protection
- **Input Validation**: All user inputs sanitized
- **SQL Injection**: Parameterized queries
- **XSS Protection**: Content Security Policy headers
- **File Upload**: Type and size restrictions

### Infrastructure Security
- **Container Isolation**: Docker security best practices
- **Network Security**: Internal Docker networking
- **SSL/TLS**: Handled by nginx proxy manager
- **Secrets Management**: Environment variables

## Monitoring and Maintenance

### Health Monitoring
- **Container Health**: Docker health checks
- **Database Health**: Connection monitoring
- **API Health**: Endpoint availability checks
- **Storage Health**: Volume space monitoring

### Backup Strategy
- **Database**: Daily automated mysqldump
- **Uploads**: File system backup
- **Configuration**: Docker compose and env backup
- **Restoration**: Documented recovery procedures

### Update Process
- **Rolling Updates**: Zero-downtime deployment
- **Database Migrations**: Version-controlled schema changes
- **Configuration Updates**: Environment variable management
- **Rollback Strategy**: Previous version restoration

## Integration Points

### Nginx Proxy Manager
- **Upstream**: 192.168.12.99:8080
- **SSL**: Automatic certificate management
- **Headers**: Proper forwarding headers
- **Caching**: Static asset caching

### File System
- **Uploads**: Persistent volume for user photos
- **Logs**: Container log management
- **Backups**: External backup storage integration
- **Cleanup**: Automated old file cleanup

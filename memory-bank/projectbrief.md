# Family Chore App - Project Brief

## Project Overview
Create a comprehensive, self-hosted family chore management application that will be accessible via family.bananas4life.com. This is an enhanced version based on the user's existing WebApp project from GitHub (https://github.com/zanijr/WebApp).

## Core Requirements
- **Self-hosted**: Fully contained on user's server (192.168.12.99)
- **Domain**: family.bananas4life.com (already configured with SSL)
- **Port**: Internal port 8080 for nginx proxy manager integration
- **Cross-platform**: Works seamlessly on phone, tablet, and computer
- **Docker-based**: Complete containerized solution
- **Database**: MySQL 8.0 (user preference)

## Key Stakeholders
- **Primary User**: Family administrator managing household chores
- **End Users**: Family members (parents and children) using the app daily
- **Technical Environment**: Self-hosted server with nginx proxy manager and Docker

## Success Criteria
1. **Functional**: Complete chore management system with user roles, assignments, and rewards
2. **Accessible**: Responsive design that works on all devices
3. **Reliable**: Self-hosted solution with automated backups
4. **Maintainable**: Easy deployment and update process
5. **Secure**: Proper authentication and data protection

## Project Scope
**In Scope:**
- Enhanced version of existing family chore app
- Docker containerization with nginx, Node.js API, MySQL
- Progressive Web App (PWA) frontend
- Family management with role-based access
- Chore creation, assignment, and tracking
- Photo verification system
- Reward tracking (money/screen time)
- Mobile-optimized interface
- Automated backup system

**Out of Scope:**
- Native mobile apps (PWA sufficient)
- Complex authentication (2FA, social login)
- External integrations
- Multi-tenant architecture

## Timeline
- **Phase 1**: Memory bank and infrastructure setup (30 min)
- **Phase 2**: Database and API development (45 min)
- **Phase 3**: Enhanced frontend with mobile optimizations (45 min)
- **Phase 4**: Deployment scripts and documentation (30 min)
- **Total**: ~2.5 hours

## Technical Foundation
Based on user's existing project architecture with enhancements for production deployment and mobile optimization.

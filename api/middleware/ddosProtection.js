const rateLimit = require('express-rate-limit');

// Enhanced DDOS Protection Middleware
class DDOSProtection {
  constructor() {
    this.suspiciousIPs = new Map();
    this.blockedIPs = new Set();
    this.requestCounts = new Map();
  }

  // Strict rate limiting for authentication endpoints
  createAuthLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 auth requests per windowMs
      message: {
        error: 'Too many authentication attempts from this IP, please try again later.',
        retryAfter: 900
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.flagSuspiciousIP(req.ip);
        res.status(429).json({
          error: 'Too many authentication attempts from this IP, please try again later.',
          retryAfter: 900
        });
      }
    });
  }

  // General API rate limiting
  createGeneralLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 900
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.flagSuspiciousIP(req.ip);
        res.status(429).json({
          error: 'Too many requests from this IP, please try again later.',
          retryAfter: 900
        });
      }
    });
  }

  // Aggressive rate limiting for upload endpoints
  createUploadLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // limit each IP to 10 upload requests per windowMs
      message: {
        error: 'Too many upload attempts from this IP, please try again later.',
        retryAfter: 900
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        this.flagSuspiciousIP(req.ip);
        res.status(429).json({
          error: 'Too many upload attempts from this IP, please try again later.',
          retryAfter: 900
        });
      }
    });
  }

  // Speed limiting middleware to slow down requests (custom implementation)
  createSpeedLimiter() {
    const requestTimes = new Map();
    
    return (req, res, next) => {
      const clientIP = req.ip;
      const now = Date.now();
      
      if (!requestTimes.has(clientIP)) {
        requestTimes.set(clientIP, []);
      }
      
      const times = requestTimes.get(clientIP);
      
      // Remove requests older than 15 minutes
      const fifteenMinutesAgo = now - (15 * 60 * 1000);
      const recentTimes = times.filter(time => time > fifteenMinutesAgo);
      
      // If more than 50 requests in 15 minutes, add delay
      if (recentTimes.length > 50) {
        const delay = Math.min((recentTimes.length - 50) * 500, 20000);
        this.flagSuspiciousIP(clientIP);
        
        setTimeout(() => {
          next();
        }, delay);
      } else {
        next();
      }
      
      // Add current request time
      recentTimes.push(now);
      requestTimes.set(clientIP, recentTimes);
      
      // Cleanup old entries periodically
      if (Math.random() < 0.01) { // 1% chance to cleanup
        for (const [ip, times] of requestTimes.entries()) {
          const filtered = times.filter(time => time > fifteenMinutesAgo);
          if (filtered.length === 0) {
            requestTimes.delete(ip);
          } else {
            requestTimes.set(ip, filtered);
          }
        }
      }
    };
  }

  // Request size limiting middleware
  createSizeLimiter() {
    return (req, res, next) => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
        this.flagSuspiciousIP(req.ip);
        return res.status(413).json({
          error: 'Request entity too large',
          maxSize: '10MB'
        });
      }
      
      next();
    };
  }

  // IP blocking middleware
  createIPBlocker() {
    return (req, res, next) => {
      const clientIP = req.ip;
      
      // Check if IP is blocked
      if (this.blockedIPs.has(clientIP)) {
        return res.status(403).json({
          error: 'Access denied. IP address has been blocked due to suspicious activity.',
          contact: 'Please contact support if you believe this is an error.'
        });
      }
      
      // Check if IP is suspicious
      if (this.suspiciousIPs.has(clientIP)) {
        const suspiciousData = this.suspiciousIPs.get(clientIP);
        
        // Block IP if it has been flagged too many times
        if (suspiciousData.count >= 10) {
          this.blockedIPs.add(clientIP);
          this.suspiciousIPs.delete(clientIP);
          
          console.warn(`🚨 DDOS Protection: Blocked IP ${clientIP} due to repeated suspicious activity`);
          
          return res.status(403).json({
            error: 'Access denied. IP address has been blocked due to suspicious activity.',
            contact: 'Please contact support if you believe this is an error.'
          });
        }
      }
      
      next();
    };
  }

  // Request pattern analysis middleware
  createPatternAnalyzer() {
    return (req, res, next) => {
      const clientIP = req.ip;
      const userAgent = req.get('User-Agent') || '';
      const currentTime = Date.now();
      
      // Track request patterns
      if (!this.requestCounts.has(clientIP)) {
        this.requestCounts.set(clientIP, {
          count: 0,
          firstRequest: currentTime,
          lastRequest: currentTime,
          userAgents: new Set(),
          endpoints: new Map()
        });
      }
      
      const ipData = this.requestCounts.get(clientIP);
      ipData.count++;
      ipData.lastRequest = currentTime;
      ipData.userAgents.add(userAgent);
      
      // Track endpoint access
      const endpoint = req.path;
      ipData.endpoints.set(endpoint, (ipData.endpoints.get(endpoint) || 0) + 1);
      
      // Analyze patterns for suspicious behavior
      const timeDiff = currentTime - ipData.firstRequest;
      const requestRate = ipData.count / (timeDiff / 1000); // requests per second
      
      // Flag suspicious patterns
      if (
        requestRate > 10 || // More than 10 requests per second
        ipData.userAgents.size > 5 || // Too many different user agents
        !userAgent || // No user agent
        userAgent.includes('bot') || userAgent.includes('crawler') || // Known bot patterns
        ipData.endpoints.size > 20 // Accessing too many different endpoints
      ) {
        this.flagSuspiciousIP(clientIP);
      }
      
      // Clean up old data (older than 1 hour)
      if (timeDiff > 3600000) {
        this.requestCounts.delete(clientIP);
      }
      
      next();
    };
  }

  // Flag suspicious IP addresses
  flagSuspiciousIP(ip) {
    if (!this.suspiciousIPs.has(ip)) {
      this.suspiciousIPs.set(ip, {
        count: 1,
        firstFlag: Date.now()
      });
    } else {
      const data = this.suspiciousIPs.get(ip);
      data.count++;
      
      console.warn(`⚠️  DDOS Protection: Suspicious activity from IP ${ip} (${data.count} flags)`);
    }
  }

  // Cleanup method to remove old entries
  cleanup() {
    const now = Date.now();
    const oneHour = 3600000;
    
    // Clean up suspicious IPs older than 1 hour
    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (now - data.firstFlag > oneHour) {
        this.suspiciousIPs.delete(ip);
      }
    }
    
    // Clean up request counts older than 1 hour
    for (const [ip, data] of this.requestCounts.entries()) {
      if (now - data.firstRequest > oneHour) {
        this.requestCounts.delete(ip);
      }
    }
  }

  // Get protection statistics
  getStats() {
    return {
      suspiciousIPs: this.suspiciousIPs.size,
      blockedIPs: this.blockedIPs.size,
      activeTracking: this.requestCounts.size,
      timestamp: new Date().toISOString()
    };
  }

  // Manually unblock an IP (for admin use)
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
    this.requestCounts.delete(ip);
    console.log(`✅ DDOS Protection: Unblocked IP ${ip}`);
  }
}

// Create singleton instance
const ddosProtection = new DDOSProtection();

// Run cleanup every 30 minutes
setInterval(() => {
  ddosProtection.cleanup();
}, 30 * 60 * 1000);

module.exports = ddosProtection;

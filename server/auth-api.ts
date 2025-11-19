import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

export interface AuthenticatedApiRequest extends Request {
  apiKey?: {
    id: string;
    accountId: string;
  };
}

export async function authenticateApiKey(req: AuthenticatedApiRequest, res: Response, next: NextFunction) {
  try {
    // Get API key from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    // Expected format: "Bearer pk_xxxxx"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].startsWith('pk_')) {
      return res.status(401).json({ error: 'Invalid API key format' });
    }
    
    const apiKey = parts[1];
    
    // Validate the API key
    const validKey = await storage.validateApiKey(apiKey);
    
    if (!validKey) {
      // Track failed attempt (we can't track without a valid key ID)
      // Skip logging for invalid keys
      
      return res.status(401).json({ error: 'Invalid or expired API key' });
    }
    
    // Attach API key info to request
    req.apiKey = {
      id: validKey.id,
      accountId: validKey.accountId
    };
    
    // Log successful usage (will be done after response)
    res.on('finish', async () => {
      await storage.updateApiKeyUsage(validKey.id, {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      }).catch(console.error);
    });
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// Rate limiting middleware for API endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function apiRateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: AuthenticatedApiRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return next(); // Skip if not authenticated
    }
    
    const key = req.apiKey.id;
    const now = Date.now();
    
    const limitInfo = rateLimitMap.get(key);
    
    if (!limitInfo || now > limitInfo.resetTime) {
      // Reset the counter
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }
    
    if (limitInfo.count >= maxRequests) {
      const retryAfter = Math.ceil((limitInfo.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', new Date(limitInfo.resetTime).toISOString());
      
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        retryAfter: retryAfter
      });
    }
    
    limitInfo.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - limitInfo.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(limitInfo.resetTime).toISOString());
    
    next();
  };
}
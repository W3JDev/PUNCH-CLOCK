import rateLimit from 'express-rate-limit';
import { getRedis } from '@/utils/redis';
import logger from '@/utils/logger';

// Basic rate limiter using memory store (for development)
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.'
    });
  }
});

// Redis-based rate limiter for production
export const redisRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  store: {
    incr: async (key: string) => {
      const redis = getRedis();
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') / 1000));
      }
      return {
        totalHits: current,
        totalReset: new Date(Date.now() + parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'))
      };
    },
    decrement: async (key: string) => {
      const redis = getRedis();
      await redis.decr(key);
    },
    resetKey: async (key: string) => {
      const redis = getRedis();
      await redis.del(key);
    }
  },
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  }
});

// Stricter rate limiter for authentication routes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth routes
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.'
    });
  }
});
import Redis from 'ioredis';
import logger from './logger';

let redis: Redis;

export async function initializeRedis() {
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    redis.on('connect', () => {
      logger.info('Successfully connected to Redis');
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('close', () => {
      logger.info('Redis connection closed');
    });

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    throw error;
  }
}

export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redis;
}

export async function disconnectRedis() {
  if (redis) {
    await redis.disconnect();
    logger.info('Redis connection closed');
  }
}
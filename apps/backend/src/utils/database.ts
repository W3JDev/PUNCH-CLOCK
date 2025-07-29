import { PrismaClient } from '@prisma/client';
import logger from './logger';

declare global {
  var __db: PrismaClient | undefined;
}

let db: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  db = new PrismaClient({
    log: ['error'],
  });
} else {
  if (!global.__db) {
    global.__db = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  db = global.__db;
}

export async function connectDatabase() {
  try {
    await db.$connect();
    logger.info('Successfully connected to database');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function disconnectDatabase() {
  await db.$disconnect();
  logger.info('Database connection closed');
}

export { db };
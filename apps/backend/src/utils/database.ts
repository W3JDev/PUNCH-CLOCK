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

/**
 * Create a database client with organization context for RLS
 */
export const createOrgContextDB = (organizationId: string): PrismaClient => {
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: any) {
          // Set organization context before each query
          await db.$executeRaw`SELECT set_organization_context(${organizationId})`;
          
          try {
            const result = await query(args);
            return result;
          } finally {
            // Clear context after query (optional, as it's session-scoped)
            // await db.$executeRaw`SELECT clear_organization_context()`;
          }
        },
      },
    },
  });
};

/**
 * Execute queries with organization context
 */
export const withOrgContext = async <T>(
  organizationId: string,
  callback: (db: PrismaClient) => Promise<T>
): Promise<T> => {
  // Set organization context
  await db.$executeRaw`SELECT set_organization_context(${organizationId})`;
  
  try {
    return await callback(db);
  } finally {
    // Clear context
    await db.$executeRaw`SELECT clear_organization_context()`;
  }
};

export { db };
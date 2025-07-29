import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prisma: PrismaClient

try {
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
} catch (error) {
  // Fallback for when Prisma client is not generated
  console.warn('Prisma client not available during build time')
  prisma = {} as PrismaClient
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export { prisma }
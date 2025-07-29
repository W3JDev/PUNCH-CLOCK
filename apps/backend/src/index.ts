import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { errorHandler, notFound } from '@/middleware/error.middleware';
import { rateLimiter } from '@/middleware/rateLimiter.middleware';
import logger from '@/utils/logger';
import { connectDatabase } from '@/utils/database';
import { initializeRedis } from '@/utils/redis';

// Routes
import authRoutes from '@/routes/auth.routes';
import organizationRoutes from '@/routes/organization.routes';
import employeeRoutes from '@/routes/employee.routes';
import attendanceRoutes from '@/routes/attendance.routes';
import shiftRoutes from '@/routes/shift.routes';
import leaveRoutes from '@/routes/leave.routes';
import payrollRoutes from '@/routes/payroll.routes';
import notificationRoutes from '@/routes/notification.routes';
import aiRoutes from '@/routes/ai.routes';
import kioskRoutes from '@/routes/kiosk.routes';
import reportRoutes from '@/routes/report.routes';
import webhookRoutes from '@/routes/webhook.routes';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000"],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-ID']
}));

// Compression and logging
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Rate limiting
app.use('/api/', rateLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0'
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/shifts', shiftRoutes);
app.use('/api/v1/leaves', leaveRoutes);
app.use('/api/v1/payroll', payrollRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/kiosk', kioskRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Socket.IO for real-time features
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  // Join organization room for real-time updates
  socket.on('join-organization', (organizationId) => {
    socket.join(`org-${organizationId}`);
    logger.info(`Client ${socket.id} joined organization ${organizationId}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io available globally for other modules
declare global {
  var io: Server;
}
globalThis.io = io;

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

async function startServer() {
  try {
    // Initialize database connection
    await connectDatabase();
    logger.info('Database connected successfully');
    
    // Initialize Redis connection
    await initializeRedis();
    logger.info('Redis connected successfully');
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 PUNCH⏰CLOCK Backend Server running on http://${HOST}:${PORT}`);
      logger.info(`📊 Health check available at http://${HOST}:${PORT}/health`);
      logger.info(`🔌 Socket.IO server ready for real-time connections`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

startServer();
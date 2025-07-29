import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { aiAssistantService } from '@/services/ai-assistant.service';
import { aiMemoryService } from '@/services/ai-memory.service';
import logger from '@/utils/logger';

const router = Router();

// Middleware to get organization context
const getOrganizationContext = (req: Request, res: Response, next: any): void => {
  const organizationId = req.headers['x-organization-id'] as string;
  if (!organizationId) {
    res.status(400).json({ error: 'Organization ID is required' });
    return;
  }
  req.organizationId = organizationId;
  next();
};

// Apply organization context middleware to all routes
router.use(getOrganizationContext);

// Chat endpoint
router.post('/chat', [
  body('message').isString().isLength({ min: 1, max: 2000 }).withMessage('Message is required and must be between 1-2000 characters'),
  body('conversationId').optional().isString().withMessage('Conversation ID must be a string'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { message, conversationId } = req.body;
    const organizationId = req.organizationId!;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    const result = await aiAssistantService.processMessage(message, {
      organizationId,
      userId,
      conversationId
    });

    // Emit real-time update via Socket.IO if available
    if (globalThis.io) {
      globalThis.io.to(`org-${organizationId}`).emit('ai-message', {
        conversationId: result.conversationId,
        message: result.response,
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      data: {
        response: result.response,
        conversationId: result.conversationId,
        actions: result.actions || [],
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('AI chat error:', error);
    return res.status(500).json({ 
      error: 'Failed to process message',
      message: (error as Error).message 
    });
  }
});

// Get conversation history
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.query.userId as string;

    const conversations = await aiAssistantService.getConversations(
      organizationId,
      userId
    );

    return res.json({
      success: true,
      data: conversations
    });

  } catch (error) {
    logger.error('Error fetching conversations:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch conversations',
      message: (error as Error).message 
    });
  }
});

// Get specific conversation
router.get('/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await aiAssistantService.getConversationHistory(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    return res.json({
      success: true,
      data: conversation
    });

  } catch (error) {
    logger.error('Error fetching conversation:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch conversation',
      message: (error as Error).message 
    });
  }
});

// Execute HR action
router.post('/action', [
  body('type').isString().isLength({ min: 1 }).withMessage('Action type is required'),
  body('parameters').isObject().withMessage('Parameters must be an object'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, parameters } = req.body;
    const organizationId = req.organizationId!;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    // For direct action execution (bypass AI processing)
    const action = {
      type,
      parameters,
      confidence: 1.0
    };

    // Use the AI assistant service to execute the action
    const result = await (aiAssistantService as any).executeHRAction(action, {
      organizationId,
      userId
    });

    return res.json({
      success: result.success,
      data: result.success ? result : null,
      error: result.success ? null : result.error
    });

  } catch (error) {
    logger.error('Error executing action:', error);
    return res.status(500).json({ 
      error: 'Failed to execute action',
      message: (error as Error).message 
    });
  }
});

// Generate insights
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;

    const insights = await aiAssistantService.generateInsights(organizationId);

    return res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('Error generating insights:', error);
    return res.status(500).json({ 
      error: 'Failed to generate insights',
      message: (error as Error).message 
    });
  }
});

// Update memory
router.put('/memory', [
  body('memoryType').isIn(['EMPLOYEE_DATA', 'POLICIES', 'DECISIONS', 'PATTERNS', 'PREFERENCES', 'INSIGHTS']).withMessage('Invalid memory type'),
  body('content').isObject().withMessage('Content must be an object'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { memoryType, content, tags = [], relevanceScore = 1.0 } = req.body;
    const organizationId = req.organizationId!;

    const memoryId = await aiMemoryService.storeMemory(
      organizationId,
      memoryType,
      content,
      tags,
      relevanceScore
    );

    return res.json({
      success: true,
      data: {
        memoryId,
        message: 'Memory stored successfully'
      }
    });

  } catch (error) {
    logger.error('Error storing memory:', error);
    return res.status(500).json({ 
      error: 'Failed to store memory',
      message: (error as Error).message 
    });
  }
});

// Get memory
router.get('/memory', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const memoryTypes = req.query.types ? (req.query.types as string).split(',') : undefined;
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const memories = await aiMemoryService.retrieveMemory(
      organizationId,
      memoryTypes as any,
      tags,
      limit
    );

    return res.json({
      success: true,
      data: memories
    });

  } catch (error) {
    logger.error('Error retrieving memory:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve memory',
      message: (error as Error).message 
    });
  }
});

// Health check for AI services
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = {
      aiAssistant: 'operational',
      memoryStore: 'operational',
      togetherAI: process.env.TOGETHER_API_KEY ? 'configured' : 'not configured',
      timestamp: new Date().toISOString()
    };

    return res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Error checking AI status:', error);
    return res.status(500).json({ 
      error: 'Failed to check status',
      message: (error as Error).message 
    });
  }
});

export default router;
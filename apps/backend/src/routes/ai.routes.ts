import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '@/middleware/auth.middleware';
import { validateOrganization } from '@/middleware/organization.middleware';
import { validateRequest } from '@/middleware/validation.middleware';
import { body, query, param } from 'express-validator';
import OpenAI from 'openai';
import logger from '@/utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Initialize OpenAI (if API key is provided)
const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Apply middleware to all routes
router.use(authenticateToken);
router.use(validateOrganization);

// Validation schemas
const chatValidation = [
  body('message').isString().isLength({ min: 1, max: 1000 }),
  body('conversationId').optional().isUUID(),
];

// POST /api/v1/ai/chat - Chat with AI assistant
router.post('/chat', chatValidation, validateRequest, async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ 
        error: 'AI service not available. OpenAI API key not configured.' 
      });
    }

    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const { message, conversationId } = req.body;

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.aiConversation.findFirst({
        where: {
          id: conversationId,
          organizationId,
          userId
        }
      });
    }

    if (!conversation) {
      conversation = await prisma.aiConversation.create({
        data: {
          organizationId,
          userId,
          title: message.substring(0, 50) + '...',
          messages: [],
          context: {}
        }
      });
    }

    // Get organization context for AI
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        businessName: true,
        settings: true,
        employees: {
          select: { id: true, firstName: true, lastName: true, position: true, isActive: true },
          where: { isActive: true }
        },
        departments: {
          select: { id: true, name: true },
          where: { isActive: true }
        }
      }
    });

    // Get recent attendance data for context
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const todayAttendance = await prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        date: startOfDay
      },
      include: {
        employee: {
          select: { firstName: true, lastName: true, position: true }
        }
      }
    });

    // Build system prompt with context
    const systemPrompt = `You are PUNCH⏰CLOCK AI Assistant, an intelligent workforce management assistant for ${organization?.businessName || 'the organization'}.

Current Organization Context:
- Total Active Employees: ${organization?.employees.length || 0}
- Departments: ${organization?.departments.map(d => d.name).join(', ') || 'None'}
- Today's Check-ins: ${todayAttendance.filter(r => r.checkInTime).length}
- Currently Present: ${todayAttendance.filter(r => r.checkInTime && !r.checkOutTime).length}

You can help with:
1. Employee management (viewing, searching employees)
2. Attendance analysis and insights
3. Generating reports and analytics
4. Scheduling and time management questions
5. HR policy clarifications
6. Productivity optimization suggestions

Always provide helpful, accurate, and actionable responses. If you need specific data that requires database queries, mention what information would be helpful to retrieve.

Be professional, friendly, and focused on workforce management tasks.`;

    // Prepare messages for OpenAI
    const existingMessages = conversation.messages as any[] || [];
    const messages = [
      { role: 'system', content: systemPrompt },
      ...existingMessages.slice(-10), // Last 10 messages for context
      { role: 'user', content: message }
    ];

    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages as any,
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Update conversation
    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
    ];

    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: {
        messages: updatedMessages,
        totalMessages: updatedMessages.length,
        context: {
          lastUserMessage: message,
          lastAiResponse: aiResponse,
          organizationData: {
            employeeCount: organization?.employees.length,
            departmentCount: organization?.departments.length,
            todayAttendance: todayAttendance.length
          }
        }
      }
    });

    res.json({
      conversationId: conversation.id,
      message: aiResponse,
      suggestions: [
        'Show today\'s attendance summary',
        'Who is currently late?',
        'Generate weekly attendance report',
        'Show top performing employees'
      ]
    });

  } catch (error) {
    logger.error('Error in AI chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/ai/conversations - Get conversation history
router.get('/conversations', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const skip = (page - 1) * limit;

    const [conversations, totalCount] = await Promise.all([
      prisma.aiConversation.findMany({
        where: {
          organizationId,
          userId,
          isActive: true
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          totalMessages: true,
          createdAt: true,
          updatedAt: true,
          messages: true
        }
      }),
      prisma.aiConversation.count({
        where: {
          organizationId,
          userId,
          isActive: true
        }
      })
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Format conversations with last message preview
    const formattedConversations = conversations.map(conv => {
      const messages = conv.messages as any[] || [];
      const lastMessage = messages[messages.length - 1];
      
      return {
        id: conv.id,
        title: conv.title,
        totalMessages: conv.totalMessages,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessage: lastMessage ? {
          content: lastMessage.content.substring(0, 100) + (lastMessage.content.length > 100 ? '...' : ''),
          role: lastMessage.role,
          timestamp: lastMessage.timestamp
        } : null
      };
    });

    res.json({
      conversations: formattedConversations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Error getting conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/ai/conversations/:id - Get specific conversation
router.get('/conversations/:id', [param('id').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id,
        organizationId,
        userId
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);

  } catch (error) {
    logger.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/ai/conversations/:id - Delete conversation
router.delete('/conversations/:id', [param('id').isUUID()], validateRequest, async (req, res) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id,
        organizationId,
        userId
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.aiConversation.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({ message: 'Conversation deleted successfully' });

  } catch (error) {
    logger.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/ai/analyze - Analyze attendance patterns and provide insights
router.post('/analyze', [
  body('type').isIn(['attendance', 'productivity', 'trends', 'anomalies']),
  body('period').optional().isIn(['week', 'month', 'quarter']),
  body('employeeId').optional().isUUID(),
  body('departmentId').optional().isUUID(),
], validateRequest, async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({ 
        error: 'AI service not available. OpenAI API key not configured.' 
      });
    }

    const organizationId = req.organizationId!;
    const { type, period = 'month', employeeId, departmentId } = req.body;

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        break;
      default:
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
    }

    // Build query filters
    const attendanceWhere: any = {
      organizationId,
      date: { gte: startDate, lte: now }
    };

    if (employeeId) {
      attendanceWhere.employeeId = employeeId;
    }

    if (departmentId) {
      attendanceWhere.employee = { departmentId };
    }

    // Get relevant data based on analysis type
    let analysisData: any = {};

    switch (type) {
      case 'attendance':
        const attendanceStats = await prisma.attendanceRecord.findMany({
          where: attendanceWhere,
          include: {
            employee: {
              select: { firstName: true, lastName: true, department: { select: { name: true } } }
            }
          }
        });

        analysisData = {
          totalRecords: attendanceStats.length,
          presentDays: attendanceStats.filter(r => r.checkInTime).length,
          lateDays: attendanceStats.filter(r => r.isLate).length,
          avgHoursWorked: attendanceStats.reduce((sum, r) => sum + parseFloat((r.hoursWorked || 0).toString()), 0) / attendanceStats.length,
          departmentBreakdown: await getDepartmentBreakdown(organizationId, startDate, now)
        };
        break;

      case 'productivity':
        const productivityStats = await prisma.attendanceRecord.groupBy({
          by: ['employeeId'],
          where: attendanceWhere,
          _avg: { hoursWorked: true },
          _sum: { hoursWorked: true, overtimeHours: true },
          _count: { id: true }
        });

        analysisData = {
          employeeCount: productivityStats.length,
          avgProductivity: productivityStats.reduce((sum, p) => sum + parseFloat((p._avg.hoursWorked || 0).toString()), 0) / productivityStats.length,
          totalOvertimeHours: productivityStats.reduce((sum, p) => sum + parseFloat((p._sum.overtimeHours || 0).toString()), 0),
          topPerformers: productivityStats.sort((a, b) => parseFloat((b._avg.hoursWorked || 0).toString()) - parseFloat((a._avg.hoursWorked || 0).toString())).slice(0, 5)
        };
        break;

      case 'trends':
        const trendData = await getTrendAnalysis(organizationId, startDate, now);
        analysisData = trendData;
        break;

      case 'anomalies':
        const anomalies = await getAnomalies(organizationId, startDate, now);
        analysisData = anomalies;
        break;
    }

    // Generate AI insights
    const prompt = `As a workforce management AI analyst, analyze the following ${type} data for the past ${period} and provide actionable insights:

Data: ${JSON.stringify(analysisData, null, 2)}

Please provide:
1. Key findings and patterns
2. Areas of concern or improvement opportunities
3. Specific actionable recommendations
4. Predicted trends or outcomes if applicable

Keep the response concise but comprehensive, focusing on business value and practical steps.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    });

    const insights = completion.choices[0]?.message?.content || 'Unable to generate insights.';

    res.json({
      analysisType: type,
      period,
      dateRange: { startDate, endDate: now },
      data: analysisData,
      insights,
      generatedAt: new Date()
    });

  } catch (error) {
    logger.error('Error in AI analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
async function getDepartmentBreakdown(organizationId: string, startDate: Date, endDate: Date) {
  const departments = await prisma.department.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true }
  });

  return Promise.all(
    departments.map(async (dept) => {
      const deptAttendance = await prisma.attendanceRecord.count({
        where: {
          organizationId,
          employee: { departmentId: dept.id },
          checkInTime: { not: null },
          date: { gte: startDate, lte: endDate }
        }
      });

      const deptEmployees = await prisma.employee.count({
        where: { organizationId, departmentId: dept.id, isActive: true }
      });

      return {
        department: dept.name,
        attendanceCount: deptAttendance,
        employeeCount: deptEmployees,
        attendanceRate: deptEmployees > 0 ? (deptAttendance / deptEmployees) * 100 : 0
      };
    })
  );
}

async function getTrendAnalysis(organizationId: string, startDate: Date, endDate: Date) {
  const trends = [];
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  for (let i = 0; i < daysDiff; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);

    const dailyAttendance = await prisma.attendanceRecord.count({
      where: {
        organizationId,
        checkInTime: { not: null },
        date: { gte: date, lt: nextDate }
      }
    });

    trends.push({
      date: date.toISOString().split('T')[0],
      attendance: dailyAttendance
    });
  }

  return { dailyTrends: trends };
}

async function getAnomalies(organizationId: string, startDate: Date, endDate: Date) {
  // Find unusual patterns
  const [
    unusuallyLateEmployees,
    noShowDays,
    overtimeOutliers
  ] = await Promise.all([
    // Employees who are frequently late
    prisma.attendanceRecord.groupBy({
      by: ['employeeId'],
      where: {
        organizationId,
        isLate: true,
        date: { gte: startDate, lte: endDate }
      },
      _count: { id: true },
      having: { id: { _count: { gt: 3 } } }
    }),

    // Days with unusually low attendance
    prisma.attendanceRecord.groupBy({
      by: ['date'],
      where: {
        organizationId,
        checkInTime: { not: null },
        date: { gte: startDate, lte: endDate }
      },
      _count: { id: true },
      having: { id: { _count: { lt: 5 } } }
    }),

    // Employees with excessive overtime
    prisma.attendanceRecord.groupBy({
      by: ['employeeId'],
      where: {
        organizationId,
        overtimeHours: { gt: 0 },
        date: { gte: startDate, lte: endDate }
      },
      _sum: { overtimeHours: true },
      having: { overtimeHours: { _sum: { gt: 20 } } }
    })
  ]);

  return {
    frequentlyLateEmployees: unusuallyLateEmployees.length,
    lowAttendanceDays: noShowDays.length,
    excessiveOvertimeEmployees: overtimeOutliers.length
  };
}

export default router;
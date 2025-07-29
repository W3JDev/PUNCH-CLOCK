import { PrismaClient } from '@prisma/client';
import { togetherAI } from './together-ai.service';
import { aiMemoryService } from './ai-memory.service';
import logger from '@/utils/logger';

type AiMemoryType = 'EMPLOYEE_DATA' | 'POLICIES' | 'DECISIONS' | 'PATTERNS' | 'PREFERENCES' | 'INSIGHTS';

const prisma = new PrismaClient();

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface ConversationContext {
  organizationId: string;
  userId: string;
  conversationId?: string;
}

interface AIAction {
  type: string;
  parameters: any;
  confidence: number;
}

class AIAssistantService {
  private readonly MAX_MESSAGES_HISTORY = 20;

  async processMessage(
    message: string,
    context: ConversationContext
  ): Promise<{ response: string; actions?: AIAction[]; conversationId: string }> {
    try {
      // Get or create conversation
      const conversation = await this.getOrCreateConversation(context);
      
      // Get organization context
      const organization = await prisma.organization.findUnique({
        where: { id: context.organizationId }
      });

      if (!organization) {
        throw new Error('Organization not found');
      }

      // Retrieve relevant memories
      const memoryContext = await aiMemoryService.getOrganizationContext(context.organizationId);
      
      // Build conversation messages
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: this.buildSystemPrompt(organization, memoryContext)
        }
      ];

      // Add conversation history (last N messages)
      const recentMessages = this.getRecentMessages(conversation.messages as ChatMessage[]);
      messages.push(...recentMessages);

      // Add current user message
      messages.push({
        role: 'user' as const,
        content: message,
        timestamp: new Date().toISOString()
      });

      // Detect if this requires an action
      const actionRequest = await this.detectActionIntent(message);

      // Generate AI response
      const aiResponse = await togetherAI.chat(messages, 1000);

      // Execute actions if needed
      const executedActions: AIAction[] = [];
      if (actionRequest.length > 0) {
        for (const action of actionRequest) {
          if (action.confidence > 0.7) {
            const result = await this.executeHRAction(action, context);
            if (result.success) {
              executedActions.push(action);
            }
          }
        }
      }

      // Update conversation
      const updatedMessages = [
        ...messages.slice(1), // Remove system message
        {
          role: 'assistant' as const,
          content: aiResponse.content,
          timestamp: new Date().toISOString()
        }
      ];

      await this.updateConversation(conversation.id, updatedMessages);

      // Store insights and patterns
      await this.storeConversationInsights(message, aiResponse.content, context);

      return {
        response: aiResponse.content,
        actions: executedActions.length > 0 ? executedActions : [],
        conversationId: conversation.id
      };

    } catch (error) {
      logger.error('Error processing AI message:', error);
      throw new Error('Failed to process message');
    }
  }

  private async getOrCreateConversation(context: ConversationContext) {
    if (context.conversationId) {
      const existing = await prisma.aiConversation.findUnique({
        where: { id: context.conversationId }
      });
      if (existing) return existing;
    }

    // Create new conversation
    return await prisma.aiConversation.create({
      data: {
        organizationId: context.organizationId,
        userId: context.userId,
        title: 'AI Assistant Chat',
        messages: [],
        context: {},
        totalMessages: 0,
        lastInteraction: new Date()
      }
    });
  }

  private buildSystemPrompt(organization: any, memoryContext: any): string {
    let prompt = togetherAI.getSystemPrompt(organization);
    
    if (memoryContext.policies.length > 0) {
      prompt += `\n\nRelevant policies:\n${memoryContext.policies.map((p: any) => `- ${JSON.stringify(p)}`).join('\n')}`;
    }

    if (memoryContext.recentDecisions.length > 0) {
      prompt += `\n\nRecent decisions:\n${memoryContext.recentDecisions.map((d: any) => `- ${JSON.stringify(d)}`).join('\n')}`;
    }

    return prompt;
  }

  private getRecentMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages
      .slice(-this.MAX_MESSAGES_HISTORY)
      .filter(msg => msg.role !== 'system');
  }

  private async detectActionIntent(message: string): Promise<AIAction[]> {
    const actions: AIAction[] = [];
    const lowerMessage = message.toLowerCase();

    // Employee management actions
    if (lowerMessage.includes('add employee') || lowerMessage.includes('new employee')) {
      actions.push({
        type: 'CREATE_EMPLOYEE',
        parameters: this.extractEmployeeDetails(message),
        confidence: 0.8
      });
    }

    if (lowerMessage.includes('update') && lowerMessage.includes('employee')) {
      actions.push({
        type: 'UPDATE_EMPLOYEE',
        parameters: this.extractUpdateDetails(message),
        confidence: 0.7
      });
    }

    // Attendance actions
    if (lowerMessage.includes('attendance report') || lowerMessage.includes('who\'s late')) {
      actions.push({
        type: 'GENERATE_ATTENDANCE_REPORT',
        parameters: this.extractDateRange(message),
        confidence: 0.9
      });
    }

    // Leave management
    if (lowerMessage.includes('approve') && lowerMessage.includes('leave')) {
      actions.push({
        type: 'APPROVE_LEAVE',
        parameters: this.extractLeaveDetails(message),
        confidence: 0.8
      });
    }

    return actions;
  }

  private extractEmployeeDetails(message: string): any {
    // Simple extraction - in production, this would be more sophisticated
    const nameMatch = message.match(/(?:add|new)\s+employee:?\s*([^,]+)/i);
    const positionMatch = message.match(/(?:position|role|title):?\s*([^,\n]+)/i);
    const departmentMatch = message.match(/(?:department|dept):?\s*([^,\n]+)/i);

    return {
      name: nameMatch?.[1]?.trim(),
      position: positionMatch?.[1]?.trim(),
      department: departmentMatch?.[1]?.trim()
    };
  }

  private extractUpdateDetails(message: string): any {
    const employeeMatch = message.match(/update\s+([^'s]+)'?s?\s+/i);
    const fieldMatch = message.match(/(?:update|set|change)\s+.+?\s+(.+?)\s+to\s+(.+)/i);

    return {
      employee: employeeMatch?.[1]?.trim(),
      field: fieldMatch?.[1]?.trim(),
      value: fieldMatch?.[2]?.trim()
    };
  }

  private extractDateRange(_message: string): any {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Default to last week if no specific range mentioned
    return {
      startDate: weekAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0]
    };
  }

  private extractLeaveDetails(message: string): any {
    const employeeMatch = message.match(/approve\s+(.+?)'?s?\s+leave/i);
    return {
      employee: employeeMatch?.[1]?.trim()
    };
  }

  private async executeHRAction(action: AIAction, context: ConversationContext): Promise<any> {
    try {
      switch (action.type) {
        case 'CREATE_EMPLOYEE':
          return await this.createEmployee(action.parameters, context.organizationId);
        
        case 'UPDATE_EMPLOYEE':
          return await this.updateEmployee(action.parameters, context.organizationId);
        
        case 'GENERATE_ATTENDANCE_REPORT':
          return await this.generateAttendanceReport(action.parameters, context.organizationId);
        
        case 'APPROVE_LEAVE':
          return await this.approveLeave(action.parameters, context.organizationId);
        
        default:
          return { success: false, error: 'Unknown action type' };
      }
    } catch (error) {
      logger.error(`Error executing action ${action.type}:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async createEmployee(params: any, organizationId: string): Promise<any> {
    if (!params.name) {
      return { success: false, error: 'Employee name is required' };
    }

    const [firstName, ...lastNameParts] = params.name.split(' ');
    const lastName = lastNameParts.join(' ') || '';

    const employee = await prisma.employee.create({
      data: {
        organizationId,
        employeeId: `EMP-${Date.now()}`,
        firstName,
        lastName,
        position: params.position || 'Staff',
        hireDate: new Date()
      }
    });

    await aiMemoryService.storeEmployeeInsight(organizationId, employee.id, {
      action: 'created',
      details: params
    });

    return { success: true, employee };
  }

  private async updateEmployee(params: any, organizationId: string): Promise<any> {
    // Find employee by name
    const employees = await prisma.employee.findMany({
      where: {
        organizationId,
        OR: [
          { firstName: { contains: params.employee, mode: 'insensitive' } },
          { lastName: { contains: params.employee, mode: 'insensitive' } }
        ]
      }
    });

    if (employees.length === 0) {
      return { success: false, error: 'Employee not found' };
    }

    const employee = employees[0];
    const updateData: any = {};

    // Map field names
    if (params.field?.toLowerCase().includes('department')) {
      // Find or create department
      const department = await prisma.department.findFirst({
        where: {
          organizationId,
          name: { contains: params.value, mode: 'insensitive' }
        }
      });
      
      if (department) {
        updateData.departmentId = department.id;
      }
    } else if (params.field?.toLowerCase().includes('rate') || params.field?.toLowerCase().includes('salary')) {
      const rate = parseFloat(params.value.replace(/[^0-9.]/g, ''));
      if (!isNaN(rate)) {
        updateData.hourlyRate = rate;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: 'No valid fields to update' };
    }

    const updatedEmployee = await prisma.employee.update({
      where: { id: employee.id },
      data: updateData
    });

    await aiMemoryService.storeEmployeeInsight(organizationId, employee.id, {
      action: 'updated',
      field: params.field,
      value: params.value
    });

    return { success: true, employee: updatedEmployee };
  }

  private async generateAttendanceReport(params: any, organizationId: string): Promise<any> {
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        date: {
          gte: new Date(params.startDate),
          lte: new Date(params.endDate)
        }
      },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeId: true
          }
        }
      }
    });

    const lateArrivals = attendanceRecords.filter((record: any) => record.isLate);
    
    return {
      success: true,
      report: {
        totalRecords: attendanceRecords.length,
        lateArrivals: lateArrivals.length,
        lateEmployees: lateArrivals.map((r: any) => ({
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          employeeId: r.employee.employeeId,
          date: r.date,
          checkInTime: r.checkInTime
        }))
      }
    };
  }

  private async approveLeave(params: any, organizationId: string): Promise<any> {
    // Find pending leave requests for the employee
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        organizationId,
        status: 'PENDING',
        employee: {
          OR: [
            { firstName: { contains: params.employee, mode: 'insensitive' } },
            { lastName: { contains: params.employee, mode: 'insensitive' } }
          ]
        }
      },
      include: {
        employee: true
      }
    });

    if (leaveRequests.length === 0) {
      return { success: false, error: 'No pending leave requests found for this employee' };
    }

    const approved = [];
    for (const request of leaveRequests) {
      const updated = await prisma.leaveRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date()
        }
      });
      approved.push(updated);
    }

    return { success: true, approvedRequests: approved };
  }

  private async updateConversation(
    conversationId: string,
    messages: ChatMessage[]
  ): Promise<void> {
    // Generate context summary if conversation is getting long
    let contextSummary;
    if (messages.length > this.MAX_MESSAGES_HISTORY) {
      contextSummary = await togetherAI.generateContextSummary(messages.slice(0, -5));
    }

    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: {
        messages: messages as any,
        totalMessages: messages.length,
        lastInteraction: new Date(),
        contextSummary
      }
    });
  }

  private async storeConversationInsights(
    userMessage: string,
    aiResponse: string,
    context: ConversationContext
  ): Promise<void> {
    // Store patterns and insights from the conversation
    const insight = {
      userIntent: userMessage.substring(0, 100),
      aiResponse: aiResponse.substring(0, 200),
      timestamp: new Date().toISOString()
    };

    await aiMemoryService.storeMemory(
      context.organizationId,
      'PATTERNS' as AiMemoryType,
      insight,
      ['conversation', 'insight']
    );
  }

  async getConversationHistory(conversationId: string): Promise<any> {
    const conversation = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return conversation;
  }

  async getConversations(organizationId: string, userId?: string): Promise<any[]> {
    const whereClause: any = { organizationId };
    if (userId) {
      whereClause.userId = userId;
    }

    const conversations = await prisma.aiConversation.findMany({
      where: whereClause,
      orderBy: { lastInteraction: 'desc' },
      take: 20,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return conversations;
  }

  async generateInsights(organizationId: string): Promise<any> {
    // Get recent patterns and decisions
    const patterns = await aiMemoryService.retrieveMemory(
      organizationId,
      ['PATTERNS' as AiMemoryType, 'DECISIONS' as AiMemoryType],
      [],
      50
    );

    // Analyze attendance trends
    const recentAttendance = await prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        date: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    });

    const lateCount = recentAttendance.filter((r: any) => r.isLate).length;
    const totalCount = recentAttendance.length;
    const latePercentage = totalCount > 0 ? (lateCount / totalCount) * 100 : 0;

    const insights: any = {
      attendanceTrends: {
        latePercentage: Math.round(latePercentage * 100) / 100,
        totalRecords: totalCount,
        lateArrivals: lateCount
      },
      recommendations: [],
      patterns: patterns.slice(0, 10)
    };

    if (latePercentage > 10) {
      insights.recommendations.push({
        type: 'attendance',
        message: 'High late arrival rate detected. Consider reviewing shift times or implementing flexible schedules.',
        priority: 'high'
      });
    }

    return insights;
  }
}

export const aiAssistantService = new AIAssistantService();
export default AIAssistantService;
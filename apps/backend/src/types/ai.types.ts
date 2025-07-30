// AI service types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ConversationContext {
  organizationId: string;
  userId: string;
  conversationId?: string;
}

export interface AIAction {
  type: string;
  parameters: any;
  confidence: number;
}

export interface MemoryRecord {
  id?: string;
  memoryType: 'EMPLOYEE_DATA' | 'POLICIES' | 'DECISIONS' | 'PATTERNS' | 'PREFERENCES' | 'INSIGHTS';
  content: any;
  relevanceScore?: number;
  tags?: string[];
}

export interface AIInsights {
  attendanceTrends: {
    latePercentage: number;
    totalRecords: number;
    lateArrivals: number;
  };
  recommendations: Array<{
    type: string;
    message: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  patterns: MemoryRecord[];
}

export interface TogetherAIResponse {
  content: string;
  finishReason: string;
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      organizationId?: string;
      user?: {
        id: string;
        organizationId: string;
        role: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      };
    }
  }
}

export {};
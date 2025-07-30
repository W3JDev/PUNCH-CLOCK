import { PrismaClient } from '@prisma/client';
import logger from '@/utils/logger';

type AiMemoryType = 'EMPLOYEE_DATA' | 'POLICIES' | 'DECISIONS' | 'PATTERNS' | 'PREFERENCES' | 'INSIGHTS';

const prisma = new PrismaClient();

interface MemoryRecord {
  id?: string;
  memoryType: AiMemoryType;
  content: any;
  relevanceScore?: number;
  tags?: string[];
}

class AIMemoryService {
  async storeMemory(
    organizationId: string,
    memoryType: AiMemoryType,
    content: any,
    tags: string[] = [],
    relevanceScore = 1.0
  ): Promise<string> {
    try {
      const memory = await prisma.aiMemoryStore.create({
        data: {
          organizationId,
          memoryType: memoryType as any,
          content,
          tags,
          relevanceScore,
          lastAccessed: new Date()
        }
      });

      logger.info(`Stored memory: ${memoryType} for org ${organizationId}`);
      return memory.id;
    } catch (error) {
      logger.error('Error storing memory:', error);
      throw new Error('Failed to store memory');
    }
  }

  async retrieveMemory(
    organizationId: string,
    memoryTypes?: AiMemoryType[],
    tags?: string[],
    limit = 10
  ): Promise<MemoryRecord[]> {
    try {
      const whereClause: any = {
        organizationId
      };

      if (memoryTypes?.length) {
        whereClause.memoryType = { in: memoryTypes as any };
      }

      if (tags?.length) {
        whereClause.tags = { hasSome: tags };
      }

      const memories = await prisma.aiMemoryStore.findMany({
        where: whereClause,
        orderBy: [
          { relevanceScore: 'desc' },
          { lastAccessed: 'desc' }
        ],
        take: limit
      });

      // Update last accessed time
      const memoryIds = memories.map((m: any) => m.id);
      if (memoryIds.length > 0) {
        await prisma.aiMemoryStore.updateMany({
          where: { id: { in: memoryIds } },
          data: { lastAccessed: new Date() }
        });
      }

      return memories.map((m: any) => ({
        id: m.id,
        memoryType: m.memoryType,
        content: m.content,
        relevanceScore: m.relevanceScore.toNumber(),
        tags: m.tags
      }));
    } catch (error) {
      logger.error('Error retrieving memory:', error);
      return [];
    }
  }

  async updateMemoryRelevance(memoryId: string, relevanceScore: number): Promise<void> {
    try {
      await prisma.aiMemoryStore.update({
        where: { id: memoryId },
        data: { 
          relevanceScore,
          lastAccessed: new Date()
        }
      });
    } catch (error) {
      logger.error('Error updating memory relevance:', error);
    }
  }

  async storeEmployeeInsight(organizationId: string, employeeId: string, insight: any): Promise<void> {
    await this.storeMemory(
      organizationId,
      'EMPLOYEE_DATA' as AiMemoryType,
      {
        employeeId,
        insight,
        timestamp: new Date().toISOString()
      },
      ['employee', employeeId]
    );
  }

  async storeDecision(organizationId: string, decision: any, context: any): Promise<void> {
    await this.storeMemory(
      organizationId,
      'DECISIONS' as AiMemoryType,
      {
        decision,
        context,
        timestamp: new Date().toISOString()
      },
      ['decision', decision.type || 'general']
    );
  }

  async storePattern(organizationId: string, pattern: any): Promise<void> {
    await this.storeMemory(
      organizationId,
      'PATTERNS' as AiMemoryType,
      {
        pattern,
        timestamp: new Date().toISOString()
      },
      ['pattern', pattern.type || 'general']
    );
  }

  async getEmployeeContext(organizationId: string, employeeId?: string): Promise<any> {
    const tags = employeeId ? ['employee', employeeId] : ['employee'];
    const memories = await this.retrieveMemory(
      organizationId,
      ['EMPLOYEE_DATA' as AiMemoryType],
      tags,
      20
    );

    return {
      insights: memories.map((m: any) => m.content),
      lastUpdated: new Date().toISOString()
    };
  }

  async getOrganizationContext(organizationId: string): Promise<any> {
    const [policies, decisions, patterns] = await Promise.all([
      this.retrieveMemory(organizationId, ['POLICIES' as AiMemoryType], [], 10),
      this.retrieveMemory(organizationId, ['DECISIONS' as AiMemoryType], [], 10),
      this.retrieveMemory(organizationId, ['PATTERNS' as AiMemoryType], [], 10)
    ]);

    return {
      policies: policies.map((m: any) => m.content),
      recentDecisions: decisions.map((m: any) => m.content),
      patterns: patterns.map((m: any) => m.content),
      lastUpdated: new Date().toISOString()
    };
  }

  async pruneOldMemories(organizationId: string, daysOld = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.aiMemoryStore.deleteMany({
        where: {
          organizationId,
          lastAccessed: { lt: cutoffDate },
          relevanceScore: { lt: 0.3 }
        }
      });

      logger.info(`Pruned ${result.count} old memories for org ${organizationId}`);
      return result.count;
    } catch (error) {
      logger.error('Error pruning memories:', error);
      return 0;
    }
  }
}

export const aiMemoryService = new AIMemoryService();
export default AIMemoryService;
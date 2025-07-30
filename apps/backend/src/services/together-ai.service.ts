import Together from 'together-ai';
import logger from '@/utils/logger';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface TogetherAIResponse {
  content: string;
  finishReason: string;
}

class TogetherAIService {
  private client: Together;
  private model: string;

  constructor() {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is required');
    }

    this.client = new Together({ apiKey });
    this.model = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.1-8B-Instruct-Turbo';
  }

  async chat(messages: ChatMessage[], maxTokens = 1000): Promise<TogetherAIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        repetition_penalty: 1,
        stop: ["<|eot_id|>", "<|end_of_text|>"],
        stream: false
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response generated from Together AI');
      }

      return {
        content: choice.message.content || '',
        finishReason: choice.finish_reason || 'complete'
      };
    } catch (error) {
      logger.error('Together AI chat error:', error);
      throw new Error('Failed to generate response from Together AI');
    }
  }

  async generateContextSummary(conversation: ChatMessage[]): Promise<string> {
    const summaryPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that creates concise summaries of HR-related conversations. Summarize the key points, decisions made, and action items discussed in the conversation below. Keep the summary under 200 words.'
      },
      {
        role: 'user',
        content: `Please summarize this conversation:\n\n${conversation.map(msg => `${msg.role}: ${msg.content}`).join('\n\n')}`
      }
    ];

    const response = await this.chat(summaryPrompt, 300);
    return response.content;
  }

  getSystemPrompt(organizationContext: any): string {
    return `You are an AI HR Assistant for ${organizationContext.businessName || 'the organization'}. You help with employee management, attendance tracking, shift scheduling, leave management, and provide HR insights.

Key capabilities:
- Employee management (add, update, search employees)
- Attendance tracking and reporting
- Shift scheduling and management
- Leave request processing
- HR analytics and insights
- Policy compliance monitoring

You have access to real-time employee data, attendance records, and organizational policies. Always maintain confidentiality and follow HR best practices.

When users request actions, confirm the details before proceeding. For complex requests, break them down into clear steps.

Current organization: ${organizationContext.businessName}
Organization ID: ${organizationContext.id}
Timezone: ${organizationContext.timezone}

Respond in a professional, helpful manner while being concise and actionable.`;
  }
}

export const togetherAI = new TogetherAIService();
export default TogetherAIService;
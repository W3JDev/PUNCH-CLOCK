import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  organizationId: z.string().min(1, 'Organization ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  conversationId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('AI Chat - Build time')
  
  try {
    const body = await request.json()
    const { message, organizationId, userId, conversationId } = chatSchema.parse(body)

    // Get or create conversation
    let conversation
    if (conversationId) {
      conversation = await prisma.aiConversation.findUnique({
        where: { id: conversationId }
      })
    }

    if (!conversation) {
      conversation = await prisma.aiConversation.create({
        data: {
          organizationId,
          userId,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          messages: [],
          totalMessages: 0
        }
      })
    }

    // Get context about the organization and user for better AI responses
    const orgData = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            employees: true,
            attendanceRecords: true,
          }
        }
      }
    })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        role: true,
        employee: {
          select: {
            position: true,
            department: {
              select: { name: true }
            }
          }
        }
      }
    })

    // Prepare context for AI
    const context = {
      organization: orgData?.businessName,
      employeeCount: orgData?._count.employees,
      userRole: user?.role,
      userPosition: user?.employee?.position,
      department: user?.employee?.department?.name,
    }

    // Call Together AI API
    const togetherApiKey = process.env.TOGETHER_API_KEY
    if (!togetherApiKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'AI service not configured' 
        }, 
        { status: 500 }
      )
    }

    const systemPrompt = `You are an AI assistant for PUNCH⏰CLOCK, an enterprise workforce management platform. 
You help with HR tasks, attendance tracking, employee management, and workforce analytics.

Current context:
- Organization: ${context.organization}
- Total Employees: ${context.employeeCount}
- User Role: ${context.userRole}
- User Position: ${context.userPosition}
- Department: ${context.department}

Provide helpful, professional responses related to workforce management. Be concise but informative.`

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-2-7b-chat-hf',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      })
    })

    if (!response.ok) {
      throw new Error('Failed to get AI response')
    }

    const aiResponse = await response.json()
    const aiMessage = aiResponse.choices[0]?.message?.content || 'Sorry, I could not process your request.'

    // Update conversation with new messages
    const currentMessages = Array.isArray(conversation.messages) ? conversation.messages : []
    const updatedMessages = [
      ...currentMessages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: aiMessage, timestamp: new Date().toISOString() }
    ]

    const updatedConversation = await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: {
        messages: updatedMessages,
        totalMessages: updatedMessages.length,
        isActive: true
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        message: aiMessage,
        conversationId: conversation.id,
        messageCount: updatedMessages.length
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation error',
          details: error.errors
        }, 
        { status: 400 }
      )
    }

    console.error('Error in AI chat:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process AI request' 
      }, 
      { status: 500 }
    )
  }
}
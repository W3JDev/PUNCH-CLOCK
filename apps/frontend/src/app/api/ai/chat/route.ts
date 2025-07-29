import { NextRequest, NextResponse } from 'next/server'
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

    // Forward request to backend AI service
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    
    const response = await fetch(`${backendUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Organization-ID': organizationId,
        // Note: In production, you'd include proper authentication headers here
      },
      body: JSON.stringify({
        message,
        conversationId,
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to get AI response')
    }

    const aiResponse = await response.json()

    return NextResponse.json({
      success: true,
      data: {
        message: aiResponse.data.response,
        conversationId: aiResponse.data.conversationId,
        actions: aiResponse.data.actions,
        timestamp: aiResponse.data.timestamp
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
        error: 'Failed to process AI request',
        message: error.message
      }, 
      { status: 500 }
    )
  }
}
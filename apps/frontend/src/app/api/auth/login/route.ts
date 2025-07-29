import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { isBuildTime, buildTimeResponse } from '@/lib/build-utils'

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: NextRequest) {
  if (isBuildTime()) return buildTimeResponse('Login API - Build time')
  
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organization: {
          select: {
            id: true,
            businessName: true,
            orgCode: true,
            isActive: true,
          }
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            position: true,
            department: {
              select: {
                name: true
              }
            }
          }
        }
      }
    })

    if (!user || !user.isActive || !user.organization?.isActive) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid credentials or account deactivated' 
        }, 
        { status: 401 }
      )
    }

    // Verify password
    if (!user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid credentials' 
        }, 
        { status: 401 }
      )
    }

    // Generate JWT token
    const secret = process.env.JWT_SECRET || 'your-jwt-secret'
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      },
      secret,
      { expiresIn: '7d' }
    )

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    })

    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organization: user.organization,
          employee: user.employee
        }
      },
      message: 'Login successful'
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

    console.error('Login error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Login failed' 
      }, 
      { status: 500 }
    )
  }
}
import { NextResponse } from 'next/server'

export function isBuildTime(): boolean {
  return process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL
}

export function buildTimeResponse(message: string = 'Database not available during build') {
  return NextResponse.json({
    success: true,
    data: [],
    count: 0,
    message
  })
}
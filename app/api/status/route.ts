import { NextResponse } from 'next/server'

// GET /api/status
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  })
}

// POST /api/status (ejemplo de POST)
export async function POST(request: Request) {
  const body = await request.json()
  
  return NextResponse.json({
    message: 'Data received',
    data: body,
  }, { status: 200 })
}
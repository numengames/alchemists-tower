import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name } = await request.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { name: name.trim() },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        resource_type: 'USER',
        user_id: session.user.id,
        user_email: session.user.email!,
        status: 'SUCCESS',
        details: { field: 'name', new_value: name.trim() },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update name error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_backup_codes: [],
        two_factor_enabled_at: null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: 'DELETE',
        resource_type: 'USER',
        user_id: session.user.id,
        user_email: session.user.email!,
        status: 'SUCCESS',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disable 2FA error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

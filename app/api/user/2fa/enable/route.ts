import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { authenticator } from 'otplib';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.two_factor_enabled) {
      return NextResponse.json({ error: '2FA already enabled' }, { status: 400 });
    }

    let secret = user.two_factor_secret;
    if (!secret) {
      secret = authenticator.generateSecret();
    }

    const isValid = authenticator.verify({ token: code, secret });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        two_factor_enabled: true,
        two_factor_secret: secret,
        two_factor_backup_codes: backupCodes,
        two_factor_enabled_at: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        resource_type: 'USER',
        user_id: session.user.id,
        user_email: session.user.email!,
        status: 'SUCCESS',
      },
    });

    return NextResponse.json({ success: true, backupCodes });
  } catch (error) {
    console.error('Enable 2FA error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

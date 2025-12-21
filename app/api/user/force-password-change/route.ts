import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  return withAuth(request, async (session) => {
    try {
      const { newPassword } = await request.json();

      if (!newPassword || newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 },
        );
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password and remove force flag
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          password_hash: newPasswordHash,
          password_changed_at: new Date(),
          force_password_change: false,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          resource_type: 'USER',
          user_id: session.user.id,
          user_email: session.user.email,
          status: 'SUCCESS',
          details: { forced: true },
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Force password change error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}

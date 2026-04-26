import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(request, async (session) => {
    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last admin' },
          { status: 400 },
        );
      }
    }

    await prisma.user.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'DELETE',
        resource_type: 'USER',
        resource_id: id,
        user_id: session.user.id,
        user_email: session.user.email,
        details: { deleted_email: target.email, deleted_role: target.role },
      },
    });

    return NextResponse.json({ success: true });
  });
}

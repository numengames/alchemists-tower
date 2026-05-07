import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdmin } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/generated/prisma/enums';

const patchRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(request, async (session) => {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = patchRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const newRole = parsed.data.role as UserRole;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (target.role === newRole) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    if (id === session.user.id && newRole !== 'ADMIN') {
      return NextResponse.json(
        { error: 'You cannot demote your own account' },
        { status: 400 },
      );
    }

    if (target.role === 'ADMIN' && newRole !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last admin' },
          { status: 400 },
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        force_password_change: true,
        two_factor_enabled: true,
        created_at: true,
        last_login_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE',
        resource_type: 'USER',
        resource_id: id,
        user_id: session.user.id,
        user_email: session.user.email,
        details: {
          field: 'role',
          previous: target.role,
          new_value: newRole,
          target_email: target.email,
        },
      },
    });

    return NextResponse.json({ user });
  });
}

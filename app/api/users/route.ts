import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withAdmin } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@/generated/prisma/enums';

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    const users = await prisma.user.findMany({
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
      orderBy: { created_at: 'desc' },
    });
    return NextResponse.json({ users });
  });
}

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
});

export async function POST(request: Request) {
  return withAdmin(request, async (session) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { email, name, password, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        password_hash,
        role: role as UserRole,
        force_password_change: true,
      },
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
        action: 'CREATE',
        resource_type: 'USER',
        resource_id: user.id,
        user_id: session.user.id,
        user_email: session.user.email,
        details: { created_email: email, role },
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuth } from '@/lib/api-auth';
import {
  backendUnreachablePayload,
  isBackendUnreachable,
} from '@/lib/connection-error';
import { prisma } from '@/lib/prisma';
import { ResourceType } from '@/generated/prisma/enums';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export async function GET(request: Request) {
  return withAuth(request, async (session) => {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { page, pageSize } = parsed.data;

    // Non-admins only see world-related activity. Admins see everything
    // (sign-ins, user management, world lifecycle).
    const isAdmin = session.user.role === 'ADMIN';
    const where = isAdmin ? {} : { resource_type: ResourceType.WORLD };

    try {
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            action: true,
            resource_type: true,
            resource_id: true,
            details: true,
            user_email: true,
            status: true,
            error_message: true,
            created_at: true,
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      return NextResponse.json({
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        scope: isAdmin ? 'all' : 'worlds-only',
      });
    } catch (error) {
      console.error('[api/activity] failed:', error);
      if (isBackendUnreachable(error)) {
        return NextResponse.json(
          backendUnreachablePayload('Could not reach the database.'),
          { status: 503 },
        );
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to load activity', detail: message },
        { status: 500 },
      );
    }
  });
}

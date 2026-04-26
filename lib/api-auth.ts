import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export type AuthedSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    forcePasswordChange: boolean;
  };
};

/**
 * Wrapper for API routes that require authentication.
 *
 * @example
 * export async function POST(request: Request) {
 *   return withAuth(request, async (session) => {
 *     const userId = session.user.id
 *     return NextResponse.json({ success: true })
 *   })
 * }
 */
export async function withAuth(
  request: Request,
  handler: (session: AuthedSession) => Promise<Response>,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handler(session as AuthedSession);
}

/**
 * Wrapper for API routes that require ADMIN role.
 * Returns 401 if unauthenticated, 403 if not admin.
 */
export async function withAdmin(
  request: Request,
  handler: (session: AuthedSession) => Promise<Response>,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return handler(session as AuthedSession);
}

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * Wrapper for API routes that require authentication
 *
 * @example
 * export async function POST(request: Request) {
 *   return withAuth(request, async (session) => {
 *     const userId = session.user.id
 *     // Your authenticated API logic here
 *     return NextResponse.json({ success: true })
 *   })
 * }
 */
export async function withAuth(
  request: Request,
  handler: (session: {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      forcePasswordChange: boolean;
    };
  }) => Promise<Response>,
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handler(session as any);
}

import { auth } from '@/lib/auth';

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!request.auth;

  // Public routes (accessible without authentication)
  const publicRoutes = ['/', '/login', '/help'];
  const isPublicRoute = publicRoutes.includes(pathname);

  // Redirect authenticated users away from login
  if (isAuthenticated && pathname === '/login') {
    return Response.redirect(new URL('/dashboard', request.url));
  }

  // Redirect unauthenticated users to login (except public routes)
  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('unauthorized', 'true');
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }

  return null;
});

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

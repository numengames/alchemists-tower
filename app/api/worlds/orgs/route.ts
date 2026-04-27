import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { ORG_CONFIG, getSupportedOrgs } from '@/lib/world-templates';

export async function GET(request: Request) {
  return withAuth(request, async () => {
    const orgs = getSupportedOrgs().map((slug) => ({
      slug,
      domain: ORG_CONFIG[slug].domain,
    }));
    return NextResponse.json({ orgs });
  });
}

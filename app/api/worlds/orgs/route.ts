import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { ORG_CONFIG, SUPPORTED_ORGS } from '@/lib/world-templates';

/**
 * Lists supported organizations for world creation. Used by the create-world
 * modal to populate the org dropdown.
 */
export async function GET(request: Request) {
  return withAuth(request, async () => {
    const orgs = SUPPORTED_ORGS.map((slug) => ({
      slug,
      domain: ORG_CONFIG[slug].domain,
    }));
    return NextResponse.json({ orgs });
  });
}

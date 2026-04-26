import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api-auth';
import { getTemplateDefaults } from '@/lib/aws-secrets';
import {
  OPTIONAL_AI_KEYS,
  REQUIRED_SECRET_KEYS,
} from '@/lib/world-templates-constants';

/**
 * Admin-only because pre-filled
 * values may contain shared credentials.
 */
export async function GET(request: Request) {
  return withAdmin(request, async () => {
    try {
      const defaults = await getTemplateDefaults();
      return NextResponse.json({
        exists: defaults.exists,
        requiredKeys: REQUIRED_SECRET_KEYS,
        optionalKeys: OPTIONAL_AI_KEYS,
        values: defaults.values,
      });
    } catch (error) {
      console.error('[api/worlds/template-defaults] failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        { error: 'Failed to read template defaults', detail: message },
        { status: 502 },
      );
    }
  });
}

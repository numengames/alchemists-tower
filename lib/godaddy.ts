/**
 * GoDaddy DNS helper. Upserts/removes a CNAME per world.
 */
import {
  ORG_CONFIG,
  type WorldEnvironment,
} from './world-templates';

const DEFAULT_API_BASE = 'https://api.godaddy.com';
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Orgs whose domain has a wildcard record → per-world CNAMEs are redundant.
 * Configured via the WILDCARD_ORGS env var (comma-separated org slugs).
 */
function getWildcardOrgs(): Set<string> {
  const raw = process.env.WILDCARD_ORGS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export class GoDaddyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoDaddyAuthError';
  }
}

export class GoDaddyApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`GoDaddy API ${status}: ${body}`);
    this.name = 'GoDaddyApiError';
    this.status = status;
    this.body = body;
  }
}

interface GoDaddyConfig {
  apiKey: string;
  apiSecret: string;
  apiBase: string;
  nlbHostname: string;
  ttlSeconds: number;
}

function getConfig(): GoDaddyConfig {
  const apiKey = process.env.GODADDY_API_KEY ?? '';
  const apiSecret = process.env.GODADDY_API_SECRET ?? '';
  const nlbHostname = process.env.KOURIER_NLB_HOSTNAME ?? '';
  if (!apiKey || !apiSecret) {
    throw new GoDaddyAuthError(
      'GODADDY_API_KEY and GODADDY_API_SECRET must be set in the environment',
    );
  }
  if (!nlbHostname) {
    throw new Error('KOURIER_NLB_HOSTNAME must be set in the environment');
  }
  return {
    apiKey,
    apiSecret,
    apiBase: process.env.GODADDY_API_BASE ?? DEFAULT_API_BASE,
    nlbHostname,
    ttlSeconds: Number(process.env.GODADDY_TTL_SECONDS ?? DEFAULT_TTL_SECONDS),
  };
}

/**
 * Apex domain + record subdomain for a world. PRE prefixes the world name
 * with `pre.`; PRO uses the bare world name as the record.
 */
export function deriveDnsRecord(
  org: string,
  world: string,
  env: WorldEnvironment,
): { domain: string; recordName: string } {
  const cfg = ORG_CONFIG[org];
  if (!cfg) throw new Error(`Unknown org for DNS: ${org}`);
  const recordName = env === 'pre' ? `pre.${world}` : world;
  return { domain: cfg.domain, recordName };
}

/** True if this org needs an explicit DNS record (no wildcard covers it). */
export function dnsRecordNeeded(org: string): boolean {
  return !getWildcardOrgs().has(org);
}

interface GoDaddyRecord {
  data: string;
  ttl: number;
  type?: string;
  name?: string;
}

/**
 * Idempotently upsert a CNAME for the world's hostname. PUT replaces the
 * record set for (type, name), so retry is safe.
 */
export async function upsertWorldCname(args: {
  org: string;
  world: string;
  env: WorldEnvironment;
}): Promise<{ skipped: boolean; domain: string; recordName: string; target: string }> {
  const { org, world, env } = args;
  const { domain, recordName } = deriveDnsRecord(org, world, env);
  const target = getConfig().nlbHostname; // safe to read even when skipped, for the return value

  if (!dnsRecordNeeded(org)) {
    return { skipped: true, domain, recordName, target };
  }

  const cfg = getConfig();
  const body: GoDaddyRecord[] = [
    { data: target, ttl: cfg.ttlSeconds },
  ];

  const url = `${cfg.apiBase}/v1/domains/${encodeURIComponent(
    domain,
  )}/records/CNAME/${encodeURIComponent(recordName)}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `sso-key ${cfg.apiKey}:${cfg.apiSecret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new GoDaddyAuthError(
        `GoDaddy rejected the credentials for domain '${domain}' (${res.status}): ${text}`,
      );
    }
    throw new GoDaddyApiError(res.status, text);
  }

  return { skipped: false, domain, recordName, target };
}

/** Idempotent CNAME delete. 404 is treated as success. */
export async function deleteWorldCname(args: {
  org: string;
  world: string;
  env: WorldEnvironment;
}): Promise<{ skipped: boolean; domain: string; recordName: string }> {
  const { org, world, env } = args;
  const { domain, recordName } = deriveDnsRecord(org, world, env);

  if (!dnsRecordNeeded(org)) {
    return { skipped: true, domain, recordName };
  }

  const cfg = getConfig();
  const url = `${cfg.apiBase}/v1/domains/${encodeURIComponent(
    domain,
  )}/records/CNAME/${encodeURIComponent(recordName)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      authorization: `sso-key ${cfg.apiKey}:${cfg.apiSecret}`,
    },
  });

  if (res.status === 404) return { skipped: false, domain, recordName };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new GoDaddyAuthError(
        `GoDaddy rejected the credentials for domain '${domain}' (${res.status}): ${text}`,
      );
    }
    throw new GoDaddyApiError(res.status, text);
  }

  return { skipped: false, domain, recordName };
}

import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.WILDCARD_ORGS = 'numinia';
  process.env.ORGS_CONFIG_JSON = JSON.stringify([
    { slug: 'numinia', domain: 'numinia.xyz', tlsSecretName: 'numinia-tls' },
    { slug: 'numen-games', domain: 'numen.games', tlsSecretName: 'numen-games-tls' },
    { slug: 'r3s3t', domain: 'r3s3t.xyz', tlsSecretName: 'r3s3t-tls' },
    {
      slug: 'active-inference',
      domain: 'activeinference.institute',
      tlsSecretName: 'active-inference-tls',
    },
  ]);
});

import { deriveDnsRecord, dnsRecordNeeded } from './godaddy';

describe('deriveDnsRecord', () => {
  it('produces apex CNAME for pro and pre.<world> for pre', () => {
    expect(deriveDnsRecord('numen-games', 'pablofm', 'pro')).toEqual({
      domain: 'numen.games',
      recordName: 'pablofm',
    });
    expect(deriveDnsRecord('numen-games', 'pablofm', 'pre')).toEqual({
      domain: 'numen.games',
      recordName: 'pre.pablofm',
    });
  });

  it('uses the right domain per org', () => {
    expect(deriveDnsRecord('r3s3t', 'sandbox', 'pro').domain).toBe('r3s3t.xyz');
    expect(deriveDnsRecord('active-inference', 'adventure', 'pro').domain).toBe(
      'activeinference.institute',
    );
    expect(deriveDnsRecord('numinia', 'genesis', 'pro').domain).toBe('numinia.xyz');
  });

  it('throws on unknown org', () => {
    expect(() => deriveDnsRecord('unknown', 'foo', 'pro')).toThrow(/Unknown org/);
  });
});

describe('dnsRecordNeeded', () => {
  it('skips numinia (wildcard) but requires the other orgs', () => {
    expect(dnsRecordNeeded('numinia')).toBe(false);
    expect(dnsRecordNeeded('numen-games')).toBe(true);
    expect(dnsRecordNeeded('r3s3t')).toBe(true);
    expect(dnsRecordNeeded('active-inference')).toBe(true);
  });
});

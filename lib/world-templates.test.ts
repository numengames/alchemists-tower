import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.ASSETS_PUBLIC_URL_BASE = 'https://statics.numinia.xyz/hyperfy-spaces';
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

import {
  deriveAssetsBaseUrl,
  deriveAwsSecretName,
  deriveConfigMapName,
  deriveDbSchema,
  deriveHelmReleaseName,
  deriveHostname,
  deriveNamespace,
  deriveServiceAccountName,
  deriveWorldRuntimeId,
  generateWorldFiles,
  isValidOrg,
  isValidWorldName,
  ORG_CONFIG,
} from './world-templates';

describe('isValidWorldName', () => {
  it('accepts kebab-case names within bounds', () => {
    expect(isValidWorldName('city-of-mesa')).toBe(true);
    expect(isValidWorldName('genesis')).toBe(true);
    expect(isValidWorldName('a1b')).toBe(true);
  });

  it('rejects names that violate the contract', () => {
    expect(isValidWorldName('Hello')).toBe(false); // uppercase
    expect(isValidWorldName('1foo')).toBe(false); // starts with digit
    expect(isValidWorldName('-foo')).toBe(false); // starts with dash
    expect(isValidWorldName('foo-')).toBe(false); // ends with dash
    expect(isValidWorldName('a')).toBe(false); // too short
    expect(isValidWorldName('a'.repeat(31))).toBe(false); // too long
    expect(isValidWorldName('foo bar')).toBe(false); // whitespace
    expect(isValidWorldName('foo_bar')).toBe(false); // underscore
  });
});

describe('isValidOrg', () => {
  it('matches the canonical 4 orgs', () => {
    expect(isValidOrg('numinia')).toBe(true);
    expect(isValidOrg('numen-games')).toBe(true);
    expect(isValidOrg('r3s3t')).toBe(true);
    expect(isValidOrg('active-inference')).toBe(true);
  });
  it('rejects unknown orgs', () => {
    expect(isValidOrg('foo')).toBe(false);
    expect(isValidOrg('')).toBe(false);
  });
});

describe('derived names', () => {
  it('namespaces follow <org>-pre / <org> convention', () => {
    expect(deriveNamespace('numinia', 'pre')).toBe('numinia-pre');
    expect(deriveNamespace('numinia', 'pro')).toBe('numinia');
    expect(deriveNamespace('numen-games', 'pro')).toBe('numen-games');
  });

  it('service accounts mirror the namespace pattern', () => {
    expect(deriveServiceAccountName('numinia', 'pre')).toBe('numinia-pre');
    expect(deriveServiceAccountName('numinia', 'pro')).toBe('numinia');
  });

  it('helmrelease and configmap names append env', () => {
    expect(deriveHelmReleaseName('city-of-mesa', 'pre')).toBe('city-of-mesa-pre');
    expect(deriveHelmReleaseName('city-of-mesa', 'pro')).toBe('city-of-mesa-pro');
    expect(deriveConfigMapName('city-of-mesa', 'pre')).toBe('city-of-mesa-pre-values');
  });

  it('world runtime id uses <env>-<world>', () => {
    expect(deriveWorldRuntimeId('city-of-mesa', 'pre')).toBe('pre-city-of-mesa');
    expect(deriveWorldRuntimeId('genesis', 'pro')).toBe('pro-genesis');
  });

  it('hostname differs between pre and pro', () => {
    expect(deriveHostname('numinia', 'city-of-mesa', 'pre')).toBe(
      'pre.city-of-mesa.numinia.xyz',
    );
    expect(deriveHostname('numinia', 'city-of-mesa', 'pro')).toBe(
      'city-of-mesa.numinia.xyz',
    );
    expect(deriveHostname('numen-games', 'experience', 'pro')).toBe(
      'experience.numen.games',
    );
  });

  it('AWS secret naming is hyperfy2-<org>-<world>-<env>', () => {
    expect(deriveAwsSecretName('numinia', 'city-of-mesa', 'pre')).toBe(
      'hyperfy2-numinia-city-of-mesa-pre',
    );
    expect(deriveAwsSecretName('r3s3t', 'wp', 'pro')).toBe('hyperfy2-r3s3t-wp-pro');
  });

  it('DB schema follows the <env>-<org>-<world> convention', () => {
    expect(deriveDbSchema('numen-games', 'multi-merge', 'pre')).toBe(
      'pre-numen-games-multi-merge',
    );
    expect(deriveDbSchema('numinia', 'genesis', 'pro')).toBe('pro-numinia-genesis');
    expect(deriveDbSchema('r3s3t', 'sandbox', 'pre')).toBe('pre-r3s3t-sandbox');
  });

  it('assets URL uses dev/ for pre and latest/ for pro', () => {
    expect(deriveAssetsBaseUrl('numinia', 'city-of-mesa', 'pre')).toBe(
      'https://statics.numinia.xyz/hyperfy-spaces/numinia/city-of-mesa/dev/assets',
    );
    expect(deriveAssetsBaseUrl('numinia', 'city-of-mesa', 'pro')).toBe(
      'https://statics.numinia.xyz/hyperfy-spaces/numinia/city-of-mesa/latest/assets',
    );
  });
});

describe('generateWorldFiles', () => {
  it('throws on an unsupported org', () => {
    expect(() =>
      generateWorldFiles({ org: 'unknown', world: 'foo', env: 'pre' }),
    ).toThrow(/Unsupported org/);
  });

  it('throws on an invalid world name', () => {
    expect(() =>
      generateWorldFiles({ org: 'numinia', world: 'BadName', env: 'pre' }),
    ).toThrow(/Invalid world name/);
  });

  it('produces 3 files at the expected paths and the parent kustomization entry', () => {
    const out = generateWorldFiles({
      org: 'numinia',
      world: 'genesis',
      env: 'pre',
    });

    expect(out.files).toHaveLength(3);
    const paths = out.files.map((f) => f.path).sort();
    expect(paths).toEqual([
      'clusters/prod-cluster/organizations/numinia/genesis/pre/configmap-values.yaml',
      'clusters/prod-cluster/organizations/numinia/genesis/pre/helmrelease.yaml',
      'clusters/prod-cluster/organizations/numinia/genesis/pre/kustomization.yaml',
    ]);
    expect(out.parentKustomizationPath).toBe(
      'clusters/prod-cluster/organizations/numinia/pre-kustomization/kustomization.yaml',
    );
    expect(out.parentKustomizationEntry).toBe('../genesis/pre');
  });

  it('configmap-values.yaml carries every per-world variable', () => {
    const out = generateWorldFiles({
      org: 'numinia',
      world: 'genesis',
      env: 'pre',
    });
    const cm = out.files.find((f) => f.path.endsWith('configmap-values.yaml'))!.content;

    // Identity + secret naming
    expect(cm).toContain('name: genesis-pre-values');
    expect(cm).toContain('namespace: numinia-pre');
    expect(cm).toContain('awsSecretName: "hyperfy2-numinia-genesis-pre"');
    expect(cm).toContain('orgName: "numinia"');
    expect(cm).toContain('appName: "genesis"');
    expect(cm).toContain('environment: "pre"');
    expect(cm).toContain('serviceAccountName: "numinia-pre"');

    // Hostname + URLs
    expect(cm).toContain('hostname: pre.genesis.numinia.xyz');
    expect(cm).toContain('publicWsUrl: "wss://pre.genesis.numinia.xyz/ws"');
    expect(cm).toContain('publicApiUrl: "https://pre.genesis.numinia.xyz/api"');

    // Pre-specific defaults
    expect(cm).toContain('publicMaxUploadSize: "2000"');
    expect(cm).toContain(
      'assetsBaseUrl: "https://statics.numinia.xyz/hyperfy-spaces/numinia/genesis/dev/assets"',
    );

    // TLS secret
    expect(cm).toContain('tlsSecretName: "numinia-tls"');

    // World runtime id
    expect(cm).toContain('world: "pre-genesis"');
  });

  it('pro environment produces production hostname and latest assets path', () => {
    const out = generateWorldFiles({
      org: 'numen-games',
      world: 'experience',
      env: 'pro',
    });
    const cm = out.files.find((f) => f.path.endsWith('configmap-values.yaml'))!.content;

    expect(cm).toContain('namespace: numen-games');
    expect(cm).toContain('hostname: experience.numen.games');
    expect(cm).toContain('publicMaxUploadSize: "1"');
    expect(cm).toContain(
      'assetsBaseUrl: "https://statics.numinia.xyz/hyperfy-spaces/numen-games/experience/latest/assets"',
    );
    expect(cm).toContain('world: "pro-experience"');
    expect(cm).toContain('tlsSecretName: "numen-games-tls"');
  });

  it('helmrelease.yaml references the chart and configmap', () => {
    const out = generateWorldFiles({
      org: 'numinia',
      world: 'genesis',
      env: 'pre',
    });
    const hr = out.files.find((f) => f.path.endsWith('helmrelease.yaml'))!.content;

    expect(hr).toContain('apiVersion: helm.toolkit.fluxcd.io/v2');
    expect(hr).toContain('name: genesis-pre');
    expect(hr).toContain('namespace: numinia-pre');
    expect(hr).toContain('releaseName: genesis-pre');
    expect(hr).toContain('chart: ./clusters/prod-cluster/base/hyperfy2-knative');
    expect(hr).toContain('name: genesis-pre-values');
  });

  it('kustomization.yaml lists both yaml resources', () => {
    const out = generateWorldFiles({ org: 'numinia', world: 'genesis', env: 'pre' });
    const k = out.files.find((f) => f.path.endsWith('kustomization.yaml'))!.content;
    expect(k).toContain('apiVersion: kustomize.config.k8s.io/v1beta1');
    expect(k).toContain('- configmap-values.yaml');
    expect(k).toContain('- helmrelease.yaml');
  });

  it('respects resource overrides when provided', () => {
    const out = generateWorldFiles({
      org: 'numinia',
      world: 'genesis',
      env: 'pro',
      resources: { cpuLimit: '512m', memoryLimit: '1024Mi' },
    });
    const cm = out.files.find((f) => f.path.endsWith('configmap-values.yaml'))!.content;
    expect(cm).toContain('cpu: "512m"');
    expect(cm).toContain('memory: "1024Mi"');
  });

  it('respects imageTag and publicMaxUploadSize overrides', () => {
    const out = generateWorldFiles({
      org: 'r3s3t',
      world: 'sandbox',
      env: 'pre',
      imageTag: 'sha-abc123',
      publicMaxUploadSize: '500',
    });
    const cm = out.files.find((f) => f.path.endsWith('configmap-values.yaml'))!.content;
    expect(cm).toContain('tag: "sha-abc123"');
    expect(cm).toContain('publicMaxUploadSize: "500"');
  });

  it('every supported org has a working full generation', () => {
    for (const org of Object.keys(ORG_CONFIG)) {
      for (const env of ['pre', 'pro'] as const) {
        const out = generateWorldFiles({ org, world: 'sandbox', env });
        expect(out.files).toHaveLength(3);
        expect(out.parentKustomizationEntry).toBe(`../sandbox/${env}`);
      }
    }
  });
});

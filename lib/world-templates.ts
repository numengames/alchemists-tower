/**
 * Pure helpers that turn user form input into the YAML files needed to
 * provision a world via the GitOps repo.
 */
import { CHART_VERSION, IMAGE_REPOSITORY, IMAGE_TAG } from './world-templates-constants';

export type WorldEnvironment = 'pre' | 'pro';

export interface OrgConfig {
  slug: string;
  domain: string;
  tlsSecretName: string;
}

/**
 * Public URL base for served assets. Required at runtime.
 * Falls back to a sentinel that is never deployed, only used at build time
 * so `next build` doesn't crash on a missing env (lazily resolved per call).
 */
function assetsPublicBase(): string {
  return (
    process.env.ASSETS_PUBLIC_URL_BASE ??
    'https://assets.example.invalid/hyperfy-spaces'
  );
}

/**
 * Per-org infra mapping consumed by the YAML generator.
 *
 * Loaded from the `ORGS_CONFIG_JSON` env var (a JSON array of OrgConfig).
 * Cached on first read so module consumers see a stable identity. If parsing
 * fails or the env var is missing, the map is empty — every org input is
 * rejected by `isValidOrg`, and SUPPORTED_ORGS is empty so the form shows
 * "no orgs configured".
 */
let _orgConfigCache: Record<string, OrgConfig> | null = null;

function loadOrgConfig(): Record<string, OrgConfig> {
  if (_orgConfigCache) return _orgConfigCache;
  const raw = process.env.ORGS_CONFIG_JSON ?? '';
  if (!raw.trim()) {
    _orgConfigCache = {};
    return _orgConfigCache;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[world-templates] ORGS_CONFIG_JSON is not valid JSON; org list is empty');
    _orgConfigCache = {};
    return _orgConfigCache;
  }
  if (!Array.isArray(parsed)) {
    console.error('[world-templates] ORGS_CONFIG_JSON must be an array; org list is empty');
    _orgConfigCache = {};
    return _orgConfigCache;
  }
  const result: Record<string, OrgConfig> = {};
  for (const entry of parsed) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as OrgConfig).slug === 'string' &&
      typeof (entry as OrgConfig).domain === 'string' &&
      typeof (entry as OrgConfig).tlsSecretName === 'string'
    ) {
      const cfg = entry as OrgConfig;
      result[cfg.slug] = cfg;
    }
  }
  _orgConfigCache = result;
  return result;
}

/** Map of org slug → config. Lazily parsed from `ORGS_CONFIG_JSON`. */
export const ORG_CONFIG: Record<string, OrgConfig> = new Proxy(
  {},
  {
    get(_t, key: string) {
      return loadOrgConfig()[key];
    },
    has(_t, key: string) {
      return key in loadOrgConfig();
    },
    ownKeys() {
      return Reflect.ownKeys(loadOrgConfig());
    },
    getOwnPropertyDescriptor(_t, key: string) {
      const cfg = loadOrgConfig()[key];
      if (!cfg) return undefined;
      return { configurable: true, enumerable: true, value: cfg, writable: false };
    },
  },
) as Record<string, OrgConfig>;

/** List of supported org slugs (parsed lazily). */
export function getSupportedOrgs(): string[] {
  return Object.keys(loadOrgConfig());
}

// Eager-eval helper kept for back-compat with consumers that imported the
// constant. Re-evaluated on every access via a getter.
export const SUPPORTED_ORGS: readonly string[] = new Proxy([] as string[], {
  get(_t, key) {
    const list = getSupportedOrgs();
    if (key === 'length') return list.length;
    if (typeof key === 'string' && /^\d+$/.test(key)) return list[Number(key)];
    return Reflect.get(list, key);
  },
}) as readonly string[];

const WORLD_NAME_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;

export function isValidWorldName(name: string): boolean {
  return WORLD_NAME_RE.test(name);
}

export function isValidOrg(org: string): org is keyof typeof ORG_CONFIG {
  return Object.prototype.hasOwnProperty.call(ORG_CONFIG, org);
}

/**
 * Postgres schema name. Hyphens are kept (must be double-quoted in SQL).
 */
export function deriveDbSchema(
  org: string,
  world: string,
  env: WorldEnvironment,
): string {
  return `${env}-${org}-${world}`;
}

export function deriveAwsSecretName(
  org: string,
  world: string,
  env: WorldEnvironment,
): string {
  return `hyperfy2-${org}-${world}-${env}`;
}

export function deriveAssetsBaseUrl(
  org: string,
  world: string,
  env: WorldEnvironment,
): string {
  requireOrg(org);
  const segment = env === 'pre' ? 'dev' : 'latest';
  return `${assetsPublicBase()}/${org}/${world}/${segment}/assets`;
}

export function deriveHostname(
  org: string,
  world: string,
  env: WorldEnvironment,
): string {
  const cfg = requireOrg(org);
  return env === 'pre' ? `pre.${world}.${cfg.domain}` : `${world}.${cfg.domain}`;
}

export function deriveNamespace(org: string, env: WorldEnvironment): string {
  return env === 'pre' ? `${org}-pre` : org;
}

export function deriveServiceAccountName(org: string, env: WorldEnvironment): string {
  return env === 'pre' ? `${org}-pre` : org;
}

export function deriveHelmReleaseName(world: string, env: WorldEnvironment): string {
  return `${world}-${env}`;
}

export function deriveConfigMapName(world: string, env: WorldEnvironment): string {
  return `${world}-${env}-values`;
}

export function deriveWorldRuntimeId(world: string, env: WorldEnvironment): string {
  return `${env}-${world}`;
}

export interface WorldRepoPaths {
  worldFiles: { configMap: string; helmRelease: string; kustomization: string };
  parentKustomization: string;
  parentEntry: string;
}

/** All paths inside the GitOps repo for a given world (used by create + delete). */
export function deriveWorldRepoPaths(
  org: string,
  world: string,
  env: WorldEnvironment,
): WorldRepoPaths {
  const dir = `${WORLD_DIR_PREFIX}/${org}/${world}/${env}`;
  return {
    worldFiles: {
      configMap: `${dir}/configmap-values.yaml`,
      helmRelease: `${dir}/helmrelease.yaml`,
      kustomization: `${dir}/kustomization.yaml`,
    },
    parentKustomization: `${WORLD_DIR_PREFIX}/${org}/${env}-kustomization/kustomization.yaml`,
    parentEntry: `../${world}/${env}`,
  };
}

function requireOrg(org: string): OrgConfig {
  const cfg = ORG_CONFIG[org];
  if (!cfg) {
    throw new Error(
      `Unknown organization: ${org}. Supported: ${SUPPORTED_ORGS.join(', ')}`,
    );
  }
  return cfg;
}

// =============================================================
// YAML generation
// =============================================================

export interface GenerateInput {
  org: string;
  world: string;
  env: WorldEnvironment;
  resources?: {
    cpuLimit?: string;
    memoryLimit?: string;
  };
  imageTag?: string;
  publicMaxUploadSize?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedWorld {
  files: GeneratedFile[];
  parentKustomizationPath: string;
  parentKustomizationEntry: string;
}

const WORLD_DIR_PREFIX =
  process.env.GITOPS_WORLD_DIR_PREFIX ?? 'clusters/prod-cluster/organizations';

export function generateWorldFiles(input: GenerateInput): GeneratedWorld {
  validateInput(input);

  const { org, world, env } = input;
  const cfg = requireOrg(org);
  const ns = deriveNamespace(org, env);
  const sa = deriveServiceAccountName(org, env);
  const hr = deriveHelmReleaseName(world, env);
  const cm = deriveConfigMapName(world, env);
  const hostname = deriveHostname(org, world, env);
  const awsSecretName = deriveAwsSecretName(org, world, env);
  const assetsBaseUrl = deriveAssetsBaseUrl(org, world, env);
  const worldRuntimeId = deriveWorldRuntimeId(world, env);

  const cpuLimit = input.resources?.cpuLimit ?? '1024m';
  const memoryLimit = input.resources?.memoryLimit ?? '2048Mi';
  const imageTag = input.imageTag ?? IMAGE_TAG;
  const publicMaxUploadSize =
    input.publicMaxUploadSize ?? (env === 'pre' ? '2000' : '1');

  const dirBase = `${WORLD_DIR_PREFIX}/${org}/${world}/${env}`;

  const configMap = renderConfigMap({
    cm,
    ns,
    awsSecretName,
    org,
    world,
    env,
    sa,
    imageTag,
    worldRuntimeId,
    publicMaxUploadSize,
    hostname,
    assetsBaseUrl,
    cpuLimit,
    memoryLimit,
    tlsSecretName: cfg.tlsSecretName,
  });

  const helmRelease = renderHelmRelease({ hr, ns, cm });

  const kustomization = renderKustomization();

  return {
    files: [
      { path: `${dirBase}/configmap-values.yaml`, content: configMap },
      { path: `${dirBase}/helmrelease.yaml`, content: helmRelease },
      { path: `${dirBase}/kustomization.yaml`, content: kustomization },
    ],
    parentKustomizationPath: `${WORLD_DIR_PREFIX}/${org}/${env}-kustomization/kustomization.yaml`,
    parentKustomizationEntry: `../${world}/${env}`,
  };
}

function validateInput(input: GenerateInput) {
  if (!isValidOrg(input.org)) {
    throw new Error(
      `Unsupported org "${input.org}". Supported: ${SUPPORTED_ORGS.join(', ')}`,
    );
  }
  if (!isValidWorldName(input.world)) {
    throw new Error(
      `Invalid world name "${input.world}". Must match ${WORLD_NAME_RE.source}`,
    );
  }
  if (input.env !== 'pre' && input.env !== 'pro') {
    throw new Error(`env must be "pre" or "pro" — got "${input.env}"`);
  }
}

interface ConfigMapInput {
  cm: string;
  ns: string;
  awsSecretName: string;
  org: string;
  world: string;
  env: WorldEnvironment;
  sa: string;
  imageTag: string;
  worldRuntimeId: string;
  publicMaxUploadSize: string;
  hostname: string;
  assetsBaseUrl: string;
  cpuLimit: string;
  memoryLimit: string;
  tlsSecretName: string;
}

function renderConfigMap(i: ConfigMapInput): string {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${i.cm}
  namespace: ${i.ns}
  annotations:
    config-version: "1.0.0"
data:
  values.yaml: |
    awsSecretName: "${i.awsSecretName}"
    orgName: "${i.org}"
    appName: "${i.world}"
    environment: "${i.env}"
    namespace: ${i.ns}
    serviceAccountName: "${i.sa}"
    image:
      repository: "${IMAGE_REPOSITORY}"
      tag: "${i.imageTag}"
    world: "${i.worldRuntimeId}"
    publicMaxUploadSize: "${i.publicMaxUploadSize}"
    publicWsUrl: "wss://${i.hostname}/ws"
    publicApiUrl: "https://${i.hostname}/api"
    assetsBaseUrl: "${i.assetsBaseUrl}"
    clean: "true"
    tlsSecretName: "${i.tlsSecretName}"
    resources:
      requests:
        cpu: "256m"
        memory: "256Mi"
      limits:
        cpu: "${i.cpuLimit}"
        memory: "${i.memoryLimit}"
    autoscaling:
      minScale: 0
      maxScale: 1
    domainMapping:
      enabled: true
      hostname: ${i.hostname}
      namespace: ${i.ns}
`;
}

function renderHelmRelease(i: { hr: string; ns: string; cm: string }): string {
  return `apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: ${i.hr}
  namespace: ${i.ns}
spec:
  interval: 5m
  releaseName: ${i.hr}
  targetNamespace: ${i.ns}
  install:
    remediation:
      retries: 3
  upgrade:
    remediation:
      retries: 3
  chart:
    spec:
      chart: ./clusters/prod-cluster/base/hyperfy2-knative
      sourceRef:
        kind: GitRepository
        name: flux-system
        namespace: flux-system
      interval: 1m
  valuesFrom:
    - kind: ConfigMap
      name: ${i.cm}
      valuesKey: values.yaml
`;
}

function renderKustomization(): string {
  return `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - configmap-values.yaml
  - helmrelease.yaml
`;
}

export const __TEMPLATE_VERSION__ = CHART_VERSION;

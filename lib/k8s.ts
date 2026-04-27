import { KubeConfig, CustomObjectsApi, CoreV1Api } from '@kubernetes/client-node';

const HELM_RELEASE = {
  group: 'helm.toolkit.fluxcd.io',
  version: 'v2',
  plural: 'helmreleases',
} as const;

const SYSTEM_NAMESPACES = new Set([
  'flux-system',
  'kube-system',
  'kube-public',
  'kube-node-lease',
  'cert-manager',
  'knative-serving',
  'knative-eventing',
  'kourier-system',
  'default',
  'external-secrets',
  'external-dns',
]);

export type WorldStatus =
  | 'RUNNING'
  | 'IDLE'
  | 'DEGRADED'
  | 'ERROR'
  | 'UPDATING'
  | 'UNKNOWN'
  | 'PROVISIONING'
  | 'FAILED';

export type Environment = 'pre' | 'pro';

export interface World {
  helmReleaseName: string;
  worldName: string;
  organization: string;
  environment: Environment;
  namespace: string;
  url: string | null;
  status: WorldStatus;
  statusReason?: string;
  chartVersion?: string;
  lastAppliedRevision?: string;
  createdAt?: string;
  /** Set when this row is DB-only (PROVISIONING / FAILED) — not in cluster yet. */
  source?: 'k8s' | 'db';
  failureStep?: string | null;
  failureReason?: string | null;
  prUrl?: string | null;
}

let kcInstance: KubeConfig | null = null;

function getKubeConfig(): KubeConfig {
  if (kcInstance) return kcInstance;
  const kc = new KubeConfig();
  // Gate in-cluster explicitly — loadFromCluster() silently produces a broken
  // config (server=https://undefined:undefined) when SA env vars are missing.
  if (process.env.KUBERNETES_SERVICE_HOST && process.env.KUBERNETES_SERVICE_PORT) {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }
  kcInstance = kc;
  return kc;
}

function parseNamespaceToOrgEnv(ns: string): { org: string; env: Environment } {
  if (ns.endsWith('-pre')) return { org: ns.slice(0, -'-pre'.length), env: 'pre' };
  return { org: ns, env: 'pro' };
}

function stripEnvSuffix(helmReleaseName: string, env: Environment): string {
  const suffix = `-${env}`;
  return helmReleaseName.endsWith(suffix)
    ? helmReleaseName.slice(0, -suffix.length)
    : helmReleaseName;
}

function deriveStatus(hr: any): { status: WorldStatus; reason?: string } {
  const conditions: any[] = hr?.status?.conditions ?? [];
  const ready = conditions.find((c) => c.type === 'Ready');
  const reconciling = conditions.find((c) => c.type === 'Reconciling');
  const stalled = conditions.find((c) => c.type === 'Stalled');

  if (stalled?.status === 'True') {
    return { status: 'ERROR', reason: stalled.message };
  }
  if (reconciling?.status === 'True') {
    return { status: 'UPDATING', reason: reconciling.message };
  }
  if (ready?.status === 'True') {
    return { status: 'RUNNING' };
  }
  if (ready?.status === 'False') {
    return { status: 'ERROR', reason: ready.message };
  }
  return { status: 'UNKNOWN' };
}

function extractUrlFromValues(valuesYaml: string): string | null {
  const apiUrl = valuesYaml.match(/publicApiUrl:\s*["']?([^"'\s]+)["']?/);
  if (apiUrl) {
    try {
      return new URL(apiUrl[1]).origin;
    } catch {
      /* malformed URL — fall through to hostname */
    }
  }
  const hostname = valuesYaml.match(/hostname:\s*["']?([^"'\s]+)["']?/);
  if (hostname) return `https://${hostname[1]}`;
  return null;
}

export async function listWorlds(): Promise<World[]> {
  const kc = getKubeConfig();
  const custom = kc.makeApiClient(CustomObjectsApi);
  const core = kc.makeApiClient(CoreV1Api);

  const response: any = await custom.listClusterCustomObject({
    group: HELM_RELEASE.group,
    version: HELM_RELEASE.version,
    plural: HELM_RELEASE.plural,
  });
  const items: any[] = response?.items ?? [];

  const configMapCache = new Map<string, any>();
  const worlds: World[] = [];

  for (const hr of items) {
    const ns: string | undefined = hr?.metadata?.namespace;
    const name: string | undefined = hr?.metadata?.name;
    if (!ns || !name || SYSTEM_NAMESPACES.has(ns)) continue;

    const { org, env } = parseNamespaceToOrgEnv(ns);
    const worldName = stripEnvSuffix(name, env);
    const { status, reason } = deriveStatus(hr);

    let url: string | null = null;
    const cmName: string | undefined = hr?.spec?.valuesFrom?.[0]?.name;
    if (cmName) {
      const key = `${ns}/${cmName}`;
      let cm = configMapCache.get(key);
      if (cm === undefined) {
        try {
          cm = await core.readNamespacedConfigMap({ namespace: ns, name: cmName });
          configMapCache.set(key, cm);
        } catch {
          configMapCache.set(key, null);
        }
      }
      const valuesYaml: string | undefined = cm?.data?.['values.yaml'];
      if (valuesYaml) url = extractUrlFromValues(valuesYaml);
    }

    worlds.push({
      helmReleaseName: name,
      worldName,
      organization: org,
      environment: env,
      namespace: ns,
      url,
      status,
      statusReason: reason,
      chartVersion: hr?.spec?.chart?.spec?.version,
      lastAppliedRevision: hr?.status?.lastAppliedRevision,
      createdAt: hr?.metadata?.creationTimestamp,
    });
  }

  worlds.sort(
    (a, b) =>
      a.organization.localeCompare(b.organization) ||
      a.environment.localeCompare(b.environment) ||
      a.worldName.localeCompare(b.worldName),
  );

  return worlds;
}

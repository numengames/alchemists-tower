/**
 * Pure renderers for the four step-by-step deploy guides shipped inside a world
 * backup: local, AWS, Azure, GCP. Each is written in a dual register — prose +
 * numbered steps for a human, plus an explicit "For AI assistants" context block
 * and copy-paste command blocks so the recipient can hand the file to an LLM and
 * have it drive the steps.
 *
 * Design note carried into every cloud guide: the *recommended* path is a small
 * VM running the container in offline mode (SQLite + on-disk assets on a
 * persistent volume), because it is identical across clouds and needs no data
 * migration. The "managed/serverless" path is described as advanced, and is
 * honest about object-storage compatibility: the engine's S3 backend speaks the
 * S3 protocol, so it works with AWS S3 and (via interoperability/HMAC) GCS, but
 * NOT with Azure Blob — there the offline/Azure Files route is the right one.
 */
import {
  ENGINE_COMMIT,
  ENGINE_REPO_URL,
  type LocalRunConfig,
  type WorldBackupMeta,
} from './render-artifacts';

/** Shared "for AI" preamble, tailored per target. */
function aiPreamble(meta: WorldBackupMeta, cfg: LocalRunConfig, target: string): string {
  return `> **For AI assistants driving this deploy.** You are deploying a hyperfy2
> virtual-world server (Node 22, GPL-3.0; source: ${ENGINE_REPO_URL} pinned to
> commit \`${ENGINE_COMMIT}\`; prebuilt image \`${meta.engineImage}\`). All world
> data lives in the \`${cfg.worldDir}/\` folder next to this archive: SQLite at
> \`${cfg.worldDir}/db.sqlite\` and content-hashed assets in \`${cfg.worldDir}/assets/\`.
> The world is **stateful** — it autosaves to that folder every ${cfg.saveInterval}s —
> so it MUST sit on persistent storage. Target for this guide: **${target}**.
> Hard rules: (1) when a public domain is used you MUST set \`PUBLIC_WS_URL\`,
> \`PUBLIC_API_URL\` and \`ASSETS_BASE_URL\` to the public origin (wss/https) and
> the reverse proxy MUST forward WebSocket upgrades on \`/ws\`; (2) never expose
> the admin code \`${cfg.adminCode}\`; (3) the engine listens on port ${cfg.port}.`;
}

const DOMAIN_ENV_NOTE = (
  cfg: LocalRunConfig,
) => `When you put this behind a domain (say \`world.example.com\`), edit \`.env\` so the
browser talks to the public origin instead of localhost:

\`\`\`dotenv
PUBLIC_WS_URL=wss://world.example.com/ws
PUBLIC_API_URL=https://world.example.com/api
ASSETS_BASE_URL=https://world.example.com/assets
\`\`\`

The WebSocket endpoint is \`/ws\` — your reverse proxy must forward Upgrade
requests. [Caddy](https://caddyserver.com) does this automatically and also
gets you HTTPS for free; a minimal \`Caddyfile\` is:

\`\`\`caddyfile
world.example.com {
    reverse_proxy localhost:${cfg.port}
}
\`\`\``;

/** Index of all guides, used by the README and the CLI writer. */
export const DEPLOY_DOCS = ['DEPLOY-LOCAL', 'DEPLOY-AWS', 'DEPLOY-AZURE', 'DEPLOY-GCP'] as const;

export function renderDeployLocal(meta: WorldBackupMeta, cfg: LocalRunConfig): string {
  return `# Run "${meta.world}" locally

${aiPreamble(meta, cfg, 'a local machine or any single server with Docker')}

## Option A — Docker (recommended)

**Requirements:** Docker Desktop (or Docker Engine) with Compose v2.

1. Unpack this archive and open a terminal in its folder.
2. Start it:
   \`\`\`bash
   docker compose up
   \`\`\`
3. Open <http://localhost:${cfg.port}>. First boot loads \`${cfg.worldDir}/db.sqlite\`
   and serves assets from \`${cfg.worldDir}/assets/\`.
4. Type the admin code in-world to get builder rights: \`${cfg.adminCode}\`.

To run it in the background use \`docker compose up -d\`; stop it with
\`docker compose down\`. Your changes persist in the \`${cfg.worldDir}/\` folder.

### If you can't pull the prebuilt image

The image is optional — the engine is open source. Build it from the pinned
commit by editing \`docker-compose.yml\`: comment the \`image:\` line and uncomment
the \`build:\` block (already templated for you), then \`docker compose up --build\`.

## Option B — Node, without Docker

**Requirements:** Node 22.11.x (see the engine's \`.nvmrc\`), git, a C toolchain
(for the native SQLite module).

\`\`\`bash
git clone ${ENGINE_REPO_URL}.git engine
cd engine && git checkout ${ENGINE_COMMIT}
npm install && npm run build
# point the engine at the world folder shipped in this archive:
cp -R ../${cfg.worldDir} ./${cfg.worldDir}
cp ../.env ./.env
npm run start
\`\`\`

Then open <http://localhost:${cfg.port}>.

## Putting it on the internet (a VPS with a domain)

Run Option A on any Linux server (Hetzner, DigitalOcean, a cloud VM…), then add
a domain + HTTPS. ${DOMAIN_ENV_NOTE(cfg)}

Restart after editing \`.env\`: \`docker compose up -d\`.

## Troubleshooting

- **Port ${cfg.port} already in use** — change the published port in
  \`docker-compose.yml\` (\`"8080:${cfg.port}"\`) and \`PORT\`/URLs in \`.env\`.
- **Assets don't load** — confirm \`ASSETS=local\` and that \`ASSETS_BASE_URL\`
  matches the origin you're browsing from.
- **Voice/video missing** — expected; LiveKit is intentionally disabled offline.
- **Changes vanish on restart** — make sure the \`${cfg.worldDir}/\` volume mount
  in \`docker-compose.yml\` is intact.
`;
}

export function renderDeployAws(meta: WorldBackupMeta, cfg: LocalRunConfig): string {
  return `# Deploy "${meta.world}" to AWS

${aiPreamble(meta, cfg, 'AWS')}

## Recommended — a small EC2/Lightsail VM with Docker

This keeps the world in offline mode (SQLite + on-disk assets) on the VM's disk:
nothing to migrate, behaves exactly like the local run.

1. Create an **Amazon Lightsail** instance (or EC2 \`t3.small\`, Ubuntu 22.04+,
   with at least \`${diskHint(meta)}\` of disk for the assets). Open ports 80 and 443.
2. Install Docker:
   \`\`\`bash
   curl -fsSL https://get.docker.com | sh
   \`\`\`
3. Copy this archive up and unpack it:
   \`\`\`bash
   scp mundo-${meta.org}-${meta.world}-${meta.env}.tar.gz ubuntu@<vm-ip>:~/
   ssh ubuntu@<vm-ip> 'mkdir -p world-app && tar -xzf mundo-*.tar.gz -C world-app'
   \`\`\`
4. Point a domain's A record at the VM IP, set the public URLs (below), then:
   \`\`\`bash
   cd world-app && docker compose up -d
   \`\`\`

${DOMAIN_ENV_NOTE(cfg)}

Run Caddy as a second container or system service to terminate HTTPS.

## Advanced — managed services (RDS Postgres + S3)

Use this only if you want autoscaling/serverless compute. The engine's S3 backend
is **natively compatible with AWS S3**, and Postgres is its other supported DB,
so AWS is the one cloud where the managed path is fully first-class.

1. **Assets → S3.** Create a bucket and upload the folder:
   \`\`\`bash
   aws s3 sync ${cfg.worldDir}/assets/ s3://YOUR_BUCKET/${meta.org}/${meta.world}/assets/
   \`\`\`
2. **State → RDS Postgres.** Create an RDS PostgreSQL 16 instance, then load the
   SQLite data with [pgloader](https://pgloader.io):
   \`\`\`bash
   pgloader ${cfg.worldDir}/db.sqlite postgresql://USER:PASS@HOST/DB
   \`\`\`
3. **Run** on App Runner or ECS Fargate with these env overrides instead of the
   offline ones:
   \`\`\`dotenv
   ASSETS=s3
   ASSETS_S3_URI=s3://ACCESS_KEY:SECRET_KEY@YOUR_BUCKET.s3.REGION.amazonaws.com/${meta.org}/${meta.world}
   ASSETS_BASE_URL=https://YOUR_BUCKET.s3.REGION.amazonaws.com/${meta.org}/${meta.world}/assets
   DB_URI=postgresql://USER:PASS@HOST/DB
   DB_SCHEMA=public
   \`\`\`

## Verify

Browse the domain; you should see the world load. Check container logs with
\`docker logs\` (VM) or the App Runner/ECS console (managed).
`;
}

export function renderDeployAzure(meta: WorldBackupMeta, cfg: LocalRunConfig): string {
  return `# Deploy "${meta.world}" to Azure

${aiPreamble(meta, cfg, 'Azure')}

> **Storage note (important).** The engine's S3 asset backend speaks the S3
> protocol; **Azure Blob Storage does not**, so you cannot point \`ASSETS=s3\` at
> Blob directly. On Azure the right approach is the offline/filesystem mode on a
> VM (or Azure Files mounted into \`${cfg.worldDir}/assets/\`). The VM path below is
> recommended and the simplest correct option.

## Recommended — an Azure VM with Docker

1. Create the VM and open web ports:
   \`\`\`bash
   az vm create -g MyGroup -n world-vm --image Ubuntu2204 \\
     --size Standard_B2s --admin-username azureuser --generate-ssh-keys
   az vm open-port -g MyGroup -n world-vm --port 80,443
   \`\`\`
2. Install Docker on the VM:
   \`\`\`bash
   ssh azureuser@<vm-ip> 'curl -fsSL https://get.docker.com | sh'
   \`\`\`
3. Copy + unpack this archive:
   \`\`\`bash
   scp mundo-${meta.org}-${meta.world}-${meta.env}.tar.gz azureuser@<vm-ip>:~/
   ssh azureuser@<vm-ip> 'mkdir world-app && tar -xzf mundo-*.tar.gz -C world-app'
   \`\`\`
4. Point a domain at the VM, set the public URLs (below), then
   \`cd world-app && docker compose up -d\`.

${DOMAIN_ENV_NOTE(cfg)}

## Advanced — Container Apps + managed Postgres

Compute can be **Azure Container Apps** (serverless) with a mounted **Azure Files**
share for \`${cfg.worldDir}/\` so writes persist, OR move state to **Azure Database
for PostgreSQL Flexible Server** while keeping assets on the mounted file share:

\`\`\`bash
pgloader ${cfg.worldDir}/db.sqlite \\
  postgresql://USER:PASS@SERVER.postgres.database.azure.com/DB
\`\`\`

\`\`\`dotenv
DB_URI=postgresql://USER:PASS@SERVER.postgres.database.azure.com/DB
DB_SCHEMA=public
# assets stay on the mounted Azure Files share (ASSETS=local), NOT on Blob
ASSETS=local
\`\`\`

## Verify

Open the domain; the world should load. Inspect logs with \`docker logs\` (VM) or
\`az containerapp logs show\` (Container Apps).
`;
}

export function renderDeployGcp(meta: WorldBackupMeta, cfg: LocalRunConfig): string {
  return `# Deploy "${meta.world}" to Google Cloud

${aiPreamble(meta, cfg, 'Google Cloud')}

## Recommended — a Compute Engine VM with Docker

1. Create the VM and a firewall rule for web traffic:
   \`\`\`bash
   gcloud compute instances create world-vm --machine-type e2-small \\
     --image-family ubuntu-2204-lts --image-project ubuntu-os-cloud
   gcloud compute firewall-rules create allow-web --allow tcp:80,tcp:443
   \`\`\`
2. Install Docker, copy + unpack:
   \`\`\`bash
   gcloud compute ssh world-vm --command 'curl -fsSL https://get.docker.com | sh'
   gcloud compute scp mundo-${meta.org}-${meta.world}-${meta.env}.tar.gz world-vm:~/
   gcloud compute ssh world-vm --command 'mkdir world-app && tar -xzf mundo-*.tar.gz -C world-app'
   \`\`\`
3. Point a domain at the VM's external IP, set the public URLs (below), then
   \`cd world-app && docker compose up -d\`.

${DOMAIN_ENV_NOTE(cfg)}

## Advanced — Cloud Run + Cloud SQL + GCS

GCS offers an **S3-interoperability** mode, so unlike Azure the engine's S3
backend works against it using HMAC keys.

1. **Assets → GCS** and create an HMAC key (Storage → Settings → Interoperability):
   \`\`\`bash
   gsutil -m cp -r ${cfg.worldDir}/assets gs://YOUR_BUCKET/${meta.org}/${meta.world}/
   \`\`\`
2. **State → Cloud SQL (PostgreSQL 16)** via pgloader:
   \`\`\`bash
   pgloader ${cfg.worldDir}/db.sqlite postgresql://USER:PASS@HOST/DB
   \`\`\`
3. **Run on Cloud Run** with the S3-interoperability endpoint:
   \`\`\`dotenv
   ASSETS=s3
   ASSETS_S3_URI=s3://HMAC_KEY:HMAC_SECRET@storage.googleapis.com/YOUR_BUCKET/${meta.org}/${meta.world}
   ASSETS_BASE_URL=https://storage.googleapis.com/YOUR_BUCKET/${meta.org}/${meta.world}/assets
   DB_URI=postgresql://USER:PASS@HOST/DB
   DB_SCHEMA=public
   \`\`\`
   Note: Cloud Run's filesystem is ephemeral, so the managed path (external DB +
   GCS) is required there — the offline VM path above is simpler if you don't need
   autoscaling.

## Verify

Open the domain; the world should load. Logs: \`docker logs\` (VM) or
\`gcloud run services logs read\` (Cloud Run).
`;
}

/** Rough disk hint for the VM, based on the exported asset size. */
function diskHint(meta: WorldBackupMeta): string {
  const gb = meta.assets.bytes / 1024 ** 3;
  if (gb < 1) return '10 GB';
  return `${Math.ceil(gb * 2 + 5)} GB`;
}

/** Render every guide keyed by its DEPLOY_DOCS name. */
export function renderAllDeployDocs(
  meta: WorldBackupMeta,
  cfg: LocalRunConfig,
): Record<(typeof DEPLOY_DOCS)[number], string> {
  return {
    'DEPLOY-LOCAL': renderDeployLocal(meta, cfg),
    'DEPLOY-AWS': renderDeployAws(meta, cfg),
    'DEPLOY-AZURE': renderDeployAzure(meta, cfg),
    'DEPLOY-GCP': renderDeployGcp(meta, cfg),
  };
}

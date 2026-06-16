# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Khepri-Forge backoffice — multi-stage build for Next.js 16 standalone output.
#
# Targets a thin runtime: ~150 MB image, no dev deps, no source.
# Image is meant to run inside production-numinia EKS via IRSA — no AWS keys.
# ---------------------------------------------------------------------------

# ----- Stage 1: install deps (cached layer) ---------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ----- Stage 2: build -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder DB URLs only for the build step. `prisma.config.ts` resolves
# `env('DATABASE_URL')` eagerly at config-load time, so we satisfy it with a
# dummy string just to render the schema. At runtime these are overridden by
# the k8s Secret pulled via External Secret (envFrom on the Deployment).
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder" \
    SHADOW_DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder_shadow"
RUN npx prisma generate
RUN pnpm build

# ----- Stage 3: runtime -----------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as non-root: Next.js standalone server doesn't need root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy the standalone build, the static assets, the public folder, and the
# generated Prisma client (the standalone bundle does NOT pull it in).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone        ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static            ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public                  ./public
COPY --from=build --chown=nextjs:nodejs /app/generated/prisma        ./generated/prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

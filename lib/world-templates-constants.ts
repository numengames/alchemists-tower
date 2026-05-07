/**
 * Shared constants for the world-template generator and any consumer that
 * needs to surface the runtime version in the UI.
 */

export const CHART_VERSION = process.env.WORLD_CHART_VERSION ?? '0.4.7';
export const IMAGE_REPOSITORY =
  process.env.WORLD_IMAGE_REPOSITORY ?? 'ghcr.io/example/runtime';
export const IMAGE_TAG = process.env.WORLD_IMAGE_TAG ?? 'dev';

/** Required keys present in every per-world AWS secret. */
export const REQUIRED_SECRET_KEYS = [
  'ADMIN_CODE',
  'ASSETS_S3_URI',
  'DB_SCHEMA',
  'DB_URI',
  'JWT_SECRET',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_WS_URL',
] as const;

/** Optional AI block — present only on worlds with the AI feature enabled. */
export const OPTIONAL_AI_KEYS = [
  'AI_PROVIDER',
  'AI_MODEL',
  'AI_EFFORT',
  'AI_API_KEY',
] as const;

export type RequiredSecretKey = (typeof REQUIRED_SECRET_KEYS)[number];
export type OptionalSecretKey = (typeof OPTIONAL_AI_KEYS)[number];
export type SecretKey = RequiredSecretKey | OptionalSecretKey;

/** Reference secret in AWS Secrets Manager holding org-wide defaults. */
export const TEMPLATE_DEFAULTS_SECRET_ID =
  process.env.TEMPLATE_DEFAULTS_SECRET_ID ?? 'hyperfy2-template-defaults';

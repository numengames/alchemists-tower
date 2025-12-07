import type { Template, WorldEnvironment, WorldStatus } from './types'

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  IS_LOGGED_IN: 'isLoggedIn',
  USER_DATA: 'user_data',
  THEME: 'theme',
} as const

// API Routes
export const API_ROUTES = {
  // Auth
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  ME: '/api/auth/me',
  
  // Users
  USERS: '/api/users',
  USER: (id: string) => `/api/users/${id}`,
  
  // Worlds
  WORLDS: '/api/worlds',
  WORLD: (id: string) => `/api/worlds/${id}`,
  
  // Status
  STATUS: '/api/status',
} as const

// World Templates
export const WORLD_TEMPLATES: Template[] = [
  { 
    id: 'blank', 
    name: 'Blank Canvas', 
    description: 'Start from scratch with an empty world' 
  },
  { 
    id: 'starter', 
    name: 'Starter Kit', 
    description: 'Pre-configured world with basic features' 
  },
  { 
    id: 'advanced', 
    name: 'Advanced Setup', 
    description: 'Full-featured setup with all components' 
  },
] as const

// World Versions
export const WORLD_VERSIONS = [
  'v2.4.1',
  'v2.4.0',
  'v2.3.9',
  'v2.3.8',
] as const

// Status Configuration
export const STATUS_CONFIG: Record<WorldStatus, {
  label: string
  color: string
  glow: string
}> = {
  active: { 
    label: 'Active', 
    color: 'bg-emerald-500/20 text-emerald-400', 
    glow: 'shadow-lg shadow-emerald-500/20' 
  },
  paused: { 
    label: 'Paused', 
    color: 'bg-primary/20 text-foreground', 
    glow: '' 
  },
  updating: {
    label: 'Updating',
    color: 'bg-primary/20 text-foreground animate-pulse',
    glow: 'shadow-lg shadow-primary/20',
  },
  failed: { 
    label: 'Failed', 
    color: 'bg-red-500/20 text-red-400', 
    glow: '' 
  },
} as const

// Environment Configuration
export const ENV_CONFIG: Record<WorldEnvironment, {
  label: string
  shortLabel: string
  description: string
}> = {
  production: {
    label: 'Production',
    shortLabel: 'Pro',
    description: 'Live environment for end users',
  },
  staging: {
    label: 'Staging',
    shortLabel: 'Stg',
    description: 'Testing environment before production',
  },
  development: {
    label: 'Development',
    shortLabel: 'Dev',
    description: 'Development sandbox for experiments',
  },
} as const

// Validation Rules
export const VALIDATION = {
  EMAIL: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 255,
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 100,
  },
  WORLD_NAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9\s-_]+$/,
  },
  USER_NAME: {
    MIN_LENGTH: 2,
    MAX_LENGTH: 100,
  },
} as const

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
} as const

// Messages
export const MESSAGES = {
  ERROR: {
    GENERIC: 'An unexpected error occurred. Please try again.',
    NETWORK: 'Network error. Please check your connection.',
    UNAUTHORIZED: 'You are not authorized to perform this action.',
    NOT_FOUND: 'Resource not found.',
    VALIDATION: 'Please check your input and try again.',
  },
  SUCCESS: {
    LOGIN: 'Successfully logged in!',
    LOGOUT: 'Successfully logged out.',
    WORLD_CREATED: 'World created successfully!',
    WORLD_UPDATED: 'World updated successfully!',
    USER_CREATED: 'User created successfully!',
    USER_UPDATED: 'User updated successfully!',
  },
} as const
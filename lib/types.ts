// User types
export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: Date
  updatedAt: Date
}

// World types
export type WorldEnvironment = 'production' | 'staging' | 'development'
export type WorldStatus = 'active' | 'paused' | 'updating' | 'failed'

export interface World {
  id: string
  name: string
  environment: WorldEnvironment
  version: string
  status: WorldStatus
  owner: string
  ownerId?: string
  createdDate: string
  description: string
  url?: string
  k8sNamespace?: string
  rdsHost?: string
  metrics?: WorldMetrics
}

export interface WorldMetrics {
  uptime: number
  activeUsers: number
  lastUpdated: Date
  estimatedCost?: number
}

// Template types
export type WorldTemplate = 'blank' | 'starter' | 'advanced'

export interface Template {
  id: WorldTemplate
  name: string
  description: string
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// Form types
export interface CreateWorldFormData {
  name: string
  environment: WorldEnvironment
  template: WorldTemplate
  version: string
}

export interface LoginFormData {
  email: string
  password: string
}

// Auth types
export interface AuthSession {
  user: User
  token: string
  expiresAt: Date
}

// Audit log types
export type AuditAction = 
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'world.create'
  | 'world.update'
  | 'world.delete'
  | 'world.start'
  | 'world.stop'
  | 'auth.login'
  | 'auth.logout'

export interface AuditLog {
  id: string
  userId: string
  action: AuditAction
  resourceType: 'user' | 'world' | 'auth'
  resourceId?: string
  details?: Record<string, any>
  createdAt: Date
}
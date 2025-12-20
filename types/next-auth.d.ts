import { UserRole } from '@prisma/client'
import { DefaultSession, DefaultUser } from 'next-auth'
import { JWT, DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      forcePasswordChange: boolean
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: UserRole
    forcePasswordChange: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    role: UserRole
    forcePasswordChange: boolean
  }
}
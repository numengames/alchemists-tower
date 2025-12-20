import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { checkRateLimit, recordFailedAttempt, resetLoginAttempts } from '@/lib/rate-limit'
import { UserStatus } from '@/generated/prisma/enums'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing credentials')
        }

        const email = credentials.email as string
        const password = credentials.password as string

        // 1. Verificar rate limit
        const rateLimit = await checkRateLimit(email)
        
        if (!rateLimit.allowed) {
          if (rateLimit.lockDuration === 'permanent') {
            throw new Error('Account suspended. Contact administrator.')
          }
          throw new Error(`Too many failed attempts. Try again in ${rateLimit.lockDuration}.`)
        }

        // 2. Buscar usuario
        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user) {
          await recordFailedAttempt(email)
          throw new Error('Invalid credentials')
        }

        // 3. Verificar estado del usuario
        if (user.status === UserStatus.SUSPENDED) {
          throw new Error('Account suspended. Contact administrator.')
        }

        // 4. Verificar password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash)

        if (!isPasswordValid) {
          await recordFailedAttempt(email)
          const updatedLimit = await checkRateLimit(email)
          
          if (updatedLimit.remainingAttempts === 0 && updatedLimit.lockDuration) {
            throw new Error(`Invalid credentials. Account locked for ${updatedLimit.lockDuration}.`)
          }
          
          throw new Error(`Invalid credentials. ${updatedLimit.remainingAttempts} attempts remaining.`)
        }

        // 5. Login exitoso - resetear intentos
        await resetLoginAttempts(user.id)

        // 6. Crear audit log
        await prisma.auditLog.create({
          data: {
            action: 'LOGIN',
            resource_type: 'SESSION',
            user_id: user.id,
            user_email: user.email,
            status: 'SUCCESS',
          },
        })

        // 7. Retornar usuario con tipos correctos
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          forcePasswordChange: user.force_password_change,
        }
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            force_password_change: true,
          },
        })

        if (dbUser) {
          session.user.id = dbUser.id
          session.user.role = dbUser.role
          session.user.forcePasswordChange = dbUser.force_password_change
        }
      }
      return session
    },
    async jwt({ token, user }) {
      if (user && user.id) {
        token.id = user.id
        token.role = user.role
        token.forcePasswordChange = user.forcePasswordChange
      }
      return token
    },
  },
})
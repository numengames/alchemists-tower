import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { CredentialsSignin } from 'next-auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { checkRateLimit, recordFailedAttempt, resetLoginAttempts } from '@/lib/rate-limit'
import { UserStatus } from '@/generated/prisma/enums'

class CustomLoginError extends CredentialsSignin {
  constructor(public code: string) {
    super()
    this.message = code
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
  },
  logger: {
    error: (error) => {
      if (
        error.message.includes('INVALID||') ||
        error.message.includes('LOCKED||') ||
        error.message.includes('SUSPENDED||')
      ) {
        console.error('[auth]', error.message.split('||')[1])
      } else {
        console.error('[auth]', error.message)
      }
    },
    warn: () => {},
    debug: () => {},
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
          throw new CustomLoginError('INVALID||Please enter email and password')
        }

        const email = credentials.email as string
        const password = credentials.password as string

        const rateLimit = await checkRateLimit(email)

        if (!rateLimit.allowed) {
          // Audit log: Rate limit exceeded
          await prisma.auditLog.create({
            data: {
              action: 'LOGIN',
              resource_type: 'SESSION',
              user_email: email,
              status: 'FAILURE',
              error_message: `Rate limit exceeded: ${rateLimit.lockDuration}`,
            },
          })

          if (rateLimit.lockDuration === 'permanent') {
            throw new CustomLoginError('SUSPENDED||Account suspended. Contact administrator.')
          }
          throw new CustomLoginError(
            `LOCKED||Too many failed attempts. Try again in ${rateLimit.lockDuration}.`
          )
        }

        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user) {
          await recordFailedAttempt(email)

          // Audit log: User not found
          await prisma.auditLog.create({
            data: {
              action: 'LOGIN',
              resource_type: 'SESSION',
              user_email: email,
              status: 'FAILURE',
              error_message: 'Invalid credentials (user not found)',
            },
          })

          throw new CustomLoginError('INVALID||Invalid email or password')
        }

        if (user.status === UserStatus.SUSPENDED) {
          // Audit log: Suspended user
          await prisma.auditLog.create({
            data: {
              action: 'LOGIN',
              resource_type: 'SESSION',
              user_id: user.id,
              user_email: user.email,
              status: 'FAILURE',
              error_message: 'Account suspended',
            },
          })

          throw new CustomLoginError('SUSPENDED||Account suspended. Contact administrator.')
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash)

        if (!isPasswordValid) {
          await recordFailedAttempt(email)
          const updatedLimit = await checkRateLimit(email)

          // Audit log: Invalid password
          await prisma.auditLog.create({
            data: {
              action: 'LOGIN',
              resource_type: 'SESSION',
              user_id: user.id,
              user_email: user.email,
              status: 'FAILURE',
              error_message: `Invalid password (${5 - updatedLimit.remainingAttempts}/5 attempts)`,
            },
          })

          if (updatedLimit.remainingAttempts === 0 && updatedLimit.lockDuration) {
            throw new CustomLoginError(`LOCKED||Account locked for ${updatedLimit.lockDuration}.`)
          }

          throw new CustomLoginError(
            `INVALID||Invalid email or password. ${updatedLimit.remainingAttempts} attempts remaining.`
          )
        }

        await resetLoginAttempts(user.id)

        await prisma.auditLog.create({
          data: {
            action: 'LOGIN',
            resource_type: 'SESSION',
            user_id: user.id,
            user_email: user.email,
            status: 'SUCCESS',
          },
        })

        return {
          id: user.id,
          email: user.email!,
          name: user.name,
          role: user.role,
          forcePasswordChange: user.force_password_change,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && user.id) {
        token.id = user.id
        token.role = user.role
        token.forcePasswordChange = user.forcePasswordChange
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as any
        session.user.forcePasswordChange = token.forcePasswordChange as boolean
      }
      return session
    },
  },
})
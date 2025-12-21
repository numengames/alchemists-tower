import { UserStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  lockDuration?: string;
  lockedUntil?: Date;
}

export async function checkRateLimit(email: string): Promise<RateLimitResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      login_attempts: true,
      locked_until: true,
      last_failed_attempt: true,
      status: true,
    },
  });

  if (!user) {
    return { allowed: true, remainingAttempts: 5 };
  }

  if (user.status === UserStatus.SUSPENDED) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockDuration: 'permanent',
    };
  }

  if (user.locked_until && user.locked_until > new Date()) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockDuration: getTimeRemaining(user.locked_until),
      lockedUntil: user.locked_until,
    };
  }

  const remainingAttempts = 5 - user.login_attempts;

  return {
    allowed: remainingAttempts > 0,
    remainingAttempts: Math.max(0, remainingAttempts),
  };
}

export async function recordFailedAttempt(email: string): Promise<RateLimitResult> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, login_attempts: true },
  });

  if (!user) {
    return { allowed: true, remainingAttempts: 5 };
  }

  const newAttempts = user.login_attempts + 1;
  let lockUntil: Date | null = null;
  let newStatus: UserStatus | undefined = undefined;

  if (newAttempts === 5) {
    lockUntil = new Date(Date.now() + 1 * 60 * 1000);
  } else if (newAttempts === 10) {
    lockUntil = new Date(Date.now() + 10 * 60 * 1000);
  } else if (newAttempts === 15) {
    lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else if (newAttempts >= 20) {
    newStatus = UserStatus.SUSPENDED;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      login_attempts: newAttempts,
      locked_until: lockUntil,
      last_failed_attempt: new Date(),
      ...(newStatus && { status: newStatus }),
    },
  });

  const result = await checkRateLimit(email);
  return result;
}

export async function resetLoginAttempts(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      login_attempts: 0,
      locked_until: null,
      last_failed_attempt: null,
      last_login_at: new Date(),
    },
  });
}

function getTimeRemaining(until: Date): string {
  const diff = until.getTime() - Date.now();
  const minutes = Math.ceil(diff / 1000 / 60);

  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  const days = Math.ceil(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

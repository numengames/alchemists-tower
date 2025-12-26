import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * Genera password aleatoria segura
 */
function generatePassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = password.length; i < 16; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

/**
 * Extrae el name del email (parte antes del @)
 */
function getNameFromEmail(email: string): string {
  const name = email.split('@')[0];

  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function main() {
  console.log('🌱 Seeding database...\n');

  const USER_EMAILS = process.env.USER_EMAILS?.split(',') || [];

  const createdUsers: Array<{ email: string; password: string; name: string }> = [];

  for (const email of USER_EMAILS) {
    const plainPassword = generatePassword();
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const name = getNameFromEmail(email);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        password_hash: passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        force_password_change: true,
      },
    });

    createdUsers.push({
      email: user.email,
      password: plainPassword,
      name: user.name,
    });

    console.log(`✅ User created: ${user.email}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔑 USER CREDENTIALS - SAVE THESE SECURELY');
  console.log('='.repeat(80));
  console.log('');

  console.log(
    '┌─────────────────────────────────┬──────────────────────────┬──────────────────────┐',
  );
  console.log(
    '│ Email                           │ Name                     │ Password             │',
  );
  console.log(
    '├─────────────────────────────────┼──────────────────────────┼──────────────────────┤',
  );

  createdUsers.forEach(({ email, name, password }) => {
    const emailPadded = email.padEnd(31);
    const namePadded = name.padEnd(24);
    const passwordPadded = password.padEnd(20);
    console.log(`│ ${emailPadded} │ ${namePadded} │ ${passwordPadded} │`);
  });

  console.log(
    '└─────────────────────────────────┴──────────────────────────┴──────────────────────┘',
  );
  console.log('');
  console.log('⚠️  IMPORTANT:');
  console.log('   • All users have role: USER');
  console.log('   • To make a user ADMIN, run this SQL in pgAdmin4:');
  console.log('   • Users must change password on first login');
  console.log('   • Passwords are hashed with bcrypt in the database');
  console.log('');
  console.log('='.repeat(80));
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Array de emails de usuarios
const USER_EMAILS = [
  'admin1@khepriforge.com',
  'admin2@khepriforge.com',
  'dev1@khepriforge.com',
  'dev2@khepriforge.com',
  'manager@khepriforge.com',
]

/**
 * Genera password aleatoria segura
 */
function generatePassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*'
  
  // Asegurar al menos un carácter de cada tipo
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]
  
  // Completar hasta 16 caracteres
  const allChars = uppercase + lowercase + numbers + symbols
  for (let i = password.length; i < 16; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }
  
  // Shuffle (mezclar) los caracteres
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

/**
 * Extrae el name del email (parte antes del @)
 */
function getNameFromEmail(email: string): string {
  const name = email.split('@')[0]
  // Capitalizar primera letra
  return name.charAt(0).toUpperCase() + name.slice(1)
}

async function main() {
  console.log('🌱 Seeding database...\n')

  const createdUsers: Array<{ email: string; password: string; name: string }> = []

  for (const email of USER_EMAILS) {
    // Generar password aleatoria
    const plainPassword = generatePassword()
    
    // Hash de la password (bcrypt - se guarda cifrada en BD)
    const passwordHash = await bcrypt.hash(plainPassword, 12)
    
    // Extraer name del email
    const name = getNameFromEmail(email)

    // Crear o actualizar usuario
    const user = await prisma.user.upsert({
      where: { email },
      update: {}, // No actualizar si ya existe
      create: {
        email,
        name,
        password_hash: passwordHash,
        role: 'USER', // Todos son USER por defecto
        status: 'ACTIVE',
        force_password_change: true,
      },
    })

    createdUsers.push({
      email: user.email,
      password: plainPassword, // Guardar la password SIN hashear para mostrarla
      name: user.name,
    })

    console.log(`✅ User created: ${user.email}`)
  }

  // Mostrar tabla con credenciales
  console.log('\n' + '='.repeat(80))
  console.log('🔑 USER CREDENTIALS - SAVE THESE SECURELY')
  console.log('='.repeat(80))
  console.log('')
  
  console.log('┌─────────────────────────────────┬──────────────────────────┬──────────────────────┐')
  console.log('│ Email                           │ Name                     │ Password             │')
  console.log('├─────────────────────────────────┼──────────────────────────┼──────────────────────┤')
  
  createdUsers.forEach(({ email, name, password }) => {
    const emailPadded = email.padEnd(31)
    const namePadded = name.padEnd(24)
    const passwordPadded = password.padEnd(20)
    console.log(`│ ${emailPadded} │ ${namePadded} │ ${passwordPadded} │`)
  })
  
  console.log('└─────────────────────────────────┴──────────────────────────┴──────────────────────┘')
  console.log('')
  console.log('⚠️  IMPORTANT:')
  console.log('   • All users have role: USER')
  console.log('   • To make a user ADMIN, run this SQL in pgAdmin4:')
  console.log('     UPDATE users SET role = \'ADMIN\' WHERE email = \'admin1@khepriforge.com\';')
  console.log('   • Users must change password on first login')
  console.log('   • Passwords are hashed with bcrypt in the database')
  console.log('')
  console.log('='.repeat(80))
  console.log('')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
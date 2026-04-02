#!/usr/bin/env ts-node
/**
 * Script para crear usuarios administradores desde la línea de comandos.
 * 
 * Uso:
 *   npx ts-node scripts/create-admin.ts <email> <password>
 * 
 * Ejemplo:
 *   npx ts-node scripts/create-admin.ts admin@sn8labs.com MiPasswordSeguro123
 */

import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function createAdmin(email: string, password: string) {
  try {
    // Validar email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('❌ Error: El email no es válido');
      process.exit(1);
    }

    // Validar longitud de contraseña
    if (password.length < 8) {
      console.error('❌ Error: La contraseña debe tener al menos 8 caracteres');
      process.exit(1);
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.upsert({
      where: { email },
      update: { 
        passwordHash,
        role: UserRole.admin 
      },
      create: { 
        email, 
        passwordHash,
        role: UserRole.admin 
      },
    });

    console.log('✅ Usuario admin creado/actualizado exitosamente:');
    console.log(`   ID:    ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role:  ${user.role}`);
    console.log(`   Created At: ${user.createdAt.toISOString()}`);

  } catch (error) {
    console.error('❌ Error al crear el usuario:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Parsear argumentos de la línea de comandos
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Uso: npx ts-node scripts/create-admin.ts <email> <password>');
  console.log('Ejemplo: npx ts-node scripts/create-admin.ts admin@sn8labs.com MiPasswordSeguro123');
  process.exit(1);
}

const [email, password] = args;

createAdmin(email, password);

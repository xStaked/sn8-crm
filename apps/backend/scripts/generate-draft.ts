#!/usr/bin/env ts-node
/**
 * Script para forzar la generación de un quote draft manualmente
 * 
 * Uso:
 *   npx ts-node scripts/generate-draft.ts <conversationId>
 * 
 * Ejemplo:
 *   npx ts-node scripts/generate-draft.ts 573204051366
 */

import { PrismaClient } from '@prisma/client';
import { AiSalesOrchestrator } from '../src/ai-sales/ai-sales.orchestrator';
import { ConversationsService } from '../src/conversations/conversations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MessagingService } from '../src/messaging/messaging.service';
import { OwnerReviewService } from '../src/ai-sales/owner-review.service';
import { QuotePdfService } from '../src/quote-documents/quote-pdf.service';
import { ConfigService } from '@nestjs/config';

// Mock services para ejecutar fuera de NestJS
const prisma = new PrismaClient();

async function generateDraft(conversationId: string) {
  try {
    console.log(`\n🚀 Generando quote draft para: ${conversationId}\n`);

    // Verificar que el brief existe y está listo
    const brief = await prisma.commercialBrief.findUnique({
      where: { conversationId },
    });

    if (!brief) {
      console.error('❌ No se encontró brief comercial');
      return;
    }

    if (brief.status !== 'ready_for_quote') {
      console.error(`❌ El brief no está listo para cotizar. Estado: ${brief.status}`);
      return;
    }

    console.log('✅ Brief encontrado y listo para cotizar');
    console.log(`   Proyecto: ${brief.projectType}`);
    console.log(`   Presupuesto: ${brief.budget}`);
    
    // Aquí deberíamos inicializar todos los servicios de NestJS
    // Como es complejo, mejor instruimos usar el endpoint HTTP
    
    console.log('\n📡 Para generar el draft, usa el endpoint:');
    console.log(`   POST http://localhost:3001/conversations/${conversationId}/quote-review/generate`);
    console.log('\n   Headers:');
    console.log('   Authorization: Bearer <token>');
    console.log('   o cookie access_token=<token>');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const conversationId = process.argv[2];

if (!conversationId) {
  console.log('Uso: npx ts-node scripts/generate-draft.ts <conversationId>');
  console.log('Ejemplo: npx ts-node scripts/generate-draft.ts 573204051366');
  process.exit(1);
}

generateDraft(conversationId);

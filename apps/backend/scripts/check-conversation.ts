#!/usr/bin/env ts-node
/**
 * Script para verificar el estado de una conversación y sus cotizaciones
 * 
 * Uso:
 *   npx ts-node scripts/check-conversation.ts <conversationId>
 * 
 * Ejemplo:
 *   npx ts-node scripts/check-conversation.ts 573204051366
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkConversation(conversationId: string) {
  try {
    console.log(`\n🔍 Verificando conversación: ${conversationId}\n`);

    // Buscar brief comercial
    const brief = await prisma.commercialBrief.findUnique({
      where: { conversationId },
      include: {
        quoteDrafts: {
          orderBy: { version: 'desc' },
          take: 5,
        },
      },
    });

    if (!brief) {
      console.log('❌ No se encontró brief comercial para esta conversación');
      console.log('   El bot aún no ha procesado esta conversación o no se ha iniciado el flujo de cotización.');
      return;
    }

    console.log('📋 Brief Comercial:');
    console.log(`   ID: ${brief.id}`);
    console.log(`   Estado: ${brief.status}`);
    console.log(`   Cliente: ${brief.customerName ?? 'No especificado'}`);
    console.log(`   Tipo de proyecto: ${brief.projectType ?? 'No especificado'}`);
    console.log(`   Problema: ${brief.businessProblem ?? 'No especificado'}`);
    console.log(`   Alcance: ${brief.desiredScope ?? 'No especificado'}`);
    console.log(`   Presupuesto: ${brief.budget ?? 'No especificado'}`);
    console.log(`   Urgencia: ${brief.urgency ?? 'No especificada'}`);
    console.log(`   Restricciones: ${brief.constraints ?? 'No especificadas'}`);
    console.log(`   Creado: ${brief.createdAt.toISOString()}`);
    console.log(`   Actualizado: ${brief.updatedAt.toISOString()}`);

    console.log('\n📄 Quote Drafts:');
    if (brief.quoteDrafts.length === 0) {
      console.log('   ❌ No hay drafts de cotización');
      
      if (brief.status === 'ready_for_quote') {
        console.log('\n⚠️  El brief está listo para cotizar pero no se ha generado el draft.');
        console.log('   Posibles causas:');
        console.log('   - El worker de BullMQ no está corriendo');
        console.log('   - El job falló silenciosamente');
        console.log('   - Redis no está disponible');
        console.log('\n   💡 Solución: Usa el endpoint POST /conversations/{id}/quote-review/generate');
        console.log('      o reinicia el servidor para procesar las colas pendientes.');
      }
    } else {
      brief.quoteDrafts.forEach((draft, index) => {
        console.log(`\n   Draft #${index + 1} (v${draft.version}):`);
        console.log(`      ID: ${draft.id}`);
        console.log(`      Estado: ${draft.reviewStatus}`);
        console.log(`      Origen: ${draft.origin}`);
        console.log(`      Creado: ${draft.createdAt.toISOString()}`);
        if (draft.approvedAt) {
          console.log(`      Aprobado: ${draft.approvedAt.toISOString()}`);
        }
        if (draft.deliveredToCustomerAt) {
          console.log(`      Entregado: ${draft.deliveredToCustomerAt.toISOString()}`);
        }
      });

      // Verificar documento PDF
      const latestDraft = brief.quoteDrafts[0];
      const pdfDoc = await prisma.quoteDraftDocument.findUnique({
        where: { quoteDraftId: latestDraft.id },
      });

      console.log('\n📄 Documento PDF:');
      if (pdfDoc) {
        console.log(`   ✅ Disponible: ${pdfDoc.fileName}`);
        console.log(`   Tamaño: ${(pdfDoc.sizeBytes / 1024).toFixed(2)} KB`);
        console.log(`   Generado: ${pdfDoc.generatedAt.toISOString()}`);
      } else {
        console.log('   ❌ No hay PDF generado aún');
        console.log('      Se generará automáticamente al hacer clic en "Abrir PDF" en el CRM');
      }
    }

    // Contar mensajes
    const messageCount = await prisma.message.count({
      where: {
        OR: [
          { fromPhone: conversationId },
          { toPhone: conversationId },
        ],
      },
    });
    console.log(`\n💬 Total mensajes en conversación: ${messageCount}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

const conversationId = process.argv[2];

if (!conversationId) {
  console.log('Uso: npx ts-node scripts/check-conversation.ts <conversationId>');
  console.log('Ejemplo: npx ts-node scripts/check-conversation.ts 573204051366');
  process.exit(1);
}

checkConversation(conversationId);

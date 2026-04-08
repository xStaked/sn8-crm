const { test, expect } = require('@playwright/test');

const conversationId = '573001112233';
const token = 'test-token';

test('quote recovery smoke: missing draft -> create draft -> continue chat', async ({ page }) => {
  const state = {
    hasDraft: false,
    review: {
      conversationId,
      quoteDraftId: null,
      version: null,
      reviewStatus: null,
      lifecycleState: 'brief_complete',
      recovery: {
        action: 'create_draft',
        message: 'El brief está completo pero no hay draft activo. Genera una nueva cotización desde CRM.',
      },
      renderedQuote: null,
      draftSummary: null,
      ownerFeedbackSummary: null,
      approvedAt: null,
      deliveredToCustomerAt: null,
      commercialBrief: {
        customerName: 'ACME SAS',
        summary: 'Need CRM and onboarding automation',
        projectType: 'CRM',
        budget: 'USD 10k',
        urgency: 'High',
      },
      pdf: {
        available: false,
        fileName: null,
        generatedAt: null,
        sizeBytes: null,
        version: 0,
      },
      pricingRule: {
        id: null,
        version: null,
        category: null,
        complexity: null,
        integrationType: null,
      },
      complexityScore: null,
      confidence: null,
      ruleVersionUsed: null,
      estimatedMinAmount: null,
      estimatedTargetAmount: null,
      estimatedMaxAmount: null,
      pricingBreakdown: null,
      ownerAdjustments: [],
    },
  };

  const messages = [
    {
      id: 'msg_1',
      conversationId,
      direction: 'inbound',
      body: 'Necesito una cotizacion para CRM y automatizaciones',
      createdAt: '2026-04-08T20:24:30.000Z',
    },
  ];

  await page.addInitScript((accessToken) => {
    window.localStorage.setItem('sn8.access_token', accessToken);
  }, token);

  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET' && path === '/conversations') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: conversationId,
            contactName: conversationId,
            lastMessage: messages[messages.length - 1].body,
            lastMessageAt: messages[messages.length - 1].createdAt,
            unreadCount: 0,
            pendingQuote: state.hasDraft
              ? {
                  conversationId,
                  quoteDraftId: 'draft_3',
                  version: 3,
                  reviewStatus: 'pending_owner_review',
                }
              : null,
            conversationControl: {
              state: 'AI_SALES',
              control: 'ai_control',
              updatedAt: '2026-04-08T20:24:30.000Z',
              updatedBy: 'system',
            },
          },
        ]),
      });
    }

    if (method === 'GET' && path === '/conversations/' + conversationId + '/messages') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(messages),
      });
    }

    if (method === 'GET' && path === '/conversations/' + conversationId + '/quote-review') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.review),
      });
    }

    if (method === 'POST' && path === '/conversations/' + conversationId + '/quote-review/generate') {
      state.hasDraft = true;
      state.review = {
        ...state.review,
        quoteDraftId: 'draft_3',
        version: 3,
        reviewStatus: 'pending_owner_review',
        lifecycleState: 'quote_draft_ready',
        recovery: null,
        draftSummary: 'Cotización preliminar lista para revisión comercial.',
        renderedQuote: 'Alcance: CRM + automatizaciones\\nInversión estimada: COP 12,000,000',
        estimatedMinAmount: 9500000,
        estimatedTargetAmount: 12000000,
        estimatedMaxAmount: 14500000,
      };

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.review),
      });
    }

    if (method === 'POST' && path === '/conversations/' + conversationId + '/messages') {
      const payload = JSON.parse(request.postData() || '{}');
      const outbound = {
        id: 'msg_' + String(messages.length + 1),
        conversationId,
        direction: 'outbound',
        body: payload.body ?? null,
        createdAt: '2026-04-08T20:30:00.000Z',
      };
      messages.push(outbound);

      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(outbound),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/dashboard?conversation=' + conversationId);

  await expect(page.getByText('Sin draft activo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear draft' })).toBeVisible();

  await page.getByRole('button', { name: 'Crear draft' }).click();

  await expect(page.getByText('Revision comercial lista dentro del CRM')).toBeVisible();
  await expect(page.getByText('Draft v3')).toBeVisible();

  await page
    .getByPlaceholder("Type a message or use '/' for AI commands...")
    .fill('Mensaje de seguimiento comercial');
  await page.keyboard.press('Enter');

  await expect(page.getByText('Mensaje de seguimiento comercial')).toBeVisible();
});

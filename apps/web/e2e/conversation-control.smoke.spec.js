const { test, expect } = require('@playwright/test');

const conversationId = '573001112233';
const token = 'test-token';

test('conversation control smoke: transfer, resume, and persisted visual state', async ({ page }) => {
  const state = {
    control: 'ai_control',
    controlState: 'QUALIFYING',
    updatedAt: '2026-04-04T17:20:00.000Z',
    updatedBy: 'system',
  };

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
            lastMessage: 'Seguimos con la prueba local del CRM',
            lastMessageAt: '2026-04-04T17:25:00.000Z',
            unreadCount: 1,
            pendingQuote: null,
            conversationControl: {
              state: state.controlState,
              control: state.control,
              updatedAt: state.updatedAt,
              updatedBy: state.updatedBy,
            },
          },
        ]),
      });
    }

    if (method === 'GET' && path === '/conversations/' + conversationId + '/messages') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'msg_1',
            conversationId,
            direction: 'inbound',
            body: 'Seguimos con la prueba local del CRM',
            createdAt: '2026-04-04T17:24:30.000Z',
          },
        ]),
      });
    }

    if (method === 'GET' && path === '/conversations/' + conversationId + '/quote-review') {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'No actionable quote review found.' }),
      });
    }

    if (method === 'POST' && path === '/conversations/' + conversationId + '/control/human') {
      state.control = 'human_control';
      state.controlState = 'HUMAN_HANDOFF';
      state.updatedBy = 'owner@example.com';
      state.updatedAt = '2026-04-04T17:26:00.000Z';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversationId,
          state: state.controlState,
          control: state.control,
          updatedAt: state.updatedAt,
          updatedBy: state.updatedBy,
        }),
      });
    }

    if (method === 'POST' && path === '/conversations/' + conversationId + '/control/ai-resume') {
      state.control = 'pending_resume';
      state.controlState = 'HUMAN_HANDOFF';
      state.updatedBy = 'owner@example.com';
      state.updatedAt = '2026-04-04T17:27:00.000Z';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversationId,
          state: state.controlState,
          control: state.control,
          updatedAt: state.updatedAt,
          updatedBy: state.updatedBy,
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/dashboard?conversation=' + conversationId);

  await expect(page.getByText('AI managed').first()).toBeVisible();
  await page.getByRole('button', { name: 'Pasar a humano' }).click();

  await expect(page.getByText('Control transferido a humano.')).toBeVisible();
  await expect(page.getByText('Human takeover').first()).toBeVisible();
  await expect(page.locator('aside').getByText('Human takeover')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Human takeover').first()).toBeVisible();

  await page.getByRole('button', { name: 'Devolver a IA' }).click();
  await expect(
    page.getByText('Conversacion lista para que IA retome en el siguiente inbound.'),
  ).toBeVisible();
  await expect(page.getByText('Ready to resume AI').first()).toBeVisible();
  await expect(page.locator('aside').getByText('Ready to resume AI')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Ready to resume AI').first()).toBeVisible();
});

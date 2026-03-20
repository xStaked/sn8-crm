const { test, expect } = require('@playwright/test');

const userEmail = 'owner@example.com';
const userPassword = 'changeme';
const firstConversation = '573001234567';
const secondConversation = '573009876543';
const firstConversationMessage = 'Seguimos con la prueba local del CRM';
const secondConversationMessage =
  'Necesito una cotizacion para Instagram y sitio web';

test('phase 05-04 browser smoke flow', async ({ page, context }) => {
  await page.goto('http://localhost:3000/login');

  await expect(page.getByText('CRM', { exact: true })).toBeVisible();
  await page.getByLabel('Correo electronico').fill(userEmail);
  await page.getByLabel('Contrasena').fill(userPassword);
  await page.getByRole('button', { name: 'Iniciar sesion' }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByText('Inbox', { exact: true })).toBeVisible();
  await expect(page.getByText('Carlos Mendez')).toHaveCount(0);
  await expect(page.getByText('Ana Rodriguez')).toHaveCount(0);
  await expect(page.getByText(secondConversation)).toBeVisible();
  await expect(page.getByText(firstConversation)).toBeVisible();
  await expect(page.getByText(secondConversationMessage)).toBeVisible();

  await page
    .getByRole('button', { name: new RegExp(firstConversation) })
    .click();
  await expect(page.getByText(firstConversation, { exact: true })).toBeVisible();
  await expect(page.getByText(firstConversationMessage)).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesion' }).click();
  await page.waitForURL('**/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesion' })).toBeVisible();

  await page.getByLabel('Correo electronico').fill(userEmail);
  await page.getByLabel('Contrasena').fill(userPassword);
  await page.getByRole('button', { name: 'Iniciar sesion' }).click();
  await page.waitForURL('**/dashboard');

  await context.clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.goto('http://localhost:3000/dashboard');
  await page.waitForURL('**/login');
  await expect(page.getByRole('button', { name: 'Iniciar sesion' })).toBeVisible();
});

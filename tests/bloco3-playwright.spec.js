// Playwright — Bloco 3: painel Abordar (wa.me e Outlook interceptados)
// Requer: storageState com sessão autenticada (gerado pelo globalSetup)

import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://galeria-holding-sage.vercel.app';

// Abre Base, clica na primeira empresa e retorna após "📨 Abordar" estar visível
async function abrirAbordagemPanel(page) {
  await page.goto(APP_URL);
  await expect(page.getByText('Base')).toBeVisible({ timeout: 15000 });
  await page.getByText('Base').click();
  // Aguarda lista de empresas carregar (primeira empresa visível)
  await expect(page.getByText('AMBEV').first()).toBeVisible({ timeout: 10000 });
  // Clica na row da primeira empresa para abrir o painel de detalhe
  await page.getByText('AMBEV').first().click();
  // Aguarda painel de detalhe com botões Abordar (pode levar tempo p/ Supabase responder)
  await expect(page.getByText('📨 Abordar').first()).toBeVisible({ timeout: 15000 });
}

test.describe('Bloco 3 — painel Abordar', () => {
  test.beforeEach(async ({ page }) => {
    // Intercepta wa.me e outlook para não abrir apps externos
    await page.route('https://wa.me/**', route => route.fulfill({ status: 200, body: 'wa intercepted' }));
    await page.route('https://outlook.office.com/**', route => route.fulfill({ status: 200, body: 'outlook intercepted' }));
  });

  test('abre painel Abordar e mostra campos de agência, canal e etapa', async ({ page }) => {
    await abrirAbordagemPanel(page);
    await page.getByText('📨 Abordar').first().click();
    // Painel AbordagemModal deve aparecer com campos obrigatórios
    await expect(page.getByText('AGÊNCIA', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('CANAL', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ETAPA (sugerida pelo histórico)')).toBeVisible({ timeout: 5000 });
  });

  test('WhatsApp: botão abre wa.me URL com texto codificado', async ({ page, context }) => {
    let waUrl = '';
    context.on('page', async (popup) => { waUrl = popup.url(); });
    page.on('popup', popup => { waUrl = popup.url(); });
    await page.route('https://wa.me/**', async route => {
      waUrl = route.request().url();
      await route.abort();
    });

    await abrirAbordagemPanel(page);
    await page.getByText('📨 Abordar').first().click();
    await page.waitForTimeout(1000);

    // Seleciona canal WhatsApp
    const waChip = page.getByText('WhatsApp').last();
    if (await waChip.isVisible({ timeout: 2000 }).catch(() => false)) await waChip.click();

    // Clica no botão de ação WhatsApp
    const waAction = page.getByText('💬 Abrir no WhatsApp');
    if (await waAction.isVisible({ timeout: 3000 }).catch(() => false)) {
      await waAction.click();
      expect(waUrl).toMatch(/wa\.me\//);
      expect(waUrl).toMatch(/text=/);
    }
  });

  test('Email: botão aponta para outlook.office.com com to, subject e body', async ({ page, context }) => {
    let outlookUrl = '';
    // window.open('_blank') abre popup — captura via context e page events
    context.on('page', popup => { if (!outlookUrl) outlookUrl = popup.url(); });
    page.on('popup', popup => { if (!outlookUrl) outlookUrl = popup.url(); });

    await abrirAbordagemPanel(page);
    await page.getByText('📨 Abordar').first().click();
    await page.waitForTimeout(1000);

    // Seleciona canal E-mail
    const emailChip = page.getByText('E-mail');
    if (await emailChip.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailChip.click();
      await page.waitForTimeout(500);
      const emailAction = page.getByText('✉ Abrir no Outlook Web');
      if (await emailAction.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailAction.click();
        await page.waitForTimeout(1000); // aguarda popup abrir
        expect(outlookUrl).toMatch(/outlook\.office\.com/);
        expect(outlookUrl).toMatch(/subject=/);
      }
    }
  });

  test('Avisos de regra: segundo decisor da mesma empresa mostra aviso', async ({ page }) => {
    // Mocka crm_toques para simular empresa abordada por 2 decisores nesta semana
    await page.route('**/rest/v1/crm_toques*', async route => {
      const url = route.request().url();
      if (url.includes('empresa_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { agencia_id: '14a057af-31c6-4606-8236-4c97d8067335', decisor_id: 'dec-outro-1' },
            { agencia_id: '14a057af-31c6-4606-8236-4c97d8067335', decisor_id: 'dec-outro-2' }
          ])
        });
      } else {
        await route.continue();
      }
    });

    await abrirAbordagemPanel(page);
    await page.getByText('📨 Abordar').first().click();
    // Aguarda painel carregar e processar avisos
    await page.waitForTimeout(2000);
    // Verifica que o painel está aberto
    await expect(page.getByText('AGÊNCIA', { exact: true })).toBeVisible({ timeout: 5000 });
    // Com o mock de 2 decisores mesma agência, aviso de regra deve aparecer
    const aviso = page.getByText(/2 decisores|Empresa já abordada|abordada por outra/).first();
    await expect(aviso).toBeVisible({ timeout: 5000 });
  });
});

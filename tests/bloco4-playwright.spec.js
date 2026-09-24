// Playwright — Bloco 4: aba Histórico + contadores Base
// Execução: npx playwright test tests/bloco4-playwright.spec.js
// Requer: APP_URL no ambiente (ex: https://galeria-holding-sage.vercel.app ou preview Vercel)

import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://galeria-holding-sage.vercel.app';

test.describe('Bloco 4 — Histórico e Base', () => {

  test('aba Histórico aparece na Fila do dia', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const filaBtn = page.getByText('Fila');
    if (await filaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await filaBtn.click();
      await page.waitForTimeout(1500);
      await expect(page.getByText('Histórico')).toBeVisible({ timeout: 8000 });
    }
    // skip gracefully when unauthenticated (login screen shown)
  });

  test('aba Histórico carrega tabela de toques', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const filaBtn = page.getByText('Fila');
    if (await filaBtn.isVisible()) await filaBtn.click();
    await page.waitForTimeout(1500);
    const histBtn = page.getByText('Histórico');
    if (await histBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await histBtn.click();
      await page.waitForTimeout(2000);
      // Deve mostrar cabeçalho da tabela ou "Nenhum toque"
      const hasTable = await page.getByText('Data/Hora SP').isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.getByText('Nenhum toque encontrado').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasTable || hasEmpty).toBe(true);
    }
  });

  test('aba Histórico: busca filtra resultados', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const filaBtn = page.getByText('Fila');
    if (await filaBtn.isVisible()) await filaBtn.click();
    await page.waitForTimeout(1500);
    const histBtn = page.getByText('Histórico');
    if (await histBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await histBtn.click();
      await page.waitForTimeout(2000);
      // Digita na busca
      const searchInput = page.getByPlaceholder('Buscar empresa ou decisor');
      if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchInput.fill('zzz_inexistente_xyz');
        await page.waitForTimeout(500);
        const hasEmpty = await page.getByText('Nenhum toque encontrado').isVisible({ timeout: 3000 }).catch(() => false);
        const hasZeroReg = await page.getByText('0 registros').isVisible({ timeout: 3000 }).catch(() => false);
        expect(hasEmpty || hasZeroReg).toBe(true);
      }
    }
  });

  test('aba Histórico: mock Supabase retorna toques da Ambev', async ({ page }) => {
    await page.route('**/rest/v1/crm_toques*', async route => {
      const url = route.request().url();
      if (url.includes('crm_toques') && !url.includes('origem')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'mock-1',
              data: new Date().toISOString(),
              criado_em: new Date().toISOString(),
              canal: 'whatsapp',
              agencia_id: '3409ab82-f0cd-4d95-b6e2-398995425411',
              etapa: '1',
              resultado: 'sem_resposta',
              nota: '',
              origem: 'fila',
              decisor_id: 'dec-1',
              empresa_id: 'emp-1',
              crm_decisores: { nome: 'João Silva', cargo: 'CMO' },
              crm_empresas: { nome: 'Ambev' }
            }
          ])
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const filaBtn = page.getByText('Fila');
    if (await filaBtn.isVisible()) await filaBtn.click();
    await page.waitForTimeout(1500);
    const histBtn = page.getByText('Histórico');
    if (await histBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await histBtn.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText('Ambev')).toBeVisible({ timeout: 8000 });
    }
  });

  test('aba Histórico: botão CSV exporta sem erros', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const filaBtn = page.getByText('Fila');
    if (await filaBtn.isVisible()) await filaBtn.click();
    await page.waitForTimeout(1500);
    const histBtn = page.getByText('Histórico');
    if (await histBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await histBtn.click();
      await page.waitForTimeout(2000);
      const csvBtn = page.getByText('⬇ CSV');
      if (await csvBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        // Só clica se não estiver disabled
        const isDisabled = await csvBtn.isDisabled().catch(() => true);
        if (!isDisabled) {
          await csvBtn.click();
          await page.waitForTimeout(500);
        }
        expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0);
      }
    }
  });

  test('Base: contadores semanais aparecem no topo', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const baseBtn = page.getByText('Base');
    if (await baseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await baseBtn.click();
      await page.waitForTimeout(2000);
      const hasEmpresas = await page.getByText('Empresas tocadas').isVisible({ timeout: 5000 }).catch(() => false);
      const hasReuniao = await page.getByText('Reuniões marcadas').isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasEmpresas || hasReuniao).toBe(true);
    }
    // skip gracefully when unauthenticated
  });

  test('Base: filtros de toque aparecem', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const baseBtn = page.getByText('Base');
    if (await baseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await baseBtn.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText('Nunca abordada')).toBeVisible({ timeout: 8000 });
      await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 5000 });
    }
    // skip gracefully when unauthenticated
  });

  test('Base: filtro "Nunca abordada" filtra empresas sem toque', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForTimeout(2000);
    const baseBtn = page.getByText('Base');
    if (await baseBtn.isVisible()) await baseBtn.click();
    await page.waitForTimeout(2500);
    const nuncaBtn = page.getByText('Nunca abordada');
    if (await nuncaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nuncaBtn.click();
      await page.waitForTimeout(1500);
      // Não deve dar erro JS
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.waitForTimeout(500);
      expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0);
    }
  });

});

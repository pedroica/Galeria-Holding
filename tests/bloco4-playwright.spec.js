// Playwright — Bloco 4: aba Histórico + contadores Base
// Requer: storageState com sessão autenticada (gerado pelo globalSetup)

import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://galeria-holding-sage.vercel.app';

// Navega para Fila e abre aba Histórico
async function abrirHistorico(page) {
  await page.goto(APP_URL);
  await expect(page.getByText('Fila')).toBeVisible({ timeout: 15000 });
  await page.getByText('Fila').click();
  // Usa role=button para não pegar "Sem histórico no CRM..."
  const histBtn = page.getByRole('button', { name: 'Histórico' });
  await expect(histBtn).toBeVisible({ timeout: 8000 });
  return histBtn;
}

test.describe('Bloco 4 — Histórico e Base', () => {

  test('aba Histórico aparece na Fila do dia', async ({ page }) => {
    const histBtn = await abrirHistorico(page);
    await expect(histBtn).toBeVisible();
  });

  test('aba Histórico carrega tabela de toques', async ({ page }) => {
    const histBtn = await abrirHistorico(page);
    await histBtn.click();
    await page.waitForTimeout(2000);
    const hasTable = await page.getByText('Data/Hora SP').isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await page.getByText('Nenhum toque encontrado').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('aba Histórico: busca filtra resultados', async ({ page }) => {
    const histBtn = await abrirHistorico(page);
    await histBtn.click();
    await page.waitForTimeout(2000);
    const searchInput = page.getByPlaceholder('Buscar empresa ou decisor');
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('zzz_inexistente_xyz');
      await page.waitForTimeout(500);
      const hasEmpty = await page.getByText('Nenhum toque encontrado').isVisible({ timeout: 3000 }).catch(() => false);
      const hasZeroReg = await page.getByText('0 registros').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasEmpty || hasZeroReg).toBe(true);
    }
  });

  test('aba Histórico: mock Supabase retorna toques da Ambev', async ({ page }) => {
    await page.route('**/rest/v1/crm_toques*', async route => {
      const url = route.request().url();
      if (url.includes('crm_toques') && !url.includes('origem')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
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
          }])
        });
      } else {
        await route.continue();
      }
    });

    const histBtn = await abrirHistorico(page);
    await histBtn.click();
    await page.waitForTimeout(2000);
    await expect(page.getByText('Ambev')).toBeVisible({ timeout: 8000 });
  });

  test('aba Histórico: botão CSV exporta sem erros', async ({ page }) => {
    const histBtn = await abrirHistorico(page);
    await histBtn.click();
    await page.waitForTimeout(2000);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const csvBtn = page.getByRole('button', { name: '⬇ CSV' });
    if (await csvBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isDisabled = await csvBtn.isDisabled().catch(() => true);
      if (!isDisabled) {
        await csvBtn.click();
        await page.waitForTimeout(500);
      }
    }
    expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0);
  });

  test('Base: contadores semanais aparecem no topo', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByText('Base')).toBeVisible({ timeout: 15000 });
    await page.getByText('Base').click();
    await page.waitForTimeout(2000);
    await expect(page.getByText('Empresas tocadas esta semana')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Reuniões marcadas esta semana')).toBeVisible({ timeout: 5000 });
  });

  test('Base: filtros de toque aparecem', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByText('Base')).toBeVisible({ timeout: 15000 });
    await page.getByText('Base').click();
    await page.waitForTimeout(2000);
    // Usa role=button para filtrar chips de filtro (não as labels de cada empresa)
    await expect(page.getByRole('button', { name: 'Nunca abordada' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: 'Esta semana' })).toBeVisible({ timeout: 5000 });
  });

  test('Base: filtro "Nunca abordada" filtra empresas sem toque', async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.getByText('Base')).toBeVisible({ timeout: 15000 });
    await page.getByText('Base').click();
    await page.waitForTimeout(2000);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const nuncaBtn = page.getByRole('button', { name: 'Nunca abordada' });
    await expect(nuncaBtn).toBeVisible({ timeout: 8000 });
    await nuncaBtn.click();
    await page.waitForTimeout(1500);
    expect(errors.filter(e => e.includes('TypeError'))).toHaveLength(0);
    await expect(page.getByText('🎴 Empresas')).toBeVisible({ timeout: 5000 });
  });

});

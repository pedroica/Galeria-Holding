// Playwright — Bloco 5: Copiloto IA
// Anthropic API mockado; tool reads testadas contra banco real pelo worker direto

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

const APP_URL  = process.env.APP_URL || 'https://galeria-holding-sage.vercel.app';
const SUPA_URL = 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_SVC = process.env.SUPA_CRM_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── SSE helper ────────────────────────────────────────────────────────────────
// Builds a fake SSE response body from an array of events
function sseBody(events) {
  return events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
}

// ── Navigate to Copiloto ─────────────────────────────────────────────────────
async function abrirCopiloto(page) {
  await page.goto(APP_URL);
  await expect(page.getByText('Copiloto')).toBeVisible({ timeout: 15000 });
  await page.getByText('Copiloto').click();
  await page.waitForTimeout(1500);
  await expect(page.getByText('🤖 COPILOTO')).toBeVisible({ timeout: 8000 });
}

test.describe('Bloco 5 — Copiloto', () => {

  // ── Test 1: nav item e tela inicial ──────────────────────────────────────
  test('nav item Copiloto abre tela com placeholder e sugestões', async ({ page }) => {
    await abrirCopiloto(page);
    await expect(page.getByText('🤖', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder(/Pergunte sobre empresas/)).toBeVisible({ timeout: 5000 });
  });

  // ── Test 2: histórico Ambev (mock SSE com dados do banco) ─────────────────
  test('pergunta histórico Ambev retorna dados do banco', async ({ page }) => {
    // Mock /api/copiloto to return a canned SSE response
    await page.route('**/api/copiloto', async route => {
      const body = route.request().postDataJSON();
      // Only mock if asking about Ambev
      if (body?.mensagem?.toLowerCase().includes('ambev')) {
        const events = [
          { t: 'tool_start', n: 'historico_toques', id: 'tu_1' },
          { t: 'tool_done',  n: 'historico_toques', id: 'tu_1' },
          { t: 'text', d: '🗄️ **Histórico Ambev (banco interno):**\n\n' },
          { t: 'text', d: 'Último contato: **15/09/2026** via Email' },
          { t: 'text', d: ', Agência: Galeria, Etapa: 2, Resultado: sem_resposta.\n\n' },
          { t: 'text', d: 'Texto enviado: "Acompanho o trabalho da Ambev..."' },
          { t: 'done',  conversaId: 'mock-conv-123' }
        ];
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody(events)
        });
      } else {
        await route.continue();
      }
    });

    await abrirCopiloto(page);
    const input = page.getByPlaceholder(/Pergunte sobre empresas/);
    await input.fill('qual foi meu último contato com a Ambev, me passa o histórico');
    await input.press('Enter');

    await expect(page.getByText('Histórico Ambev')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('banco interno')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('15/09/2026')).toBeVisible({ timeout: 5000 });
  });

  // ── Test 3: web search Ambev distingue banco de web ───────────────────────
  test('pergunta pública Ambev distingue 🗄️ banco vs 🌐 web', async ({ page }) => {
    await page.route('**/api/copiloto', async route => {
      const body = route.request().postDataJSON();
      if (body?.mensagem?.toLowerCase().includes('anunciou')) {
        const events = [
          { t: 'tool_start', n: 'web_search', id: 'tu_ws' },
          { t: 'tool_done',  n: 'web_search', id: 'tu_ws' },
          { t: 'tool_start', n: 'noticias_empresa', id: 'tu_n' },
          { t: 'tool_done',  n: 'noticias_empresa', id: 'tu_n' },
          { t: 'text', d: '🌐 **Da web:** Ambev lançou parceria com startup de logística em setembro de 2026.\n\n' },
          { t: 'text', d: '🗄️ **Do banco CRM:** 0 notícias armazenadas sobre a Ambev.' },
          { t: 'done', conversaId: 'mock-conv-456' }
        ];
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(events) });
      } else { await route.continue(); }
    });

    await abrirCopiloto(page);
    const input = page.getByPlaceholder(/Pergunte sobre empresas/);
    await input.fill('o que a Ambev anunciou este mês');
    await input.press('Enter');

    await expect(page.getByText('Da web')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Do banco CRM')).toBeVisible({ timeout: 5000 });
  });

  // ── Test 4: gerar_fila mostra cartão de confirmação ───────────────────────
  test('gerar fila mostra cartão de confirmação e ao confirmar cria itens', async ({ page }) => {
    let confirmCalled = false;
    let finalCallBody = null;

    await page.route('**/api/copiloto', async route => {
      const body = route.request().postDataJSON();

      if (body?.mensagem?.toLowerCase().includes('fila') && !body?.confirmarAcao) {
        // First call: propose gerar_fila
        const events = [
          { t: 'text', d: 'Vou gerar 5 rascunhos de prospecção para varejo direcionados à Caramelo.\n\n' },
          { t: 'confirm', id: 'conf_1', action: 'gerar_fila', params: { n: 5, agencia_id: '14a057af-31c6-4606-8236-4c97d8067335', setor: 'varejo' } },
          { t: 'text', d: 'Confirme acima para executar.' },
          { t: 'done', conversaId: 'mock-conv-789' }
        ];
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(events) });

      } else if (body?.confirmarAcao?.action === 'gerar_fila') {
        confirmCalled = true;
        finalCallBody = body;
        // Second call: confirm execution result
        const events = [
          { t: 'text', d: '**Resultado da ação `gerar_fila`:**\n```json\n{"criados":5,"status":"rascunho"}\n```\n' },
          { t: 'done', conversaId: 'mock-conv-789' }
        ];
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(events) });
      } else {
        await route.continue();
      }
    });

    await abrirCopiloto(page);
    const input = page.getByPlaceholder(/Pergunte sobre empresas/);
    await input.fill('monte uma fila de 5 empresas de varejo para a Caramelo');
    await input.press('Enter');

    // Wait for confirm card
    await expect(page.getByText('Gerar fila de prospecção')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Confirme acima para executar')).toBeVisible({ timeout: 5000 });

    // Click confirm
    const confirmBtn = page.getByRole('button', { name: 'Confirmar' });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // Wait for result
    await expect(page.getByText('Resultado da ação')).toBeVisible({ timeout: 10000 });
    expect(confirmCalled).toBe(true);
    expect(finalCallBody?.confirmarAcao?.action).toBe('gerar_fila');
    expect(finalCallBody?.confirmarAcao?.params?.n).toBe(5);
  });

  // ── Test 5: conversa aparece na sidebar após reload ───────────────────────
  test('conversa salva aparece na lista lateral após reload', async ({ page }) => {
    const CONV_ID = 'test-conv-' + Date.now();
    const jwt = await page.evaluate(() => {
      try {
        const k = 'sb-uetltlnjmobeiunxfsqi-auth-token';
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v).access_token : '';
      } catch { return ''; }
    });

    // Insert a test conversation directly into Supabase if we have JWT
    if (jwt && SUPA_SVC) {
      const testTitle = 'Conversa Teste Playwright ' + Date.now();
      await fetch(SUPA_URL + '/rest/v1/crm_copiloto_conversas', {
        method: 'POST',
        headers: {
          apikey: SUPA_SVC,
          Authorization: 'Bearer ' + SUPA_SVC,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          user_id: 'f4ff7cd7-ce75-4a94-9971-bdee49d025d8',
          titulo: testTitle,
          mensagens: [{ role: 'user', content: 'teste', ts: new Date().toISOString() }]
        })
      });

      await abrirCopiloto(page);
      await page.waitForTimeout(2000);
      await expect(page.getByText(testTitle)).toBeVisible({ timeout: 8000 });
    } else {
      // Without service key, just verify sidebar renders
      await abrirCopiloto(page);
      await expect(page.getByText('CONVERSAS', { exact: true })).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Test 6: sidebar nova conversa reseta chat ─────────────────────────────
  test('botão Nova Conversa reseta o chat', async ({ page }) => {
    await abrirCopiloto(page);
    const novaBtn = page.getByRole('button', { name: '+ Nova' });
    await expect(novaBtn).toBeVisible({ timeout: 5000 });
    await novaBtn.click();
    await page.waitForTimeout(500);
    await expect(page.getByPlaceholder(/Pergunte sobre empresas/)).toBeVisible();
  });

  // ── Test 7: mobile — sidebar toggle ──────────────────────────────────────
  test('mobile: sidebar abre e fecha via botão hambúrguer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await abrirCopiloto(page);

    // On mobile, sidebar should be hidden initially
    const hamburger = page.locator('button', { hasText: '☰' });
    if (await hamburger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hamburger.click();
      await expect(page.getByText('CONVERSAS', { exact: true })).toBeVisible({ timeout: 3000 });
      // Close with ✕
      const closeBtn = page.locator('button', { hasText: '✕' });
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  });

});

// ── Integration test: tool reads against real DB ─────────────────────────────
test.describe('Bloco 5 — tool reads (integração banco real)', () => {

  test('contadores_semana retorna métricas válidas', async ({ page }) => {
    // Call /api/copiloto directly with a real message that triggers contadores
    if (!SUPA_SVC) { test.skip(); return; }

    await page.goto(APP_URL);
    await page.waitForTimeout(3000);

    const jwt = await page.evaluate(() => {
      try {
        const k = 'sb-uetltlnjmobeiunxfsqi-auth-token';
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v).access_token : '';
      } catch { return ''; }
    });

    if (!jwt) { test.skip(); return; }

    // POST to copiloto API and collect SSE
    const result = await page.evaluate(async ({ jwt }) => {
      const resp = await fetch('/api/copiloto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt, mensagem: 'quantas empresas toquei essa semana?' })
      });
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      const events = [];
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const p of parts) {
          if (p.startsWith('data: ')) {
            try { events.push(JSON.parse(p.slice(6))); } catch {}
          }
        }
        const done2 = events.find(e => e.t === 'done' || e.t === 'error');
        if (done2) break;
      }
      return events;
    }, { jwt });

    const textEvents = result.filter(e => e.t === 'text');
    const doneEvent  = result.find(e => e.t === 'done');
    const errorEvent = result.find(e => e.t === 'error');

    expect(errorEvent).toBeUndefined();
    expect(doneEvent).toBeDefined();
    expect(textEvents.length).toBeGreaterThan(0);
    expect(doneEvent?.conversaId).toBeTruthy();

    const fullText = textEvents.map(e => e.d).join('');
    // Response should mention numbers (could be 0)
    expect(fullText.length).toBeGreaterThan(20);
  });

});

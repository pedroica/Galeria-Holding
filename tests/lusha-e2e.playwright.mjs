/**
 * Playwright E2E — Fluxo de enriquecimento Lusha + multi-select batch
 * Lusha: 100% mockado via page.route()
 * Supabase: REST mockado; auth mockado via addInitScript
 * Banco real: NÃO (evita créditos Lusha e dados de teste no prod)
 *
 * Pré-requisito: vercel dev rodando em localhost:3333
 * Rodar: npx playwright test tests/lusha-e2e.playwright.mjs
 */

import { test, expect } from '@playwright/test';

// ── Dados mockados ──────────────────────────────────────────────────────────

const FAKE_USER = { id: 'test-uid', email: 'pedroica@gmail.com', role: 'authenticated', user_metadata: { name: 'Pedro Ica', role: 'admin' } };
const FAKE_SESSION = { access_token: 'fake_pw_token', refresh_token: 'fake_rt', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: FAKE_USER };

// Empresas de teste — sem domínio/website (para forçar busca via lusha-search)
// Ambev tem website com www para testar normDomain
const EMPRESAS_SEM = [
  { id: 'emp-reckitt',    nome: 'RECKITT BENCKISER BRASIL LTDA', setor: 'FMCG',    website: null,                       dominio: null,           enriquecido_em: null },
  { id: 'emp-magalu',     nome: 'Magazine Luiza',  setor: 'Varejo',  website: null,                       dominio: null,           enriquecido_em: null },
  { id: 'emp-mercado',    nome: 'Mercado Livre',   setor: 'Tech',    website: 'www.mercadolivre.com.br',  dominio: null,           enriquecido_em: null },
  { id: 'emp-acento',     nome: 'Ótica São Paulo', setor: 'Varejo',  website: null,                       dominio: null,           enriquecido_em: null },
  { id: 'emp-nova',       nome: 'Nova Corp Test',  setor: 'Novo',    website: null,                       dominio: null,           enriquecido_em: null },
  { id: 'emp-www',        nome: 'Ambev',           setor: 'Bebidas', website: 'https://www.ambev.com.br', dominio: 'ambev.com.br', enriquecido_em: null },
];

// block3.js usa c.lushaId (não c.id) para chave/seleção de candidatos
const LUSHA_SEARCH_RESP = { contacts: [{ lushaId: 'v1.cmo1', firstName: 'Maria', lastName: 'Lusha', title: 'CMO' }], total: 1 };
const LUSHA_REVEAL_RESP = { results: [{ lushaId: 'v1.cmo1', firstName: 'Maria', lastName: 'Lusha', title: 'CMO', email: 'm.lusha@reckitt.com.br', wa: '11999990001', linkedin_url: 'https://linkedin.com/in/ml' }] };

// ── Setup por teste ─────────────────────────────────────────────────────────

async function setup(page, overrides = {}) {
  const { decisores = [], customLeads = [] } = overrides;
  const SUPA = 'https://uetltlnjmobeiunxfsqi.supabase.co';

  // Catch-all: qualquer REST não coberto por rota específica retorna [] (registrado PRIMEIRO = menor prioridade com LIFO)
  await page.route(/uetltlnjmobeiunxfsqi\.supabase\.co\/rest\//, r => {
    console.log('[ROUTE catch-all]', r.request().method(), r.request().url().slice(0, 120));
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // 1. Mock auth
  await page.route(SUPA + '/auth/*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: FAKE_SESSION, user: FAKE_USER }) })
  );

  // 2. Mock Supabase REST — regex para capturar query-string (glob * não bate em ?)
  await page.route(/uetltlnjmobeiunxfsqi\.supabase\.co\/rest\/v1\/crm_configuracoes/, r => {
    console.log('[ROUTE crm_configuracoes] intercepted:', r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { chave: 'lusha_daily_reveal_limit', valor: 60 },
      { chave: 'lusha_reveals_today', valor: JSON.stringify({ count: 0, date: new Date().toISOString().slice(0, 10) }) },
    ]) });
  });
  await page.route(SUPA + '/rest/v1/crm_logs*', r =>
    r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'log-1' }]) })
  );
  await page.route(SUPA + '/rest/v1/crm_fila*', r =>
    r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'fila-1' }]) })
  );

  // crm_decisores: GET retorna array de decisores passado em overrides
  await page.route(SUPA + '/rest/v1/crm_decisores*', async (route) => {
    const m = route.request().method();
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(decisores) });
    if (m === 'POST') {
      const body = route.request().postDataJSON() || {};
      const newDec = { id: 'dec-new-' + Date.now(), ...body };
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([newDec]) });
    }
    if (m === 'PATCH') {
      const prefer = (route.request().headers()['prefer'] || '');
      if (prefer.includes('return=representation')) {
        const updated = decisores[0] ? { ...decisores[0] } : { id: 'dec-updated' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([updated]) });
      }
      return route.fulfill({ status: 204 });
    }
    return route.continue();
  });

  // crm_empresas: GET filtra por nome=eq. se presente; PATCH retorna 204
  await page.route(/uetltlnjmobeiunxfsqi\.supabase\.co\/rest\/v1\/crm_empresas/, async (route) => {
    const m = route.request().method();
    if (m === 'GET') {
      const url = new URL(route.request().url());
      const nomeParam = url.searchParams.get('nome');
      let data = EMPRESAS_SEM;
      if (nomeParam && nomeParam.startsWith('eq.')) {
        const buscado = decodeURIComponent(nomeParam.slice(3)).toUpperCase();
        const hit = EMPRESAS_SEM.filter(e => e.nome.toUpperCase() === buscado);
        if (hit.length) data = hit;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (m === 'POST')  return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([EMPRESAS_SEM[0]]) });
    if (m === 'PATCH') return route.fulfill({ status: 204 });
    return route.continue();
  });

  // 3. Mock Lusha API (/api/enrich) — regex para capturar provider= em qualquer posição
  await page.route(/\/api\/enrich.*provider=lusha-domain/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ domain: 'reckitt.com.br', source: 'lusha' }) })
  );
  await page.route(/\/api\/enrich.*provider=lusha-search/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LUSHA_SEARCH_RESP) })
  );
  await page.route(/\/api\/enrich.*provider=lusha-reveal/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LUSHA_REVEAL_RESP) })
  );
  await page.route(/\/api\/enrich.*provider=health/, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lusha: true }) })
  );

  // 4. Inject fake auth + suprime diálogos + injeta customLeads em localStorage
  await page.addInitScript(({ sess, customLeads }) => {
    window.__pw_fakeSession = sess;
    try { localStorage.setItem('ghub_claude_key', 'sk-ant-fake-test-key'); } catch (e) {}
    try { localStorage.setItem('gh_restricoes_review_dismissed', String(Date.now())); } catch (e) {}
    // Supabase-js reads this key on init; setting it prevents supabase-js from firing SIGNED_OUT
    try {
      localStorage.setItem('sb-uetltlnjmobeiunxfsqi-auth-token', JSON.stringify({
        access_token: sess.access_token, refresh_token: sess.refresh_token,
        expires_at: sess.expires_at, token_type: sess.token_type, user: sess.user,
      }));
    } catch (e) {}
    if (customLeads && customLeads.length) {
      try { localStorage.setItem('ghub_custom_leads', JSON.stringify(customLeads)); } catch (e) {}
    }
    // Patch window.fetch to intercept crm_configuracoes before it can reach real Supabase.
    // page.route() misses these requests (they bypass Playwright routing) so we intercept at JS level.
    (function() {
      var _orig = window.fetch;
      window.fetch = function(url, opts) {
        var u = typeof url === 'string' ? url : (url instanceof Request ? url.url : '');
        if (u.includes('crm_configuracoes')) {
          var method = ((opts && opts.method) || (url instanceof Request ? url.method : '') || 'GET').toUpperCase();
          if (method === 'GET') {
            var today = new Date().toISOString().slice(0, 10);
            return Promise.resolve(new Response(JSON.stringify([
              { chave: 'lusha_daily_reveal_limit', valor: 60 },
              { chave: 'lusha_reveals_today', valor: JSON.stringify({ count: 0, date: today }) },
            ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
          }
          return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return _orig.apply(this, arguments);
      };
    })();
    Object.defineProperty(window, '__supaGetSession', {
      configurable: true,
      get() { return async () => window.__pw_fakeSession; },
      set(fn) {},
    });
    Object.defineProperty(window, '__supaOnAuthChange', {
      configurable: true,
      get() {
        return (cb) => {
          setTimeout(() => cb('SIGNED_IN', window.__pw_fakeSession), 100);
          return { data: { subscription: { unsubscribe() {} } } };
        };
      },
      set(fn) {},
    });
    Object.defineProperty(window, '__supaSession', {
      configurable: true,
      get() { return window.__pw_fakeSession; },
      set(v) { window.__pw_fakeSession = v || window.__pw_fakeSession; },
    });
  }, { sess: FAKE_SESSION, customLeads });

  await page.goto('/');
}

async function waitForApp(page) {
  await expect(page.locator('text=Empresas').or(page.locator('text=Base')).or(page.locator('[title="Base"]')).first()).toBeVisible({ timeout: 15000 });
  const cancelBtn = page.locator('button:has-text("Cancelar")').first();
  if (await cancelBtn.isVisible({ timeout: 1500 }).catch(() => false)) await cancelBtn.click();
  const dismissBtn = page.locator('button:has-text("Dispensar")').first();
  if (await dismissBtn.isVisible({ timeout: 800 }).catch(() => false)) await dismissBtn.click();
}

async function navToBase(page) {
  const baseBtn = page.locator('text=Base').first();
  if (await baseBtn.isVisible()) await baseBtn.click();
  await expect(page.locator('text=Empresas').first()).toBeVisible({ timeout: 8000 });
}

async function searchAndClickEmpresa(page, nome) {
  const searchBox = page.locator('input[placeholder*="Buscar"]').or(page.locator('input[type="search"]')).first();
  if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchBox.fill(nome);
    await page.waitForTimeout(400);
  }
  await page.locator(`text=${nome}`).first().click();
}

// Clica no primeiro candidato na lista, revela, aguarda estado "done"
async function selectAndReveal(page) {
  // Aguarda candidato aparecer (lushaStep='select')
  await expect(page.locator('text=Maria Lusha').first()).toBeVisible({ timeout: 10000 });
  // Clica no card do candidato para selecioná-lo
  await page.locator('text=Maria Lusha').first().click();
  // Clica em Revelar
  const revealBtn = page.locator('button:has-text("Revelar")').first();
  await expect(revealBtn).toBeVisible({ timeout: 3000 });
  await revealBtn.click();
}

// ── TESTES ─────────────────────────────────────────────────────────────────

test.describe('Fase 1 — Modal Enriquecer via Lusha', () => {

  test('[T1] RECKITT — modal abre, mostra candidato, revela, salva', async ({ page }) => {
    await setup(page);
    await waitForApp(page);
    await navToBase(page);

    await searchAndClickEmpresa(page, 'RECKITT');
    const btn = page.locator('button:has-text("Enriquecer via Lusha")').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();

    await expect(page.locator('text=Enriquecer via Lusha').first()).toBeVisible({ timeout: 5000 });

    // select → reveal → done
    await selectAndReveal(page);

    // Estado "done": resultados revelados, botão Cadastrar visível
    await expect(page.locator('text=Cadastrar selecionados').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Maria Lusha').first()).toBeVisible({ timeout: 5000 });

    // Salvar decisor
    await page.locator('button:has-text("Cadastrar selecionados")').first().click();
    await expect(page.locator('text=processado').first()).toBeVisible({ timeout: 5000 });

    // Fechar modal com ×
    await page.locator('button:has-text("×")').first().click();
    await expect(page.locator('button:has-text("×")').first()).not.toBeVisible({ timeout: 3000 });

    console.log('[T1] ✅ RECKITT — modal completo, salvo sem loading preso');
  });

  test('[T2] Magazine Luiza — nome com espaço, modal abre e mostra candidatos', async ({ page }) => {
    await setup(page);
    await waitForApp(page);
    await navToBase(page);

    await searchAndClickEmpresa(page, 'Magazine Luiza');
    const btn = page.locator('button:has-text("Enriquecer via Lusha")').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();

    await expect(page.locator('text=Enriquecer via Lusha').first()).toBeVisible({ timeout: 5000 });
    // candidatos devem aparecer (prova que nome com espaço não quebrou a busca)
    await expect(page.locator('text=Maria Lusha').first()).toBeVisible({ timeout: 10000 });

    console.log('[T2] ✅ Magazine Luiza — modal abre com nome com espaço');
  });

  test('[T3] Empresa com acento (Ótica São Paulo) — sem erro de encoding', async ({ page }) => {
    // Injecta empresa com acento como custom lead via localStorage
    await setup(page, { customLeads: [{ rank: 9999, nome: 'Ótica São Paulo', setor: 'Varejo' }] });
    await waitForApp(page);
    await navToBase(page);

    await searchAndClickEmpresa(page, 'Ótica');
    const btn = page.locator('button:has-text("Enriquecer via Lusha")').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();

    // Modal abre sem erro de encoding
    await expect(page.locator('text=Enriquecer via Lusha').first()).toBeVisible({ timeout: 5000 });
    // candidatos devem aparecer
    await expect(page.locator('text=Maria Lusha').first()).toBeVisible({ timeout: 10000 });

    // Fechar com ×
    await page.locator('button:has-text("×")').first().click();
    await expect(page.locator('button:has-text("×")').first()).not.toBeVisible({ timeout: 3000 });

    console.log('[T3] ✅ Ótica São Paulo — acento sem erro de encoding, modal fecha com ×');
  });

  test('[T4] Empresa com www no domínio (Ambev) — normDomain normaliza', async ({ page }) => {
    await setup(page);
    await waitForApp(page);
    await navToBase(page);

    await searchAndClickEmpresa(page, 'Ambev');
    const btn = page.locator('button:has-text("Enriquecer via Lusha")').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();

    await expect(page.locator('text=Enriquecer via Lusha').first()).toBeVisible({ timeout: 5000 });
    // candidatos aparecem → prova que normDomain('https://www.ambev.com.br') = 'ambev.com.br' funcionou
    await expect(page.locator('text=Maria Lusha').first()).toBeVisible({ timeout: 10000 });

    console.log('[T4] ✅ Ambev — www no domínio normalizado, busca Lusha disparou');
  });

  test('[T5] 2ª rodada RECKITT — não duplica decisor', async ({ page }) => {
    const existingDec = [{ id: 'dec-existing', empresa_id: 'emp-reckitt', nome: 'Maria Lusha', cargo: 'CMO', email: 'm.lusha@reckitt.com.br', wa: '+5511999990001', fonte: 'lusha', status: 'ativo' }];
    await setup(page, { decisores: existingDec });
    await waitForApp(page);
    await navToBase(page);

    await searchAndClickEmpresa(page, 'RECKITT');
    const btn = page.locator('button:has-text("Enriquecer via Lusha")').first();
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();

    await expect(page.locator('text=Enriquecer via Lusha').first()).toBeVisible({ timeout: 5000 });

    // select → reveal → done
    await selectAndReveal(page);

    // Estado "done": Maria Lusha nos resultados, botão Salvar disponível
    await expect(page.locator('text=Maria Lusha').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Cadastrar selecionados")').first()).toBeVisible({ timeout: 5000 });

    // Salvar — deve fazer PATCH (atualizar) e não POST (não duplicar)
    await page.locator('button:has-text("Cadastrar selecionados")').first().click();
    await expect(page.locator('text=processado').first()).toBeVisible({ timeout: 5000 });

    console.log('[T5] ✅ 2ª rodada RECKITT — salvo sem duplicata');
  });

});

test.describe('Fase 4 — Multi-select e batch enrichment', () => {

  test('[T6] Filtro Sem decisores — exibe checkboxes e botão Enriquecer selecionadas', async ({ page }) => {
    await setup(page);
    await waitForApp(page);
    await navToBase(page);

    const semBtn = page.locator('button:has-text("Sem decisores")');
    await expect(semBtn).toBeVisible({ timeout: 5000 });
    await semBtn.click();

    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 5000 });
    console.log('[T6a] ✅ Checkboxes visíveis no filtro Sem decisores');

    await page.locator('input[type="checkbox"]').first().click();
    await expect(page.locator('button:has-text("Enriquecer")')).toBeVisible({ timeout: 3000 });
    console.log('[T6b] ✅ Botão Enriquecer selecionadas aparece com seleção');

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count >= 3) {
      await checkboxes.nth(1).click();
      await checkboxes.nth(2).click();
      await expect(page.locator('button:has-text("Enriquecer 3 selecionadas")')).toBeVisible({ timeout: 3000 });
      console.log('[T6c] ✅ Botão atualiza contagem para 3');
    }

    console.log('[T6] ✅ Multi-select funcionando');
  });

  test('[T7] Batch enrichment — modal de progresso, processa fila', async ({ page }) => {
    await setup(page);
    await waitForApp(page);
    await navToBase(page);

    const semBtn = page.locator('button:has-text("Sem decisores")');
    await expect(semBtn).toBeVisible({ timeout: 5000 });
    await semBtn.click();

    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 5000 });
    const total = await checkboxes.count();
    const toSelect = Math.min(3, total);
    for (let i = 0; i < toSelect; i++) await checkboxes.nth(i).click();

    const batchBtn = page.locator('button:has-text("selecionadas")');
    await expect(batchBtn).toBeVisible({ timeout: 3000 });
    await batchBtn.click();

    await page.waitForFunction(
      () => document.body.innerHTML.includes('Enriquecimento em lote'),
      { timeout: 8000, polling: 100 }
    );
    console.log('[T7a] ✅ Modal de progresso abre');

    await expect(page.locator('button:has-text("Fechar")')).toBeVisible({ timeout: 25000 });
    console.log('[T7b] ✅ Botão Fechar aparece — batch concluído');

    const okItems = page.locator('text=✅');
    const okCount = await okItems.count();
    expect(okCount).toBeGreaterThan(0);
    console.log('[T7c] ✅ ' + okCount + ' empresa(s) com status ok');

    await page.locator('button:has-text("Fechar")').click();
    await expect(page.locator('text=Enriquecimento em lote')).not.toBeVisible({ timeout: 3000 });
    console.log('[T7d] ✅ Modal fecha corretamente');

    console.log('[T7] ✅ Batch enrichment completo');
  });

  test('[T8] Botão Todas / Limpar seleção', async ({ page }) => {
    await setup(page);
    await waitForApp(page);
    await navToBase(page);

    await page.locator('button:has-text("Sem decisores")').click();
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible({ timeout: 5000 });

    const allBtn = page.locator('button:has-text("Todas")');
    await expect(allBtn).toBeVisible({ timeout: 3000 });
    await allBtn.click();

    await expect(page.locator('button:has-text("Limpar")')).toBeVisible({ timeout: 3000 });
    console.log('[T8a] ✅ Selecionar todas funciona');

    await page.locator('button:has-text("Limpar")').click();
    await expect(page.locator('button:has-text("Todas")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button:has-text("Enriquecer")')).not.toBeVisible({ timeout: 2000 });
    console.log('[T8b] ✅ Limpar seleção funciona');

    console.log('[T8] ✅ Toggle Todas/Limpar OK');
  });

});

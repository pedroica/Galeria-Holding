// Playwright global setup — injeta sessão Supabase autenticada
// Salva storageState em tests/.auth-state.json para todos os specs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';

const SUPA_URL  = 'https://uetltlnjmobeiunxfsqi.supabase.co';
const SUPA_ANON = 'sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r';
const APP_URL   = process.env.APP_URL || 'https://galeria-holding-sage.vercel.app';

export default async function globalSetup() {
  const email = process.env.PLAYWRIGHT_TEST_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD;
  if (!email || !password) {
    console.warn('[globalSetup] Sem PLAYWRIGHT_TEST_EMAIL/PASSWORD — testes rodarão sem auth');
    return;
  }

  // Autentica via Supabase password auth
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPA_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`[globalSetup] Supabase auth falhou: ${res.status} ${txt}`);
  }

  const session = await res.json();

  // Monta storageState no formato que o supabase-js v2 espera
  const storageKey = `sb-uetltlnjmobeiunxfsqi-auth-token`;
  const storageValue = JSON.stringify(session);

  const storageState = {
    cookies: [],
    origins: [{
      origin: new URL(APP_URL).origin,
      localStorage: [
        { name: storageKey, value: storageValue },
        // Suprime o modal de Config que abre automaticamente na 1ª vez (800ms após load)
        { name: 'ghub_cfg_shown', value: 'true' },
        // Placeholder para getClaudeKey() retornar truthy e não exibir warning ⚠
        { name: 'ghub_claude_key', value: 'playwright-test-placeholder' }
      ]
    }]
  };

  writeFileSync('tests/.auth-state.json', JSON.stringify(storageState, null, 2));
  console.log(`[globalSetup] Sessão gravada para ${email}`);

  // Verifica que a sessão abre a app logada
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: 'tests/.auth-state.json' });
  const page = await ctx.newPage();
  await page.goto(APP_URL);
  await page.waitForTimeout(8000);
  const text = await page.textContent('body').catch(() => '');
  if (text.includes('Fila') || text.includes('Base') || text.includes('GALERIA HOLDING')) {
    console.log('[globalSetup] App carregou logada ✓');
  } else {
    console.warn('[globalSetup] App pode não ter carregado logada — verifique');
  }
  await browser.close();
}

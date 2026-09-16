/* ═══════════════════════════════════════════════════════════════
   GH-STORE v3 — Camada de dados Supabase com bridge localStorage
   A2: kanbanLoadAll (anon read), kanbanUpsertCard, kanbanBatchUpsert
   Tabelas reais (central-galeria):
     crm_shared              — key TEXT PK, value JSONB
     crm_personal            — (user_id, key) PK, value JSONB
     crm_fila                — id, decisor_id, empresa_id, canal,
                               etapa_cadencia, produto, tema, assunto,
                               corpo, contexto_para_aprovacao, thread_ref,
                               status ('rascunho'|'pendente'|'aprovado'|'enviado'),
                               gerado_em, aprovado_em, enviado_em
     crm_kanban              — id INT, tab, col, nome, produto, tag,
                               nota, valor, responsavel, ordem,
                               raw_legacy, atualizado_em, empresa_id UUID
     crm_empresa_agencia_estrelas — empresa_id UUID, agencia_id UUID,
                               estrelas_calculadas, estrelas_manual, motivo
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var SUPA_URL  = "https://uetltlnjmobeiunxfsqi.supabase.co";
  var SUPA_ANON = "sb_publishable_9-32UcxDIE6Sh0feuXepXA_KLO83i0r";

  // UUIDs reais de crm_agencias
  var AGENCIAS = {
    '404':         '14a057af-31c6-4606-8236-4c97d8067335',
    'agente':      '910f125d-82f7-4fbc-889d-2eb9b33d8198',
    'atelie':      '32e8bd8a-d698-4781-b9f4-7b9855132942',
    'catalyst':    '74886b76-2650-41e1-8d46-3c742681fadd',
    'cccaramelo':  'e8d734ba-b3e9-425b-942e-b8b56c98f56b',
    'frame':       'e26e3106-33e8-43de-95c5-546477573186',
    'gaia':        'a8aecdac-1001-4643-bcd4-e818307b6d92',
    'galeria':     '960142b5-a688-41f8-8719-d516eeb843c6',
    'gux':         'ac8b92de-ab48-4153-bf18-c23b5ea19bfe',
    'mantiqueira': '1a67ab05-e42e-4975-be11-b6bf7f23ce03',
    'mila':        'b0473d79-afd9-404e-8784-04b4556a5a2c',
    'studioga':    'd1d6bc56-ee70-4b5c-bb2e-3a7e428ea70f',
    'vitrine':     '2bb87ce9-b175-43d0-9213-1e1021661e54'
  };

  window.__agencias = AGENCIAS;

  var supa = (typeof supabase !== 'undefined' && supabase.createClient)
    ? supabase.createClient(SUPA_URL, SUPA_ANON)
    : null;

  window.__supaClient = supa;

  /* ── Auth helpers ──────────────────────────────────────────── */
  async function getSession() {
    if (!supa) return null;
    try {
      var res = await supa.auth.getSession();
      return (res && res.data && res.data.session) ? res.data.session : null;
    } catch (e) { return null; }
  }

  async function sendMagicLink(email) {
    if (!supa) return { error: new Error('Supabase indisponível') };
    try {
      return await supa.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
    } catch (e) { return { error: e }; }
  }

  async function signOut() {
    if (supa) { try { await supa.auth.signOut(); } catch (e) {} }
    try { localStorage.removeItem('ghub_me_session'); } catch (e) {}
  }

  function onAuthChange(cb) {
    if (!supa) return { data: { subscription: { unsubscribe: function(){} } } };
    return supa.auth.onAuthStateChange(cb);
  }

  window.__supaGetSession    = getSession;
  window.__supaSendMagicLink = sendMagicLink;
  window.__supaSignOut       = signOut;
  window.__supaOnAuthChange  = onAuthChange;

  /* ── Shared storage (crm_shared) ────────────────────────────── */
  async function sharedGet(k) {
    var cached = null;
    try { var raw = localStorage.getItem('ghub_sh_' + k); if (raw) cached = JSON.parse(raw); } catch (e) {}
    if (!supa) return cached;
    try {
      var sess = await getSession();
      if (!sess) return cached;
      var res = await supa.from('crm_shared').select('value').eq('key', k).maybeSingle();
      if (res && res.data && res.data.value !== undefined) return res.data.value;
    } catch (e) {}
    return cached;
  }

  async function sharedSet(k, v) {
    try { localStorage.setItem('ghub_sh_' + k, JSON.stringify(v)); } catch (e) {}
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      await supa.from('crm_shared').upsert(
        { key: k, value: v, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    } catch (e) {}
  }

  /* ── Personal storage (crm_personal) ───────────────────────── */
  async function personalGet(k) {
    var cached = null;
    try { var raw = localStorage.getItem('ghub_me_' + k); if (raw) cached = JSON.parse(raw); } catch (e) {}
    if (!supa) return cached;
    try {
      var sess = await getSession();
      if (!sess) return cached;
      var res = await supa.from('crm_personal')
        .select('value').eq('user_id', sess.user.id).eq('key', k).maybeSingle();
      if (res && res.data && res.data.value !== undefined) return res.data.value;
    } catch (e) {}
    return cached;
  }

  async function personalSet(k, v) {
    try {
      if (v === null) localStorage.removeItem('ghub_me_' + k);
      else localStorage.setItem('ghub_me_' + k, JSON.stringify(v));
    } catch (e) {}
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      var uid = sess.user.id;
      if (v === null) {
        await supa.from('crm_personal').delete().eq('user_id', uid).eq('key', k);
      } else {
        await supa.from('crm_personal').upsert(
          { user_id: uid, key: k, value: v, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,key' }
        );
      }
    } catch (e) {}
  }

  /* ── crm_fila helpers ───────────────────────────────────────── */
  // Retorna itens com status='pendente' ordenados por gerado_em
  async function filaHoje() {
    if (!supa) return [];
    try {
      var sess = await getSession();
      if (!sess) return [];
      var res = await supa.from('crm_fila')
        .select('id, empresa_id, decisor_id, canal, produto, assunto, contexto_para_aprovacao, gerado_em')
        .eq('status', 'pendente')
        .order('gerado_em', { ascending: true });
      return (res && res.data) ? res.data : [];
    } catch (e) { return []; }
  }

  async function filaAprovar(id) {
    if (!supa) return;
    try {
      await supa.from('crm_fila')
        .update({ status: 'aprovado', aprovado_em: new Date().toISOString() })
        .eq('id', id);
    } catch (e) {}
  }

  async function filaDescartar(id) {
    if (!supa) return;
    try {
      // 'rascunho' sinaliza descarte — sem coluna dedicada no schema atual
      await supa.from('crm_fila')
        .update({ status: 'rascunho' })
        .eq('id', id);
    } catch (e) {}
  }

  /* ── crm_kanban helpers ─────────────────────────────────────── */

  // Carrega todos os cards (GAIA + Holding) sem exigir sessão (anon read)
  // Retorna { gaia: [...], holding: [...] } no formato gh_hotpipeline_v1
  async function kanbanLoadAll() {
    if (!supa) return null;
    try {
      var res = await supa.from('crm_kanban')
        .select('id, tab, col, nome, produto, nota, valor, responsavel, ordem, atualizado_em, empresa_id')
        .order('tab')
        .order('ordem', { ascending: true });
      if (!res || !res.data || !res.data.length) return null;
      var result = { gaia: [], holding: [] };
      res.data.forEach(function(r) {
        var tab = r.tab || 'gaia';
        if (!result[tab]) result[tab] = [];
        result[tab].push({
          id:             String(r.id),
          nome:           r.nome || '',
          empresa_galeria: r.responsavel || '',
          produto:        r.produto || '',
          etapa:          r.col || 'contato',
          valor:          r.valor || 0,
          status:         '',
          responsavel:    '',
          nota:           r.nota || '',
          updatedAt:      r.atualizado_em
            ? new Date(r.atualizado_em).toLocaleDateString('pt-BR') : '',
          _supaId:        r.id,
          _empresaId:     r.empresa_id
        });
      });
      return result;
    } catch(e) { return null; }
  }

  // Upsert de um card individual (exige sessão)
  // card: { _supaId?, nome, produto, etapa (=col), valor, nota, empresa_galeria (=responsavel), tab }
  async function kanbanUpsertCard(tab, card) {
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      var row = {
        tab:         tab,
        col:         card.etapa || 'contato',
        nome:        card.nome || '',
        produto:     card.produto || '',
        nota:        card.nota || '',
        valor:       card.valor || 0,
        responsavel: card.empresa_galeria || '',
        atualizado_em: new Date().toISOString()
      };
      if (card._supaId) {
        await supa.from('crm_kanban').update(row).eq('id', card._supaId);
      } else {
        await supa.from('crm_kanban').insert(row);
      }
    } catch(e) {}
  }

  // Batch upsert (exige sessão) — para sync completo
  async function kanbanBatchUpsert(tab, cards) {
    if (!supa || !cards || !cards.length) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      var rows = cards.map(function(card, idx) {
        var row = {
          tab:         tab,
          col:         card.etapa || 'contato',
          nome:        card.nome || '',
          produto:     card.produto || '',
          nota:        card.nota || '',
          valor:       card.valor || 0,
          responsavel: card.empresa_galeria || '',
          ordem:       idx,
          atualizado_em: new Date().toISOString()
        };
        if (card._supaId) row.id = card._supaId;
        return row;
      });
      await supa.from('crm_kanban').upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
    } catch(e) {}
  }

  // Move card para col='perdido' (desistimos)
  async function kanbanDescartar(id) {
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      await supa.from('crm_kanban')
        .update({ col: 'perdido', atualizado_em: new Date().toISOString() })
        .eq('id', id);
    } catch (e) {}
  }

  // Deleta card permanentemente
  async function kanbanDeletar(id) {
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      await supa.from('crm_kanban').delete().eq('id', id);
    } catch (e) {}
  }

  /* ── crm_empresa_agencia_estrelas helpers ───────────────────── */
  // empresaId: UUID da crm_empresas
  // Retorna { agencia_id: estrelas_manual, ... } para todas as agências
  async function getEstrelas(empresaId) {
    var cached = {};
    try {
      var raw = localStorage.getItem('gh_estrelas_v1');
      var all = raw ? JSON.parse(raw) : {};
      cached = all[empresaId] || {};
    } catch (e) {}
    if (!supa || !empresaId) return cached;
    try {
      var sess = await getSession();
      if (!sess) return cached;
      var res = await supa.from('crm_empresa_agencia_estrelas')
        .select('agencia_id, estrelas_manual, estrelas_calculadas')
        .eq('empresa_id', empresaId);
      if (res && res.data && res.data.length) {
        var out = {};
        res.data.forEach(function(r) {
          out[r.agencia_id] = r.estrelas_manual !== null ? r.estrelas_manual : r.estrelas_calculadas;
        });
        return out;
      }
    } catch (e) {}
    return cached;
  }

  // empresaId: UUID, agenciaId: UUID (usar window.__agencias para converter nome → UUID)
  async function setEstrela(empresaId, agenciaId, estrelas) {
    if (!empresaId || !agenciaId) return;
    try {
      var raw = localStorage.getItem('gh_estrelas_v1');
      var all = raw ? JSON.parse(raw) : {};
      if (!all[empresaId]) all[empresaId] = {};
      all[empresaId][agenciaId] = estrelas;
      localStorage.setItem('gh_estrelas_v1', JSON.stringify(all));
    } catch (e) {}
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      await supa.from('crm_empresa_agencia_estrelas').upsert({
        empresa_id:       empresaId,
        agencia_id:       agenciaId,
        estrelas_manual:  estrelas,
        atualizado_em:    new Date().toISOString()
      }, { onConflict: 'empresa_id,agencia_id' });
    } catch (e) {}
  }

  /* ── crm_kanban / crm_decisores / crm_toques ────────────────── */

  async function getEmpresaIdByNome(nome) {
    if (!supa) return null;
    try {
      var res = await supa.from('crm_kanban')
        .select('id, empresa_id').eq('nome', nome).maybeSingle();
      return (res && res.data) ? res.data : null;
    } catch(e) { return null; }
  }

  async function getDecisores(empresaId) {
    if (!supa || !empresaId) return [];
    try {
      var sess = await getSession();
      if (!sess) return [];
      var res = await supa.from('crm_decisores')
        .select('id, nome, cargo, email, email_valido, wa, linkedin_url, status, ultimo_toque_em, ultimo_tema, gancho, observacoes')
        .eq('empresa_id', empresaId)
        .neq('status', 'inativo')
        .order('nome');
      return (res && res.data) ? res.data : [];
    } catch(e) { return []; }
  }

  async function saveDecisor(data) {
    if (!supa) return null;
    try {
      var sess = await getSession();
      if (!sess) return null;
      var row = Object.assign({}, data, { atualizado_em: new Date().toISOString() });
      if (!row.id) {
        row.fonte = 'manual';
        row.status = 'ativo';
        row.temperatura = 0;
        row.wa_verificado = false;
        row.criado_em = new Date().toISOString();
      }
      var res = await supa.from('crm_decisores')
        .upsert(row, { onConflict: 'id' }).select().single();
      return (res && res.data) ? res.data : null;
    } catch(e) { return null; }
  }

  async function getToques(empresaId) {
    if (!supa || !empresaId) return [];
    try {
      var sess = await getSession();
      if (!sess) return [];
      var res = await supa.from('crm_toques')
        .select('id, decisor_id, canal, direcao, tema, assunto, resumo, data, resultado')
        .eq('empresa_id', empresaId)
        .order('data', { ascending: false })
        .limit(50);
      return (res && res.data) ? res.data : [];
    } catch(e) { return []; }
  }

  async function saveToque(data) {
    if (!supa) return null;
    try {
      var sess = await getSession();
      if (!sess) return null;
      var res = await supa.from('crm_toques')
        .insert(Object.assign({}, data, { fonte: 'manual' })).select().single();
      return (res && res.data) ? res.data : null;
    } catch(e) { return null; }
  }

  /* ── Bridge global: localStorage ↔ crm_shared / crm_personal ────────────
     Intercepta localStorage.setItem para chaves conhecidas e sincroniza
     para Supabase em background. Nenhum block file precisa ser alterado.
  ── */
  var LS_SHARED_KEYS = [
    'gh_alertas_v2', 'gh_regua_v1', 'gh_blocklist_v1',
    'gh_diario_v1', 'gh_bomdias_v1', 'gh_llmbox_v2',
    'gh_config_v1', 'gh_tutorial_v1', 'gh_decisores_v3',
    'ghub_accs', 'gh_funil_v1', 'gh_radar_v1', 'gh_templates_v1',
    'gh_portfolio_v1', 'gh_abordagens_v1', 'gh_estrelas_v1',
    'gh_kanban_v3', 'gh_llmbox_v1', 'gh_kestra_v1', 'gh_bomdias_nav',
    'ghub_custom_leads'
  ];
  var LS_PERSONAL_KEYS = ['ghub_claude_key'];

  // Hydrate: carrega crm_shared/crm_personal → localStorage (requer sessão)
  async function hydrateFromSupabase() {
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      var res = await supa.from('crm_shared').select('key, value').in('key', LS_SHARED_KEYS);
      if (res && res.data) {
        res.data.forEach(function(row) {
          try {
            var v = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
            localStorage.setItem(row.key, v);
          } catch(e) {}
        });
      }
      var uid = sess.user.id;
      var pRes = await supa.from('crm_personal').select('key, value')
        .eq('user_id', uid).in('key', LS_PERSONAL_KEYS);
      if (pRes && pRes.data) {
        pRes.data.forEach(function(row) {
          try {
            var v = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
            localStorage.setItem(row.key, v);
          } catch(e) {}
        });
      }
      console.log('[gh-store] hydrate OK — shared:', (res && res.data && res.data.length) || 0, 'keys');
    } catch(e) { console.warn('[gh-store] hydrate error', e); }
  }

  // Push de uma chave específica do localStorage para Supabase (background)
  async function pushKeyToSupabase(key, rawValue) {
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      var parsed;
      try { parsed = JSON.parse(rawValue); } catch(e) { parsed = rawValue; }
      if (LS_SHARED_KEYS.indexOf(key) !== -1) {
        await supa.from('crm_shared').upsert(
          { key: key, value: parsed, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      } else if (LS_PERSONAL_KEYS.indexOf(key) !== -1) {
        await supa.from('crm_personal').upsert(
          { user_id: sess.user.id, key: key, value: parsed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,key' }
        );
      }
    } catch(e) {}
  }

  // Monkey-patch localStorage.setItem
  (function() {
    var ALL_BRIDGE = LS_SHARED_KEYS.concat(LS_PERSONAL_KEYS);
    var _origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      _origSet(key, value);
      if (ALL_BRIDGE.indexOf(key) !== -1) {
        pushKeyToSupabase(key, value); // fire-and-forget
      }
    };
  })();

  // Converte crm_kanban (formato hotpipeline) para gh_kanban_v3 (formato legado)
  // Usado pelo block_diario.js para FUP cards
  function kanbanToLegacyFormat(hpData) {
    var tabs = [];
    ['gaia', 'holding'].forEach(function(tabId) {
      var cards = (hpData[tabId] || []).map(function(c) {
        return {
          id:      c.id,
          col:     c.etapa,    // já usa os novos nomes: contato/reuniao/proposta/negociacao/fechamento
          name:    c.nome,
          product: c.produto,
          note:    c.nota,
          value:   c.valor,
          galeria: c.empresa_galeria,
          updatedAt: c.updatedAt
        };
      });
      tabs.push({ id: tabId, name: tabId === 'gaia' ? 'GAIA' : 'Holding', cards: cards });
    });
    return { tabs: tabs };
  }

  window.sharedGet             = sharedGet;
  window.sharedSet             = sharedSet;
  window.personalGet           = personalGet;
  window.personalSet           = personalSet;
  window.__filaHoje            = filaHoje;
  window.__filaAprovar         = filaAprovar;
  window.__filaDescartar       = filaDescartar;
  window.__kanbanLoadAll       = kanbanLoadAll;
  window.__kanbanUpsertCard    = kanbanUpsertCard;
  window.__kanbanBatchUpsert   = kanbanBatchUpsert;
  window.__kanbanDescartar     = kanbanDescartar;
  window.__kanbanDeletar       = kanbanDeletar;
  window.__getEstrelas         = getEstrelas;
  window.__setEstrela          = setEstrela;
  window.__getEmpresaIdByNome  = getEmpresaIdByNome;
  window.__getDecisores        = getDecisores;
  window.__saveDecisor         = saveDecisor;
  window.__getToques           = getToques;
  window.__saveToque           = saveToque;
  window.__hydrateFromSupabase = hydrateFromSupabase;
  window.__kanbanToLegacyFormat = kanbanToLegacyFormat;

  console.log('[gh-store v3] ok — supa:', supa ? 'conectado' : 'offline (localStorage only)');
})();

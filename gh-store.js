/* ═══════════════════════════════════════════════════════════════
   GH-STORE v3 — Camada de dados Supabase com bridge localStorage
   A2: kanbanLoadAll (anon read), kanbanUpsertCard, kanbanBatchUpsert
   Tabelas reais (central-galeria):
     crm_shared              — key TEXT PK, value JSONB
     crm_personal            — (user_id, key) PK, value JSONB
     crm_fila                — id, decisor_id, empresa_id, canal,
                               etapa_cadencia, produto, tema, assunto,
                               corpo, contexto_para_aprovacao, thread_ref,
                               status ('rascunho'|'aprovado'|'enviado'|'pulado'|'erro'),
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
  window.__supaSession = null;

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
    window.__supaSession = null;
    if (supa) { try { await supa.auth.signOut(); } catch (e) {} }
    try { localStorage.removeItem('ghub_me_session'); } catch (e) {}
  }

  function onAuthChange(cb) {
    if (!supa) return { data: { subscription: { unsubscribe: function(){} } } };
    return supa.auth.onAuthStateChange(function(event, session) {
      window.__supaSession = session || null;
      cb(event, session);
    });
  }

  // Populate __supaSession on page load if a session already exists
  if (supa) {
    getSession().then(function(s) { window.__supaSession = s || null; });
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
  // Retorna itens com status='rascunho' (aguardando aprovação) ordenados por gerado_em
  async function filaHoje() {
    if (!supa) return [];
    try {
      var sess = await getSession();
      if (!sess) return [];
      var res = await supa.from('crm_fila')
        .select('id, empresa_id, decisor_id, canal, produto, assunto, contexto_para_aprovacao, gerado_em')
        .eq('status', 'rascunho')
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
      // devolve ao estado inicial (rascunho) para nova revisão
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
    'gh_alertas_v2', 'gh_regua_v1',
    'gh_diario_v1', 'gh_bomdias_v1', 'gh_llmbox_v2',
    'gh_config_v1', 'gh_tutorial_v1',
    'ghub_accs', 'gh_funil_v1', 'gh_radar_v1', 'gh_templates_v1',
    'gh_portfolio_v1', 'gh_abordagens_v1', 'gh_estrelas_v1',
    'gh_kanban_v3', 'gh_llmbox_v1', 'gh_kestra_v1', 'gh_bomdias_nav'
  ];
  var LS_PERSONAL_KEYS = ['ghub_claude_key'];
  // Chaves estruturais → tabelas próprias (NÃO vão para crm_shared)
  var STRUCT_KEYS = ['gh_decisores_v3', 'gh_blocklist_v1', 'ghub_custom_leads'];

  // Hydrate: sincroniza Supabase ↔ localStorage (não-destrutivo)
  // Regras: (1) local ausente → escreve do Supabase; (2) conflito → local vence se sem timestamp
  //         ou se timestamp local >= Supabase; (3) SEMPRE faz push do local para Supabase primeiro.
  async function hydrateFromSupabase() {
    if (!supa) return;
    try {
      var sess = await getSession();
      if (!sess) return;
      var uid = sess.user.id;

      // Lê o mapa de timestamps locais (gravado pelo monkey-patch)
      var localTs = {};
      try { localTs = JSON.parse(localStorage.getItem('gh_ls_timestamps_v1') || '{}'); } catch(e) {}

      // Utilitário: compara timestamps; retorna true se t1 >= t2 (ou t2 desconhecido)
      function localIsNewer(localKey, supaUpdatedAt) {
        var lt = localTs[localKey] ? new Date(localTs[localKey]).getTime() : null;
        if (lt === null) return true;  // sem timestamp local → local vence por segurança
        var st = supaUpdatedAt ? new Date(supaUpdatedAt).getTime() : 0;
        return lt >= st;
      }

      // ── FASE 1: push local → Supabase (nunca perde dado local) ──────────────
      // 1a. crm_shared
      var sharedPush = [];
      LS_SHARED_KEYS.forEach(function(k) {
        var raw = localStorage.getItem(k);
        if (raw !== null) {
          var parsed; try { parsed = JSON.parse(raw); } catch(e) { parsed = raw; }
          sharedPush.push({ key: k, value: parsed,
            updated_at: localTs[k] || new Date().toISOString() });
        }
      });
      if (sharedPush.length) {
        try {
          var existSh = await supa.from('crm_shared').select('key, updated_at')
            .in('key', sharedPush.map(function(r) { return r.key; }));
          var existShMap = {};
          if (existSh && existSh.data) existSh.data.forEach(function(r) { existShMap[r.key] = r.updated_at; });
          var toUpsertSh = sharedPush.filter(function(r) {
            if (!existShMap[r.key]) return true; // ausente no Supabase → push
            return localIsNewer(r.key, existShMap[r.key]);
          });
          if (toUpsertSh.length) {
            await supa.from('crm_shared').upsert(toUpsertSh, { onConflict: 'key' });
          }
        } catch(e) { console.warn('[gh-store] hydrate push shared error', e); }
      }

      // 1b. crm_personal
      var personalPush = [];
      LS_PERSONAL_KEYS.forEach(function(k) {
        var raw = localStorage.getItem(k);
        if (raw !== null) {
          var parsed; try { parsed = JSON.parse(raw); } catch(e) { parsed = raw; }
          personalPush.push({ user_id: uid, key: k, value: parsed,
            updated_at: localTs[k] || new Date().toISOString() });
        }
      });
      if (personalPush.length) {
        try {
          var existPer = await supa.from('crm_personal').select('key, updated_at')
            .eq('user_id', uid)
            .in('key', personalPush.map(function(r) { return r.key; }));
          var existPerMap = {};
          if (existPer && existPer.data) existPer.data.forEach(function(r) { existPerMap[r.key] = r.updated_at; });
          var toUpsertPer = personalPush.filter(function(r) {
            if (!existPerMap[r.key]) return true;
            return localIsNewer(r.key, existPerMap[r.key]);
          });
          if (toUpsertPer.length) {
            await supa.from('crm_personal').upsert(toUpsertPer, { onConflict: 'user_id,key' });
          }
        } catch(e) { console.warn('[gh-store] hydrate push personal error', e); }
      }

      // 1c. Push estruturais (decisores, custom_leads, blocklist) — só se local existir
      var localDec = localStorage.getItem('gh_decisores_v3');
      if (localDec) {
        try {
          var pd; try { pd = JSON.parse(localDec); } catch(e) { pd = null; }
          if (pd) { pushDecisoresToSupabase(pd); }
        } catch(e) {}
      }
      var localCL = localStorage.getItem('ghub_custom_leads');
      if (localCL) {
        try {
          var pcl; try { pcl = JSON.parse(localCL); } catch(e) { pcl = null; }
          if (pcl) { pushCustomLeadsToSupabase(pcl); }
        } catch(e) {}
      }
      var localBL = localStorage.getItem('gh_blocklist_v1');
      if (localBL) {
        try {
          var pbl; try { pbl = JSON.parse(localBL); } catch(e) { pbl = null; }
          if (pbl) { pushBlocklistToSupabase(pbl); }
        } catch(e) {}
      }

      // ── FASE 2: pull Supabase → local (somente onde local está vazio ou Supabase é mais novo) ─
      // 2a. crm_shared → LS_SHARED_KEYS
      var res = await supa.from('crm_shared').select('key, value, updated_at').in('key', LS_SHARED_KEYS);
      var sharedPulled = 0;
      if (res && res.data) {
        res.data.forEach(function(row) {
          try {
            var localRaw = localStorage.getItem(row.key);
            if (localRaw === null) {
              // ausente localmente → escreve
              var v = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
              localStorage.setItem(row.key, v);
              sharedPulled++;
            } else if (!localIsNewer(row.key, row.updated_at)) {
              // Supabase é mais novo → atualiza local
              var v = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
              localStorage.setItem(row.key, v);
              sharedPulled++;
            }
            // else: local é igual ou mais novo → mantém local
          } catch(e) {}
        });
      }

      // 2b. crm_personal → LS_PERSONAL_KEYS
      var pRes = await supa.from('crm_personal').select('key, value, updated_at')
        .eq('user_id', uid).in('key', LS_PERSONAL_KEYS);
      if (pRes && pRes.data) {
        pRes.data.forEach(function(row) {
          try {
            var localRaw = localStorage.getItem(row.key);
            if (localRaw === null || !localIsNewer(row.key, row.updated_at)) {
              var v = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
              localStorage.setItem(row.key, v);
            }
          } catch(e) {}
        });
      }

      // 2c. Estruturais — só preenche se local está vazio
      if (!localStorage.getItem('gh_decisores_v3')) {
        try {
          var dRes = await supa.from('crm_decisores')
            .select('legacy_key, nome, cargo, email, wa, linkedin_url, status, raw_legacy');
          if (dRes && dRes.data && dRes.data.length) {
            var decDB = {};
            dRes.data.forEach(function(row) {
              var rl = null;
              try { rl = typeof row.raw_legacy === 'string' ? JSON.parse(row.raw_legacy) : row.raw_legacy; } catch(e) {}
              var accKey = (rl && rl.accKey) ? rl.accKey
                : (row.legacy_key || '').split('_').slice(0, 2).join('_');
              if (!accKey) return;
              if (!decDB[accKey]) decDB[accKey] = { decisors: [], sugeridos: [], activities: [] };
              var d = { nome: row.nome, cargo: row.cargo || '', email: row.email || '',
                        wa: row.wa || '', li: row.linkedin_url || '' };
              if (row.status === 'sugerido') decDB[accKey].sugeridos.push(d);
              else decDB[accKey].decisors.push(d);
            });
            localStorage.setItem('gh_decisores_v3', JSON.stringify(decDB));
          }
        } catch(e) { console.warn('[gh-store] hydrate decisores error', e); }
      }

      if (!localStorage.getItem('ghub_custom_leads')) {
        try {
          var clRes = await supa.from('crm_empresas')
            .select('legacy_key, nome, setor, segmento_detalhe, website, tier, porte, raw_legacy')
            .eq('fonte', 'custom');
          if (clRes && clRes.data && clRes.data.length) {
            var customLeads = clRes.data.map(function(row) {
              var rl = null;
              try { rl = typeof row.raw_legacy === 'string' ? JSON.parse(row.raw_legacy) : row.raw_legacy; } catch(e) {}
              if (rl && rl.nome) return rl;
              var rank = row.legacy_key ? parseInt((row.legacy_key || '').replace('galeria_', ''), 10) : 9999;
              return { rank: rank, nome: row.nome, setor: row.setor,
                       segmento_detalhe: row.segmento_detalhe, website: row.website,
                       tier: row.tier, porte: row.porte, cli: false, custom: true };
            });
            localStorage.setItem('ghub_custom_leads', JSON.stringify(customLeads));
          }
        } catch(e) { console.warn('[gh-store] hydrate custom_leads error', e); }
      }

      if (!localStorage.getItem('gh_blocklist_v1')) {
        try {
          var blRes = await supa.from('crm_carteira_clientes')
            .select('empresa_id, tipo, grupo_economico, aliases, dominios, note, crm_empresas(nome)')
            .eq('tipo', 'cliente_ativo');
          if (blRes && blRes.data && blRes.data.length) {
            var blocklist = blRes.data.map(function(row) {
              var nome = row.crm_empresas ? row.crm_empresas.nome : '';
              return { id: _normKey(nome).replace(/ /g, '-'),
                       canonicalName: nome, aliases: row.aliases || [],
                       domains: row.dominios || [], economicGroup: row.grupo_economico || '',
                       note: row.note || '', active: true };
            });
            localStorage.setItem('gh_blocklist_v1', JSON.stringify(blocklist));
          }
        } catch(e) { console.warn('[gh-store] hydrate blocklist error', e); }
      }

      console.log('[gh-store] hydrate OK (não-destrutivo) — shared pulled:', sharedPulled,
        '| local data pushed to Supabase first');
    } catch(e) { console.warn('[gh-store] hydrate error', e); }
  }

  // ── Handlers estruturais (tabelas reais, não crm_shared) ────────────────

  function _normKey(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // gh_decisores_v3 → crm_decisores (upsert por legacy_key)
  // Formato: { "galeria_{rank}": { decisors: [...], sugeridos: [...] } }
  async function pushDecisoresToSupabase(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    var sess = await getSession();
    if (!sess) return;
    var rows = [];
    Object.keys(parsed).forEach(function(accKey) {
      var entry = parsed[accKey] || {};
      var active = (entry.decisors || []).map(function(d) { return Object.assign({}, d, { _stat: 'ativo' }); });
      var sug    = (entry.sugeridos || []).map(function(d) { return Object.assign({}, d, { _stat: 'sugerido' }); });
      active.concat(sug).forEach(function(d) {
        if (!d.nome) return;
        var lk = accKey + '_' + _normKey(d.nome);
        rows.push({
          legacy_key:   lk,
          nome:         d.nome,
          cargo:        d.cargo || null,
          email:        d.email || null,
          wa:           d.wa || null,
          linkedin_url: d.li || null,
          fonte:        'legacy',
          status:       d._stat,
          raw_legacy:   JSON.stringify({ accKey: accKey, original: d })
        });
      });
    });
    if (!rows.length) return;
    var CHUNK = 500;
    try {
      for (var i = 0; i < rows.length; i += CHUNK) {
        await supa.from('crm_decisores').upsert(rows.slice(i, i + CHUNK), { onConflict: 'legacy_key' });
      }
    } catch(e) { console.warn('[gh-store] pushDecisoresToSupabase error', e); }
  }

  // gh_blocklist_v1 → crm_carteira_clientes (tipo='cliente_ativo')
  // Formato: [{ id, canonicalName, aliases, domains, economicGroup, note }]
  async function pushBlocklistToSupabase(parsed) {
    if (!Array.isArray(parsed)) return;
    var sess = await getSession();
    if (!sess) return;
    for (var i = 0; i < parsed.length; i++) {
      var entry = parsed[i];
      if (!entry.canonicalName) continue;
      try {
        var eRes = await supa.from('crm_empresas')
          .select('id').ilike('nome', entry.canonicalName).maybeSingle();
        var empresaId = eRes && eRes.data ? eRes.data.id : null;
        if (!empresaId) {
          var ins = await supa.from('crm_empresas').upsert(
            { nome: entry.canonicalName.toUpperCase(), fonte: 'blocklist', legacy_key: 'bl_' + (entry.id || entry.canonicalName) },
            { onConflict: 'nome' }
          ).select('id').maybeSingle();
          empresaId = ins && ins.data ? ins.data.id : null;
        }
        if (!empresaId) continue;
        await supa.from('crm_carteira_clientes').upsert({
          empresa_id:     empresaId,
          tipo:           'cliente_ativo',
          grupo_economico: entry.economicGroup || null,
          aliases:        entry.aliases || [],
          dominios:       entry.domains || [],
          note:           entry.note || null
        }, { onConflict: 'empresa_id,tipo' });
      } catch(e) { console.warn('[gh-store] pushBlocklistToSupabase row error', e); }
    }
  }

  // ghub_custom_leads → crm_empresas (upsert por nome)
  // Formato: [{ rank, nome, setor, segmento_detalhe, website, tier, porte, cnpj, cli, custom }]
  async function pushCustomLeadsToSupabase(parsed) {
    if (!Array.isArray(parsed) || !parsed.length) return;
    var sess = await getSession();
    if (!sess) return;
    var rows = parsed.filter(function(l) { return l.nome; }).map(function(l) {
      return {
        nome:              l.nome,
        legacy_key:        'galeria_' + l.rank,
        setor:             l.setor || null,
        segmento_detalhe:  l.segmento_detalhe || null,
        website:           l.website || l.site || null,
        tier:              l.tier || null,
        porte:             l.porte || null,
        fonte:             'custom',
        raw_legacy:        JSON.stringify(l)
      };
    });
    var CHUNK = 500;
    try {
      for (var i = 0; i < rows.length; i += CHUNK) {
        await supa.from('crm_empresas').upsert(rows.slice(i, i + CHUNK), { onConflict: 'nome' });
      }
    } catch(e) { console.warn('[gh-store] pushCustomLeadsToSupabase error', e); }
  }

  // Push de uma chave específica do localStorage para Supabase (background)
  async function pushKeyToSupabase(key, rawValue) {
    if (!supa) return;
    try {
      var parsed;
      try { parsed = JSON.parse(rawValue); } catch(e) { parsed = rawValue; }
      if (key === 'gh_decisores_v3') {
        pushDecisoresToSupabase(parsed); return;
      }
      if (key === 'gh_blocklist_v1') {
        pushBlocklistToSupabase(parsed); return;
      }
      if (key === 'ghub_custom_leads') {
        pushCustomLeadsToSupabase(parsed); return;
      }
      var sess = await getSession();
      if (!sess) return;
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

  // Monkey-patch localStorage.setItem — tracks write timestamps
  (function() {
    var ALL_BRIDGE = LS_SHARED_KEYS.concat(LS_PERSONAL_KEYS).concat(STRUCT_KEYS);
    var _origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      _origSet(key, value);
      if (ALL_BRIDGE.indexOf(key) !== -1) {
        // Track write timestamp so hydrate can do conflict resolution
        try {
          var ts = {};
          try { ts = JSON.parse(localStorage.getItem('gh_ls_timestamps_v1') || '{}'); } catch(e) {}
          ts[key] = new Date().toISOString();
          _origSet('gh_ls_timestamps_v1', JSON.stringify(ts));
        } catch(e) {}
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

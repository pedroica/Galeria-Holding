/* ═══════════════════════════════════════════════════════════════
   GH-STORE v1 — Camada de dados Supabase com bridge localStorage
   Carregado como s0, antes de todos os blocos React.
   Expõe globalmente: sharedGet, sharedSet, personalGet, personalSet,
   e helpers de auth: __supaGetSession, __supaSendMagicLink,
   __supaSignOut, __supaOnAuthChange, __supaClient.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var SUPA_URL  = "https://uetltlnjmobeiunxfsqi.supabase.co";
  var SUPA_ANON = "sb_publishable_R661k93drRa7vf5y-EhUPw_zbneT-zO";

  // Supabase JS (UMD) expõe window.supabase
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
      var res = await supa.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
      return res;
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

  /* ── Shared storage (substitui ghub_sh_* no localStorage) ── */
  async function sharedGet(k) {
    // Sempre lê localStorage como fallback rápido
    var cached = null;
    try {
      var raw = localStorage.getItem('ghub_sh_' + k);
      if (raw) cached = JSON.parse(raw);
    } catch (e) {}

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
    // Bridge: mantém localStorage sincronizado
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

  /* ── Personal storage (substitui ghub_me_* no localStorage) ── */
  async function personalGet(k) {
    var cached = null;
    try {
      var raw = localStorage.getItem('ghub_me_' + k);
      if (raw) cached = JSON.parse(raw);
    } catch (e) {}

    if (!supa) return cached;
    try {
      var sess = await getSession();
      if (!sess) return cached;
      var uid = sess.user.id;
      var res = await supa.from('crm_personal')
        .select('value').eq('user_id', uid).eq('key', k).maybeSingle();
      if (res && res.data && res.data.value !== undefined) return res.data.value;
    } catch (e) {}
    return cached;
  }

  async function personalSet(k, v) {
    // Bridge localStorage
    try {
      if (v === null) { localStorage.removeItem('ghub_me_' + k); }
      else { localStorage.setItem('ghub_me_' + k, JSON.stringify(v)); }
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
  async function filaHoje() {
    if (!supa) return [];
    try {
      var sess = await getSession();
      if (!sess) return [];
      var hoje = new Date().toISOString().slice(0, 10);
      var res = await supa.from('crm_fila')
        .select('*')
        .lte('data_sugerida', hoje)
        .eq('status', 'pendente')
        .order('data_sugerida', { ascending: true });
      return (res && res.data) ? res.data : [];
    } catch (e) { return []; }
  }

  async function filaAprovar(id) {
    if (!supa) return;
    try {
      await supa.from('crm_fila')
        .update({ status: 'aprovado', updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (e) {}
  }

  async function filaDescartar(id) {
    if (!supa) return;
    try {
      await supa.from('crm_fila')
        .update({ status: 'descartado', updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (e) {}
  }

  window.sharedGet    = sharedGet;
  window.sharedSet    = sharedSet;
  window.personalGet  = personalGet;
  window.personalSet  = personalSet;
  window.__filaHoje   = filaHoje;
  window.__filaAprovar  = filaAprovar;
  window.__filaDescartar = filaDescartar;

  console.log('[gh-store] ok — supa:', supa ? 'conectado' : 'offline (localStorage only)');
})();

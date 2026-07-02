/* ═══════════════════════════════════════════════════════════════
   GH-CORE v3 — Proxy de APIs, Temperatura de Deals e Backup
   Carregado antes de todos os blocos do app.
   ═══════════════════════════════════════════════════════════════ */

/* ── 1. PROXY DE APIs ─────────────────────────────────────────────
   Intercepta fetch() para api.anthropic.com / api.hunter.io /
   api.lusha.com e redireciona para as Vercel Serverless Functions
   (/api/claude, /api/hunter, /api/lusha) quando disponíveis.
   Se o proxy não existir (ex: rodando local via file://), cai no
   modo direto usando chaves salvas em localStorage.
   Resultado: nenhuma chave precisa existir no HTML. */
(function(){
  var origFetch = window.fetch.bind(window);
  var proxyInfo = null; // {claude:bool, hunter:bool, lusha:bool} | false

  async function getProxyInfo(){
    if(proxyInfo !== null) return proxyInfo;
    try{
      var r = await origFetch('/api/health');
      if(r.ok){ proxyInfo = await r.json(); }
      else proxyInfo = false;
    }catch(e){ proxyInfo = false; }
    return proxyInfo;
  }
  // pré-aquece a detecção
  try{ getProxyInfo(); }catch(e){}

  window.fetch = async function(url, opts){
    try{
      if(typeof url === 'string'){
        if(url.indexOf('https://api.anthropic.com/v1/messages') === 0){
          var p = await getProxyInfo();
          if(p && p.claude){
            var o = Object.assign({}, opts||{});
            var h = Object.assign({}, o.headers||{});
            delete h['x-api-key']; delete h['anthropic-version'];
            delete h['anthropic-dangerous-direct-browser-access'];
            o.headers = h;
            return origFetch('/api/claude', o);
          }
        } else if(url.indexOf('https://api.hunter.io/') === 0){
          var p2 = await getProxyInfo();
          if(p2 && p2.hunter){
            var u = new URL(url);
            u.searchParams.delete('api_key');
            var mode = u.pathname.indexOf('email-verifier') >= 0 ? 'verify' : 'domain';
            return origFetch('/api/hunter?mode=' + mode + '&' + u.searchParams.toString(), opts);
          }
        } else if(url.indexOf('https://api.lusha.com/') === 0){
          var p3 = await getProxyInfo();
          if(p3 && p3.lusha){
            var u2 = new URL(url);
            var o2 = Object.assign({}, opts||{});
            var h2 = Object.assign({}, o2.headers||{});
            delete h2['api_key'];
            o2.headers = h2;
            return origFetch('/api/lusha?' + u2.searchParams.toString(), o2);
          }
        }
      }
    }catch(e){ /* qualquer erro no interceptor: segue fluxo normal */ }
    return origFetch(url, opts);
  };
  window.__ghProxyInfo = getProxyInfo;
})();

/* chaves locais (fallback quando não há proxy) */
function getHunterKey(){try{return localStorage.getItem("gh_hunter_key")||"";}catch(e){return "";}}
function setHunterKey(k){try{localStorage.setItem("gh_hunter_key",k);}catch(e){}}
function getLushaKey(){try{return localStorage.getItem("gh_lusha_key")||"";}catch(e){return "";}}
function setLushaKey(k){try{localStorage.setItem("gh_lusha_key",k);}catch(e){}}

/* ── 2. TEMPERATURA DE DEALS (score × recência com decay) ──────── */
function ghParseActDate(a){
  if(!a) return NaN;
  if(a.isoDate){ var t = new Date(a.isoDate).getTime(); if(!isNaN(t)) return t; }
  var d = a.date || a.data || "";
  // dd/mm/yyyy (pt-BR)
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]).getTime();
  var t2 = new Date(d).getTime();
  return isNaN(t2) ? NaN : t2;
}

var GH_TEMP_PESOS = {
  meeting: 40, reuniao: 40,
  proposta: 35, proposta_enviada: 35,
  response: 25, resposta: 25, resposta_email: 25, whatsapp_respondido: 25,
  video: 30, video_enviado: 30,
  call: 20, ligacao: 20,
  linkedin: 12, linkedin_aceite: 15,
  whatsapp: 8, whatsapp_enviado: 8,
  email: 5, email_enviado: 5, email_aberto: 10
};

function calcularTemperatura(acc){
  var agora = Date.now();
  var DIA = 86400000;
  var pontos = 0;
  var ultimaInteracao = 0;
  var acts = (acc && acc.activities) || [];
  for(var i=0;i<acts.length;i++){
    var a = acts[i];
    var t = ghParseActDate(a);
    if(isNaN(t)) continue;
    var idade = (agora - t) / DIA;
    if(idade < 0) idade = 0;
    if(idade > 90) continue;
    var peso = GH_TEMP_PESOS[a.type] || GH_TEMP_PESOS[a.tipo] || 5;
    // decay exponencial: hoje = 100%, 30 dias atrás ≈ 37%
    pontos += peso * Math.exp(-idade / 30);
    if(t > ultimaInteracao) ultimaInteracao = t;
  }
  var diasSemContato = ultimaInteracao ? (agora - ultimaInteracao) / DIA : 999;
  var status, cor, emoji, nivel;
  if(pontos >= 60 && diasSemContato <= 7){ status="Quente"; emoji="🔥"; cor="#E24B4A"; nivel=3; }
  else if(pontos >= 30 && diasSemContato <= 14){ status="Morno"; emoji="🌡️"; cor="#EF9F27"; nivel=2; }
  else if(pontos >= 10){ status="Frio"; emoji="❄️"; cor="#3498db"; nivel=1; }
  else { status="Congelado"; emoji="🧊"; cor="#95a5a6"; nivel=0; }
  return {
    pontos: Math.round(pontos),
    status: status, emoji: emoji, cor: cor, nivel: nivel,
    diasSemContato: Math.round(diasSemContato),
    ultimaInteracao: ultimaInteracao || null,
    // "esfriando": tem pontos históricos relevantes mas passou da janela de contato
    esfriando: (pontos >= 25 && diasSemContato > 7 && diasSemContato <= 45)
  };
}
window.calcularTemperatura = calcularTemperatura;

/* ── 3. BACKUP — export/import de TODOS os dados do CRM ────────── */
var GH_BACKUP_PREFIXES = ["gh_", "ghub_"];

function ghBackupSnapshot(){
  var out = {};
  for(var i=0;i<localStorage.length;i++){
    var k = localStorage.key(i);
    for(var j=0;j<GH_BACKUP_PREFIXES.length;j++){
      if(k.indexOf(GH_BACKUP_PREFIXES[j]) === 0){ out[k] = localStorage.getItem(k); break; }
    }
  }
  return { _meta: { app:"crm-galeria", version:3, exportedAt: new Date().toISOString(), keys: Object.keys(out).length }, data: out };
}

function ghExportBackup(){
  var snap = ghBackupSnapshot();
  var blob = new Blob([JSON.stringify(snap)], {type:"application/json"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  var d = new Date();
  var pad = function(n){return (n<10?"0":"")+n;};
  a.download = "crm-galeria-backup-" + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".json";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
  return snap._meta;
}
window.ghExportBackup = ghExportBackup;

function ghImportBackup(jsonText){
  var snap = JSON.parse(jsonText);
  var data = snap && snap.data;
  if(!data || typeof data !== "object") throw new Error("Arquivo não parece um backup do CRM Galeria.");
  var n = 0;
  Object.keys(data).forEach(function(k){
    var ok = GH_BACKUP_PREFIXES.some(function(p){ return k.indexOf(p) === 0; });
    if(ok){ localStorage.setItem(k, data[k]); n++; }
  });
  return n;
}
window.ghImportBackup = ghImportBackup;

/* Backup automático de segurança: 1x/dia guarda um snapshot compacto
   das duas chaves críticas em uma chave espelho, protegendo contra
   corrupção acidental. */
(function(){
  try{
    var last = localStorage.getItem("gh_autobk_at");
    var today = new Date().toISOString().slice(0,10);
    if(last !== today){
      var crit = {};
      ["gh_decisores_v3","gh_kanban_v3"].forEach(function(k){
        var v = localStorage.getItem(k);
        if(v) crit[k] = v;
      });
      if(Object.keys(crit).length){
        localStorage.setItem("gh_autobk_data", JSON.stringify(crit));
        localStorage.setItem("gh_autobk_at", today);
      }
    }
  }catch(e){ /* quota cheia: ignora silenciosamente */ }
})();

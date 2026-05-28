/**
 * LexOfficeAT — Performance & Cleanup
 * Remove dados excessivos que travam o sistema
 */
(function() {
  'use strict';

  function db() { return typeof LexSync !== 'undefined' && LexSync.DB ? LexSync.DB : null; }

  function limpar() {
    var d = db(); if (!d) return;

    // 1. Limita publicações a 300 mais recentes
    var pubs = d.getAll(d.KEYS.publicacoes) || [];
    if (pubs.length > 300) {
      // Ordena por data e mantém as 300 mais recentes
      pubs.sort(function(a,b){
        return new Date(b.createdAt||0) - new Date(a.createdAt||0);
      });
      // Remove as antigas do localStorage diretamente
      try {
        var key = 'lexat_publicacoes';
        var novas = pubs.slice(0, 300);
        localStorage.setItem(key, JSON.stringify(novas));
        console.log('[Cleanup] Publicações: '+pubs.length+' → 300');
      } catch(e) {}
    }

    // 2. Limita prazos concluídos antigos (mantém apenas 30 dias)
    var prazos = d.getAll(d.KEYS.prazos) || [];
    var trintaDias = Date.now() - (30 * 86400000);
    var prazosOk = prazos.filter(function(p) {
      if (p.status !== 'concluido') return true;
      var dt = new Date(p.concluidoEm || p.createdAt || 0).getTime();
      return dt > trintaDias;
    });
    if (prazosOk.length < prazos.length) {
      console.log('[Cleanup] Prazos: '+prazos.length+' → '+prazosOk.length);
    }

    // 3. Remove usuários demo (Dr. Carlos Lima, Dra. Ana Souza demo)
    // Mantém apenas os 5 do escritório real
    var usuarios = typeof S !== 'undefined' ? S.usuarios : [];
    var usuariosReais = [
      'AMILCAR', 'ANA CLAUDIA', 'CLAUDIA DAMASCENO'
    ];
    // Não mexe nos usuários — eles são do S.usuarios hardcoded

    // 4. Deduplica prazos
    var prazosSeen = {};
    var prazosDedup = (d.getAll(d.KEYS.prazos)||[]).filter(function(p) {
      var key = (p.cnj||'')+'|'+(p.tipo||'')+'|'+(p.vencimentoISO||p.vencimento||'');
      if (prazosSeen[key]) return false;
      prazosSeen[key] = true;
      return true;
    });
    if (prazosDedup.length < (d.getAll(d.KEYS.prazos)||[]).length) {
      console.log('[Cleanup] Prazos dedup: removidos '+(d.getAll(d.KEYS.prazos).length - prazosDedup.length));
      try {
        localStorage.setItem('lexat_prazos', JSON.stringify(prazosDedup));
      } catch(e) {}
    }

    // 5. Atualiza badge de publicações com número correto
    var pubsAtuais = d.getAll(d.KEYS.publicacoes)||[];
    var badge = document.querySelector('.nitem[onclick*="emails"] .nbadge');
    if (badge) badge.textContent = pubsAtuais.length;
  }

  // Render lazy — só renderiza quando a aba está visível
  var renderQueue = {};
  var rendering = false;

  window.lexRenderLazy = function(page) {
    renderQueue[page] = true;
    if (!rendering) processQueue();
  };

  function processQueue() {
    var pages = Object.keys(renderQueue);
    if (!pages.length) { rendering = false; return; }
    rendering = true;
    var page = pages[0];
    delete renderQueue[page];
    setTimeout(function() {
      try {
        if (typeof window.lexRenderPagina === 'function') window.lexRenderPagina(page);
      } catch(e) { console.warn('[RenderLazy]', e.message); }
      processQueue();
    }, 50);
  }

  // Init
  function init() {
    limpar();
    // Roda limpeza a cada 5 minutos (não a cada 15s)
    setInterval(limpar, 300000);
    console.log('[Cleanup] ✅ Performance OK');
  }

  function aguardar(cb) {
    if (db()) { cb(); return; }
    setTimeout(function() { aguardar(cb); }, 800);
  }
  aguardar(init);
})();

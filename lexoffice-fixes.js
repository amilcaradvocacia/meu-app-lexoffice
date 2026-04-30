// LexOffice Fixes v6.0 — versão segura, sem sobrescrever estado
(function() {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      setTimeout(fn, 1200);
    }
  }

  ready(function() {
    patchDashboard();
    patchVerEmail();
    patchRenderGmail();
    patchAutoSync();
    adicionarBotaoSync();
    console.log('[LEX v6.0] Fixes aplicados');
    if (typeof eLog === 'function') eLog('✅ Fixes v6.0 OK', 'ok');
  });

  // ── PATCH 1: Dashboard — só atualiza kProc2026 e kClientes ──
  function patchDashboard() {
    function upd() {
      try {
        // Processos
        var nP = 0;
        if (window.XLS2_DATA && XLS2_DATA.length) nP = XLS2_DATA.length;
        else if (window.XLS && XLS.length) nP = XLS.length;
        var elP = document.getElementById('kProc2026');
        if (elP && nP > 0) elP.textContent = nP;

        // Clientes — lê S.clientes sem alterar nada
        if (window.S && S.clientes) {
          var nC = S.clientes.filter(function(c) {
            return c.status === 'ativo' || c.status === 'vip';
          }).length;
          var elC = document.getElementById('kClientes');
          if (elC) elC.textContent = nC || S.clientes.length;
          var nbC = document.getElementById('nbClientes');
          if (nbC) nbC.textContent = S.clientes.length;
        }
      } catch(e) { console.warn('[LEX] dashboard upd:', e); }
    }
    upd();
    setInterval(upd, 8000);
  }

  // ── PATCH 2: verEmail — busca corpo real e popula form ──
  function patchVerEmail() {
    window.verEmail = function(idx) {
      try {
        if (!window.EMAIL || !EMAIL._gmailMsgs || !EMAIL._gmailMsgs[idx]) {
          if (typeof toast === 'function') toast('E-mail não disponível', 'orange');
          return;
        }
        var m = EMAIL._gmailMsgs[idx];
        if (!EMAIL.token) {
          if (typeof toast === 'function') toast('Gmail não conectado', 'orange');
          return;
        }

        // Feedback visual no botão
        var btns = document.querySelectorAll('[onclick*="verEmail('+idx+')"]');
        btns.forEach(function(b){ b.textContent='⏳'; b.disabled=true; });

        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+m.id+'?format=full', {
          headers: {'Authorization': 'Bearer '+EMAIL.token}
        })
        .then(function(r) {
          if (r.status === 401) {
            EMAIL.ok = false; EMAIL.token = null;
            if (typeof DB !== 'undefined') DB.save('lex_gmail_auth', null);
            if (typeof toast === 'function') toast('Sessão expirada — reconecte o Gmail', 'orange');
            btns.forEach(function(b){ b.textContent='👁 Ver'; b.disabled=false; });
            return null;
          }
          return r.json();
        })
        .then(function(msg) {
          if (!msg) return;
          btns.forEach(function(b){ b.textContent='👁 Ver'; b.disabled=false; });

          // Extrai texto
          var body = '';
          function dig(p) {
            if (!p) return;
            if (p.mimeType === 'text/plain' && p.body && p.body.data) {
              try {
                var t = atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/'));
                if (t.length > body.length) body = t;
              } catch(e) {}
            }
            if (!body && p.mimeType === 'text/html' && p.body && p.body.data) {
              try {
                body = atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/'))
                  .replace(/<br\s*\/?>/gi,'\n').replace(/<p[^>]*>/gi,'\n')
                  .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ')
                  .replace(/&amp;/g,'&').replace(/\s{3,}/g,'\n').trim();
              } catch(e) {}
            }
            if (p.parts) p.parts.forEach(dig);
          }
          dig(msg.payload || {});
          if (!body) body = m.snippet || '';

          // Headers
          var hdrs = {};
          ((msg.payload && msg.payload.headers)||[]).forEach(function(h){ hdrs[h.name]=h.value; });
          var from = hdrs['From'] || m.from || '';

          // Preenche form
          var remEl = document.getElementById('emailRem');
          if (remEl) remEl.value = from.toLowerCase().indexOf('jusbrasil')>=0 ? 'jusbrasil' : 'impacta';
          var bodEl = document.getElementById('emailBody');
          if (bodEl) bodEl.value = body;

          if (typeof eLog === 'function') eLog('E-mail carregado ('+body.length+' chars)', 'teal');

          // Extrai + cadastra
          setTimeout(function() {
            if (typeof parseEmail === 'function') parseEmail();
            _autoCadastrar(body, m.subject||'', from);
          }, 300);
        })
        .catch(function(e) {
          btns.forEach(function(b){ b.textContent='👁 Ver'; b.disabled=false; });
          if (typeof toast === 'function') toast('Erro: '+e.message, 'orange');
        });
      } catch(e) { console.error('[LEX] verEmail:', e); }
    };
  }

  // ── PATCH 3: renderiza inbox com botão VER ──
  function patchRenderGmail() {
    window._renderGmail = function(msgs) {
      if (!window.EMAIL) return;
      EMAIL._gmailMsgs = msgs;
      msgs.sort(function(a,b){ return new Date(b.date)-new Date(a.date); });

      // Detecta qual container usar
      var div = document.getElementById('inboxList');
      var tbl = document.getElementById('inboxBody');

      if (!div && !tbl) return;

      var html = msgs.map(function(m, i) {
        var isJB = (m.from||'').toLowerCase().indexOf('jusbrasil') >= 0;
        var cor  = isJB ? 'bo' : 'bteal';
        var src  = isJB ? 'JusBrasil' : 'Impacta';
        var d    = new Date(m.date);
        var ds   = isNaN(d.getTime()) ? (m.date||'') : d.toLocaleDateString('pt-BR');
        var snip = (m.snippet||'').substring(0,80);

        if (div) {
          return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border)">'
            +'<span class="badge '+cor+'" style="font-size:10px;flex-shrink:0;margin-top:2px">'+src+'</span>'
            +'<div style="flex:1;min-width:0;cursor:pointer" onclick="window._abrirGmail('+i+')">'
            +'<div style="font-size:12.5px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(m.subject||'(sem assunto)')+'</div>'
            +'<div style="font-size:10.5px;color:var(--text3);margin-top:2px">'+ds+' — '+snip+'</div>'
            +'</div>'
            +'<button class="btn btn-teal btn-xs" onclick="verEmail('+i+')">👁 Ver</button>'
            +'</div>';
        } else {
          return '<tr>'
            +'<td class="tpl"><span class="badge '+cor+'" style="font-size:10px">'+src+'</span></td>'
            +'<td style="font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(m.subject||'')+'</td>'
            +'<td style="font-size:11px;color:var(--text3)">'+ds+'</td>'
            +'<td style="font-size:11px;color:var(--text2)">'+snip+'</td>'
            +'<td class="tpr"><button class="btn btn-teal btn-xs" onclick="verEmail('+i+')">👁 Ver</button></td>'
            +'</tr>';
        }
      }).join('');

      if (div) div.innerHTML = html || '<div style="text-align:center;padding:24px;color:var(--text3)">📭 Nenhuma publicação.</div>';
      if (tbl) tbl.innerHTML = html || '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--text3)">📭 Nenhuma publicação.</td></tr>';

      var badge = document.getElementById('gmailOkBadge');
      if (badge) badge.style.display = 'inline-block';
    };
  }

  // ── AUTO-CADASTRO (interno, não exposto globalmente) ──
  function _autoCadastrar(corpo, assunto, from) {
    try {
      if (!corpo || !window.S || !S.clientes) return;
      var isJB = (from||'').toLowerCase().indexOf('jusbrasil') >= 0;
      var d = (typeof extrairDados==='function') ? extrairDados(corpo, isJB?'jusbrasil':'impacta') : null;

      var nome = '';
      // 1. Partes: no corpo
      if (d && d.partes) { var px=d.partes.split(/\s+[xX×]\s+/); if(px[0]&&px[0].trim().length>3) nome=px[0].trim(); }
      // 2. Assunto "– NOME –"
      if (!nome && assunto) { var m1=assunto.match(/[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜa-záéíóúâêôãõçàü\s]{3,}?)\s*[–\-]/); if(m1&&m1[1]&&m1[1].trim().length>3) nome=m1[1].trim(); }
      // 3. XLS por CNJ
      if (!nome && d && d.cnjs && d.cnjs.length && window.XLS) {
        var num=d.cnjs[0].replace(/[^0-9]/g,'').substring(0,13);
        var xr=XLS.find(function(r){return r.processo&&r.processo.replace(/[^0-9]/g,'').indexOf(num)>=0;});
        if (xr&&xr.parte1) nome=xr.parte1;
      }
      if (!nome || nome.length < 4) return;

      var norm = nome.trim().toUpperCase().replace(/\s+/g,' ');
      var existe = S.clientes.find(function(c){ return c.nome.toUpperCase().replace(/\s+/g,' ')===norm; });
      if (existe) { if(typeof eLog==='function') eLog('Cliente já existe: '+existe.nome,'info'); return; }

      var adverso = '';
      if (d&&d.partes){var pa=d.partes.split(/\s+[xX×]\s+/);adverso=(pa[1]||'').trim();}

      var ac=(d&&d.mov||'').toUpperCase();
      var area=ac.indexOf('TRABALH')>=0?'Trabalhista':ac.indexOf('PENAL')>=0?'Penal':ac.indexOf('FAM')>=0?'Família':'Cível';

      S.clientes.push({
        id:S.nextCid++, nome:nome.trim(), cpfcnpj:'', email:'', tel:'',
        area:area, tipo:'PF', status:'ativo', resp:S.uidAtivo||1,
        exadverso:adverso, endereco:(d&&d.vara)||'',
        obs:'Auto '+ new Date().toLocaleDateString('pt-BR')+(d&&d.cnjs&&d.cnjs[0]?' | '+d.cnjs[0]:'')
      });
      S.cFiltrados=[].concat(S.clientes);
      if(typeof renderKPIClientes==='function') renderKPIClientes();
      var nb=document.getElementById('nbClientes'); if(nb) nb.textContent=S.clientes.length;
      if(typeof eLog==='function') eLog('👤 Cliente: '+nome.trim(),'ok');
      if(typeof toast==='function') toast('👤 '+nome.trim(),'teal');
      if(d&&d.prazo&&typeof criarPrazoInterno==='function') criarPrazoInterno(d);
      if(typeof eKPI==='function') eKPI();
    } catch(e) { console.warn('[LEX] autoCadastrar:', e); }
  }

  // ── PATCH 4: auto-sync ──
  function patchAutoSync() {
    var _orig = window.ativarGmailUI;
    window.ativarGmailUI = function() {
      try { if(_orig) _orig(); } catch(e){}
      try {
        if (!window.EMAIL) return;
        if (EMAIL._syncTimer) clearInterval(EMAIL._syncTimer);
        var min = (EMAIL.cfg&&EMAIL.cfg.intervalo)||15;
        EMAIL._syncTimer = setInterval(function() {
          if (EMAIL.ok&&EMAIL.token&&typeof carregarInbox==='function') carregarInbox();
        }, min*60000);
        if(typeof eLog==='function') eLog('Auto-sync ativo ('+min+'min)','ok');
      } catch(e){}
    };
    setTimeout(function(){
      try { if(window.EMAIL&&EMAIL.ok&&EMAIL.token&&typeof ativarGmailUI==='function') ativarGmailUI(); } catch(e){}
    }, 2500);
  }

  // ── Botão Sincronizar na aba Clientes ──
  function adicionarBotaoSync() {
    setTimeout(function() {
      try {
        var ta = document.querySelector('#pg-clientes .topbar-actions');
        if (!ta || document.getElementById('btnSyncXLS')) return;
        var b = document.createElement('button');
        b.id='btnSyncXLS'; b.className='btn btn-teal';
        b.innerHTML='🔄 Sync Processos→Clientes';
        b.onclick = function() {
          if(!window.XLS||!XLS.length||!window.S){if(typeof toast==='function')toast('XLS não carregado','orange');return;}
          var add=0, ex=S.clientes.map(function(c){return c.nome.toUpperCase().replace(/\s+/g,' ');});
          var skip=['DOCUMENTOS','JUSTIÇA','FEDERAL','ESTADO','MUNICÍPIO','MINISTÉRIO'];
          XLS.forEach(function(r){
            var n=(r.parte1||'').trim();
            if(!n||n.length<4||/^\d/.test(n)) return;
            if(skip.some(function(k){return n.toUpperCase().indexOf(k)>=0;})) return;
            var norm=n.toUpperCase().replace(/\s+/g,' ');
            if(ex.indexOf(norm)>=0) return;
            var ac=(r.acao||'').toUpperCase();
            S.clientes.push({id:S.nextCid++,nome:n,cpfcnpj:'',email:'',tel:'',
              area:ac.indexOf('TRABALH')>=0?'Trabalhista':ac.indexOf('PENAL')>=0?'Penal':'Cível',
              tipo:'PF',status:'ativo',resp:1,exadverso:r.ex_adverso||'',endereco:r.vara||'',
              obs:'XLS ficha '+(r.ficha||'')});
            ex.push(norm); add++;
          });
          S.cFiltrados=[].concat(S.clientes);
          if(typeof renderKPIClientes==='function') renderKPIClientes();
          if(typeof toast==='function') toast(add>0?'✅ '+add+' clientes adicionados!':'Todos já sincronizados','teal');
        };
        ta.insertBefore(b, ta.firstChild);
      } catch(e){}
    }, 1500);
  }

})();

// ================================================================
// LexOffice FIXES v5.0 — Correção cirúrgica de bugs confirmados
// BUG1: Dashboard "0 Processos" — KPI hardcoded nunca atualiza
// BUG2: Botão VER não abre — conflito inboxList vs inboxBody
// ================================================================

(function() {
  function init() {
    fix_dashboard_kpis();
    fix_ver_email();
    fix_render_inbox();
    fix_processar_tudo();
    fix_parse_manual();
    fix_auto_cadastro_xls();
    fix_busca_debounce();
    fix_autosync();
    if (typeof eLog === 'function') eLog('✅ Fixes v5.0 carregados', 'ok');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 900); });
  } else {
    setTimeout(init, 900);
  }
})();

// ══════════════════════════════════════════
// FIX 1 — DASHBOARD: lê XLS real
// ══════════════════════════════════════════
function fix_dashboard_kpis() {

  function atualizar() {
    // Processos: lê XLS2_DATA ou XLS
    var nProc = 0;
    if (typeof XLS2_DATA !== 'undefined' && XLS2_DATA.length) nProc = XLS2_DATA.length;
    else if (typeof XLS !== 'undefined' && XLS.length) nProc = XLS.length;

    // Atualiza o card "Processos 2026"
    var cards = document.querySelectorAll('.kcard.blue .kval');
    cards.forEach(function(el) {
      if (nProc > 0) el.textContent = nProc;
    });
    // Atualiza badge sidebar
    var nbProc = document.querySelector('.nitem .nbadge.i');
    if (nbProc && nProc > 0) nbProc.textContent = nProc;

    // Clientes ativos
    var nCli = 0;
    if (typeof S !== 'undefined' && S.clientes) {
      nCli = S.clientes.filter(function(c){ return c.status==='ativo'||c.status==='vip'; }).length;
    }
    var kCli = document.getElementById('kClientes');
    if (kCli && nCli > 0) kCli.textContent = nCli;
    var nbCli = document.getElementById('nbClientes');
    if (nbCli && nCli > 0) nbCli.textContent = nCli;

    // Prazos urgentes
    var nPraz = 0;
    if (typeof EMAIL !== 'undefined' && EMAIL.prazos) {
      nPraz = EMAIL.prazos.filter(function(p){
        var dias = diasRestantes(p.prazo);
        return typeof dias === 'number' && dias <= 5;
      }).length;
    }
    var kPraz = document.querySelector('.kcard.red .kval');
    if (kPraz && nPraz > 0) kPraz.textContent = nPraz;
  }

  // Roda agora e a cada 10s
  atualizar();
  setInterval(atualizar, 10000);

  // Também atualiza quando XLS2 terminar de carregar
  var _origXLS2 = window.XLS2_LOADED;
  Object.defineProperty(window, 'XLS2_LOADED', {
    get: function() { return _origXLS2; },
    set: function(v) { _origXLS2 = v; if (v) setTimeout(atualizar, 200); },
    configurable: true
  });
}

function diasRestantes(prazoStr) {
  if (!prazoStr) return null;
  var p = prazoStr.split('/');
  if (p.length !== 3) return null;
  try {
    var d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
    return Math.ceil((d - new Date()) / 86400000);
  } catch(e) { return null; }
}

// ══════════════════════════════════════════
// FIX 2 — BOTÃO VER: busca corpo real do Gmail
// ══════════════════════════════════════════
function fix_ver_email() {
  window.verEmail = function(idx) {
    if (typeof EMAIL === 'undefined') { alert('Sistema não inicializado'); return; }
    var msgs = EMAIL._gmailMsgs;
    if (!msgs || typeof idx === 'undefined' || !msgs[idx]) {
      if (typeof toast === 'function') toast('E-mail não disponível', 'orange');
      return;
    }
    var m = msgs[idx];

    if (!EMAIL.token) {
      if (typeof toast === 'function') toast('Gmail não conectado', 'orange');
      return;
    }

    if (typeof eLog === 'function') eLog('Abrindo: ' + (m.subject||'').substring(0,50), 'info');

    // Indicação visual
    var btn = document.querySelector('[onclick="verEmail('+idx+')"]');
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
      headers: { 'Authorization': 'Bearer ' + EMAIL.token }
    })
    .then(function(r) {
      if (r.status === 401) {
        EMAIL.ok = false; EMAIL.token = null;
        if (typeof DB !== 'undefined') DB.save('lex_gmail_auth', null);
        if (typeof toast === 'function') toast('Sessão expirada — reconecte o Gmail', 'orange');
        if (btn) { btn.textContent = '👁 Ver'; btn.disabled = false; }
        return null;
      }
      return r.json();
    })
    .then(function(msg) {
      if (!msg) return;
      if (btn) { btn.textContent = '👁 Ver'; btn.disabled = false; }

      // Extrai corpo
      var body = '';
      function dig(part) {
        if (!part) return;
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          try {
            var t = atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/'));
            if (t.length > body.length) body = t;
          } catch(e) {}
        }
        if (!body && part.mimeType === 'text/html' && part.body && part.body.data) {
          try {
            var h = atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/'));
            body = h.replace(/<br\s*\/?>/gi,'\n').replace(/<p[^>]*>/gi,'\n')
                    .replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ')
                    .replace(/&amp;/g,'&').replace(/\s{3,}/g,'\n').trim();
          } catch(e) {}
        }
        if (part.parts) part.parts.forEach(dig);
      }
      dig(msg.payload || {});
      if (!body) body = msg.snippet || '';

      // Detecta remetente
      var hdrs = {};
      ((msg.payload && msg.payload.headers) || []).forEach(function(h){ hdrs[h.name]=h.value; });
      var from = hdrs['From'] || m.from || '';
      var isJB = from.toLowerCase().indexOf('jusbrasil') >= 0;

      // Preenche formulário
      var remEl = document.getElementById('emailRem');
      if (remEl) remEl.value = isJB ? 'jusbrasil' : 'impacta';

      var bodEl = document.getElementById('emailBody');
      if (bodEl) bodEl.value = body;

      if (typeof eLog === 'function') eLog('Corpo carregado (' + body.length + ' chars). Extraindo...', 'teal');

      // Extrai + cadastra
      setTimeout(function() {
        if (typeof parseEmailOriginal === 'function') parseEmailOriginal();
        else if (typeof parseEmail === 'function') parseEmail();
        autoCadastrarEmail(body, m.subject || '', from);
      }, 250);
    })
    .catch(function(e) {
      if (btn) { btn.textContent = '👁 Ver'; btn.disabled = false; }
      if (typeof eLog === 'function') eLog('Erro: ' + e.message, 'err');
      if (typeof toast === 'function') toast('Erro ao abrir e-mail', 'orange');
    });
  };
}

// ══════════════════════════════════════════
// FIX 3 — INBOX: renderiza com botão VER correto
// ══════════════════════════════════════════
function fix_render_inbox() {
  window._renderGmail = function(msgs) {
    // Tenta inboxList (div) primeiro, depois inboxBody (table)
    var container = document.getElementById('inboxList');
    var useTable = false;
    if (!container) {
      container = document.getElementById('inboxBody');
      useTable = true;
    }
    if (!container) { console.warn('inboxList e inboxBody não encontrados'); return; }

    EMAIL._gmailMsgs = msgs;
    msgs.sort(function(a,b){ return new Date(b.date)-new Date(a.date); });

    if (!msgs.length) {
      if (useTable) {
        container.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--text3)">📭 Nenhuma publicação.</td></tr>';
      } else {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
      }
      return;
    }

    if (useTable) {
      // Renderiza como linhas de tabela
      container.innerHTML = msgs.map(function(m, i) {
        var isJB = (m.from||'').toLowerCase().indexOf('jusbrasil') >= 0;
        var cor = isJB ? 'bo' : 'bteal';
        var fonte = isJB ? 'JusBrasil' : 'Impacta';
        var d = new Date(m.date);
        var ds = isNaN(d.getTime()) ? (m.date||'') : d.toLocaleDateString('pt-BR');
        return '<tr>'
          + '<td class="tpl"><span class="badge '+cor+'" style="font-size:10px">'+fonte+'</span></td>'
          + '<td style="font-size:12px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(m.subject||'')+'</td>'
          + '<td style="font-size:11px;color:var(--text3)">'+ds+'</td>'
          + '<td style="font-size:11px;color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(m.snippet||'').substring(0,80)+'</td>'
          + '<td class="tpr"><button class="btn btn-teal btn-xs" onclick="verEmail('+i+')">👁 Ver</button></td>'
          + '</tr>';
      }).join('');
    } else {
      // Renderiza como divs
      container.innerHTML = msgs.map(function(m, i) {
        var isJB = (m.from||'').toLowerCase().indexOf('jusbrasil') >= 0;
        var cor = isJB ? 'bo' : 'bteal';
        var fonte = isJB ? 'JusBrasil' : 'Impacta';
        var d = new Date(m.date);
        var ds = isNaN(d.getTime()) ? (m.date||'') : d.toLocaleDateString('pt-BR');
        return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border)">'
          + '<span class="badge '+cor+'" style="font-size:10px;flex-shrink:0;margin-top:2px">'+fonte+'</span>'
          + '<div style="flex:1;min-width:0;cursor:pointer" onclick="window._abrirGmail('+i+')">'
          + '<div style="font-size:12.5px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(m.subject||'(sem assunto)')+'</div>'
          + '<div style="font-size:10.5px;color:var(--text3);margin-top:2px">'+ds+' — '+(m.snippet||'').substring(0,80)+'</div>'
          + '</div>'
          + '<button class="btn btn-teal btn-xs" style="flex-shrink:0" onclick="verEmail('+i+')">👁 Ver</button>'
          + '</div>';
      }).join('');
    }

    var badge = document.getElementById('gmailOkBadge');
    if (badge) badge.style.display = 'inline-block';
  };
}

// ══════════════════════════════════════════
// FIX 4 — AUTO-CADASTRO de clientes
// ══════════════════════════════════════════
function autoCadastrarEmail(corpo, assunto, from) {
  if (!corpo || typeof S === 'undefined') return;

  var isJB = (from||'').toLowerCase().indexOf('jusbrasil') >= 0;
  var fonteId = isJB ? 'jusbrasil' : 'impacta';
  var d = (typeof extrairDados === 'function') ? extrairDados(corpo, fonteId) : null;

  // Encontra nome do cliente em cascata
  var clienteNome = '';

  // 1. Campo Partes: no corpo
  if (d && d.partes) {
    var px = d.partes.split(/\s+[xX×]\s+/);
    if (px[0] && px[0].trim().length > 3) clienteNome = px[0].trim();
  }

  // 2. Assunto "– NOME COMPLETO –"
  if (!clienteNome && assunto) {
    var m1 = assunto.match(/[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜa-záéíóúâêôãõçàü\s]{3,}?)\s*[–\-]/);
    if (m1 && m1[1] && m1[1].trim().length > 3) clienteNome = m1[1].trim();
  }

  // 3. "Iprazos – NOME"
  if (!clienteNome && assunto) {
    var m2 = assunto.match(/[Ii]prazos\s*[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜa-záéíóúâêôãõçàü\s]{3,}?)(?:\s*[–\-]|$)/);
    if (m2 && m2[1] && m2[1].trim().length > 3) clienteNome = m2[1].trim();
  }

  // 4. Cruzamento CNJ no XLS
  if (!clienteNome && d && d.cnjs && d.cnjs.length && typeof XLS !== 'undefined') {
    var num = d.cnjs[0].replace(/[^0-9]/g,'').substring(0,13);
    var xr = XLS.find(function(r){ return r.processo && r.processo.replace(/[^0-9]/g,'').indexOf(num) >= 0; });
    if (xr && xr.parte1) clienteNome = xr.parte1;
  }

  if (!clienteNome || clienteNome.length < 4) {
    if (typeof eLog === 'function') eLog('⚠️ Nome do cliente não detectado', 'warn');
    return;
  }

  // Verifica se já existe
  var norm = clienteNome.trim().toUpperCase().replace(/\s+/g,' ');
  var existe = S.clientes.find(function(c){
    var cn = c.nome.toUpperCase().replace(/\s+/g,' ');
    return cn === norm || (norm.length > 8 && cn.indexOf(norm.substring(0,8)) >= 0);
  });

  if (existe) {
    if (typeof eLog === 'function') eLog('Cliente já existe: ' + existe.nome, 'info');
    return;
  }

  // Adverso
  var adverso = '';
  if (d && d.partes) {
    var padv = d.partes.split(/\s+[xX×]\s+/);
    adverso = (padv[1]||'').trim();
  }
  if (!adverso && d && d.cnjs && d.cnjs.length && typeof XLS !== 'undefined') {
    var num2 = d.cnjs[0].replace(/[^0-9]/g,'').substring(0,13);
    var xrA = XLS.find(function(r){ return r.processo && r.processo.replace(/[^0-9]/g,'').indexOf(num2) >= 0; });
    if (xrA) adverso = xrA.ex_adverso || '';
  }

  // Área
  var area = 'Cível';
  var mov = (d && d.mov) ? d.mov.toUpperCase() : '';
  if (mov.indexOf('TRABALH') >= 0 || mov.indexOf('TRT') >= 0) area = 'Trabalhista';
  else if (mov.indexOf('PENAL') >= 0 || mov.indexOf('CRIMIN') >= 0) area = 'Penal';
  else if (mov.indexOf('FAM') >= 0 || mov.indexOf('DIV') >= 0) area = 'Família';
  else if (mov.indexOf('TRIBUT') >= 0) area = 'Tributário';

  S.clientes.push({
    id: S.nextCid++,
    nome: clienteNome.trim(),
    cpfcnpj: '', email: '', tel: '',
    area: area, tipo: 'PF', status: 'ativo', resp: S.uidAtivo || 1,
    exadverso: adverso,
    endereco: (d && d.vara) ? d.vara : '',
    obs: 'Auto via publicação ' + new Date().toLocaleDateString('pt-BR') + (d && d.cnjs && d.cnjs[0] ? ' | CNJ: '+d.cnjs[0] : '')
  });
  S.cFiltrados = [].concat(S.clientes);

  if (typeof renderKPIClientes === 'function') renderKPIClientes();
  var nb = document.getElementById('nbClientes');
  if (nb) nb.textContent = S.clientes.length;

  if (typeof eLog === 'function') eLog('👤 Cliente cadastrado: ' + clienteNome.trim(), 'ok');
  if (typeof toast === 'function') toast('👤 ' + clienteNome.trim(), 'teal');

  // Registra CNJ para deduplicação Impacta
  if (fonteId === 'impacta' && d && d.cnjs) {
    d.cnjs.forEach(function(c){ if(typeof EMAIL!=='undefined') EMAIL.cnjs_impacta[c]=true; });
  }

  // Prazo automático
  if (d && d.prazo && typeof criarPrazoInterno === 'function') criarPrazoInterno(d);

  if (typeof eKPI === 'function') eKPI();
}

// ══════════════════════════════════════════
// FIX 5 — PROCESSAR TUDO
// ══════════════════════════════════════════
function fix_processar_tudo() {
  window.processarEmails = function() {
    if (typeof EMAIL === 'undefined' || !EMAIL.ok || !EMAIL.token) {
      if (typeof toast === 'function') toast('Conecte o Gmail primeiro', 'orange'); return;
    }
    var msgs = EMAIL._gmailMsgs;
    if (!msgs || !msgs.length) {
      if (typeof toast === 'function') toast('Carregue a caixa de entrada (↻) primeiro', 'blue'); return;
    }
    if (typeof eLog === 'function') eLog('Processando ' + msgs.length + ' e-mails...', 'teal');
    var done = 0;
    msgs.forEach(function(m, i) {
      setTimeout(function() {
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+m.id+'?format=full', {
          headers: {'Authorization':'Bearer '+EMAIL.token}
        }).then(function(r){return r.json();}).then(function(msg){
          var body = '';
          function xb(p){
            if(!p)return;
            if(p.mimeType==='text/plain'&&p.body&&p.body.data){try{var t=atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/'));if(t.length>body.length)body=t;}catch(e){}}
            if(!body&&p.mimeType==='text/html'&&p.body&&p.body.data){try{body=atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}catch(e){}}
            if(p.parts)p.parts.forEach(xb);
          }
          xb(msg.payload||{});
          if(!body) body = m.snippet||'';
          autoCadastrarEmail(body, m.subject||'', m.from||'');
          done++;
          if(done>=msgs.length){
            if(typeof eKPI==='function') eKPI();
            if(typeof toast==='function') toast('✅ '+done+' e-mails processados!','green');
          }
        }).catch(function(){done++;});
      }, i*600);
    });
  };
}

// ══════════════════════════════════════════
// FIX 6 — PARSE MANUAL aciona auto-cadastro
// ══════════════════════════════════════════
function fix_parse_manual() {
  if (typeof window.parseEmail === 'function') {
    window.parseEmailOriginal = window.parseEmail;
  }
  window.parseEmail = function() {
    if (typeof window.parseEmailOriginal === 'function') window.parseEmailOriginal();
    setTimeout(function() {
      var corpo = document.getElementById('emailBody') ? document.getElementById('emailBody').value : '';
      var rem   = document.getElementById('emailRem')  ? document.getElementById('emailRem').value  : 'impacta';
      if (corpo && corpo.trim().length > 10) {
        autoCadastrarEmail(corpo, '', rem==='jusbrasil'?'jusbrasil.com.br':'impacta.adv.br');
      }
    }, 500);
  };
}

// ══════════════════════════════════════════
// FIX 7 — SINCRONIZAR clientes com XLS
// ══════════════════════════════════════════
function fix_auto_cadastro_xls() {
  window.sincronizarClientesXLS = function() {
    if (typeof XLS === 'undefined' || !XLS.length || typeof S === 'undefined') {
      if (typeof toast === 'function') toast('XLS não carregado ainda', 'orange'); return;
    }
    var add = 0;
    var existentes = S.clientes.map(function(c){ return c.nome.toUpperCase().replace(/\s+/g,' '); });
    var ignorar = ['DOCUMENTOS','JUSTIÇA','FEDERAL','ESTADO','MUNICÍPIO','MINISTÉRIO','SINDIC','INQUÉR','BOLETIM','CONTRATOS'];

    XLS.forEach(function(r) {
      var nome = (r.parte1||'').trim();
      if (!nome || nome.length < 4 || /^\d/.test(nome)) return;
      if (ignorar.some(function(k){ return nome.toUpperCase().indexOf(k) >= 0; })) return;
      var norm = nome.toUpperCase().replace(/\s+/g,' ');
      if (existentes.indexOf(norm) >= 0) return;

      var ac = (r.acao||'').toUpperCase();
      var area = ac.indexOf('TRABALH')>=0||ac.indexOf('JCJ')>=0?'Trabalhista'
        :ac.indexOf('PENAL')>=0?'Penal'
        :ac.indexOf('FAM')>=0||ac.indexOf('DIV')>=0?'Família'
        :ac.indexOf('TRIBUT')>=0?'Tributário':'Cível';

      S.clientes.push({
        id:S.nextCid++,nome:nome,cpfcnpj:'',email:'',tel:'',
        area:area,tipo:'PF',status:'ativo',resp:1,
        exadverso:r.ex_adverso||'',endereco:r.vara||'',
        obs:'Importado do XLS — ficha '+(r.ficha||'N/A')
      });
      existentes.push(norm);
      add++;
    });

    S.cFiltrados = [].concat(S.clientes);
    if (typeof renderKPIClientes === 'function') renderKPIClientes();
    var nb = document.getElementById('nbClientes');
    if (nb) nb.textContent = S.clientes.length;
    if (typeof toast === 'function') toast(add > 0 ? '✅ '+add+' clientes sincronizados!' : 'Nenhum cliente novo no XLS','teal');
    if (typeof eLog === 'function') eLog(add+' clientes adicionados do XLS','ok');
  };

  // Adiciona botão na aba Clientes
  setTimeout(function() {
    var ta = document.querySelector('#pg-clientes .topbar-actions');
    if (ta && !document.getElementById('btnSyncXLS')) {
      var b = document.createElement('button');
      b.id = 'btnSyncXLS'; b.className = 'btn btn-teal';
      b.innerHTML = '🔄 Sincronizar Processos→Clientes';
      b.onclick = window.sincronizarClientesXLS;
      ta.insertBefore(b, ta.firstChild);
    }
  }, 1200);
}

// ══════════════════════════════════════════
// FIX 8 — BUSCA com debounce
// ══════════════════════════════════════════
function fix_busca_debounce() {
  var el = document.getElementById('searchProc');
  if (!el) return;
  var t;
  el.oninput = null;
  el.addEventListener('input', function() {
    clearTimeout(t);
    t = setTimeout(function() {
      if (typeof filtrarProcessos === 'function') filtrarProcessos();
    }, 280);
  });
}

// ══════════════════════════════════════════
// FIX 9 — AUTO-SYNC ao conectar Gmail
// ══════════════════════════════════════════
function fix_autosync() {
  var _orig = window.ativarGmailUI;
  window.ativarGmailUI = function() {
    if (_orig) _orig();
    if (typeof EMAIL === 'undefined') return;
    if (EMAIL._syncTimer) clearInterval(EMAIL._syncTimer);
    var min = (EMAIL.cfg && EMAIL.cfg.intervalo) || 15;
    EMAIL._syncTimer = setInterval(function() {
      if (EMAIL.ok && EMAIL.token && typeof carregarInbox === 'function') {
        if (typeof eLog === 'function') eLog('Auto-sync ('+min+'min)...','teal');
        carregarInbox();
      }
    }, min * 60000);
    if (typeof eLog === 'function') eLog('Auto-sync ativo a cada '+min+' min','ok');
  };
  // Se já conectado
  setTimeout(function() {
    if (typeof EMAIL !== 'undefined' && EMAIL.ok && EMAIL.token) {
      if (typeof ativarGmailUI === 'function') ativarGmailUI();
    }
  }, 2000);
}

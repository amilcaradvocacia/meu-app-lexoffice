/**
 * LexOfficeAT — Gestão v2.0
 * Funcionalidades:
 * - Prazos: concluir, embargos (5d auto), recurso 8d/15d, Calendar
 * - Processos: status (ativo/suspenso/arquivado/ag-prazo/ag-audiencia)
 * - Abas com filtros e tabelas dinâmicas
 * REGRAS:
 * - Embargos de Declaração = 5 dias (todos os tribunais)
 * - Recurso Trabalhista = 8 dias (CNJ com .5.XX.)
 * - Recurso em Geral = 15 dias
 */
(function() {
  'use strict';

  /* ── Acesso ao banco ─────────────────────────────────── */
  var DB_KEYS = {
    processos:   'lexat_processos',
    clientes:    'lexat_clientes',
    prazos:      'lexat_prazos',
    publicacoes: 'lexat_publicacoes',
    audiencias:  'lexat_audiencias',
    tarefas:     'lexat_tarefas',
  };

  function getAll(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]') || []; } catch(e) { return []; }
  }
  function saveAll(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch(e) {}
  }
  function updateItem(key, id, updates) {
    var arr = getAll(key);
    var idx = arr.findIndex ? arr.findIndex(function(x){ return x.id === id; })
              : (function(){ for(var i=0;i<arr.length;i++){ if(arr[i].id===id) return i; } return -1; })();
    if (idx >= 0) { Object.assign(arr[idx], updates, {updatedAt: new Date().toISOString()}); saveAll(key, arr); }
  }
  function addItem(key, item) {
    var arr = getAll(key); arr.push(item); saveAll(key, arr.slice(-500));
  }
  function newId(prefix) {
    return (prefix||'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  }

  function getToken() {
    return localStorage.getItem('lex_gmail_token') || localStorage.getItem('lex_gmail_auth');
  }

  /* ── Cálculo de prazo ────────────────────────────────── */
  function calcPrazo(texto, cnj) {
    var t = (texto || '').toLowerCase();
    var isTrab = /\.5\.\d{2}\./.test(cnj || '');
    if (/embargos?\s*(de)?\s*declar/i.test(t))  return { dias: 5,  tipo: 'Embargos de Declaração' };
    if (/contest|defesa/i.test(t))               return { dias: 20, tipo: 'Contestação' };
    if (/recurso\s+ordin|apelac/i.test(t))       return { dias: isTrab ? 8 : 15, tipo: isTrab ? 'Recurso Ordinário' : 'Apelação' };
    if (/agravo/i.test(t))                       return { dias: isTrab ? 8 : 15, tipo: 'Agravo' };
    if (/sentenc|julgament/i.test(t))            return { dias: isTrab ? 8 : 15, tipo: isTrab ? 'Recurso Ordinário' : 'Apelação' };
    if (/recurso/i.test(t))                      return { dias: isTrab ? 8 : 15, tipo: 'Recurso' };
    if (/intima|manifest|vista|prazo/i.test(t))  return { dias: 5,  tipo: 'Manifestação' };
    return { dias: 5, tipo: 'Manifestação' };
  }

  /* ── Google Calendar ─────────────────────────────────── */
  function addCalendar(prazo) {
    var tok = getToken();
    if (!tok || !prazo.vencimentoISO) return;
    var ev = {
      summary: (prazo.tipo || 'Prazo') + ' — ' + (prazo.cliente || prazo.cnj || '').slice(0, 35),
      description: 'CNJ: ' + (prazo.cnj || '') + '\nVara: ' + (prazo.vara || ''),
      start: { date: prazo.vencimentoISO },
      end:   { date: prazo.vencimentoISO },
      colorId: prazo.urgencia === 'alta' ? '11' : '5',
      reminders: { useDefault: false, overrides: [
        { method: 'popup', minutes: 1440 },
        { method: 'popup', minutes: 4320 },
      ]},
    };
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
    }).then(function(r) { return r.json(); })
      .then(function(e) {
        if (e.id) {
          updateItem(DB_KEYS.prazos, prazo.id, { calendarEventId: e.id });
          if (typeof toast === 'function') toast('📅 Prazo adicionado ao Google Calendar', 'teal');
        }
      }).catch(function() {});
  }

  /* ── Aba PRAZOS ──────────────────────────────────────── */
  function renderPrazos(filtro) {
    filtro = filtro || 'pendente';
    var cont = document.getElementById('pg-prazos');
    if (!cont) return;
    var hoje = new Date();

    // Carrega e calcula dias
    var todos = getAll(DB_KEYS.prazos).map(function(p) {
      var vISO = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
      var dias = Math.ceil((new Date(vISO) - hoje) / 86400000);
      return Object.assign({}, p, { dias: dias });
    });

    // Deduplica por CNJ+tipo+vencimento
    var seen = {};
    todos = todos.filter(function(p) {
      var k = (p.cnj||'') + '|' + (p.tipo||'') + '|' + (p.vencimentoISO||p.vencimento||'');
      if (seen[k]) return false; seen[k] = true; return true;
    });

    // Contadores
    var cnt = { pendente: 0, concluido: 0, embargos: 0, todos: todos.length };
    todos.forEach(function(p) { if (cnt[p.status] !== undefined) cnt[p.status]++; });

    // Prazos urgentes para badge
    var urg = todos.filter(function(p) { return p.status==='pendente' && p.dias <= 7; }).length;
    var sb = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sb) sb.textContent = urg || todos.filter(function(p){ return p.status==='pendente'; }).length;

    // Lista filtrada
    var lista = filtro === 'todos' ? todos : todos.filter(function(p) { return p.status === filtro; });
    lista.sort(function(a, b) { return a.dias - b.dias; });

    // Remove painel anterior
    var old = document.getElementById('lexPrazosPanel');
    if (old) old.remove();

    // Cria painel
    var panel = document.createElement('div');
    panel.id = 'lexPrazosPanel';
    panel.style.padding = '12px';

    // Filtros
    var fRow = document.createElement('div');
    fRow.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap';
    [
      { v: 'pendente',  l: '⏰ Pendentes',   cnt: cnt.pendente  },
      { v: 'concluido', l: '✅ Concluídos',   cnt: cnt.concluido },
      { v: 'embargos',  l: '📋 Embargos',     cnt: cnt.embargos  },
      { v: 'todos',     l: '📁 Todos',         cnt: cnt.todos     },
    ].forEach(function(ft) {
      var b = document.createElement('button');
      b.className = 'btn btn-sm ' + (filtro === ft.v ? 'btn-teal' : 'btn-ghost');
      b.textContent = ft.l + ' (' + ft.cnt + ')';
      b.onclick = function() { renderPrazos(ft.v); };
      fRow.appendChild(b);
    });
    panel.appendChild(fRow);

    // Tabela
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="cb" style="overflow-x:auto">'
      + '<table class="dtable" style="min-width:680px">'
      + '<thead><tr>'
      + '<th>CNJ</th><th>Cliente</th><th>Tipo</th><th>Vara</th>'
      + '<th>Vencimento</th><th>Dias</th><th>Status</th><th>Ações</th>'
      + '</tr></thead>'
      + '<tbody id="lexPrazosTbody"></tbody>'
      + '</table></div>';
    panel.appendChild(card);

    // Injeta painel na página
    var content = cont.querySelector('.content') || cont;
    content.insertBefore(panel, content.firstChild);

    var tbody = document.getElementById('lexPrazosTbody');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">'
        + 'Nenhum prazo ' + filtro + '</td></tr>';
      return;
    }

    lista.forEach(function(p) {
      var cor = p.dias <= 0 ? 'var(--red)' : p.dias <= 3 ? 'var(--red)' : p.dias <= 7 ? 'var(--orange)' : 'var(--green)';
      var badgeTxt = p.dias <= 0 ? 'VENCIDO' : p.dias <= 3 ? 'URGENTE' : p.dias <= 7 ? 'ATENÇÃO' : 'OK';
      var badgeCls = p.dias <= 3 ? 'br' : p.dias <= 7 ? 'bo' : 'bteal';
      if (p.status === 'concluido') { badgeTxt = '✅ Concluído'; badgeCls = 'bteal'; cor = 'var(--text3)'; }
      if (p.status === 'embargos')  { badgeTxt = '📋 Embargos';  badgeCls = 'bg'; }

      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = '<td style="font-size:11px;color:var(--teal)">'   + (p.cnj||'').slice(0,22)  + '</td>'
        + '<td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.cliente||'').slice(0,26) + '</td>'
        + '<td style="font-size:12px">'                                + (p.tipo||'').split('—')[0].trim() + '</td>'
        + '<td style="font-size:11px;color:var(--text3)">'             + (p.vara||'').slice(0,18)  + '</td>'
        + '<td style="color:' + cor + '">'                             + (p.vencimento||'')        + '</td>'
        + '<td style="color:' + cor + ';font-weight:700;text-align:center">' + (p.dias <= 0 ? p.dias : '+' + p.dias) + 'd</td>'
        + '<td><span class="badge ' + badgeCls + '">' + badgeTxt + '</span></td>'
        + '<td></td>';

      tbody.appendChild(tr);

      var acoes = tr.cells[7];
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap';

      if (p.status === 'pendente') {
        // Concluir
        var bOk = document.createElement('button');
        bOk.className = 'btn btn-ghost btn-xs'; bOk.style.color = '#4ade98'; bOk.textContent = '✅ OK';
        bOk.onclick = function(e) {
          e.stopPropagation();
          updateItem(DB_KEYS.prazos, p.id, { status: 'concluido' });
          renderPrazos('pendente');
          if (typeof toast === 'function') toast('✅ Prazo concluído', 'teal');
        };
        btns.appendChild(bOk);

        // Embargos
        var bEmb = document.createElement('button');
        bEmb.className = 'btn btn-ghost btn-xs'; bEmb.style.color = '#6898ff'; bEmb.textContent = '📋 Emb.';
        bEmb.onclick = function(e) {
          e.stopPropagation();
          updateItem(DB_KEYS.prazos, p.id, { status: 'embargos' });
          // Cria novo prazo de 5 dias para embargos
          var venc = new Date(); venc.setDate(venc.getDate() + 5);
          var vencBR = venc.toLocaleDateString('pt-BR');
          var vencISO = venc.toISOString().slice(0, 10);
          var novo = {
            id: newId('prazo'), cnj: p.cnj, cliente: p.cliente,
            tipo: 'Embargos de Declaração — 5 dias',
            fundamento: 'Embargos opostos ao prazo: ' + (p.tipo || ''),
            urgencia: 'alta', dias: 5, vencimento: vencBR, vencimentoISO: vencISO,
            vara: p.vara || '', tribunal: p.tribunal || '',
            status: 'pendente', createdAt: new Date().toISOString(),
          };
          addItem(DB_KEYS.prazos, novo);
          addCalendar(novo);
          renderPrazos('pendente');
          if (typeof toast === 'function') toast('📋 Embargos: prazo 5 dias criado — ' + vencBR, 'teal');
        };
        btns.appendChild(bEmb);

        // Calendar
        var bCal = document.createElement('button');
        bCal.className = 'btn btn-ghost btn-xs'; bCal.textContent = '📅';
        bCal.title = 'Adicionar ao Google Calendar';
        bCal.onclick = function(e) { e.stopPropagation(); addCalendar(p); };
        btns.appendChild(bCal);

      } else {
        // Reabrir
        var bRe = document.createElement('button');
        bRe.className = 'btn btn-ghost btn-xs'; bRe.style.color = '#fbb040'; bRe.textContent = '↩ Reabrir';
        bRe.onclick = function(e) {
          e.stopPropagation();
          updateItem(DB_KEYS.prazos, p.id, { status: 'pendente' });
          renderPrazos(filtro);
        };
        btns.appendChild(bRe);
      }

      acoes.appendChild(btns);

      // Clique na linha abre detalhes
      tr.onclick = function(e) {
        if (e.target.tagName === 'BUTTON') return;
        if (typeof window.lexVerPrazoDetalhe === 'function') window.lexVerPrazoDetalhe(p);
        else {
          if (p.cnj) {
            var ci = document.getElementById('cnj_input_api');
            if (ci) ci.value = p.cnj;
            if (typeof openModal === 'function') openModal('mProcesso');
            setTimeout(function() { if (typeof window.consultarCNJ === 'function') window.consultarCNJ(); }, 400);
          }
        }
      };
    });
  }

  /* ── Aba PROCESSOS ───────────────────────────────────── */
  function renderProcessos(filtro) {
    filtro = filtro || 'ativo';
    var cont = document.getElementById('pg-processos');
    if (!cont) return;

    var todos = getAll(DB_KEYS.processos);
    var cnt = { ativo: 0, suspenso: 0, arquivado: 0, 'ag-prazo': 0, 'ag-audiencia': 0, todos: todos.length };
    todos.forEach(function(p) {
      var s = p.status || 'ativo';
      if (cnt[s] !== undefined) cnt[s]++;
    });

    var lista = filtro === 'todos' ? todos : todos.filter(function(p) { return (p.status || 'ativo') === filtro; });

    var old = document.getElementById('lexProcPanel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.id = 'lexProcPanel';
    panel.style.padding = '12px';

    // Filtros
    var fRow = document.createElement('div');
    fRow.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap';
    [
      { v: 'ativo',        l: '⚖️ Em Andamento', cnt: cnt.ativo          },
      { v: 'ag-prazo',     l: '⏰ Ag. Prazo',     cnt: cnt['ag-prazo']   },
      { v: 'ag-audiencia', l: '🏛️ Ag. Audiência', cnt: cnt['ag-audiencia']},
      { v: 'suspenso',     l: '⏸️ Suspenso',       cnt: cnt.suspenso      },
      { v: 'arquivado',    l: '📁 Arquivado',       cnt: cnt.arquivado     },
      { v: 'todos',        l: '📋 Todos',           cnt: cnt.todos         },
    ].forEach(function(ft) {
      var b = document.createElement('button');
      b.className = 'btn btn-sm ' + (filtro === ft.v ? 'btn-teal' : 'btn-ghost');
      b.textContent = ft.l + ' (' + ft.cnt + ')';
      b.onclick = function() { renderProcessos(ft.v); };
      fRow.appendChild(b);
    });
    panel.appendChild(fRow);

    // Tabela
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="cb" style="overflow-x:auto">'
      + '<table class="dtable" style="min-width:700px">'
      + '<thead><tr>'
      + '<th>Ficha</th><th>CNJ</th><th>Cliente</th><th>Polo</th>'
      + '<th>Vara</th><th>Status</th><th>Alterar</th>'
      + '</tr></thead>'
      + '<tbody id="lexProcTbody"></tbody>'
      + '</table></div>';
    panel.appendChild(card);

    var content = cont.querySelector('.content') || cont;
    content.insertBefore(panel, content.firstChild);

    var tbody = document.getElementById('lexProcTbody');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">'
        + 'Nenhum processo ' + filtro + '</td></tr>';
      return;
    }

    var sLabels = { ativo: 'Em Andamento', suspenso: 'Suspenso', arquivado: 'Arquivado', 'ag-prazo': 'Ag. Prazo', 'ag-audiencia': 'Ag. Audiência' };
    var sBadge  = { ativo: 'bteal', suspenso: 'bo', arquivado: 'bg', 'ag-prazo': 'br', 'ag-audiencia': 'blue' };

    lista.slice(0, 200).forEach(function(p) {
      var s = p.status || 'ativo';
      var tr = document.createElement('tr'); tr.style.cursor = 'pointer';
      tr.innerHTML = '<td style="color:var(--gold);font-weight:600">'           + (p.ficha||'')           + '</td>'
        + '<td style="font-size:11px;color:var(--teal)">'                       + (p.cnj||'')             + '</td>'
        + '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.polo_cliente||'').slice(0,25) + '</td>'
        + '<td><span class="badge ' + (p.polo_processual==='RÉU'?'br':'bteal') + '" style="font-size:10px">' + (p.polo_processual||'') + '</span></td>'
        + '<td style="font-size:11px;color:var(--text3)">'                      + (p.vara||p.tribunal||'').slice(0,20) + '</td>'
        + '<td><span class="badge ' + (sBadge[s]||'bg') + '" style="font-size:10px">' + (sLabels[s]||s) + '</span></td>'
        + '<td></td>';

      tbody.appendChild(tr);

      // Select de status
      var sel = document.createElement('select');
      sel.className = 'btn btn-ghost btn-xs';
      sel.style.cssText = 'font-size:11px;padding:2px 6px;cursor:pointer;max-width:120px';
      [
        { v: 'ativo',        l: 'Em Andamento'  },
        { v: 'ag-prazo',     l: 'Ag. Prazo'     },
        { v: 'ag-audiencia', l: 'Ag. Audiência' },
        { v: 'suspenso',     l: 'Suspenso'       },
        { v: 'arquivado',    l: 'Arquivado'       },
      ].forEach(function(opt) {
        var o = document.createElement('option');
        o.value = opt.v; o.textContent = opt.l;
        if (s === opt.v) o.selected = true;
        sel.appendChild(o);
      });

      sel.onchange = function(e) {
        e.stopPropagation();
        updateItem(DB_KEYS.processos, p.id, { status: this.value });
        if (typeof toast === 'function') toast('Status: ' + this.options[this.selectedIndex].text, 'teal');
        renderProcessos(filtro);
      };

      tr.cells[6].appendChild(sel);

      // Clique abre processo
      tr.onclick = function(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        if (typeof openModal === 'function') {
          openModal('mProcesso');
          setTimeout(function() {
            if (typeof switchTab === 'function') switchTab('dados');
            var sv = function(id, v) { var el=document.getElementById(id); if(el&&v) el.value=String(v); };
            sv('f_proc', p.ficha); sv('f_auto', p.cnj); sv('f_acao', p.tipo_acao);
            sv('f_vara', p.vara); sv('f_comarca', p.comarca);
            sv('f_parte1', p.polo_cliente); sv('f_exadv', p.ex_adverso); sv('f_adv_adv', p.adv_adverso);
            var re = document.getElementById('f_resp');
            if (re) for (var i=0; i<re.options.length; i++) {
              if (re.options[i].text.toLowerCase().includes('amilcar')) { re.selectedIndex=i; break; }
            }
            var selBy = function(id, v) {
              var el=document.getElementById(id); if(!el||!v)return;
              for(var i=0;i<el.options.length;i++){if(el.options[i].value===v||el.options[i].value.toUpperCase()===v.toUpperCase()){el.selectedIndex=i;break;}}
            };
            selBy('f_polo', p.polo_processual||'RÉU'); selBy('f_status', p.status||'ativo');
            var b = document.getElementById('autoFillBanner');
            if (b) { b.style.display='flex'; b.innerHTML='LexDB: '+(p.ficha||p.cnj)+' — '+(p.polo_cliente||''); }
          }, 300);
        }
      };
    });
  }

  /* ── Aba PUBLICAÇÕES ─────────────────────────────────── */
  function renderPublicacoes() {
    var el = document.getElementById('inboxList');
    if (!el) return;
    var pubs = getAll(DB_KEYS.publicacoes).slice(-100).reverse();
    if (!pubs.length) {
      el.innerHTML = '<div style="color:var(--text3);padding:24px;text-align:center">'
        + 'Nenhuma publicação importada.<br>'
        + '<button class="btn btn-teal btn-sm" style="margin-top:12px" onclick="if(typeof lexImportarGmail===\'function\')lexImportarGmail()">📬 Importar do Gmail</button>'
        + '</div>';
      return;
    }
    el.innerHTML = '';
    pubs.forEach(function(pub) {
      var div = document.createElement('div');
      div.className = 'ditem';
      div.style.cssText = 'flex-direction:column;gap:4px;margin-bottom:6px;cursor:pointer;padding:10px;border-radius:8px;border:1px solid var(--border)';
      var dt = (pub.data_pub || '').split('-').reverse().join('/') || (pub.createdAt||'').slice(0,10).split('-').reverse().join('/');
      var srcL = pub.fonte === 'trt9_push' ? 'TRT9 Push' : pub.fonte === 'jusbrasil' ? 'JusBrasil' : 'Impacta';
      var srcC = pub.fonte === 'trt9_push' ? 'bteal' : 'bo';
      div.innerHTML = '<div style="display:flex;align-items:center;gap:7px">'
        + '<span class="badge ' + srcC + '" style="font-size:10px">' + srcL + '</span>'
        + '<span style="font-size:11px;color:var(--teal);font-family:monospace">' + (pub.cnj||'').slice(0,25) + '</span>'
        + '<span style="font-size:10px;color:var(--text3);margin-left:auto">' + dt + '</span>'
        + '</div>'
        + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
        + '<span style="font-size:12px;color:var(--gold);font-weight:600">' + (pub.nosso_cliente||pub.polo_ativo||'').slice(0,30) + '</span>'
        + (pub.adverso||pub.polo_passivo ? '<span style="font-size:12px;color:var(--text2)">vs ' + (pub.adverso||pub.polo_passivo||'').slice(0,25) + '</span>' : '')
        + '</div>'
        + ((pub.movimentacao||pub.movimento||'').slice(0,100)
          ? '<div style="font-size:11px;color:var(--text2);border-top:1px solid var(--border);padding-top:4px">' + (pub.movimentacao||pub.movimento||'').slice(0,100) + '</div>'
          : '');
      div.onclick = function() {
        if (!pub.cnj) return;
        var ci = document.getElementById('cnj_input_api');
        if (ci) ci.value = pub.cnj;
        if (typeof openModal === 'function') openModal('mProcesso');
        setTimeout(function() { if (typeof window.consultarCNJ === 'function') window.consultarCNJ(); }, 400);
      };
      el.appendChild(div);
    });
  }

  /* ── Expõe e hookar go() ─────────────────────────────── */
  window.lexRenderPrazosAba    = renderPrazos;
  window.lexRenderProcAba      = renderProcessos;
  window.lexRenderPublicacoes  = renderPublicacoes;

  // Hook único no lex:navigate
  function onNav(evt) {
    var page = evt && evt.detail && evt.detail.page;
    if (!page) return;
    if (page === 'prazos')    setTimeout(function(){ renderPrazos('pendente'); },    200);
    if (page === 'processos') setTimeout(function(){ renderProcessos('ativo'); },    200);
    if (page === 'emails')    setTimeout(function(){ renderPublicacoes(); },          200);
  }
  document.removeEventListener('lex:navigate', window._lexGestaoNav);
  window._lexGestaoNav = onNav;
  document.addEventListener('lex:navigate', onNav);

  // Init após DOM
  setTimeout(function() {
    // Atualiza badge de prazos
    var prazos = getAll(DB_KEYS.prazos).filter(function(p){ return p.status==='pendente'; });
    var urg = prazos.filter(function(p){
      var v = p.vencimentoISO || (p.vencimento||'').split('/').reverse().join('-');
      return Math.ceil((new Date(v) - new Date()) / 86400000) <= 7;
    }).length;
    var sb = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sb) sb.textContent = urg || prazos.length;
    // Badge publicações
    var pubs = getAll(DB_KEYS.publicacoes);
    var sbP = document.querySelector('.nitem[onclick*="emails"] .nbadge');
    if (sbP) sbP.textContent = pubs.length > 200 ? '200+' : pubs.length;
    console.log('[Gestão] ✅ v2.0 pronto — Prazos:' + prazos.length + ' Pubs:' + pubs.length);
  }, 2000);

})();

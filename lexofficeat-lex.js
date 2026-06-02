/**
 * LexOfficeAT — Módulo Central v3.0
 * Um único arquivo. Sem dependências externas.
 * Funciona direto do localStorage.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     BANCO DE DADOS — lê/escreve direto no localStorage
  ═══════════════════════════════════════════════════════ */
  var K = {
    processos:   'lexat_processos',
    clientes:    'lexat_clientes',
    prazos:      'lexat_prazos',
    publicacoes: 'lexat_publicacoes',
    audiencias:  'lexat_audiencias',
    tarefas:     'lexat_tarefas',
  };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]') || []; }
    catch (e) { return []; }
  }
  function save(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function upd(key, id, patch) {
    var a = load(key);
    for (var i = 0; i < a.length; i++) {
      if (a[i].id === id) { Object.assign(a[i], patch); save(key, a); return; }
    }
  }
  function add(key, item) {
    var a = load(key);
    a.push(item);
    save(key, a.slice(-500));
  }
  function uid(p) {
    return (p || 'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }
  function tok() {
    return localStorage.getItem('lex_gmail_token') ||
           localStorage.getItem('lex_gmail_auth') || '';
  }

  /* ═══════════════════════════════════════════════════════
     CÁLCULO DE PRAZOS
  ═══════════════════════════════════════════════════════ */
  function calcPrazo(texto, cnj) {
    var t = (texto || '').toLowerCase();
    var trab = /\.5\.\d{2}\./.test(cnj || '');
    if (/embargos?\s*(de\s*)?declar/i.test(t))  return { dias: 5,  tipo: 'Embargos de Declaração' };
    if (/contest|defesa/i.test(t))              return { dias: 20, tipo: 'Contestação' };
    if (/recurso\s+ordin|apelac/i.test(t))      return { dias: trab ? 8 : 15, tipo: trab ? 'Recurso Ordinário' : 'Apelação' };
    if (/agravo/i.test(t))                      return { dias: trab ? 8 : 15, tipo: 'Agravo' };
    if (/sentenc|julgament/i.test(t))           return { dias: trab ? 8 : 15, tipo: trab ? 'Recurso Ordinário' : 'Apelação' };
    if (/recurso/i.test(t))                     return { dias: trab ? 8 : 15, tipo: 'Recurso' };
    return { dias: 5, tipo: 'Manifestação' };
  }

  function diasParaData(dias) {
    var d = new Date();
    d.setDate(d.getDate() + dias);
    return { br: d.toLocaleDateString('pt-BR'), iso: d.toISOString().slice(0, 10) };
  }

  /* ═══════════════════════════════════════════════════════
     GOOGLE CALENDAR
  ═══════════════════════════════════════════════════════ */
  function addCalendar(prazo) {
    var t = tok();
    if (!t || !prazo.vencimentoISO) return;
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: (prazo.tipo || 'Prazo') + ' — ' + (prazo.cliente || prazo.cnj || '').slice(0, 35),
        description: 'CNJ: ' + (prazo.cnj || '') + '\nVara: ' + (prazo.vara || ''),
        start: { date: prazo.vencimentoISO }, end: { date: prazo.vencimentoISO },
        colorId: prazo.urgencia === 'alta' ? '11' : '5',
        reminders: { useDefault: false, overrides: [
          { method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 4320 }
        ]}
      })
    }).then(function (r) { return r.json(); })
      .then(function (e) {
        if (e.id) { upd(K.prazos, prazo.id, { calendarId: e.id }); }
        if (typeof toast === 'function') toast('📅 Adicionado ao Calendar', 'teal');
      }).catch(function () {});
  }

  /* ═══════════════════════════════════════════════════════
     DASHBOARD
  ═══════════════════════════════════════════════════════ */
  function renderDash() {
    var hoje = new Date();

    /* — prazos críticos — */
    var boxP = document.getElementById('dashPrazosConteudo');
    if (boxP) {
      var prazos = load(K.prazos)
        .filter(function (p) { return p.status === 'pendente' || p.status === 'embargos'; })
        .map(function (p) {
          var v = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
          return Object.assign({}, p, { _dias: Math.ceil((new Date(v) - hoje) / 86400000) });
        })
        .sort(function (a, b) { return a._dias - b._dias; })
        .slice(0, 5);

      if (!prazos.length) {
        boxP.innerHTML = '<p style="color:var(--text3);text-align:center;padding:12px">Sem prazos pendentes</p>';
      } else {
        boxP.innerHTML = prazos.map(function (p) {
          var cor = p._dias <= 0 ? 'var(--red)' : p._dias <= 3 ? 'var(--red)' : p._dias <= 7 ? 'var(--orange)' : 'var(--green)';
          var ico = p._dias <= 0 ? '🔴' : p._dias <= 3 ? '⚠️' : p._dias <= 7 ? '⚡' : '✅';
          var pct = Math.min(100, Math.max(4, (10 - p._dias) / 10 * 100));
          var cls = p._dias <= 3 ? 'c' : p._dias <= 7 ? 'w' : 'g';
          return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">'
            + '<div style="font-size:13px;color:var(--text)">'
            + (p.tipo || '').split('—')[0].trim().slice(0, 25) + ' — ' + (p.cliente || '').slice(0, 22) + '</div>'
            + '<div style="font-size:11px;color:' + cor + ';margin-top:2px">'
            + ico + ' ' + (p._dias <= 0 ? 'VENCIDO' : 'Vence em ' + p._dias + ' dias')
            + ' · ' + (p.vara || '').slice(0, 20) + '</div>'
            + '<div class="pbar"><div class="pfill ' + cls + '" style="width:' + pct + '%"></div></div>'
            + '</div>';
        }).join('');
      }
    }

    /* — tarefas — */
    var boxT = document.getElementById('dashTarefasConteudo');
    if (boxT) {
      var tars = load(K.tarefas)
        .filter(function (t) { return t.status === 'pendente' && t.cnj; })
        .sort(function (a, b) { return (a.prioridade === 'alta' ? 0 : 1) - (b.prioridade === 'alta' ? 0 : 1); })
        .slice(0, 4);
      if (!tars.length) {
        boxT.innerHTML = '<p style="color:var(--text3);text-align:center;padding:12px">Sem tarefas pendentes</p>';
      } else {
        boxT.innerHTML = tars.map(function (t) {
          var cor = t.prioridade === 'alta' ? 'var(--red)' : 'var(--orange)';
          return '<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">'
            + '<div style="width:8px;height:8px;border-radius:50%;background:' + cor + ';margin-top:4px;flex-shrink:0"></div>'
            + '<div><div style="font-size:13px;color:var(--text)">' + (t.tipo || '').slice(0, 38) + '</div>'
            + '<div style="font-size:11px;color:var(--text3)">' + (t.cliente || '').slice(0, 25)
            + (t.prioridade === 'alta' ? ' · <b style="color:var(--red)">Urgente</b>' : '')
            + (t.vencimento ? ' · ' + t.vencimento : '') + '</div></div></div>';
        }).join('');
      }
    }

    /* — audiências — */
    var boxA = document.getElementById('dashAudienciasConteudo');
    if (boxA) {
      var auds = load(K.audiencias)
        .filter(function (a) { return a.status !== 'realizada'; })
        .sort(function (a, b) { return new Date(a.dataISO || 0) - new Date(b.dataISO || 0); })
        .slice(0, 3);
      if (!auds.length) {
        boxA.innerHTML = '<p style="color:var(--text3);text-align:center;padding:12px">Sem audiências próximas</p>';
      } else {
        boxA.innerHTML = auds.map(function (a) {
          var pts = (a.data || '').split('/');
          var mes = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+pts[1]] || '';
          return '<div class="aitem"><div class="adate"><div class="d">' + (pts[0] || '') + '</div>'
            + '<div class="m">' + mes + '</div></div>'
            + '<div style="flex:1"><div style="font-size:13px;color:var(--text)">' + (a.cliente || a.processo || '').slice(0, 35) + '</div>'
            + '<div style="font-size:11px;color:var(--text3)">' + (a.vara || '').slice(0, 28)
            + (a.hora ? ' · ' + a.hora + 'h' : '')
            + ' · <span class="badge bteal">' + (a.tipo || 'Audiência') + '</span></div></div></div>';
        }).join('');
      }
    }

    /* — badges sidebar — */
    var prazosUrg = load(K.prazos).filter(function (p) {
      if (p.status !== 'pendente') return false;
      var v = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
      return Math.ceil((new Date(v) - hoje) / 86400000) <= 7;
    });
    var sbPr = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sbPr) sbPr.textContent = prazosUrg.length || load(K.prazos).filter(function(p){return p.status==='pendente';}).length;

    var pubs = load(K.publicacoes);
    var sbPb = document.querySelector('.nitem[onclick*="emails"] .nbadge');
    if (sbPb) sbPb.textContent = pubs.length > 200 ? '200+' : pubs.length;

    var tarsP = load(K.tarefas).filter(function(t){return t.status==='pendente';});
    var sbTar = document.querySelector('.nitem[onclick*="tarefas"] .nbadge');
    if (sbTar) sbTar.textContent = tarsP.length;
  }

  /* ═══════════════════════════════════════════════════════
     ABA PRAZOS
  ═══════════════════════════════════════════════════════ */
  function renderPrazos(filtro) {
    filtro = filtro || 'pendente';
    var cont = document.getElementById('pg-prazos');
    if (!cont) return;
    var hoje = new Date();

    var todos = load(K.prazos).map(function (p) {
      var v = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
      return Object.assign({}, p, { _dias: Math.ceil((new Date(v) - hoje) / 86400000) });
    });

    /* dedup */
    var seen = {};
    todos = todos.filter(function (p) {
      var k = (p.cnj || '') + '|' + (p.tipo || '') + '|' + (p.vencimentoISO || p.vencimento || '');
      if (seen[k]) return false; seen[k] = true; return true;
    });

    var cnt = { pendente: 0, concluido: 0, embargos: 0, todos: todos.length };
    todos.forEach(function (p) { if (cnt[p.status] !== undefined) cnt[p.status]++; });
    var lista = filtro === 'todos' ? todos : todos.filter(function (p) { return p.status === filtro; });
    lista.sort(function (a, b) { return a._dias - b._dias; });

    /* monta painel */
    var old = document.getElementById('lexPrazosPanel');
    if (old) old.remove();
    var panel = document.createElement('div');
    panel.id = 'lexPrazosPanel';
    panel.style.padding = '12px';

    /* filtros */
    var fRow = document.createElement('div');
    fRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
    [
      { v: 'pendente', l: '⏰ Pendentes (' + cnt.pendente + ')' },
      { v: 'concluido', l: '✅ Concluídos (' + cnt.concluido + ')' },
      { v: 'embargos', l: '📋 Embargos (' + cnt.embargos + ')' },
      { v: 'todos', l: '📁 Todos (' + cnt.todos + ')' },
    ].forEach(function (ft) {
      var b = document.createElement('button');
      b.className = 'btn btn-sm ' + (filtro === ft.v ? 'btn-teal' : 'btn-ghost');
      b.textContent = ft.l;
      b.onclick = function () { renderPrazos(ft.v); };
      fRow.appendChild(b);
    });
    panel.appendChild(fRow);

    /* tabela */
    var card = document.createElement('div'); card.className = 'card';
    card.innerHTML = '<div class="cb" style="overflow-x:auto">'
      + '<table class="dtable" style="min-width:660px">'
      + '<thead><tr><th>CNJ</th><th>Cliente</th><th>Tipo</th><th>Vara</th><th>Vencimento</th><th>Dias</th><th>Status</th><th>Ações</th></tr></thead>'
      + '<tbody id="lexPrazosTbody"></tbody></table></div>';
    panel.appendChild(card);

    var content = cont.querySelector('.content');
    if (!content) { content = document.createElement('div'); content.className = 'content'; cont.appendChild(content); }
    /* limpa conteúdo estático */
    Array.prototype.slice.call(content.children).forEach(function (c) { c.style.display = 'none'; });
    content.insertBefore(panel, content.firstChild);
    panel.style.display = 'block';

    var tbody = document.getElementById('lexPrazosTbody');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Sem prazos ' + filtro + '</td></tr>';
      return;
    }

    lista.forEach(function (p) {
      var cor = p._dias <= 0 ? 'var(--red)' : p._dias <= 3 ? 'var(--red)' : p._dias <= 7 ? 'var(--orange)' : 'var(--green)';
      var bl = p._dias <= 0 ? 'VENCIDO' : p._dias <= 3 ? 'URGENTE' : p._dias <= 7 ? 'ATENÇÃO' : 'OK';
      var bc = p._dias <= 3 ? 'br' : p._dias <= 7 ? 'bo' : 'bteal';
      if (p.status === 'concluido') { bl = '✅ OK'; bc = 'bteal'; cor = 'var(--text3)'; }
      if (p.status === 'embargos')  { bl = '📋 Emb.'; bc = 'bg'; }

      var tr = document.createElement('tr'); tr.style.cursor = 'pointer';
      tr.innerHTML =
        '<td style="font-size:11px;color:var(--teal)">' + (p.cnj || '').slice(0, 22) + '</td>'
        + '<td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.cliente || '').slice(0, 26) + '</td>'
        + '<td style="font-size:12px">' + (p.tipo || '').split('—')[0].trim() + '</td>'
        + '<td style="font-size:11px;color:var(--text3)">' + (p.vara || '').slice(0, 18) + '</td>'
        + '<td style="color:' + cor + '">' + (p.vencimento || '') + '</td>'
        + '<td style="color:' + cor + ';font-weight:700;text-align:center">' + (p._dias <= 0 ? p._dias : '+' + p._dias) + 'd</td>'
        + '<td><span class="badge ' + bc + '">' + bl + '</span></td>'
        + '<td></td>';
      tbody.appendChild(tr);

      var acoes = tr.cells[7];
      var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:3px';

      if (p.status === 'pendente') {
        var bOk = document.createElement('button'); bOk.className = 'btn btn-ghost btn-xs'; bOk.style.color = '#4ade98'; bOk.textContent = '✅';
        bOk.title = 'Marcar concluído';
        bOk.onclick = function (e) {
          e.stopPropagation();
          upd(K.prazos, p.id, { status: 'concluido' });
          renderPrazos('pendente');
          if (typeof toast === 'function') toast('✅ Prazo concluído', 'teal');
          renderDash();
        };
        btns.appendChild(bOk);

        var bEmb = document.createElement('button'); bEmb.className = 'btn btn-ghost btn-xs'; bEmb.style.color = '#6898ff'; bEmb.textContent = '📋 Emb.';
        bEmb.title = 'Registrar Embargos de Declaração (5 dias)';
        bEmb.onclick = function (e) {
          e.stopPropagation();
          upd(K.prazos, p.id, { status: 'embargos' });
          var d5 = diasParaData(5);
          var novo = { id: uid('pr'), cnj: p.cnj, cliente: p.cliente,
            tipo: 'Embargos de Declaração — 5 dias',
            fundamento: 'Embargos ao prazo: ' + (p.tipo || ''),
            urgencia: 'alta', dias: 5, vencimento: d5.br, vencimentoISO: d5.iso,
            vara: p.vara || '', status: 'pendente', createdAt: new Date().toISOString() };
          add(K.prazos, novo);
          addCalendar(novo);
          renderPrazos('pendente');
          if (typeof toast === 'function') toast('📋 Embargos: prazo 5 dias criado (' + d5.br + ')', 'teal');
        };
        btns.appendChild(bEmb);

        var bCal = document.createElement('button'); bCal.className = 'btn btn-ghost btn-xs'; bCal.textContent = '📅'; bCal.title = 'Google Calendar';
        bCal.onclick = function (e) { e.stopPropagation(); addCalendar(p); };
        btns.appendChild(bCal);
      } else {
        var bRe = document.createElement('button'); bRe.className = 'btn btn-ghost btn-xs'; bRe.style.color = '#fbb040'; bRe.textContent = '↩';
        bRe.title = 'Reabrir prazo';
        bRe.onclick = function (e) { e.stopPropagation(); upd(K.prazos, p.id, { status: 'pendente' }); renderPrazos(filtro); };
        btns.appendChild(bRe);
      }
      acoes.appendChild(btns);
    });
  }

  /* ═══════════════════════════════════════════════════════
     ABA PROCESSOS
  ═══════════════════════════════════════════════════════ */
  function renderProcessos(filtro) {
    filtro = filtro || 'ativo';
    var cont = document.getElementById('pg-processos');
    if (!cont) return;

    var todos = load(K.processos);
    var cnt = { ativo: 0, suspenso: 0, arquivado: 0, 'ag-prazo': 0, 'ag-audiencia': 0, todos: todos.length };
    todos.forEach(function (p) { var s = p.status || 'ativo'; if (cnt[s] !== undefined) cnt[s]++; });
    var lista = filtro === 'todos' ? todos : todos.filter(function (p) { return (p.status || 'ativo') === filtro; });

    var old = document.getElementById('lexProcPanel'); if (old) old.remove();
    var panel = document.createElement('div'); panel.id = 'lexProcPanel'; panel.style.padding = '12px';

    /* filtros */
    var fRow = document.createElement('div'); fRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
    [
      { v: 'ativo',        l: '⚖️ Em Andamento (' + cnt.ativo + ')' },
      { v: 'ag-prazo',     l: '⏰ Ag. Prazo (' + cnt['ag-prazo'] + ')' },
      { v: 'ag-audiencia', l: '🏛️ Ag. Audiência (' + cnt['ag-audiencia'] + ')' },
      { v: 'suspenso',     l: '⏸️ Suspenso (' + cnt.suspenso + ')' },
      { v: 'arquivado',    l: '📁 Arquivado (' + cnt.arquivado + ')' },
      { v: 'todos',        l: '📋 Todos (' + cnt.todos + ')' },
    ].forEach(function (ft) {
      var b = document.createElement('button');
      b.className = 'btn btn-sm ' + (filtro === ft.v ? 'btn-teal' : 'btn-ghost');
      b.textContent = ft.l;
      b.onclick = function () { renderProcessos(ft.v); };
      fRow.appendChild(b);
    });
    panel.appendChild(fRow);

    var card = document.createElement('div'); card.className = 'card';
    card.innerHTML = '<div class="cb" style="overflow-x:auto">'
      + '<table class="dtable" style="min-width:680px">'
      + '<thead><tr><th>Ficha</th><th>CNJ</th><th>Cliente</th><th>Polo</th><th>Vara</th><th>Status</th><th>Alterar</th></tr></thead>'
      + '<tbody id="lexProcTbody"></tbody></table></div>';
    panel.appendChild(card);

    var content = cont.querySelector('.content');
    if (!content) { content = document.createElement('div'); content.className = 'content'; cont.appendChild(content); }
    Array.prototype.slice.call(content.children).forEach(function (c) { c.style.display = 'none'; });
    content.insertBefore(panel, content.firstChild);
    panel.style.display = 'block';

    var tbody = document.getElementById('lexProcTbody');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Sem processos ' + filtro + '</td></tr>';
      return;
    }

    var sL = { ativo: 'Em Andamento', suspenso: 'Suspenso', arquivado: 'Arquivado', 'ag-prazo': 'Ag. Prazo', 'ag-audiencia': 'Ag. Audiência' };
    var sB = { ativo: 'bteal', suspenso: 'bo', arquivado: 'bg', 'ag-prazo': 'br', 'ag-audiencia': 'blue' };

    lista.slice(0, 200).forEach(function (p) {
      var s = p.status || 'ativo';
      var tr = document.createElement('tr'); tr.style.cursor = 'pointer';
      tr.innerHTML =
        '<td style="color:var(--gold);font-weight:600">' + (p.ficha || '') + '</td>'
        + '<td style="font-size:11px;color:var(--teal)">' + (p.cnj || '') + '</td>'
        + '<td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.polo_cliente || '').slice(0, 25) + '</td>'
        + '<td><span class="badge ' + (p.polo_processual === 'RÉU' ? 'br' : 'bteal') + '" style="font-size:10px">' + (p.polo_processual || '') + '</span></td>'
        + '<td style="font-size:11px;color:var(--text3)">' + (p.vara || p.tribunal || '').slice(0, 20) + '</td>'
        + '<td><span class="badge ' + (sB[s] || 'bg') + '" style="font-size:10px">' + (sL[s] || s) + '</span></td>'
        + '<td></td>';
      tbody.appendChild(tr);

      var sel = document.createElement('select');
      sel.className = 'btn btn-ghost btn-xs';
      sel.style.cssText = 'font-size:11px;padding:2px 6px;cursor:pointer';
      [['ativo','Em Andamento'],['ag-prazo','Ag. Prazo'],['ag-audiencia','Ag. Audiência'],['suspenso','Suspenso'],['arquivado','Arquivado']].forEach(function (o) {
        var opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1];
        if (s === o[0]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = function (e) {
        e.stopPropagation();
        upd(K.processos, p.id, { status: this.value });
        if (typeof toast === 'function') toast('Status: ' + this.options[this.selectedIndex].text, 'teal');
        renderProcessos(filtro);
      };
      tr.cells[6].appendChild(sel);

      tr.onclick = function (e) {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        if (typeof openModal !== 'function') return;
        openModal('mProcesso');
        setTimeout(function () {
          if (typeof switchTab === 'function') switchTab('dados');
          var sv = function (id, v) { var el = document.getElementById(id); if (el && v) el.value = String(v); };
          sv('f_proc', p.ficha); sv('f_auto', p.cnj); sv('f_acao', p.tipo_acao);
          sv('f_vara', p.vara); sv('f_comarca', p.comarca);
          sv('f_parte1', p.polo_cliente); sv('f_exadv', p.ex_adverso); sv('f_adv_adv', p.adv_adverso);
          var re = document.getElementById('f_resp');
          if (re) for (var i = 0; i < re.options.length; i++) {
            if (re.options[i].text.toLowerCase().indexOf('amilcar') >= 0) { re.selectedIndex = i; break; }
          }
          var selBy = function (id, v) {
            var el = document.getElementById(id); if (!el || !v) return;
            for (var i = 0; i < el.options.length; i++) {
              if (el.options[i].value.toUpperCase() === v.toUpperCase()) { el.selectedIndex = i; break; }
            }
          };
          selBy('f_polo', p.polo_processual || 'RÉU');
          selBy('f_status', p.status || 'ativo');
          var b = document.getElementById('autoFillBanner');
          if (b) { b.style.display = 'flex'; b.innerHTML = 'LexDB: ' + (p.ficha || p.cnj) + ' — ' + (p.polo_cliente || ''); }
        }, 300);
      };
    });
  }

  /* ═══════════════════════════════════════════════════════
     ABA PUBLICAÇÕES
  ═══════════════════════════════════════════════════════ */
  function renderPublicacoes() {
    var el = document.getElementById('inboxList');
    if (!el) return;
    var pubs = load(K.publicacoes).slice(-100).reverse();
    if (!pubs.length) {
      el.innerHTML = '<div style="color:var(--text3);padding:24px;text-align:center">'
        + '📭 Sem publicações importadas.<br>'
        + '<button class="btn btn-teal btn-sm" style="margin-top:12px" '
        + 'onclick="if(typeof lexImportarGmail===\'function\')lexImportarGmail()">📬 Importar do Gmail</button>'
        + '</div>';
      return;
    }
    el.innerHTML = '';
    pubs.forEach(function (pub) {
      var div = document.createElement('div');
      div.className = 'ditem';
      div.style.cssText = 'flex-direction:column;gap:4px;margin-bottom:6px;cursor:pointer;padding:10px;border-radius:8px;border:1px solid var(--border)';
      var dt = (pub.data_pub || pub.createdAt || '').slice(0, 10).split('-').reverse().join('/');
      var srcL = pub.fonte === 'trt9_push' ? 'TRT9 Push' : pub.fonte === 'jusbrasil' ? 'JusBrasil' : 'Impacta';
      var srcC = pub.fonte === 'trt9_push' ? 'bteal' : 'bo';
      div.innerHTML =
        '<div style="display:flex;align-items:center;gap:7px">'
        + '<span class="badge ' + srcC + '" style="font-size:10px">' + srcL + '</span>'
        + '<span style="font-size:11px;color:var(--teal);font-family:monospace">' + (pub.cnj || '').slice(0, 25) + '</span>'
        + '<span style="font-size:10px;color:var(--text3);margin-left:auto">' + dt + '</span>'
        + '</div>'
        + '<div><span style="font-size:12px;color:var(--gold);font-weight:600">' + (pub.nosso_cliente || '').slice(0, 30) + '</span>'
        + (pub.adverso ? ' <span style="font-size:12px;color:var(--text2)">vs ' + pub.adverso.slice(0, 25) + '</span>' : '') + '</div>'
        + ((pub.movimentacao || '').slice(0, 100)
          ? '<div style="font-size:11px;color:var(--text2);border-top:1px solid var(--border);padding-top:4px">' + pub.movimentacao.slice(0, 100) + '</div>'
          : '');
      div.onclick = function () {
        if (!pub.cnj) return;
        var ci = document.getElementById('cnj_input_api');
        if (ci) ci.value = pub.cnj;
        if (typeof openModal === 'function') openModal('mProcesso');
        setTimeout(function () { if (typeof window.consultarCNJ === 'function') window.consultarCNJ(); }, 400);
      };
      el.appendChild(div);
    });
  }

  /* ═══════════════════════════════════════════════════════
     IMPORTAÇÃO GMAIL
  ═══════════════════════════════════════════════════════ */
  function upsertProc(proc) {
    if (!proc || !proc.cnj) return;
    var cnjKey = proc.cnj.replace(/[.\-]/g, '');
    var todos = load(K.processos);
    var ex = null;
    for (var i = 0; i < todos.length; i++) {
      if ((todos[i].cnj || '').replace(/[.\-]/g, '') === cnjKey) { ex = todos[i]; break; }
    }

    /* cliente */
    var cliNorm = (proc.nosso_cliente || '').toUpperCase().replace(/\s+/g, ' ').trim();
    var clis = load(K.clientes);
    var cli = null;
    for (var j = 0; j < clis.length; j++) {
      if ((clis[j].nome || '').toUpperCase().replace(/\s+/g, ' ').trim() === cliNorm) { cli = clis[j]; break; }
    }
    if (!cli && proc.nosso_cliente && proc.nosso_cliente.length > 2) {
      var isPJ = /LTDA|S\.A|EIRELI|TRANSPORTES|LOGISTICA|SEGUROS|BANCO/.test(cliNorm);
      cli = { id: uid('cli'), nome: proc.nosso_cliente, tipo: isPJ ? 'PJ' : 'PF', status: 'ativo', createdAt: new Date().toISOString() };
      add(K.clientes, cli);
    }

    if (ex) {
      /* atualiza movimentos */
      var movs = ex.movimentos || [];
      (proc.eventos || []).forEach(function (ev) {
        if (!movs.some(function (m) { return m.descricao === ev.descricao; })) movs.unshift(ev);
      });
      upd(K.processos, ex.id, { movimentos: movs.slice(0, 20), updatedAt: new Date().toISOString() });
    } else {
      /* novo processo */
      var maxN = 0;
      todos.forEach(function (p) { var n = parseInt((p.ficha || '').replace(/\D/g, '')); if (!isNaN(n) && n > maxN) maxN = n; });
      if (typeof XLS2_DATA !== 'undefined') XLS2_DATA.forEach(function (r) { var n = parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxN)maxN=n; });
      var ficha = 'A' + String(maxN + 1).padStart(4, '0');
      add(K.processos, {
        id: uid('proc'), ficha: ficha, cnj: proc.cnj,
        tipo_acao: proc.tipo_acao || 'AÇÃO TRABALHISTA',
        vara: proc.vara || '', comarca: proc.comarca || '',
        tribunal: proc.tribunal || '', instancia: '1º Grau',
        status: 'ativo',
        polo_cliente: proc.nosso_cliente || '',
        polo_processual: proc.polo || 'RÉU',
        ex_adverso: proc.adverso || '',
        adv_adverso: proc.adv_adverso || '',
        adv_cliente: 'AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856',
        cliente_id: cli ? cli.id : null,
        data_autuacao: proc.data_autuacao || '',
        movimentos: (proc.eventos || []).map(function (ev) { return { data: ev.data, descricao: ev.descricao }; }),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      console.log('[Lex] Novo processo: ' + ficha + ' — ' + proc.nosso_cliente);
    }

    /* publicação */
    var pubsEx = load(K.publicacoes);
    if (!pubsEx.some(function (p) { return p.cnj === proc.cnj && p.fonte === proc.fonte; })) {
      add(K.publicacoes, {
        id: uid('pub'), cnj: proc.cnj,
        nosso_cliente: proc.nosso_cliente || '',
        nosso_polo: proc.polo || '',
        adverso: proc.adverso || '',
        vara: proc.vara || '',
        movimentacao: proc.eventos && proc.eventos[0] ? proc.eventos[0].descricao : '',
        data_pub: proc.data_autuacao || new Date().toLocaleDateString('pt-BR'),
        fonte: proc.fonte || 'email',
        status: 'pendente',
        createdAt: new Date().toISOString(),
      });
    }

    /* prazo */
    if (proc.prazo_dias > 0) {
      var dP = diasParaData(proc.prazo_dias);
      var prazosEx = load(K.prazos);
      if (!prazosEx.some(function (p) { return p.cnj === proc.cnj && p.vencimentoISO === dP.iso; })) {
        var novoPrazo = {
          id: uid('pr'), cnj: proc.cnj,
          cliente: proc.nosso_cliente || '',
          tipo: (proc.tipo_prazo || 'Manifestação') + ' — ' + proc.prazo_dias + ' dias',
          fundamento: proc.eventos && proc.eventos[0] ? proc.eventos[0].descricao.slice(0, 100) : '',
          urgencia: proc.prazo_dias <= 3 ? 'alta' : 'media',
          dias: proc.prazo_dias, vencimento: dP.br, vencimentoISO: dP.iso,
          vara: proc.vara || '', status: 'pendente',
          createdAt: new Date().toISOString(),
        };
        add(K.prazos, novoPrazo);
        addCalendar(novoPrazo);
      }
    }

    /* tarefa */
    var mov0 = proc.eventos && proc.eventos[0] ? proc.eventos[0].descricao.toUpperCase() : '';
    var tipoTar = 'Analisar publicação';
    if (/SENTENC|JULGAMENT/.test(mov0))    tipoTar = 'Analisar sentença';
    else if (/CONTEST|DEFESA/.test(mov0))  tipoTar = 'Preparar contestação';
    else if (/RECURSO/.test(mov0))         tipoTar = 'Interpor Recurso';
    else if (/SUSPENSO|ACORDO/.test(mov0)) tipoTar = 'Acompanhar acordo';
    else if (/DECORRIDO.*PRAZO/.test(mov0))tipoTar = 'Verificar prazo decorrido';
    var tarsEx = load(K.tarefas);
    if (!tarsEx.some(function (t) { return t.cnj === proc.cnj && t.tipo === tipoTar; })) {
      var dT = diasParaData(3);
      add(K.tarefas, {
        id: uid('tar'), cnj: proc.cnj, cliente: proc.nosso_cliente || '',
        tipo: tipoTar, descricao: mov0.slice(0, 150),
        prioridade: 'alta', status: 'pendente',
        vencimento: dT.br, vencimentoISO: dT.iso,
        createdAt: new Date().toISOString(),
      });
    }
  }

  function parseTRT9(html, eid) {
    var txt = html.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ');
    function campo(lb) {
      var m = txt.match(new RegExp(lb + '[:\\s]+([^\\n]{2,80}?)(?=\\s*(?:Classe|Órgão|Data de|Autor:|Advogado|Réu:|Eventos|Para acessar|$))', 'i'));
      return m ? m[1].trim() : '';
    }
    var cnj = campo('Número do Processo'), vara = campo('Órgão Julgador');
    var autor = campo('Autor'), reu = campo('Réu'), classe = campo('Classe Judicial');
    var advReuM = txt.match(/Advogados? do Réu[:\s]+([\s\S]{0,200}?)(?=Eventos:|Para acessar|$)/i);
    var advAutM = txt.match(/Advogados? do Autor[:\s]+([\s\S]{0,200}?)(?=Réu:|Advogados? do Réu:|Eventos:|Para acessar)/i);
    var advReu = advReuM ? advReuM[1].replace(/\s+/g, ' ').trim() : '';
    var advAut = advAutM ? advAutM[1].replace(/\s+/g, ' ').trim() : '';
    var amReu = /AMILCAR/i.test(advReu) || /21856/.test(advReu);
    var nosso = amReu ? reu : autor;
    var adverso = amReu ? autor : reu;
    var polo = amReu ? 'RÉU' : 'AUTOR';
    var comarca = vara; var mC = vara.match(/VARA\s+DO\s+TRABALHO\s+DE\s+(.+)$/i); if (mC) comarca = mC[1].trim();
    var eventos = [];
    (html.match(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi) || []).forEach(function (row) {
      var cells = row.match(/<td[^>]*>([^<]+)<\/td>/gi) || [];
      if (cells.length >= 2) {
        var dt = cells[0].replace(/<[^>]+>/g, '').trim();
        var ev = cells[1].replace(/<[^>]+>/g, '').trim();
        if (dt && ev && dt !== 'Data' && /\d{2}\/\d{2}\/\d{4}/.test(dt)) eventos.push({ data: dt.split(' ')[0], descricao: ev });
      }
    });
    var pr = calcPrazo(eventos[0] ? eventos[0].descricao : '', cnj);
    return { cnj: cnj, tipo_acao: classe || 'AÇÃO TRABALHISTA - RITO ORDINÁRIO', vara: vara, comarca: comarca,
      tribunal: 'TRT 9ª Região (PR/MS)', instancia: '1º Grau', data_autuacao: '',
      nosso_cliente: nosso, adverso: adverso, polo: polo, adv_adverso: amReu ? advAut : advReu,
      eventos: eventos, prazo_dias: pr.dias, tipo_prazo: pr.tipo, email_id: eid, fonte: 'trt9_push' };
  }

  function parseJusbrasil(corpo, eid) {
    var blocos = corpo.split(/(?=Processo \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    var result = [], vistos = {};
    blocos.forEach(function (bloco) {
      var cnjM = bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if (!cnjM || vistos[cnjM[1]]) return; vistos[cnjM[1]] = true;
      var cnj = cnjM[1];
      var paM = bloco.match(/POLO ATIVO\s+([\s\S]*?)(?=POLO PASSIVO|ADVOGADO|DATA DE)/i);
      var ppM = bloco.match(/POLO PASSIVO\s+([\s\S]*?)(?=ADVOGADO|DATA DE)/i);
      var movM = bloco.match(/(?:INTIMAÇÃO|DESPACHO|Vista à parte|Intime-se)[^\n]{5,200}/i);
      var pa = paM ? paM[1].replace(/\s+/g, ' ').trim() : '';
      var pp = ppM ? ppM[1].replace(/\s+/g, ' ').trim() : '';
      var amP = /AMIL[CÁ]CAR/i.test(pp), amA = /AMIL[CÁ]CAR/i.test(pa);
      var nosso = amP ? pp : pa, adverso = amP ? pa : pp, polo = amP ? 'RÉU' : 'AUTOR';
      var mov = movM ? movM[0] : '';
      var pr = calcPrazo(mov, cnj);
      result.push({ cnj: cnj, tipo_acao: 'AÇÃO', vara: '', comarca: '', tribunal: 'TRT 9ª Região',
        nosso_cliente: nosso.slice(0, 80), adverso: adverso.slice(0, 80), polo: polo, adv_adverso: '',
        eventos: mov ? [{ data: new Date().toLocaleDateString('pt-BR'), descricao: mov }] : [],
        prazo_dias: pr.dias, tipo_prazo: pr.tipo, email_id: eid, fonte: 'jusbrasil' });
    });
    return result;
  }

  window.lexImportarGmail = function () {
    var t = tok();
    if (!t) { if (typeof toast === 'function') toast('Conecte o Gmail primeiro', 'orange'); return; }
    if (typeof toast === 'function') toast('📬 Importando publicações...', 'teal');
    var q = 'from:nao-responda@trt9.jus.br OR from:publicacoes-diarios@jusbrasil.com.br OR from:publicacoes@iprazos.adv.br newer_than:14d';
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(q) + '&maxResults=15',
      { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var msgs = data.messages || [], i = 0, total = 0;
        function next() {
          if (i >= msgs.length) {
            renderDash(); renderPublicacoes();
            if (typeof toast === 'function') toast('✅ ' + total + ' publicações importadas', 'teal');
            return;
          }
          var meta = msgs[i++];
          setTimeout(function () {
            fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + meta.id + '?format=full',
              { headers: { Authorization: 'Bearer ' + t } })
              .then(function (r) { return r.json(); })
              .then(function (msg) {
                var headers = msg.payload && msg.payload.headers || [];
                var de = (headers.find(function (h) { return h.name === 'From'; }) || {}).value || '';
                var subj = (headers.find(function (h) { return h.name === 'Subject'; }) || {}).value || '';
                var html = '', parts = [];
                function flat(p) { if (p.parts) p.parts.forEach(flat); else parts.push(p); }
                if (msg.payload) flat(msg.payload);
                var hp = parts.find(function (p) { return p.mimeType === 'text/html' && p.body && p.body.data; });
                var tp = parts.find(function (p) { return p.mimeType === 'text/plain' && p.body && p.body.data; });
                try {
                  if (hp) html = atob(hp.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                  else if (tp) html = atob(tp.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } catch (e) {}
                if (/trt9\.jus\.br/i.test(de) && /PUSH/i.test(subj)) {
                  var p2 = parseTRT9(html, meta.id); if (p2 && p2.cnj) { upsertProc(p2); total++; }
                } else if (/jusbrasil/i.test(de)) {
                  var corpo = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
                  parseJusbrasil(corpo, meta.id).forEach(function (p3) { if (p3.cnj) { upsertProc(p3); total++; } });
                }
                next();
              }).catch(function () { next(); });
          }, i * 500);
        }
        next();
      }).catch(function (e) { if (typeof toast === 'function') toast('❌ Gmail: ' + e.message, 'red'); });
  };

  /* ═══════════════════════════════════════════════════════
     EXPÕE E INICIALIZA
  ═══════════════════════════════════════════════════════ */
  window.lexRenderPrazosAba    = renderPrazos;
  window.lexRenderProcAba      = renderProcessos;
  window.lexRenderPublicacoes  = renderPublicacoes;
  window.renderDashboardFull   = renderDash;
  window.renderPrazosDash      = renderDash;

  function init() {
    renderDash();
    /* limpa publicações excessivas */
    var pubs = load(K.publicacoes);
    if (pubs.length > 200) {
      pubs.sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
      save(K.publicacoes, pubs.slice(0, 200));
    }
    console.log('[Lex v3] ✅ pronto');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 800); });
  } else {
    setTimeout(init, 800);
  }
})();

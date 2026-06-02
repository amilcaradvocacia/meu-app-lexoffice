/**
 * LexOfficeAT — Módulo de Gestão Completa v1.0
 * - Status de processos: ativo, suspenso, arquivado, aguardando prazo, aguardando audiência
 * - Prazos com status: pendente, realizado, concluído, embargos declarados
 * - Prazos automáticos: 5d embargos, 8d recurso trabalhista, 15d recurso geral
 * - Integração Google Calendar automática
 * - Tarefas com status: pendente, em andamento, concluída
 */
(function() {
  'use strict';

  function db() { return typeof LexSync !== 'undefined' && LexSync.DB ? LexSync.DB : null; }
  function getToken() { return localStorage.getItem('lex_gmail_auth'); }

  // ── Prazos automáticos por tipo de decisão ───────────────
  var TABELA_PRAZOS = [
    // Trabalhista
    { rx: /recurso\s+ordin|apelac/i,      dias: 8,  tipo: 'Recurso Ordinário',        tribunal: 'trt' },
    { rx: /agravo\s+de\s+instrumento/i,   dias: 8,  tipo: 'Agravo de Instrumento',    tribunal: 'trt' },
    { rx: /agravo\s+regimental/i,         dias: 8,  tipo: 'Agravo Regimental',         tribunal: 'trt' },
    { rx: /embargos?\s+decl/i,            dias: 5,  tipo: 'Embargos de Declaração',   tribunal: 'todos' },
    { rx: /contest|defesa/i,              dias: 20, tipo: 'Contestação',               tribunal: 'todos' },
    { rx: /impugna/i,                     dias: 15, tipo: 'Impugnação',               tribunal: 'todos' },
    { rx: /recurso/i,                     dias: 15, tipo: 'Recurso',                   tribunal: 'civel' },
    { rx: /apelac/i,                      dias: 15, tipo: 'Apelação',                  tribunal: 'civel' },
    { rx: /manifest|vista|intima|prazo/i, dias: 5,  tipo: 'Manifestação',             tribunal: 'todos' },
    // Padrão
    { rx: /.*/,                           dias: 5,  tipo: 'Manifestação',             tribunal: 'todos' },
  ];

  function calcularPrazo(movimentacao, cnj) {
    var mov = (movimentacao || '').toLowerCase();
    var isTrab = cnj && /\.5\.\d{2}\./.test(cnj); // TRT = segmento 5

    for (var i = 0; i < TABELA_PRAZOS.length; i++) {
      var reg = TABELA_PRAZOS[i];
      if (reg.rx.test(mov)) {
        var dias = reg.dias;
        // Trabalhista tem prazo menor para recurso
        if (isTrab && reg.tipo === 'Recurso' && dias === 15) dias = 8;
        if (isTrab && reg.tipo === 'Apelação') dias = 8;
        return { dias: dias, tipo: reg.tipo };
      }
    }
    return { dias: 5, tipo: 'Manifestação' };
  }

  // ── Google Calendar ──────────────────────────────────────
  function criarEventoCalendar(prazo) {
    var token = getToken();
    if (!token || !prazo.vencimentoISO) return;
    var titulo = prazo.tipo + ' — ' + (prazo.cliente || prazo.cnj || '?').slice(0, 40);
    var desc = 'Processo: ' + (prazo.cnj || '') + '\nVara: ' + (prazo.vara || '') + '\nFundamento: ' + (prazo.fundamento || '');
    var dataISO = prazo.vencimentoISO;
    var body = {
      summary: titulo,
      description: desc,
      start: { date: dataISO },
      end:   { date: dataISO },
      colorId: prazo.urgencia === 'alta' ? '11' : '5', // vermelho ou amarelo
      reminders: { useDefault: false, overrides: [
        { method: 'popup', minutes: 1440 },  // 1 dia antes
        { method: 'popup', minutes: 4320 },  // 3 dias antes
      ]},
    };
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { return r.json(); })
      .then(function(ev) {
        if (ev.id) {
          var d = db();
          if (d && prazo.id) d.update(d.KEYS.prazos, prazo.id, { calendarEventId: ev.id });
          console.log('[Calendar] ✅ Evento criado: ' + titulo);
        }
      }).catch(function(e) { console.warn('[Calendar]', e.message); });
  }

  // ── Renderiza aba Prazos completa ────────────────────────
  function renderAbaPrazos(filtroStatus) {
    var d = db(); if (!d) return;
    var cont = document.getElementById('pg-prazos');
    if (!cont) return;
    var hoje = new Date();

    var todos = (d.getAll(d.KEYS.prazos) || []).map(function(p) {
      var vISO = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
      var dias = Math.ceil((new Date(vISO) - hoje) / 86400000);
      return Object.assign({}, p, { dias: dias });
    });

    // Deduplicação
    var vistos = {};
    todos = todos.filter(function(p) {
      var key = (p.cnj||'') + '|' + (p.tipo||'') + '|' + (p.vencimentoISO||p.vencimento||'');
      if (vistos[key]) return false; vistos[key] = true; return true;
    });

    // Filtro por status
    var filtro = filtroStatus || 'pendente';
    var prazos = filtro === 'todos' ? todos : todos.filter(function(p) { return p.status === filtro; });
    prazos.sort(function(a, b) { return a.dias - b.dias; });

    // Contadores por status
    var counts = { pendente:0, concluido:0, embargos:0, todos: todos.length };
    todos.forEach(function(p) {
      if (p.status === 'pendente')  counts.pendente++;
      if (p.status === 'concluido') counts.concluido++;
      if (p.status === 'embargos')  counts.embargos++;
    });

    // Cria/atualiza o container
    var panelId = 'lexGestaoPanel';
    var existing = document.getElementById(panelId);
    if (!existing) {
      var panel = document.createElement('div');
      panel.id = panelId;
      panel.style.marginTop = '16px';
      var c = cont.querySelector('.content');
      if (c) c.appendChild(panel);
      else cont.appendChild(panel);
      existing = panel;
    }

    var urgentes = todos.filter(function(p){ return p.status==='pendente' && p.dias<=7; }).length;

    existing.innerHTML =
      // Filtros
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'
      + '<button onclick="lexRenderPrazosAba(\'pendente\')" class="btn btn-sm '+(filtro==='pendente'?'btn-teal':'btn-ghost')+'">⏰ Pendentes ('+counts.pendente+')</button>'
      + '<button onclick="lexRenderPrazosAba(\'concluido\')" class="btn btn-sm '+(filtro==='concluido'?'btn-gold':'btn-ghost')+'">✅ Concluídos ('+counts.concluido+')</button>'
      + '<button onclick="lexRenderPrazosAba(\'embargos\')" class="btn btn-sm '+(filtro==='embargos'?'btn-blue':'btn-ghost')+'">📋 Com Embargos ('+counts.embargos+')</button>'
      + '<button onclick="lexRenderPrazosAba(\'todos\')" class="btn btn-sm '+(filtro==='todos'?'btn-gold':'btn-ghost')+'">📁 Todos ('+counts.todos+')</button>'
      + (urgentes ? '<span class="badge br" style="align-self:center">'+urgentes+' urgentes</span>' : '')
      + '</div>'

      // Tabela
      + '<div class="card"><div class="cb" style="overflow-x:auto"><table class="dtable" style="min-width:700px">'
      + '<thead><tr><th>CNJ</th><th>Cliente</th><th>Tipo de Prazo</th><th>Vara</th><th>Vencimento</th><th>Dias</th><th>Status</th><th style="min-width:180px">Ações</th></tr></thead>'
      + '<tbody id="lexPrazosTbody"></tbody></table></div></div>';

    var tbody = document.getElementById('lexPrazosTbody');
    if (!tbody) return;

    if (!prazos.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Nenhum prazo ' + filtro + '</td></tr>';
      return;
    }

    prazos.forEach(function(p) {
      var cor  = p.dias <= 0 ? '#f07878' : p.dias <= 3 ? '#f07878' : p.dias <= 7 ? '#fbb040' : '#4ade98';
      var badgeClass = p.status === 'concluido' ? 'bteal' : p.status === 'embargos' ? 'bg' : p.dias <= 3 ? 'br' : p.dias <= 7 ? 'bo' : 'bteal';
      var statusLabel = p.status === 'concluido' ? '✅ Concluído' : p.status === 'embargos' ? '📋 Embargos' : p.dias <= 0 ? 'VENCIDO' : p.dias <= 3 ? 'URGENTE' : p.dias <= 7 ? 'ATENÇÃO' : 'OK';

      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML =
        '<td style="font-size:11px;color:var(--teal);white-space:nowrap">' + (p.cnj||'').slice(0,22) + '</td>'
        + '<td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">' + (p.cliente||'—').slice(0,28) + '</td>'
        + '<td style="font-size:12px">' + (p.tipo||'').split('—')[0].trim() + '</td>'
        + '<td style="font-size:11px;color:var(--text3);max-width:120px;overflow:hidden;text-overflow:ellipsis">' + (p.vara||'').slice(0,20) + '</td>'
        + '<td style="white-space:nowrap;color:' + cor + '">' + (p.vencimento||'') + '</td>'
        + '<td style="color:' + cor + ';font-weight:700;text-align:center">' + (p.dias <= 0 ? p.dias : '+'+p.dias) + 'd</td>'
        + '<td><span class="badge ' + badgeClass + '">' + statusLabel + '</span></td>'
        + '<td id="lexPrazoAcoes_' + (p.id||'') + '"></td>';

      // Botões de ação
      (function(prazo) {
        tr.onclick = function(e) {
          if (e.target.tagName === 'BUTTON') return;
          window.lexVerPrazoDetalhe && window.lexVerPrazoDetalhe(prazo);
        };
      })(p);

      tbody.appendChild(tr);

      // Preenche célula de ações
      var acoesCell = document.getElementById('lexPrazoAcoes_' + (p.id||''));
      if (!acoesCell) return;
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';

      if (p.status === 'pendente') {
        // Botão Concluir
        var btnConcluir = document.createElement('button');
        btnConcluir.className = 'btn btn-ghost btn-xs';
        btnConcluir.style.color = '#4ade98';
        btnConcluir.textContent = '✅ Concluído';
        (function(prazo) {
          btnConcluir.onclick = function(e) {
            e.stopPropagation();
            lexAlterarStatusPrazo(prazo.id, 'concluido');
          };
        })(p);
        btns.appendChild(btnConcluir);

        // Botão Embargos Declaração
        var btnEmb = document.createElement('button');
        btnEmb.className = 'btn btn-ghost btn-xs';
        btnEmb.style.color = '#6898ff';
        btnEmb.textContent = '📋 Embargos';
        (function(prazo) {
          btnEmb.onclick = function(e) {
            e.stopPropagation();
            lexAlterarStatusPrazo(prazo.id, 'embargos');
            lexCriarPrazoEmbargos(prazo);
          };
        })(p);
        btns.appendChild(btnEmb);

        // Botão Calendar
        var btnCal = document.createElement('button');
        btnCal.className = 'btn btn-ghost btn-xs';
        btnCal.textContent = '📅';
        btnCal.title = 'Adicionar ao Calendar';
        (function(prazo) {
          btnCal.onclick = function(e) {
            e.stopPropagation();
            criarEventoCalendar(prazo);
            if (typeof toast === 'function') toast('📅 Adicionando ao Calendar...', 'teal');
          };
        })(p);
        btns.appendChild(btnCal);
      }

      if (p.status !== 'pendente') {
        var btnReabrir = document.createElement('button');
        btnReabrir.className = 'btn btn-ghost btn-xs';
        btnReabrir.style.color = '#fbb040';
        btnReabrir.textContent = '↩ Reabrir';
        (function(prazo) {
          btnReabrir.onclick = function(e) {
            e.stopPropagation();
            lexAlterarStatusPrazo(prazo.id, 'pendente');
          };
        })(p);
        btns.appendChild(btnReabrir);
      }

      acoesCell.appendChild(btns);
    });
  }

  // ── Altera status do prazo ────────────────────────────────
  window.lexAlterarStatusPrazo = function(id, novoStatus) {
    var d = db(); if (!d || !id) return;
    var updates = { status: novoStatus, updatedAt: new Date().toISOString() };
    if (novoStatus === 'concluido') updates.concluidoEm = new Date().toISOString();
    d.update(d.KEYS.prazos, id, updates);
    renderAbaPrazos(document.querySelector('[id^="lexPrazoFiltroAtivo"]') ? 
      document.querySelector('[id^="lexPrazoFiltroAtivo"]').dataset.filtro : 'pendente');
    if (typeof window.renderDashboardFull === 'function') window.renderDashboardFull();
    if (typeof toast === 'function') {
      var msgs = { concluido: '✅ Prazo concluído!', embargos: '📋 Embargos de Declaração registrados!', pendente: '↩ Prazo reaberto' };
      toast(msgs[novoStatus] || 'Status atualizado', 'teal');
    }
  };

  // ── Cria novo prazo para embargos ────────────────────────
  window.lexCriarPrazoEmbargos = function(prazoOrigem) {
    var d = db(); if (!d) return;
    var venc = new Date();
    venc.setDate(venc.getDate() + 5); // Embargos = sempre 5 dias
    var vencBR  = venc.toLocaleDateString('pt-BR');
    var vencISO = venc.toISOString().slice(0, 10);
    var novoPrazo = {
      id:            d.newId('prazo'),
      cnj:           prazoOrigem.cnj,
      cliente:       prazoOrigem.cliente,
      tipo:          'Embargos de Declaração — 5 dias',
      fundamento:    'Embargos opostos ao prazo: ' + (prazoOrigem.tipo || ''),
      urgencia:      'alta',
      dias:          5,
      vencimento:    vencBR,
      vencimentoISO: vencISO,
      vara:          prazoOrigem.vara || '',
      tribunal:      prazoOrigem.tribunal || '',
      status:        'pendente',
      createdAt:     new Date().toISOString(),
    };
    d.add(d.KEYS.prazos, novoPrazo);
    criarEventoCalendar(novoPrazo);
    if (typeof toast === 'function') toast('📋 Prazo de Embargos criado: 5 dias (vence ' + vencBR + ')', 'teal');
    renderAbaPrazos('pendente');
  };

  // ── Renderiza aba Processos com filtros de status ────────
  function renderAbaProcessos(filtroStatus) {
    var d = db(); if (!d) return;
    var cont = document.getElementById('pg-processos');
    if (!cont) return;

    var todos = d.getAll(d.KEYS.processos) || [];
    var filtro = filtroStatus || 'ativo';
    var lista = filtro === 'todos' ? todos : todos.filter(function(p) { return (p.status||'ativo') === filtro; });

    var counts = { ativo:0, suspenso:0, arquivado:0, 'ag-prazo':0, 'ag-audiencia':0, todos:todos.length };
    todos.forEach(function(p) {
      var s = p.status || 'ativo';
      if (counts[s] !== undefined) counts[s]++;
    });

    var panelId = 'lexProcPanel';
    var existing = document.getElementById(panelId);
    if (!existing) {
      var panel = document.createElement('div');
      panel.id = panelId;
      panel.style.marginTop = '16px';
      var c = cont.querySelector('.content');
      if (c) c.appendChild(panel);
      else cont.appendChild(panel);
      existing = panel;
    }

    existing.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'
      + '<button onclick="lexRenderProcAba(\'ativo\')" class="btn btn-sm '+(filtro==='ativo'?'btn-teal':'btn-ghost')+'">⚖️ Em Andamento ('+counts.ativo+')</button>'
      + '<button onclick="lexRenderProcAba(\'ag-prazo\')" class="btn btn-sm '+(filtro==='ag-prazo'?'btn-gold':'btn-ghost')+'">⏰ Aguardando Prazo ('+counts['ag-prazo']+')</button>'
      + '<button onclick="lexRenderProcAba(\'ag-audiencia\')" class="btn btn-sm '+(filtro==='ag-audiencia'?'btn-blue':'btn-ghost')+'">🏛️ Aguardando Audiência ('+counts['ag-audiencia']+')</button>'
      + '<button onclick="lexRenderProcAba(\'suspenso\')" class="btn btn-sm '+(filtro==='suspenso'?'btn-orange':'btn-ghost')+'">⏸️ Suspensos ('+counts.suspenso+')</button>'
      + '<button onclick="lexRenderProcAba(\'arquivado\')" class="btn btn-sm '+(filtro==='arquivado'?'':'btn-ghost')+'">📁 Arquivados ('+counts.arquivado+')</button>'
      + '<button onclick="lexRenderProcAba(\'todos\')" class="btn btn-sm '+(filtro==='todos'?'btn-gold':'btn-ghost')+'">📋 Todos ('+counts.todos+')</button>'
      + '</div>'
      + '<div class="card"><div class="cb" style="overflow-x:auto"><table class="dtable" style="min-width:700px">'
      + '<thead><tr><th>Ficha</th><th>CNJ</th><th>Cliente</th><th>Polo</th><th>Vara</th><th>Status</th><th>Ações</th></tr></thead>'
      + '<tbody id="lexProcTbody"></tbody></table></div></div>';

    var tbody = document.getElementById('lexProcTbody');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Nenhum processo</td></tr>';
      return;
    }

    lista.slice(0, 200).forEach(function(p) {
      var statusColors = { ativo:'bteal', suspenso:'bo', arquivado:'bg', 'ag-prazo':'br', 'ag-audiencia':'blue' };
      var statusLabels = { ativo:'Em Andamento', suspenso:'Suspenso', arquivado:'Arquivado', 'ag-prazo':'Ag. Prazo', 'ag-audiencia':'Ag. Audiência' };
      var sBadge = statusColors[p.status||'ativo'] || 'bg';
      var sLabel = statusLabels[p.status||'ativo'] || (p.status||'ativo');

      var tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML =
        '<td style="color:var(--gold);font-weight:600">' + (p.ficha||'') + '</td>'
        + '<td style="font-size:11px;color:var(--teal)">' + (p.cnj||'') + '</td>'
        + '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (p.polo_cliente||'').slice(0,25) + '</td>'
        + '<td><span class="badge '+(p.polo_processual==='RÉU'?'br':'bteal')+'" style="font-size:10px">'+(p.polo_processual||'')+'</span></td>'
        + '<td style="font-size:11px;color:var(--text3)">' + (p.vara||p.tribunal||'').slice(0,20) + '</td>'
        + '<td><span class="badge ' + sBadge + '" style="font-size:10px">' + sLabel + '</span></td>'
        + '<td id="lexProcAcoes_'+(p.id||'')+'"></td>';

      (function(proc) { tr.onclick = function(e) { if(e.target.tagName==='BUTTON'||e.target.tagName==='SELECT')return; window.lexAbrirProcessoDB(proc); }; })(p);
      tbody.appendChild(tr);

      // Botões de status
      var cell = document.getElementById('lexProcAcoes_' + (p.id||''));
      if (!cell) return;
      var sel = document.createElement('select');
      sel.className = 'btn btn-ghost btn-xs';
      sel.style.cssText = 'font-size:11px;padding:2px 6px;cursor:pointer';
      [
        {v:'ativo',        l:'Em Andamento'},
        {v:'ag-prazo',     l:'Ag. Prazo'},
        {v:'ag-audiencia', l:'Ag. Audiência'},
        {v:'suspenso',     l:'Suspenso'},
        {v:'arquivado',    l:'Arquivado'},
      ].forEach(function(opt) {
        var o = document.createElement('option');
        o.value = opt.v; o.textContent = opt.l;
        if ((p.status||'ativo') === opt.v) o.selected = true;
        sel.appendChild(o);
      });
      (function(proc) {
        sel.onchange = function(e) {
          e.stopPropagation();
          var d2 = db(); if (!d2) return;
          d2.update(d2.KEYS.processos, proc.id, { status: this.value, updatedAt: new Date().toISOString() });
          if (typeof toast === 'function') toast('Status: ' + this.options[this.selectedIndex].text, 'teal');
          renderAbaProcessos(filtro);
        };
      })(p);
      cell.appendChild(sel);
    });
  }

  // ── Expõe funções globais ─────────────────────────────────
  window.lexRenderPrazosAba  = renderAbaPrazos;
  window.lexRenderProcAba    = renderAbaProcessos;

  // ── Hook no go() ─────────────────────────────────────────
  function hookGo() {
    var origGo = window.go;
    if (origGo && !origGo._gestaoHook) {
      window.go = function(page, el) {
        try { origGo(page, el); } catch(e) {}
        if (page === 'prazos')    setTimeout(function(){ renderAbaPrazos('pendente'); }, 300);
        if (page === 'processos') setTimeout(function(){ renderAbaProcessos('ativo'); }, 400);
        if (page === 'dashboard' && typeof window.renderDashboardFull === 'function') {
          setTimeout(window.renderDashboardFull, 200);
        }
        if (typeof window.lexRenderPagina === 'function') {
          setTimeout(function(){ window.lexRenderPagina(page); }, 350);
        }
      };
      window.go._gestaoHook = true;
    }
  }

  // ── Auto-cria prazos a partir de publicações ─────────────
  function autoPrazosPublicacoes() {
    var d = db(); if (!d) return;
    var pubs = d.getAll(d.KEYS.publicacoes) || [];
    var prazosExist = d.getAll(d.KEYS.prazos) || [];
    var hoje = new Date();
    var criados = 0;

    pubs.forEach(function(pub) {
      if (!pub.cnj || !pub.movimentacao) return;
      var calc = calcularPrazo(pub.movimentacao, pub.cnj);
      if (calc.dias <= 0) return;

      var venc = new Date(hoje); venc.setDate(venc.getDate() + calc.dias);
      var vencISO = venc.toISOString().slice(0, 10);

      var jaExiste = prazosExist.some(function(p) {
        return p.cnj === pub.cnj && p.vencimentoISO === vencISO && p.tipo.includes(calc.tipo);
      });
      if (jaExiste) return;

      var novoPrazo = {
        id:            d.newId('prazo'),
        cnj:           pub.cnj,
        cliente:       pub.nosso_cliente || pub.polo_ativo || '',
        tipo:          calc.tipo + ' — ' + calc.dias + ' dias',
        fundamento:    pub.movimentacao.slice(0, 100),
        urgencia:      calc.dias <= 3 ? 'alta' : calc.dias <= 7 ? 'media' : 'baixa',
        dias:          calc.dias,
        vencimento:    venc.toLocaleDateString('pt-BR'),
        vencimentoISO: vencISO,
        vara:          pub.vara || '',
        tribunal:      pub.tribunal || '',
        status:        'pendente',
        createdAt:     hoje.toISOString(),
      };
      d.add(d.KEYS.prazos, novoPrazo);
      criarEventoCalendar(novoPrazo);
      prazosExist.push(novoPrazo);
      criados++;
    });

    if (criados > 0) {
      console.log('[LexGestao] ' + criados + ' prazos automáticos criados');
      if (typeof toast === 'function') toast('⏰ ' + criados + ' prazos calculados automaticamente', 'teal');
    }
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    hookGo();
    autoPrazosPublicacoes();
  }

  function aguardar(cb) {
    if (db()) { cb(); return; }
    setTimeout(function() { aguardar(cb); }, 800);
  }
  aguardar(init);
})();

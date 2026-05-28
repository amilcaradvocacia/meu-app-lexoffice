/**
 * LexOfficeAT — Dashboard Motor v1.0
 * Renderiza TODOS os widgets do dashboard com dados reais do LexDB
 * Substitui TODOS os dados demo (Silva & Cia, 0012345, Dr. Carlos Lima, etc.)
 */
(function() {
  'use strict';

  function db() { return typeof LexSync !== 'undefined' && LexSync.DB ? LexSync.DB : null; }

  // ── Aguarda LexSync ──────────────────────────────────────
  function aguardar(cb) {
    if (db()) { cb(); return; }
    setTimeout(function() { aguardar(cb); }, 600);
  }

  // ── PRAZOS CRÍTICOS ──────────────────────────────────────
  function renderPrazos() {
    var d = db(); if (!d) return;
    var box = document.getElementById('dashPrazosConteudo');
    if (!box) return;

    var hoje = new Date();
    var prazos = (d.getAll(d.KEYS.prazos) || [])
      .filter(function(p) { return p.status === 'pendente'; })
      .map(function(p) {
        var vISO = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
        var dias = Math.ceil((new Date(vISO) - hoje) / 86400000);
        return Object.assign({}, p, { dias: dias });
      })
      .sort(function(a, b) { return a.dias - b.dias; })
      .slice(0, 5);

    if (!prazos.length) {
      box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px 0;text-align:center">Nenhum prazo pendente</div>';
      return;
    }

    box.innerHTML = prazos.map(function(p) {
      var cor  = p.dias <= 0 ? 'var(--red)' : p.dias <= 3 ? 'var(--red)' : p.dias <= 7 ? 'var(--orange)' : 'var(--green)';
      var ico  = p.dias <= 0 ? '🔴' : p.dias <= 3 ? '⚠️' : p.dias <= 7 ? '⚡' : '✅';
      var pct  = Math.min(100, Math.max(5, (10 - p.dias) / 10 * 100));
      var cls  = p.dias <= 3 ? 'c' : p.dias <= 7 ? 'w' : 'g';
      var nome = (p.cliente || p.cnj || '?').slice(0, 32);
      var tipo = (p.tipo || 'Manifestação').split('—')[0].trim().slice(0, 25);
      var diasStr = p.dias <= 0 ? 'VENCIDO' : 'Vence em ' + p.dias + ' dias';
      return '<div style="padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="lexVerPrazoDetalhe && lexVerPrazoDetalhe(' + JSON.stringify(p).replace(/"/g,"'") + ')">'
        + '<div style="font-size:13px;color:var(--text)">' + tipo + ' — ' + nome + '</div>'
        + '<div style="font-size:11px;color:' + cor + ';margin-top:2px">' + ico + ' ' + diasStr + ' · ' + (p.vara || p.tribunal || 'TRT 9ª Região').slice(0, 25) + '</div>'
        + '<div class="pbar"><div class="pfill ' + cls + '" style="width:' + pct + '%"></div></div>'
        + '</div>';
    }).join('');

    // Atualiza badge na sidebar e KPI
    var urg = prazos.filter(function(p) { return p.dias <= 7; }).length;
    var kpi = document.querySelector('[id*="kPrazos"], .kpi-prazos');
    if (kpi) kpi.textContent = urg;
    var sidebar = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sidebar && urg) sidebar.textContent = urg;
  }

  // ── PRÓXIMAS AUDIÊNCIAS ──────────────────────────────────
  function renderAudiencias() {
    var d = db(); if (!d) return;
    var box = document.getElementById('dashAudienciasConteudo');
    if (!box) return;

    var hoje = new Date();
    var keys = d.KEYS;
    var auds = (d.getAll(keys.audiencias) || [])
      .filter(function(a) { return a.status !== 'realizada' && a.status !== 'cancelada'; })
      .map(function(a) {
        var dISO = a.dataISO || (a.data || '').split('/').reverse().join('-');
        var diff = Math.ceil((new Date(dISO + 'T' + (a.hora || '00:00') + ':00') - hoje) / 86400000);
        return Object.assign({}, a, { diff: diff });
      })
      .filter(function(a) { return a.diff >= 0; })
      .sort(function(a, b) { return a.diff - b.diff; })
      .slice(0, 4);

    // Se não tiver audiências no LexDB, busca nos prazos com tipo audiência
    if (!auds.length) {
      var prazos = (d.getAll(d.KEYS.prazos) || [])
        .filter(function(p) { return p.status === 'pendente' && /audiencia|julgamento/i.test(p.tipo || p.fundamento || ''); })
        .map(function(p) {
          var vISO = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
          var diff = Math.ceil((new Date(vISO) - hoje) / 86400000);
          return { diff: diff, data: p.vencimento, tipo: 'Audiência', cliente: p.cliente, vara: p.vara, cnj: p.cnj };
        })
        .filter(function(a) { return a.diff >= 0; })
        .slice(0, 3);
      auds = prazos;
    }

    if (!auds.length) {
      box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px 0;text-align:center">Nenhuma audiência próxima</div>';
      return;
    }

    box.innerHTML = auds.map(function(a) {
      var partes = a.data ? a.data.split('/') : ['',''];
      var dia = partes[0] || '';
      var mes = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(partes[1])||0] || partes[1] || '';
      var tipo = a.tipo || a.tipoAudiencia || 'Audiência';
      var badge = tipo === 'Julgamento' ? 'br' : tipo === 'Instrução' ? 'bo' : 'bteal';
      var nomeP = (a.cliente || a.partes || a.processo || 'Processo').slice(0, 35);
      return '<div class="aitem">'
        + '<div class="adate"><div class="d">' + dia + '</div><div class="m">' + mes + '</div></div>'
        + '<div style="flex:1">'
        + '<div style="font-size:13px;color:var(--text)">' + nomeP + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + (a.vara || '').slice(0, 30) + (a.hora ? ' · ' + a.hora + 'h' : '') + ' · <span class="badge ' + badge + '">' + tipo + '</span></div>'
        + '</div></div>';
    }).join('');
  }

  // ── TAREFAS ──────────────────────────────────────────────
  function renderTarefas() {
    var d = db(); if (!d) return;
    var box = document.getElementById('dashTarefasConteudo');
    if (!box) return;

    var tarKey = d.KEYS.tarefas || 'lexat_tarefas';
    var tarefas = (d.getAll(tarKey) || [])
      .filter(function(t) { return t.status === 'pendente'; })
      .sort(function(a, b) {
        var pri = { alta: 0, media: 1, baixa: 2 };
        return (pri[a.prioridade] || 1) - (pri[b.prioridade] || 1);
      })
      .slice(0, 5);

    if (!tarefas.length) {
      box.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px 0;text-align:center">Nenhuma tarefa pendente</div>';
      return;
    }

    box.innerHTML = tarefas.map(function(t) {
      var cor = t.prioridade === 'alta' ? 'var(--red)' : t.prioridade === 'media' ? 'var(--orange)' : 'var(--text3)';
      // Ignora tarefas demo sem CNJ real
      if (!t.cnj && t.descricao && t.descricao.toLowerCase().includes('jurisprud')) return '';
      var resp = t.cliente ? t.cliente.slice(0, 25) : '';
      return '<div style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">'
        + '<div style="width:8px;height:8px;border-radius:50%;background:' + cor + ';margin-top:4px;flex-shrink:0"></div>'
        + '<div style="flex:1">'
        + '<div style="font-size:13px;color:var(--text)">' + (t.tipo || t.descricao || '?').slice(0, 40) + '</div>'
        + '<div style="font-size:11px;color:var(--text3);margin-top:2px">'
        + (resp ? resp + ' · ' : '')
        + (t.prioridade === 'alta' ? '<b style="color:var(--red)">Urgente</b>' : t.prioridade === 'media' ? 'Alta' : 'Média')
        + (t.vencimento ? ' · ' + t.vencimento : '')
        + '</div></div></div>';
    }).join('');

    // Badge sidebar
    var sbTar = document.querySelector('.nitem[onclick*="tarefas"] .nbadge');
    if (sbTar) sbTar.textContent = tarefas.length;
  }

  // ── KPIs do Dashboard ────────────────────────────────────
  function renderKPIs() {
    var d = db(); if (!d) return;
    var processos = d.getAll(d.KEYS.processos) || [];
    var clientes  = d.getAll(d.KEYS.clientes)  || [];
    var prazos    = (d.getAll(d.KEYS.prazos) || []).filter(function(p) { return p.status === 'pendente'; });
    var pubs      = d.getAll(d.KEYS.publicacoes) || [];

    var hoje = new Date();
    var urgentes = prazos.filter(function(p) {
      var vISO = p.vencimentoISO || (p.vencimento || '').split('/').reverse().join('-');
      return Math.ceil((new Date(vISO) - hoje) / 86400000) <= 7;
    });

    // Atualiza a barra de status LexDB
    var bar = document.querySelector('[data-lexdb-info], .alert-lexdb');
    var barText = document.querySelector('[data-lexdb-info] span, .alert-lexdb span');
    var target = barText || bar;
    if (target) {
      target.textContent = 'LexDB ativo — ' + clientes.length + ' clientes · '
        + processos.length + ' processos · ' + urgentes.length + ' prazos urgentes';
    }

    // KPI: Clientes ativos
    var kCli = document.querySelector('.kpi-clientes, [data-kpi="clientes"]');
    if (kCli && clientes.length > 0) {
      var numEl = kCli.querySelector('.knum, h2, .big-num');
      if (numEl) numEl.textContent = clientes.length;
    }

    // KPI: Prazos urgentes  
    var kPraz = document.querySelector('.kpi-prazos, [data-kpi="prazos"]');
    if (!kPraz) {
      // Tenta encontrar pelo conteúdo
      document.querySelectorAll('.knum, h2').forEach(function(el) {
        if (el.textContent.trim() === '3' && el.closest('.card')) {
          var card = el.closest('.card');
          if (card && card.textContent.includes('PRAZOS')) {
            el.textContent = urgentes.length;
          }
        }
      });
    }

    // Badge publicações sidebar
    var sbPubs = document.querySelector('.nitem[onclick*="emails"] .nbadge, .nitem[onclick*="publicacoes"] .nbadge');
    if (sbPubs && pubs.length) sbPubs.textContent = pubs.length;

    // Badge prazos sidebar
    var sbPraz = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sbPraz && urgentes.length) sbPraz.textContent = urgentes.length;

    // Badge processos sidebar  
    var sbProc = document.querySelector('.nitem[onclick*="processos"] .nbadge');
    // Não sobrescreve o badge de processos pois vem do XLS2_DATA (5848)
  }

  // ── Render completo ──────────────────────────────────────
  function renderDashboard() {
    renderKPIs();
    renderPrazos();
    renderAudiencias();
    renderTarefas();
  }

  // ── Expõe para uso externo ───────────────────────────────
  window.renderPrazosDash    = renderPrazos;
  window.renderDashboardFull = renderDashboard;

  // ── Hook no go() ─────────────────────────────────────────
  function hookGo() {
    var origGo = window.go;
    if (origGo && !origGo._dashHook) {
      window.go = function(page, el) {
        try { origGo(page, el); } catch(e) {}
        if (page === 'dashboard') setTimeout(renderDashboard, 200);
        // Também re-renderiza ao navegar para outras páginas
        if (typeof window.lexRenderPagina === 'function') {
          setTimeout(function() { window.lexRenderPagina(page); }, 300);
        }
      };
      window.go._dashHook = true;
    }
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    hookGo();
    renderDashboard();
    // Re-renderiza periodicamente
    // setInterval removido para performance;
  }

  aguardar(init);
})();

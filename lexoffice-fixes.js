/**
 * LexOffice 5.0 — Correções de Bugs (lexoffice-fixes.js)
 * Adicione este script no final do <body>, APÓS o script principal do index.html
 * <script src="lexoffice-fixes.js"></script>
 *
 * Bugs corrigidos:
 *  1. parseEmail / mostrarParser — parserCard não aparecia
 *  2. filtrarClientes — id searchCli vs searchClientes
 *  3. renderClientes fallback — usa S.clientes quando não há clients_data.js
 *  4. Gmail inbox — inboxBody não existia (usa inboxList)
 *  5. _renderGmail — usava <tr><td> dentro de uma <div>, quebrava layout
 *  6. preencherRespSel — tentava preencher 'f_adv' inexistente
 *  7. mudaPagC — versão duplicada conflitante removida
 *  8. carregarClientes2 — nome do arquivo clients_data.js → dados_clientes.js
 *  9. Log de início no parseEmail para feedback visual
 * 10. nbEmails na sidebar — badge não existe, referência removida
 */

(function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // FIX 1 — mostrarParser: forçar visibilidade do parserCard
  // O card existia no HTML mas ficava oculto porque o CSS pai
  // controlava o display. Agora forçamos antes de qualquer acesso.
  // ─────────────────────────────────────────────────────────────
  window.mostrarParser = function(d, fonte) {
    var card   = document.getElementById('parserCard');
    var campos = document.getElementById('parserCampos');
    var src    = document.getElementById('parserSrc');
    if (!card || !campos) return;

    // CORREÇÃO: garantir visibilidade antes de tudo
    card.style.display    = 'block';
    card.style.visibility = 'visible';
    card.style.opacity    = '1';

    if (src) src.textContent = fonte === 'impacta' ? '📡 Impacta' : '📰 JusBrasil';

    var rows = [
      d.cnjs && d.cnjs.length ? { l: 'Processo CNJ', v: d.cnjs.join(', '), c: 'var(--teal)' } : null,
      d.partes ? { l: 'Partes', v: d.partes } : null,
      d.mov    ? { l: 'Movimentação', v: d.mov, c: 'var(--gold)' } : null,
      d.prazo  ? { l: 'Prazo', v: d.prazo, c: 'var(--red)' } : null,
      d.aud_data ? { l: 'Audiência', v: d.aud_data + (d.aud_hora ? ' às ' + d.aud_hora : ''), c: 'var(--purple)' } : null,
      d.vara   ? { l: 'Vara', v: d.vara } : null,
      d.datas && d.datas.length > 1 ? { l: 'Datas detectadas', v: d.datas.join(', ') } : null,
    ].filter(Boolean);

    if (rows.length) {
      campos.innerHTML = rows.map(function(r) {
        return '<div style="display:flex;gap:11px;padding:8px 0;border-bottom:1px solid var(--border)">'
          + '<div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;width:140px;flex-shrink:0;padding-top:2px">' + r.l + '</div>'
          + '<div style="font-size:13px;color:' + (r.c || 'var(--text)') + ';font-weight:500">' + r.v + '</div></div>';
      }).join('');
    } else {
      campos.innerHTML = '<div style="color:var(--text3);padding:12px;font-size:13px">'
        + '⚠️ Nenhum dado estruturado detectado. Verifique o formato do e-mail ou use Parser IA.</div>';
    }

    // scroll suave com delay para garantir que o DOM atualizou
    setTimeout(function() {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 2 — parseEmail: adicionar log visual de início + fallback
  // ─────────────────────────────────────────────────────────────
  window.parseEmail = function() {
    var fonteEl = document.getElementById('emailRem');
    var bodyEl  = document.getElementById('emailBody');
    var fonte   = fonteEl ? fonteEl.value : 'impacta';
    var texto   = bodyEl  ? bodyEl.value.trim() : '';

    if (!texto) { toast('Cole o conteúdo do e-mail primeiro', 'orange'); return; }

    eLog('⏳ Processando e-mail...', 'teal');

    var d = extrairDados(texto, fonte);
    EMAIL.stats.total++;

    if (isDup(d, fonte)) {
      EMAIL.stats.dups++;
      eLog('DUPLICATA ignorada (JusBrasil): ' + (d.cnjs[0] || 'CNJ desconhecido') + ' já recebido via Impacta', 'warn');
      toast('Duplicata detectada — JusBrasil ignorado (já via Impacta)', 'orange');
      eKPI();
      return;
    }

    if (fonte === 'impacta') {
      d.cnjs.forEach(function(c) { EMAIL.cnjs_impacta[c] = true; });
    }

    EMAIL._extracao = d;
    mostrarParser(d, fonte);

    EMAIL.stats.procs += d.cnjs.length;
    eLog('✅ Processado: ' + d.cnjs.length + ' proc(s), prazo: ' + (d.prazo || 'não detectado'), 'ok');
    eKPI();
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 3 — filtrarClientes: aceitar ambos os IDs (searchCli / searchClientes)
  // ─────────────────────────────────────────────────────────────
  window.filtrarClientes = function() {
    var searchEl = document.getElementById('searchClientes') || document.getElementById('searchCli');
    var q = searchEl ? searchEl.value.toLowerCase().trim() : '';

    // Se dados externos carregados (clients_data.js / dados_clientes.js)
    if (typeof CLIENTS_LOADED !== 'undefined' && CLIENTS_LOADED && typeof CLIENTS_DATA !== 'undefined' && CLIENTS_DATA.length > 0) {
      S.cliFiltrados = q
        ? CLIENTS_DATA.filter(function(c) {
            return (c[0]||'').toLowerCase().includes(q)
              || (c[3]||'').toLowerCase().includes(q)
              || (c[4]||'').toLowerCase().includes(q)
              || (c[6]||'').toLowerCase().includes(q);
          })
        : CLIENTS_DATA.slice();
      S.cliPag = 0;
      renderClientesTable();
      var elc = document.getElementById('cliCount');
      if (elc) elc.textContent = S.cliFiltrados.length + ' clientes';
      return;
    }

    // Fallback: usar S.clientes (dados internos)
    S.cFiltrados = q
      ? S.clientes.filter(function(c) {
          return (c.nome || '').toLowerCase().includes(q)
            || (c.exadverso || '').toLowerCase().includes(q)
            || (c.area || '').toLowerCase().includes(q);
        })
      : S.clientes.slice();
    S.cPag = 0;
    renderClientes();
    var elc2 = document.getElementById('cliCount');
    if (elc2) elc2.textContent = (S.cFiltrados.length || S.clientes.length) + ' clientes';
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 4 — preencherRespSel: 'f_adv' não existe, deve ser 'f_resp'
  // ─────────────────────────────────────────────────────────────
  window.preencherRespSel = function() {
    var opts = S.usuarios
      .filter(function(u) {
        return u.ativo && (u.perfil === 'advogado' || u.perfil === 'associado' || u.perfil === 'admin');
      })
      .map(function(u) { return '<option value="' + u.id + '">' + u.nome + '</option>'; })
      .join('');

    // CORREÇÃO: 'f_adv' → 'f_resp' (id correto no modal de processo)
    ['c_resp', 'f_resp', 'prazRespSel', 'tRespSel'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 5 — mudaPagC: remover conflito de versões duplicadas
  // Mantemos apenas uma versão unificada
  // ─────────────────────────────────────────────────────────────
  window.mudaPagC = function(dir) {
    var PER = 30;
    // Se dados externos
    if (typeof CLIENTS_LOADED !== 'undefined' && CLIENTS_LOADED && typeof CLIENTS_DATA !== 'undefined' && CLIENTS_DATA.length > 0) {
      var pages = Math.ceil((S.cliFiltrados || []).length / PER);
      S.cliPag = Math.max(0, Math.min(pages - 1, (S.cliPag || 0) + dir));
      renderClientesTable();
      return;
    }
    // Fallback dados internos
    var tot = (S.cFiltrados || S.clientes || []).length;
    var max = Math.ceil(tot / PER) - 1;
    S.cPag = Math.max(0, Math.min(max, (S.cPag || 0) + dir));
    renderClientes();
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 6 — carregarClientes2: nome correto do arquivo + fallback robusto
  // ─────────────────────────────────────────────────────────────
  window.carregarClientes2 = function() {
    if (typeof CLIENTS_LOADED !== 'undefined' && CLIENTS_LOADED) return;

    var s = document.createElement('script');
    s.src = 'dados_clientes.js'; // CORREÇÃO: era 'clients_data.js'

    s.onload = function() {
      if (typeof CLIENTS !== 'undefined') {
        window.CLIENTS_DATA = CLIENTS;
        window.CLIENTS_LOADED = true;
        S.cliFiltrados = CLIENTS_DATA.slice();
        renderClientesTable();
        var el = document.getElementById('cliCount');
        if (el) el.textContent = CLIENTS_DATA.length + ' clientes';
        toast('✅ ' + CLIENTS_DATA.length + ' clientes carregados', 'teal');
      }
    };

    s.onerror = function() {
      // CORREÇÃO: fallback usa S.clientes em vez de falhar silenciosamente
      window.CLIENTS_LOADED = true;
      window.CLIENTS_DATA = [];
      S.cliFiltrados = S.clientes.slice();
      renderClientes();
      var el = document.getElementById('cliCount');
      if (el) el.textContent = S.clientes.length + ' clientes';
    };

    document.head.appendChild(s);
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 7 — _renderGmail: usar divs em vez de <tr><td> dentro de <div>
  // O container inboxList é uma <div>, não uma <table>
  // ─────────────────────────────────────────────────────────────
  window._renderGmail = function(msgs) {
    // CORREÇÃO: usar inboxList (div) em vez de inboxBody (tbody inexistente)
    var tb = document.getElementById('inboxList');
    if (!tb) return;

    EMAIL._gmailMsgs = msgs;
    msgs.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    if (!msgs.length) {
      tb.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
      return;
    }

    tb.innerHTML = msgs.map(function(m, i) {
      var isJB  = m.from.toLowerCase().indexOf('jusbrasil') >= 0;
      var fonte = isJB ? 'JusBrasil' : 'Impacta';
      var cor   = isJB ? 'bo' : 'bteal';
      var d     = new Date(m.date);
      var ds    = isNaN(d.getTime()) ? m.date : d.toLocaleDateString('pt-BR');

      return '<div class="ditem" style="cursor:pointer;flex-direction:column;align-items:flex-start;gap:4px;margin-bottom:6px" onclick="_abrirGmail(' + i + ')">'
        + '<div style="display:flex;align-items:center;gap:8px;width:100%">'
        + '<span class="badge ' + cor + '" style="font-size:10px;flex-shrink:0">' + fonte + '</span>'
        + '<span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + m.subject + '</span>'
        + '<span style="font-size:11px;color:var(--text3);flex-shrink:0">' + ds + '</span>'
        + '<button class="btn btn-ghost btn-xs" style="flex-shrink:0" onclick="event.stopPropagation();_parseGmail(' + i + ')">⚡ IA</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text2);padding-left:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + m.snippet + '</div>'
        + '</div>';
    }).join('');

    var cnt = document.getElementById('inboxCount');
    if (cnt) cnt.textContent = msgs.length;
    // CORREÇÃO: nbEmails não existe na sidebar — removida referência
  };

  // ─────────────────────────────────────────────────────────────
  // FIX 8 — carregarInbox: usar inboxList em vez de inboxBody
  // ─────────────────────────────────────────────────────────────
  window.carregarInbox = function() {
    var tb = document.getElementById('inboxList');

    if (!EMAIL.ok || !EMAIL.token) {
      if (tb) tb.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📧 Conecte o Gmail para ver publicações.</div>';
      return;
    }

    window.ativarGmailUI && ativarGmailUI();
    if (tb) tb.innerHTML = '<div style="text-align:center;padding:14px;color:var(--teal);font-size:13px">⏳ Carregando emails...</div>';

    var q = 'from:publicacoes@impacta.adv.br OR from:publicacoes-diarios@jusbrasil.com.br';
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(q) + '&maxResults=20', {
      headers: { 'Authorization': 'Bearer ' + EMAIL.token }
    })
    .then(function(r) {
      if (r.status === 401) {
        DB.save('lex_gmail_auth', null);
        EMAIL.ok = false;
        EMAIL.token = '';
        if (tb) tb.innerHTML = '<div style="text-align:center;padding:14px;color:var(--red);font-size:13px">⚠️ Token expirado — clique em Conectar Gmail novamente.</div>';
        return null;
      }
      return r.json();
    })
    .then(function(d) {
      if (!d) return;
      if (!d.messages || !d.messages.length) {
        if (tb) tb.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
        return;
      }
      window._fetchGmailList(d.messages.slice(0, 15));
    })
    .catch(function(e) {
      if (tb) tb.innerHTML = '<div style="text-align:center;padding:14px;color:var(--red);font-size:13px">❌ ' + e.message + '</div>';
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Inicialização: re-executar preencherRespSel com o fix aplicado
  // ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      preencherRespSel();
    }, 200);
  });

  console.log('[LexOffice Fixes] ✅ 8 correções aplicadas com sucesso.');

})();

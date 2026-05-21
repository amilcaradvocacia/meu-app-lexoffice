/**
 * LexOfficeAT — Enhancements v1.0
 * Melhorias seguras — NÃO modifica código original
 * Carrega após todos os outros scripts
 *
 * 1. testarIA corrigido (chamada real Claude API)
 * 2. abrirProcessoXLS2 melhorado (partes + DataJud auto)
 * 3. Novo Processo com ficha automática
 * 4. Publicações com histórico LexDB
 * 5. Validação antes de salvar
 */
(function() {
  'use strict';

  // Aguarda tudo carregar
  function init() {

    // ============================================================
    // 1. TESTAR CLAUDE — substituição direta
    // ============================================================
    if (window.LexAT) {
      window.LexAT.testarIA = async function() {
        var st = document.getElementById('lexat_status');
        var key = localStorage.getItem('lex_anthropic_key') || '';
        if (!key) {
          if (st) st.innerHTML = '❌ API Key não configurada — cole a chave e clique Salvar';
          if (window.toast) window.toast('⚠️ Configure a API Key Claude primeiro', 'orange');
          return;
        }
        if (st) st.innerHTML = '🔍 Testando Claude API...';
        try {
          var resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: localStorage.getItem('lex_claude_modelo') || 'claude-sonnet-4-20250514',
              max_tokens: 80,
              messages: [{ role: 'user', content: 'Responda apenas: Claude ativo no LexOfficeAT!' }]
            })
          });
          var data = await resp.json();
          if (data.content && data.content[0] && data.content[0].text) {
            if (st) st.innerHTML = '✅ Claude ativo! Modelo: ' + (data.model || '?').replace('claude-','').slice(0,20)
              + ' — ' + data.content[0].text;
            if (window.toast) window.toast('✅ Claude funcionando!', 'green');
          } else if (data.error) {
            var msg = data.error.message || JSON.stringify(data.error);
            if (st) st.innerHTML = '❌ ' + msg;
            if (window.toast) window.toast('❌ ' + msg.slice(0,60), 'red');
          }
        } catch(e) {
          if (st) st.innerHTML = '❌ Erro: ' + e.message;
          if (window.toast) window.toast('❌ Erro de conexão: ' + e.message, 'red');
        }
      };
      console.log('[Enhancements] ✅ testarIA substituído');
    }

    // ============================================================
    // 2. MELHORAR abrirProcessoXLS2 — wrappa sem substituir
    // ============================================================
    var _origAbrir = window.abrirProcessoXLS2;
    window.abrirProcessoXLS2 = function(r) {
      // Chama original primeiro
      if (_origAbrir) _origAbrir(r);

      // Depois adiciona melhorias
      setTimeout(function() {
        var row = typeof r === 'string' ? JSON.parse(r) : r;

        // Preenche advogado responsável → Dr. Amilcar
        var respEl = document.getElementById('f_resp');
        if (respEl && !respEl.value) {
          for (var i = 0; i < respEl.options.length; i++) {
            if (respEl.options[i].text.toLowerCase().includes('amilcar')) {
              respEl.selectedIndex = i; break;
            }
          }
        }

        // Preenche partes se ainda vazias
        var parte1El = document.getElementById('f_parte1');
        var exadvEl  = document.getElementById('f_exadv');
        if (parte1El && !parte1El.value && row[7]) {
          parte1El.value = row[7];
          parte1El.classList.add('af');
        }
        if (exadvEl && !exadvEl.value && row[9]) {
          exadvEl.value = row[9];
          exadvEl.classList.add('af');
          // Detecta PJ
          var tipoEl = document.getElementById('f_tipo_adv');
          if (tipoEl) {
            tipoEl.value = /LTDA|S\.A|EIRELI|ME |EPP|CIA\.|EMPRESA|SOCIEDADE/i.test(row[9]) ? 'PJ' : 'PF';
          }
        }

        // Polo
        var poloEl = document.getElementById('f_polo');
        if (poloEl && row[8] && !['AUTOR','RÉU','AMBOS','TERCEIRO'].includes(poloEl.value)) {
          poloEl.value = row[8];
        }

        // Se tiver CNJ mas faltar tipo de ação → auto-consulta DataJud
        var cnj = (document.getElementById('f_auto') || {}).value || '';
        var acao = (document.getElementById('f_acao') || {}).value || '';
        if (cnj && !acao && typeof window.consultarCNJ === 'function') {
          var cnjInput = document.getElementById('cnj_input_api');
          if (cnjInput) cnjInput.value = cnj;
          setTimeout(function() { window.consultarCNJ(); }, 600);
        }

      }, 300);
    };
    console.log('[Enhancements] ✅ abrirProcessoXLS2 melhorado');

    // ============================================================
    // 3. NOVO PROCESSO — ficha automática
    // ============================================================
    // Intercepta o botão + Novo Processo
    var btnNovo = document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
    if (btnNovo) {
      btnNovo.onclick = function(e) {
        e.preventDefault();
        abrirNovoProcessoEnhanced();
      };
      console.log('[Enhancements] ✅ botão Novo Processo interceptado');
    }

    function abrirNovoProcessoEnhanced() {
      if (typeof openModal === 'function') openModal('mProcesso');

      setTimeout(function() {
        if (typeof switchTab === 'function') switchTab('dados');

        // Gera próxima ficha
        var maxNum = 0;
        if (typeof XLS2_DATA !== 'undefined') {
          XLS2_DATA.forEach(function(r) {
            var n = parseInt((r[0] || '').replace(/[^0-9]/g, ''));
            if (!isNaN(n) && n > maxNum) maxNum = n;
          });
        }
        // Verifica também no LexDB
        if (typeof LexSync !== 'undefined') {
          LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p) {
            var n = parseInt((p.ficha || '').replace(/[^0-9]/g, ''));
            if (!isNaN(n) && n > maxNum) maxNum = n;
          });
        }
        var novaFicha = 'A' + String(maxNum + 1).padStart(4, '0');

        // Limpa e preenche
        var campos = ['f_acao','f_auto','f_vara','f_comarca','f_parte1','f_exadv',
                      'f_cpf_cli','f_qual_cli','f_cpf_adv','f_qual_adv','f_adv_adv'];
        campos.forEach(function(id) {
          var el = document.getElementById(id); if (el) el.value = '';
        });
        if (typeof setVal === 'function') setVal('f_proc', novaFicha);
        else { var fp = document.getElementById('f_proc'); if (fp) fp.value = novaFicha; }

        // Polo e tipo padrão
        var poloEl = document.getElementById('f_polo');
        if (poloEl) poloEl.value = 'AUTOR';
        var tipoEl = document.getElementById('f_tipo_adv');
        if (tipoEl) tipoEl.value = 'PF';

        // Advogado → Dr. Amilcar
        var respEl = document.getElementById('f_resp');
        if (respEl) {
          for (var i = 0; i < respEl.options.length; i++) {
            if (respEl.options[i].text.toLowerCase().includes('amilcar')) {
              respEl.selectedIndex = i; break;
            }
          }
        }

        // Banner
        var b = document.getElementById('autoFillBanner');
        if (b) {
          b.style.display = 'flex';
          b.innerHTML = '✨ Novo processo — ficha <strong>' + novaFicha + '</strong> — Digite o CNJ e pressione Enter';
        }

        // Foca CNJ
        var cnjEl = document.getElementById('cnj_input_api');
        if (cnjEl) setTimeout(function() { cnjEl.focus(); }, 250);

      }, 200);
    }

    // ============================================================
    // 4. PUBLICAÇÕES — histórico do LexDB no ↻
    // ============================================================
    var _origCarregarInbox = window.carregarInbox;
    window.carregarInbox = function() {
      // Chama original se existir
      if (_origCarregarInbox) _origCarregarInbox();

      // Adiciona publicações do LexDB
      setTimeout(function() {
        var el = document.getElementById('inboxList');
        if (!el) return;

        var pubs = [];
        try {
          if (typeof LexSync !== 'undefined') {
            pubs = (LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes) || [])
              .slice(-50).reverse(); // últimas 50
          }
        } catch(e) {}

        if (!pubs.length) return; // mantém o que o original mostrou

        var html = '';
        pubs.forEach(function(pub) {
          var isJB = pub.fonte === 'jusbrasil';
          var cor = isJB ? 'bo' : 'bteal';
          var label = isJB ? 'JusBrasil' : 'Impacta';
          var data = (pub.data || pub.timestamp || '').slice(0,10);
          if (data.length === 10 && data.includes('-')) {
            var p = data.split('-');
            data = p[2]+'/'+p[1]+'/'+p[0];
          }
          var mov = (pub.movimento || pub.raw || '').slice(0,90);
          html += '<div class="ditem" style="flex-direction:column;align-items:flex-start;'
            + 'gap:3px;margin-bottom:5px;cursor:pointer;animation:fadeIn .3s ease"'
            + ' onclick="lexEnhRecarregarPub(\'' + pub.id + '\')">'
            + '<div style="display:flex;align-items:center;gap:7px;width:100%">'
            + '<span class="badge ' + cor + '" style="font-size:10px">' + label + '</span>'
            + (pub.cnj ? '<span style="font-size:10px;color:var(--teal)">' + pub.cnj + '</span>' : '')
            + '<span style="font-size:10px;color:var(--text3);margin-left:auto">' + data + '</span>'
            + '<span class="badge bg" style="font-size:9px">✅</span>'
            + '</div>'
            + (mov ? '<div style="font-size:11px;color:var(--text2);padding-left:2px">' + mov + '...</div>' : '')
            + '</div>';
        });

        if (html) el.innerHTML = html;
      }, 300);
    };

    window.lexEnhRecarregarPub = function(pubId) {
      try {
        var pubs = LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes) || [];
        var pub = pubs.find(function(p) { return p.id === pubId; });
        if (!pub) return;
        var bodyEl = document.getElementById('emailBody');
        if (bodyEl) bodyEl.value = pub.raw || pub.movimento || '';
        var remEl = document.getElementById('emailRem');
        if (remEl) remEl.value = pub.fonte || 'impacta';
        if (window.toast) window.toast('📋 Publicação carregada — clique em Extrair & Processar', 'blue');
      } catch(e) {}
    };
    console.log('[Enhancements] ✅ carregarInbox melhorado');

    // ============================================================
    // 5. VALIDAÇÃO ANTES DE SALVAR
    // ============================================================
    var _origSalvar = window.salvarProcesso;
    window.salvarProcesso = function() {
      var g = function(id) { return (document.getElementById(id) || {}).value || ''; };
      var erros = [];
      var campos = [
        { id: 'f_proc',   nome: 'Ficha / Nº Processo' },
        { id: 'f_auto',   nome: 'Nº Auto / CNJ' },
        { id: 'f_acao',   nome: 'Tipo de Ação' },
        { id: 'f_parte1', nome: 'Nome do Cliente' },
      ];
      campos.forEach(function(c) {
        if (!g(c.id)) erros.push(c.nome);
      });

      if (erros.length) {
        if (window.toast) window.toast('⚠️ Preencha: ' + erros.join(' · '), 'orange');
        // Destaca vermelhos
        campos.forEach(function(c) {
          var el = document.getElementById(c.id);
          if (el && !el.value) {
            el.style.borderColor = 'var(--red)';
            el.style.boxShadow = '0 0 0 2px rgba(224,92,92,.2)';
            setTimeout(function() {
              el.style.borderColor = '';
              el.style.boxShadow = '';
            }, 3000);
          }
        });
        // Muda para aba com erro
        if (!g('f_proc') || !g('f_auto') || !g('f_acao')) {
          if (typeof switchTab === 'function') switchTab('dados');
        } else {
          if (typeof switchTab === 'function') switchTab('partes');
        }
        return;
      }

      // Tudo ok — chama original
      if (_origSalvar) _origSalvar();
    };
    console.log('[Enhancements] ✅ salvarProcesso com validação');

    // ============================================================
    // CSS para auto-fill highlighting
    // ============================================================
    if (!document.getElementById('lex-enh-css')) {
      var s = document.createElement('style');
      s.id = 'lex-enh-css';
      s.textContent = '.af{border-color:var(--teal)!important;background:rgba(62,207,207,.04)!important;transition:border-color .4s}';
      document.head.appendChild(s);
    }

    console.log('[LexOfficeAT Enhancements v1.0] ✅ Todos os módulos ativos');
  }

  // Inicia após tudo carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 800); });
  } else {
    setTimeout(init, 800);
  }

  // Re-aplica ao trocar de página
  var _origGo = window.go;
  setTimeout(function() {
    if (window.go && window.go !== _origGo) return;
    var origGo2 = window.go;
    window.go = function(page, el) {
      if (origGo2) origGo2(page, el);
      setTimeout(function() {
        // Re-aplica botão novo processo ao abrir página de processos
        if (page === 'processos') {
          var btn = document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
          if (btn && btn.onclick && btn.onclick.toString().includes('openModal')) {
            btn.onclick = function(e) { e.preventDefault(); abrirNovoProcessoEnhanced(); };
          }
        }
      }, 400);
    };
  }, 1200);

})();

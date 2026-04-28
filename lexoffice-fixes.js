// ================================================================
// LexOffice FIXES v4.0 — Sistema completo de correções
// Corrige: Dashboard, Ver Email, Auto-cadastro, Busca, IA, Prazos
// ================================================================

// ── ESPERA O DOM carregar antes de aplicar correções ──
(function waitReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAllFixes);
  } else {
    setTimeout(applyAllFixes, 800);
  }
})();

function applyAllFixes() {
  fixDashboard();
  fixEmailVer();
  fixProcessarTudo();
  fixParseEmail();
  fixBuscaProcessos();
  fixAutoSync();
  fixIAIntegracao();
  fixPrazosRender();
  log('✅ LexOffice Fixes v4.0 aplicados com sucesso', 'ok');
}

// ── SAFE LOG ──
function log(msg, tipo) {
  if (typeof eLog === 'function') {
    eLog(msg, tipo || 'info');
  } else {
    console.log('[LEX]', msg);
  }
}

// ══════════════════════════════════════════════════════
// FIX 1: DASHBOARD — métricas reais
// ══════════════════════════════════════════════════════
function fixDashboard() {
  // Atualiza KPIs com dados reais do estado
  function atualizarDash() {
    var kc = document.getElementById('kClientes');
    var totalCli = (typeof S !== 'undefined' && S.clientes) ? S.clientes.filter(function(c){return c.status==='ativo'||c.status==='vip';}).length : 0;
    if (kc) kc.textContent = totalCli;

    var nb = document.getElementById('nbClientes');
    if (nb) nb.textContent = totalCli;

    var totalProc = (typeof XLS !== 'undefined' ? XLS.length : 0) + (typeof XLS2_DATA !== 'undefined' ? XLS2_DATA.length : 0);
    var kp = document.getElementById('kProc') || document.querySelector('.kcard.blue .kval');
    if (kp && totalProc > 0) kp.textContent = totalProc;

    // Prazos urgentes
    var prazos = (typeof EMAIL !== 'undefined' && EMAIL.prazos) ? EMAIL.prazos : [];
    var urgentes = prazos.filter(function(p){
      var d = calcDiasSafe(p.prazo); return typeof d === 'number' && d <= 5;
    }).length;
    var kpu = document.querySelector('.kcard.red .kval');
    if (kpu && urgentes > 0) kpu.textContent = urgentes;
  }

  // Executa agora e a cada 30s
  atualizarDash();
  setInterval(atualizarDash, 30000);

  // Vincula botão "Processos" no alerta do dashboard
  var alertLinks = document.querySelectorAll('.alert-t strong, .alert-t a');
  alertLinks.forEach(function(el) {
    if (el.textContent.includes('Processos')) {
      el.style.cursor = 'pointer';
      el.style.textDecoration = 'underline';
      el.addEventListener('click', function() {
        if (typeof go === 'function') go('processos', null);
      });
    }
  });
}

// ══════════════════════════════════════════════════════
// FIX 2: BOTÃO VER — carrega e-mail + extrai + cadastra
// ══════════════════════════════════════════════════════
function fixEmailVer() {
  window.verEmail = function(idx) {
    var msgs = (typeof EMAIL !== 'undefined') ? EMAIL._gmailMsgs : null;
    if (!msgs || !msgs[idx]) {
      toast('E-mail não encontrado', 'orange');
      return;
    }
    var m = msgs[idx];
    log('Abrindo: ' + m.subject, 'info');

    if (!EMAIL.token) {
      toast('Gmail não conectado. Clique em "Conectar Gmail"', 'orange');
      return;
    }

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
      headers: { 'Authorization': 'Bearer ' + EMAIL.token }
    })
    .then(function(r) {
      if (r.status === 401) {
        EMAIL.ok = false;
        EMAIL.token = null;
        if (typeof DB !== 'undefined') DB.save('lex_gmail_auth', null);
        toast('Sessão expirada — reconecte o Gmail', 'orange');
        return null;
      }
      return r.json();
    })
    .then(function(msg) {
      if (!msg) return;

      // Extrai corpo do e-mail (plain text primeiro, HTML como fallback)
      var body = '';
      function extractBody(p) {
        if (!p) return;
        if (p.mimeType === 'text/plain' && p.body && p.body.data) {
          try {
            var dec = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            if (dec.length > body.length) body = dec;
          } catch(e) {}
        }
        if (p.mimeType === 'text/html' && p.body && p.body.data && !body) {
          try {
            var html = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            body = html.replace(/<br\s*\/?>/gi, '\n')
                       .replace(/<p[^>]*>/gi, '\n')
                       .replace(/<[^>]+>/g, '')
                       .replace(/&nbsp;/g, ' ')
                       .replace(/&amp;/g, '&')
                       .replace(/&lt;/g, '<')
                       .replace(/&gt;/g, '>')
                       .replace(/\s{3,}/g, '\n')
                       .trim();
          } catch(e) {}
        }
        if (p.parts) p.parts.forEach(extractBody);
      }
      extractBody(msg.payload || {});
      if (!body) body = msg.snippet || '';

      // Detecta headers
      var hdrs = {};
      ((msg.payload && msg.payload.headers) || []).forEach(function(h) { hdrs[h.name] = h.value; });
      var from = hdrs['From'] || m.from || '';

      // Preenche o formulário
      var rem = document.getElementById('emailRem');
      if (rem) rem.value = from.toLowerCase().indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta';

      var bod = document.getElementById('emailBody');
      if (bod) bod.value = body;

      log('E-mail carregado (' + body.length + ' chars)', 'teal');

      // Extrai dados e cadastra
      setTimeout(function() {
        // Chama parser original
        if (typeof parseEmailOriginal === 'function') {
          parseEmailOriginal();
        } else if (typeof parseEmail === 'function') {
          parseEmail();
        }
        // Auto-cadastro
        autoCadastrar(body, { subject: m.subject || '', from: from });
      }, 300);
    })
    .catch(function(e) {
      log('Erro ao abrir e-mail: ' + e.message, 'err');
      toast('Erro ao abrir e-mail: ' + e.message, 'orange');
    });
  };

  // Também corrige _renderGmail para usar verEmail correto
  window._renderGmail = function(msgs) {
    var il = document.getElementById('inboxList');
    if (!il) return;
    EMAIL._gmailMsgs = msgs;
    msgs.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    if (!msgs.length) {
      il.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
      return;
    }

    il.innerHTML = msgs.map(function(m, i) {
      var isJB = (m.from || '').toLowerCase().indexOf('jusbrasil') >= 0;
      var cor = isJB ? 'bo' : 'bteal';
      var fonte = isJB ? 'JusBrasil' : 'Impacta';
      var d = new Date(m.date);
      var ds = isNaN(d.getTime()) ? (m.date || '') : d.toLocaleDateString('pt-BR');
      var snip = (m.snippet || '').substring(0, 80);
      return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
        + '<span class="badge ' + cor + '" style="font-size:10px;flex-shrink:0;margin-top:2px">' + fonte + '</span>'
        + '<div style="flex:1;min-width:0;cursor:pointer" onclick="window._abrirGmail(' + i + ')">'
        + '<div style="font-size:12.5px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (m.subject || '(sem assunto)') + '</div>'
        + '<div style="font-size:10.5px;color:var(--text3);margin-top:2px">' + ds + ' — ' + snip + '</div>'
        + '</div>'
        + '<button class="btn btn-teal btn-xs" style="flex-shrink:0;white-space:nowrap" onclick="window.verEmail(' + i + ')">👁 Ver</button>'
        + '</div>';
    }).join('');

    var badge = document.getElementById('gmailOkBadge');
    if (badge) badge.style.display = 'inline-block';
  };
}

// ══════════════════════════════════════════════════════
// FIX 3: AUTO-CADASTRO de Cliente e Processo
// ══════════════════════════════════════════════════════
function autoCadastrar(corpo, meta) {
  if (!corpo) return;
  var assunto = (meta && meta.subject) || '';
  var from = (meta && meta.from) || '';
  var fonteId = from.toLowerCase().indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta';

  // Extrai dados estruturados
  var d = (typeof extrairDados === 'function') ? extrairDados(corpo, fonteId) : null;
  if (!d) return;

  // ── Encontra nome do cliente ──
  var clienteNome = '';

  // Método 1: campo "Partes:" do corpo
  if (d.partes) {
    var px = d.partes.split(/\s+[xX×]\s+/);
    if (px[0] && px[0].trim().length > 3) clienteNome = px[0].trim();
  }

  // Método 2: assunto "– NOME SOBRENOME –"
  if (!clienteNome && assunto) {
    var matches = assunto.match(/[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜa-záéíóúâêôãõçàü\s]{3,}?)\s*[–\-]/);
    if (matches && matches[1]) clienteNome = matches[1].trim();
  }

  // Método 3: assunto "IPRAZOS – NOME"
  if (!clienteNome && assunto) {
    var m2 = assunto.match(/(?:IPRAZOS|Iprazos)[^A-Z]*[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜa-záéíóúâêôãõçàü\s]{3,}?)(?:\s*[–\-]|$)/);
    if (m2 && m2[1]) clienteNome = m2[1].trim();
  }

  // Método 4: cruza pelo CNJ no XLS
  if (!clienteNome && d.cnjs && d.cnjs.length && typeof XLS !== 'undefined') {
    var cnjNum = d.cnjs[0].replace(/[^0-9]/g, '').substring(0, 13);
    var xr = XLS.find(function(r) {
      return r.processo && r.processo.replace(/[^0-9]/g, '').indexOf(cnjNum) >= 0;
    });
    if (xr && xr.parte1) clienteNome = xr.parte1;
  }

  // ── Cadastra cliente se encontrado ──
  if (clienteNome && clienteNome.length > 3 && typeof S !== 'undefined') {
    var norm = clienteNome.trim().toUpperCase().replace(/\s+/g, ' ');
    var existe = S.clientes.find(function(c) {
      var cn = c.nome.toUpperCase().replace(/\s+/g, ' ');
      return cn === norm || (norm.length > 8 && cn.indexOf(norm.substring(0, 8)) >= 0);
    });

    if (!existe) {
      // Encontra adverso
      var adverso = '';
      if (d.partes) {
        var padv = d.partes.split(/\s+[xX×]\s+/);
        adverso = (padv[1] || '').trim();
      }
      if (!adverso && d.cnjs && d.cnjs.length && typeof XLS !== 'undefined') {
        var xrAdv = XLS.find(function(r) {
          return r.processo && r.processo.replace(/[^0-9]/g,'').indexOf(d.cnjs[0].replace(/[^0-9]/g,'').substring(0,13)) >= 0;
        });
        if (xrAdv) adverso = xrAdv.ex_adverso || '';
      }

      var area = detectArea(d.mov || '');
      var novoC = {
        id: S.nextCid++,
        nome: clienteNome.trim(),
        cpfcnpj: '', email: '', tel: '',
        area: area, tipo: 'PF', status: 'ativo', resp: S.uidAtivo || 1,
        exadverso: adverso,
        endereco: d.vara || '',
        obs: 'Auto-cadastrado via publicação ' + new Date().toLocaleDateString('pt-BR') + '. CNJ: ' + (d.cnjs && d.cnjs[0] ? d.cnjs[0] : 'N/A')
      };
      S.clientes.push(novoC);
      S.cFiltrados = [].concat(S.clientes);
      if (typeof renderKPIClientes === 'function') renderKPIClientes();
      if (typeof renderClientes === 'function') renderClientes();
      log('👤 Cliente cadastrado: ' + clienteNome.trim(), 'ok');
      if (typeof toast === 'function') toast('👤 Novo cliente: ' + clienteNome.trim(), 'teal');

      // Atualiza badge
      var nb = document.getElementById('nbClientes');
      if (nb) nb.textContent = S.clientes.length;
    } else {
      log('Cliente já existe: ' + existe.nome, 'info');
    }
  }

  // ── Registra CNJ para deduplicação ──
  if (fonteId === 'impacta' && d.cnjs) {
    d.cnjs.forEach(function(c) {
      if (typeof EMAIL !== 'undefined') EMAIL.cnjs_impacta[c] = true;
    });
  }

  // ── Cria prazo automaticamente ──
  if (d.prazo && typeof criarPrazoInterno === 'function') {
    criarPrazoInterno(d);
  }

  // ── Cria tarefa ──
  if (typeof EMAIL !== 'undefined' && EMAIL.cfg && EMAIL.cfg.autoTarefa && typeof criarTarefaInterno === 'function') {
    criarTarefaInterno(d);
  }

  if (typeof eKPI === 'function') eKPI();
}

function detectArea(mov) {
  var m = (mov || '').toUpperCase();
  if (m.indexOf('TRABALH') >= 0 || m.indexOf('TRT') >= 0 || m.indexOf('JCJ') >= 0) return 'Trabalhista';
  if (m.indexOf('PENAL') >= 0 || m.indexOf('CRIMIN') >= 0) return 'Penal';
  if (m.indexOf('FAM') >= 0 || m.indexOf('DIV') >= 0 || m.indexOf('ALIMEN') >= 0) return 'Família';
  if (m.indexOf('TRIBUT') >= 0 || m.indexOf('FISCAL') >= 0 || m.indexOf('EXECUÇ') >= 0) return 'Tributário';
  if (m.indexOf('EMPRESA') >= 0 || m.indexOf('FALÊNC') >= 0) return 'Empresarial';
  return 'Cível';
}

// ══════════════════════════════════════════════════════
// FIX 4: PROCESSAR TUDO com auto-cadastro real
// ══════════════════════════════════════════════════════
function fixProcessarTudo() {
  window.processarEmails = function() {
    if (typeof EMAIL === 'undefined' || !EMAIL.ok || !EMAIL.token) {
      if (typeof toast === 'function') toast('Conecte o Gmail primeiro', 'orange');
      return;
    }
    var msgs = EMAIL._gmailMsgs;
    if (!msgs || !msgs.length) {
      if (typeof toast === 'function') toast('Clique em ↻ para carregar a caixa de entrada primeiro', 'blue');
      return;
    }
    log('Processando ' + msgs.length + ' e-mails em lote...', 'teal');
    var done = 0;
    var total = msgs.length;

    msgs.forEach(function(m, i) {
      setTimeout(function() {
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
          headers: { 'Authorization': 'Bearer ' + EMAIL.token }
        })
        .then(function(r) { return r.json(); })
        .then(function(msg) {
          var body = '';
          function xb(p) {
            if (!p) return;
            if (p.mimeType === 'text/plain' && p.body && p.body.data) {
              try { var t = atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')); if(t.length>body.length) body=t; } catch(e){}
            }
            if (!body && p.mimeType === 'text/html' && p.body && p.body.data) {
              try { body = atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); } catch(e){}
            }
            if (p.parts) p.parts.forEach(xb);
          }
          xb(msg.payload || {});
          if (!body) body = msg.snippet || '';
          autoCadastrar(body, { subject: m.subject || '', from: m.from || '' });
          log('✓ ' + (m.subject || 'email').substring(0, 45), 'ok');
          done++;
          if (done >= total) {
            if (typeof eKPI === 'function') eKPI();
            if (typeof toast === 'function') toast('✅ ' + done + ' e-mails processados!', 'green');
          }
        })
        .catch(function(e) { done++; log('Erro: ' + e.message, 'warn'); });
      }, i * 600);
    });
  };
}

// ══════════════════════════════════════════════════════
// FIX 5: PARSE EMAIL manual também aciona auto-cadastro
// ══════════════════════════════════════════════════════
function fixParseEmail() {
  // Guarda o original
  if (typeof window.parseEmail === 'function') {
    window.parseEmailOriginal = window.parseEmail;
  }

  window.parseEmail = function() {
    // Chama original
    if (typeof window.parseEmailOriginal === 'function') {
      window.parseEmailOriginal();
    }
    // Auto-cadastro com o texto colado
    setTimeout(function() {
      var corpo = document.getElementById('emailBody') ? document.getElementById('emailBody').value : '';
      var rem = document.getElementById('emailRem') ? document.getElementById('emailRem').value : 'impacta';
      if (corpo && corpo.trim().length > 10) {
        autoCadastrar(corpo, {
          subject: '',
          from: rem === 'jusbrasil' ? 'jusbrasil.com.br' : 'impacta.adv.br'
        });
      }
    }, 500);
  };
}

// ══════════════════════════════════════════════════════
// FIX 6: BUSCA DE PROCESSOS melhorada
// ══════════════════════════════════════════════════════
function fixBuscaProcessos() {
  var searchEl = document.getElementById('searchProc');
  if (!searchEl) return;

  // Remove listener antigo e adiciona novo com debounce
  var debTimer;
  searchEl.oninput = null;
  searchEl.addEventListener('input', function() {
    clearTimeout(debTimer);
    debTimer = setTimeout(function() {
      var q = searchEl.value.toLowerCase().trim();
      if (typeof filtrarProcessos === 'function') {
        filtrarProcessos();
        return;
      }
      // Fallback manual
      var src = (typeof XLS2_DATA !== 'undefined' && XLS2_DATA.length) ? XLS2_DATA
              : (typeof XLS !== 'undefined' ? XLS.map(function(r){return [r.ficha,r.acao,r.processo,r.vara,'',r.parte1,r.ex_adverso,r.parte1,'AUTOR',r.ex_adverso];}) : []);
      if (!q) {
        if (typeof S !== 'undefined') S.procFiltrados = src.slice();
      } else {
        if (typeof S !== 'undefined') S.procFiltrados = src.filter(function(r){
          return r.some(function(cell){ return cell && cell.toString().toLowerCase().indexOf(q) >= 0; });
        });
      }
      if (typeof S !== 'undefined') S.procPag = 0;
      if (typeof renderProcTable === 'function') renderProcTable();
    }, 300);
  });
}

// ══════════════════════════════════════════════════════
// FIX 7: IA — parseEmailIA usa Claude API
// ══════════════════════════════════════════════════════
function fixIAIntegracao() {
  window.parseEmailIA = function() {
    var corpo = document.getElementById('emailBody') ? document.getElementById('emailBody').value.trim() : '';
    if (!corpo) {
      if (typeof toast === 'function') toast('Cole o conteúdo do e-mail primeiro', 'orange');
      return;
    }
    if (typeof eLog === 'function') eLog('🤖 IA analisando...', 'teal');

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: 'Analise este e-mail de publicação judicial brasileiro e extraia APENAS um JSON com: cnj (número CNJ), cliente (nome do cliente/autor), adverso (parte contrária), movimentacao, prazo (dd/mm/aaaa), vara, tribunal, tipo_acao, dias_prazo (número inteiro).\n\nE-mail:\n' + corpo.substring(0, 3000) + '\n\nResponda SOMENTE com JSON válido, sem texto adicional.'
        }]
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var text = (data.content && data.content[0] && data.content[0].text) || '{}';
      var clean = text.replace(/```json|```/g, '').trim();
      var parsed;
      try { parsed = JSON.parse(clean); } catch(e) { parsed = null; }

      if (parsed) {
        // Preenche campos do formulário com dados da IA
        var bod = document.getElementById('emailBody');
        if (bod && !bod.value) bod.value = corpo;

        // Mostra resultado
        var card = document.getElementById('parserCard');
        var campos = document.getElementById('parserCampos');
        var src = document.getElementById('parserSrc');
        if (src) src.textContent = '🤖 Claude IA';
        if (campos) {
          var rows = Object.entries(parsed).filter(function(kv){ return kv[1]; });
          campos.innerHTML = rows.map(function(kv) {
            var icons = {cnj:'⚖️',cliente:'👤',adverso:'⚔️',movimentacao:'📋',prazo:'⏳',vara:'🏛️',tribunal:'⚖️',tipo_acao:'📄',dias_prazo:'📅'};
            return '<div style="display:flex;gap:11px;padding:8px 0;border-bottom:1px solid var(--border)">'
              + '<div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;width:140px;flex-shrink:0;padding-top:2px">' + (icons[kv[0]]||'•') + ' ' + kv[0] + '</div>'
              + '<div style="font-size:13px;color:var(--teal);font-weight:500">' + kv[1] + '</div></div>';
          }).join('');
        }
        if (card) card.style.display = 'block';

        // Registra extração
        EMAIL._extracao = {
          cnjs: parsed.cnj ? [parsed.cnj] : [],
          partes: (parsed.cliente || '') + (parsed.adverso ? ' x ' + parsed.adverso : ''),
          mov: parsed.movimentacao || '',
          prazo: parsed.prazo || '',
          vara: parsed.vara || '',
          fonte: 'impacta',
          raw: corpo
        };

        if (typeof eLog === 'function') eLog('✅ IA extraiu dados com sucesso', 'ok');
        if (typeof toast === 'function') toast('🤖 IA analisou o e-mail com sucesso!', 'teal');

        // Auto-cadastro com dados da IA
        if (parsed.cliente) {
          autoCadastrar(corpo, { subject: parsed.cliente, from: 'impacta.adv.br' });
        }
      } else {
        if (typeof eLog === 'function') eLog('⚠️ IA não retornou JSON válido', 'warn');
        // Fallback para parser manual
        if (typeof parseEmailOriginal === 'function') parseEmailOriginal();
        else if (typeof parseEmail === 'function') parseEmail();
      }
    })
    .catch(function(e) {
      if (typeof eLog === 'function') eLog('Erro IA: ' + e.message, 'err');
      // Fallback
      if (typeof parseEmailOriginal === 'function') parseEmailOriginal();
      else if (typeof parseEmail === 'function') parseEmail();
    });
  };
}

// ══════════════════════════════════════════════════════
// FIX 8: PRAZOS — renderização e cálculo corretos
// ══════════════════════════════════════════════════════
function fixPrazosRender() {
  window.calcDiasSafe = function(prazoStr) {
    if (!prazoStr) return '?';
    var p = prazoStr.split('/');
    if (p.length !== 3) return '?';
    try {
      var d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
      var diff = Math.ceil((d - new Date()) / 86400000);
      return diff >= 0 ? diff : 0;
    } catch(e) { return '?'; }
  };

  // Substitui calcDias se existir
  if (typeof calcDias !== 'undefined') {
    window.calcDias = window.calcDiasSafe;
  }
}

// ══════════════════════════════════════════════════════
// FIX 9: AUTO-SYNC periódico ao conectar Gmail
// ══════════════════════════════════════════════════════
function fixAutoSync() {
  var _origAtivar = window.ativarGmailUI;
  window.ativarGmailUI = function() {
    if (_origAtivar) _origAtivar();
    if (typeof EMAIL === 'undefined') return;
    if (EMAIL._syncTimer) clearInterval(EMAIL._syncTimer);
    var min = (EMAIL.cfg && EMAIL.cfg.intervalo) || 15;
    EMAIL._syncTimer = setInterval(function() {
      if (EMAIL.ok && EMAIL.token && typeof carregarInbox === 'function') {
        log('Auto-sync (' + min + 'min)...', 'teal');
        carregarInbox();
      }
    }, min * 60 * 1000);
    log('Auto-sync ativo a cada ' + min + ' minuto(s)', 'ok');
  };

  // Se já estava conectado quando o script carregou
  setTimeout(function() {
    if (typeof EMAIL !== 'undefined' && EMAIL.ok && EMAIL.token && typeof ativarGmailUI === 'function') {
      ativarGmailUI();
    }
  }, 1500);
}

// ══════════════════════════════════════════════════════
// FIX 10: CLIENTES — sincroniza nomes com processos XLS
// ══════════════════════════════════════════════════════
function sincronizarClientesXLS() {
  if (typeof XLS === 'undefined' || !XLS.length || typeof S === 'undefined') return;
  var adicionados = 0;
  var nomesExistentes = S.clientes.map(function(c){ return c.nome.toUpperCase().replace(/\s+/g,' '); });

  XLS.forEach(function(r) {
    var nome = (r.parte1 || '').trim();
    if (!nome || nome.length < 4) return;
    if (/^\d/.test(nome)) return;
    var palavrasIgnorar = ['DOCUMENTOS','JUSTIÇA','FEDERAL','ESTADO','MUNICÍPIO','MINISTÉRIO','BANCO'];
    if (palavrasIgnorar.some(function(p){ return nome.toUpperCase().indexOf(p) >= 0; })) return;

    var normNome = nome.toUpperCase().replace(/\s+/g,' ');
    if (nomesExistentes.indexOf(normNome) >= 0) return;

    var ac = (r.acao || '').toUpperCase();
    var area = ac.indexOf('TRABALH') >= 0 ? 'Trabalhista'
      : ac.indexOf('PENAL') >= 0 ? 'Penal'
      : ac.indexOf('FAM') >= 0 || ac.indexOf('DIV') >= 0 ? 'Família'
      : ac.indexOf('TRIBUT') >= 0 ? 'Tributário' : 'Cível';

    S.clientes.push({
      id: S.nextCid++, nome: nome, cpfcnpj: '', email: '', tel: '',
      area: area, tipo: 'PF', status: 'ativo', resp: 1,
      exadverso: r.ex_adverso || '', endereco: r.vara || '',
      obs: 'Importado do XLS. Ficha: ' + (r.ficha || 'N/A')
    });
    nomesExistentes.push(normNome);
    adicionados++;
  });

  if (adicionados > 0) {
    S.cFiltrados = [].concat(S.clientes);
    if (typeof renderKPIClientes === 'function') renderKPIClientes();
    log(adicionados + ' clientes sincronizados do XLS', 'ok');
    if (typeof toast === 'function') toast('✅ ' + adicionados + ' clientes sincronizados com processos!', 'teal');
  }
  return adicionados;
}

// Expõe a função globalmente
window.sincronizarClientesXLS = sincronizarClientesXLS;

// Adiciona botão "Sincronizar com XLS" na página de clientes
setTimeout(function() {
  var topbarActions = document.querySelector('#pg-clientes .topbar-actions');
  if (topbarActions && !document.getElementById('btnSyncXLS')) {
    var btn = document.createElement('button');
    btn.id = 'btnSyncXLS';
    btn.className = 'btn btn-teal';
    btn.innerHTML = '🔄 Sincronizar Processos';
    btn.onclick = function() {
      var n = sincronizarClientesXLS();
      if (n === 0) toast('Todos os clientes já estão sincronizados', 'blue');
    };
    topbarActions.insertBefore(btn, topbarActions.firstChild);
  }
}, 1000);


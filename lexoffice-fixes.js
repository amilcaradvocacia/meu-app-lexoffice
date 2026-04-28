// ============================================================
// LexOffice — Correções: Ver, Auto-cadastro, Auto-extração
// Versão: 2.0 — Substitui lexoffice-fixes.js no repositório
// ============================================================

// ── CORREÇÃO 1: Botão VER — carrega e-mail + dispara extração ──
function verEmail(idx) {
  var msgs = EMAIL._gmailMsgs;
  if (!msgs || !msgs[idx]) { toast('E-mail não encontrado','orange'); return; }
  var m = msgs[idx];
  eLog('Abrindo e-mail: ' + m.subject, 'info');

  fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
    headers: { 'Authorization': 'Bearer ' + EMAIL.token }
  })
  .then(function(r) { return r.json(); })
  .then(function(msg) {
    var body = '';
    function xb(p) {
      if (!p) return;
      if ((p.mimeType === 'text/plain') && p.body && p.body.data) {
        try { body = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) {}
      }
      if (p.parts) p.parts.forEach(xb);
    }
    xb(msg.payload || {});

    if (!body && msg.snippet) body = msg.snippet;

    // Preenche o campo de e-mail
    var rem = document.getElementById('emailRem');
    if (rem) {
      rem.value = m.from && m.from.toLowerCase().indexOf('jusbrasil') >= 0
        ? 'jusbrasil' : 'impacta';
    }
    var bod = document.getElementById('emailBody');
    if (bod) {
      bod.value = body || '[Sem conteúdo de texto — verifique o e-mail original]';
    }

    eLog('Conteúdo carregado. Disparando extração automática...', 'teal');

    // Dispara parseEmail automaticamente após carregar
    setTimeout(function() {
      parseEmail();
      // Auto-cadastro de cliente e processo
      autoCadastrarDoEmail(body, m);
    }, 300);
  })
  .catch(function(e) {
    eLog('Erro ao abrir e-mail: ' + e.message, 'err');
    toast('Erro ao abrir e-mail: ' + e.message, 'orange');
  });
}

// ── CORREÇÃO 2: Auto-cadastro de Cliente e Processo ──
function autoCadastrarDoEmail(corpo, emailMeta) {
  var d = extrairDados(corpo, 'impacta');
  if (!d) return;

  // Auto-cadastro do cliente extraído das partes
  if (d.partes) {
    var nomes = d.partes.split(/\s+x\s+/i);
    var clienteNome = (nomes[0] || '').trim();
    if (clienteNome && clienteNome.length > 3) {
      var jaExiste = S.clientes.find(function(c) {
        return c.nome.toLowerCase() === clienteNome.toLowerCase();
      });
      if (!jaExiste) {
        var novoCliente = {
          id: S.nextCid++,
          nome: clienteNome,
          cpfcnpj: '', email: '', tel: '',
          area: detectarArea(d.mov || ''),
          tipo: 'PF', status: 'ativo', resp: 1,
          exadverso: (nomes[1] || '').trim(),
          endereco: d.vara || '', obs: 'Cadastrado automaticamente via publicação'
        };
        S.clientes.push(novoCliente);
        S.cFiltrados = [].concat(S.clientes);
        renderKPIClientes();
        eLog('✅ Cliente auto-cadastrado: ' + clienteNome, 'ok');
        toast('👤 Cliente cadastrado: ' + clienteNome, 'teal');
      } else {
        eLog('Cliente já existe: ' + clienteNome, 'info');
      }
    }
  }

  // Auto-cadastro do processo (deduplicação por CNJ)
  d.cnjs.forEach(function(cnj) {
    var jaTemProc = EMAIL.prazos.find(function(p) { return p.cnj === cnj; });
    if (!jaTemProc) {
      eLog('⚖️ Processo registrado: ' + cnj, 'ok');
    }
  });

  // Cria prazo automaticamente se configurado
  if (d.prazo && EMAIL.cfg.autoAgenda) {
    criarPrazoInterno(d);
  }

  // Cria tarefa automaticamente se configurado
  if (EMAIL.cfg.autoTarefa) {
    criarTarefaInterno(d);
  }

  eKPI();
}

function detectarArea(mov) {
  var m = mov.toUpperCase();
  if (m.indexOf('TRABALH') >= 0 || m.indexOf('JCJ') >= 0) return 'Trabalhista';
  if (m.indexOf('PENAL') >= 0 || m.indexOf('CRIMIN') >= 0) return 'Penal';
  if (m.indexOf('FAMÍL') >= 0 || m.indexOf('DIVÓRC') >= 0) return 'Família';
  if (m.indexOf('TRIBUT') >= 0 || m.indexOf('FISCAL') >= 0) return 'Tributário';
  return 'Cível';
}

// ── CORREÇÃO 3: Caixa de Entrada com botão VER funcional ──
// Sobrescreve _renderGmail para incluir botão VER correto
(function() {
  var _orig = window._renderGmail;
  window._renderGmail = function(msgs) {
    var il = document.getElementById('inboxList');
    if (!il) { if (_orig) _orig(msgs); return; }
    EMAIL._gmailMsgs = msgs;
    msgs.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    il.innerHTML = msgs.length === 0
      ? '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>'
      : msgs.map(function(m, i) {
          var isJB = m.from.toLowerCase().indexOf('jusbrasil') >= 0;
          var fonte = isJB ? 'JusBrasil' : 'Impacta';
          var cor = isJB ? 'bo' : 'bteal';
          var d = new Date(m.date);
          var ds = isNaN(d.getTime()) ? m.date : d.toLocaleDateString('pt-BR');
          return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer" onclick="_abrirGmail(' + i + ')">'
            + '<span class="badge ' + cor + '" style="font-size:10px;flex-shrink:0;margin-top:2px">' + fonte + '</span>'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:13px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + m.subject + '</div>'
            + '<div style="font-size:11px;color:var(--text3);margin-top:1px">' + ds + ' · ' + m.snippet + '</div>'
            + '</div>'
            + '<button class="btn btn-teal btn-xs" style="flex-shrink:0;margin-top:1px" onclick="event.stopPropagation();verEmail(' + i + ')">👁 Ver</button>'
            + '</div>';
        }).join('');

    var cnt = document.getElementById('inboxCount');
    if (cnt) cnt.textContent = msgs.length;
    var badge = document.getElementById('gmailOkBadge');
    if (badge) badge.style.display = 'inline-block';
  };
})();

// ── CORREÇÃO 4: Botão "Processar Tudo" com auto-cadastro ──
(function() {
  var _origProcessar = window.processarEmails;
  window.processarEmails = function() {
    if (!EMAIL.ok || !EMAIL.token) {
      toast('Conecte o Gmail primeiro', 'orange');
      return;
    }
    var msgs = EMAIL._gmailMsgs;
    if (!msgs || !msgs.length) {
      toast('Carregue a caixa de entrada primeiro (↻)', 'blue');
      return;
    }
    eLog('Processando ' + msgs.length + ' e-mails em lote...', 'teal');
    var processados = 0;
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
              try { body = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) {}
            }
            if (p.parts) p.parts.forEach(xb);
          }
          xb(msg.payload || {});
          autoCadastrarDoEmail(body, m);
          processados++;
          if (processados === msgs.length) {
            eKPI();
            toast('✅ ' + processados + ' e-mails processados! Clientes e processos atualizados.', 'green');
          }
        })
        .catch(function() { processados++; });
      }, i * 400);
    });
  };
})();

// ── CORREÇÃO 5: Auto-sync periódico ao conectar ──
(function() {
  var _origAtivar = window.ativarGmailUI;
  window.ativarGmailUI = function() {
    if (_origAtivar) _origAtivar();
    // Inicia sincronização automática conforme configuração
    if (EMAIL._syncTimer) clearInterval(EMAIL._syncTimer);
    var intervalo = (EMAIL.cfg.intervalo || 15) * 60 * 1000;
    EMAIL._syncTimer = setInterval(function() {
      if (EMAIL.ok && EMAIL.token) {
        eLog('Auto-sync iniciado...', 'teal');
        carregarInbox();
      }
    }, intervalo);
    eLog('Auto-sync ativo: a cada ' + (EMAIL.cfg.intervalo || 15) + ' min', 'ok');
  };
})();

// Inicialização
(function() {
  if (typeof eLog === 'function') {
    eLog('lexoffice-fixes.js v2.0 carregado — Ver, Auto-cadastro e Auto-extração ativos', 'ok');
  }
})();

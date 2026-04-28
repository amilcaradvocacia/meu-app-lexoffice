// ============================================================
// LexOffice — Correções v3.0
// Fixes: Ver, Auto-cadastro Cliente/Processo, Auto-extração
// ============================================================

// ── UTILIDADE: extrair nome do cliente do e-mail/assunto ──
function extrairNomeCliente(corpo, assunto, partes) {
  // 1. Tenta via "Partes: NOME x ADVERSO"
  if (partes) {
    var px = partes.split(/\s+[xX×]\s+/);
    if (px[0] && px[0].trim().length > 3) return px[0].trim();
  }

  // 2. Tenta via assunto: "Publicações Iprazos – NOME – ESTADO"
  if (assunto) {
    var am = assunto.match(/[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ\s]+?)\s*[–\-]\s*[A-Z]/);
    if (am && am[1] && am[1].trim().length > 3) return am[1].trim();
    // "NOME SOBRENOME FILHO" no assunto
    var am2 = assunto.match(/(?:IPRAZOS|PUBLICA[ÇC][OÕ]ES)[^A-Z]*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-Z\s]+?)(?:\s*[–\-]|$)/i);
    if (am2 && am2[1] && am2[1].trim().length > 3) return am2[1].trim();
  }

  // 3. Tenta via corpo: "Cliente: NOME" ou "Interessado: NOME"
  if (corpo) {
    var cm = corpo.match(/(?:[Cc]liente|[Ii]nteressado|[Aa]dvogado do autor|[Pp]arte):\s*([^\n\r,]+)/);
    if (cm && cm[1] && cm[1].trim().length > 3) return cm[1].trim();
  }

  return null;
}

// ── UTILIDADE: buscar cliente no XLS pelo nome do processo ──
function buscarClienteNoXLS(cnj) {
  if (!cnj || !XLS || !XLS.length) return null;
  // Tenta pelo número do processo
  var proc = XLS.find(function(r) {
    return r.processo && (r.processo.replace(/[^0-9]/g,'').indexOf(cnj.replace(/[^0-9]/g,'').substring(0,10)) >= 0);
  });
  if (proc && proc.parte1) return proc.parte1;
  return null;
}

// ── CORREÇÃO 1: Auto-cadastro robusto ──
function autoCadastrarDoEmail(corpo, emailMeta) {
  var d = extrairDados(corpo || '', emailMeta && emailMeta.from && emailMeta.from.indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta');
  if (!d) return;

  var assunto = emailMeta ? (emailMeta.subject || '') : '';

  // Tenta encontrar o nome do cliente
  var clienteNome = extrairNomeCliente(corpo, assunto, d.partes);

  // Fallback: busca pelo CNJ no XLS
  if (!clienteNome && d.cnjs.length) {
    clienteNome = buscarClienteNoXLS(d.cnjs[0]);
  }

  // Auto-cadastro do cliente
  if (clienteNome && clienteNome.length > 3) {
    var normalizado = clienteNome.trim().toUpperCase();
    var jaExiste = S.clientes.find(function(c) {
      return c.nome.toUpperCase() === normalizado || c.nome.toUpperCase().indexOf(normalizado.substring(0, 10)) >= 0;
    });

    if (!jaExiste) {
      // Tenta achar o adverso
      var adverso = '';
      if (d.partes) {
        var px = d.partes.split(/\s+[xX×]\s+/);
        adverso = (px[1] || '').trim();
      }
      // Busca adverso no XLS pelo CNJ
      if (!adverso && d.cnjs.length) {
        var xr = XLS.find(function(r) {
          return r.processo && r.processo.replace(/[^0-9]/g,'').indexOf(d.cnjs[0].replace(/[^0-9]/g,'').substring(0,10)) >= 0;
        });
        if (xr) adverso = xr.ex_adverso || '';
      }

      var novoCliente = {
        id: S.nextCid++,
        nome: clienteNome.trim(),
        cpfcnpj: '', email: '', tel: '',
        area: detectarAreaMov(d.mov || ''),
        tipo: 'PF', status: 'ativo', resp: 1,
        exadverso: adverso,
        endereco: d.vara || '',
        obs: 'Auto-cadastrado via publicação. CNJ: ' + (d.cnjs[0] || 'N/A')
      };
      S.clientes.push(novoCliente);
      S.cFiltrados = [].concat(S.clientes);
      renderKPIClientes();
      eLog('✅ Cliente auto-cadastrado: ' + clienteNome.trim(), 'ok');
      toast('👤 Novo cliente: ' + clienteNome.trim(), 'teal');
    } else {
      eLog('Cliente já cadastrado: ' + jaExiste.nome, 'info');
    }
  } else {
    eLog('⚠️ Nome do cliente não detectado no e-mail', 'warn');
  }

  // Registra CNJs da Impacta para deduplicação
  if (!d.fonte || d.fonte === 'impacta') {
    d.cnjs.forEach(function(c) { EMAIL.cnjs_impacta[c] = true; });
  }

  // Cria prazo automaticamente
  if (d.prazo) {
    criarPrazoInterno(d);
  }

  // Cria tarefa automaticamente
  if (EMAIL.cfg.autoTarefa) {
    criarTarefaInterno(d);
  }

  EMAIL.stats.procs += d.cnjs.length;
  eKPI();
}

function detectarAreaMov(mov) {
  var m = (mov || '').toUpperCase();
  if (m.indexOf('TRABALH') >= 0 || m.indexOf('JCJ') >= 0 || m.indexOf('TRT') >= 0) return 'Trabalhista';
  if (m.indexOf('PENAL') >= 0 || m.indexOf('CRIMIN') >= 0) return 'Penal';
  if (m.indexOf('FAM') >= 0 || m.indexOf('DIV') >= 0) return 'Família';
  if (m.indexOf('TRIBUT') >= 0 || m.indexOf('FISCAL') >= 0) return 'Tributário';
  return 'Cível';
}

// ── CORREÇÃO 2: Botão VER funcional ──
window.verEmail = function(idx) {
  var msgs = EMAIL._gmailMsgs;
  if (!msgs || !msgs[idx]) { toast('E-mail não encontrado', 'orange'); return; }
  var m = msgs[idx];
  eLog('Abrindo: ' + m.subject, 'info');

  fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
    headers: { 'Authorization': 'Bearer ' + EMAIL.token }
  })
  .then(function(r) {
    if (r.status === 401) {
      EMAIL.ok = false; EMAIL.token = null;
      DB.save('lex_gmail_auth', null);
      toast('Token expirado — reconecte o Gmail', 'orange');
      return null;
    }
    return r.json();
  })
  .then(function(msg) {
    if (!msg) return;
    var body = '';
    function xb(p) {
      if (!p) return;
      if (p.mimeType === 'text/plain' && p.body && p.body.data) {
        try { body = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) {}
      }
      // Fallback: HTML para texto
      if (!body && p.mimeType === 'text/html' && p.body && p.body.data) {
        try {
          var html = atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } catch(e) {}
      }
      if (p.parts) p.parts.forEach(xb);
    }
    xb(msg.payload || {});

    if (!body) body = msg.snippet || '';

    // Detecta remetente
    var hdrs = {};
    ((msg.payload && msg.payload.headers) || []).forEach(function(h) { hdrs[h.name] = h.value; });
    var from = hdrs['From'] || m.from || '';

    // Preenche formulário
    var rem = document.getElementById('emailRem');
    if (rem) rem.value = from.toLowerCase().indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta';

    var bod = document.getElementById('emailBody');
    if (bod) bod.value = body;

    eLog('E-mail carregado (' + body.length + ' chars). Extraindo...', 'teal');

    // Dispara extração e auto-cadastro
    setTimeout(function() {
      parseEmail();
      autoCadastrarDoEmail(body, { subject: m.subject, from: from });
    }, 200);
  })
  .catch(function(e) {
    eLog('Erro ao abrir e-mail: ' + e.message, 'err');
    toast('Erro: ' + e.message, 'orange');
  });
};

// ── CORREÇÃO 3: _renderGmail com botão VER ──
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
    var fonte = isJB ? 'JusBrasil' : 'Impacta';
    var cor = isJB ? 'bo' : 'bteal';
    var d = new Date(m.date);
    var ds = isNaN(d.getTime()) ? m.date : d.toLocaleDateString('pt-BR');
    var snip = (m.snippet || '').substring(0, 90);
    return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border)">'
      + '<span class="badge ' + cor + '" style="font-size:10px;flex-shrink:0;margin-top:2px">' + fonte + '</span>'
      + '<div style="flex:1;min-width:0;cursor:pointer" onclick="window._abrirGmail(' + i + ')">'
      + '<div style="font-size:12.5px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (m.subject || '') + '</div>'
      + '<div style="font-size:10.5px;color:var(--text3);margin-top:2px">' + ds + ' — ' + snip + '</div>'
      + '</div>'
      + '<button class="btn btn-teal btn-xs" style="flex-shrink:0" onclick="window.verEmail(' + i + ')">👁 Ver</button>'
      + '</div>';
  }).join('');

  var cnt = document.getElementById('inboxCount');
  if (cnt) cnt.textContent = msgs.length;
  var badge = document.getElementById('gmailOkBadge');
  if (badge) badge.style.display = 'inline-block';
};

// ── CORREÇÃO 4: Processar Tudo com auto-cadastro ──
window.processarEmails = function() {
  if (!EMAIL.ok || !EMAIL.token) {
    toast('Conecte o Gmail primeiro', 'orange'); return;
  }
  var msgs = EMAIL._gmailMsgs;
  if (!msgs || !msgs.length) {
    toast('Carregue a caixa de entrada (↻) primeiro', 'blue'); return;
  }
  eLog('Processando ' + msgs.length + ' e-mails em lote...', 'teal');
  var done = 0;

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
        if (!body) body = msg.snippet || '';
        autoCadastrarDoEmail(body, { subject: m.subject, from: m.from });
        eLog('Processado: ' + m.subject.substring(0, 50), 'ok');
        done++;
        if (done === msgs.length) {
          eKPI();
          toast('✅ ' + done + ' e-mails processados! Clientes e prazos atualizados.', 'green');
        }
      })
      .catch(function() { done++; });
    }, i * 500);
  });
};

// ── CORREÇÃO 5: parseEmail com auto-cadastro ao colar manualmente ──
(function() {
  var _origParse = window.parseEmail;
  window.parseEmail = function() {
    if (_origParse) _origParse();
    // Após parseEmail nativo, tenta auto-cadastro com o texto colado
    setTimeout(function() {
      var corpo = (document.getElementById('emailBody') || {value: ''}).value;
      var rem = (document.getElementById('emailRem') || {value: 'impacta'}).value;
      if (corpo && corpo.length > 10) {
        var from = rem === 'jusbrasil'
          ? 'publicacoes-diarios@jusbrasil.com.br'
          : 'publicacoes@impacta.adv.br';
        autoCadastrarDoEmail(corpo, { subject: '', from: from });
      }
    }, 400);
  };
})();

// ── CORREÇÃO 6: Auto-sync ao conectar ──
(function() {
  var _origAtiv = window.ativarGmailUI;
  window.ativarGmailUI = function() {
    if (_origAtiv) _origAtiv();
    if (EMAIL._syncTimer) clearInterval(EMAIL._syncTimer);
    var min = EMAIL.cfg.intervalo || 15;
    EMAIL._syncTimer = setInterval(function() {
      if (EMAIL.ok && EMAIL.token) {
        eLog('Auto-sync (' + min + 'min)...', 'teal');
        carregarInbox();
      }
    }, min * 60 * 1000);
    eLog('Auto-sync ativo: a cada ' + min + ' minuto(s)', 'ok');
  };
})();

// Log de inicialização
setTimeout(function() {
  if (typeof eLog === 'function') eLog('✅ lexoffice-fixes v3.0 — Ver + Auto-cadastro + Auto-sync ativos', 'ok');
}, 600);

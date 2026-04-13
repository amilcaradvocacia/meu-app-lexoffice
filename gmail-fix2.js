/**
 * LexOffice 5.0 — Módulo Publicações Inteligente v2
 * - Lê anexos .doc da Impacta via Gmail API
 * - Parseia corpo do JusBrasil
 * - Extrai Autor/Réu → cadastra como cliente automaticamente
 * - Resume com IA (Claude) e sugere defesa/recurso
 * - Prazo automático de 5 dias úteis
 * - Atualiza base de processos
 */

// INICIALIZAÇÃO IMEDIATA — antes de qualquer coisa
window.EMAIL = window.EMAIL || {};
window.EMAIL.cfg = window.EMAIL.cfg || {};
window.EMAIL.cfg.clientId = window.EMAIL.cfg.clientId || '245855517843-4fstpfsna79doa6krmvg3hu5p3o7jtdm.apps.googleusercontent.com';
window.EMAIL.cfg.intervalo = window.EMAIL.cfg.intervalo || 15;
window.EMAIL.cfg.autoTarefa = window.EMAIL.cfg.autoTarefa !== false;
window.EMAIL.cfg.autoAgenda = window.EMAIL.cfg.autoAgenda !== false;
window.EMAIL.stats = window.EMAIL.stats || { total: 0, procs: 0, prazos: 0, dups: 0 };
window.EMAIL.prazos = window.EMAIL.prazos || [];
window.EMAIL.cnjs_impacta = window.EMAIL.cnjs_impacta || {};
window.EMAIL.log_entries = window.EMAIL.log_entries || [];
window.EMAIL.ok = window.EMAIL.ok || false;
window.EMAIL.token = window.EMAIL.token || null;
window.EMAIL._inbox = window.EMAIL._inbox || [];
window.EMAIL._extracao = window.EMAIL._extracao || null;
window._publicacoesProcessadas = window._publicacoesProcessadas || {};

(function () {
  'use strict';

  var CLIENT_ID = window.EMAIL.cfg.clientId;
  var SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

  // ── Conectar Gmail ──────────────────────────────────────────
  function conectar() {
    var clientId = window.EMAIL.cfg.clientId || CLIENT_ID;
    var t = 0;
    function try_() {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        try {
          google.accounts.oauth2.initTokenClient({
            client_id: clientId, scope: SCOPE, callback: onToken
          }).requestAccessToken({ prompt: 'consent' });
        } catch (e) { alert('Erro OAuth: ' + e.message); }
      } else if (++t < 20) { setTimeout(try_, 500); }
      else { alert('Biblioteca Google não carregou. Recarregue a página.'); }
    }
    try_();
  }

  function onToken(resp) {
    if (resp.error) { alert('Erro Gmail: ' + resp.error); return; }
    var token = resp.access_token;
    var exp = Date.now() + (resp.expires_in || 3600) * 1000;
    window.EMAIL.token = token;
    window.EMAIL.ok = true;
    try { localStorage.setItem('lex_gmail_token', token); } catch (e) {}
    try { localStorage.setItem('lex_gmail_token_exp', String(exp)); } catch (e) {}
    atualizarBotao(true);
    eLog('✅ Gmail autorizado', 'ok');
    if (typeof toast === 'function') toast('✅ Gmail conectado! Buscando publicações...', 'green');
    buscarPublicacoes(token);
    setInterval(function () { if (Date.now() < exp) buscarPublicacoes(token); }, (window.EMAIL.cfg.intervalo || 15) * 60000);
  }

  // ── Buscar e-mails ──────────────────────────────────────────
  function buscarPublicacoes(token) {
    var inbox = document.getElementById('inboxList');
    if (inbox) inbox.innerHTML = '<div style="text-align:center;padding:14px;color:var(--teal);font-size:13px">⏳ Buscando publicações...</div>';
    eLog('📥 Buscando publicações...', 'teal');
    var q = 'from:publicacoes@impacta.adv.br OR from:publicacoes-diarios@jusbrasil.com.br';
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent(q) + '&maxResults=25', {
      headers: { Authorization: 'Bearer ' + token }
    })
    .then(function (r) { return r.status === 401 ? null : r.json(); })
    .then(function (d) {
      if (!d || !d.messages || !d.messages.length) {
        if (inbox) inbox.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
        eLog('📭 Nenhum e-mail', 'info'); return;
      }
      eLog('📨 ' + d.messages.length + ' e-mail(s)', 'ok');
      carregarEmails(token, d.messages.slice(0, 20));
    })
    .catch(function (e) { eLog('❌ ' + e.message, 'err'); });
  }

  function carregarEmails(token, msgs) {
    var res = new Array(msgs.length), done = 0;
    msgs.forEach(function (m, i) {
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
        headers: { Authorization: 'Bearer ' + token }
      })
      .then(function (r) { return r.json(); })
      .then(function (msg) {
        var hdrs = {};
        ((msg.payload && msg.payload.headers) || []).forEach(function (h) { hdrs[h.name] = h.value; });
        var fonte = (hdrs['From'] || '').toLowerCase().indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta';
        res[i] = {
          id: m.id, assunto: hdrs['Subject'] || '', de: hdrs['From'] || '',
          data: hdrs['Date'] || '', fonte: fonte,
          corpo: extrairTexto(msg.payload),
          anexos: extrairAnexosInfo(msg)
        };
        if (++done === msgs.length) processarTodos(res.filter(Boolean), token);
      })
      .catch(function () { if (++done === msgs.length) processarTodos(res.filter(Boolean), token); });
    });
  }

  function extrairTexto(payload) {
    var t = '';
    function p(n) {
      if (!n) return;
      if ((n.mimeType === 'text/plain' || n.mimeType === 'text/html') && n.body && n.body.data) {
        try { t += atob(n.body.data.replace(/-/g, '+').replace(/_/g, '/')) + '\n'; } catch (e) {}
      }
      if (n.parts) n.parts.forEach(p);
    }
    p(payload || {}); return t.trim();
  }

  function extrairAnexosInfo(msg) {
    var anexos = [];
    function p(part) {
      if (!part) return;
      var nome = part.filename || '';
      if (!nome && part.headers) part.headers.forEach(function (h) {
        if (h.name === 'Content-Disposition') { var m = h.value.match(/filename[*]?="?([^";]+)"?/i); if (m) nome = m[1]; }
      });
      if (nome && (nome.match(/\.doc[x]?$/i)) && part.body && part.body.attachmentId) {
        anexos.push({ nome: nome, attachmentId: part.body.attachmentId, msgId: msg.id });
      }
      if (part.parts) part.parts.forEach(p);
    }
    p(msg.payload || {}); return anexos;
  }

  // ── Processar todos os e-mails ──────────────────────────────
  function processarTodos(emails, token) {
    window._emailsCarregados = emails;
    renderInbox(emails);
    emails.forEach(function (email) {
      if (window._publicacoesProcessadas[email.id]) return;
      if (email.fonte === 'impacta') {
        if (email.anexos && email.anexos.length > 0) {
          email.anexos.forEach(function (anx) {
            baixarAnexo(token, email.id, anx.attachmentId, function (html) {
              var pub = parseImpacta(html);
              if (pub) { pub.fonte = 'impacta'; pub.dataEmail = email.data; processarPub(pub); }
            });
          });
        } else {
          var pub = parseImpacta(email.corpo);
          if (pub) { pub.fonte = 'impacta'; processarPub(pub); }
        }
      } else {
        var pub = parseJusbrasil(email.corpo, email.assunto);
        if (pub) {
          if (window.EMAIL.cnjs_impacta[pub.cnj]) {
            window.EMAIL.stats.dups++;
            eLog('🔁 Dup JusBrasil: ' + pub.cnj, 'warn');
          } else {
            pub.fonte = 'jusbrasil'; processarPub(pub);
          }
        }
      }
      window._publicacoesProcessadas[email.id] = true;
      window.EMAIL.stats.total++;
    });
    eKPI();
  }

  function baixarAnexo(token, msgId, attachmentId, cb) {
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msgId + '/attachments/' + attachmentId, {
      headers: { Authorization: 'Bearer ' + token }
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.data) { try { cb(atob(d.data.replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) {} }
    })
    .catch(function (e) { eLog('❌ Anexo: ' + e.message, 'err'); });
  }

  // ── Parser Impacta ──────────────────────────────────────────
  function parseImpacta(conteudo) {
    // Remover HTML se necessário
    var texto = conteudo;
    if (conteudo.indexOf('<') >= 0) {
      try {
        var d = new DOMParser().parseFromString(conteudo, 'text/html');
        texto = d.body ? (d.body.innerText || d.body.textContent) : conteudo;
      } catch (e) {}
    }

    var pub = { autor: '', reu: '', cnj: '', processo: '', vara: '', comarca: '', publicacao: '', advogado: '', tipo_acao: '', prazo_dias: 5 };
    var linhas = texto.split(/[\n\r]/).map(function (l) { return l.trim(); }).filter(Boolean);

    for (var i = 0; i < linhas.length; i++) {
      var l = linhas[i], nx = linhas[i + 1] || '';
      if (l === 'Processo:') { pub.processo = nx; i++; }
      else if (l === 'Diário:') { pub.vara = nx; i++; }
      else if (l === 'Detalhamento:') { pub.comarca = nx.split(/[\/|]/)[0].trim(); i++; }
      else if (l === 'Publicação:') {
        pub.publicacao = linhas.slice(i + 1).join(' ');
        break;
      }
    }

    // CNJ
    var cnj = (pub.processo + ' ' + pub.publicacao).match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    if (cnj) pub.cnj = cnj[1];
    else if (pub.processo) pub.cnj = formatCNJ(pub.processo.replace(/\D/g, ''));

    // Partes e advogado do texto da publicação
    if (pub.publicacao) Object.assign(pub, extrairPartes(pub.publicacao));

    return (pub.cnj || pub.processo) ? pub : null;
  }

  // ── Parser JusBrasil ────────────────────────────────────────
  function parseJusbrasil(corpo, assunto) {
    var pub = { autor: '', reu: '', cnj: '', processo: '', vara: 'STJ/STF', publicacao: '', advogado: '', tipo_acao: '', prazo_dias: 5 };

    var cnj = (assunto + ' ' + corpo).match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    if (cnj) pub.cnj = cnj[1];

    var partes = extrairPartes(corpo);
    Object.assign(pub, partes);
    pub.publicacao = corpo.replace(/<[^>]+>/g, '').substring(0, 2000);

    // Tipo de ação do assunto JusBrasil
    var tipos = ['AGRAVO EM RECURSO ESPECIAL', 'AGRAVO DE INSTRUMENTO', 'RECURSO ESPECIAL', 'APELAÇÃO', 'EMBARGOS', 'EXECUÇÃO'];
    for (var j = 0; j < tipos.length; j++) {
      if ((assunto + corpo).toUpperCase().indexOf(tipos[j]) >= 0) { pub.tipo_acao = tipos[j]; break; }
    }

    return (pub.cnj || pub.processo) ? pub : null;
  }

  // ── Extrair partes (Autor/Réu) ──────────────────────────────
  function extrairPartes(texto) {
    var r = { autor: '', reu: '', advogado: '', tipo_acao: '' };
    var padroes = [
      [/Embargante\(?s?\)?\s*[-:]\s*([^;]+?)(?:;|Embargado|Relator)/i, /Embargado\(?[aAs]?\)?\s*[-:]\s*([^;]+?)(?:;|Relator|Assunto)/i],
      [/Agravante\s*[-:]\s*([^;:\n]+?)(?:\s*;|\s*ADVOGADO|\s*AGRAVADO)/i, /Agravado\s*[-:]\s*([^;:\n]+?)(?:\s*;|\s*ADVOGADO|\s*PR0)/i],
      [/Apelante\s*[-:]\s*([^;]+?)(?:;|Apelado)/i, /Apelado\s*[-:]\s*([^;]+?)(?:;|Relator)/i],
      [/Requerente\s*[-:]\s*([^;]+?)(?:;|Requerido)/i, /Requerido\s*[-:]\s*([^;]+?)(?:;|Relator)/i],
      [/\bAutor\s*[-:]\s*([^;]+?)(?:;|Réu|RÉU)/i, /\bRéu\s*[-:]\s*([^;]+?)(?:;|Relator)/i],
      [/Exequente\s*[-:]\s*([^;]+?)(?:;|Executado)/i, /Executado\s*[-:]\s*([^;]+?)(?:;|Relator)/i],
    ];
    for (var i = 0; i < padroes.length; i++) {
      var ma = texto.match(padroes[i][0]), mr = texto.match(padroes[i][1]);
      if (ma && !r.autor) r.autor = limpaNome(ma[1]);
      if (mr && !r.reu) r.reu = limpaNome(mr[1]);
      if (r.autor && r.reu) break;
    }
    var adv = texto.match(/Adv\s*[-:]\s*([^\.]+)\./i) || texto.match(/ADVOGADO\s*[-:]\s*([^\n;,]+)/i);
    if (adv) r.advogado = limpaNome(adv[1]);
    var tipos = ['Embargos de Declaração', 'Agravo de Instrumento', 'Apelação', 'Execução Fiscal', 'Recurso Especial', 'Habeas Corpus'];
    for (var j = 0; j < tipos.length; j++) {
      if (texto.toLowerCase().indexOf(tipos[j].toLowerCase()) >= 0) { r.tipo_acao = tipos[j]; break; }
    }
    return r;
  }

  function limpaNome(s) { return (s || '').replace(/\s+/g, ' ').trim().substring(0, 80); }
  function formatCNJ(d) { return d.length >= 20 ? d.substr(0,7)+'-'+d.substr(7,2)+'.'+d.substr(9,4)+'.'+d.substr(13,1)+'.'+d.substr(14,2)+'.'+d.substr(16,4) : d; }

  // ── Processar publicação individual ─────────────────────────
  function processarPub(pub) {
    eLog('📋 ' + (pub.cnj || pub.processo) + ' | Autor: ' + (pub.autor || '?') + ' | Réu: ' + (pub.reu || '?'), 'ok');

    // Cadastrar cliente
    var cliente = cadastrarCliente(pub);

    // Atualizar processo
    if (pub.cnj) {
      var key = 'lex_proc_' + pub.cnj;
      var ex = (typeof DB !== 'undefined' && DB.load(key)) || {};
      var proc = Object.assign({}, ex, {
        ficha: pub.cnj, acao: pub.tipo_acao || ex.acao || '',
        vara: pub.vara || ex.vara || '', comarca: pub.comarca || ex.comarca || '',
        parte1: (cliente && cliente.nome) || pub.autor || ex.parte1 || '',
        polo: (cliente && cliente.nome && pub.reu === cliente.nome) ? 'RÉU' : 'AUTOR',
        exadv: pub.reu || ex.exadv || '', status: 'ativo',
        updated: new Date().toLocaleDateString('pt-BR'),
        ultima_pub: (pub.publicacao || '').substring(0, 300)
      });
      if (typeof DB !== 'undefined') DB.save(key, proc);
      if (pub.fonte === 'impacta') window.EMAIL.cnjs_impacta[pub.cnj] = true;
      eLog('⚖️ Processo atualizado: ' + pub.cnj, 'ok');
    }

    // Prazo 5 dias úteis
    var prazoData = prazo5dias();
    window.EMAIL.prazos.push({
      id: Date.now() + Math.random(),
      cnj: pub.cnj || pub.processo || '?',
      mov: pub.tipo_acao || 'Publicação processual',
      prazo: prazoData, dias: 5,
      fonte: pub.fonte === 'impacta' ? '📡 Impacta' : '📰 JusBrasil',
      status: 'pendente'
    });
    if (typeof renderPrazosAuto === 'function') renderPrazosAuto();
    eLog('⏳ Prazo 5 dias: ' + prazoData, 'ok');

    window.EMAIL.stats.procs++;
    window.EMAIL.stats.prazos++;

    // Resumo IA
    if (pub.publicacao && pub.publicacao.length > 80) resumoIA(pub, cliente);
  }

  // ── Cadastrar cliente automaticamente ───────────────────────
  function cadastrarCliente(pub) {
    if (!window.S || !window.S.clientes) return null;

    // Determinar quem é nosso cliente
    var nomeCliente = '';
    var polo = 'AUTOR';

    if (pub.advogado && pub.advogado.toUpperCase().indexOf('AMILCAR') >= 0) {
      // Advogado do autor → autor é nosso cliente
      nomeCliente = pub.autor || '';
      polo = 'AUTOR';
    } else if (pub.reu && pub.autor) {
      nomeCliente = pub.autor; polo = 'AUTOR';
    }

    if (!nomeCliente || nomeCliente.length < 3) return null;

    // Verificar se já existe
    var nome10 = nomeCliente.toUpperCase().substring(0, 10);
    var ex = window.S.clientes.find(function (c) {
      return c.nome.toUpperCase().indexOf(nome10) >= 0 || nomeCliente.toUpperCase().indexOf(c.nome.toUpperCase().substring(0, 10)) >= 0;
    });
    if (ex) { eLog('👤 Cliente já existe: ' + ex.nome, 'ok'); return ex; }

    // Criar novo
    var novo = {
      id: window.S.nextCid++, nome: nomeCliente,
      cpfcnpj: '', email: '', tel: '',
      area: detectarArea(pub.tipo_acao + ' ' + pub.publicacao),
      tipo: 'PF', status: 'ativo', resp: 1,
      exadverso: polo === 'AUTOR' ? pub.reu : pub.autor,
      endereco: '',
      obs: 'Cadastrado via publicação ' + pub.fonte + ' — ' + new Date().toLocaleDateString('pt-BR')
    };
    window.S.clientes.push(novo);
    if (typeof renderKPIClientes === 'function') renderKPIClientes();
    if (typeof toast === 'function') toast('👤 Novo cliente: ' + nomeCliente, 'gold');
    eLog('✅ Cliente cadastrado: ' + nomeCliente, 'ok');
    return novo;
  }

  function detectarArea(txt) {
    var t = (txt || '').toUpperCase();
    if (t.indexOf('TRABALH') >= 0 || t.indexOf('TRT') >= 0) return 'Trabalhista';
    if (t.indexOf('PENAL') >= 0 || t.indexOf('CRIMINAL') >= 0) return 'Penal';
    if (t.indexOf('FISCAL') >= 0 || t.indexOf('TRIBUTÁR') >= 0) return 'Tributário';
    if (t.indexOf('FAMÍLIA') >= 0 || t.indexOf('DIVÓRC') >= 0) return 'Família';
    return 'Cível';
  }

  function prazo5dias() {
    var d = new Date(), util = 0;
    while (util < 5) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) util++; }
    return d.toLocaleDateString('pt-BR');
  }

  // ── Resumo com IA (Claude) ───────────────────────────────────
  function resumoIA(pub, cliente) {
    var polo = (cliente && pub.reu && pub.reu === cliente.nome) ? 'RÉU' : 'AUTOR';
    var prompt = 'Você é advogado especialista. Analise esta publicação judicial:\n\n'
      + 'PROCESSO: ' + (pub.cnj || pub.processo) + '\n'
      + 'TIPO: ' + (pub.tipo_acao || 'não identificado') + '\n'
      + 'NOSSO CLIENTE: ' + (cliente ? cliente.nome : pub.autor) + ' (POLO ' + polo + ')\n'
      + 'PARTE ADVERSA: ' + (polo === 'AUTOR' ? pub.reu : pub.autor) + '\n\n'
      + 'PUBLICAÇÃO:\n' + pub.publicacao.substring(0, 2500) + '\n\n'
      + 'Responda em português com:\n'
      + '1. RESUMO (2-3 linhas): o que aconteceu\n'
      + '2. IMPACTO: consequência para nosso cliente\n'
      + '3. AÇÃO URGENTE (5 dias úteis): o que fazer\n'
      + '4. PEÇA SUGERIDA: tipo de peça a redigir (se aplicável)';

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var txt = (d.content && d.content[0] && d.content[0].text) || '';
      if (!txt) return;
      var key = 'lex_resumo_' + (pub.cnj || pub.processo);
      if (typeof DB !== 'undefined') DB.save(key, { resumo: txt, data: new Date().toLocaleDateString('pt-BR') });
      eLog('🤖 Resumo IA: ' + (pub.cnj || pub.processo), 'teal');
      if (typeof toast === 'function') toast('🤖 IA analisou: ' + (pub.tipo_acao || pub.cnj || ''), 'blue');
    })
    .catch(function () { eLog('⚠️ IA indisponível (configure API key Claude)', 'warn'); });
  }

  // ── Render inbox ─────────────────────────────────────────────
  function renderInbox(emails) {
    var c = document.getElementById('inboxList'); if (!c) return;
    var badge = document.getElementById('gmailOkBadge');
    if (badge) badge.style.display = 'inline-block';
    c.innerHTML = emails.map(function (m, i) {
      var isJB = m.fonte === 'jusbrasil', cor = isJB ? 'bo' : 'bteal', label = isJB ? 'JusBrasil' : 'Impacta';
      var d = new Date(m.data), ds = isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
      var temAnexo = m.anexos && m.anexos.length > 0;
      var trecho = (m.corpo || '').replace(/<[^>]+>/g, '').substring(0, 100).replace(/\n/g, ' ');
      return '<div style="padding:10px 13px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);margin-bottom:6px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span class="badge ' + cor + '" style="font-size:10px">' + label + '</span>'
        + (temAnexo ? '<span title="Tem anexo .doc" style="font-size:10px">📎</span>' : '')
        + '<span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + m.assunto + '</span>'
        + '<span style="font-size:11px;color:var(--text3)">' + ds + '</span>'
        + '<button class="btn btn-ai btn-xs" onclick="verPublicacao(' + i + ')">👁 Ver</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text2)">' + trecho + '</div>'
        + '</div>';
    }).join('');
  }

  // ── Ver publicação ───────────────────────────────────────────
  window.verPublicacao = function (i) {
    var email = (window._emailsCarregados || [])[i]; if (!email) return;
    var pub = email.fonte === 'jusbrasil' ? parseJusbrasil(email.corpo, email.assunto) : parseImpacta(email.corpo);
    if (!pub) { if (typeof toast === 'function') toast('Não foi possível extrair dados', 'orange'); return; }
    window.EMAIL._extracao = pub;
    var campos = document.getElementById('parserCampos'), card = document.getElementById('parserCard');
    if (campos && card) {
      card.style.display = card.style.visibility = 'visible'; card.style.opacity = '1';
      var rows = [
        pub.cnj ? { l: 'CNJ', v: pub.cnj, c: 'var(--teal)' } : null,
        pub.autor ? { l: 'Autor', v: pub.autor, c: 'var(--green)' } : null,
        pub.reu ? { l: 'Réu', v: pub.reu, c: 'var(--red)' } : null,
        pub.tipo_acao ? { l: 'Tipo de Ação', v: pub.tipo_acao, c: 'var(--gold)' } : null,
        pub.vara ? { l: 'Vara/Diário', v: pub.vara } : null,
        pub.advogado ? { l: 'Advogado', v: pub.advogado, c: 'var(--purple)' } : null,
        { l: 'Prazo (5 dias úteis)', v: prazo5dias(), c: 'var(--orange)' },
      ].filter(Boolean);
      campos.innerHTML = rows.map(function (r) {
        return '<div style="display:flex;gap:11px;padding:8px 0;border-bottom:1px solid var(--border)">'
          + '<div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;width:140px;flex-shrink:0;padding-top:2px">' + r.l + '</div>'
          + '<div style="font-size:13px;color:' + (r.c || 'var(--text)') + ';font-weight:500">' + r.v + '</div></div>';
      }).join('');
      // Carregar resumo IA salvo
      if (pub.cnj) {
        var rs = typeof DB !== 'undefined' ? DB.load('lex_resumo_' + pub.cnj) : null;
        if (rs) { var el = document.getElementById('aiDocResp'); if (el) el.textContent = rs.resumo; }
      }
      setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    }
  };

  // ── Processar Tudo (botão) ───────────────────────────────────
  window.processarEmails = function () {
    var token = window.EMAIL && window.EMAIL.token;
    if (!token) { if (typeof toast === 'function') toast('⚠️ Conecte o Gmail primeiro', 'orange'); return; }
    eLog('▶️ Processamento manual...', 'teal');
    buscarPublicacoes(token);
  };

  // ── UI ───────────────────────────────────────────────────────
  function atualizarBotao(on) {
    var btn = document.getElementById('btnGmail'); if (!btn) return;
    if (on) { btn.textContent = '✅ Gmail Conectado'; btn.style.background = 'rgba(62,207,207,.18)'; btn.style.color = 'var(--teal)'; btn.style.border = '1px solid rgba(62,207,207,.4)'; }
  }

  // ── Inicializar ──────────────────────────────────────────────
  function inicializar() {
    window.conectarGmail = conectar;
    window.iniciarOAuth = conectar;
    var btn = document.getElementById('btnGmail'); if (btn) btn.onclick = conectar;
    try {
      var t = localStorage.getItem('lex_gmail_token');
      var exp = parseInt(localStorage.getItem('lex_gmail_token_exp') || '0');
      if (t && exp > Date.now()) {
        window.EMAIL.token = t; window.EMAIL.ok = true;
        atualizarBotao(true);
        eLog('🔄 Token restaurado — buscando publicações...', 'ok');
        buscarPublicacoes(t);
        setInterval(function () { if (Date.now() < exp) buscarPublicacoes(t); }, (window.EMAIL.cfg.intervalo || 15) * 60000);
      }
    } catch (e) {}
    console.log('[LexOffice Publicações v2] ✅ Pronto.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(inicializar, 700); });
  } else { setTimeout(inicializar, 700); }

})();

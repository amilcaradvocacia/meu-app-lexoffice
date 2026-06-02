/**
 * LexOffice 5.0 — Gmail Auto-Monitor
 * Substitui o módulo EMAIL do index.html
 * Usa Google Identity Services (GIS) — funciona em GitHub Pages
 *
 * COMO USAR:
 * 1. Adicione no <head> do index.html:
 *    <script src="https://accounts.google.com/gsi/client" async defer></script>
 *
 * 2. No Google Cloud Console:
 *    - Tipo de app: "Aplicativo da Web"
 *    - Origens autorizadas: https://amilcaradvocacia.github.io
 *    - URIs de redirecionamento: https://amilcaradvocacia.github.io/meu-app-lexoffice/
 *
 * 3. Adicione este script no final do <body>, APÓS o script principal:
 *    <script src="gmail-module.js"></script>
 */

(function () {
  'use strict';

  // ─── Configuração ───────────────────────────────────────────
  var SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar',
  ].join(' ');
  var INTERVAL_KEY = 'lex_gmail_interval';
  var TOKEN_KEY = 'lex_gmail_token';
  var TOKEN_EXP_KEY = 'lex_gmail_token_exp';

  var GM = {
    tokenClient: null,
    token: null,
    tokenExp: null,
    timer: null,
    running: false,
    processados: {},   // id → true (evita reprocessar)
  };

  // ─── Inicialização ──────────────────────────────────────────
  function init() {
    // Recuperar token salvo
    var savedToken = DB.load(TOKEN_KEY);
    var savedExp   = DB.load(TOKEN_EXP_KEY);
    if (savedToken && savedExp && Date.now() < savedExp) {
      GM.token    = savedToken;
      GM.tokenExp = savedExp;
      EMAIL.token = savedToken;
      try { localStorage.setItem('lex_gmail_auth', savedToken); } catch(e) {}
      localStorage.setItem('lex_gmail_auth', savedToken);
      localStorage.setItem('lex_token_exp', String(savedExp));
      EMAIL.ok    = true;
      ativarGmailUI();
      iniciarMonitor();
      eLog('🔄 Token Gmail restaurado — monitor ativo', 'ok');
    }

    // Substituir função do botão Conectar Gmail
    window.conectarGmail = function () {
      var clientId = EMAIL.cfg.clientId;
      if (!clientId || clientId.length < 10) {
        toast('⚠️ Configure o Client ID primeiro em ⚙️ Configurar', 'orange');
        openModal('mEmailConfig');
        return;
      }

      if (typeof google === 'undefined' || !google.accounts) {
        toast('⚠️ Biblioteca Google não carregou. Verifique sua conexão.', 'red');
        return;
      }

      GM.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: onTokenReceived,
      });

      GM.tokenClient.requestAccessToken({ prompt: 'consent' });
    };

    // Substituir iniciarOAuth também
    window.iniciarOAuth = window.conectarGmail;
  }

  // ─── Callback do token ──────────────────────────────────────
  function onTokenReceived(resp) {
    if (resp.error) {
      toast('❌ Erro ao autorizar Gmail: ' + resp.error, 'red');
      eLog('Erro OAuth: ' + resp.error, 'err');
      return;
    }

    var token = resp.access_token;
    var exp   = Date.now() + (resp.expires_in || 3600) * 1000;

    GM.token    = token;
    GM.tokenExp = exp;
    EMAIL.token = token;
    EMAIL.ok    = true;

    DB.save(TOKEN_KEY, token);
    DB.save(TOKEN_EXP_KEY, exp);
    // Compatibilidade com gestao.js e core.js
    try { localStorage.setItem('lex_gmail_auth', token); } catch(e) {}
    try { localStorage.setItem('lex_token_exp', String(exp)); } catch(e) {}
    // Sincroniza com chaves usadas pelo import-v3
    localStorage.setItem('lex_gmail_auth', token);
    localStorage.setItem('lex_token_exp', String(exp));

    ativarGmailUI();
    toast('✅ Gmail conectado! Monitor iniciado.', 'green');
    eLog('✅ Gmail autorizado com sucesso', 'ok');

    // Processar imediatamente + iniciar timer
    processarGmail();
    iniciarMonitor();
  }

  // ─── Monitor automático ─────────────────────────────────────
  function iniciarMonitor() {
    pararMonitor();
    var intervalo = (EMAIL.cfg.intervalo || 15) * 60 * 1000;
    GM.timer = setInterval(function () {
      if (GM.token && Date.now() < GM.tokenExp) {
        eLog('⏰ Verificação automática...', 'teal');
        processarGmail();
      } else {
        eLog('⚠️ Token expirado — reconecte o Gmail', 'warn');
        pararMonitor();
        EMAIL.ok = false;
        atualizarBotaoGmail(false);
      }
    }, intervalo);

    GM.running = true;
    eLog('⏱️ Monitor Gmail ativo — verificando a cada ' + (EMAIL.cfg.intervalo || 15) + ' min', 'ok');
    atualizarBotaoGmail(true);
  }

  function pararMonitor() {
    if (GM.timer) { clearInterval(GM.timer); GM.timer = null; }
    GM.running = false;
  }

  // ─── Leitura e processamento dos e-mails ────────────────────
  function processarGmail() {
    if (!GM.token) return;

    var query = 'from:publicacoes@impacta.adv.br OR from:publicacoes-diarios@jusbrasil.com.br is:unread';

    eLog('📥 Buscando e-mails de publicação...', 'teal');

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q='
      + encodeURIComponent(query) + '&maxResults=20', {
      headers: { Authorization: 'Bearer ' + GM.token }
    })
    .then(function (r) {
      if (r.status === 401) { tokenExpirado(); return null; }
      return r.json();
    })
    .then(function (data) {
      if (!data) return;
      if (!data.messages || !data.messages.length) {
        eLog('📭 Nenhum e-mail novo de publicação', 'info');
        atualizarInboxUI([]);
        return;
      }
      eLog('📨 ' + data.messages.length + ' e-mail(s) encontrado(s)', 'ok');
      buscarCorpos(data.messages);
    })
    .catch(function (e) {
      eLog('❌ Erro ao buscar e-mails: ' + e.message, 'err');
    });
  }

  function buscarCorpos(mensagens) {
    var resultados = [];
    var concluidos = 0;

    mensagens.forEach(function (m, idx) {
      // Pular já processados
      if (GM.processados[m.id]) {
        concluidos++;
        if (concluidos === mensagens.length) finalizarProcessamento(resultados);
        return;
      }

      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
        headers: { Authorization: 'Bearer ' + GM.token }
      })
      .then(function (r) { return r.json(); })
      .then(function (msg) {
        var corpo = extrairCorpo(msg);
        var hdrs  = {};
        ((msg.payload && msg.payload.headers) || []).forEach(function (h) { hdrs[h.name] = h.value; });

        resultados[idx] = {
          id:      m.id,
          assunto: hdrs['Subject'] || '(sem assunto)',
          de:      hdrs['From']    || '',
          data:    hdrs['Date']    || '',
          corpo:   corpo,
          fonte:   (hdrs['From'] || '').toLowerCase().indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta',
        };

        concluidos++;
        if (concluidos === mensagens.length) finalizarProcessamento(resultados.filter(Boolean));
      })
      .catch(function () {
        concluidos++;
        if (concluidos === mensagens.length) finalizarProcessamento(resultados.filter(Boolean));
      });
    });
  }

  function extrairCorpo(msg) {
    var texto = '';
    function percorrer(part) {
      if (!part) return;
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        try {
          texto += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')) + '\n';
        } catch (e) {}
      }
      if (part.parts) part.parts.forEach(percorrer);
    }
    percorrer(msg.payload || {});
    return texto.trim();
  }

  function finalizarProcessamento(emails) {
    if (!emails.length) return;

    var novos = 0, prazos = 0, dups = 0;

    emails.forEach(function (email) {
      if (!email.corpo) return;

      var d = extrairDados(email.corpo, email.fonte);

      // Deduplicação
      if (isDup(d, email.fonte)) {
        dups++;
        eLog('🔁 Dup ignorada: ' + (d.cnjs[0] || email.assunto), 'warn');
        GM.processados[email.id] = true;
        return;
      }

      if (email.fonte === 'impacta') {
        d.cnjs.forEach(function (c) { EMAIL.cnjs_impacta[c] = true; });
      }

      // Criar prazo automaticamente
      if (d.prazo) {
        criarPrazoInterno(d);
        prazos++;
      }

      // Criar tarefa automaticamente
      if (EMAIL.cfg.autoTarefa) {
        criarTarefaInterno(d);
      }

      // Criar evento no Calendar
      if (EMAIL.cfg.autoAgenda && (d.prazo || d.aud_data)) {
        criarEvento(d);
      }

      GM.processados[email.id] = true;
      EMAIL.stats.total++;
      EMAIL.stats.procs += d.cnjs.length;
      novos++;

      eLog('✅ ' + email.assunto.substring(0, 60) + ' | CNJ: ' + (d.cnjs[0] || '?') + ' | Prazo: ' + (d.prazo || 'n/d'), 'ok');
    });

    EMAIL.stats.dups  += dups;
    EMAIL.stats.prazos += prazos;
    eKPI();
    atualizarInboxUI(emails);

    if (novos > 0) {
      toast('✅ ' + novos + ' publicação(ões) processada(s)! ' + prazos + ' prazo(s) criado(s).', 'teal');
      // Notificação do navegador
      if (EMAIL.cfg.notif && Notification.permission === 'granted') {
        new Notification('LexOffice — Novas Publicações', {
          body: novos + ' publicação(ões) processada(s). ' + prazos + ' prazo(s) criado(s).',
          icon: 'https://amilcaradvocacia.github.io/meu-app-lexoffice/favicon.ico',
        });
      }
    } else {
      eLog('ℹ️ Nenhum e-mail novo para processar', 'info');
    }
  }

  // ─── Atualizar UI da caixa de entrada ───────────────────────
  function atualizarInboxUI(emails) {
    var container = document.getElementById('inboxList');
    if (!container) return;

    if (!emails.length) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação nova.</div>';
      return;
    }

    container.innerHTML = emails.map(function (m, i) {
      var isJB  = m.fonte === 'jusbrasil';
      var cor   = isJB ? 'bo' : 'bteal';
      var label = isJB ? 'JusBrasil' : 'Impacta';
      var d     = new Date(m.data);
      var ds    = isNaN(d.getTime()) ? m.data : d.toLocaleDateString('pt-BR');
      var trecho = m.corpo ? m.corpo.substring(0, 120).replace(/\n/g, ' ') : '';

      return '<div class="ditem" style="cursor:pointer;flex-direction:column;align-items:flex-start;gap:4px;margin-bottom:6px">'
        + '<div style="display:flex;align-items:center;gap:8px;width:100%">'
        + '<span class="badge ' + cor + '" style="font-size:10px;flex-shrink:0">' + label + '</span>'
        + '<span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + m.assunto + '</span>'
        + '<span style="font-size:11px;color:var(--text3);flex-shrink:0">' + ds + '</span>'
        + '<button class="btn btn-ai btn-xs" style="flex-shrink:0" onclick="processarEmailManual(' + i + ')">⚡ Ver</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text2);padding-left:4px">' + trecho + '</div>'
        + '</div>';
    }).join('');

    // Guardar referência para processamento manual
    window._gmailEmailsCarregados = emails;
  }

  // ─── Processar e-mail individual manualmente ────────────────
  window.processarEmailManual = function (idx) {
    var emails = window._gmailEmailsCarregados || [];
    var email  = emails[idx];
    if (!email) return;

    // Preencher o campo de texto e mostrar resultado
    var bodyEl = document.getElementById('emailBody');
    var remEl  = document.getElementById('emailRem');
    if (bodyEl) bodyEl.value = email.corpo;
    if (remEl)  remEl.value  = email.fonte === 'jusbrasil' ? 'jusbrasil' : 'impacta';

    // Extrair e mostrar
    var d = extrairDados(email.corpo, email.fonte);
    EMAIL._extracao = d;
    mostrarParser(d, email.fonte);
    toast('📋 E-mail carregado — revise e clique em Aplicar', 'blue');
  };

  // ─── Botão "Processar Tudo" ──────────────────────────────────
  window.processarEmails = function () {
    if (!GM.token || Date.now() >= GM.tokenExp) {
      toast('⚠️ Conecte o Gmail primeiro', 'orange');
      return;
    }
    eLog('▶️ Processamento manual iniciado...', 'teal');
    processarGmail();
  };

  // ─── Helpers de UI ──────────────────────────────────────────
  function atualizarBotaoGmail(conectado) {
    var btn = document.getElementById('btnGmail');
    if (!btn) return;
    if (conectado) {
      btn.textContent = '✅ Gmail Conectado';
      btn.style.background = 'rgba(62,207,207,.18)';
      btn.style.color      = 'var(--teal)';
      btn.style.border     = '1px solid rgba(62,207,207,.4)';
    } else {
      btn.textContent = '🔗 Conectar Gmail';
      btn.style.background = '';
      btn.style.color      = '';
      btn.style.border     = '';
    }
  }

  function tokenExpirado() {
    eLog('⚠️ Token expirado — clique em Conectar Gmail', 'warn');
    toast('⚠️ Sessão Gmail expirada. Clique em Conectar Gmail.', 'orange');
    EMAIL.ok    = false;
    EMAIL.token = '';
    GM.token    = null;
    DB.save(TOKEN_KEY, null);
    pararMonitor();
    atualizarBotaoGmail(false);
  }

  // ─── Solicitar permissão de notificações ────────────────────
  function pedirPermissaoNotificacao() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') eLog('🔔 Notificações ativadas', 'ok');
      });
    }
  }

  // ─── Inicializar quando DOM estiver pronto ──────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () { init(); pedirPermissaoNotificacao(); }, 300);
    });
  } else {
    setTimeout(function () { init(); pedirPermissaoNotificacao(); }, 300);
  }

  console.log('[LexOffice Gmail] ✅ Módulo carregado.');

})();

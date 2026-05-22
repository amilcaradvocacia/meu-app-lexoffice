/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║     LexOfficeAT — Gmail Auto-Import v1.0                        ║
 * ║  Gmail → Parser → LexDB → Google Drive (pastas automáticas)    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * INSTALAÇÃO: adicione após lexofficeat-sync.js no index.html:
 * <script src="lexofficeat-gmail-import.js"></script>
 *
 * FUNCIONALIDADES:
 * 1. Lê automaticamente todos os e-mails Impacta + Jusbrasil do Gmail
 * 2. Processa com os parsers do LexSync
 * 3. Cria/atualiza processos no LexDB
 * 4. Cria pasta no Google Drive para cada processo novo
 * 5. Salva o e-mail original na pasta 04 — Decisões e Intimações
 * 6. Cria prazo no Google Calendar automaticamente
 * 7. Monitor automático a cada 15 min (configurável)
 * 8. Marca e-mails como lidos após processar
 */

(function () {
  'use strict';

  // ============================================================
  // ⚙️  CONFIGURAÇÃO
  // ============================================================
  var CFG = {
    REMETENTES: [
      'publicacoes@impacta.adv.br',
      'publicacoes-diarios@jusbrasil.com.br',
      'noreply@jusbrasil.com.br',
      'diarios@jusbrasil.com.br',
    ],
    MAX_EMAILS:      50,   // e-mails por ciclo
    INTERVALO_MIN:   15,   // minutos entre ciclos
    MARCAR_LIDO:     true, // marca como lido após processar
    CRIAR_DRIVE:     true, // cria pasta no Drive
    CRIAR_CALENDAR:  true, // cria prazo no Calendar
    CRIAR_TAREFA:    true, // cria tarefa interna
    BUSCAR_LIDOS:    false,// também busca e-mails já lidos
  };

  // IDs das pastas do Drive (sincronizado com lexofficeat-improvements.js)
  var DRIVE_IDS = {
    clientes:   function() { return localStorage.getItem('lex_drive_clientes_id') || '1xoBLeDu6LKNHHJO-q2pNU0WwxdrLJsnt'; },
    modelo:     function() { return localStorage.getItem('lex_drive_modelo_id')   || '17YYTUryi5GoeIWbk__0VvLUkpIb1cDa7'; },
    subpastas: ['01 — Contratos e Procurações','02 — Petições e Peças','03 — Documentos do Cliente','04 — Decisões e Intimações','05 — Correspondências'],
  };

  // Estado do módulo
  var STATE = {
    timer:       null,
    rodando:     false,
    processados: {},   // id_email → true (evita reprocessar)
    ciclos:      0,
    ultima_sync: null,
    stats: { emails: 0, novos: 0, atualizados: 0, prazos: 0, pastas: 0, erros: 0 },
  };

  // ============================================================
  // 🔑  TOKEN GMAIL
  // ============================================================
  function getToken() {
    // Tenta pegar do módulo EMAIL existente
    if (typeof EMAIL !== 'undefined' && EMAIL.token) return EMAIL.token;
    // Fallback para localStorage
    var t = localStorage.getItem('lex_gmail_token');
    var e = parseInt(localStorage.getItem('lex_gmail_token_exp') || '0');
    if (t && Date.now() < e) return t;
    return null;
  }

  function gmailFetch(path, opts) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Sem token Gmail'));
    var headers = Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {});
    return fetch('https://gmail.googleapis.com/gmail/v1' + path, Object.assign({}, opts || {}, { headers: headers }))
      .then(function(r) {
        if (r.status === 401) throw new Error('TOKEN_EXPIRADO');
        return r.json();
      });
  }

  function driveFetch(method, path, body) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Sem token Gmail — conecte primeiro'));
    return fetch('https://www.googleapis.com' + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function(r) {
      if (r.status === 401) return Promise.reject(new Error('TOKEN_EXPIRADO'));
      if (r.status === 403) return Promise.reject(new Error('SEM_PERMISSAO_DRIVE'));
      return r.json();
    });
  }

  function calendarFetch(method, path, body) {
    var token = getToken();
    if (!token) return Promise.reject(new Error('Sem token'));
    return fetch('https://www.googleapis.com/calendar/v3' + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function(r) { return r.json(); });
  }

  // ============================================================
  // 📥  BUSCA E-MAILS DO GMAIL
  // ============================================================
  function buscarEmailsGmail() {
    var query = CFG.REMETENTES.map(function(r) { return 'from:' + r; }).join(' OR ');
    if (!CFG.BUSCAR_LIDOS) query += ' is:unread';

    _log('📥 Buscando e-mails: ' + query);

    return gmailFetch('/users/me/messages?q=' + encodeURIComponent(query) + '&maxResults=' + CFG.MAX_EMAILS)
      .then(function(data) {
        if (!data.messages || !data.messages.length) {
          _log('📭 Nenhum e-mail novo encontrado');
          return [];
        }
        _log('📨 ' + data.messages.length + ' e-mail(s) encontrado(s)');
        return data.messages;
      });
  }

  // Busca corpo completo de um e-mail
  function buscarCorpoEmail(msgId) {
    return gmailFetch('/users/me/messages/' + msgId + '?format=full')
      .then(function(msg) {
        var corpo = '';
        var hdrs  = {};

        // Extrai headers
        ((msg.payload && msg.payload.headers) || []).forEach(function(h) {
          hdrs[h.name.toLowerCase()] = h.value;
        });

        // Extrai corpo texto recursivamente
        function percorrer(part) {
          if (!part) return;
          if (part.mimeType === 'text/plain' && part.body && part.body.data) {
            try { corpo += atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/')) + '\n'; } catch(e) {}
          }
          if (part.parts) part.parts.forEach(percorrer);
        }
        percorrer(msg.payload || {});

        var from = hdrs['from'] || '';
        var fonte = from.toLowerCase().indexOf('jusbrasil') >= 0 ? 'jusbrasil' : 'impacta';

        return {
          id:      msgId,
          assunto: hdrs['subject'] || '(sem assunto)',
          de:      from,
          data:    hdrs['date'] || '',
          corpo:   corpo.trim(),
          fonte:   fonte,
          labels:  msg.labelIds || [],
        };
      });
  }

  // Marca e-mail como lido
  function marcarComoLido(msgId) {
    if (!CFG.MARCAR_LIDO) return Promise.resolve();
    return gmailFetch('/users/me/messages/' + msgId + '/modify', {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(function() {});
  }

  // ============================================================
  // 📁  GOOGLE DRIVE — Pasta por processo
  // ============================================================
  function criarPastaProcesso(proc) {
    // Se LexAT.DRIVE disponível, usa ele (já testado e funciona)
    if (typeof LexAT !== 'undefined' && LexAT.DRIVE && proc.polo_cliente) {
      var nomeCliente = (proc.ficha ? proc.ficha + ' — ' : '') +
        (proc.polo_cliente || 'Cliente') + (proc.ex_adverso ? ' vs ' + proc.ex_adverso : '');
      return LexAT.DRIVE.criarPastaCliente(nomeCliente.slice(0, 100))
        .then(function(result) {
          if (result && result.id) {
            STATE.stats.pastas++;
            if (typeof LexSync !== 'undefined')
              LexSync.DB.update(LexSync.DB.KEYS.processos, proc.id, {
                drive_folder_id: result.id, drive_folder_nome: nomeCliente
              });
            _log('📁 ✅ Pasta criada via LexAT: ' + nomeCliente);
            return { pasta: result, subpastas: [] };
          }
          return null;
        }).catch(function(e) { _log('📁 ❌ ' + e.message); return null; });
    }
    // Fallback: implementação direta
    
    if (!CFG.CRIAR_DRIVE) return Promise.resolve(null);
    var token = getToken();
    if (!token) return Promise.resolve(null);

    var nomePasta = proc.ficha
      ? proc.ficha + ' — ' + (proc.polo_cliente || 'Cliente') + (proc.ex_adverso ? ' vs ' + proc.ex_adverso : '')
      : (proc.cnj || 'Processo') + ' — ' + (proc.polo_cliente || 'Cliente');

    // Limita tamanho do nome
    nomePasta = nomePasta.slice(0, 100);

    _log('📁 Criando pasta: ' + nomePasta);

    // 1. Cria pasta raiz do processo
    return driveFetch('POST', '/drive/v3/files', {
      name: nomePasta,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [DRIVE_IDS.clientes()],
    })
    .then(function(pasta) {
      if (!pasta.id) {
        var errMsg = pasta.error ? (pasta.error.message || JSON.stringify(pasta.error)) : 'Sem ID retornado';
        // Se erro de escopo, avisa para reconectar
        if (pasta.error && pasta.error.code === 403) {
          _log('📁 ❌ Sem permissão Drive — clique em Conectar Gmail para re-autorizar com escopos completos');
          _toast('⚠️ Re-autorize o Gmail (escopos Drive + Calendar)', 'orange');
        }
        throw new Error('Falha ao criar pasta: ' + errMsg);
      }

      // 2. Salva ID da pasta no LexDB
      if (typeof LexSync !== 'undefined') {
        LexSync.DB.update(LexSync.DB.KEYS.processos, proc.id, { drive_folder_id: pasta.id, drive_folder_nome: nomePasta });
      }

      // 3. Cria as 5 subpastas em paralelo
      var promises = DRIVE_IDS.subpastas.map(function(nome) {
        return driveFetch('POST', '/drive/v3/files', {
          name: nome,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [pasta.id],
        });
      });

      return Promise.all(promises).then(function(subpastas) {
        STATE.stats.pastas++;
        _log('📁 ✅ Pasta criada com ' + subpastas.length + ' subpastas: ' + nomePasta);
        return { pasta: pasta, subpastas: subpastas };
      });
    })
    .catch(function(e) {
      _log('📁 ❌ Erro ao criar pasta: ' + e.message);
      return null;
    });
  }

  // Salva e-mail como arquivo na pasta 04 — Decisões e Intimações
  function salvarEmailNaDrive(emailData, pastaId, subpastas) {
    if (!pastaId || !subpastas) return Promise.resolve(null);
    var token = getToken();
    if (!token) return Promise.resolve(null);

    // Encontra subpasta 04
    var pasta04 = subpastas.find(function(s) { return s.name && s.name.includes('04'); });
    if (!pasta04) return Promise.resolve(null);

    var data = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
    var nomeArquivo = data + ' — ' + emailData.assunto.slice(0,60).replace(/[\/\\:*?"<>|]/g,'') + '.txt';
    var conteudo = 'De: ' + emailData.de + '\nData: ' + emailData.data + '\nAssunto: ' + emailData.assunto + '\n\n' + emailData.corpo;

    // Upload multipart
    var boundary = '---lex_boundary---';
    var meta = JSON.stringify({ name: nomeArquivo, parents: [pasta04.id] });
    var body = '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + meta +
               '\r\n--' + boundary + '\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n' + conteudo +
               '\r\n--' + boundary + '--';

    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body: body,
    }).then(function(r) { return r.json(); })
    .then(function(f) {
      if (f.id) _log('📄 E-mail salvo no Drive: ' + nomeArquivo);
      return f;
    })
    .catch(function(e) { _log('📄 ❌ Erro ao salvar e-mail: ' + e.message); return null; });
  }

  // ============================================================
  // 📅  GOOGLE CALENDAR — Prazo automático
  // ============================================================
  function criarPrazoCalendar(prazo, proc) {
    if (!CFG.CRIAR_CALENDAR) return Promise.resolve(null);
    var token = getToken();
    if (!token) return Promise.resolve(null);
    if (!prazo || !prazo.vencimentoISO) return Promise.resolve(null);

    var urgIcon = { critica: '⚠️', alta: '🟠', media: '🟡' };
    var cores   = { critica: '11', alta: '6', media: '5' };

    var summary = (urgIcon[prazo.urgencia]||'⏳') + ' PRAZO FATAL — ' +
      prazo.tipo + ' — ' + (proc.polo_cliente || 'Cliente') + ' — ' + (proc.cnj || proc.ficha || '');

    var evento = {
      summary:     summary,
      description: 'CNJ: ' + (proc.cnj||'') + '\nVara: ' + (proc.vara||'') + '\nFundamento: ' + prazo.fundamento + '\nCriado automaticamente pelo LexOfficeAT',
      start:       { dateTime: prazo.vencimentoISO + 'T23:59:00-03:00', timeZone: 'America/Sao_Paulo' },
      end:         { dateTime: prazo.vencimentoISO + 'T23:59:00-03:00', timeZone: 'America/Sao_Paulo' },
      colorId:     cores[prazo.urgencia] || '11',
      reminders:   {
        useDefault: false,
        overrides: [
          { method: 'email',  minutes: 10080 }, // 7 dias
          { method: 'popup',  minutes: 4320  }, // 3 dias
          { method: 'email',  minutes: 1440  }, // 1 dia
          { method: 'popup',  minutes: 1440  },
          { method: 'popup',  minutes: 60    }, // 1 hora
        ],
      },
    };

    return calendarFetch('POST', '/calendars/primary/events', evento)
      .then(function(ev) {
        if (ev.id) {
          STATE.stats.prazos++;
          _log('📅 Prazo criado no Calendar: ' + prazo.tipo + ' — ' + prazo.vencimento);
        }
        return ev;
      })
      .catch(function(e) { _log('📅 ❌ Erro Calendar: ' + e.message); return null; });
  }

  // ============================================================
  // 🔄  CICLO PRINCIPAL DE IMPORTAÇÃO
  // ============================================================
  function executarCiclo() {
    var token = getToken();
    if (!token) {
      _log('⚠️ Gmail não conectado — aguardando conexão');
      return;
    }

    STATE.ciclos++;
    STATE.ultima_sync = new Date().toISOString();
    _log('🔄 Ciclo #' + STATE.ciclos + ' iniciado — ' + new Date().toLocaleTimeString('pt-BR'));
    _atualizarBadgeSync('sincronizando');

    buscarEmailsGmail()
      .then(function(mensagens) {
        if (!mensagens.length) {
          _atualizarBadgeSync('ok');
          return;
        }

        // Filtra já processados
        var novas = mensagens.filter(function(m) { return !STATE.processados[m.id]; });
        if (!novas.length) {
          _log('ℹ️ Todos e-mails já processados');
          _atualizarBadgeSync('ok');
          return;
        }

        _log('📨 Processando ' + novas.length + ' e-mail(s) novos...');

        // Busca corpos em paralelo (máx 5 por vez para não sobrecarregar)
        var lotes = [];
        for (var i = 0; i < novas.length; i += 5) {
          lotes.push(novas.slice(i, i + 5));
        }

        return lotes.reduce(function(promiseChain, lote) {
          return promiseChain.then(function() {
            return Promise.all(lote.map(function(m) {
              return buscarCorpoEmail(m.id).then(function(email) {
                return processarEmail(email);
              }).catch(function(e) {
                _log('❌ Erro ao processar ' + m.id + ': ' + e.message);
                STATE.stats.erros++;
                return null;
              });
            }));
          });
        }, Promise.resolve());
      })
      .then(function() {
        _atualizarBadgeSync('ok');
        _atualizarPainelStats();
        _log('✅ Ciclo #' + STATE.ciclos + ' concluído. Stats: ' +
          STATE.stats.novos + ' novos · ' + STATE.stats.atualizados + ' atualizados · ' +
          STATE.stats.prazos + ' prazos · ' + STATE.stats.pastas + ' pastas Drive');

        if (STATE.stats.novos > 0 || STATE.stats.atualizados > 0) {
          _toast('✅ ' + STATE.stats.novos + ' novos · ' + STATE.stats.atualizados + ' atualizados · ' + STATE.stats.prazos + ' prazos criados', 'teal');
          _notificar(STATE.stats.novos, STATE.stats.prazos);
        }
      })
      .catch(function(e) {
        if (e.message === 'TOKEN_EXPIRADO' || e.message === 'SEM_PERMISSAO_DRIVE') {
          _log('⚠️ Token sem permissão ou expirado — clique em Conectar Gmail para re-autorizar');
          _toast('⚠️ Re-autorize o Gmail (Drive + Calendar + Gmail)', 'orange');
          pararMonitor();
        } else {
          _log('❌ Erro no ciclo: ' + e.message);
        }
        _atualizarBadgeSync('erro');
      });
  }

  // Processa um e-mail individual
  function processarEmail(email) {
    if (!email || !email.corpo) return Promise.resolve(null);
    STATE.stats.emails++;

    // 1. Parse com LexSync
    var parsed = null;
    if (typeof LexSync !== 'undefined') {
      try {
        parsed = email.fonte === 'jusbrasil'
          ? LexSync.Parser.Jusbrasil.parse(email.corpo)
          : LexSync.Parser.Impacta.parse(email.corpo, email.fonte);
      } catch(parseErr) {
        _log('[ERRO] Parse falhou: ' + parseErr.message);
        STATE.processados[email.id] = true;
        return Promise.resolve(null);
      }

      // 2. AutoFill — cria/atualiza processos no LexDB
      var resultado = null;
      try {
        resultado = LexSync.AutoFill.processarPublicacao(parsed);
      } catch(afErr) {
        _log('[ERRO] AutoFill falhou: ' + afErr.message);
        resultado = { novos: [], atualizados: [], erros: [] };
      }
      // Guards contra undefined
      resultado = resultado || {};
      resultado.novos       = resultado.novos       || [];
      resultado.atualizados = resultado.atualizados || [];
      STATE.stats.novos       += resultado.novos.length;
      STATE.stats.atualizados += resultado.atualizados.length;

      // 3. Para cada processo NOVO — cria pasta no Drive e prazo no Calendar
      var promises = resultado.novos.map(function(proc) {
        return criarPastaProcesso(proc)
          .then(function(driveResult) {
            if (driveResult) {
              return salvarEmailNaDrive(email, driveResult.pasta.id, driveResult.subpastas);
            }
            return null;
          })
          .then(function() {
            // Prazos do processo
            var prazosProc = parsed.processos.find(function(p) { return p.cnj === proc.cnj; });
            if (prazosProc && prazosProc.prazos && prazosProc.prazos.length) {
              return prazosProc.prazos.reduce(function(chain, prazo) {
                return chain.then(function() { return criarPrazoCalendar(prazo, proc); });
              }, Promise.resolve());
            }
            return null;
          });
      });

      // 4. Para processos ATUALIZADOS — só salva e-mail e cria prazo
      resultado.atualizados.forEach(function(proc) {
        var folderId = proc && proc.drive_folder_id;
        if (folderId) {
          // Encontra subpasta 04
          driveFetch('GET', '/drive/v3/files?q=' + encodeURIComponent("'" + folderId + "' in parents and name contains '04'") + '&fields=files(id,name)')
            .then(function(r) {
              var pasta04 = r.files && r.files[0];
              if (pasta04) salvarEmailNaDrive(email, folderId, [pasta04]);
            }).catch(function() {});
        }

        // Prazos
        var prazosProc = parsed.processos.find(function(p) { return p.cnj === proc.cnj; });
        if (prazosProc && prazosProc.prazos) {
          prazosProc.prazos.forEach(function(prazo) {
            criarPrazoCalendar(prazo, proc);
          });
        }
      });

      // 5. Atualiza inbox UI se visível
      _atualizarInbox(email);

      // 6. Marca como lido
      marcarComoLido(email.id);

      STATE.processados[email.id] = true;
      return Promise.all(promises);
    }

    STATE.processados[email.id] = true;
    return Promise.resolve(null);
  }

  // ============================================================
  // 🖥️  UI — Painel de controle
  // ============================================================
  function injetarPainelImport() {
    var topbar = document.querySelector('#pg-emails .topbar-actions');
    if (!topbar || document.getElementById('btn-auto-import')) return;

    // Botão principal de importação automática
    var btnAuto = document.createElement('button');
    btnAuto.id        = 'btn-auto-import';
    btnAuto.className = 'btn btn-gold btn-sm';
    btnAuto.innerHTML = '🔄 Importar Agora';
    btnAuto.title     = 'Importa todas publicações do Gmail agora';
    btnAuto.onclick   = function() { executarCiclo(); };
    topbar.insertBefore(btnAuto, topbar.firstChild);

    // Badge de status
    var badge = document.createElement('span');
    badge.id        = 'badge-sync-status';
    badge.className = 'badge bteal';
    badge.style.cssText = 'margin-left:8px;cursor:pointer';
    badge.innerHTML = '⏸ Aguardando';
    badge.onclick   = function() { abrirModalImport(); };
    topbar.appendChild(badge);
  }

  function abrirModalImport() {
    var s = STATE.stats;
    var ultima = STATE.ultima_sync
      ? new Date(STATE.ultima_sync).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
      : 'Nunca';

    var dbStats = typeof LexSync !== 'undefined' ? LexSync.stats() : {};

    document.getElementById('modal-gmail-import') && document.getElementById('modal-gmail-import').remove();

    var html = '<div id="modal-gmail-import" style="position:fixed;inset:0;background:rgba(0,0,0,.76);backdrop-filter:blur(8px);z-index:300;display:flex;align-items:center;justify-content:center;padding:18px">'
      + '<div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:26px;width:580px;max-width:95vw;max-height:90vh;overflow-y:auto">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      + '<div style="font-family:\'Playfair Display\',serif;font-size:18px">🔄 Gmail Auto-Import</div>'
      + '<button onclick="document.getElementById(\'modal-gmail-import\').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px">✕</button>'
      + '</div>'

      // Status
      + '<div style="background:rgba(62,207,207,.07);border:1px solid rgba(62,207,207,.25);border-radius:10px;padding:14px;margin-bottom:16px">'
      + '<div style="font-size:12px;color:var(--teal);font-weight:600;margin-bottom:10px">📊 STATUS DA SINCRONIZAÇÃO</div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
      + _statBox('📧 E-mails Lidos', s.emails)
      + _statBox('✨ Novos Processos', s.novos)
      + _statBox('🔄 Atualizados', s.atualizados)
      + _statBox('⏳ Prazos Criados', s.prazos)
      + _statBox('📁 Pastas Drive', s.pastas)
      + _statBox('❌ Erros', s.erros)
      + '</div>'
      + '<div style="font-size:11px;color:var(--text3);margin-top:10px">🕐 Última sync: ' + ultima + ' · Ciclos: ' + STATE.ciclos + '</div>'
      + '</div>'

      // Banco local
      + '<div style="background:var(--surface2);border-radius:10px;padding:13px;margin-bottom:16px;border:1px solid var(--border)">'
      + '<div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:8px">💾 BANCO LOCAL (LexDB)</div>'
      + '<div style="display:flex;gap:12px;font-size:12.5px;color:var(--text2);flex-wrap:wrap">'
      + '<span>👤 ' + (dbStats.clientes||0) + ' clientes</span>'
      + '<span>⚖️ ' + (dbStats.processos||0) + ' processos</span>'
      + '<span>⏳ ' + (dbStats.prazos||0) + ' prazos</span>'
      + '<span>📬 ' + (dbStats.publicacoes||0) + ' publicações</span>'
      + '</div>'
      + '</div>'

      // Configurações
      + '<div style="margin-bottom:16px">'
      + '<div style="font-size:12px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">⚙️ CONFIGURAÇÕES</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      + _toggleOpt('import_opt_drive',    '📁 Criar pastas no Drive',    CFG.CRIAR_DRIVE)
      + _toggleOpt('import_opt_calendar', '📅 Criar prazos no Calendar', CFG.CRIAR_CALENDAR)
      + _toggleOpt('import_opt_lido',     '✅ Marcar e-mails como lido', CFG.MARCAR_LIDO)
      + _toggleOpt('import_opt_lidos',    '🔍 Incluir já lidos',         CFG.BUSCAR_LIDOS)
      + '</div>'
      + '<div style="margin-top:10px"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">⏱️ Intervalo automático (minutos)</label>'
      + '<input id="import_intervalo" type="number" min="5" max="60" value="' + CFG.INTERVALO_MIN + '" '
      + 'style="width:100px;padding:7px 10px;border-radius:8px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px">'
      + '</div>'
      + '</div>'

      // Ações
      + '<div style="display:flex;gap:9px;flex-wrap:wrap">'
      + '<button class="btn btn-gold" onclick="LexGmailImport.importarAgora()">🔄 Importar Agora</button>'
      + '<button class="btn btn-teal btn-sm" onclick="LexGmailImport.iniciarMonitor()">▶️ Iniciar Monitor</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="LexGmailImport.pararMonitor()">⏹ Parar</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="LexGmailImport.salvarConfig()">💾 Salvar Config</button>'
      + '</div>'
      + '</div></div>';

    document.body.insertAdjacentHTML('beforeend', html);
  }

  function _statBox(label, val) {
    return '<div style="background:var(--surface3);border-radius:8px;padding:10px;text-align:center">'
      + '<div style="font-size:18px;font-weight:700;color:var(--text)">' + (val||0) + '</div>'
      + '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + label + '</div></div>';
  }

  function _toggleOpt(id, label, val) {
    return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:var(--surface3);border-radius:8px;padding:9px 11px">'
      + '<input type="checkbox" id="' + id + '"' + (val?' checked':'') + ' style="width:15px;height:15px;cursor:pointer">'
      + '<span style="font-size:12px;color:var(--text2)">' + label + '</span></label>';
  }

  function _atualizarInbox(email) {
    var inbox = document.getElementById('inboxList');
    if (!inbox) return;

    // Remove placeholder
    var placeholder = inbox.querySelector('[style*="📭"]');
    if (placeholder) inbox.innerHTML = '';

    var isJB  = email.fonte === 'jusbrasil';
    var cor   = isJB ? 'bo' : 'bteal';
    var label = isJB ? 'JusBrasil' : 'Impacta';
    var trecho = (email.corpo || '').slice(0, 100).replace(/\n/g, ' ');
    var data  = email.data ? new Date(email.data).toLocaleDateString('pt-BR') : '';

    var item = document.createElement('div');
    item.className = 'ditem';
    item.style.cssText = 'flex-direction:column;align-items:flex-start;gap:4px;margin-bottom:6px;cursor:pointer;animation:fadeIn .3s ease';
    item.innerHTML = '<div style="display:flex;align-items:center;gap:8px;width:100%">'
      + '<span class="badge ' + cor + '" style="font-size:10px;flex-shrink:0">' + label + '</span>'
      + '<span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (email.assunto||'') + '</span>'
      + '<span style="font-size:11px;color:var(--text3)">' + data + '</span>'
      + '<span class="badge bg" style="font-size:9px">✅ processado</span>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text2);padding-left:4px">' + trecho + '</div>';

    inbox.insertBefore(item, inbox.firstChild);
  }

  function _atualizarBadgeSync(status) {
    var badge = document.getElementById('badge-sync-status');
    if (!badge) return;
    var estados = {
      ok:            { texto: '✅ Sincronizado',  cor: 'rgba(76,175,130,.15)', borda: 'rgba(76,175,130,.3)', txt: 'var(--green)' },
      sincronizando: { texto: '🔄 Sincronizando', cor: 'rgba(91,141,238,.15)', borda: 'rgba(91,141,238,.3)',  txt: 'var(--blue)' },
      erro:          { texto: '❌ Erro',           cor: 'rgba(224,92,92,.12)',  borda: 'rgba(224,92,92,.25)', txt: 'var(--red)' },
      aguardando:    { texto: '⏸ Aguardando',     cor: 'rgba(62,207,207,.08)', borda: 'rgba(62,207,207,.25)',txt: 'var(--teal)' },
    };
    var e = estados[status] || estados.aguardando;
    badge.textContent     = e.texto;
    badge.style.background = e.cor;
    badge.style.border    = '1px solid ' + e.borda;
    badge.style.color     = e.txt;
  }

  function _atualizarPainelStats() {
    var kET  = document.getElementById('kET');
    var kEP  = document.getElementById('kEP');
    var kEPz = document.getElementById('kEPz');
    var kDup = document.getElementById('kEDup');
    if (kET)  kET.textContent  = STATE.stats.emails;
    if (kEP)  kEP.textContent  = STATE.stats.novos + STATE.stats.atualizados;
    if (kEPz) kEPz.textContent = STATE.stats.prazos;
    if (kDup) kDup.textContent = STATE.stats.erros;
  }

  function _notificar(novos, prazos) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification('LexOffice — Publicações Importadas', {
      body: novos + ' processo(s) · ' + prazos + ' prazo(s) criado(s)',
      icon: 'https://amilcaradvocacia.github.io/meu-app-lexoffice/favicon.ico',
    });
  }

  // ============================================================
  // ⏱️  MONITOR AUTOMÁTICO
  // ============================================================
  function iniciarMonitor() {
    pararMonitor();
    var ms = CFG.INTERVALO_MIN * 60 * 1000;
    STATE.timer   = setInterval(executarCiclo, ms);
    STATE.rodando = true;
    _atualizarBadgeSync('aguardando');
    _log('⏱️ Monitor automático ativo — verificando a cada ' + CFG.INTERVALO_MIN + ' min');
    _toast('▶️ Monitor ativo — sync a cada ' + CFG.INTERVALO_MIN + ' min', 'teal');
  }

  function pararMonitor() {
    if (STATE.timer) { clearInterval(STATE.timer); STATE.timer = null; }
    STATE.rodando = false;
    _atualizarBadgeSync('aguardando');
    _log('⏹ Monitor pausado');
  }

  // ============================================================
  // 🔧  HELPERS
  // ============================================================
  function _log(msg) {
    var el = document.getElementById('emailLog');
    if (el) {
      var t = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      var cor = msg.includes('✅')||msg.includes('📁')||msg.includes('📅') ? 'var(--green)'
              : msg.includes('❌') ? 'var(--red)'
              : msg.includes('⚠️') ? 'var(--orange)'
              : 'var(--teal)';
      el.innerHTML += '<div style="color:' + cor + '">[' + t + '] ' + msg + '</div>';
      el.scrollTop  = el.scrollHeight;
    }
    console.log('[LexImport]', msg);
  }

  function _toast(msg, tipo) {
    if (typeof window.toast === 'function') window.toast(msg, tipo || 'green');
  }

  // ============================================================
  // 🌐  API PÚBLICA
  // ============================================================
  window.LexGmailImport = {
    importarAgora:   function() { executarCiclo(); document.getElementById('modal-gmail-import') && document.getElementById('modal-gmail-import').remove(); },
    iniciarMonitor:  function() { iniciarMonitor(); document.getElementById('modal-gmail-import') && document.getElementById('modal-gmail-import').remove(); },
    pararMonitor:    pararMonitor,
    abrirPainel:     abrirModalImport,

    salvarConfig: function() {
      CFG.CRIAR_DRIVE    = !!document.getElementById('import_opt_drive')?.checked;
      CFG.CRIAR_CALENDAR = !!document.getElementById('import_opt_calendar')?.checked;
      CFG.MARCAR_LIDO    = !!document.getElementById('import_opt_lido')?.checked;
      CFG.BUSCAR_LIDOS   = !!document.getElementById('import_opt_lidos')?.checked;
      var iv = parseInt(document.getElementById('import_intervalo')?.value || '15');
      CFG.INTERVALO_MIN  = isNaN(iv) ? 15 : Math.max(5, Math.min(60, iv));
      localStorage.setItem('lex_import_cfg', JSON.stringify(CFG));
      _toast('✅ Configurações salvas!', 'green');
      if (STATE.rodando) { pararMonitor(); iniciarMonitor(); }
      document.getElementById('modal-gmail-import') && document.getElementById('modal-gmail-import').remove();
    },

    estado: function() {
      return {
        rodando:    STATE.rodando,
        ciclos:     STATE.ciclos,
        ultima_sync:STATE.ultima_sync,
        stats:      STATE.stats,
        config:     CFG,
      };
    },
  };

  // ============================================================
  // 🚀  INICIALIZAÇÃO
  // ============================================================
  function init() {
    // Carrega configuração salva
    try {
      var cfgSalva = JSON.parse(localStorage.getItem('lex_import_cfg') || '{}');
      Object.assign(CFG, cfgSalva);
    } catch(e) {}

    // Injeta botões na UI
    setTimeout(injetarPainelImport, 1200);

    // Re-injeta ao trocar de página
    var goOrig = window.go;
    window.go = function(page, el) {
      if (goOrig) goOrig(page, el);
      if (page === 'emails') setTimeout(injetarPainelImport, 400);
    };

    // Inicia monitor automaticamente se Gmail já estiver conectado
    setTimeout(function() {
      if (getToken()) {
        _log('🔄 Gmail já conectado — iniciando monitor automático');
        iniciarMonitor();
        executarCiclo(); // Importa imediatamente
      }
    }, 2000);

    console.log('[LexGmailImport v1.0] ✅ Módulo carregado');
    console.log('[LexGmailImport] Remetentes monitorados: ' + CFG.REMETENTES.join(', '));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

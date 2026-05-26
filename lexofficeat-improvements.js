/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         LexOfficeAT — Melhorias & Integrações v2.0          ║
 * ║   Google Calendar · Google Drive · Gmail · IA Jurídica      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * INSTALAÇÃO:
 * Adicione antes do </body> no index.html:
 * <script src="lexofficeat-improvements.js"></script>
 *
 * CONFIGURAÇÃO OBRIGATÓRIA (linha ~30):
 * - ANTHROPIC_KEY: sua chave da API Anthropic (sk-ant-...)
 * - GOOGLE_CLIENT_ID: já configurado no LexOfficeAT
 * - DRIVE_FOLDER_CLIENTES_ID: ID da pasta 📁 CLIENTES do Drive
 */

(function () {
  'use strict';

  // ============================================================
  // ⚙️  CONFIGURAÇÕES — EDITE AQUI
  // ============================================================
  const CFG = {
    ANTHROPIC_KEY: localStorage.getItem('lex_anthropic_key') || '',
    DRIVE_FOLDER_CLIENTES_ID: localStorage.getItem('lex_drive_clientes_id') || '1xoBLeDu6LKNHHJO-q2pNU0WwxdrLJsnt',
    DRIVE_FOLDER_MODELO_ID:   localStorage.getItem('lex_drive_modelo_id')   || '17YYTUryi5GoeIWbk__0VvLUkpIb1cDa7',
    DRIVE_FOLDER_JURIS_ID:    localStorage.getItem('lex_drive_juris_id')    || '1ZfnpkxTJTxlJAnffDtOrdL5AP-BL1Dmp',
    CALENDAR_ID: 'primary',
    TIMEZONE: 'America/Sao_Paulo',
  };

  // Paleta de cores do Calendar (IDs do Google)
  const CAL_COLORS = {
    PRAZO_FATAL: '11',   // Tomate (vermelho)
    AUDIENCIA:   '9',    // Mirtilo (azul)
    REUNIAO:     '2',    // Sálvia (verde)
    DILIGENCIA:  '5',    // Banana (amarelo)
    INTERNO:     '8',    // Grafite
  };

  // ============================================================
  // 🔧  UTILITÁRIOS
  // ============================================================
  function getToken() {
    return EMAIL?.token || localStorage.getItem('lex_gmail_token') || null;
  }

  function toast(msg, type = 'green') {
    if (typeof window.toast === 'function') { window.toast(msg, type); return; }
    const el = document.createElement('div');
    const colors = { green: '#4caf82', red: '#e05c5c', blue: '#5b8dee', gold: '#c9a84c' };
    el.style.cssText = `position:fixed;bottom:22px;right:22px;z-index:9999;
      background:${colors[type]||colors.green};color:#fff;padding:11px 18px;
      border-radius:10px;font-size:13px;font-weight:500;
      box-shadow:0 4px 18px rgba(0,0,0,.35);animation:fadeIn .25s ease;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function formatISO(dateStr, timeStr = '08:00') {
    const [d, m, y] = (dateStr || '').includes('/') ? dateStr.split('/') : ['01','01','2026'];
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${timeStr}:00`;
  }

  function addDays(isoStr, days) {
    const d = new Date(isoStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 19);
  }

  function calendarRequest(method, path, body) {
    const token = getToken();
    if (!token) { toast('⚠️ Conecte o Gmail primeiro', 'red'); return Promise.reject('no token'); }
    return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json());
  }

  function driveRequest(method, path, body, params) {
    const token = getToken();
    if (!token) { toast('⚠️ Conecte o Gmail primeiro', 'red'); return Promise.reject('no token'); }
    const url = `https://www.googleapis.com${path}${params ? '?' + new URLSearchParams(params) : ''}`;
    return fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json());
  }

  function gmailRequest(method, path, body) {
    const token = getToken();
    if (!token) { toast('⚠️ Conecte o Gmail primeiro', 'red'); return Promise.reject('no token'); }
    return fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json());
  }

  // ============================================================
  // 📅  MÓDULO CALENDAR — Criação de eventos com padrão do escritório
  // ============================================================
  const CALENDAR = {

    /**
     * Cria prazo fatal no Calendar
     * @param {Object} p - { processo, tipo, cliente, data, hora, advogado, vara }
     */
    async criarPrazoFatal(p) {
      const start = formatISO(p.data, p.hora || '23:59');
      const end   = addDays(start + '-03:00', 0).replace('T23:59', 'T23:59').slice(0,16) + ':00-03:00';
      const evento = {
        summary: `⚠️ PRAZO FATAL — ${p.tipo} — ${p.cliente} — ${p.processo}`,
        description: `Vara: ${p.vara || ''}\nAdvogado: ${p.advogado || ''}\nCriado automaticamente pelo LexOfficeAT`,
        start: { dateTime: start + '-03:00', timeZone: CFG.TIMEZONE },
        end:   { dateTime: start.slice(0,11) + '23:59:00-03:00', timeZone: CFG.TIMEZONE },
        colorId: CAL_COLORS.PRAZO_FATAL,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email',  minutes: 10080 }, // 7 dias
            { method: 'popup',  minutes: 4320  }, // 3 dias
            { method: 'email',  minutes: 1440  }, // 1 dia
            { method: 'popup',  minutes: 1440  }, // 1 dia
            { method: 'popup',  minutes: 60    }, // 1 hora
          ]
        }
      };
      const res = await calendarRequest('POST', `/calendars/${CFG.CALENDAR_ID}/events`, evento);
      if (res.id) {
        toast(`✅ Prazo fatal criado no Calendar!`, 'green');
        adicionarLogEmail(`📅 CALENDAR: Prazo criado — ${p.tipo} — ${p.cliente} — ${p.data}`);
      }
      return res;
    },

    /**
     * Cria audiência no Calendar
     * @param {Object} p - { processo, tipo, cliente, data, hora, vara, advogado }
     */
    async criarAudiencia(p) {
      const start = formatISO(p.data, p.hora || '09:00');
      const end   = start.slice(0, 16).replace('T', 'T');
      const [h, m] = (p.hora || '09:00').split(':');
      const endHora = `${String(parseInt(h)+1).padStart(2,'0')}:${m}`;

      const evento = {
        summary: `🎙️ AUDIÊNCIA — ${p.tipo} — ${p.cliente} — ${p.vara}`,
        description: `Processo: ${p.processo || ''}\nAdvogado: ${p.advogado || ''}\nCriado automaticamente pelo LexOfficeAT`,
        location: p.vara || '',
        start: { dateTime: formatISO(p.data, p.hora || '09:00') + '-03:00', timeZone: CFG.TIMEZONE },
        end:   { dateTime: formatISO(p.data, endHora) + '-03:00', timeZone: CFG.TIMEZONE },
        colorId: CAL_COLORS.AUDIENCIA,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 4320  }, // 3 dias
            { method: 'email', minutes: 1440  }, // 1 dia
            { method: 'popup', minutes: 1440  }, // 1 dia
            { method: 'popup', minutes: 120   }, // 2 horas
          ]
        }
      };
      const res = await calendarRequest('POST', `/calendars/${CFG.CALENDAR_ID}/events`, evento);
      if (res.id) toast(`✅ Audiência criada no Calendar!`, 'blue');
      return res;
    },

    /**
     * Cria reunião com cliente
     * @param {Object} p - { cliente, assunto, data, hora, duracao }
     */
    async criarReuniaoCliente(p) {
      const start = formatISO(p.data, p.hora || '10:00');
      const [h, m] = (p.hora || '10:00').split(':');
      const dur = p.duracao || 60;
      const endMin = (parseInt(h)*60 + parseInt(m) + dur);
      const endHora = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;

      const evento = {
        summary: `👥 REUNIÃO — ${p.cliente} — ${p.assunto}`,
        description: `Assunto: ${p.assunto}\nCriado automaticamente pelo LexOfficeAT`,
        start: { dateTime: start + '-03:00', timeZone: CFG.TIMEZONE },
        end:   { dateTime: formatISO(p.data, endHora) + '-03:00', timeZone: CFG.TIMEZONE },
        colorId: CAL_COLORS.REUNIAO,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 },
            { method: 'popup', minutes: 1440 },
            { method: 'popup', minutes: 60   },
          ]
        }
      };
      const res = await calendarRequest('POST', `/calendars/${CFG.CALENDAR_ID}/events`, evento);
      if (res.id) toast(`✅ Reunião criada no Calendar!`, 'green');
      return res;
    },
  };

  // ============================================================
  // 📁  MÓDULO DRIVE — Gestão de pastas de clientes
  // ============================================================
  const DRIVE = {

    /**
     * Cria pasta completa do cliente copiando o modelo
     * @param {string} nomeCliente
     * @returns {Object} pasta criada
     */
    async criarPastaCliente(nomeCliente) {
      toast(`📁 Criando pasta para ${nomeCliente}...`, 'blue');

      // 1. Cria pasta raiz do cliente
      const pastaCliente = await driveRequest('POST',
        '/drive/v3/files', {
          name: nomeCliente,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [CFG.DRIVE_FOLDER_CLIENTES_ID]
        }
      );

      if (!pastaCliente.id) {
        toast('❌ Erro ao criar pasta no Drive', 'red');
        return null;
      }

      // 2. Cria as 5 subpastas padrão
      const subpastas = [
        '01 — Contratos e Procurações',
        '02 — Petições e Peças',
        '03 — Documentos do Cliente',
        '04 — Decisões e Intimações',
        '05 — Correspondências',
      ];

      for (const nome of subpastas) {
        await driveRequest('POST', '/drive/v3/files', {
          name: nome,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [pastaCliente.id]
        });
      }

      toast(`✅ Pasta criada: ${nomeCliente} (5 subpastas)`, 'green');
      adicionarLogEmail(`📁 DRIVE: Pasta criada para ${nomeCliente} — ID: ${pastaCliente.id}`);
      return pastaCliente;
    },

    /**
     * Salva jurisprudência em arquivo no Drive
     * @param {string} tema
     * @param {string} conteudo
     * @param {string} area - Cível, Trabalhista etc.
     */
    async salvarJurisprudencia(tema, conteudo, area = 'Geral') {
      const mapeamento = {
        'Cível': '1RmX9fO7nKiHoGbQo6Nt0ijlzY0jcXE4p',
        'Trabalhista': '1qgawgYtT6v6rhBcbN9jSECqxfBsg-lNC',
        'Tributário': '1190g-IsSskFtqa4LTm4B1EY_QJa7L9rA',
        'Criminal': '1n4nm_HKrKA3lK4S-l4DxnlPZ89Xqdf_l',
        'Família': '1CixclQw-KlGk0jGNTvP8n-MWBfnL8jqR',
        'Empresarial': '19_ZjIXhUfcZEjzmjuyghRjE585fnd_D1',
      };
      const pastaId = mapeamento[area] || CFG.DRIVE_FOLDER_JURIS_ID;
      const data = new Date().toLocaleDateString('pt-BR');
      const nome = `${tema} — ${data}.txt`;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: (() => {
          const boundary = '---boundary---';
          const meta = JSON.stringify({ name: nome, parents: [pastaId] });
          return `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${conteudo}\r\n--${boundary}--`;
        })()
      }).then(r => r.json());

      if (res.id) toast(`✅ Jurisprudência salva no Drive!`, 'green');
      return res;
    },
  };

  // ============================================================
  // 📧  MÓDULO GMAIL — Envio de e-mails com modelos
  // ============================================================
  const GMAIL = {

    /**
     * Envia e-mail de atualização processual
     */
    async enviarAtualizacao({ para, cliente, processo, vara, movimentacao, proximaEtapa }) {
      const assunto = `📋 Atualização Processual — ${cliente} — Processo nº ${processo}`;
      const corpo = `Prezado(a) ${cliente},\n\nInformamos sobre o andamento do seu processo.\n\n` +
        `📌 Processo nº: ${processo}\n⚖️ Vara: ${vara}\n\n` +
        `📝 O que ocorreu:\n${movimentacao}\n\n` +
        `➡️ Próximos passos:\n${proximaEtapa}\n\n` +
        `Permanecemos à disposição.\n\nAtenciosamente,\nEscritório de Advocacia`;
      return this._criarRascunho(para, assunto, corpo);
    },

    /**
     * Envia e-mail de decisão favorável
     */
    async enviarDecisaoFavoravel({ para, cliente, processo, vara, resultado, proximaEtapa }) {
      const assunto = `✅ Decisão Favorável — ${cliente} — Processo nº ${processo}`;
      const corpo = `Prezado(a) ${cliente},\n\nTemos o prazer de informar decisão FAVORÁVEL no seu processo!\n\n` +
        `📌 Processo nº: ${processo}\n⚖️ Vara: ${vara}\n\n` +
        `✅ O que foi decidido:\n${resultado}\n\n` +
        `➡️ Próximos passos:\n${proximaEtapa}\n\n` +
        `Parabéns pela conquista!\n\nAtenciosamente,\nEscritório de Advocacia`;
      return this._criarRascunho(para, assunto, corpo);
    },

    /**
     * Envia e-mail de solicitação de documentos
     */
    async enviarSolicitacaoDocumentos({ para, cliente, documentos, prazo }) {
      const assunto = `📄 Solicitação de Documentos — ${cliente}`;
      const lista = documentos.map((d, i) => `${i+1}. ${d}`).join('\n');
      const corpo = `Prezado(a) ${cliente},\n\nPara darmos continuidade ao seu caso, precisamos dos seguintes documentos:\n\n${lista}\n\n` +
        `⚠️ Prazo para entrega: ${prazo}\n\n` +
        `Pode enviar digitalizados por e-mail ou trazer pessoalmente.\n\n` +
        `Atenciosamente,\nEscritório de Advocacia`;
      return this._criarRascunho(para, assunto, corpo);
    },

    async _criarRascunho(para, assunto, corpo) {
      const raw = btoa(unescape(encodeURIComponent(
        `To: ${para}\r\nSubject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(assunto)))}?=\r\n` +
        `MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${corpo}`
      ))).replace(/\+/g,'-').replace(/\//g,'_');

      const res = await gmailRequest('POST', '/users/me/drafts', {
        message: { raw }
      });
      if (res.id) {
        toast(`✅ Rascunho criado no Gmail!`, 'green');
        adicionarLogEmail(`📧 GMAIL: Rascunho criado para ${para}`);
      }
      return res;
    },
  };

  // ============================================================
  // 🧠  MÓDULO IA — Pesquisa jurisprudencial real via Claude API
  // ============================================================
  const IA = {

    /**
     * Pesquisa jurisprudência no JUSRATIO/Legal Data Hunter via Claude
     * @param {string} tema
     * @param {string} area - Cível, Trabalhista etc.
     */
    async pesquisarJurisprudencia(tema, area) {
      if (!CFG.ANTHROPIC_KEY) {
        toast('⚠️ Configure a API Key Anthropic nas Integrações', 'red');
        return null;
      }

      const el = document.getElementById('jurisResp') || document.getElementById('aiDocResp');
      if (el) { el.textContent = '🔍 Pesquisando nos tribunais brasileiros...'; el.classList.add('loading'); }

      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CFG.ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: `Você é um assistente jurídico especializado em direito brasileiro.
Ao pesquisar jurisprudência, priorize SEMPRE fontes brasileiras (STJ, STF, TRTs, TJs estaduais, TCU, CARF).
Fontes estrangeiras só devem ser mencionadas se o usuário pedir explicitamente.
Responda de forma estruturada com: tese jurídica, tribunais, fundamentos e aplicação prática.`,
            messages: [{
              role: 'user',
              content: `Pesquise jurisprudência sobre: "${tema}" na área de ${area || 'direito geral'}.
Traga as principais teses dos tribunais superiores brasileiros (STJ, STF, TRTs) sobre o tema,
com indicação de processos paradigma quando possível.
Formate a resposta em tópicos claros para uso em petições.`
            }]
          })
        });

        const data = await resp.json();
        const texto = data.content?.[0]?.text || 'Nenhum resultado encontrado.';

        if (el) { el.textContent = texto; el.classList.remove('loading'); }

        // Salva automaticamente no Drive se tema preenchido
        if (tema && area) {
          DRIVE.salvarJurisprudencia(tema, texto, area).catch(() => {});
        }

        return texto;
      } catch (e) {
        if (el) { el.textContent = '❌ Erro na pesquisa. Verifique a API Key.'; el.classList.remove('loading'); }
        toast('❌ Erro na pesquisa IA', 'red');
        return null;
      }
    },

    /**
     * Resume publicação do tribunal com IA
     * @param {string} texto - conteúdo bruto do e-mail
     */
    async resumirPublicacao(texto) {
      if (!CFG.ANTHROPIC_KEY) return null;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CFG.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'Você é assistente jurídico. Resuma publicações de tribunais brasileiros de forma clara e objetiva.',
          messages: [{
            role: 'user',
            content: `Resuma esta publicação judicial em linguagem simples para o cliente,
destacando: o que aconteceu, o que precisa ser feito, prazo urgente (se houver).
Publicação:\n\n${texto.slice(0, 3000)}`
          }]
        })
      });
      const data = await resp.json();
      return data.content?.[0]?.text || '';
    },

    /**
     * Gera mensagem WhatsApp personalizada
     */
    async gerarMsgWhatsApp({ cliente, processo, movimentacao, tel }) {
      if (!CFG.ANTHROPIC_KEY) return null;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CFG.ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: 'Você redige mensagens de WhatsApp jurídicas: profissionais, cordiais e em linguagem acessível.',
          messages: [{
            role: 'user',
            content: `Crie uma mensagem de WhatsApp para o cliente ${cliente} sobre o processo ${processo}.
Movimentação: ${movimentacao}. Seja breve, cordial e profissional.`
          }]
        })
      });
      const data = await resp.json();
      const msg = data.content?.[0]?.text || '';
      if (tel && msg) {
        const url = `https://api.whatsapp.com/send?phone=55${tel.replace(/\D/g,'')}&text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
      }
      return msg;
    },
  };

  // ============================================================
  // 🔌  INTEGRAÇÃO COM FUNÇÕES EXISTENTES DO LEXOFFICE
  // ============================================================

  function adicionarLogEmail(msg) {
    const el = document.getElementById('emailLog');
    if (!el) return;
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML += `<div style="color:var(--teal)">[${time}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  }

  // Sobrescreve buscarJurisIA com versão real
  window.buscarJurisIA = async function () {
    const input = document.getElementById('jurisBusca');
    const tema = input?.value?.trim();
    if (!tema) { toast('⚠️ Digite um tema para pesquisar', 'gold'); return; }

    // Detecta área pelo contexto da busca
    const areaMap = [
      { k: ['trabalhista','empregado','empregador','rescisão','justa causa','verbas'], v: 'Trabalhista' },
      { k: ['tributar','imposto','contribuição','carf','receita federal','icms','iss'], v: 'Tributário' },
      { k: ['crimin','penal','crime','homicídio','furto','roubo','prisão'], v: 'Criminal' },
      { k: ['família','divórcio','alimentos','guarda','inventário','herança'], v: 'Família' },
      { k: ['empresa','societário','contrato social','falência','recuperação'], v: 'Empresarial' },
    ];
    const temaLow = tema.toLowerCase();
    let area = 'Cível';
    for (const { k, v } of areaMap) {
      if (k.some(w => temaLow.includes(w))) { area = v; break; }
    }

    await IA.pesquisarJurisprudencia(tema, area);
  };

  // Sobrescreve aiDoc com versão real
  window.aiDoc = async function (tipo) {
    const procSel = document.getElementById('docProcSelect');
    const processo = procSel?.value || 'processo não selecionado';
    const temas = {
      resumo: `Faça um resumo executivo do processo ${processo}`,
      criticos: `Aponte os pontos críticos e riscos do processo ${processo}`,
      argumentos: `Liste os principais argumentos jurídicos disponíveis para o processo ${processo}`,
      prazos: `Identifique os prazos processuais importantes para o processo ${processo}`,
      juris: `Pesquise jurisprudência relevante para o processo ${processo}`
    };
    const el = document.getElementById('aiDocResp');
    if (el) { el.textContent = '🤖 Analisando...'; el.classList.add('loading'); }
    const res = await IA.pesquisarJurisprudencia(temas[tipo] || temas.resumo, 'Cível');
    if (el) { el.classList.remove('loading'); }
  };

  // ============================================================
  // 🎯  BOTÕES DE INTEGRAÇÃO — Injetados na UI
  // ============================================================
  function injetarBotoesUI() {

    // --- Painel de Integrações: adiciona configuração da API Key ---
    const pgInteg = document.getElementById('pg-integracoes');
    if (pgInteg) {
      const content = pgInteg.querySelector('.content');
      if (content && !document.getElementById('lexat-api-panel')) {
        const panel = document.createElement('div');
        panel.id = 'lexat-api-panel';
        panel.innerHTML = `
          <div style="background:linear-gradient(135deg,rgba(201,168,76,.08),rgba(201,168,76,.03));
            border:1px solid rgba(201,168,76,.3);border-radius:14px;padding:18px;margin-bottom:16px">
            <div style="font-size:13px;font-weight:700;color:var(--gold2);margin-bottom:14px">
              ⚡ LexOfficeAT — Integrações Ativas
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:14px">
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">
                  🤖 Anthropic API Key
                </label>
                <input type="password" id="lexat_anthropic_key"
                  placeholder="sk-ant-..."
                  value="${CFG.ANTHROPIC_KEY}"
                  style="width:100%;padding:8px 11px;border-radius:9px;
                    background:var(--surface2);border:1px solid var(--border2);
                    color:var(--text);font-size:13px">
              </div>
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">
                  📁 ID Pasta Clientes (Drive)
                </label>
                <input type="text" id="lexat_drive_id"
                  placeholder="1xoBLeDu6LKNHHJO..."
                  value="${CFG.DRIVE_FOLDER_CLIENTES_ID}"
                  style="width:100%;padding:8px 11px;border-radius:9px;
                    background:var(--surface2);border:1px solid var(--border2);
                    color:var(--text);font-size:13px">
              </div>
            </div>
            <div style="display:flex;gap:9px;flex-wrap:wrap">
              <button class="btn btn-gold" onclick="LexAT.salvarConfigs()">💾 Salvar Configurações</button>
              <button class="btn btn-teal" onclick="LexAT.testarIA()">🧠 Testar IA</button>
              <button class="btn btn-ghost btn-sm" onclick="LexAT.testarCalendar()">📅 Testar Calendar</button>
              <button class="btn btn-ghost btn-sm" onclick="LexAT.testarDrive()">📁 Testar Drive</button>
            </div>
            <div id="lexat_status" style="margin-top:10px;font-size:12px;color:var(--text3)"></div>
          </div>
        `;
        content.insertBefore(panel, content.firstChild);
      }
    }

    // --- Módulo Clientes: adiciona botão "Criar pasta no Drive" ---
    const topbarClientes = document.querySelector('#pg-clientes .topbar-actions');
    if (topbarClientes && !document.getElementById('btn-drive-cliente')) {
      const btn = document.createElement('button');
      btn.id = 'btn-drive-cliente';
      btn.className = 'btn btn-ghost btn-sm';
      btn.innerHTML = '📁 Pasta Drive';
      btn.title = 'Cria pasta do cliente selecionado no Google Drive';
      btn.onclick = () => {
        const nome = prompt('Nome do cliente para criar pasta no Drive:');
        if (nome) DRIVE.criarPastaCliente(nome);
      };
      topbarClientes.insertBefore(btn, topbarClientes.firstChild);
    }

    // --- Módulo Prazos: botão "Enviar para Calendar" ---
    const topbarPrazos = document.querySelector('#pg-prazos .topbar-actions');
    if (topbarPrazos && !document.getElementById('btn-cal-prazo')) {
      const btn = document.createElement('button');
      btn.id = 'btn-cal-prazo';
      btn.className = 'btn btn-teal btn-sm';
      btn.innerHTML = '📅 → Calendar';
      btn.title = 'Cria o prazo no Google Calendar';
      btn.onclick = () => abrirModalPrazoCalendar();
      topbarPrazos.appendChild(btn);
    }

    // --- Módulo Audiências: botão "Enviar para Calendar" ---
    const topbarAud = document.querySelector('#pg-audiencias .topbar-actions');
    if (topbarAud && !document.getElementById('btn-cal-aud')) {
      const btn = document.createElement('button');
      btn.id = 'btn-cal-aud';
      btn.className = 'btn btn-teal btn-sm';
      btn.innerHTML = '📅 → Calendar';
      btn.onclick = () => abrirModalAudienciaCalendar();
      topbarAud.appendChild(btn);
    }

    // --- Módulo Emails: botão "Resumir com IA" ---
    const emailActions = document.querySelector('#pg-emails .topbar-actions');
    if (emailActions && !document.getElementById('btn-resumir-ia')) {
      const btn = document.createElement('button');
      btn.id = 'btn-resumir-ia';
      btn.className = 'btn btn-ai btn-sm';
      btn.innerHTML = '🤖 Resumir IA';
      btn.onclick = async () => {
        const body = document.getElementById('emailBody')?.value;
        if (!body) { toast('Cole um e-mail primeiro', 'gold'); return; }
        const res = await IA.resumirPublicacao(body);
        if (res) {
          const log = document.getElementById('emailLog');
          if (log) log.innerHTML += `<div style="color:#a8c4ff;margin-top:8px"><b>🤖 Resumo IA:</b><br>${res}</div>`;
        }
      };
      emailActions.appendChild(btn);
    }
  }

  // ============================================================
  // 📋  MODAL RÁPIDO — Prazo para Calendar
  // ============================================================
  function abrirModalPrazoCalendar() {
    const html = `
      <div id="modal-cal-prazo" style="position:fixed;inset:0;background:rgba(0,0,0,.76);
        backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center">
        <div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;
          padding:26px;width:480px;max-width:95vw">
          <div style="font-family:'Playfair Display',serif;font-size:17px;margin-bottom:18px">
            ⚠️ Criar Prazo Fatal no Calendar
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px">
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Tipo *</label>
              <input id="cpz_tipo" type="text" placeholder="Contestação, Recurso..." style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Cliente *</label>
              <input id="cpz_cliente" type="text" placeholder="Nome do cliente" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Processo *</label>
              <input id="cpz_proc" type="text" placeholder="Nº do processo" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Data *</label>
              <input id="cpz_data" type="date" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Vara</label>
              <input id="cpz_vara" type="text" placeholder="2ª Vara Cível" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Advogado</label>
              <input id="cpz_adv" type="text" placeholder="Dr. Carlos Lima" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
          </div>
          <div style="display:flex;gap:9px;justify-content:flex-end">
            <button onclick="document.getElementById('modal-cal-prazo').remove()"
              style="padding:8px 15px;border-radius:9px;background:transparent;border:1px solid var(--border2);color:var(--text2);cursor:pointer;font-size:13px">Cancelar</button>
            <button onclick="LexAT._enviarPrazoCalendar()"
              style="padding:8px 15px;border-radius:9px;background:var(--gold);color:#0a0c10;border:none;cursor:pointer;font-weight:600;font-size:13px">
              📅 Criar no Calendar
            </button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function abrirModalAudienciaCalendar() {
    const html = `
      <div id="modal-cal-aud" style="position:fixed;inset:0;background:rgba(0,0,0,.76);
        backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center">
        <div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;
          padding:26px;width:480px;max-width:95vw">
          <div style="font-family:'Playfair Display',serif;font-size:17px;margin-bottom:18px">
            🎙️ Criar Audiência no Calendar
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:11px">
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Tipo *</label>
              <select id="cau_tipo" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px">
                <option>Instrução</option><option>Conciliação</option><option>Julgamento</option><option>Depoimento</option><option>Perícia</option>
              </select></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Cliente *</label>
              <input id="cau_cliente" type="text" placeholder="Nome do cliente" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Data *</label>
              <input id="cau_data" type="date" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Horário *</label>
              <input id="cau_hora" type="time" value="09:00" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Vara / Local *</label>
              <input id="cau_vara" type="text" placeholder="2ª Vara Civil" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
            <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">Processo</label>
              <input id="cau_proc" type="text" placeholder="Nº do processo" style="width:100%;padding:8px 11px;border-radius:9px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:13px"></div>
          </div>
          <div style="display:flex;gap:9px;justify-content:flex-end">
            <button onclick="document.getElementById('modal-cal-aud').remove()"
              style="padding:8px 15px;border-radius:9px;background:transparent;border:1px solid var(--border2);color:var(--text2);cursor:pointer;font-size:13px">Cancelar</button>
            <button onclick="LexAT._enviarAudienciaCalendar()"
              style="padding:8px 15px;border-radius:9px;background:var(--blue);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:13px">
              📅 Criar no Calendar
            </button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ============================================================
  // 🌐  API PÚBLICA — window.LexAT
  // ============================================================
  window.LexAT = {
    CALENDAR, DRIVE, GMAIL, IA,

    salvarConfigs() {
      // Lê de todos os campos possíveis
      const key = (document.getElementById('lexat_anthropic_key')?.value ||
                   document.getElementById('claude_api_key_card')?.value || '').trim();
      const driveId = (document.getElementById('lexat_drive_id')?.value || '').trim();
      const proxy   = (document.getElementById('lex_proxy_datajud')?.value || '').trim();
      const modelo  = document.getElementById('lexat_modelo')?.value || 'claude-sonnet-4-20250514';

      if (key)     { CFG.ANTHROPIC_KEY = key; localStorage.setItem('lex_anthropic_key', key); }
      if (driveId) { CFG.DRIVE_FOLDER_CLIENTES_ID = driveId; localStorage.setItem('lex_drive_clientes_id', driveId); }
      if (proxy)   { localStorage.setItem('lex_datajud_proxy', proxy); }
      if (modelo)  { localStorage.setItem('lex_claude_modelo', modelo); }

      // Sincroniza todos os campos de API Key na página
      ['lexat_anthropic_key','claude_api_key_card'].forEach(id => {
        const el = document.getElementById(id); if (el && key) el.value = key;
      });
      // Atualiza badge Claude
      const badge = document.getElementById('badge-claude');
      if (badge && key) { badge.textContent = 'Ativo ✅'; badge.className = 'badge bteal'; }

      if (typeof window.toast === 'function') window.toast('✅ Configurações salvas!', 'green');
      const st = document.getElementById('lexat_status');
      if (st) st.innerHTML = '✅ Claude: ' + (key ? key.slice(0,15)+'...' : '❌ não configurado') +
        ' | Modelo: ' + modelo + ' | Proxy: ' + (proxy ? '✅' : '❌');
    },

    async testarIA() {
      const st = document.getElementById('lexat_status');
      if (!CFG.ANTHROPIC_KEY) {
        if (st) st.innerHTML = '❌ API Key não configurada — salve a chave primeiro';
        if (typeof window.toast === 'function') window.toast('⚠️ Cole a API Key Claude e clique Salvar', 'orange');
        return;
      }
      if (st) st.innerHTML = '🔍 Testando Claude API...';
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CFG.ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: localStorage.getItem('lex_claude_modelo') || 'claude-sonnet-4-20250514',
            max_tokens: 100,
            messages: [{ role: 'user', content: 'Responda apenas: Claude funcionando no LexOfficeAT!' }]
          })
        });
        const data = await resp.json();
        if (data.content && data.content[0]) {
          const msg = data.content[0].text || 'OK';
          if (st) st.innerHTML = '✅ Claude ativo! Modelo: ' + (data.model||'?') + ' — ' + msg;
          if (typeof window.toast === 'function') window.toast('✅ Claude funcionando!', 'green');
        } else if (data.error) {
          if (st) st.innerHTML = '❌ Erro Claude: ' + (data.error.message || JSON.stringify(data.error));
          if (typeof window.toast === 'function') window.toast('❌ ' + (data.error.message||'Erro Claude'), 'red');
        }
      } catch(e) {
        if (st) st.innerHTML = '❌ Erro de conexão: ' + e.message;
        if (typeof window.toast === 'function') window.toast('❌ Erro: ' + e.message, 'red');
      }
    },

    async testarCalendar() {
      await CALENDAR.criarReuniaoCliente({
        cliente: 'Teste LexOfficeAT',
        assunto: 'Teste de integração Calendar',
        data: new Date().toLocaleDateString('pt-BR'),
        hora: '10:00',
      });
    },

    async testarDrive() {
      await DRIVE.criarPastaCliente('_TESTE LexOfficeAT');
    },

    _enviarPrazoCalendar() {
      const data = {
        tipo: document.getElementById('cpz_tipo')?.value,
        cliente: document.getElementById('cpz_cliente')?.value,
        processo: document.getElementById('cpz_proc')?.value,
        data: (() => {
          const d = document.getElementById('cpz_data')?.value;
          if (!d) return '';
          const [y,m,day] = d.split('-');
          return `${day}/${m}/${y}`;
        })(),
        vara: document.getElementById('cpz_vara')?.value,
        advogado: document.getElementById('cpz_adv')?.value,
      };
      if (!data.tipo || !data.cliente || !data.data) {
        toast('⚠️ Preencha os campos obrigatórios', 'gold'); return;
      }
      CALENDAR.criarPrazoFatal(data).then(() => {
        document.getElementById('modal-cal-prazo')?.remove();
      });
    },

    _enviarAudienciaCalendar() {
      const data = {
        tipo: document.getElementById('cau_tipo')?.value,
        cliente: document.getElementById('cau_cliente')?.value,
        vara: document.getElementById('cau_vara')?.value,
        data: (() => {
          const d = document.getElementById('cau_data')?.value;
          if (!d) return '';
          const [y,m,day] = d.split('-');
          return `${day}/${m}/${y}`;
        })(),
        hora: document.getElementById('cau_hora')?.value,
        processo: document.getElementById('cau_proc')?.value,
      };
      if (!data.cliente || !data.vara || !data.data) {
        toast('⚠️ Preencha os campos obrigatórios', 'gold'); return;
      }
      CALENDAR.criarAudiencia(data).then(() => {
        document.getElementById('modal-cal-aud')?.remove();
      });
    },

    // Integração com criarPrazoBtn existente no LexOffice
    integrarPrazoExistente() {
      const original = window.criarPrazoBtn;
      window.criarPrazoBtn = function () {
        if (original) original();
        const extr = EMAIL?._extracao;
        if (extr && extr.cnj) {
          CALENDAR.criarPrazoFatal({
            tipo: extr.tipo_mov || 'Prazo',
            cliente: extr.polo_cliente || '',
            processo: extr.cnj || '',
            data: extr.prazo_data || '',
            vara: extr.vara || '',
          });
        }
      };
    }
  };

  // ============================================================
  // 🚀  INICIALIZAÇÃO
  // ============================================================
  function init() {
    // Injeta botões na UI após carregamento
    setTimeout(injetarBotoesUI, 800);

    // Reinjeta ao trocar de página
    const originalGo = window.go;
    window.go = function (page, el) {
      try { if (originalGo) originalGo(page, el);
      setTimeout(injetarBotoesUI, 300);
    };

    // Integra com criarPrazoBtn existente
    LexAT.integrarPrazoExistente();

    console.log('[LexOfficeAT Improvements v2.0] ✅ Carregado com sucesso.');
    console.log('Módulos ativos: CALENDAR · DRIVE · GMAIL · IA Jurídica');
    console.log('API pública: window.LexAT');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

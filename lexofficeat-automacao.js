/**
 * LexOfficeAT — Parser TRT9 Push + Automação Completa v2.0
 * Lê e-mails TRT9 Push diretamente do Gmail e:
 * 1. Extrai todos os dados (CNJ, vara, partes, eventos)
 * 2. Identifica nosso cliente (polo de Amilcar)
 * 3. Cria/atualiza processo no LexDB
 * 4. Cria cliente automaticamente (sem duplicatas)
 * 5. Cria prazos com tipo correto detectado
 * 6. Cria tarefas automáticas
 * 7. Agenda no Google Calendar
 * 8. Cria pasta no Drive
 * 9. Atualiza dashboard em tempo real
 */
(function() {
  'use strict';

  // ── Utilitários ────────────────────────────────────────────
  function normNome(n) {
    if (!n) return '';
    return n.toUpperCase().replace(/\./g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim();
  }

  function log(msg) {
    console.log('[LexAuto] ' + msg);
    var el = document.getElementById('lexAutoLog');
    if (!el) return;
    var d = document.createElement('div');
    d.style.cssText = 'font-size:11px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)';
    d.style.color = msg.includes('OK')||msg.includes('✅') ? 'var(--green)' :
                    msg.includes('❌') ? 'var(--red)' : 'var(--text2)';
    d.textContent = '['+new Date().toLocaleTimeString('pt-BR')+'] '+msg;
    el.insertBefore(d, el.firstChild);
    if (el.children.length > 60) el.removeChild(el.lastChild);
  }

  function db() { return typeof LexSync !== 'undefined' && LexSync.DB ? LexSync.DB : null; }

  // ── Parser TRT9 Push ───────────────────────────────────────
  function parseTRT9Push(html, emailId) {
    // Remove tags HTML
    var txt = html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
    txt = txt.replace(/\s+/g, ' ').trim();

    function campo(label) {
      var m = txt.match(new RegExp(label + '[:\\s]+([^\\n<>]+?)(?=\\s*(?:Classe|Órgão|Data de|Autor:|Advogados?|Réu:|Eventos|Para acessar|Caso não|ATENÇÃO|$))', 'i'));
      return m ? m[1].trim() : '';
    }

    var cnj      = campo('Número do Processo');
    var classe   = campo('Classe Judicial');
    var vara     = campo('Órgão Julgador');
    var autuacao = (campo('Data de Autuação')||'').split(' ')[0];
    var autor    = campo('Autor');
    var reu      = campo('Réu');

    // Advogados (podem ter múltiplos)
    var advAutorM = txt.match(/Advogados? do Autor[:\s]+([\s\S]*?)(?=Réu:|Advogados? do Réu:|Eventos:|Para acessar|$)/i);
    var advReuM   = txt.match(/Advogados? do Réu[:\s]+([\s\S]*?)(?=Eventos:|Para acessar|$)/i);
    var advAutor  = advAutorM ? advAutorM[1].replace(/\s+/g,' ').trim() : '';
    var advReu    = advReuM   ? advReuM[1].replace(/\s+/g,' ').trim()   : '';

    // Limpa advReu — remove texto após "Para acessar"
    advReu = advReu.split('Para acessar')[0].split('Caso não')[0].trim();
    advAutor = advAutor.split('Réu:')[0].split('Para acessar')[0].trim();

    // Amilcar representa quem?
    var amNoReu  = /AMILCAR/i.test(advReu)  || /21856/.test(advReu);
    var amNoAut  = /AMILCAR/i.test(advAutor) || /21856/.test(advAutor);

    var nossoCliente, adverso, polo, advAdverso;
    if (amNoReu) {
      nossoCliente = reu; adverso = autor; polo = 'RÉU'; advAdverso = advAutor;
    } else if (amNoAut) {
      nossoCliente = autor; adverso = reu; polo = 'AUTOR'; advAdverso = advReu;
    } else {
      // Fallback: polo passivo geralmente é empresa
      var reuEmpresa = /LTDA|S\.A|EIRELI|TRANSPORTES|SERVICOS|LOGISTICA|SEGUROS/.test((reu||'').toUpperCase());
      if (reuEmpresa) { nossoCliente = reu; adverso = autor; polo = 'RÉU'; advAdverso = advAutor; }
      else            { nossoCliente = autor; adverso = reu; polo = 'AUTOR'; advAdverso = advReu; }
    }

    // Comarca extraída da vara
    var comarca = vara;
    var mComarca = vara.match(/VARA\s+DO\s+TRABALHO\s+DE\s+(.+)$/i);
    if (mComarca) comarca = mComarca[1].trim();
    else {
      var mComarca2 = vara.match(/VARA\s+DO\s+TRABALHO\s+DE\s+(.+)$/i);
      if (mComarca2) comarca = mComarca2[1].trim();
    }

    // Eventos — extrai da tabela HTML
    var eventos = [];
    var evMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (evMatch) {
      var rows = evMatch[1].match(/<tr>([\s\S]*?)<\/tr>/gi) || [];
      rows.forEach(function(row) {
        var cells = row.match(/<td>([\s\S]*?)<\/td>/gi) || [];
        if (cells.length >= 2) {
          var dataEv = cells[0].replace(/<[^>]+>/g,'').trim();
          var descEv = cells[1].replace(/<[^>]+>/g,'').trim();
          if (dataEv && descEv && dataEv !== 'Data' && descEv !== 'Evento') {
            eventos.push({ data: dataEv.split(' ')[0], descricao: descEv });
          }
        }
      });
    }

    // Prazo detectado nos eventos
    var prazo = 5;
    var tipoPrazo = 'Manifestação';
    eventos.forEach(function(ev) {
      var d = ev.descricao.toUpperCase();
      if (/CONTEST|DEFESA/.test(d))           { prazo = 15; tipoPrazo = 'Contestação'; }
      else if (/RECURSO\s+ORDIN/.test(d))     { prazo = 8;  tipoPrazo = 'Recurso Ordinário'; }
      else if (/AGRAVO/.test(d))              { prazo = 15; tipoPrazo = 'Agravo'; }
      else if (/EMBARGOS\s+DECL/.test(d))    { prazo = 5;  tipoPrazo = 'Embargos de Declaração'; }
      else if (/IMPUGNA/.test(d))            { prazo = 15; tipoPrazo = 'Impugnação'; }
      else if (/DECORRIDO.*PRAZO/.test(d))   { prazo = 5;  tipoPrazo = 'Manifestação'; }
      else if (/INTIMAÇÃO|INTIMA/.test(d))   { prazo = 5;  tipoPrazo = 'Manifestação'; }
    });

    return {
      cnj:          cnj,
      tipo_acao:    classe || 'AÇÃO TRABALHISTA',
      vara:         vara,
      comarca:      comarca,
      tribunal:     'TRT 9ª Região (PR/MS)',
      instancia:    '1º Grau',
      data_autuacao:autuacao,
      autor:        autor,
      reu:          reu,
      adv_autor:    advAutor,
      adv_reu:      advReu,
      nosso_cliente:nossoCliente,
      adverso:      adverso,
      polo:         polo,
      adv_adverso:  advAdverso,
      eventos:      eventos,
      prazo_dias:   prazo,
      tipo_prazo:   tipoPrazo,
      email_id:     emailId,
      fonte:        'trt9_push',
    };
  }

  // ── Parser Jusbrasil ───────────────────────────────────────
  function parseJusbrasil(corpo, emailId) {
    var blocos = corpo.split(/(?=Processo \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    var resultado = [];
    var vistos = {};

    blocos.forEach(function(bloco) {
      var cnjM = bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if (!cnjM || vistos[cnjM[1]]) return;
      vistos[cnjM[1]] = true;
      var cnj = cnjM[1];

      var varaM  = bloco.match(/Publicação\s+([^\n]{5,80}?)\s*NÚMERO ÚNICO/i);
      var paM    = bloco.match(/POLO ATIVO\s+([\s\S]*?)(?=POLO PASSIVO|ADVOGADO|DATA DE)/i);
      var ppM    = bloco.match(/POLO PASSIVO\s+([\s\S]*?)(?=ADVOGADO|DATA DE)/i);
      var movM   = bloco.match(/(?:INTIMAÇÃO|DESPACHO|Vista à parte|Intime-se)[^\n]{5,200}/i);
      var dataM  = bloco.match(/DATA DE DISPONIBILIZAÇÃO[:\s]+(\d{4}-\d{2}-\d{2})/i);
      var prazoM = bloco.match(/[Pp]razo\s+(?:de\s+)?(\d+)\s+dia/);

      var paRaw = paM ? paM[1].replace(/\s+/g,' ').trim() : '';
      var ppRaw = ppM ? ppM[1].replace(/\s+/g,' ').trim() : '';

      var amPassivo = /AMIL[CÁ]CAR/i.test(ppRaw);
      var amAtivo   = /AMIL[CÁ]CAR/i.test(paRaw);

      var nossoCliente, adverso, polo, advAdverso;
      if (amPassivo) {
        nossoCliente = ppRaw.replace(/AMIL[CÁ]CAR CORDEIRO TEIXEIRA FILHO/gi,'').replace(/\s+/g,' ').trim();
        adverso = paRaw; polo = 'RÉU'; advAdverso = '';
      } else if (amAtivo) {
        nossoCliente = paRaw.replace(/AMIL[CÁ]CAR CORDEIRO TEIXEIRA FILHO/gi,'').replace(/\s+/g,' ').trim();
        adverso = ppRaw; polo = 'AUTOR'; advAdverso = '';
      } else {
        // Usa intimados para inferir
        var intimM = bloco.match(/Intimado\(s\)[^-]*-\s*([\s\S]+?)(?=Analisar|Processo \d|$)/i);
        var intimados = intimM ? intimM[1].replace(/\s+/g,' ').trim() : '';
        var ppEmpresa = /LTDA|S\.A|EIRELI|TRANSPORTES/.test(ppRaw.toUpperCase());
        var intimPassivo = ppEmpresa && (!intimados || intimados.toUpperCase().includes(ppRaw.slice(0,10).toUpperCase()));
        if (intimPassivo) { nossoCliente = ppRaw; adverso = paRaw; polo = 'RÉU'; advAdverso = ''; }
        else              { nossoCliente = paRaw; adverso = ppRaw; polo = 'AUTOR'; advAdverso = ''; }
      }

      resultado.push({
        cnj:           cnj,
        tipo_acao:     'AÇÃO TRABALHISTA',
        vara:          varaM ? varaM[1].trim() : '',
        comarca:       '',
        tribunal:      /5\.09/.test(cnj) ? 'TRT 9ª Região' : 'TJPR',
        instancia:     '1º Grau',
        nosso_cliente: nossoCliente.slice(0,80),
        adverso:       adverso.slice(0,80),
        polo:          polo,
        adv_adverso:   advAdverso,
        eventos:       movM ? [{data: dataM?dataM[1].split('-').reverse().join('/'):new Date().toLocaleDateString('pt-BR'), descricao: movM[0].trim()}] : [],
        prazo_dias:    prazoM ? parseInt(prazoM[1]) : 5,
        tipo_prazo:    'Manifestação',
        email_id:      emailId,
        fonte:         'jusbrasil',
      });
    });
    return resultado;
  }

  // ── Cria/Atualiza Cliente ──────────────────────────────────
  function upsertCliente(nome) {
    var d = db(); if (!d || !nome || nome.length < 3) return null;
    var nNorm = normNome(nome);
    var lista = d.getAll(d.KEYS.clientes) || [];
    var ex = lista.find(function(c) {
      return normNome(c.nome) === nNorm || normNome(c.razaoSocial||'') === nNorm;
    });
    if (ex) return ex;
    var isPJ = /LTDA|S\.A|EIRELI|\bME\b|\bEPP\b|TRANSPORTES|LOGISTICA|SERVICOS|BANCO|SEGUROS|IND\.|COM\./.test(nNorm);
    var cli = {
      id: d.newId('cli'), nome: nome, tipo: isPJ?'PJ':'PF',
      status:'ativo', origem:'automatico',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    d.add(d.KEYS.clientes, cli);
    log('👤 Cliente: ' + nome);
    return cli;
  }

  // ── Cria/Atualiza Processo ─────────────────────────────────
  function upsertProcesso(proc) {
    var d = db(); if (!d || !proc.cnj) return null;
    var cnjLimpo = proc.cnj.replace(/[.\-]/g,'');

    // Verifica se já existe
    var todos = d.getAll(d.KEYS.processos) || [];
    var ex = todos.find(function(p){ return p.cnj && p.cnj.replace(/[.\-]/g,'')===cnjLimpo; });

    // Verifica no XLS2_DATA
    var noXLS = typeof XLS2_DATA !== 'undefined' &&
      XLS2_DATA.some(function(r){ return (r[2]||'').replace(/[.\-]/g,'')===cnjLimpo; });

    if (noXLS || ex) {
      // Só atualiza movimentos
      var alvo = ex || { movimentos:[] };
      if (proc.eventos && proc.eventos.length) {
        var movs = alvo.movimentos || [];
        proc.eventos.forEach(function(ev){
          if (!movs.some(function(m){ return m.descricao===ev.descricao; })) {
            movs.unshift({ data:ev.data, descricao:ev.descricao });
          }
        });
        if (ex) d.update(d.KEYS.processos, ex.id, {movimentos:movs.slice(0,20), updatedAt:new Date().toISOString()});
      }
      if (proc.eventos && proc.eventos.length) {
        criarPrazo(proc);
        criarTarefa(proc);
      }
      log('🔄 Atualizado: ' + proc.cnj);
      return ex;
    }

    // Gera ficha
    var maxN = 0;
    if (typeof XLS2_DATA !== 'undefined') XLS2_DATA.forEach(function(r){ var n=parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxN)maxN=n; });
    todos.forEach(function(p){ var n=parseInt((p.ficha||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxN)maxN=n; });
    var ficha = 'A'+String(maxN+1).padStart(4,'0');

    // Cria cliente
    var cli = upsertCliente(proc.nosso_cliente);

    // Cria processo
    var novo = {
      id:              d.newId('proc'),
      ficha:           ficha,
      cnj:             proc.cnj,
      tipo_acao:       proc.tipo_acao || 'AÇÃO TRABALHISTA',
      vara:            proc.vara || '',
      comarca:         proc.comarca || '',
      tribunal:        proc.tribunal || 'TRT 9ª Região',
      instancia:       proc.instancia || '1º Grau',
      status:          'ativo',
      polo_cliente:    proc.nosso_cliente || '',
      polo_processual: proc.polo || 'RÉU',
      ex_adverso:      proc.adverso || '',
      adv_adverso:     proc.adv_adverso || '',
      adv_cliente:     proc.polo==='RÉU' ? proc.adv_reu||'' : proc.adv_autor||'',
      cliente_id:      cli ? cli.id : null,
      fonte_criacao:   proc.fonte || 'email',
      movimentos:      (proc.eventos||[]).map(function(ev){ return {data:ev.data,descricao:ev.descricao}; }),
      ultima_mov:      proc.eventos&&proc.eventos.length ? proc.eventos[0].descricao : '',
      data_autuacao:   proc.data_autuacao || '',
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };
    d.add(d.KEYS.processos, novo);
    log('✅ Processo: '+ficha+' — '+proc.nosso_cliente);

    // Prazo + Tarefa + Drive
    criarPrazo(proc, ficha);
    criarTarefa(proc, ficha);
    criarDrive(proc, ficha);

    return novo;
  }

  // ── Prazo ──────────────────────────────────────────────────
  function criarPrazo(proc, ficha) {
    var d = db(); if (!d) return;
    var venc = new Date();
    venc.setDate(venc.getDate() + (proc.prazo_dias||5));
    var vencBR  = venc.toLocaleDateString('pt-BR');
    var vencISO = venc.toISOString().slice(0,10);
    var prazos  = d.getAll(d.KEYS.prazos) || [];
    if (prazos.some(function(p){ return p.cnj===proc.cnj && p.vencimentoISO===vencISO; })) return;
    var pr = {
      id:             d.newId('prazo'),
      cnj:            proc.cnj,
      ficha:          ficha || '',
      cliente:        proc.nosso_cliente || '',
      tipo:           (proc.tipo_prazo||'Manifestação') + ' — ' + (proc.prazo_dias||5) + ' dias',
      fundamento:     (proc.eventos&&proc.eventos[0] ? proc.eventos[0].descricao.slice(0,80) : 'Prazo automático'),
      urgencia:       (proc.prazo_dias||5) <= 3 ? 'alta' : 'media',
      dias:           proc.prazo_dias || 5,
      vencimento:     vencBR,
      vencimentoISO:  vencISO,
      vara:           proc.vara || '',
      status:         'pendente',
      createdAt:      new Date().toISOString(),
    };
    d.add(d.KEYS.prazos, pr);
    log('⏰ Prazo: '+(proc.tipo_prazo||'Manifestação')+' '+(proc.prazo_dias||5)+'d — '+vencBR);
    // Calendar
    try {
      if (typeof LexAT!=='undefined' && LexAT.CALENDAR && proc.nosso_cliente) {
        LexAT.CALENDAR.criarPrazoFatal({
          tipo: proc.tipo_prazo||'Manifestação', cliente: proc.nosso_cliente,
          processo: proc.cnj, data: vencBR, vara: proc.vara||'',
          advogado: 'Dr. Amilcar Cordeiro Teixeira Filho',
        }).catch(function(){});
      }
    } catch(e){}
  }

  // ── Tarefa ─────────────────────────────────────────────────
  function criarTarefa(proc, ficha) {
    var d = db(); if (!d) return;
    var tipo = 'Analisar publicação';
    var ev0  = proc.eventos && proc.eventos[0] ? proc.eventos[0].descricao.toUpperCase() : '';
    if (/CONTEST|DEFESA/.test(ev0))      tipo = 'Preparar contestação';
    else if (/RECURSO/.test(ev0))        tipo = 'Interpor Recurso';
    else if (/AUDIENCIA/.test(ev0))      tipo = 'Preparar audiência';
    else if (/SENTENCA|JULGAMENTO/.test(ev0)) tipo = 'Analisar decisão';
    else if (/DECORRIDO.*PRAZO/.test(ev0))    tipo = 'Verificar prazo decorrido';
    var venc = new Date(); venc.setDate(venc.getDate()+3);
    var tarefas = d.getAll(d.KEYS.tarefas||'lexat_tarefas') || [];
    if (tarefas.some(function(t){ return t.cnj===proc.cnj && t.tipo===tipo; })) return;
    d.add(d.KEYS.tarefas||'lexat_tarefas', {
      id: d.newId('tar'), cnj: proc.cnj, ficha: ficha||'',
      cliente: proc.nosso_cliente||'', tipo: tipo,
      descricao: ev0.slice(0,150),
      prioridade: 'alta', status: 'pendente',
      vencimento: venc.toLocaleDateString('pt-BR'),
      vencimentoISO: venc.toISOString().slice(0,10),
      createdAt: new Date().toISOString(),
    });
    log('📋 Tarefa: '+tipo);
  }

  // ── Drive ──────────────────────────────────────────────────
  function criarDrive(proc, ficha) {
    try {
      if (typeof LexAT !== 'undefined' && LexAT.DRIVE && proc.nosso_cliente) {
        var nome = ((ficha||proc.cnj)+' — '+proc.nosso_cliente+(proc.adverso?' vs '+proc.adverso:'')).slice(0,100);
        LexAT.DRIVE.criarPastaCliente(nome).catch(function(){});
      }
    } catch(e){}
  }

  // ── Processa e-mail ────────────────────────────────────────
  function processarEmail(msg) {
    if (!msg) return;
    var html    = msg.htmlBody || msg.corpo || '';
    var assunto = msg.subject  || msg.assunto || '';
    var de      = msg.sender   || msg.de || '';
    var id      = msg.id       || msg.messageId || ('email_'+Date.now());

    // TRT9 Push
    if (/trt9\.jus\.br/i.test(de) && /PUSH/i.test(assunto)) {
      var proc = parseTRT9Push(html, id);
      if (proc && proc.cnj) {
        log('📧 TRT9 Push: ' + proc.cnj);
        upsertProcesso(proc);
        return proc;
      }
    }

    // Jusbrasil / Impacta
    if (/jusbrasil|impacta/i.test(de) || /impacta|jusbrasil/i.test(assunto)) {
      var texto = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      var procs = parseJusbrasil(texto, id);
      procs.forEach(function(p){ if (p.cnj) upsertProcesso(p); });
      if (procs.length) log('📧 Jusbrasil: '+procs.length+' processos');
      return procs;
    }
  }

  // ── Importação automática via Gmail ───────────────────────
  function importarGmail() {
    var token = localStorage.getItem('lex_gmail_auth');
    if (!token) { log('⚠️ Gmail não conectado'); return Promise.resolve([]); }
    var query = 'from:nao-responda@trt9.jus.br OR from:publicacoes-diarios@jusbrasil.com.br OR from:publicacoes@impacta.adv.br newer_than:7d';
    return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q='+encodeURIComponent(query)+'&maxResults=50', {
      headers: { Authorization: 'Bearer '+token }
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      var msgs = (data.messages||[]);
      log('📬 '+msgs.length+' e-mails encontrados');
      var promises = msgs.map(function(m, i){
        return new Promise(function(resolve){
          setTimeout(function(){
            fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+m.id+'?format=full', {
              headers: { Authorization: 'Bearer '+token }
            })
            .then(function(r){ return r.json(); })
            .then(function(msg){
              var html = '';
              var parts = msg.payload && msg.payload.parts || [];
              if (parts.length) {
                parts.forEach(function(p){
                  if (p.mimeType==='text/html' && p.body && p.body.data) {
                    html += atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/'));
                  }
                });
              } else if (msg.payload && msg.payload.body && msg.payload.body.data) {
                html = atob(msg.payload.body.data.replace(/-/g,'+').replace(/_/g,'/'));
              }
              var headers = msg.payload && msg.payload.headers || [];
              var de = (headers.find(function(h){return h.name==='From';})||{}).value||'';
              var assunto = (headers.find(function(h){return h.name==='Subject';})||{}).value||'';
              processarEmail({ id: m.id, htmlBody: html, sender: de, subject: assunto });
              resolve(m.id);
            }).catch(function(){ resolve(null); });
          }, i * 300);
        });
      });
      return Promise.all(promises);
    })
    .then(function(ids){
      log('✅ Importação concluída: '+ids.filter(Boolean).length+' e-mails');
      atualizarDashboard();
      return ids;
    })
    .catch(function(e){ log('❌ Erro Gmail: '+e.message); return []; });
  }

  // ── Dashboard ──────────────────────────────────────────────
  function atualizarDashboard() {
    var d = db(); if (!d) return;
    var procs   = d.getAll(d.KEYS.processos)||[];
    var prazos  = (d.getAll(d.KEYS.prazos)||[]).filter(function(p){return p.status==='pendente';});
    var pubs    = d.getAll(d.KEYS.publicacoes)||[];
    var clis    = d.getAll(d.KEYS.clientes)||[];
    var hoje    = new Date();
    var urgentes= prazos.filter(function(p){
      var v = new Date(p.vencimentoISO||(p.vencimento||'').split('/').reverse().join('-'));
      return Math.ceil((v-hoje)/86400000) <= 5;
    });
    var up = function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};
    up('kProcessosDB', procs.length);
    up('kClientesDB',  clis.length);
    up('kPrazosDB',    prazos.length);
    up('kPrazosUrg',   urgentes.length);
    up('kPublicacoesDB', pubs.length);
    var sbP = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sbP && urgentes.length) sbP.textContent = urgentes.length;
    if (typeof renderPrazosDash === 'function') renderPrazosDash();
  }

  // ── API pública ────────────────────────────────────────────
  window.lexParseTRT9Push   = parseTRT9Push;
  window.lexParseJusbrasil  = parseJusbrasil;
  window.lexUpsertProcesso  = upsertProcesso;
  window.lexImportarGmail   = importarGmail;
  window.lexAtualizarDash   = atualizarDashboard;

  // Botão "Importar" na tela de publicações chama importarGmail()
  var origImportar = window.importarEmailsGmail;
  window.importarEmailsGmail = function() {
    if (origImportar) origImportar();
    importarGmail();
  };

  // ── Init ───────────────────────────────────────────────────
  function init() {
    // Hook no AutoFill do LexSync
    if (typeof LexSync !== 'undefined' && LexSync.AutoFill && !LexSync.AutoFill._v2) {
      LexSync.AutoFill._v2 = true;
      var orig = LexSync.AutoFill.processarPublicacao.bind(LexSync.AutoFill);
      LexSync.AutoFill.processarPublicacao = function(parsed) {
        var r = orig(parsed) || {novos:[],atualizados:[],erros:[]};
        if (parsed && parsed.processos) {
          parsed.processos.forEach(function(p, i){
            setTimeout(function(){ upsertProcesso(p); }, i*400);
          });
          setTimeout(atualizarDashboard, 3000);
        }
        return r;
      };
    }
    atualizarDashboard();
    setInterval(atualizarDashboard, 30000);
    log('✅ LexAuto v2.0 pronto — TRT9 Push + Jusbrasil + Impacta');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 2500); });
  } else {
    setTimeout(init, 2500);
  }
})();

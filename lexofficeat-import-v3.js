/**
 * LexOfficeAT — Importação Completa v3.0
 * Parsers: TRT9 Push + Jusbrasil + Impacta (.docx)
 * Token OAuth persistente — sem re-login
 * Auto-popula processos, clientes, prazos, tarefas, Drive
 */
(function() {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  var CLIENT_ID = '904302581754-4mkkf03s97j54ijh1f53f7srsquo20h2.apps.googleusercontent.com';
  var SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive',
  ].join(' ');
  var PASTA_CLIENTES = localStorage.getItem('lex_drive_clientes_id') || '1xoBLeDu6LKNHHJO-q2pNU0WwxdrLJsnt';

  // ── Token persistente ─────────────────────────────────────
  function getToken() { return localStorage.getItem('lex_gmail_auth'); }

  function salvarToken(token, expiresIn) {
    localStorage.setItem('lex_gmail_auth', token);
    if (expiresIn) {
      var exp = Date.now() + (expiresIn - 60) * 1000;
      localStorage.setItem('lex_token_exp', String(exp));
    }
  }

  function tokenValido() {
    var token = getToken();
    if (!token) return false;
    var exp = parseInt(localStorage.getItem('lex_token_exp') || '0');
    if (!exp) return true; // sem expiração definida = assume válido
    return Date.now() < exp;
  }

  // Tenta renovar token usando refresh token implícito
  // (OAuth implicit flow — não tem refresh token, então re-autentica silenciosamente)
  function garantirToken() {
    return new Promise(function(resolve, reject) {
      if (tokenValido()) { resolve(getToken()); return; }

      // Tenta renovação silenciosa via iframe
      var url = 'https://accounts.google.com/o/oauth2/auth'
        + '?client_id=' + CLIENT_ID
        + '&redirect_uri=' + encodeURIComponent(window.location.origin + window.location.pathname)
        + '&response_type=token'
        + '&scope=' + encodeURIComponent(SCOPES)
        + '&prompt=none'
        + '&access_type=online';

      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      iframe.onload = function() {
        try {
          var hash = iframe.contentWindow.location.hash;
          var m = hash.match(/access_token=([^&]+)/);
          var expM = hash.match(/expires_in=(\d+)/);
          if (m) {
            salvarToken(m[1], expM ? parseInt(expM[1]) : 3600);
            resolve(m[1]);
          } else {
            reject(new Error('Renovação silenciosa falhou'));
          }
        } catch(e) {
          reject(new Error('Sem acesso ao iframe: ' + e.message));
        } finally {
          document.body.removeChild(iframe);
        }
      };
      iframe.onerror = function() {
        document.body.removeChild(iframe);
        reject(new Error('Erro no iframe'));
      };
      document.body.appendChild(iframe);
      setTimeout(function() {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        reject(new Error('Timeout renovação'));
      }, 5000);
    });
  }

  // ── Utilitários ───────────────────────────────────────────
  function log(msg, tipo) {
    console.log('[LexImport] ' + msg);
    var el = document.getElementById('lexImportLog') || document.getElementById('lexAutoLog');
    if (!el) return;
    var d = document.createElement('div');
    d.style.cssText = 'font-size:11px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)';
    d.style.color = tipo==='ok'?'#4ade98':tipo==='err'?'#f07878':tipo==='warn'?'#fbb040':'#c0c8d8';
    d.textContent = '['+new Date().toLocaleTimeString('pt-BR')+'] '+msg;
    el.insertBefore(d, el.firstChild);
    if (el.children.length > 80) el.removeChild(el.lastChild);
  }

  function db() { return typeof LexSync!=='undefined'&&LexSync.DB?LexSync.DB:null; }

  function normNome(n) {
    return (n||'').toUpperCase().replace(/[.\-]/g,' ').replace(/\s+/g,' ').trim();
  }

  // ── Cálculo de prazo por tipo e tribunal ──────────────────
  function calcPrazo(texto, cnj) {
    var t = (texto||'').toLowerCase();
    var isTrab = /\.5\.\d{2}\./.test(cnj||'');
    var isFed  = /\.4\.\d{2}\./.test(cnj||'');
    if (/embargos?\s+decl/i.test(t))           return {dias:5,  tipo:'Embargos de Declaração'};
    if (/contest|defesa/i.test(t))              return {dias:20, tipo:'Contestação'};
    if (/recurso\s+ordin|apelac/i.test(t))      return {dias:isTrab?8:15, tipo:isTrab?'Recurso Ordinário':'Apelação'};
    if (/agravo/i.test(t))                      return {dias:isTrab?8:15, tipo:'Agravo'};
    if (/impugna/i.test(t))                     return {dias:15, tipo:'Impugnação'};
    if (/sentenc|julgament/i.test(t))           return {dias:isTrab?8:15, tipo:isTrab?'Recurso Ordinário':'Apelação'};
    if (/intima|manifest|vista|prazo/i.test(t)) return {dias:5,  tipo:'Manifestação'};
    return {dias:5, tipo:'Manifestação'};
  }

  // ── Parser TRT9 Push ──────────────────────────────────────
  function parseTRT9Push(html, emailId) {
    var txt = html.replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ');

    function campo(label) {
      var m = txt.match(new RegExp(label+'[:\\s]+([^\\n]{2,80}?)(?=\\s*(?:Classe|Órgão|Data de|Autor:|Advogado|Réu:|Eventos|Para acessar|$))', 'i'));
      return m ? m[1].trim() : '';
    }

    var cnj      = campo('Número do Processo');
    var classe   = campo('Classe Judicial');
    var vara     = campo('Órgão Julgador');
    var autuacao = (campo('Data de Autuação')||'').split(' ')[0];
    var autor    = campo('Autor');
    var reu      = campo('Réu');

    var advAutM = txt.match(/Advogados? do Autor[:\s]+([\s\S]{0,300}?)(?=Réu:|Advogados? do Réu:|Eventos:|Para acessar)/i);
    var advReuM = txt.match(/Advogados? do Réu[:\s]+([\s\S]{0,300}?)(?=Eventos:|Para acessar|$)/i);
    var advAut  = advAutM ? advAutM[1].replace(/\s+/g,' ').trim() : '';
    var advReu  = advReuM ? advReuM[1].replace(/\s+/g,' ').trim().split('Para acessar')[0] : '';

    var amReu  = /AMILCAR/i.test(advReu)  || /21856/.test(advReu);
    var amAut  = /AMILCAR/i.test(advAut)  || /21856/.test(advAut);

    var nosso, adverso, polo, advAdv;
    if (amReu)       { nosso=reu;   adverso=autor; polo='RÉU';   advAdv=advAut; }
    else if (amAut)  { nosso=autor; adverso=reu;   polo='AUTOR'; advAdv=advReu; }
    else             { nosso=reu;   adverso=autor; polo='RÉU';   advAdv=advAut; }

    // Comarca da vara
    var comarca = vara;
    var mC = vara.match(/VARA\s+DO\s+TRABALHO\s+DE\s+(.+)$/i);
    if (mC) comarca = mC[1].trim();

    // Eventos
    var eventos = [];
    var rows = html.match(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi) || [];
    rows.forEach(function(row) {
      var cells = row.match(/<td[^>]*>([^<]+)<\/td>/gi) || [];
      if (cells.length >= 2) {
        var dt = cells[0].replace(/<[^>]+>/g,'').trim();
        var ev = cells[1].replace(/<[^>]+>/g,'').trim();
        if (dt && ev && dt !== 'Data' && ev !== 'Evento' && /\d{2}\/\d{2}\/\d{4}/.test(dt)) {
          eventos.push({ data: dt.split(' ')[0], descricao: ev });
        }
      }
    });

    var mov0 = eventos[0] ? eventos[0].descricao : '';
    var pr   = calcPrazo(mov0, cnj);

    return {
      cnj:cnj, tipo_acao:classe||'AÇÃO TRABALHISTA - RITO ORDINÁRIO',
      vara:vara, comarca:comarca, tribunal:'TRT 9ª Região (PR/MS)',
      instancia:'1º Grau', data_autuacao:autuacao,
      autor:autor, reu:reu, adv_aut:advAut, adv_reu:advReu,
      nosso_cliente:nosso, adverso:adverso, polo:polo, adv_adverso:advAdv,
      eventos:eventos, prazo_dias:pr.dias, tipo_prazo:pr.tipo,
      email_id:emailId, fonte:'trt9_push'
    };
  }

  // ── Parser Jusbrasil ──────────────────────────────────────
  function parseJusbrasil(corpo, emailId) {
    var blocos = corpo.split(/(?=Processo \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    var result = []; var vistos = {};
    blocos.forEach(function(bloco) {
      var cnjM = bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if (!cnjM||vistos[cnjM[1]]) return;
      vistos[cnjM[1]]=true;
      var cnj=cnjM[1];
      var varaM = bloco.match(/Publicação\s+([^\n]{5,80}?)\s*NÚMERO ÚNICO/i);
      var paM   = bloco.match(/POLO ATIVO\s+([\s\S]*?)(?=POLO PASSIVO|ADVOGADO|DATA DE)/i);
      var ppM   = bloco.match(/POLO PASSIVO\s+([\s\S]*?)(?=ADVOGADO|DATA DE)/i);
      var movM  = bloco.match(/(?:INTIMAÇÃO|DESPACHO|Vista à parte|Intime-se)[^\n]{5,200}/i);
      var dataM = bloco.match(/DATA DE DISPONIBILIZAÇÃO[:\s]+(\d{4}-\d{2}-\d{2})/i);
      var intM  = bloco.match(/Intimado\(s\)[^-]*-\s*([\s\S]+?)(?=Analisar|Processo \d|$)/i);
      var pa = paM?paM[1].replace(/\s+/g,' ').trim():'';
      var pp = ppM?ppM[1].replace(/\s+/g,' ').trim():'';
      var amP=/AMIL[CÁ]CAR/i.test(pp), amA=/AMIL[CÁ]CAR/i.test(pa);
      var nosso,adverso,polo;
      if(amP){ nosso=pp.replace(/AMIL[CÁ]CAR CORDEIRO TEIXEIRA FILHO/gi,'').replace(/\s+/g,' ').trim(); adverso=pa; polo='RÉU'; }
      else if(amA){ nosso=pa.replace(/AMIL[CÁ]CAR CORDEIRO TEIXEIRA FILHO/gi,'').replace(/\s+/g,' ').trim(); adverso=pp; polo='AUTOR'; }
      else {
        var ppEmp=/LTDA|S\.A|EIRELI|TRANSPORTES/.test(pp.toUpperCase());
        if(ppEmp){nosso=pp;adverso=pa;polo='RÉU';}else{nosso=pa;adverso=pp;polo='AUTOR';}
      }
      var mov=movM?movM[0]:'';
      var pr=calcPrazo(mov,cnj);
      result.push({
        cnj:cnj, tipo_acao:'AÇÃO TRABALHISTA',
        vara:varaM?varaM[1].trim():'', comarca:'', tribunal:/5\.09/.test(cnj)?'TRT 9ª Região':'TJPR',
        instancia:'1º Grau', nosso_cliente:nosso.slice(0,80), adverso:adverso.slice(0,80),
        polo:polo, adv_adverso:'',
        eventos:mov?[{data:dataM?dataM[1].split('-').reverse().join('/'):new Date().toLocaleDateString('pt-BR'),descricao:mov}]:[],
        prazo_dias:pr.dias, tipo_prazo:pr.tipo,
        email_id:emailId, fonte:'jusbrasil'
      });
    });
    return result;
  }

  // ── Parser Impacta (.docx via texto extraído) ─────────────
  function parseImpacta(texto, emailId) {
    // Texto extraído do .docx tem campos marcados
    var result = [];
    // Divide por blocos "Código:"
    var blocos = texto.split(/(?=Código[:\s]+\d{5,})/i);
    blocos.forEach(function(bloco) {
      if (!bloco.trim()) return;

      function campo(label) {
        var m = bloco.match(new RegExp(label+'[:\\s*]+([^\\n]{2,100})', 'i'));
        return m ? m[1].trim() : '';
      }

      // CNJ: pode estar em "Processo:" com formato sem pontuação
      var procRaw = campo('Processo');
      var cnj = '';
      if (procRaw) {
        var digits = procRaw.replace(/\D/g,'');
        // Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO (20 dígitos)
        if (digits.length === 20) {
          cnj = digits.slice(0,7)+'-'+digits.slice(7,9)+'.'+digits.slice(9,13)+'.'+digits.slice(13,14)+'.'+digits.slice(14,16)+'.'+digits.slice(16,20);
        }
      }
      // Tenta também pelo texto completo
      if (!cnj) {
        var cnjM = bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
        if (cnjM) cnj = cnjM[1];
      }
      if (!cnj) return;

      var dataPub   = campo('Publicação do dia') || campo('Data de disponibilização') || '';
      var vara      = campo('Detalhamento') || '';
      var diario    = campo('Diário') || '';
      var movimentacao = '';

      // Extrai o texto completo da publicação (após "Publicação:")
      var pubM = bloco.match(/Publicação[:\s]+([\s\S]{20,})/i);
      if (pubM) movimentacao = pubM[1].replace(/\s+/g,' ').trim().slice(0,500);
      else movimentacao = bloco.replace(/\s+/g,' ').trim().slice(0,500);

      // Identifica partes pelo texto
      var autorM   = movimentacao.match(/(?:AUTOR|REQUERENTE)[:\s]+([A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ\s\-\.]+?)(?:\s+ADV|ADVOGADO|\.|$)/i);
      var reuM     = movimentacao.match(/(?:RÉU|RÉUS|REQUERIDO)[:\s]+([A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ\s\-\.]+?)(?:\s+ADV|ADVOGADO|\.|$)/i);
      var advM     = movimentacao.match(/AMILCAR CORDEIRO TEIXEIRA FILHO[^\n]*/i);

      var autor  = autorM ? autorM[1].trim() : '';
      var reu    = reuM   ? reuM[1].trim()   : '';

      // Qual polo Amilcar defende
      var amAutor = /AUTOR.*AMILCAR|AMILCAR.*AUTOR/i.test(movimentacao);
      var nosso, adverso, polo;
      if (amAutor) { nosso=autor||''; adverso=reu||'';   polo='AUTOR'; }
      else         { nosso=reu||'';   adverso=autor||''; polo='RÉU';   }

      // Tribunal pelo diário e CNJ
      var tribunal = 'TJPR';
      if (/JF|FEDERAL|TRF/i.test(diario+vara))  tribunal = 'Justiça Federal';
      if (/TRT/i.test(diario+vara))              tribunal = 'TRT';
      if (/STJ/i.test(diario+vara))              tribunal = 'STJ';
      if (/\.(4|3|1|2|5)\.\d{2}\./.test(cnj)) {
        var seg = cnj.match(/\.(\d)\.\d{2}\./);
        if (seg) { var s=seg[1]; tribunal=s==='4'?'Justiça Federal (TRF4)':s==='5'?'TRT':s==='3'?'TRF3':tribunal; }
      }

      var pr = calcPrazo(movimentacao, cnj);

      result.push({
        cnj:cnj, tipo_acao:'PROCEDIMENTO COMUM CÍVEL',
        vara:vara.slice(0,60), comarca:'PONTA GROSSA',
        tribunal:tribunal, instancia:'1º Grau',
        data_autuacao:dataPub,
        nosso_cliente:nosso.slice(0,80), adverso:adverso.slice(0,80),
        polo:polo, adv_adverso:'',
        eventos:[{data:dataPub,descricao:movimentacao.slice(0,200)}],
        prazo_dias:pr.dias, tipo_prazo:pr.tipo,
        email_id:emailId, fonte:'impacta',
        movimentacao_completa: movimentacao
      });
    });
    return result;
  }

  // ── Lê anexo .docx do e-mail ──────────────────────────────
  function lerAnexoDocx(msgId, token) {
    return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+msgId+'?format=full', {
      headers:{Authorization:'Bearer '+token}
    }).then(function(r){return r.json();})
      .then(function(msg){
        var parts = [];
        function flatten(p) { if(p.parts)p.parts.forEach(flatten); else parts.push(p); }
        if (msg.payload) flatten(msg.payload);
        // Procura anexo .docx
        var docxPart = parts.find(function(p){
          return p.filename && /\.docx?$/i.test(p.filename) && p.body && p.body.attachmentId;
        });
        if (!docxPart) return null;
        return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+msgId+'/attachments/'+docxPart.body.attachmentId, {
          headers:{Authorization:'Bearer '+token}
        }).then(function(r){return r.json();})
          .then(function(att){
            if (!att.data) return null;
            // Decodifica base64
            var binary = atob(att.data.replace(/-/g,'+').replace(/_/g,'/'));
            // Extrai texto do docx (XML dentro do ZIP)
            // Usa uma abordagem simples: procura o XML de conteúdo
            var text = '';
            try {
              // Tenta extrair texto legível do binário
              // O docx é um ZIP com word/document.xml
              // Sem biblioteca ZIP, extraímos o texto diretamente
              for (var i=0;i<binary.length;i++) {
                var c = binary.charCodeAt(i);
                if (c >= 32 && c < 127) text += binary[i];
                else text += ' ';
              }
              // Remove tags XML
              text = text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
            } catch(e) {
              text = binary.replace(/[^\x20-\x7E\xC0-\xFF]/g,' ');
            }
            return { filename: docxPart.filename, text: text };
          });
      });
  }

  // ── Importa e-mail Impacta (com .docx) ───────────────────
  function processarImpacta(msg, token) {
    return lerAnexoDocx(msg.id, token).then(function(docx) {
      if (!docx) { log('⚠️ Impacta sem .docx: '+msg.id, 'warn'); return []; }
      var procs = parseImpacta(docx.text, msg.id);
      log('📎 Impacta: '+procs.length+' processos no .docx '+docx.filename, 'ok');
      // Salva o .docx no Drive também
      if (procs.length) {
        salvarDocxNoDrive(docx, procs[0], token);
      }
      return procs;
    }).catch(function(e){ log('❌ Impacta erro: '+e.message,'err'); return []; });
  }

  // Salva o .docx na pasta do Drive
  function salvarDocxNoDrive(docx, proc, token) {
    if (!proc || !proc.nosso_cliente) return;
    var nomePasta = proc.nosso_cliente.charAt(0).toUpperCase();
    // Por simplicidade, salva na pasta raiz de clientes com nome descritivo
    var nomeArq = (proc.data_autuacao||new Date().toLocaleDateString('pt-BR'))+' — Publicação Impacta — '+(proc.cnj||'').slice(0,20)+'.txt';
    // Cria arquivo de texto com o conteúdo
    var body = new Blob([docx.text], {type:'text/plain'});
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({
      name: nomeArq,
      mimeType: 'text/plain',
      parents: [PASTA_CLIENTES]
    })], {type:'application/json'}));
    form.append('file', body);
    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:'POST', headers:{Authorization:'Bearer '+token}, body:form
    }).then(function(){log('📁 Impacta salvo no Drive: '+nomeArq,'ok');}).catch(function(){});
  }

  // ── Upsert processo/cliente/prazo/tarefa ──────────────────
  function upsert(proc) {
    var d = db(); if (!d||!proc||!proc.cnj) return;
    var cnjKey = proc.cnj.replace(/[.\-]/g,'');

    // Verifica existência
    var todos = d.getAll(d.KEYS.processos)||[];
    var ex = todos.find(function(p){ return p.cnj&&p.cnj.replace(/[.\-]/g,'')=== cnjKey; });
    var noXLS = typeof XLS2_DATA!=='undefined' &&
      XLS2_DATA.some(function(r){ return (r[2]||'').replace(/[.\-]/g,'')=== cnjKey; });

    if (noXLS) {
      log('ℹ️ '+proc.cnj+' já no cadastro principal','');
      // Mesmo assim cria prazo se tiver movimentação nova
      if (proc.eventos&&proc.eventos.length) criarPrazo(proc, proc.cnj);
      return;
    }

    // Cliente
    var cliNorm = normNome(proc.nosso_cliente||'');
    var cliExist = d.getAll(d.KEYS.clientes)||[];
    var cli = cliExist.find(function(c){ return normNome(c.nome)===cliNorm; });
    if (!cli && proc.nosso_cliente && proc.nosso_cliente.length > 2) {
      var isPJ=/LTDA|S\.A|EIRELI|TRANSPORTES|SERVICOS|LOGISTICA|SEGUROS|BANCO|EIRELI/.test(cliNorm);
      cli = { id:d.newId('cli'), nome:proc.nosso_cliente, tipo:isPJ?'PJ':'PF',
              status:'ativo', origem:'publicacao', processos:[proc.cnj],
              createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
      d.add(d.KEYS.clientes, cli);
      log('👤 Cliente: '+proc.nosso_cliente,'ok');
    }

    if (ex) {
      // Atualiza movimentos
      var movs = ex.movimentos||[];
      (proc.eventos||[]).forEach(function(ev){
        if(!movs.some(function(m){return m.descricao===ev.descricao;})) movs.unshift(ev);
      });
      d.update(d.KEYS.processos,ex.id,{
        movimentos:movs.slice(0,30), ultima_mov:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao:ex.ultima_mov,
        updatedAt:new Date().toISOString(),
        // Completa campos que faltavam
        vara:ex.vara||proc.vara||'', tipo_acao:ex.tipo_acao||proc.tipo_acao||'',
        polo_cliente:ex.polo_cliente||proc.nosso_cliente||'',
        polo_processual:ex.polo_processual||proc.polo||'',
        ex_adverso:ex.ex_adverso||proc.adverso||'',
      });
      log('🔄 Atualizado: '+proc.cnj,'');
      criarPrazo(proc, ex.ficha||proc.cnj);
      criarTarefa(proc, ex.ficha||proc.cnj);
      return;
    }

    // Novo processo
    var maxN=0;
    if(typeof XLS2_DATA!=='undefined') XLS2_DATA.forEach(function(r){ var n=parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxN)maxN=n; });
    todos.forEach(function(p){ var n=parseInt((p.ficha||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxN)maxN=n; });
    maxN++;
    var ficha='A'+String(maxN).padStart(4,'0');

    d.add(d.KEYS.processos, {
      id:d.newId('proc'), ficha:ficha, cnj:proc.cnj,
      tipo_acao:proc.tipo_acao||'AÇÃO TRABALHISTA',
      vara:proc.vara||'', comarca:proc.comarca||'', tribunal:proc.tribunal||'',
      instancia:proc.instancia||'1º Grau', status:'ativo',
      polo_cliente:proc.nosso_cliente||'', polo_processual:proc.polo||'RÉU',
      ex_adverso:proc.adverso||'', adv_adverso:proc.adv_adverso||'',
      adv_cliente:'AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856',
      cliente_id:cli?cli.id:null, data_autuacao:proc.data_autuacao||'',
      fonte_criacao:proc.fonte||'email',
      movimentos:(proc.eventos||[]).map(function(ev){return{data:ev.data,descricao:ev.descricao};}),
      ultima_mov:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao:'',
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    });
    log('✅ Processo: '+ficha+' — '+proc.nosso_cliente,'ok');
    criarPrazo(proc, ficha);
    criarTarefa(proc, ficha);
    criarPastaCliente(proc, ficha, token_atual);

    // Salva publicação
    var pubsEx = d.getAll(d.KEYS.publicacoes)||[];
    if (!pubsEx.some(function(p){return p.cnj===proc.cnj&&p.fonte===proc.fonte;})) {
      d.add(d.KEYS.publicacoes, {
        id:d.newId('pub'), cnj:proc.cnj,
        nosso_cliente:proc.nosso_cliente||'', nosso_polo:proc.polo||'',
        adverso:proc.adverso||'', vara:proc.vara||'', tribunal:proc.tribunal||'',
        movimentacao:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao:'',
        data_pub:proc.data_autuacao||new Date().toLocaleDateString('pt-BR'),
        fonte:proc.fonte||'email', status:'pendente', email_id:proc.email_id||'',
        createdAt:new Date().toISOString()
      });
    }
  }

  var token_atual = null;

  function criarPrazo(proc, ficha) {
    var d=db();if(!d||proc.prazo_dias<=0)return;
    var venc=new Date();venc.setDate(venc.getDate()+proc.prazo_dias);
    var vencBR=venc.toLocaleDateString('pt-BR'), vencISO=venc.toISOString().slice(0,10);
    var ex=d.getAll(d.KEYS.prazos)||[];
    if(ex.some(function(p){return p.cnj===proc.cnj&&p.vencimentoISO===vencISO;}))return;
    var pr={id:d.newId('prazo'),cnj:proc.cnj,ficha:ficha||'',
      cliente:proc.nosso_cliente||'',tipo:proc.tipo_prazo+' — '+proc.prazo_dias+' dias',
      fundamento:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao.slice(0,100):'',
      urgencia:proc.prazo_dias<=3?'alta':'media',dias:proc.prazo_dias,
      vencimento:vencBR,vencimentoISO:vencISO,
      vara:proc.vara||'',tribunal:proc.tribunal||'',
      status:'pendente',createdAt:new Date().toISOString()};
    d.add(d.KEYS.prazos,pr);
    // Calendar
    if(token_atual){
      var ev={summary:proc.tipo_prazo+' — '+(proc.nosso_cliente||proc.cnj).slice(0,40),
        description:'CNJ: '+proc.cnj+'\nVara: '+proc.vara,
        start:{date:vencISO},end:{date:vencISO},colorId:proc.prazo_dias<=5?'11':'5',
        reminders:{useDefault:false,overrides:[{method:'popup',minutes:1440},{method:'popup',minutes:4320}]}};
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
        method:'POST',headers:{Authorization:'Bearer '+token_atual,'Content-Type':'application/json'},
        body:JSON.stringify(ev)}).then(function(r){return r.json();})
        .then(function(e){if(e.id)log('📅 Calendar: '+pr.tipo,'ok');}).catch(function(){});
    }
  }

  function criarTarefa(proc, ficha) {
    var d=db();if(!d)return;
    var mov0=proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao.toUpperCase():'';
    var tipo='Analisar publicação';
    if(/SENTENC|JULGAMENT/.test(mov0))     tipo='Analisar sentença';
    else if(/CONTEST|DEFESA/.test(mov0))   tipo='Preparar contestação';
    else if(/RECURSO/.test(mov0))          tipo='Interpor Recurso';
    else if(/AUDIENCIA/.test(mov0))        tipo='Preparar audiência';
    else if(/SUSPENSO|ACORDO/.test(mov0))  tipo='Acompanhar acordo';
    else if(/DECORRIDO.*PRAZO/.test(mov0)) tipo='Verificar prazo decorrido';
    else if(/INTIMA/.test(mov0))           tipo='Responder intimação';
    var tarKey=d.KEYS.tarefas||'lexat_tarefas';
    var ex2=d.getAll(tarKey)||[];
    if(ex2.some(function(t){return t.cnj===proc.cnj&&t.tipo===tipo;}))return;
    var venc=new Date();venc.setDate(venc.getDate()+3);
    d.add(tarKey,{id:d.newId('tar'),cnj:proc.cnj,ficha:ficha||'',
      cliente:proc.nosso_cliente||'',tipo:tipo,
      descricao:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao.slice(0,150):'',
      prioridade:'alta',status:'pendente',
      vencimento:venc.toLocaleDateString('pt-BR'),
      vencimentoISO:venc.toISOString().slice(0,10),
      createdAt:new Date().toISOString()});
  }

  function criarPastaCliente(proc, ficha, token) {
    if(!token||!proc.nosso_cliente)return;
    var letra=proc.nosso_cliente.charAt(0).toUpperCase();
    fetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent("'"+PASTA_CLIENTES+"' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false")+'&fields=files(id,name)&pageSize=500',
      {headers:{Authorization:'Bearer '+token}})
      .then(function(r){return r.json();})
      .then(function(data){
        var pastas=data.files||[];
        var norm=normNome(proc.nosso_cliente);
        var ex=pastas.find(function(p){return normNome(p.name.replace(/^[A-Z]\d+\s*[—\-]\s*/,''))===norm;});
        if(ex){log('📁 Pasta já existe: '+ex.name,'');return;}
        var count=pastas.filter(function(p){return p.name.charAt(0)===letra;}).length;
        var codigo=letra+String(count+1).padStart(4,'0');
        var nome=codigo+' — '+proc.nosso_cliente.slice(0,60);
        fetch('https://www.googleapis.com/drive/v3/files',{
          method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({name:nome,mimeType:'application/vnd.google-apps.folder',parents:[PASTA_CLIENTES]})
        }).then(function(r){return r.json();}).then(function(folder){
          if(!folder.id)return;
          ['📄 Petições','📋 Procurações','⚖️ Decisões','📧 Correspondências','📁 Documentos','📢 Publicações'].forEach(function(sub){
            fetch('https://www.googleapis.com/drive/v3/files',{
              method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
              body:JSON.stringify({name:sub,mimeType:'application/vnd.google-apps.folder',parents:[folder.id]})
            });
          });
          log('📁 Pasta criada: '+nome,'ok');
        });
      }).catch(function(){});
  }

  // ── Importação Gmail ──────────────────────────────────────
  window.lexImportarGmail = function() {
    garantirToken().then(function(tok){
      token_atual = tok;
      _importar(tok);
    }).catch(function(){
      var tok = getToken();
      if (tok) { token_atual=tok; _importar(tok); }
      else {
        if (typeof toast==='function') toast('Conecte o Gmail em Integrações','orange');
      }
    });
  };

  function _importar(token) {
    var query = [
      'from:nao-responda@trt9.jus.br subject:[PUSH]',
      'from:publicacoes-diarios@jusbrasil.com.br',
      'from:publicacoes@iprazos.adv.br',
    ].join(' OR ');

    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q='+encodeURIComponent(query)+'&maxResults=20',
      {headers:{Authorization:'Bearer '+token}})
      .then(function(r){return r.json();})
      .then(function(data){
        var msgs = data.messages||[];
        log('📬 '+msgs.length+' e-mails encontrados','ok');
        var i=0;
        function next(){
          if(i>=msgs.length){
            setTimeout(function(){
              if(typeof window.renderDashboardFull==='function')window.renderDashboardFull();
              if(typeof window.lexRenderPagina==='function'){
                ['processos','clientes','prazos','emails','dashboard'].forEach(function(pg){window.lexRenderPagina(pg);});
              }
            },500);
            log('✅ Importação concluída','ok');
            return;
          }
          var msgMeta=msgs[i]; i++;
          setTimeout(function(){
            fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+msgMeta.id+'?format=full',
              {headers:{Authorization:'Bearer '+token}})
              .then(function(r){return r.json();})
              .then(function(msg){
                var headers=msg.payload&&msg.payload.headers||[];
                var de=(headers.find(function(h){return h.name==='From';})||{}).value||'';
                var assunto=(headers.find(function(h){return h.name==='Subject';})||{}).value||'';
                var html='';
                var parts=[];
                function flat(p){if(p.parts)p.parts.forEach(flat);else parts.push(p);}
                if(msg.payload)flat(msg.payload);
                var htmlPart=parts.find(function(p){return p.mimeType==='text/html'&&p.body&&p.body.data;});
                var txtPart=parts.find(function(p){return p.mimeType==='text/plain'&&p.body&&p.body.data;});
                if(htmlPart)html=atob(htmlPart.body.data.replace(/-/g,'+').replace(/_/g,'/'));
                else if(txtPart)html=atob(txtPart.body.data.replace(/-/g,'+').replace(/_/g,'/'));

                var proms=[];
                if(/trt9\.jus\.br/i.test(de)&&/PUSH/i.test(assunto)){
                  var p=parseTRT9Push(html,msgMeta.id);
                  if(p&&p.cnj){log('TRT9 Push: '+p.cnj,'');upsert(p);}
                } else if(/jusbrasil/i.test(de)){
                  var corpo=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
                  var ps=parseJusbrasil(corpo,msgMeta.id);
                  ps.forEach(function(p){if(p.cnj)upsert(p);});
                  if(ps.length)log('Jusbrasil: '+ps.length+' proc','');
                } else if(/iprazos\.adv\.br/i.test(de)){
                  proms.push(processarImpacta({id:msgMeta.id},token));
                }
                Promise.all(proms).then(function(results){
                  results.forEach(function(list){(list||[]).forEach(function(p){if(p&&p.cnj)upsert(p);});});
                  next();
                });
                if(!proms.length)next();
              }).catch(function(e){log('❌ '+e.message,'err');next();});
          }, i*600);
        }
        next();
      }).catch(function(e){log('❌ Gmail: '+e.message,'err');});
  }

  // ── Intercepta botão Importar existente ───────────────────
  var origImportar = window.importarEmailsGmail;
  window.importarEmailsGmail = function() {
    window.lexImportarGmail();
    if (origImportar) origImportar();
  };

  // ── Verifica token ao iniciar ─────────────────────────────
  function init() {
    token_atual = getToken();
    if (token_atual) {
      log('✅ Token Gmail presente','ok');
    }
    console.log('[LexImport v3] Parsers: TRT9 Push + Jusbrasil + Impacta (.docx)');
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded',function(){setTimeout(init,1000);});
  } else {
    setTimeout(init,1000);
  }

})();

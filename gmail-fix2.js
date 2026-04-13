/**
 * LexOffice 5.0 — Módulo Completo v4
 * ✅ Dashboard + Clientes + Processos atualizados em tempo real
 * ✅ Google Calendar — cria evento para cada prazo
 * ✅ WhatsApp — notifica cliente via link direto
 * ✅ Projudi — link direto com número do processo
 * ✅ Gerador de peças com IA (Claude)
 * ✅ Dashboard de produtividade
 * ✅ Exportação Excel (CSV)
 * ✅ Regra: quem está antes de "Adv - AMILCAR" = cliente
 */

// ── Inicialização imediata do EMAIL ──────────────────────────
window.EMAIL = window.EMAIL || {};
window.EMAIL.cfg = window.EMAIL.cfg || {};
window.EMAIL.cfg.clientId  = window.EMAIL.cfg.clientId  || '245855517843-4fstpfsna79doa6krmvg3hu5p3o7jtdm.apps.googleusercontent.com';
window.EMAIL.cfg.intervalo = window.EMAIL.cfg.intervalo || 15;
window.EMAIL.cfg.autoTarefa  = window.EMAIL.cfg.autoTarefa  !== false;
window.EMAIL.cfg.autoAgenda  = window.EMAIL.cfg.autoAgenda  !== false;
window.EMAIL.cfg.calendarId  = window.EMAIL.cfg.calendarId  || 'primary';
window.EMAIL.cfg.calPrefix   = window.EMAIL.cfg.calPrefix   || '[LEX] ';
window.EMAIL.stats       = window.EMAIL.stats       || {total:0,procs:0,prazos:0,dups:0};
window.EMAIL.prazos      = window.EMAIL.prazos      || [];
window.EMAIL.cnjs_impacta= window.EMAIL.cnjs_impacta|| {};
window.EMAIL.log_entries = window.EMAIL.log_entries || [];
window.EMAIL.ok    = window.EMAIL.ok    || false;
window.EMAIL.token = window.EMAIL.token || null;
window.EMAIL.calToken = window.EMAIL.calToken || null;
window.EMAIL._inbox    = window.EMAIL._inbox    || [];
window.EMAIL._extracao = window.EMAIL._extracao || null;
window._pubProcessadas = window._pubProcessadas || {};

(function () {
  'use strict';

  var AMILCAR = 'AMILCAR CORDEIRO TEIXEIRA FILHO';
  var SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';
  var SCOPE_CAL   = 'https://www.googleapis.com/auth/calendar';
  var SCOPE_ALL   = SCOPE_GMAIL + ' ' + SCOPE_CAL;

  // ═══════════════════════════════════════════════════════════
  // 1. CONEXÃO GMAIL + CALENDAR
  // ═══════════════════════════════════════════════════════════
  function conectar() {
    var cid = window.EMAIL.cfg.clientId, t = 0;
    function try_() {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        try {
          google.accounts.oauth2.initTokenClient({
            client_id: cid, scope: SCOPE_ALL, callback: onToken
          }).requestAccessToken({ prompt: 'consent' });
        } catch (e) { alert('Erro OAuth: ' + e.message); }
      } else if (++t < 20) { setTimeout(try_, 500); }
      else { alert('Biblioteca Google não carregou. Recarregue a página.'); }
    }
    try_();
  }

  function onToken(resp) {
    if (resp.error) { alert('Erro Gmail: ' + resp.error); return; }
    var tk  = resp.access_token;
    var exp = Date.now() + (resp.expires_in || 3600) * 1000;
    window.EMAIL.token    = tk;
    window.EMAIL.calToken = tk; // mesmo token para Calendar
    window.EMAIL.ok = true;
    try { localStorage.setItem('lex_gmail_token', tk); } catch(e) {}
    try { localStorage.setItem('lex_gmail_token_exp', String(exp)); } catch(e) {}
    setBtnConectado(true);
    eLog('✅ Gmail + Calendar autorizados', 'ok');
    if (typeof toast === 'function') toast('✅ Gmail conectado! Buscando publicações...', 'green');
    buscar(tk);
    setInterval(function(){ if (Date.now()<exp) buscar(tk); }, (window.EMAIL.cfg.intervalo||15)*60000);
  }

  // ═══════════════════════════════════════════════════════════
  // 2. BUSCA E PROCESSAMENTO DE E-MAILS
  // ═══════════════════════════════════════════════════════════
  function buscar(tk) {
    var box = document.getElementById('inboxList');
    if (box) box.innerHTML = '<div style="text-align:center;padding:14px;color:var(--teal);font-size:13px">⏳ Buscando publicações...</div>';
    eLog('📥 Buscando...', 'teal');
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' +
      encodeURIComponent('from:publicacoes@impacta.adv.br OR from:publicacoes-diarios@jusbrasil.com.br') +
      '&maxResults=25', { headers: { Authorization: 'Bearer '+tk } })
    .then(function(r){ return r.status===401 ? null : r.json(); })
    .then(function(d){
      if (!d||!d.messages||!d.messages.length) {
        if (box) box.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
        eLog('📭 Nenhum e-mail novo', 'info'); return;
      }
      eLog('📨 ' + d.messages.length + ' e-mail(s)', 'ok');
      carregarMsgs(tk, d.messages.slice(0,20));
    })
    .catch(function(e){ eLog('❌ ' + e.message, 'err'); });
  }

  function carregarMsgs(tk, msgs) {
    var res = new Array(msgs.length), done = 0;
    msgs.forEach(function(m,i){
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+m.id+'?format=full',
        { headers: { Authorization: 'Bearer '+tk } })
      .then(function(r){ return r.json(); })
      .then(function(msg){
        var hdrs={};
        ((msg.payload&&msg.payload.headers)||[]).forEach(function(h){ hdrs[h.name]=h.value; });
        var fonte = (hdrs['From']||'').toLowerCase().indexOf('jusbrasil')>=0 ? 'jusbrasil' : 'impacta';
        res[i] = { id:m.id, assunto:hdrs['Subject']||'', de:hdrs['From']||'',
          data:hdrs['Date']||'', fonte:fonte, corpo:extTexto(msg.payload), anexos:extAnexos(msg) };
        if (++done===msgs.length) processarLote(res.filter(Boolean), tk);
      })
      .catch(function(){ if (++done===msgs.length) processarLote(res.filter(Boolean), tk); });
    });
  }

  function extTexto(payload) {
    var t='';
    function p(n){ if(!n)return;
      if((n.mimeType==='text/plain'||n.mimeType==='text/html')&&n.body&&n.body.data)
        try{ t+=atob(n.body.data.replace(/-/g,'+').replace(/_/g,'/'))+'\n'; }catch(e){}
      if(n.parts)n.parts.forEach(p);
    }
    p(payload||{}); return t.trim();
  }

  function extAnexos(msg) {
    var a=[];
    function p(part){ if(!part)return;
      var nome=part.filename||'';
      if(!nome&&part.headers)part.headers.forEach(function(h){
        if(h.name==='Content-Disposition'){var m=h.value.match(/filename[*]?="?([^";]+)"?/i);if(m)nome=m[1];}
      });
      if(nome&&nome.match(/\.doc[x]?$/i)&&part.body&&part.body.attachmentId)
        a.push({nome:nome,aid:part.body.attachmentId,msgId:msg.id});
      if(part.parts)part.parts.forEach(p);
    }
    p(msg.payload||{}); return a;
  }

  function processarLote(emails, tk) {
    window._emailsCarregados = emails;
    renderInbox(emails);
    var novos = 0;
    emails.forEach(function(email){
      if (window._pubProcessadas[email.id]) return;
      if (email.fonte==='impacta') {
        if (email.anexos&&email.anexos.length>0) {
          email.anexos.forEach(function(anx){
            baixarAnexo(tk, email.id, anx.aid, function(html){
              var pubs = parseImpacta(html);
              pubs.forEach(function(pub){ pub.fonte='impacta'; processarPub(pub, tk); novos++; });
              atualizarInterface();
            });
          });
        } else {
          parseImpacta(email.corpo).forEach(function(pub){ pub.fonte='impacta'; processarPub(pub, tk); novos++; });
        }
      } else {
        var pub = parseJusbrasil(email.corpo, email.assunto);
        if (pub) {
          if (window.EMAIL.cnjs_impacta[pub.cnj]) {
            window.EMAIL.stats.dups++;
            eLog('🔁 Dup JusBrasil: '+pub.cnj, 'warn');
          } else { pub.fonte='jusbrasil'; processarPub(pub, tk); novos++; }
        }
      }
      window._pubProcessadas[email.id] = true;
      window.EMAIL.stats.total++;
    });
    atualizarInterface();
    if (novos>0&&typeof toast==='function') toast('✅ '+novos+' publicação(ões) processada(s)!', 'teal');
  }

  function baixarAnexo(tk, msgId, aid, cb) {
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+msgId+'/attachments/'+aid,
      { headers: { Authorization: 'Bearer '+tk } })
    .then(function(r){ return r.json(); })
    .then(function(d){ if(d.data) try{ cb(atob(d.data.replace(/-/g,'+').replace(/_/g,'/'))); }catch(e){} })
    .catch(function(e){ eLog('❌ Anexo: '+e.message,'err'); });
  }

  // ═══════════════════════════════════════════════════════════
  // 3. PARSERS
  // ═══════════════════════════════════════════════════════════
  function parseImpacta(conteudo) {
    var texto = conteudo;
    if (conteudo.indexOf('<')>=0) {
      try { var d=new DOMParser().parseFromString(conteudo,'text/html'); texto=d.body?(d.body.innerText||d.body.textContent):conteudo; }catch(e){}
    }
    var linhas = texto.split(/[\n\r]/).map(function(l){return l.trim();}).filter(Boolean);
    var cab={};
    var idxPub=-1;
    for(var i=0;i<linhas.length;i++){
      var l=linhas[i],nx=linhas[i+1]||'';
      if(l==='Processo:')    {cab.processo=nx;i++;}
      else if(l==='Diário:') {cab.diario=nx;i++;}
      else if(l==='Detalhamento:'){cab.comarca=nx.split(/[\/|]/)[0].trim();i++;}
      else if(l==='Publicação:') {idxPub=i+1;break;}
    }
    var texPub = idxPub>=0 ? linhas.slice(idxPub).join('\n') : texto;
    var blocos = texPub.split(/(?=\.\s*\d{4}\s*-\s*[A-Z])/);
    if(blocos.length<=1) blocos=[texPub];
    var resultados=[];
    blocos.forEach(function(bloco){
      if(bloco.length<30) return;
      var pub={autor:'',reu:'',cliente:'',cnj:'',processo:cab.processo||'',vara:cab.diario||'',comarca:cab.comarca||'',publicacao:bloco,advogado:'',tipo_acao:'',prazo_dias:5};
      var cnj=bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if(cnj) pub.cnj=cnj[1];
      else if(cab.processo) pub.cnj=formatCNJ(cab.processo.replace(/\D/g,''));
      var posAdv=bloco.search(/Adv\s*-\s*AMILCAR/i);
      if(posAdv>=0){
        var antes=bloco.substring(0,posAdv);
        pub.cliente=clienteNoBloco(antes);
        pub.advogado=AMILCAR;
        var partes=extPartes(bloco);
        pub.tipo_acao=partes.tipo_acao;
        if(pub.cliente){
          var poloAtivo=new RegExp('(Embargante|Agravante|Apelante|Requerente|Exequente|Autor)[^-]*-[^;]*'+escRe(pub.cliente.substring(0,12)),'i').test(bloco);
          if(poloAtivo){
            pub.autor=pub.cliente;
            var rm=bloco.match(/(?:Embargado|Agravado|Apelado|Requerido|Executado)\(?[aAs]?\)?\s*-\s*([^;]+?)(?:;|Relator|Adv\s*-)/i);
            pub.reu=rm?rm[1].trim():'';
          } else {
            pub.reu=pub.cliente;
            var am=bloco.match(/(?:Embargante|Agravante|Apelante|Requerente|Exequente|Autor)\(?s?\)?\s*-\s*([^;]+?)(?:;|Embargado|Agravado)/i);
            pub.autor=am?am[1].trim():'';
          }
        } else { pub.autor=partes.autor; pub.reu=partes.reu; }
        resultados.push(pub);
      }
    });
    return resultados;
  }

  function parseJusbrasil(corpo, assunto) {
    var texto=corpo.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    var pub={autor:'',reu:'',cliente:'',cnj:'',vara:'STJ/Tribunal',publicacao:texto.substring(0,2000),advogado:'',tipo_acao:'',prazo_dias:5};
    var cnj=(assunto+' '+texto).match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    if(cnj) pub.cnj=cnj[1];
    var posAdv=texto.search(/ADVOGADO\s*:\s*AMILCAR/i);
    if(posAdv>=0){
      var antes=texto.substring(0,posAdv);
      var pm=antes.match(/(?:AGRAVANTE|APELANTE|EMBARGANTE|AUTOR|REQUERENTE|EXEQUENTE)\s*:\s*([A-ZÁÉÍÓÚÃÕÂÊÔÇ][^\n:]+?)(?:\s*$)/i);
      if(pm){
        pub.cliente=pm[1].trim(); pub.advogado=AMILCAR;
        var tipoM=antes.match(/(AGRAVANTE|APELANTE|EMBARGANTE|AUTOR|REQUERENTE|EXEQUENTE)\s*:/i);
        var tipo=tipoM?tipoM[1].toUpperCase():'AUTOR';
        if(['AGRAVANTE','APELANTE','EMBARGANTE','AUTOR','REQUERENTE','EXEQUENTE'].indexOf(tipo)>=0){
          pub.autor=pub.cliente;
          var rm=texto.match(/(?:AGRAVADO|APELADO|EMBARGADO|RÉU|REQUERIDO|EXECUTADO)\s*:\s*([A-ZÁÉÍÓÚÃÕÂÊÔÇ][^\n:]+?)(?:\s+ADVOGAD|\s+PR0|\s*$)/i);
          pub.reu=rm?rm[1].trim():'';
        } else { pub.reu=pub.cliente; var am=texto.match(/(?:AGRAVANTE|APELANTE|EMBARGANTE|AUTOR)\s*:\s*([A-ZÁÉÍÓÚÃÕÂÊÔÇ][^\n:]+?)(?:\s+ADVOGAD)/i); pub.autor=am?am[1].trim():''; }
      }
    }
    var tipos=['AGRAVO EM RECURSO ESPECIAL','AGRAVO DE INSTRUMENTO','RECURSO ESPECIAL','APELAÇÃO','EMBARGOS','EXECUÇÃO','HABEAS CORPUS'];
    for(var j=0;j<tipos.length;j++){ if((assunto+texto).toUpperCase().indexOf(tipos[j])>=0){pub.tipo_acao=tipos[j];break;} }
    return pub.cnj?pub:null;
  }

  function clienteNoBloco(texto) {
    var assuntos=[], m, re=/Assunto\s*-\s*([A-ZÁÉÍÓÚÃÕÂÊÔÇ][^\n]{5,70}?)(?:\s+(?:Remessa|Intimação|Ciência|A íntegra))/gi;
    while((m=re.exec(texto))!==null){ if(!m[1].match(/^A\s+/i)) assuntos.push(m[1].trim()); }
    if(assuntos.length>0) return assuntos[assuntos.length-1];
    var partes=[], re2=/(?:Embargante|Agravante|Apelante|Requerente|Exequente|Autor|Réu|Embargado|Agravado)\(?[sS]?\)?\s*[-:]\s*([A-ZÁÉÍÓÚÃÕÂÊÔÇ][^;\n]{5,80}?)(?:\s*;|\s*\n|$)/gi;
    while((m=re2.exec(texto))!==null) partes.push(m[1].trim());
    return partes.length>0 ? partes[partes.length-1] : '';
  }

  function extPartes(texto) {
    var r={autor:'',reu:'',tipo_acao:''};
    var pads=[
      [/Embargante\(?s?\)?\s*[-:]\s*([^;]+?)(?:;|Embargado|Relator)/i,/Embargado\(?[aAs]?\)?\s*[-:]\s*([^;]+?)(?:;|Relator|Assunto)/i],
      [/Agravante\s*[-:]\s*([^;:\n]+?)(?:\s*;|\s*ADVOGADO|\s*AGRAVADO)/i,/Agravado\s*[-:]\s*([^;:\n]+?)(?:\s*;|\s*ADVOGADO|\s*PR0)/i],
      [/Apelante\s*[-:]\s*([^;]+?)(?:;|Apelado)/i,/Apelado\s*[-:]\s*([^;]+?)(?:;|Relator)/i],
      [/Exequente\s*[-:]\s*([^;]+?)(?:;|Executado)/i,/Executado\s*[-:]\s*([^;]+?)(?:;|Adv)/i],
    ];
    for(var i=0;i<pads.length;i++){
      var ma=texto.match(pads[i][0]),mr=texto.match(pads[i][1]);
      if(ma&&!r.autor)r.autor=limpa(ma[1]);
      if(mr&&!r.reu)r.reu=limpa(mr[1]);
      if(r.autor&&r.reu)break;
    }
    var tipos=['Embargos de Declaração','Agravo de Instrumento','Apelação','Execução Fiscal','Recurso Especial','Habeas Corpus','Mandado de Segurança'];
    for(var j=0;j<tipos.length;j++){ if(texto.toLowerCase().indexOf(tipos[j].toLowerCase())>=0){r.tipo_acao=tipos[j];break;} }
    return r;
  }

  function limpa(s){return(s||'').replace(/\s+/g,' ').trim().substring(0,100);}
  function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function formatCNJ(d){return d.length>=20?d.substr(0,7)+'-'+d.substr(7,2)+'.'+d.substr(9,4)+'.'+d.substr(13,1)+'.'+d.substr(14,2)+'.'+d.substr(16,4):d;}

  // ═══════════════════════════════════════════════════════════
  // 4. PROCESSAR PUBLICAÇÃO: cliente + processo + prazo + calendar + IA
  // ═══════════════════════════════════════════════════════════
  function processarPub(pub, tk) {
    eLog('📋 '+(pub.cnj||'?')+' | Cliente: '+(pub.cliente||pub.autor||'?'), 'ok');
    var cliente = cadastrarCliente(pub);
    atualizarProcesso(pub, cliente);
    var prazoData = criarPrazo(pub);
    if(window.EMAIL.calToken) criarEventoCalendar(pub, prazoData);
    if(pub.publicacao&&pub.publicacao.length>80) resumoIA(pub, cliente);
    notificarWhatsApp(pub, cliente, prazoData);
  }

  // ═══════════════════════════════════════════════════════════
  // 5. CADASTRAR/ATUALIZAR CLIENTE
  // ═══════════════════════════════════════════════════════════
  function cadastrarCliente(pub) {
    if(!window.S||!window.S.clientes) return null;
    var nome=limpa(pub.cliente||pub.autor||'');
    if(nome.length<3) return null;
    var nome8=nome.toUpperCase().substring(0,8);
    var ex=window.S.clientes.find(function(c){
      return c.nome.toUpperCase().indexOf(nome8)>=0||nome.toUpperCase().indexOf(c.nome.toUpperCase().substring(0,8))>=0;
    });
    var adverso=(pub.cliente===pub.autor)?pub.reu:pub.autor;
    var polo=(pub.cliente===pub.reu)?'RÉU':'AUTOR';
    if(ex){
      if(!ex.exadverso&&adverso){ex.exadverso=adverso;}
      return ex;
    }
    var novo={
      id:window.S.nextCid++, nome:nome, cpfcnpj:'', email:'', tel:'',
      area:detectarArea(pub.tipo_acao+' '+pub.publicacao),
      tipo:'PF', status:'ativo', resp:1,
      exadverso:adverso||'', endereco:'',
      obs:'Via publicação '+pub.fonte+' — '+new Date().toLocaleDateString('pt-BR')
    };
    window.S.clientes.push(novo);
    eLog('✅ Cliente: '+nome+' ('+polo+')', 'ok');
    if(typeof toast==='function') toast('👤 Novo cliente: '+nome, 'gold');
    return novo;
  }

  function detectarArea(txt){
    var t=(txt||'').toUpperCase();
    if(t.indexOf('TRABALH')>=0||t.indexOf('TRT')>=0)return 'Trabalhista';
    if(t.indexOf('PENAL')>=0||t.indexOf('CRIMINAL')>=0)return 'Penal';
    if(t.indexOf('FISCAL')>=0||t.indexOf('TRIBUTÁR')>=0)return 'Tributário';
    if(t.indexOf('FAMÍLIA')>=0||t.indexOf('DIVÓRC')>=0)return 'Família';
    return 'Cível';
  }

  // ═══════════════════════════════════════════════════════════
  // 6. ATUALIZAR PROCESSO
  // ═══════════════════════════════════════════════════════════
  function atualizarProcesso(pub, cliente) {
    if(!pub.cnj) return;
    var key='lex_proc_'+pub.cnj;
    var ex=(typeof DB!=='undefined'&&DB.load(key))||{};
    var polo=(pub.cliente&&pub.cliente===pub.reu)?'RÉU':'AUTOR';
    var proc=Object.assign({},ex,{
      ficha:pub.cnj, acao:pub.tipo_acao||ex.acao||'',
      vara:pub.vara||ex.vara||'', comarca:pub.comarca||ex.comarca||'',
      parte1:(cliente&&cliente.nome)||pub.autor||ex.parte1||'',
      polo:polo, exadv:(polo==='AUTOR'?pub.reu:pub.autor)||ex.exadv||'',
      status:'ativo', updated:new Date().toLocaleDateString('pt-BR'),
      ultima_pub:(pub.publicacao||'').substring(0,300)
    });
    if(typeof DB!=='undefined') DB.save(key,proc);
    if(pub.fonte==='impacta') window.EMAIL.cnjs_impacta[pub.cnj]=true;
    window.EMAIL.stats.procs++;
    eLog('⚖️ Processo: '+pub.cnj, 'ok');
  }

  // ═══════════════════════════════════════════════════════════
  // 7. PRAZO 5 DIAS ÚTEIS
  // ═══════════════════════════════════════════════════════════
  function criarPrazo(pub) {
    var data=prazo5dias();
    window.EMAIL.prazos.push({
      id:Date.now()+Math.random(), cnj:pub.cnj||pub.processo||'?',
      mov:pub.tipo_acao||'Publicação processual', prazo:data, dias:5,
      fonte:pub.fonte==='impacta'?'📡 Impacta':'📰 JusBrasil', status:'pendente'
    });
    window.EMAIL.stats.prazos++;
    if(typeof renderPrazosAuto==='function') renderPrazosAuto();
    eLog('⏳ Prazo 5 dias: '+data, 'ok');
    return data;
  }

  function prazo5dias(){
    var d=new Date(),u=0;
    while(u<5){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)u++;}
    return d.toLocaleDateString('pt-BR');
  }

  function prazoISO(dataStr){
    var p=dataStr.split('/');
    if(p.length!==3)return '';
    return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
  }

  // ═══════════════════════════════════════════════════════════
  // 8. GOOGLE CALENDAR
  // ═══════════════════════════════════════════════════════════
  function criarEventoCalendar(pub, prazoData) {
    var tk = window.EMAIL.calToken; if(!tk) return;
    var titulo = window.EMAIL.cfg.calPrefix + 'Prazo — ' + (pub.tipo_acao||'Publicação') + ' — ' + (pub.cnj||pub.processo||'');
    var dataISO = prazoISO(prazoData); if(!dataISO) return;
    var evento = {
      summary: titulo,
      description: 'Cliente: '+(pub.cliente||pub.autor||'')+'\nAdverso: '+(pub.reu||pub.autor||'')+'\nProcesso: '+(pub.cnj||'')+'\nFonte: '+pub.fonte+'\n\nPublicação:\n'+(pub.publicacao||'').substring(0,500),
      start: { date: dataISO },
      end:   { date: dataISO },
      colorId: '11', // vermelho
      reminders: { useDefault: false, overrides: [{ method:'popup', minutes:480 },{ method:'email', minutes:1440 }] }
    };
    var calId = encodeURIComponent(window.EMAIL.cfg.calendarId||'primary');
    fetch('https://www.googleapis.com/calendar/v3/calendars/'+calId+'/events',{
      method:'POST',
      headers:{'Authorization':'Bearer '+tk,'Content-Type':'application/json'},
      body: JSON.stringify(evento)
    })
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.id) eLog('📅 Calendar: '+titulo, 'ok');
      else eLog('⚠️ Calendar erro: '+(d.error&&d.error.message||JSON.stringify(d)),'warn');
    })
    .catch(function(e){ eLog('⚠️ Calendar: '+e.message,'warn'); });
  }

  // ═══════════════════════════════════════════════════════════
  // 9. WHATSAPP — link direto (sem API Business)
  // ═══════════════════════════════════════════════════════════
  function notificarWhatsApp(pub, cliente, prazoData) {
    if(!cliente||!cliente.tel) return; // só se tiver telefone cadastrado
    var tel = cliente.tel.replace(/\D/g,'');
    if(tel.length<10) return;
    if(!tel.startsWith('55')) tel='55'+tel;
    var msg = '⚖️ *LexOffice — Nova Publicação*\n\n'
      +'Olá *'+cliente.nome+'*!\n\n'
      +'Seu processo foi publicado no Diário Oficial:\n'
      +'📋 Processo: '+(pub.cnj||pub.processo||'?')+'\n'
      +'⚖️ Tipo: '+(pub.tipo_acao||'Movimentação processual')+'\n'
      +'⏳ *Prazo: '+prazoData+' (5 dias úteis)*\n\n'
      +'Entre em contato conosco para mais informações.';

    // Criar botão de notificação na interface
    adicionarBotaoWhatsApp(tel, msg, pub.cnj);
  }

  function adicionarBotaoWhatsApp(tel, msg, cnj) {
    var log = document.getElementById('emailLog');
    if(!log) return;
    var url = 'https://wa.me/'+tel+'?text='+encodeURIComponent(msg);
    var div = document.createElement('div');
    div.style.cssText = 'color:var(--green);margin-top:2px';
    div.innerHTML = '📱 <a href="'+url+'" target="_blank" style="color:var(--green);text-decoration:underline">Notificar cliente via WhatsApp — '+cnj+'</a>';
    log.insertBefore(div, log.firstChild);
  }

  // ═══════════════════════════════════════════════════════════
  // 10. PROJUDI — link direto com número do processo
  // ═══════════════════════════════════════════════════════════
  window.abrirProjudiCNJ = function(cnj) {
    if(!cnj) return;
    var url = 'https://projudi.tjpr.jus.br/projudi/processo/listProcesso.do?_system=true&numeroProcesso='+encodeURIComponent(cnj);
    window.open(url, '_blank');
    eLog('⚖️ Abrindo Projudi: '+cnj, 'teal');
  };

  window.abrirESAJCNJ = function(cnj) {
    if(!cnj) return;
    window.open('https://esaj.tjsp.jus.br/cpopg/show.do?processo.codigo='+encodeURIComponent(cnj), '_blank');
  };

  window.abrirPJeCNJ = function(cnj) {
    if(!cnj) return;
    window.open('https://pje.tjpr.jus.br/pje/Processo/ConsultaProcesso/listView.seam?PROCESSO='+encodeURIComponent(cnj), '_blank');
  };

  // ═══════════════════════════════════════════════════════════
  // 11. GERADOR DE PEÇAS COM IA (Claude)
  // ═══════════════════════════════════════════════════════════
  window.gerarPeca = function(cnj, tipoPeca) {
    var key = 'lex_proc_'+cnj;
    var proc = (typeof DB!=='undefined'&&DB.load(key))||{};
    var resumoKey = 'lex_resumo_'+cnj;
    var resumo = (typeof DB!=='undefined'&&DB.load(resumoKey))||{};

    if(!proc.ficha&&!cnj) { if(typeof toast==='function') toast('Processo não encontrado','orange'); return; }

    var tipo = tipoPeca || 'contestação';
    var prompt = 'Você é advogado especialista. Redija uma minuta de '+tipo+' para o seguinte processo:\n\n'
      +'PROCESSO: '+cnj+'\n'
      +'CLIENTE: '+proc.parte1+' (polo '+proc.polo+')\n'
      +'ADVERSO: '+proc.exadv+'\n'
      +'TIPO DE AÇÃO: '+proc.acao+'\n'
      +'VARA: '+proc.vara+'\n'
      +'COMARCA: '+proc.comarca+'\n\n'
      +(resumo.resumo?'ÚLTIMA PUBLICAÇÃO:\n'+resumo.resumo+'\n\n':'')
      +'Redija uma minuta completa de '+tipo+' com:\n'
      +'- Qualificação das partes\n'
      +'- Dos fatos\n'
      +'- Do direito (com base na legislação aplicável)\n'
      +'- Dos pedidos\n'
      +'- Da conclusão\n\n'
      +'Use linguagem jurídica formal. Deixe [DADOS A COMPLETAR] onde precisar de informações específicas.';

    abrirModalPeca(cnj, tipo, 'Gerando peça com IA...');

    fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,messages:[{role:'user',content:prompt}]})
    })
    .then(function(r){return r.json();})
    .then(function(d){
      var txt=(d.content&&d.content[0]&&d.content[0].text)||'Configure a API Key do Claude em Integrações para gerar peças automaticamente.';
      abrirModalPeca(cnj, tipo, txt);
      if(typeof DB!=='undefined') DB.save('lex_peca_'+cnj+'_'+tipo,{texto:txt,data:new Date().toLocaleDateString('pt-BR')});
      eLog('📝 Peça gerada: '+tipo+' — '+cnj, 'ok');
    })
    .catch(function(){ abrirModalPeca(cnj, tipo, '⚠️ Configure a API Key do Claude em Integrações > Claude (Anthropic) para gerar peças automaticamente.'); });
  };

  function abrirModalPeca(cnj, tipo, conteudo) {
    var id = 'modalPecaIA';
    var ex = document.getElementById(id);
    if(ex) ex.remove();
    var div = document.createElement('div');
    div.id = id;
    div.className = 'moverlay open';
    div.innerHTML = '<div class="modal modal-xl" style="position:relative;max-height:90vh">'
      +'<button class="mclose" onclick="document.getElementById(\''+id+'\').remove()">✕</button>'
      +'<div class="mtitle">📝 '+tipo.toUpperCase()+' — '+cnj+'</div>'
      +'<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'
      +'<button class="btn btn-gold btn-sm" onclick="copiarPeca()">📋 Copiar</button>'
      +'<button class="btn btn-ghost btn-sm" onclick="baixarPeca(\''+cnj+'\',\''+tipo+'\')">⬇️ .txt</button>'
      +'<button class="btn btn-ai btn-sm" onclick="gerarPeca(\''+cnj+'\',\'Recurso Ordinário\')">⚖️ Recurso</button>'
      +'<button class="btn btn-ai btn-sm" onclick="gerarPeca(\''+cnj+'\',\'Embargos de Declaração\')">📄 Embargos</button>'
      +'<button class="btn btn-teal btn-sm" onclick="abrirProjudiCNJ(\''+cnj+'\')">⚖️ Projudi</button>'
      +'</div>'
      +'<textarea id="pecaTexto" style="width:100%;min-height:420px;background:var(--surface2);border:1px solid var(--border2);border-radius:9px;padding:14px;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;line-height:1.7;resize:vertical">'+conteudo+'</textarea>'
      +'</div>';
    document.body.appendChild(div);
  }

  window.copiarPeca = function() {
    var el=document.getElementById('pecaTexto');
    if(el){ el.select(); document.execCommand('copy'); if(typeof toast==='function') toast('📋 Copiado!','green'); }
  };

  window.baixarPeca = function(cnj, tipo) {
    var el=document.getElementById('pecaTexto');
    if(!el)return;
    var blob=new Blob([el.value],{type:'text/plain;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(tipo||'peca')+'_'+cnj+'_'+new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')+'.txt';
    a.click();
  };

  // ═══════════════════════════════════════════════════════════
  // 12. RESUMO IA
  // ═══════════════════════════════════════════════════════════
  function resumoIA(pub, cliente) {
    var polo=(pub.cliente&&pub.cliente===pub.reu)?'RÉU':'AUTOR';
    var prompt='Você é advogado especialista. Analise esta publicação:\n\n'
      +'PROCESSO: '+(pub.cnj||pub.processo||'?')+'\n'
      +'TIPO: '+(pub.tipo_acao||'?')+'\n'
      +'CLIENTE: '+(pub.cliente||(cliente&&cliente.nome)||pub.autor||'?')+' (POLO '+polo+')\n'
      +'ADVERSO: '+(polo==='AUTOR'?pub.reu:pub.autor)+'\n\n'
      +'PUBLICAÇÃO:\n'+pub.publicacao.substring(0,2500)+'\n\n'
      +'Responda com:\n1. RESUMO (2-3 linhas)\n2. IMPACTO para nosso cliente\n3. AÇÃO URGENTE (5 dias úteis)\n4. PEÇA SUGERIDA';
    fetch('https://api.anthropic.com/v1/messages',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,messages:[{role:'user',content:prompt}]})
    })
    .then(function(r){return r.json();})
    .then(function(d){
      var txt=(d.content&&d.content[0]&&d.content[0].text)||'';
      if(!txt)return;
      var key='lex_resumo_'+(pub.cnj||pub.processo);
      if(typeof DB!=='undefined') DB.save(key,{resumo:txt,data:new Date().toLocaleDateString('pt-BR')});
      eLog('🤖 Resumo IA: '+(pub.cnj||pub.processo),'teal');
      if(typeof toast==='function') toast('🤖 IA analisou: '+(pub.tipo_acao||pub.cnj||''),'blue');
    })
    .catch(function(){ eLog('⚠️ IA: configure API key em Integrações','warn'); });
  }

  // ═══════════════════════════════════════════════════════════
  // 13. EXPORTAÇÃO EXCEL (CSV)
  // ═══════════════════════════════════════════════════════════
  window.exportarBaseExcel = function() {
    var rows=[['CNJ','Tipo de Ação','Vara','Comarca','Cliente','Polo','Parte Adversa','Status','Atualizado','Última Publicação']];
    var cnjs={};

    // Coletar do localStorage
    try {
      for(var k in localStorage){
        if(k.startsWith('lex_proc_')){
          var cnj=k.replace('lex_proc_','');
          var proc=null;
          try{proc=JSON.parse(localStorage.getItem(k)||'null');}catch(e){}
          if(proc&&!cnjs[cnj]){
            rows.push([cnj,proc.acao||'',proc.vara||'',proc.comarca||'',proc.parte1||'',proc.polo||'',proc.exadv||'',proc.status||'ativo',proc.updated||'',proc.ultima_pub||'']);
            cnjs[cnj]=true;
          }
        }
      }
    }catch(e){}

    // Também incluir XLS2_DATA
    if(typeof XLS2_DATA!=='undefined'&&XLS2_DATA.length){
      XLS2_DATA.forEach(function(r){
        var cnj=r[0]||''; if(cnjs[cnj])return;
        rows.push([cnj,r[1]||'',r[3]||'',r[4]||'',r[7]||'',r[8]||'AUTOR',r[9]||'','ativo','','']);
        cnjs[cnj]=true;
      });
    }

    var prazosRows=[['CNJ','Movimentação','Prazo','Dias','Fonte','Status']];
    (window.EMAIL.prazos||[]).forEach(function(p){ prazosRows.push([p.cnj,p.mov,p.prazo,p.dias,p.fonte,p.status]); });

    var clientesRows=[['Nome','Área','Status','Adverso','Observação']];
    if(window.S&&window.S.clientes){
      window.S.clientes.forEach(function(c){ clientesRows.push([c.nome,c.area,c.status,c.exadverso||'',c.obs||'']); });
    }

    baixarCSV(rows,'LexOffice_Processos');
    setTimeout(function(){ baixarCSV(prazosRows,'LexOffice_Prazos'); },600);
    setTimeout(function(){ baixarCSV(clientesRows,'LexOffice_Clientes'); },1200);

    if(typeof toast==='function') toast('📊 3 planilhas exportadas!','gold');
    eLog('📊 Exportação: '+rows.length+' processos, '+prazosRows.length+' prazos, '+clientesRows.length+' clientes','ok');
  };

  function baixarCSV(rows, nome) {
    var csv=rows.map(function(r){return r.map(function(c){return'"'+(String(c||'').replace(/"/g,'""'))+'"';}).join(';');}).join('\n');
    var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=nome+'_'+new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')+'.csv';
    a.click();
  }

  // ═══════════════════════════════════════════════════════════
  // 14. ATUALIZAR INTERFACE (Dashboard + Clientes + Processos)
  // ═══════════════════════════════════════════════════════════
  function atualizarInterface() {
    // Dashboard KPIs
    var kc=document.getElementById('kClientes');
    if(kc&&window.S&&window.S.clientes) kc.textContent=window.S.clientes.filter(function(c){return c.status==='ativo'||c.status==='vip';}).length;

    var nb=document.getElementById('nbClientes');
    if(nb&&window.S&&window.S.clientes) nb.textContent=window.S.clientes.length;

    // KPI processos no dashboard
    var kp=document.querySelector('.kcard.blue .kval');
    if(kp&&typeof XLS2_DATA!=='undefined') kp.textContent=XLS2_DATA.length;

    // KPI prazos urgentes
    var kpr=document.querySelector('.kcard.red .kval');
    var urgentes=(window.EMAIL.prazos||[]).filter(function(p){return p.dias<=3;}).length;
    if(kpr&&urgentes>0) kpr.textContent=urgentes;

    // Renderizar tabelas se a página estiver visível
    var pgClientes=document.getElementById('pg-clientes');
    if(pgClientes&&pgClientes.classList.contains('active')){
      if(typeof renderKPIClientes==='function') renderKPIClientes();
      if(typeof renderClientes==='function') renderClientes();
    }

    var pgProcessos=document.getElementById('pg-processos');
    if(pgProcessos&&pgProcessos.classList.contains('active')){
      if(typeof filtrarProcessos==='function') filtrarProcessos();
    }

    if(typeof eKPI==='function') eKPI();
  }

  // ═══════════════════════════════════════════════════════════
  // 15. DASHBOARD DE PRODUTIVIDADE
  // ═══════════════════════════════════════════════════════════
  window.abrirProdutividade = function() {
    var prazosHoje=(window.EMAIL.prazos||[]).filter(function(p){return p.dias<=1;}).length;
    var prazos3=(window.EMAIL.prazos||[]).filter(function(p){return p.dias<=3;}).length;
    var prazos7=(window.EMAIL.prazos||[]).filter(function(p){return p.dias<=7;}).length;
    var totalClientes=window.S&&window.S.clientes?window.S.clientes.length:0;
    var totalProc=typeof XLS2_DATA!=='undefined'?XLS2_DATA.length:(window.EMAIL.stats.procs||0);

    var id='modalProdutividade';
    var ex=document.getElementById(id); if(ex)ex.remove();
    var div=document.createElement('div');
    div.id=id; div.className='moverlay open';
    div.innerHTML='<div class="modal modal-lg" style="position:relative">'
      +'<button class="mclose" onclick="document.getElementById(\''+id+'\').remove()">✕</button>'
      +'<div class="mtitle">📈 Dashboard de Produtividade</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">'
      +kpiCard('📧','E-mails Lidos',window.EMAIL.stats.total,'teal')
      +kpiCard('⚖️','Processos',totalProc,'blue')
      +kpiCard('👤','Clientes',totalClientes,'gold')
      +kpiCard('⏳','Prazos Hoje',prazosHoje,'red')
      +kpiCard('⚡','Prazos 3 dias',prazos3,'orange')
      +kpiCard('📅','Prazos 7 dias',prazos7,'green')
      +'</div>'
      +'<div style="background:var(--surface2);border-radius:var(--r);padding:14px;margin-bottom:12px">'
      +'<div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.8px">⏳ Próximos Prazos</div>'
      +'<div style="max-height:200px;overflow-y:auto">'
      +(window.EMAIL.prazos||[]).slice(0,10).map(function(p){
        var c=p.dias<=3?'var(--red)':p.dias<=7?'var(--orange)':'var(--green)';
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">'
          +'<span style="font-family:monospace;font-size:11px;color:var(--teal);min-width:180px">'+p.cnj+'</span>'
          +'<span style="font-size:12px;flex:1;color:var(--text2)">'+p.mov+'</span>'
          +'<span style="font-size:11px;color:'+c+';font-weight:600">'+p.prazo+'</span>'
          +'<button class="btn btn-ghost btn-xs" onclick="abrirProjudiCNJ(\''+p.cnj+'\')">⚖️</button>'
          +'<button class="btn btn-ai btn-xs" onclick="gerarPeca(\''+p.cnj+'\',\''+p.mov+'\')">📝 Peça</button>'
          +'</div>';
      }).join('')
      +'</div></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
      +'<button class="btn btn-gold" onclick="exportarBaseExcel()">📊 Exportar Excel</button>'
      +'<button class="btn btn-ghost" onclick="document.getElementById(\''+id+'\').remove()">Fechar</button>'
      +'</div>'
      +'</div>';
    document.body.appendChild(div);
  };

  function kpiCard(ico,lbl,val,cor){
    return '<div class="kcard '+cor+'" style="padding:14px">'
      +'<div class="kico">'+ico+'</div>'
      +'<div class="kval" style="font-size:22px">'+val+'</div>'
      +'<div class="klbl">'+lbl+'</div>'
      +'</div>';
  }

  // ═══════════════════════════════════════════════════════════
  // 16. RENDER INBOX
  // ═══════════════════════════════════════════════════════════
  function renderInbox(emails){
    var c=document.getElementById('inboxList'); if(!c)return;
    var badge=document.getElementById('gmailOkBadge'); if(badge)badge.style.display='inline-block';
    c.innerHTML=emails.map(function(m,i){
      var isJB=m.fonte==='jusbrasil',cor=isJB?'bo':'bteal',label=isJB?'JusBrasil':'Impacta';
      var d=new Date(m.data),ds=isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR');
      var temAnexo=m.anexos&&m.anexos.length>0;
      var trecho=(m.corpo||'').replace(/<[^>]+>/g,'').substring(0,100).replace(/\n/g,' ');
      return '<div style="padding:10px 13px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);margin-bottom:6px">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        +'<span class="badge '+cor+'" style="font-size:10px">'+label+'</span>'
        +(temAnexo?'<span title="Tem anexo .doc" style="font-size:10px">📎</span>':'')
        +'<span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+m.assunto+'</span>'
        +'<span style="font-size:11px;color:var(--text3)">'+ds+'</span>'
        +'<button class="btn btn-ai btn-xs" onclick="verPublicacao('+i+')">👁 Ver</button>'
        +'</div>'
        +'<div style="font-size:11px;color:var(--text2)">'+trecho+'</div>'
        +'</div>';
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════
  // 17. VER PUBLICAÇÃO INDIVIDUAL
  // ═══════════════════════════════════════════════════════════
  window.verPublicacao=function(i){
    var email=(window._emailsCarregados||[])[i]; if(!email)return;
    var pubs=email.fonte==='jusbrasil'?[parseJusbrasil(email.corpo,email.assunto)].filter(Boolean):parseImpacta(email.corpo);
    var pub=pubs[0];
    if(!pub){if(typeof toast==='function')toast('Não foi possível extrair dados','orange');return;}
    window.EMAIL._extracao=pub;
    var campos=document.getElementById('parserCampos'),card=document.getElementById('parserCard');
    if(campos&&card){
      card.style.display=card.style.visibility='visible'; card.style.opacity='1';
      var rows=[
        pub.cnj?{l:'CNJ',v:pub.cnj,c:'var(--teal)'}:null,
        pub.cliente?{l:'Nosso Cliente',v:pub.cliente,c:'var(--gold)'}:null,
        pub.autor?{l:'Autor',v:pub.autor,c:'var(--green)'}:null,
        pub.reu?{l:'Réu',v:pub.reu,c:'var(--red)'}:null,
        pub.tipo_acao?{l:'Tipo de Ação',v:pub.tipo_acao,c:'var(--blue)'}:null,
        pub.vara?{l:'Vara/Diário',v:pub.vara}:null,
        pub.advogado?{l:'Advogado',v:pub.advogado,c:'var(--purple)'}:null,
        {l:'Prazo (5 dias úteis)',v:prazo5dias(),c:'var(--orange)'},
      ].filter(Boolean);
      campos.innerHTML=rows.map(function(r){
        return '<div style="display:flex;gap:11px;padding:8px 0;border-bottom:1px solid var(--border)">'
          +'<div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;width:140px;flex-shrink:0;padding-top:2px">'+r.l+'</div>'
          +'<div style="font-size:13px;color:'+(r.c||'var(--text)')+';font-weight:500">'+r.v+'</div></div>';
      }).join('');
      if(pub.cnj){
        var rs=typeof DB!=='undefined'?DB.load('lex_resumo_'+pub.cnj):null;
        if(rs){var el=document.getElementById('aiDocResp');if(el)el.textContent=rs.resumo;}
      }
      // Botões de ação rápida
      var btns=document.querySelector('#parserCard .cb');
      if(btns&&pub.cnj){
        var bDiv=document.createElement('div');
        bDiv.style.cssText='display:flex;gap:7px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)';
        bDiv.innerHTML='<button class="btn btn-ai btn-sm" onclick="gerarPeca(\''+pub.cnj+'\',\'Contestação\')">📝 Gerar Peça</button>'
          +'<button class="btn btn-ghost btn-sm" onclick="abrirProjudiCNJ(\''+pub.cnj+'\')">⚖️ Projudi</button>'
          +'<button class="btn btn-teal btn-sm" onclick="abrirProdutividade()">📈 Produtividade</button>'
          +'<button class="btn btn-gold btn-sm" onclick="exportarBaseExcel()">📊 Excel</button>';
        var camposDiv=document.getElementById('parserCampos');
        if(camposDiv&&!camposDiv.nextElementSibling) camposDiv.parentNode.insertBefore(bDiv,camposDiv.nextSibling);
      }
      setTimeout(function(){card.scrollIntoView({behavior:'smooth',block:'nearest'});},60);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 18. BOTÕES E UI EXTRAS
  // ═══════════════════════════════════════════════════════════
  function adicionarBotoesUI(){
    // Botão Produtividade na topbar de Publicações
    var pgEmails=document.getElementById('pg-emails');
    if(pgEmails){
      var tb=pgEmails.querySelector('.topbar-actions');
      if(tb&&!tb.querySelector('.btn-produtividade')){
        var btn=document.createElement('button');
        btn.className='btn btn-ghost btn-sm btn-produtividade';
        btn.innerHTML='📈 Produtividade';
        btn.onclick=window.abrirProdutividade;
        tb.appendChild(btn);
      }
    }
    // Botão Excel na topbar de Processos
    var pgProc=document.getElementById('pg-processos');
    if(pgProc){
      var tb2=pgProc.querySelector('.topbar-actions');
      if(tb2&&!tb2.querySelector('.btn-export')){
        var btn2=document.createElement('button');
        btn2.className='btn btn-ghost btn-sm btn-export';
        btn2.innerHTML='📊 Excel';
        btn2.onclick=window.exportarBaseExcel;
        tb2.insertBefore(btn2,tb2.firstChild);
      }
    }
  }

  function setBtnConectado(on){
    var btn=document.getElementById('btnGmail'); if(!btn)return;
    if(on){btn.textContent='✅ Gmail Conectado';btn.style.background='rgba(62,207,207,.18)';btn.style.color='var(--teal)';btn.style.border='1px solid rgba(62,207,207,.4)';}
  }

  window.processarEmails=function(){
    var tk=window.EMAIL&&window.EMAIL.token;
    if(!tk){if(typeof toast==='function')toast('⚠️ Conecte o Gmail primeiro','orange');return;}
    eLog('▶️ Processamento manual...','teal');
    buscar(tk);
  };

  // ═══════════════════════════════════════════════════════════
  // 19. INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════════
  function inicializar(){
    window.conectarGmail=conectar;
    window.iniciarOAuth=conectar;
    var btn=document.getElementById('btnGmail'); if(btn)btn.onclick=conectar;

    adicionarBotoesUI();
    setTimeout(adicionarBotoesUI,2000);

    // Restaurar token salvo
    try{
      var tk=localStorage.getItem('lex_gmail_token');
      var exp=parseInt(localStorage.getItem('lex_gmail_token_exp')||'0');
      if(tk&&exp>Date.now()){
        window.EMAIL.token=tk; window.EMAIL.calToken=tk; window.EMAIL.ok=true;
        setBtnConectado(true);
        eLog('🔄 Token restaurado — buscando publicações...','ok');
        buscar(tk);
        setInterval(function(){if(Date.now()<exp)buscar(tk);},(window.EMAIL.cfg.intervalo||15)*60000);
      }
    }catch(e){}

    console.log('[LexOffice v4] ✅ Módulo completo carregado.');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){setTimeout(inicializar,700);});
  } else { setTimeout(inicializar,700); }

})();

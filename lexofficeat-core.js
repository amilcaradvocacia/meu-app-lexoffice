/**
 * LexOfficeAT — Core v1.0
 * Módulo unificado: Dashboard + Gestão + Importação + Render
 * Performance: sem setInterval, lazy render
 */
(function() {
  'use strict';
  function db() { return typeof LexSync !== 'undefined' && LexSync.DB ? LexSync.DB : null; }
  function getToken() { return localStorage.getItem('lex_gmail_token') || localStorage.getItem('lex_gmail_auth'); }

  function calcPrazo(texto, cnj) {
    var t=(texto||'').toLowerCase(), isTrab=/\.5\.\d{2}\./.test(cnj||'');
    if(/embargos?\s+decl/i.test(t))           return{dias:5,tipo:'Embargos de Declaração'};
    if(/contest|defesa/i.test(t))              return{dias:20,tipo:'Contestação'};
    if(/recurso\s+ordin|apelac/i.test(t))      return{dias:isTrab?8:15,tipo:isTrab?'Recurso Ordinário':'Apelação'};
    if(/agravo/i.test(t))                      return{dias:isTrab?8:15,tipo:'Agravo'};
    if(/sentenc|julgament/i.test(t))           return{dias:isTrab?8:15,tipo:isTrab?'Recurso Ordinário':'Apelação'};
    return{dias:5,tipo:'Manifestação'};
  }

  function cleanup() {
    var d=db();if(!d)return;
    try{
      var pubs=d.getAll(d.KEYS.publicacoes)||[];
      if(pubs.length>200){
        pubs.sort(function(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0);});
        localStorage.setItem('lexat_publicacoes',JSON.stringify(pubs.slice(0,200)));
        console.log('[Core] Pubs: '+pubs.length+'→200');
      }
      var vst={};
      var ded=(d.getAll(d.KEYS.prazos)||[]).filter(function(p){
        var k=(p.cnj||'')+'|'+(p.tipo||'')+'|'+(p.vencimentoISO||'');
        if(vst[k])return false;vst[k]=true;return true;
      });
      if(ded.length<(d.getAll(d.KEYS.prazos)||[]).length)
        localStorage.setItem('lexat_prazos',JSON.stringify(ded));
    }catch(e){}
  }

  function renderDash() {
    var d=db();if(!d)return;
    var hoje=new Date();
    // Prazos
    var box=document.getElementById('dashPrazosConteudo');
    if(box){
      var prazos=(d.getAll(d.KEYS.prazos)||[]).filter(function(p){return p.status==='pendente';})
        .map(function(p){var v=p.vencimentoISO||(p.vencimento||'').split('/').reverse().join('-');
          return Object.assign({},p,{dias:Math.ceil((new Date(v)-hoje)/86400000)});})
        .sort(function(a,b){return a.dias-b.dias;}).slice(0,5);
      if(!prazos.length)box.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px;text-align:center">Nenhum prazo pendente</div>';
      else box.innerHTML=prazos.map(function(p){
        var cor=p.dias<=0?'var(--red)':p.dias<=3?'var(--red)':p.dias<=7?'var(--orange)':'var(--green)';
        var ico=p.dias<=0?'🔴':p.dias<=3?'⚠️':p.dias<=7?'⚡':'✅';
        var pct=Math.min(100,Math.max(5,(10-p.dias)/10*100));
        var cls=p.dias<=3?'c':p.dias<=7?'w':'g';
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">'+
          '<div style="font-size:13px;color:var(--text)">'+(p.tipo||'').split('—')[0].trim().slice(0,28)+' — '+(p.cliente||'').slice(0,25)+'</div>'+
          '<div style="font-size:11px;color:'+cor+';margin-top:2px">'+ico+' '+(p.dias<=0?'VENCIDO':'Vence em '+p.dias+'d')+' · '+(p.vara||'').slice(0,20)+'</div>'+
          '<div class="pbar"><div class="pfill '+cls+'" style="width:'+pct+'%"></div></div></div>';
      }).join('');
    }
    // Tarefas
    var tbox=document.getElementById('dashTarefasConteudo');
    if(tbox){
      var tarKey=d.KEYS.tarefas||'lexat_tarefas';
      var tarefas=(d.getAll(tarKey)||[]).filter(function(t){return t.status==='pendente'&&t.cnj;})
        .sort(function(a,b){return(a.prioridade==='alta'?0:1)-(b.prioridade==='alta'?0:1);}).slice(0,4);
      if(!tarefas.length)tbox.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px;text-align:center">Nenhuma tarefa</div>';
      else tbox.innerHTML=tarefas.map(function(t){
        var cor=t.prioridade==='alta'?'var(--red)':'var(--orange)';
        return '<div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">'+
          '<div style="width:8px;height:8px;border-radius:50%;background:'+cor+';margin-top:4px;flex-shrink:0"></div>'+
          '<div><div style="font-size:13px;color:var(--text)">'+(t.tipo||'').slice(0,38)+'</div>'+
          '<div style="font-size:11px;color:var(--text3)">'+(t.cliente||'').slice(0,25)+(t.prioridade==='alta'?' · <b style="color:var(--red)">Urgente</b>':'')+(t.vencimento?' · '+t.vencimento:'')+'</div></div></div>';
      }).join('');
    }
    // Audiências
    var abox=document.getElementById('dashAudienciasConteudo');
    if(abox){
      var auds=(d.getAll(d.KEYS.audiencias)||[]).filter(function(a){return a.status!=='realizada';})
        .sort(function(a,b){return new Date(a.dataISO||0)-new Date(b.dataISO||0);}).slice(0,3);
      if(!auds.length)abox.innerHTML='<div style="color:var(--text3);font-size:13px;padding:10px;text-align:center">Nenhuma audiência próxima</div>';
      else abox.innerHTML=auds.map(function(a){
        var pts=(a.data||'').split('/');
        var mes=['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(pts[1])||0]||'';
        return '<div class="aitem"><div class="adate"><div class="d">'+(pts[0]||'')+'</div><div class="m">'+mes+'</div></div>'+
          '<div style="flex:1"><div style="font-size:13px;color:var(--text)">'+(a.cliente||a.processo||'').slice(0,35)+'</div>'+
          '<div style="font-size:11px;color:var(--text3)">'+(a.vara||'').slice(0,28)+(a.hora?' · '+a.hora+'h':'')+
          ' · <span class="badge bteal">'+(a.tipo||'Audiência')+'</span></div></div></div>';
      }).join('');
    }
    // KPIs e badges
    var prazosUrg=(d.getAll(d.KEYS.prazos)||[]).filter(function(p){
      if(p.status!=='pendente')return false;
      var v=p.vencimentoISO||(p.vencimento||'').split('/').reverse().join('-');
      return Math.ceil((new Date(v)-hoje)/86400000)<=7;
    });
    var sb=document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if(sb&&prazosUrg.length)sb.textContent=prazosUrg.length;
    var pubs=(d.getAll(d.KEYS.publicacoes)||[]);
    var sbP=document.querySelector('.nitem[onclick*="emails"] .nbadge, .nitem[onclick*="publicacoes"] .nbadge');
    if(sbP)sbP.textContent=pubs.length>200?'200+':pubs.length;
    var bar=document.querySelector('[data-lexdb-info]');
    if(bar){
      var procs=d.getAll(d.KEYS.processos)||[],clis=d.getAll(d.KEYS.clientes)||[];
      (bar.querySelector('span')||bar).textContent='LexDB ativo — '+clis.length+' clientes · '+procs.length+' processos · '+prazosUrg.length+' prazos urgentes';
    }
  }

  function renderPag(page){
    var d=db();if(!d)return;
    if(page==='dashboard'){renderDash();return;}
    if(page==='prazos'&&typeof window.lexRenderPrazosAba==='function'){window.lexRenderPrazosAba('pendente');return;}
    if(page==='processos'&&typeof window.lexRenderProcAba==='function'){window.lexRenderProcAba('ativo');return;}
    if(page==='emails'){
      var el=document.getElementById('inboxList');if(!el)return;
      var pubs=(d.getAll(d.KEYS.publicacoes)||[]).slice(-80).reverse();
      if(!pubs.length){el.innerHTML='<div style="color:var(--text3);padding:20px;text-align:center">Nenhuma publicação. Clique Importar.</div>';return;}
      el.innerHTML='';
      pubs.forEach(function(pub){
        var div=document.createElement('div');
        div.className='ditem';
        div.style.cssText='flex-direction:column;gap:4px;margin-bottom:6px;cursor:pointer;padding:10px;border-radius:8px;border:1px solid var(--border)';
        var dt=(pub.data_pub||'').split('-').reverse().join('/');
        var srcL=pub.fonte==='trt9_push'?'TRT9 Push':pub.fonte==='jusbrasil'?'JusBrasil':'Impacta';
        div.innerHTML='<div style="display:flex;align-items:center;gap:7px">'+
          '<span class="badge '+(pub.fonte==='trt9_push'?'bteal':'bo')+'" style="font-size:10px">'+srcL+'</span>'+
          '<span style="font-size:11px;color:var(--teal);font-family:monospace">'+(pub.cnj||'').slice(0,25)+'</span>'+
          '<span style="font-size:10px;color:var(--text3);margin-left:auto">'+dt+'</span></div>'+
          '<div><span style="font-size:12px;color:var(--gold);font-weight:600">'+(pub.nosso_cliente||'').slice(0,30)+'</span>'+
          (pub.adverso?' <span style="font-size:12px;color:var(--text2)">vs '+(pub.adverso||'').slice(0,25)+'</span>':'')+'</div>'+
          ((pub.movimentacao||'').slice(0,100)?'<div style="font-size:11px;color:var(--text2);border-top:1px solid var(--border);padding-top:4px">'+(pub.movimentacao||'').slice(0,100)+'</div>':'');
        (function(p){div.onclick=function(){
          if(!p.cnj)return;var ci=document.getElementById('cnj_input_api');if(ci)ci.value=p.cnj;
          if(typeof openModal==='function')openModal('mProcesso');
          setTimeout(function(){if(typeof window.consultarCNJ==='function')window.consultarCNJ();},400);
        };})(pub);
        el.appendChild(div);
      });
    }
  }

  function criarPrazo(proc,ficha){
    var d=db();if(!d||!proc.prazo_dias||proc.prazo_dias<=0)return;
    var venc=new Date();venc.setDate(venc.getDate()+proc.prazo_dias);
    var vencBR=venc.toLocaleDateString('pt-BR'),vencISO=venc.toISOString().slice(0,10);
    if((d.getAll(d.KEYS.prazos)||[]).some(function(p){return p.cnj===proc.cnj&&p.vencimentoISO===vencISO;}))return;
    d.add(d.KEYS.prazos,{id:d.newId('prazo'),cnj:proc.cnj,ficha:ficha||'',
      cliente:proc.nosso_cliente||'',tipo:(proc.tipo_prazo||'Manifestação')+' — '+proc.prazo_dias+' dias',
      fundamento:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao.slice(0,100):'',
      urgencia:proc.prazo_dias<=3?'alta':'media',dias:proc.prazo_dias,
      vencimento:vencBR,vencimentoISO:vencISO,vara:proc.vara||'',
      status:'pendente',createdAt:new Date().toISOString()});
    var tok=getToken();
    if(tok)fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
      method:'POST',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
      body:JSON.stringify({summary:(proc.tipo_prazo||'Prazo')+' — '+(proc.nosso_cliente||proc.cnj).slice(0,35),
        description:'CNJ: '+proc.cnj,start:{date:vencISO},end:{date:vencISO},colorId:proc.prazo_dias<=5?'11':'5',
        reminders:{useDefault:false,overrides:[{method:'popup',minutes:1440},{method:'popup',minutes:4320}]}})
    }).catch(function(){});
  }

  function criarTarefa(proc,ficha){
    var d=db();if(!d)return;
    var mov0=proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao.toUpperCase():'';
    var tipo='Analisar publicação';
    if(/SENTENC|JULGAMENT/.test(mov0))    tipo='Analisar sentença';
    else if(/CONTEST|DEFESA/.test(mov0))  tipo='Preparar contestação';
    else if(/RECURSO/.test(mov0))         tipo='Interpor Recurso';
    else if(/SUSPENSO|ACORDO/.test(mov0)) tipo='Acompanhar acordo';
    else if(/DECORRIDO.*PRAZO/.test(mov0))tipo='Verificar prazo decorrido';
    var tarKey=d.KEYS.tarefas||'lexat_tarefas';
    if((d.getAll(tarKey)||[]).some(function(t){return t.cnj===proc.cnj&&t.tipo===tipo;}))return;
    var venc=new Date();venc.setDate(venc.getDate()+3);
    d.add(tarKey,{id:d.newId('tar'),cnj:proc.cnj,ficha:ficha||'',
      cliente:proc.nosso_cliente||'',tipo:tipo,descricao:mov0.slice(0,150),
      prioridade:'alta',status:'pendente',vencimento:venc.toLocaleDateString('pt-BR'),
      vencimentoISO:venc.toISOString().slice(0,10),createdAt:new Date().toISOString()});
  }

  function upsert(proc){
    var d=db();if(!d||!proc||!proc.cnj)return;
    var cnjKey=proc.cnj.replace(/[.\-]/g,'');
    var todos=d.getAll(d.KEYS.processos)||[];
    var ex=todos.find(function(p){return p.cnj&&p.cnj.replace(/[.\-]/g,'')=== cnjKey;});
    var noXLS=typeof XLS2_DATA!=='undefined'&&XLS2_DATA.some(function(r){return(r[2]||'').replace(/[.\-]/g,'')=== cnjKey;});
    if(noXLS){if(proc.eventos&&proc.eventos.length)criarPrazo(proc,'');return;}
    var cliNorm=(proc.nosso_cliente||'').toUpperCase().replace(/[.\-]/g,' ').replace(/\s+/g,' ').trim();
    var cliEx=d.getAll(d.KEYS.clientes)||[];
    var cli=cliEx.find(function(c){return(c.nome||'').toUpperCase().replace(/[.\-]/g,' ').replace(/\s+/g,' ').trim()===cliNorm;});
    if(!cli&&proc.nosso_cliente&&proc.nosso_cliente.length>2){
      var isPJ=/LTDA|S\.A|EIRELI|TRANSPORTES|SERVICOS|LOGISTICA|SEGUROS|BANCO/.test(cliNorm);
      cli={id:d.newId('cli'),nome:proc.nosso_cliente,tipo:isPJ?'PJ':'PF',status:'ativo',origem:'publicacao',createdAt:new Date().toISOString()};
      d.add(d.KEYS.clientes,cli);
    }
    if(ex){
      var movs=ex.movimentos||[];
      (proc.eventos||[]).forEach(function(ev){if(!movs.some(function(m){return m.descricao===ev.descricao;}))movs.unshift(ev);});
      d.update(d.KEYS.processos,ex.id,{movimentos:movs.slice(0,20),updatedAt:new Date().toISOString(),
        vara:ex.vara||proc.vara||'',tipo_acao:ex.tipo_acao||proc.tipo_acao||''});
      criarPrazo(proc,ex.ficha||'');return;
    }
    var maxN=0;
    todos.forEach(function(p){var n=parseInt((p.ficha||'').replace(/\D/g,''));if(!isNaN(n)&&n>maxN)maxN=n;});
    if(typeof XLS2_DATA!=='undefined')XLS2_DATA.forEach(function(r){var n=parseInt((r[0]||'').replace(/\D/g,''));if(!isNaN(n)&&n>maxN)maxN=n;});
    var ficha='A'+String(maxN+1).padStart(4,'0');
    d.add(d.KEYS.processos,{id:d.newId('proc'),ficha:ficha,cnj:proc.cnj,tipo_acao:proc.tipo_acao||'AÇÃO TRABALHISTA',
      vara:proc.vara||'',comarca:proc.comarca||'',tribunal:proc.tribunal||'',instancia:'1º Grau',status:'ativo',
      polo_cliente:proc.nosso_cliente||'',polo_processual:proc.polo||'RÉU',ex_adverso:proc.adverso||'',
      adv_adverso:proc.adv_adverso||'',adv_cliente:'AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856',
      cliente_id:cli?cli.id:null,data_autuacao:proc.data_autuacao||'',fonte_criacao:proc.fonte||'email',
      movimentos:(proc.eventos||[]).map(function(ev){return{data:ev.data,descricao:ev.descricao};}),
      ultima_mov:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao:'',
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    var pubsEx=d.getAll(d.KEYS.publicacoes)||[];
    if(!pubsEx.some(function(p){return p.cnj===proc.cnj&&p.fonte===proc.fonte;}))
      d.add(d.KEYS.publicacoes,{id:d.newId('pub'),cnj:proc.cnj,nosso_cliente:proc.nosso_cliente||'',
        nosso_polo:proc.polo||'',adverso:proc.adverso||'',vara:proc.vara||'',tribunal:proc.tribunal||'',
        movimentacao:proc.eventos&&proc.eventos[0]?proc.eventos[0].descricao:'',
        data_pub:proc.data_autuacao||new Date().toLocaleDateString('pt-BR'),
        fonte:proc.fonte||'email',status:'pendente',createdAt:new Date().toISOString()});
    criarPrazo(proc,ficha);criarTarefa(proc,ficha);
    console.log('[Core] '+ficha+' — '+proc.nosso_cliente);
  }

  function parseTRT9(html,eid){
    var txt=html.replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ');
    function campo(lb){var m=txt.match(new RegExp(lb+'[:\\s]+([^\\n]{2,80}?)(?=\\s*(?:Classe|Órgão|Data de|Autor:|Advogado|Réu:|Eventos|Para acessar|$))','i'));return m?m[1].trim():'';}
    var cnj=campo('Número do Processo'),classe=campo('Classe Judicial'),vara=campo('Órgão Julgador');
    var autor=campo('Autor'),reu=campo('Réu');
    var advAutM=txt.match(/Advogados? do Autor[:\s]+([\s\S]{0,200}?)(?=Réu:|Advogados? do Réu:|Eventos:|Para acessar)/i);
    var advReuM=txt.match(/Advogados? do Réu[:\s]+([\s\S]{0,200}?)(?=Eventos:|Para acessar|$)/i);
    var advAut=advAutM?advAutM[1].replace(/\s+/g,' ').trim():'';
    var advReu=advReuM?advReuM[1].replace(/\s+/g,' ').trim().split('Para acessar')[0]:'';
    var amReu=/AMILCAR/i.test(advReu)||/21856/.test(advReu);
    var nosso,adverso,polo,advAdv;
    if(amReu){nosso=reu;adverso=autor;polo='RÉU';advAdv=advAut;}
    else{nosso=autor;adverso=reu;polo='AUTOR';advAdv=advReu;}
    var comarca=vara;var mC=vara.match(/VARA\s+DO\s+TRABALHO\s+DE\s+(.+)$/i);if(mC)comarca=mC[1].trim();
    var eventos=[];
    (html.match(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi)||[]).forEach(function(row){
      var cells=row.match(/<td[^>]*>([^<]+)<\/td>/gi)||[];
      if(cells.length>=2){var dt=cells[0].replace(/<[^>]+>/g,'').trim();var ev=cells[1].replace(/<[^>]+>/g,'').trim();
        if(dt&&ev&&dt!=='Data'&&ev!=='Evento'&&/\d{2}\/\d{2}\/\d{4}/.test(dt))eventos.push({data:dt.split(' ')[0],descricao:ev});}
    });
    var mov0=eventos[0]?eventos[0].descricao:'';var pr=calcPrazo(mov0,cnj);
    return{cnj:cnj,tipo_acao:classe||'AÇÃO TRABALHISTA - RITO ORDINÁRIO',vara:vara,comarca:comarca,
      tribunal:'TRT 9ª Região (PR/MS)',instancia:'1º Grau',data_autuacao:'',
      nosso_cliente:nosso,adverso:adverso,polo:polo,adv_adverso:advAdv,
      eventos:eventos,prazo_dias:pr.dias,tipo_prazo:pr.tipo,email_id:eid,fonte:'trt9_push'};
  }

  function parseJusbrasil(corpo,eid){
    var blocos=corpo.split(/(?=Processo \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
    var result=[],vistos={};
    blocos.forEach(function(bloco){
      var cnjM=bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
      if(!cnjM||vistos[cnjM[1]])return;vistos[cnjM[1]]=true;var cnj=cnjM[1];
      var paM=bloco.match(/POLO ATIVO\s+([\s\S]*?)(?=POLO PASSIVO|ADVOGADO|DATA DE)/i);
      var ppM=bloco.match(/POLO PASSIVO\s+([\s\S]*?)(?=ADVOGADO|DATA DE)/i);
      var movM=bloco.match(/(?:INTIMAÇÃO|DESPACHO|Vista à parte|Intime-se)[^\n]{5,200}/i);
      var pa=paM?paM[1].replace(/\s+/g,' ').trim():'',pp=ppM?ppM[1].replace(/\s+/g,' ').trim():'';
      var amP=/AMIL[CÁ]CAR/i.test(pp),amA=/AMIL[CÁ]CAR/i.test(pa);
      var nosso,adverso,polo;
      if(amP){nosso=pp.replace(/AMIL[CÁ]CAR CORDEIRO TEIXEIRA FILHO/gi,'').replace(/\s+/g,' ').trim();adverso=pa;polo='RÉU';}
      else if(amA){nosso=pa.replace(/AMIL[CÁ]CAR CORDEIRO TEIXEIRA FILHO/gi,'').replace(/\s+/g,' ').trim();adverso=pp;polo='AUTOR';}
      else{nosso=/LTDA|TRANSPORTES/.test(pp.toUpperCase())?pp:pa;adverso=/LTDA|TRANSPORTES/.test(pp.toUpperCase())?pa:pp;polo=/LTDA|TRANSPORTES/.test(pp.toUpperCase())?'RÉU':'AUTOR';}
      var mov=movM?movM[0]:'';var pr=calcPrazo(mov,cnj);
      result.push({cnj:cnj,tipo_acao:'AÇÃO TRABALHISTA',vara:'',comarca:'',
        tribunal:/5\.09/.test(cnj)?'TRT 9ª Região':'TJPR',instancia:'1º Grau',
        nosso_cliente:nosso.slice(0,80),adverso:adverso.slice(0,80),polo:polo,adv_adverso:'',
        eventos:mov?[{data:new Date().toLocaleDateString('pt-BR'),descricao:mov}]:[],
        prazo_dias:pr.dias,tipo_prazo:pr.tipo,email_id:eid,fonte:'jusbrasil'});
    });
    return result;
  }

  window.lexImportarGmail=function(){
    var token=getToken();
    if(!token){if(typeof toast==='function')toast('Conecte o Gmail em Integrações','orange');return;}
    if(typeof toast==='function')toast('Importando...','teal');
    var query='from:nao-responda@trt9.jus.br OR from:publicacoes-diarios@jusbrasil.com.br OR from:publicacoes@iprazos.adv.br newer_than:7d';
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q='+encodeURIComponent(query)+'&maxResults=15',
      {headers:{Authorization:'Bearer '+token}})
      .then(function(r){return r.json();})
      .then(function(data){
        var msgs=data.messages||[],i=0;
        function next(){
          if(i>=msgs.length){renderDash();renderPag('emails');if(typeof toast==='function')toast('✅ '+i+' e-mails importados','teal');return;}
          var meta=msgs[i++];
          setTimeout(function(){
            fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+meta.id+'?format=full',{headers:{Authorization:'Bearer '+token}})
              .then(function(r){return r.json();})
              .then(function(msg){
                var headers=msg.payload&&msg.payload.headers||[];
                var de=(headers.find(function(h){return h.name==='From';})||{}).value||'';
                var subj=(headers.find(function(h){return h.name==='Subject';})||{}).value||'';
                var html='',parts=[];
                function flat(p){if(p.parts)p.parts.forEach(flat);else parts.push(p);}
                if(msg.payload)flat(msg.payload);
                var hp=parts.find(function(p){return p.mimeType==='text/html'&&p.body&&p.body.data;});
                var tp=parts.find(function(p){return p.mimeType==='text/plain'&&p.body&&p.body.data;});
                try{if(hp)html=atob(hp.body.data.replace(/-/g,'+').replace(/_/g,'/'));
                    else if(tp)html=atob(tp.body.data.replace(/-/g,'+').replace(/_/g,'/')); }catch(e){}
                if(/trt9\.jus\.br/i.test(de)&&/PUSH/i.test(subj)){var p=parseTRT9(html,meta.id);if(p&&p.cnj)upsert(p);}
                else if(/jusbrasil/i.test(de)){var corpo=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');parseJusbrasil(corpo,meta.id).forEach(function(p){if(p.cnj)upsert(p);});}
                next();
              }).catch(function(){next();});
          },i*500);
        }
        next();
      }).catch(function(e){if(typeof toast==='function')toast('Gmail: '+e.message,'red');});
  };

  function seedOnce(){
    var hoje=new Date().toDateString();
    if(localStorage.getItem('lex_seed_'+hoje))return;
    localStorage.setItem('lex_seed_'+hoje,'1');
    [{cnj:'0000528-24.2026.5.09.0656',tipo_acao:'AÇÃO TRABALHISTA - RITO ORDINÁRIO',vara:'VARA DO TRABALHO DE CASTRO',comarca:'CASTRO',tribunal:'TRT 9ª Região',nosso_cliente:'LOG BRASIL - TRANSPORTE E LOGISTICA LTDA',adverso:'CIRO DE MATTOS',polo:'RÉU',adv_adverso:'MARTA DIAS DE FRANCA OAB 24138',eventos:[{data:'26/05/2026',descricao:'Decorrido o prazo'}],prazo_dias:5,tipo_prazo:'Manifestação',fonte:'trt9_push'},
     {cnj:'0000401-42.2026.5.09.0024',tipo_acao:'AÇÃO TRABALHISTA - RITO ORDINÁRIO',vara:'01ª VARA DO TRABALHO DE PONTA GROSSA',comarca:'PONTA GROSSA',tribunal:'TRT 9ª Região',nosso_cliente:'FANTOMA TRANSPORTES LTDA',adverso:'LEANDRO GABRIEL KERIK',polo:'RÉU',adv_adverso:'GEOVANNA GOMES DA SILVA OAB 80059',eventos:[{data:'26/05/2026',descricao:'Decorrido o prazo'}],prazo_dias:5,tipo_prazo:'Manifestação',fonte:'trt9_push'},
     {cnj:'0000252-46.2026.5.09.0024',tipo_acao:'AÇÃO TRABALHISTA - RITO ORDINÁRIO',vara:'01ª VARA DO TRABALHO DE PONTA GROSSA',comarca:'PONTA GROSSA',tribunal:'TRT 9ª Região',nosso_cliente:'KRM TRANSPORTES LTDA',adverso:'JEAN CARLOS MIRANDA',polo:'RÉU',adv_adverso:'FRANCIELI MESSIAS OAB 74268',eventos:[{data:'26/05/2026',descricao:'Suspenso por acordo'}],prazo_dias:0,tipo_prazo:'',fonte:'trt9_push'},
    ].forEach(function(p){upsert(p);});
  }

  function hookGo(){
    var orig=window.go;
    if(orig&&!orig._core){
      window.go=function(page,el){try{orig(page,el);}catch(e){}setTimeout(function(){renderPag(page);},200);};
      window.go._core=true;
    }
  }

  window.lexRenderPagina=renderPag;
  window.renderDashboardFull=renderDash;
  window.renderPrazosDash=renderDash;

  function init(){cleanup();hookGo();renderDash();seedOnce();console.log('[Core] ✅ v1.0');}
  function aguardar(cb){if(db()){cb();return;}setTimeout(function(){aguardar(cb);},800);}
  aguardar(init);
})();

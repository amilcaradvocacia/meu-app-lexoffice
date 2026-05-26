/**
 * LexOfficeAT — Enhancements v4.0 DEFINITIVO
 * IDs confirmados 100% corretos do modal
 */
(function() {
  'use strict';

  var PROXY = localStorage.getItem('lex_datajud_proxy') ||
              'https://lexoffice-datajud.amilcaradvocacia.workers.dev';

  var DJ = {
    '8.01':'tjac','8.02':'tjal','8.03':'tjap','8.04':'tjam','8.05':'tjba',
    '8.06':'tjce','8.07':'tjdft','8.08':'tjes','8.09':'tjgo','8.10':'tjma',
    '8.11':'tjmt','8.12':'tjms','8.13':'tjmg','8.14':'tjpa','8.15':'tjpb',
    '8.16':'tjpr','8.17':'tjpe','8.18':'tjpi','8.19':'tjrj','8.20':'tjrn',
    '8.21':'tjrs','8.22':'tjro','8.23':'tjrr','8.24':'tjsc','8.25':'tjse',
    '8.26':'tjsp','8.27':'tjto',
    '5.01':'trt1','5.02':'trt2','5.03':'trt3','5.04':'trt4','5.05':'trt5',
    '5.06':'trt6','5.07':'trt7','5.08':'trt8','5.09':'trt9','5.10':'trt10',
    '5.11':'trt11','5.12':'trt12','5.13':'trt13','5.14':'trt14','5.15':'trt15',
    '5.16':'trt16','5.17':'trt17','5.18':'trt18','5.19':'trt19','5.20':'trt20',
    '5.21':'trt21','5.22':'trt22','5.23':'trt23','5.24':'trt24',
    '4.01':'trf1','4.02':'trf2','4.03':'trf3','4.04':'trf4','4.05':'trf5',
    '3.00':'stj','1.00':'stf','5.00':'tst'
  };

  function getKey()    { return localStorage.getItem('lex_anthropic_key')||''; }
  function getModelo() { return localStorage.getItem('lex_claude_modelo')||'claude-sonnet-4-20250514'; }

  // ── setVal exato igual ao sistema original ───────────────
  function sv(id, val) {
    var el = document.getElementById(id);
    if (el && (val||val===0)) { el.value = String(val); el.classList.add('af'); }
  }

  // ── Seleciona option por VALUE exato ─────────────────────
  function selByVal(id, val) {
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'SELECT' || !val) return;
    for (var i=0; i<el.options.length; i++) {
      if (el.options[i].value === val) { el.selectedIndex=i; el.classList.add('af'); return; }
    }
  }

  // ── Seleciona f_resp pelo nome (Dr. Amilcar) ──────────────
  function selResp() {
    var el = document.getElementById('f_resp');
    if (!el) return;
    for (var i=0; i<el.options.length; i++) {
      if (el.options[i].text.toLowerCase().includes('amilcar')) {
        el.selectedIndex=i; el.classList.add('af'); return;
      }
    }
  }

  // ── parseCNJ ─────────────────────────────────────────────
  function parseCNJ(cnj) {
    var c = (cnj||'').replace(/\s/g,'');
    var m = c.match(/^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/);
    if (!m) return null;
    return {n:m[1],d:m[2],ano:m[3],j:m[4],tt:m[5],o:m[6],raw:c,chave:m[4]+'.'+m[5]};
  }

  // ── Busca DataJud ─────────────────────────────────────────
  async function buscarDJ(cnj) {
    var p = parseCNJ(cnj);
    if (!p) throw new Error('CNJ inválido');
    var sigla = DJ[p.chave]||'tjpr';
    var body  = JSON.stringify({query:{bool:{should:[
      {match:{numeroProcesso:cnj}},
      {term:{'numeroProcesso.keyword':cnj}}
    ]}},size:1});
    var resp = await fetch(PROXY+'/api_publica_'+sigla+'/_search',
      {method:'POST',headers:{'Content-Type':'application/json'},body:body});
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    var data = await resp.json();
    var hits = data&&data.hits&&data.hits.hits;
    if (!hits||!hits.length) throw new Error('Não encontrado em '+sigla.toUpperCase());
    var src = hits[0]._source||{};
    var pArr= src.partes||[], aArr=src.advogados||[], sArr=src.assuntos||[], mArr=src.movimentos||[];

    // Identifica partes por polo
    var autor = pArr.find(function(p){return /ATIVO|AUTOR|RECLAMANTE|EXEQUENTE|IMPETRANTE|REQUERENTE/i.test(p.polo||'');});
    var reu   = pArr.find(function(p){return /PASSIVO|R[EÉ]U|RECLAMADO|EXECUTAD|IMPETRADO|REQUERIDO/i.test(p.polo||'');});

    // Dr. Amilcar → nosso cliente
    var amil = aArr.find(function(a){return a.nome&&a.nome.toLowerCase().includes('amilcar');});
    var amAtivo = !amil || /ATIVO|AUTOR|RECLAMANTE/i.test((amil&&amil.polo)||'ATIVO');

    var nosso = amAtivo ? (autor?autor.nome:'') : (reu?reu.nome:'');
    var adv   = amAtivo ? (reu?reu.nome:'')    : (autor?autor.nome:'');
    var polo  = amAtivo ? 'AUTOR' : 'RÉU';

    var advsA = aArr.filter(function(a){return /ATIVO|AUTOR|RECLAMANTE/i.test(a.polo||'');});
    var advsP = aArr.filter(function(a){return /PASSIVO|R[EÉ]U|RECLAMADO/i.test(a.polo||'');});

    var orgao  = (src.orgaoJulgador&&src.orgaoJulgador.nome)||'';
    var mun    = (src.municipio&&src.municipio.nome)||'';
    var uf     = (src.tribunal&&src.tribunal.uf)||'PR';
    var grau   = src.grau||'G1';
    var inst   = grau==='G2'?'2º Grau':grau==='SUP'?'Superior':grau==='JE'?'Juizado Especial':'1º Grau';
    var trib   = (src.tribunal&&src.tribunal.nome)||'';

    // Tipo da parte adversa
    var isPJ   = /LTDA|S\.A|EIRELI|\bME\b|\bEPP\b|SOCIEDADE|EMPRESA|CIA\.|BANCO|ESTADO|PREFEITURA|MUNIC[IÍ]PIO|INSTITUTO|AUTARQUIA/i.test(adv||'');

    return {
      cnj:cnj, fonte:'DataJud ✅', sigla:sigla.toUpperCase(),
      // Campos do modal DADOS
      f_acao:    mapTipo((src.classe&&src.classe.nome)||''),
      f_auto:    cnj,
      f_vara:    orgao,
      f_comarca: mun&&uf ? mun+'/'+uf : mun||uf,
      f_status:  'ativo',
      // Campos do modal PARTES
      f_parte1:  nosso,
      f_polo:    polo,
      f_exadv:   adv,
      f_tipo_adv:isPJ?'PJ':'PF',
      f_adv_adv: advsP.map(function(a){return a.nome+(a.numeroOAB?' OAB '+a.numeroOAB:'');}).join('; '),
      // Anotações
      f_anotacoes: (sArr.length?'Assunto: '+sArr.map(function(a){return a.nome;}).join(', '):'')+
                   (mArr.length?'\nÚlt. mov.: '+mArr[0].nome:''),
      // Extras
      instancia: inst, tribunal: trib,
      adv_cliente: advsA.map(function(a){return a.nome+(a.numeroOAB?' OAB '+a.numeroOAB:'');}).join('; '),
      data_inicio: src.dataAjuizamento||'',
      assuntos: sArr.map(function(a){return a.nome;}).join(', '),
      movimentos: mArr.slice(0,5).map(function(m){return {data:m.dataHora,desc:m.nome};}),
      ultima_mov: mArr.length?mArr[0].nome:'',
      nosso_cliente:nosso, adverso:adv, polo_cliente:polo,
      advsAtivo:advsA, advsPassivo:advsP,
    };
  }

  function mapTipo(c) {
    if (!c) return '';
    var u=c.toUpperCase();
    var m=[
      [/RECLAMAT|TRABALHIST/,'RECLAMATÓRIA TRABALHISTA'],
      [/EXECU.*TRAB/,'EXECUÇÃO TRABALHISTA'],
      [/EXECU.*FISCAL/,'EXECUÇÃO FISCAL'],
      [/CUMPRI.*SENTEN/,'CUMPRIMENTO DE SENTENÇA'],
      [/INDENIZ|DANO.*MORAL/,'AÇÃO DE INDENIZAÇÃO'],
      [/COBRAN/,'AÇÃO DE COBRANÇA'],
      [/DESPEJO/,'AÇÃO DE DESPEJO'],
      [/ALIMENT/,'AÇÃO DE ALIMENTOS'],
      [/DIV[OÓ]RCIO/,'AÇÃO DE DIVÓRCIO'],
      [/HABEAS.*CORPUS/,'HABEAS CORPUS'],
      [/MANDADO.*SEGUR/,'MANDADO DE SEGURANÇA'],
      [/RECUPERA.*JUDICI/,'RECUPERAÇÃO JUDICIAL'],
    ];
    for(var i=0;i<m.length;i++) if(m[i][0].test(u)) return m[i][1];
    return c;
  }

  // ── Preenche modal com dados ──────────────────────────────
  function preencher(d) {
    if (!d) return;
    // ABA DADOS — IDs confirmados
    sv('f_auto',    d.f_auto||d.cnj);
    sv('cnj_input_api', d.f_auto||d.cnj);
    sv('f_acao',    d.f_acao);
    sv('f_vara',    d.f_vara);
    sv('f_comarca', d.f_comarca);
    selByVal('f_status', d.f_status||'ativo');
    selResp(); // sempre Dr. Amilcar

    // ABA PARTES — IDs confirmados
    sv('f_parte1',  d.f_parte1);
    selByVal('f_polo', d.f_polo||'AUTOR');
    sv('f_exadv',   d.f_exadv);
    selByVal('f_tipo_adv', d.f_tipo_adv||'PF');
    sv('f_adv_adv', d.f_adv_adv);

    // Anotações
    if (d.f_anotacoes) {
      var anEl=document.getElementById('f_anotacoes');
      if (anEl&&!anEl.value) anEl.value=d.f_anotacoes.trim();
    }

    // Banner
    var b=document.getElementById('autoFillBanner');
    if(b){
      b.style.display='flex';
      b.innerHTML='<span style="color:var(--green)">✅ '+d.fonte+'</span> — '
        +'<strong>'+(d.f_parte1||'?')+'</strong>'
        +(d.f_exadv?' vs <strong>'+d.f_exadv+'</strong>':'')
        +' | Polo: '+d.f_polo+' | '+d.f_vara;
    }

    // Resultado visual
    var res=document.getElementById('cnj_resultado');
    if(res) res.innerHTML=renderCard(d);

    // Salva no LexDB
    salvarDB(d);

    // Drive
    if (d.f_parte1&&typeof LexAT!=='undefined'&&LexAT.DRIVE) {
      var np=(d.f_parte1+(d.f_exadv?' vs '+d.f_exadv:'')).slice(0,100);
      LexAT.DRIVE.criarPastaCliente(np).catch(function(){});
    }

    if(window.toast) window.toast('✅ '+d.fonte+' — dados preenchidos!','green');
  }

  function renderCard(d) {
    function c(l,v){if(!v)return'';return'<div style="background:var(--surface3);border-radius:6px;padding:5px 8px"><div style="font-size:9px;color:var(--text3)">'+l+'</div><div style="font-size:11px;color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+v+'</div></div>';}
    var fc=d.fonte.includes('DataJud')?'var(--green)':d.fonte.includes('Claude')?'var(--blue)':'var(--teal)';
    return '<div style="background:var(--surface2);border-radius:10px;padding:11px;margin-top:6px">'
      +'<div style="display:flex;justify-content:space-between;margin-bottom:8px">'
      +'<span style="color:'+fc+';font-size:12px;font-weight:600">'+d.fonte+'</span>'
      +'<span style="font-size:10px;color:var(--teal);background:rgba(62,207,207,.1);padding:2px 7px;border-radius:6px">'+(d.sigla||d.instancia||'')+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">'
      +c('⚖️ Tipo de Ação',d.f_acao)
      +c('🏛️ Vara / Órgão',d.f_vara)
      +c('📍 Comarca',d.f_comarca)
      +c('🏢 Tribunal',d.tribunal||d.instancia)
      +c('👤 Nosso Cliente',d.f_parte1)
      +c('🎯 Polo',d.f_polo)
      +c('⚔️ Parte Adversa',d.f_exadv)
      +c('📊 Tipo Adverso',d.f_tipo_adv)
      +c('👨‍💼 Adv. Cliente',d.adv_cliente)
      +c('⚖️ Adv. Adverso',d.f_adv_adv)
      +c('📅 Ajuizamento',d.data_inicio?d.data_inicio.slice(0,10):'')
      +c('📋 Assuntos',d.assuntos?d.assuntos.slice(0,50):'')
      +'</div>'
      +(d.ultima_mov?'<div style="margin-top:6px;font-size:10px;color:var(--text3)">📌 Ult.mov: '+d.ultima_mov.slice(0,80)+'</div>':'')
      +'</div>';
  }

  function salvarDB(d) {
    try {
      if(typeof LexSync==='undefined') return;
      var db=LexSync.DB, ex=db.findByCNJ(d.cnj);
      var obj={cnj:d.cnj,tipo_acao:d.f_acao,vara:d.f_vara,comarca:d.f_comarca,
        status:d.f_status||'ativo',polo_cliente:d.f_parte1,polo_processual:d.f_polo,
        ex_adverso:d.f_exadv,adv_adverso:d.f_adv_adv,adv_cliente:d.adv_cliente,
        instancia:d.instancia,tribunal:d.tribunal,assuntos:d.assuntos,
        fonte_consulta:d.fonte,updatedAt:new Date().toISOString()};
      if(ex) db.update(db.KEYS.processos,ex.id,obj);
      else{obj.id=db.newId('proc');obj.createdAt=new Date().toISOString();db.add(db.KEYS.processos,obj);}
    }catch(e){}
  }

  // ── consultarCNJ ──────────────────────────────────────────
  window.consultarCNJ = async function() {
    var cnjEl=document.getElementById('cnj_input_api')||document.getElementById('f_auto');
    var cnj=((cnjEl?cnjEl.value:'')||'').trim().replace(/\s/g,'');
    var btn=document.getElementById('btn_consultar_api');
    var res=document.getElementById('cnj_resultado');
    if(!cnj||cnj.length<15){if(window.toast)window.toast('⚠️ CNJ inválido','orange');return;}
    var p=parseCNJ(cnj);
    if(!p){if(window.toast)window.toast('⚠️ Formato CNJ inválido','orange');return;}
    var sig=(DJ[p.chave]||'tjpr').toUpperCase();
    if(btn){btn.innerHTML='⏳...';btn.disabled=true;}
    if(res)res.innerHTML='<span style="color:var(--teal)">🔍 DataJud '+sig+'...</span>';

    var d=null;

    // 1. DataJud
    try{ d=await buscarDJ(cnj); console.log('[CNJ]',d.f_acao,d.f_vara,d.f_parte1); }
    catch(e){ console.log('[CNJ DataJud]',e.message); if(res)res.innerHTML='<span style="color:var(--orange)">⚠️ '+e.message+'</span>'; }

    // 2. Claude IA
    if(!d&&getKey()){
      try{
        if(res)res.innerHTML='<span style="color:var(--blue)">🤖 Claude IA...</span>';
        var txt=await callClaude([{role:'user',content:'Processo '+cnj+'. J='+p.j+' TT='+p.tt+' Ano='+p.ano+'. Retorne APENAS JSON: {"tipo_acao":"","vara":"","comarca":"","estado":"","polo_ativo":"","polo_passivo":"","adv_adverso":"","status":"Em Andamento","instancia":"1 Grau","assuntos":""}'}],400);
        var r2=JSON.parse(txt.replace(/```json|```/g,'').trim());
        if(r2.tipo_acao||r2.vara||r2.polo_ativo){
          d={cnj:cnj,fonte:'Claude IA 🤖',sigla:sig,
            f_acao:r2.tipo_acao||'',f_auto:cnj,f_vara:r2.vara||'',
            f_comarca:(r2.comarca&&r2.estado)?r2.comarca+'/'+r2.estado:r2.comarca||'',
            f_status:'ativo',f_parte1:r2.polo_ativo||'',f_polo:'AUTOR',
            f_exadv:r2.polo_passivo||'',f_tipo_adv:'PF',f_adv_adv:r2.adv_adverso||'',
            f_anotacoes:r2.assuntos?'Assunto: '+r2.assuntos:'',
            instancia:r2.instancia||'1º Grau',tribunal:'',adv_cliente:'',
            data_inicio:'',assuntos:r2.assuntos||'',ultima_mov:'',nosso_cliente:r2.polo_ativo,adverso:r2.polo_passivo,polo_cliente:'AUTOR'};
        }
      }catch(e){console.log('[CNJ IA]',e.message);}
    }

    // 3. LexDB
    if(!d){
      try{
        if(typeof LexSync!=='undefined'){var db2=LexSync.DB.findByCNJ(cnj);
          if(db2)d={cnj:cnj,fonte:'LexDB 💾',sigla:sig,
            f_acao:db2.tipo_acao||'',f_auto:cnj,f_vara:db2.vara||'',
            f_comarca:db2.comarca||'',f_status:db2.status||'ativo',
            f_parte1:db2.polo_cliente||'',f_polo:db2.polo_processual||'AUTOR',
            f_exadv:db2.ex_adverso||'',f_tipo_adv:'PF',f_adv_adv:db2.adv_adverso||'',
            f_anotacoes:db2.assuntos?'Assunto: '+db2.assuntos:'',
            instancia:db2.instancia||'1º Grau',tribunal:db2.tribunal||'',
            adv_cliente:db2.adv_cliente||'',data_inicio:'',assuntos:db2.assuntos||'',ultima_mov:'',
            nosso_cliente:db2.polo_cliente,adverso:db2.ex_adverso,polo_cliente:db2.polo_processual||'AUTOR'};
        }
      }catch(e){}
    }

    if(!d){if(res)res.innerHTML='<span style="color:var(--orange)">❌ Não encontrado</span>';}
    else preencher(d);
    if(btn){btn.innerHTML='🔍 Consultar';btn.disabled=false;}
  };

  // ── Claude ───────────────────────────────────────────────
  async function callClaude(msgs, max) {
    var key=getKey(); if(!key) throw new Error('Sem API Key');
    var resp=await fetch(PROXY+'/claude',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:getModelo(),max_tokens:max||500,messages:msgs})});
    var data=await resp.json();
    if(data.error) throw new Error(data.error.message||'Erro');
    return (data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
  }

  // ── Criar processo de publicação ─────────────────────────
  window.lexCriarProc = async function(cnj, texto, fonte) {
    if(!cnj) return null;
    var d=null;
    try{ d=await buscarDJ(cnj); }catch(e){}
    if(!d){
      var p=parseCNJ(cnj); var ctx=(texto||'');
      var idxC=ctx.indexOf(cnj); if(idxC>=0) ctx=ctx.slice(Math.max(0,idxC-400),idxC+600);
      d={cnj:cnj,fonte:'E-mail',sigla:p?(DJ[p.chave]||'tjpr').toUpperCase():'?',
        f_acao:'',f_auto:cnj,
        f_vara:(ctx.match(/(\d+[ªº]?\s*(?:Vara|VARA)[^\n,]{0,60})/i)||[])[1]||'',
        f_comarca:'',f_status:'ativo',
        f_parte1:(ctx.match(/(?:AUTOR[A]?|RECLAMANTE|EXEQUENTE)[:\s]+([A-ZÁÉÍÓÚ][^\n,]{3,60})/i)||[])[1]||'',
        f_polo:'AUTOR',
        f_exadv:(ctx.match(/(?:RÉU|RECLAMAD[OA]|EXECUTAD[OA])[:\s]+([A-ZÁÉÍÓÚ][^\n,]{3,60})/i)||[])[1]||'',
        f_tipo_adv:'PF',f_adv_adv:'',f_anotacoes:'',
        instancia:'1º Grau',tribunal:'',adv_cliente:'',data_inicio:'',
        assuntos:'',ultima_mov:(ctx.match(/(?:Publica|Decis|Despacho|Senten)[^\n]{5,100}/i)||[])[0]||'',
        nosso_cliente:'',adverso:'',polo_cliente:'AUTOR'};
    }

    // Verifica duplicata
    var existe=false;
    try{if(typeof LexSync!=='undefined'&&LexSync.DB.findByCNJ(cnj))existe=true;}catch(e){}
    if(typeof XLS2_DATA!=='undefined')
      if(XLS2_DATA.some(function(r){return(r[2]||'').replace(/[.\-]/g,'')===cnj.replace(/[.\-]/g,'');})) existe=true;

    // Ficha
    var mx=0;
    if(typeof XLS2_DATA!=='undefined') XLS2_DATA.forEach(function(r){var n=parseInt((r[0]||'').replace(/\D/g,''));if(!isNaN(n)&&n>mx)mx=n;});
    try{if(typeof LexSync!=='undefined') LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){var n=parseInt((p.ficha||'').replace(/\D/g,''));if(!isNaN(n)&&n>mx)mx=n;});}catch(e){}
    var ficha='A'+String(mx+1).padStart(4,'0');

    // Salva
    try{
      if(typeof LexSync!=='undefined'&&!existe){
        var db=LexSync.DB;
        db.add(db.KEYS.processos,{
          id:db.newId('proc'),cnj:cnj,ficha:ficha,tipo_acao:d.f_acao,vara:d.f_vara,
          comarca:d.f_comarca,status:'ativo',polo_cliente:d.f_parte1,polo_processual:d.f_polo,
          ex_adverso:d.f_exadv,adv_adverso:d.f_adv_adv,adv_cliente:d.adv_cliente,
          instancia:d.instancia,tribunal:d.tribunal,assuntos:d.assuntos,
          fonte_criacao:fonte||'publicacao',
          movimentos:d.ultima_mov?[{data:new Date().toLocaleDateString('pt-BR'),descricao:d.ultima_mov}]:[],
          createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
        });
      }
    }catch(e){}

    // Prazo 5 dias
    var v=new Date(); v.setDate(v.getDate()+5); var vBR=v.toLocaleDateString('pt-BR');
    try{
      if(typeof LexSync!=='undefined'){
        LexSync.DB.add(LexSync.DB.KEYS.prazos,{
          id:LexSync.DB.newId('prazo'),cnj:cnj,ficha:ficha,
          cliente:d.f_parte1,tipo:'Manifestação — 5 dias',
          dias:5,fundamento:'Prazo automático de publicação',urgencia:'alta',
          vencimento:vBR,vencimentoISO:v.toISOString().slice(0,10),
          status:'pendente',createdAt:new Date().toISOString()
        });
      }
    }catch(e){}
    try{
      if(typeof LexAT!=='undefined'&&LexAT.CALENDAR&&d.f_parte1){
        LexAT.CALENDAR.criarPrazoFatal({tipo:'Manifestação',cliente:d.f_parte1,
          processo:cnj,data:vBR,vara:d.f_vara||'',advogado:'Dr. Amilcar Cordeiro Teixeira Filho'
        }).catch(function(){});
      }
    }catch(e){}
    try{
      if(d.f_parte1&&typeof LexAT!=='undefined'&&LexAT.DRIVE)
        LexAT.DRIVE.criarPastaCliente((ficha+' — '+d.f_parte1+(d.f_exadv?' vs '+d.f_exadv:'')).slice(0,100)).catch(function(){});
    }catch(e){}

    if(!existe&&window.toast) window.toast('✨ '+ficha+': '+d.f_parte1+' | prazo '+vBR,'teal');
    return {ficha:ficha,dados:d,novo:!existe};
  };

  // ── Hook AutoFill ─────────────────────────────────────────
  setTimeout(function(){
    if(typeof LexSync==='undefined'||!LexSync.AutoFill) return;
    var orig=LexSync.AutoFill.processarPublicacao.bind(LexSync.AutoFill);
    LexSync.AutoFill.processarPublicacao=function(parsed){
      var r=orig(parsed)||{novos:[],atualizados:[],erros:[]};
      if(parsed&&parsed.processos){
        parsed.processos.forEach(function(proc,i){
          if(!proc.cnj) return;
          setTimeout(function(){
            window.lexCriarProc(proc.cnj,proc.raw||'',parsed.fonte).catch(function(){});
          },(i+1)*1500);
        });
      }
      return r;
    };
  },2000);

  // ── Testar Claude ─────────────────────────────────────────
  if(window.LexAT){
    window.LexAT.testarIA = async function() {
      var st = document.getElementById('lexat_status');
      var key = getKey();
      if (!key) {
        if(st) st.innerHTML = '❌ Cole a API Key sk-ant-... e clique Salvar Tudo';
        if(window.toast) window.toast('⚠️ Configure a API Key Claude','orange');
        return;
      }
      if(st) st.innerHTML = '🔍 Testando Claude...';
      var bodyStr = JSON.stringify({model:getModelo(),max_tokens:60,messages:[{role:'user',content:'OK!'}]});
      var sucesso = false;

      // Tentativa 1: via proxy Worker
      try {
        var r1 = await fetch(PROXY+'/claude',{method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'anthropic-version':'2023-06-01'},
          body:bodyStr});
        var d1 = await r1.json();
        if (d1.content && d1.content[0]) {
          if(st) st.innerHTML = '✅ Claude OK via Worker — '+getModelo().replace('claude-','')+' — '+d1.content[0].text;
          if(window.toast) window.toast('✅ Claude funcionando!','green');
          var b=document.getElementById('badge-claude');if(b){b.textContent='Ativo ✅';b.className='badge bteal';}
          sucesso = true;
        } else if (d1.error) {
          var m1 = d1.error.message||'';
          if (m1.includes('credit')) { if(st) st.innerHTML='❌ Saldo insuficiente — console.anthropic.com/billing'; sucesso=true; }
          else if (m1.includes('key')||m1.includes('invalid')) { if(st) st.innerHTML='❌ API Key inválida'; sucesso=true; }
        }
      } catch(e1) {}

      // Tentativa 2: direto na API Anthropic
      if (!sucesso) {
        try {
          var r2 = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
            headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
            body:bodyStr});
          var d2 = await r2.json();
          if (d2.content && d2.content[0]) {
            if(st) st.innerHTML = '✅ Claude OK (direto) — '+getModelo().replace('claude-','');
            if(window.toast) window.toast('✅ Claude funcionando!','green');
            var b2=document.getElementById('badge-claude');if(b2){b2.textContent='Ativo ✅';b2.className='badge bteal';}
            sucesso = true;
          } else if (d2.error) {
            if(st) st.innerHTML = '❌ '+d2.error.message;
            if(window.toast) window.toast('❌ '+d2.error.message.slice(0,50),'red');
            sucesso = true;
          }
        } catch(e2) {}
      }

      if (!sucesso) {
        if(st) st.innerHTML = '⚠️ Worker desatualizado — <a href="https://dash.cloudflare.com" target="_blank" style="color:var(--teal)">Atualize em dash.cloudflare.com</a>';
        if(window.toast) window.toast('⚠️ Atualize o Cloudflare Worker','orange');
      }
    };
  }

  // ── Novo processo ─────────────────────────────────────────
  function novoProc(){
    if(typeof openModal==='function') openModal('mProcesso');
    setTimeout(function(){
      if(typeof switchTab==='function') switchTab('dados');
      var mx=0;
      if(typeof XLS2_DATA!=='undefined') XLS2_DATA.forEach(function(r){var n=parseInt((r[0]||'').replace(/\D/g,''));if(!isNaN(n)&&n>mx)mx=n;});
      try{if(typeof LexSync!=='undefined') LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){var n=parseInt((p.ficha||'').replace(/\D/g,''));if(!isNaN(n)&&n>mx)mx=n;});}catch(e){}
      var f='A'+String(mx+1).padStart(4,'0');
      ['f_acao','f_auto','f_vara','f_comarca','f_parte1','f_exadv',
       'f_cpf_cli','f_qual_cli','f_cpf_adv','f_qual_adv','f_adv_adv','f_anotacoes']
        .forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
      sv('f_proc',f);
      selByVal('f_polo','AUTOR'); selByVal('f_tipo_adv','PF'); selByVal('f_status','ativo');
      selResp();
      var b=document.getElementById('autoFillBanner');
      if(b){b.style.display='flex';b.innerHTML='✨ Novo — <strong>'+f+'</strong> — Digite o CNJ e Enter';}
      var ci=document.getElementById('cnj_input_api');
      if(ci)setTimeout(function(){ci.focus();},200);
    },200);
  }

  // ── abrirProcessoXLS2 melhorado ──────────────────────────
  var _origAb=window.abrirProcessoXLS2;
  window.abrirProcessoXLS2=function(r){
    if(_origAb)_origAb(r);
    setTimeout(function(){
      try{
        var row=typeof r==='string'?JSON.parse(r):(r||[]);
        selResp();
        if(!((document.getElementById('f_parte1')||{}).value)&&row[7]) sv('f_parte1',row[7]);
        if(!((document.getElementById('f_exadv') ||{}).value)&&row[9]){
          sv('f_exadv',row[9]);
          selByVal('f_tipo_adv',/LTDA|S\.A|EIRELI|ME |EPP/i.test(row[9]||'')?'PJ':'PF');
        }
        var cnj=((document.getElementById('f_auto')||{}).value||'');
        var acao=((document.getElementById('f_acao')||{}).value||'');
        if(cnj&&!acao){sv('cnj_input_api',cnj);setTimeout(function(){window.consultarCNJ();},400);}
      }catch(e){}
    },350);
  };

  // ── Validação ao salvar ──────────────────────────────────
  var _origSalv=window.salvarProcesso;
  window.salvarProcesso=function(){
    var g=function(id){return((document.getElementById(id)||{}).value||'').trim();};
    var er=[{id:'f_proc',n:'Ficha'},{id:'f_auto',n:'CNJ'},{id:'f_acao',n:'Tipo de Ação'},{id:'f_parte1',n:'Cliente'}]
      .filter(function(c){return!g(c.id);});
    if(er.length){
      if(window.toast)window.toast('⚠️ Obrigatório: '+er.map(function(c){return c.n;}).join(' · '),'orange');
      er.forEach(function(c){var el=document.getElementById(c.id);if(el){el.style.borderColor='var(--red)';setTimeout(function(){el.style.borderColor='';},3000);}});
      if(typeof switchTab==='function'){if(!g('f_proc')||!g('f_auto')||!g('f_acao'))switchTab('dados');else switchTab('partes');}
      return;
    }
    if(_origSalv)_origSalv();
  };

  // ── Publicações ───────────────────────────────────────────
  var _origInb=window.carregarInbox;
  var _inboxRunning=false;
  window.carregarInbox=function(){
    if(_inboxRunning)return;
    _inboxRunning=true;
    try{ if(_origInb)_origInb(); }catch(e){ console.warn('[inbox]',e); }
    setTimeout(function(){
      _inboxRunning=false;
      var el=document.getElementById('inboxList');if(!el)return;
      var pubs=[];
      try{if(typeof LexSync!=='undefined')pubs=(LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).slice(-60).reverse();}catch(e){}
      if(!pubs.length)return;
      var html='';
      pubs.forEach(function(pub){
        var isJB=pub.fonte==='jusbrasil';
        var data=(pub.data||pub.timestamp||'').slice(0,10).split('-').reverse().join('/');
        var pubDiv = '<div class="ditem" style="flex-direction:column;gap:3px;margin-bottom:5px;cursor:pointer" data-pubid="' + pub.id + '">';
        html += pubDiv
          +'<div style="display:flex;align-items:center;gap:7px;width:100%">'
          +'<span class="badge '+(isJB?'bo':'bteal')+'" style="font-size:10px">'+(isJB?'JusBrasil':'Impacta')+'</span>'
          +(pub.cnj?'<span style="font-size:10px;color:var(--teal)">'+pub.cnj+'</span>':'')
          +'<span style="font-size:10px;color:var(--text3);margin-left:auto">'+data+'</span>'
          +'</div>'
          +((pub.movimento||pub.raw||'').slice(0,80)?'<div style="font-size:11px;color:var(--text2);padding-left:2px">'+(pub.movimento||pub.raw||'').slice(0,80)+'</div>':'')
          +'</div>';
      });
      if(html)el.innerHTML=html;
    },400);
  };

  window.lexVerPub=function(pubId){
    try{
      var pub=(LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).find(function(p){return p.id===pubId;});
      if(!pub)return;
      var be=document.getElementById('emailBody');if(be)be.value=pub.raw||pub.movimento||'';
      var re=document.getElementById('emailRem');if(re)re.value=pub.fonte||'impacta';
      if(window.toast)window.toast('📋 Cole processado — clique Extrair & Processar','blue');
    }catch(e){}
  };

  // ── CSS ───────────────────────────────────────────────────
  if(!document.getElementById('lex-css')){
    var s=document.createElement('style');s.id='lex-css';
    s.textContent='.af{border-color:var(--teal)!important;background:rgba(62,207,207,.04)!important;}';
    document.head.appendChild(s);
  }

  // ── Init ──────────────────────────────────────────────────
  function hookNovo(){
    var btn=document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
    if(!btn||btn._h)return;
    btn._h=true;btn.setAttribute('onclick','');
    btn.addEventListener('click',function(e){e.preventDefault();novoProc();});
  }

  function init(){
    hookNovo();
    // Hook go() de forma segura — sem sobrescrever
    var _goOrig = window.go;
    document.addEventListener('lex:navigate', function(evt) {
      var pg = evt && evt.detail && evt.detail.page;
      if(pg==='processos') setTimeout(hookNovo, 400);
      if(pg==='emails') setTimeout(function(){ if(typeof carregarInbox==='function') carregarInbox(); }, 500);
      if(pg==='dashboard') setTimeout(function(){ if(typeof renderPrazosDash==='function') renderPrazosDash(); }, 300);
    });
    console.log('[LexOfficeAT v4.0] ✅ IDs confirmados: f_proc f_acao f_auto f_vara f_comarca f_resp f_parte1 f_polo f_exadv f_tipo_adv f_adv_adv f_anotacoes');
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',function(){setTimeout(init,900);}):setTimeout(init,900);
})();

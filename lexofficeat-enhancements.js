/**
 * LexOfficeAT — Enhancements v3.1 FINAL
 * Foco: DataJud completo + publicações → processos automáticos
 */
(function() {
  'use strict';

  var PROXY = localStorage.getItem('lex_datajud_proxy') ||
              'https://lexoffice-datajud.amilcaradvocacia.workers.dev';

  // Mapa J.TT → sigla DataJud
  var DJ_SIGLAS = {
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
    '4.01':'trf1','4.02':'trf2','4.03':'trf3','4.04':'trf4','4.05':'trf5','4.06':'trf6',
    '3.00':'stj','1.00':'stf','5.00':'tst','6.00':'tse','7.00':'stm'
  };

  // Nomes legíveis dos tribunais
  var TRIB_NOMES = {
    '8.16':'TJPR — Tribunal de Justiça do Paraná',
    '5.09':'TRT 9ª Região — Paraná/MS',
    '5.04':'TRT 4ª Região — Rio Grande do Sul',
    '5.02':'TRT 2ª Região — São Paulo',
    '4.04':'TRF 4ª Região — Sul',
    '3.00':'STJ — Superior Tribunal de Justiça',
    '5.00':'TST — Tribunal Superior do Trabalho',
    '1.00':'STF — Supremo Tribunal Federal',
  };

  function getKey()    { return localStorage.getItem('lex_anthropic_key') || ''; }
  function getModelo() { return localStorage.getItem('lex_claude_modelo') || 'claude-sonnet-4-20250514'; }

  function fill(id, val) {
    if (val === undefined || val === null || val === '') return;
    var el = document.getElementById(id);
    if (!el) return;
    el.value = String(val).trim();
    el.classList.add('af');
    el.dispatchEvent(new Event('input',  {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function fillSel(id, val) {
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'SELECT' || !val) return;
    var v = val.toString().toUpperCase();
    for (var i = 0; i < el.options.length; i++) {
      var ot = el.options[i].text.toUpperCase();
      var ov = el.options[i].value.toUpperCase();
      if (ov === v || ot === v || ot.startsWith(v.slice(0,4)) || v.includes(ov.slice(0,4))) {
        el.selectedIndex = i;
        el.classList.add('af');
        el.dispatchEvent(new Event('change',{bubbles:true}));
        return;
      }
    }
  }

  function fillAdv(id, nome) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      var nomeLow = (nome||'').toLowerCase();
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].text.toLowerCase().includes(nomeLow.slice(0,6))) {
          el.selectedIndex = i;
          el.dispatchEvent(new Event('change',{bubbles:true}));
          return;
        }
      }
    } else {
      fill(id, nome);
    }
  }

  function parseCNJ(cnj) {
    var c = (cnj||'').replace(/[\s]/g,'');
    var m = c.match(/^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/);
    if (!m) return null;
    return { n:m[1], d:m[2], ano:m[3], j:m[4], tt:m[5], o:m[6],
             raw:c, chave:m[4]+'.'+m[5] };
  }

  function mapTipo(c) {
    if (!c) return '';
    var u = c.toUpperCase();
    var mapa = [
      [/RECLAMAT|TRABALHIST/,'RECLAMATÓRIA TRABALHISTA'],
      [/EXECU.*TRAB|EXECU.*CLT/,'EXECUÇÃO TRABALHISTA'],
      [/EXECU.*FISCAL/,'EXECUÇÃO FISCAL'],
      [/CUMPRI.*SENTEN/,'CUMPRIMENTO DE SENTENÇA'],
      [/INDENIZ|DANO.*MORAL/,'AÇÃO DE INDENIZAÇÃO'],
      [/COBRAN/,'AÇÃO DE COBRANÇA'],
      [/DESPEJO/,'AÇÃO DE DESPEJO'],
      [/ALIMENT/,'AÇÃO DE ALIMENTOS'],
      [/DIV[OÓ]RCIO/,'AÇÃO DE DIVÓRCIO'],
      [/INVENT[AÁ]RIO/,'INVENTÁRIO'],
      [/HABEAS.*CORPUS/,'HABEAS CORPUS'],
      [/MANDADO.*SEGUR/,'MANDADO DE SEGURANÇA'],
      [/RECUPERA.*JUDICI/,'RECUPERAÇÃO JUDICIAL'],
      [/USUCAP/,'USUCAPIÃO'],
      [/REVISIONAL/,'AÇÃO REVISIONAL'],
      [/MONITÓ|MONITOR/,'AÇÃO MONITÓRIA'],
    ];
    for (var i=0;i<mapa.length;i++) if(mapa[i][0].test(u)) return mapa[i][1];
    return c;
  }

  function normStatus(sit) {
    var s=((sit&&sit.nome)||sit||'').toUpperCase();
    if(/BAIXAD|ARQUIVAD/.test(s)) return 'Arquivado';
    if(/SUSPEN/.test(s)) return 'Suspenso';
    return 'Em Andamento';
  }

  // ── Normaliza retorno do DataJud em objeto completo ──────
  function normDJ(src, cnj, chave) {
    if (!src) return null;
    var pArr = src.partes     || [];
    var aArr = src.advogados  || [];
    var sArr = src.assuntos   || [];
    var mArr = src.movimentos || [];

    // Identifica partes por polo
    var autor = pArr.find(function(p){ return /ATIVO|AUTOR|RECLAMANTE|EXEQUENTE|IMPETRANTE|REQUERENTE/i.test(p.polo||''); });
    var reu   = pArr.find(function(p){ return /PASSIVO|R[EÉ]U|RECLAMADO|EXECUTAD|IMPETRADO|REQUERIDO/i.test(p.polo||''); });

    // Identifica Dr. Amilcar e seu polo
    var amilcar = aArr.find(function(a){ return a.nome && a.nome.toLowerCase().includes('amilcar'); });
    var amilcarAtivo = !amilcar || /ATIVO|AUTOR|RECLAMANTE/i.test((amilcar&&amilcar.polo)||'ATIVO');

    // Nosso cliente = parte representada por Amilcar
    var nossoCliente = amilcarAtivo ? (autor&&autor.nome)||'' : (reu&&reu.nome)||'';
    var adverso      = amilcarAtivo ? (reu&&reu.nome)||''    : (autor&&autor.nome)||'';
    var poloCliente  = amilcarAtivo ? 'AUTOR' : 'RÉU';

    // Advogados por polo
    var advsAtivo   = aArr.filter(function(a){ return /ATIVO|AUTOR|RECLAMANTE/i.test(a.polo||''); });
    var advsPassivo = aArr.filter(function(a){ return /PASSIVO|R[EÉ]U|RECLAMADO/i.test(a.polo||''); });
    var advCliente  = advsAtivo.map(function(a){ return a.nome+(a.numeroOAB?' — OAB '+a.numeroOAB:''); }).join('; ');
    var advAdverso  = advsPassivo.map(function(a){ return a.nome+(a.numeroOAB?' — OAB '+a.numeroOAB:''); }).join('; ');

    // Órgão julgador detalhado → Vara
    var orgao   = (src.orgaoJulgador&&src.orgaoJulgador.nome)||'';
    var comarca = (src.municipio&&src.municipio.nome)||'';
    var estado  = (src.tribunal&&src.tribunal.uf)||'PR';
    var tribNome= (src.tribunal&&src.tribunal.nome)||(TRIB_NOMES[chave]||'');

    // Grau de jurisdição
    var grau = src.grau || '';
    var instancia = grau === 'G2' ? '2º Grau' :
                    grau === 'SUP' ? 'Tribunal Superior' :
                    grau === 'JE' ? 'Juizado Especial' : '1º Grau';

    return {
      cnj:           cnj,
      fonte:         'DataJud ✅',
      tipo_acao:     mapTipo((src.classe&&src.classe.nome)||''),
      classe_orig:   (src.classe&&src.classe.nome)||'',
      vara:          orgao,
      comarca:       comarca,
      estado:        estado,
      comarca_uf:    comarca && estado ? comarca+'/'+estado : (comarca||estado),
      tribunal:      tribNome,
      instancia:     instancia,
      grau:          grau,
      status:        normStatus(src.situacao),
      nosso_cliente: nossoCliente,
      adverso:       adverso,
      polo_cliente:  poloCliente,
      polo_ativo:    autor ? autor.nome : '',
      polo_passivo:  reu   ? reu.nome   : '',
      adv_cliente:   advCliente,
      adv_adverso:   advAdverso,
      advogados:     aArr,
      data_inicio:   src.dataAjuizamento||'',
      assuntos:      sArr.map(function(a){return a.nome;}).join(', '),
      movimentos:    mArr.slice(0,5).map(function(m){return{data:m.dataHora,desc:m.nome};}),
      ultima_mov:    mArr.length ? mArr[0].nome : '',
    };
  }

  // ── Busca no DataJud ──────────────────────────────────────
  async function dj(cnj) {
    var p = parseCNJ(cnj);
    if (!p) throw new Error('CNJ inválido');
    var sigla = DJ_SIGLAS[p.chave] || 'tjpr';
    var body  = JSON.stringify({ query:{ bool:{ should:[
      { match: { numeroProcesso: cnj } },
      { term:  { 'numeroProcesso.keyword': cnj } }
    ]}}, size:1 });
    var url = PROXY + '/api_publica_' + sigla + '/_search';
    var resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:body });
    if (!resp.ok) { var t=await resp.text(); throw new Error('HTTP '+resp.status+': '+t.slice(0,80)); }
    var data = await resp.json();
    var hits = data && data.hits && data.hits.hits;
    if (!hits || !hits.length) throw new Error('Não encontrado em '+sigla.toUpperCase());
    return normDJ(hits[0]._source, cnj, p.chave);
  }

  // ── Claude via Worker ─────────────────────────────────────
  async function claude(messages, max) {
    var key = getKey();
    if (!key) throw new Error('Sem API Key Claude');
    var resp = await fetch(PROXY+'/claude', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({ model:getModelo(), max_tokens:max||600, messages:messages })
    });
    var data = await resp.json();
    if (data.error) throw new Error(data.error.message||JSON.stringify(data.error));
    return (data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
  }

  // ── Preenche TODOS os campos do modal ─────────────────────
  function preencher(d) {
    if (!d) return;

    // ABA DADOS
    fill('f_auto',    d.cnj);
    fill('cnj_input_api', d.cnj);
    fill('f_acao',    d.tipo_acao);
    fill('f_vara',    d.vara);
    fill('f_comarca', d.comarca_uf || d.comarca);
    if (d.instancia)  fill('f_instancia', d.instancia);
    if (d.tribunal)   fill('f_tribunal',  d.tribunal);

    // Status
    fillSel('f_status', d.status);

    // Advogado responsável → Dr. Amilcar automaticamente
    var respEl = document.getElementById('f_resp');
    if (respEl) {
      for (var i=0;i<respEl.options.length;i++) {
        if (respEl.options[i].text.toLowerCase().includes('amilcar')) {
          respEl.selectedIndex=i;
          respEl.dispatchEvent(new Event('change',{bubbles:true}));
          break;
        }
      }
    }

    // Data de ajuizamento
    if (d.data_inicio) {
      var dtEl = document.getElementById('f_data')||document.getElementById('f_data_inicio');
      if (dtEl) {
        var dt = new Date(d.data_inicio);
        if (!isNaN(dt)) fill(dtEl.id, dt.toLocaleDateString('pt-BR'));
      }
    }

    // ABA PARTES
    fill('f_parte1',  d.nosso_cliente || d.polo_ativo);
    fill('f_exadv',   d.adverso || d.polo_passivo);
    fillSel('f_polo', d.polo_cliente || 'AUTOR');

    // Tipo adverso PF/PJ
    var adv = d.adverso || d.polo_passivo || '';
    var isPJ = /LTDA|S\.A|EIRELI|\bME\b|\bEPP\b|SOCIEDADE|EMPRESA|CIA\.|COMPANHIA|BANCO|INST\.|FUND\.|ESTADO\b|MUNIC[IÍ]PIO|PREF\.|UNIV/i.test(adv);
    fillSel('f_tipo_adv', isPJ ? 'PJ' : 'PF');

    // Advogado do adverso
    fill('f_adv_adv', d.adv_adverso);

    // Anotações com assunto + última movimentação
    var anEl = document.getElementById('f_anotacoes');
    if (anEl && !anEl.value) {
      var txt = '';
      if (d.assuntos)   txt += 'Assunto: ' + d.assuntos + '\n';
      if (d.ultima_mov) txt += 'Última mov.: ' + d.ultima_mov + '\n';
      if (d.tribunal)   txt += 'Tribunal: ' + d.tribunal;
      if (txt) anEl.value = txt.trim();
    }

    // Salva no LexDB
    try {
      if (typeof LexSync !== 'undefined') {
        var db = LexSync.DB;
        var ex = db.findByCNJ(d.cnj);
        var dados = {
          cnj:d.cnj, tipo_acao:d.tipo_acao, vara:d.vara,
          comarca:d.comarca_uf||d.comarca, status:d.status,
          polo_cliente:d.nosso_cliente||d.polo_ativo,
          polo_processual:d.polo_cliente,
          ex_adverso:d.adverso||d.polo_passivo,
          adv_adverso:d.adv_adverso, adv_cliente:d.adv_cliente,
          instancia:d.instancia, tribunal:d.tribunal,
          assuntos:d.assuntos, fonte_consulta:d.fonte,
          updatedAt:new Date().toISOString()
        };
        if (ex) db.update(db.KEYS.processos, ex.id, dados);
        else { dados.id=db.newId('proc'); dados.createdAt=new Date().toISOString(); db.add(db.KEYS.processos,dados); }
      }
    } catch(e) {}

    // Pasta Drive
    if ((d.nosso_cliente||d.polo_ativo) && typeof LexAT !== 'undefined' && LexAT.DRIVE) {
      var np = ((d.nosso_cliente||d.polo_ativo) + (d.adverso?' vs '+d.adverso:'')).slice(0,100);
      LexAT.DRIVE.criarPastaCliente(np).catch(function(){});
    }

    // Exibe resultado visual
    var res = document.getElementById('cnj_resultado');
    if (res) res.innerHTML = renderResultado(d);

    if (window.toast) window.toast('✅ '+d.fonte+' — preenchido!','green');
  }

  function renderResultado(d) {
    var fc = d.fonte.includes('DataJud')?'var(--green)':d.fonte.includes('Claude')?'var(--blue)':'var(--teal)';
    function c(l,v){ if(!v) return ''; return '<div style="background:var(--surface3);border-radius:6px;padding:5px 8px"><div style="font-size:9px;color:var(--text3)">'+l+'</div><div style="font-size:11px;color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+v+'">'+v+'</div></div>'; }
    return '<div style="background:var(--surface2);border-radius:10px;padding:11px;margin-top:6px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      +'<span style="color:'+fc+';font-size:12px;font-weight:600">'+d.fonte+'</span>'
      +'<span style="font-size:10px;color:var(--text3)">'+d.instancia+'</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px">'
      +c('⚖️ Tipo de Ação', d.tipo_acao)
      +c('🏛️ Vara / Órgão Julgador', d.vara)
      +c('📍 Comarca/Município', d.comarca_uf||d.comarca)
      +c('🏢 Tribunal', d.tribunal)
      +c('👤 Nosso Cliente', d.nosso_cliente||d.polo_ativo)
      +c('🎯 Polo do Cliente', d.polo_cliente)
      +c('⚔️ Parte Adversa', d.adverso||d.polo_passivo)
      +c('📊 Status', d.status)
      +c('👨‍💼 Adv. do Cliente', d.adv_cliente)
      +c('⚖️ Adv. da Parte Adversa', d.adv_adverso)
      +c('📅 Ajuizamento', d.data_inicio?d.data_inicio.slice(0,10):'')
      +c('📋 Assuntos', d.assuntos?d.assuntos.slice(0,60):'')
      +'</div>'
      +(d.ultima_mov?'<div style="margin-top:6px;font-size:10px;color:var(--text3)">📌 '+d.ultima_mov.slice(0,80)+'</div>':'')
      +'</div>';
  }

  // ── consultarCNJ principal ────────────────────────────────
  window.consultarCNJ = async function() {
    var cnjEl = document.getElementById('cnj_input_api')||document.getElementById('f_auto');
    var cnj   = ((cnjEl?cnjEl.value:'')||'').trim();
    var btn   = document.getElementById('btn_consultar_api');
    var res   = document.getElementById('cnj_resultado');
    if (!cnj||cnj.length<15){ if(window.toast)window.toast('⚠️ CNJ inválido','orange'); return; }
    var p = parseCNJ(cnj);
    if (!p){ if(window.toast)window.toast('⚠️ Formato inválido','orange'); return; }
    var sigla = (DJ_SIGLAS[p.chave]||'tjpr').toUpperCase();
    if(btn){btn.innerHTML='⏳...';btn.disabled=true;}
    if(res) res.innerHTML='<span style="color:var(--teal)">🔍 Consultando '+sigla+' via DataJud...</span>';

    var dados = null;

    // 1. DataJud
    try {
      dados = await dj(cnj);
      console.log('[CNJ DataJud]', dados.tipo_acao, '|', dados.vara, '|', dados.nosso_cliente);
    } catch(e) {
      console.log('[CNJ DataJud erro]', e.message);
      if(res) res.innerHTML='<span style="color:var(--orange)">⚠️ DataJud: '+e.message+' — tentando IA...</span>';
    }

    // 2. Claude IA
    if (!dados && getKey()) {
      try {
        if(res) res.innerHTML='<span style="color:var(--blue)">🤖 Buscando via Claude IA...</span>';
        var txt = await claude([{role:'user',content:
          'Processo '+cnj+'. Extraia do número: J='+p.j+' TT='+p.tt+' Ano='+p.ano+'.\n'+
          'Retorne APENAS JSON válido:\n'+
          '{"tipo_acao":"","vara":"","comarca":"","estado":"PR","polo_ativo":"","polo_passivo":"","adv_cliente":"","adv_adverso":"","status":"Em Andamento","instancia":"1º Grau","assuntos":""}'}], 400);
        var r2 = JSON.parse(txt.replace(/```json|```/g,'').trim());
        if (r2.tipo_acao||r2.vara||r2.polo_ativo) {
          dados = Object.assign({ cnj:cnj, fonte:'Claude IA 🤖',
            nosso_cliente:r2.polo_ativo||'', adverso:r2.polo_passivo||'',
            polo_cliente:'AUTOR', comarca_uf:(r2.comarca&&r2.estado)?r2.comarca+'/'+r2.estado:'',
            advogados:[], movimentos:[], ultima_mov:'' }, r2);
        }
      } catch(e){ console.log('[CNJ IA erro]', e.message); }
    }

    // 3. LexDB
    if (!dados) {
      try {
        if(typeof LexSync!=='undefined'){
          var db2 = LexSync.DB.findByCNJ(cnj);
          if(db2) dados={ cnj:cnj, fonte:'LexDB 💾',
            tipo_acao:db2.tipo_acao||'', vara:db2.vara||'', comarca:db2.comarca||'',
            comarca_uf:db2.comarca||'', status:db2.status||'Em Andamento',
            nosso_cliente:db2.polo_cliente||'', adverso:db2.ex_adverso||'',
            polo_cliente:db2.polo_processual||'AUTOR', adv_cliente:db2.adv_cliente||'',
            adv_adverso:db2.adv_adverso||'', instancia:db2.instancia||'1º Grau',
            tribunal:db2.tribunal||'', assuntos:db2.assuntos||'',
            data_inicio:'', movimentos:[], ultima_mov:'', advogados:[] };
        }
      } catch(e){}
    }

    if (!dados) {
      if(res) res.innerHTML='<span style="color:var(--orange)">❌ Não encontrado. Verifique o CNJ.</span>';
    } else {
      preencher(dados);
    }
    if(btn){btn.innerHTML='🔍 Consultar';btn.disabled=false;}
  };

  // ── Criar processo a partir de publicação ────────────────
  window.lexCriarDePublicacao = async function(cnj, textoEmail, fonteEmail) {
    var dados = null;

    // Tenta DataJud
    try { dados = await dj(cnj); } catch(e) {}

    // Extrai do texto do e-mail se DataJud falhou
    if (!dados && textoEmail) {
      var idx  = textoEmail.indexOf(cnj);
      var ctx  = textoEmail.slice(Math.max(0,idx-500), idx+600);
      var pCNJ = parseCNJ(cnj);
      dados = {
        cnj:          cnj,
        fonte:        'E-mail ' + (fonteEmail||''),
        tipo_acao:    '',
        vara:         (ctx.match(/(\d+[ªº°]?\s*(?:Vara|VARA)[^\n,]{0,60})/i)||[])[1]||'',
        comarca:      '',
        comarca_uf:   '',
        estado:       'PR',
        tribunal:     TRIB_NOMES[pCNJ?pCNJ.chave:'']||'',
        instancia:    '1º Grau',
        status:       'Em Andamento',
        polo_ativo:   (ctx.match(/(?:AUTOR[A]?|RECLAMANTE|EXEQUENTE|REQUERENTE)[:\s]+([A-ZÁÉÍÓÚÃÕÇ][^\n,]{3,60})/i)||[])[1]||'',
        polo_passivo: (ctx.match(/(?:RÉU|RECLAMAD[OA]|EXECUTAD[OA]|REQUERID[OA])[:\s]+([A-ZÁÉÍÓÚÃÕÇ][^\n,]{3,60})/i)||[])[1]||'',
        adv_cliente:  '',
        adv_adverso:  '',
        nosso_cliente:'',
        adverso:      '',
        polo_cliente: 'AUTOR',
        assuntos:     '',
        data_inicio:  '',
        movimentos:   [],
        ultima_mov:   (ctx.match(/(?:PUBLICAÇÃO|Publica[çc]ão|Decis|Despacho|Senten|Acord)[^\n]{5,120}/i)||[])[0]||'',
        advogados:    [],
      };
    }

    if (!dados) return null;

    // Determina nosso cliente pelo advogado Amilcar
    var amilcarAdv = dados.advogados && dados.advogados.find(function(a){
      return a.nome && a.nome.toLowerCase().includes('amilcar');
    });
    if (amilcarAdv) {
      var eAt = /ATIVO|AUTOR|RECLAMANTE/i.test(amilcarAdv.polo||'');
      dados.nosso_cliente = eAt ? dados.polo_ativo : dados.polo_passivo;
      dados.adverso       = eAt ? dados.polo_passivo : dados.polo_ativo;
      dados.polo_cliente  = eAt ? 'AUTOR' : 'RÉU';
    } else if (!dados.nosso_cliente) {
      dados.nosso_cliente = dados.polo_ativo;
      dados.adverso       = dados.polo_passivo;
    }

    // Verifica se já existe
    var existe = false;
    try { if(typeof LexSync!=='undefined'&&LexSync.DB.findByCNJ(cnj)) existe=true; } catch(e){}
    if(typeof XLS2_DATA!=='undefined' && XLS2_DATA.some(function(r){return (r[2]||'').replace(/[.\-]/g,'')===cnj.replace(/[.\-]/g,'');})) existe=true;

    // Gera ficha
    var maxN = 0;
    if(typeof XLS2_DATA!=='undefined') XLS2_DATA.forEach(function(r){var n=parseInt((r[0]||'').replace(/\D/g,''));if(!isNaN(n)&&n>maxN)maxN=n;});
    try{if(typeof LexSync!=='undefined') LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){var n=parseInt((p.ficha||'').replace(/\D/g,''));if(!isNaN(n)&&n>maxN)maxN=n;});}catch(e){}
    var ficha = 'A' + String(maxN+1).padStart(4,'0');

    // Salva no LexDB
    try {
      if(typeof LexSync!=='undefined'){
        var pObj = {
          id:LexSync.DB.newId('proc'), cnj:cnj, ficha:ficha,
          tipo_acao:dados.tipo_acao, vara:dados.vara,
          comarca:dados.comarca_uf||dados.comarca, status:dados.status,
          polo_cliente:dados.nosso_cliente, polo_processual:dados.polo_cliente,
          ex_adverso:dados.adverso, adv_adverso:dados.adv_adverso,
          adv_cliente:dados.adv_cliente, instancia:dados.instancia,
          tribunal:dados.tribunal, assuntos:dados.assuntos,
          fonte_criacao:fonteEmail||'publicacao',
          movimentos:dados.ultima_mov?[{data:new Date().toLocaleDateString('pt-BR'),descricao:dados.ultima_mov,fonte:fonteEmail||''}]:[],
          createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
        };
        if(!existe) LexSync.DB.add(LexSync.DB.KEYS.processos, pObj);
        else{
          var ex2=LexSync.DB.findByCNJ(cnj);
          if(ex2&&pObj.movimentos.length) LexSync.DB.update(LexSync.DB.KEYS.processos,ex2.id,{movimentos:pObj.movimentos,updatedAt:pObj.updatedAt});
        }
      }
    }catch(e){}

    // Prazo 5 dias para manifestação
    var venc=new Date(); venc.setDate(venc.getDate()+5);
    var vencBR=venc.toLocaleDateString('pt-BR');
    try{
      if(typeof LexSync!=='undefined'){
        LexSync.DB.add(LexSync.DB.KEYS.prazos,{
          id:LexSync.DB.newId('prazo'),cnj:cnj,ficha:ficha,
          cliente:dados.nosso_cliente,tipo:'Manifestação — 5 dias',
          dias:5,fundamento:'Prazo automático de publicação',urgencia:'alta',
          vencimento:vencBR,vencimentoISO:venc.toISOString().slice(0,10),
          status:'pendente',createdAt:new Date().toISOString()
        });
      }
    }catch(e){}

    // Calendar
    try{
      if(typeof LexAT!=='undefined'&&LexAT.CALENDAR){
        LexAT.CALENDAR.criarPrazoFatal({
          tipo:'Manifestação',cliente:dados.nosso_cliente||'Cliente',
          processo:cnj,data:vencBR,vara:dados.vara||'',
          advogado:'Dr. Amilcar Cordeiro Teixeira Filho'
        }).catch(function(){});
      }
    }catch(e){}

    // Drive
    if(dados.nosso_cliente&&typeof LexAT!=='undefined'&&LexAT.DRIVE){
      LexAT.DRIVE.criarPastaCliente((ficha+' — '+dados.nosso_cliente+(dados.adverso?' vs '+dados.adverso:'')).slice(0,100)).catch(function(){});
    }

    if(!existe&&window.toast) window.toast('✨ '+ficha+': '+dados.nosso_cliente+' — prazo '+vencBR,'teal');
    return {ficha:ficha, dados:dados, novo:!existe};
  };

  // ── Hook no processamento de e-mails do Gmail ────────────
  // Intercepta APÓS o parse para criar processos automaticamente
  setTimeout(function(){
    if(typeof LexSync==='undefined'||!LexSync.AutoFill) return;
    var origProc = LexSync.AutoFill.processarPublicacao.bind(LexSync.AutoFill);
    LexSync.AutoFill.processarPublicacao = function(parsed) {
      var resultado = origProc(parsed);
      resultado = resultado || {novos:[],atualizados:[],erros:[]};
      // Para cada processo extraído, tenta enriquecer via DataJud
      if (parsed && parsed.processos) {
        parsed.processos.forEach(function(proc){
          if (!proc.cnj) return;
          setTimeout(function(){
            window.lexCriarDePublicacao(proc.cnj, proc.raw||'', parsed.fonte)
              .catch(function(){});
          }, 1000 + Math.random()*2000); // distribui as chamadas
        });
      }
      return resultado;
    };
    console.log('[Enh] ✅ AutoFill hooked para criar processos via DataJud');
  }, 2000);

  // ── Testar Claude ─────────────────────────────────────────
  if(window.LexAT){
    window.LexAT.testarIA = async function(){
      var st=document.getElementById('lexat_status');
      if(!getKey()){if(st)st.innerHTML='❌ API Key não configurada';return;}
      if(st)st.innerHTML='🔍 Testando via Worker...';
      try{
        var txt=await claude([{role:'user',content:'Responda: Claude ativo no LexOfficeAT!'}],50);
        if(st)st.innerHTML='✅ Claude ativo! Modelo: '+getModelo().replace('claude-','')+' — '+txt;
        if(window.toast)window.toast('✅ Claude funcionando!','green');
        var b=document.getElementById('badge-claude');
        if(b){b.textContent='Ativo ✅';b.className='badge bteal';}
      }catch(e){
        if(st)st.innerHTML='❌ '+e.message;
        if(window.toast)window.toast('❌ '+e.message.slice(0,60),'red');
      }
    };
  }

  // ── Novo processo com ficha automática ───────────────────
  function novoProc(){
    if(typeof openModal==='function') openModal('mProcesso');
    setTimeout(function(){
      if(typeof switchTab==='function') switchTab('dados');
      var mx=0;
      if(typeof XLS2_DATA!=='undefined') XLS2_DATA.forEach(function(r){var n=parseInt((r[0]||'').replace(/\D/g,''));if(!isNaN(n)&&n>mx)mx=n;});
      try{if(typeof LexSync!=='undefined') LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){var n=parseInt((p.ficha||'').replace(/\D/g,''));if(!isNaN(n)&&n>mx)mx=n;});}catch(e){}
      var f='A'+String(mx+1).padStart(4,'0');
      ['f_acao','f_auto','f_vara','f_comarca','f_parte1','f_exadv','f_cpf_cli',
       'f_qual_cli','f_cpf_adv','f_qual_adv','f_adv_adv','f_anotacoes']
        .forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
      fill('f_proc',f);
      fillSel('f_polo','AUTOR'); fillSel('f_tipo_adv','PF'); fillSel('f_status','Em Andamento');
      var re=document.getElementById('f_resp');
      if(re)for(var i=0;i<re.options.length;i++){if(re.options[i].text.toLowerCase().includes('amilcar')){re.selectedIndex=i;break;}}
      var b=document.getElementById('autoFillBanner');
      if(b){b.style.display='flex';b.innerHTML='✨ Novo — <strong>'+f+'</strong> — Digite o CNJ e Enter';}
      var ci=document.getElementById('cnj_input_api');
      if(ci)setTimeout(function(){ci.focus();},200);
    },200);
  }

  // ── abrirProcessoXLS2 melhorado ──────────────────────────
  var _orig=window.abrirProcessoXLS2;
  window.abrirProcessoXLS2=function(r){
    if(_orig)_orig(r);
    setTimeout(function(){
      try{
        var row=typeof r==='string'?JSON.parse(r):(r||[]);
        var re=document.getElementById('f_resp');
        if(re&&!re.value)for(var i=0;i<re.options.length;i++){if(re.options[i].text.toLowerCase().includes('amilcar')){re.selectedIndex=i;break;}}
        if(!((document.getElementById('f_parte1')||{}).value)&&row[7]) fill('f_parte1',row[7]);
        if(!((document.getElementById('f_exadv') ||{}).value)&&row[9]){ fill('f_exadv',row[9]); var te=document.getElementById('f_tipo_adv'); if(te)te.value=/LTDA|S\.A|EIRELI|ME |EPP/i.test(row[9]||'')?'PJ':'PF'; }
        var cnj=((document.getElementById('f_auto')||{}).value||'');
        var acao=((document.getElementById('f_acao')||{}).value||'');
        if(cnj&&!acao){var ci=document.getElementById('cnj_input_api');if(ci)ci.value=cnj;setTimeout(function(){window.consultarCNJ();},400);}
      }catch(e){}
    },350);
  };

  // ── Validação ao salvar ──────────────────────────────────
  var _oSalv=window.salvarProcesso;
  window.salvarProcesso=function(){
    var g=function(id){return((document.getElementById(id)||{}).value||'').trim();};
    var e2=[{id:'f_proc',n:'Ficha'},{id:'f_auto',n:'CNJ'},{id:'f_acao',n:'Tipo de Ação'},{id:'f_parte1',n:'Cliente'}]
      .filter(function(c){return !g(c.id);});
    if(e2.length){
      if(window.toast)window.toast('⚠️ Obrigatório: '+e2.map(function(c){return c.n;}).join(' · '),'orange');
      e2.forEach(function(c){var el=document.getElementById(c.id);if(el){el.style.borderColor='var(--red)';el.style.boxShadow='0 0 0 2px rgba(224,92,92,.2)';setTimeout(function(){el.style.borderColor='';el.style.boxShadow='';},3000);}});
      if(typeof switchTab==='function'){if(!g('f_proc')||!g('f_auto')||!g('f_acao'))switchTab('dados');else switchTab('partes');}
      return;
    }
    if(_oSalv)_oSalv();
  };

  // ── Publicações no inbox ─────────────────────────────────
  var _oInbox=window.carregarInbox;
  window.carregarInbox=function(){
    if(_oInbox)_oInbox();
    setTimeout(function(){
      var el=document.getElementById('inboxList');
      if(!el)return;
      var pubs=[];
      try{if(typeof LexSync!=='undefined')pubs=(LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).slice(-60).reverse();}catch(e){}
      if(!pubs.length)return;
      var html='';
      pubs.forEach(function(pub){
        var isJB=pub.fonte==='jusbrasil';
        var data=(pub.data||pub.timestamp||'').slice(0,10).split('-').reverse().join('/');
        html+='<div class="ditem" style="flex-direction:column;align-items:flex-start;gap:3px;margin-bottom:5px;cursor:pointer"'
          +' onclick="lexVerPub(\''+pub.id+'\')">'
          +'<div style="display:flex;align-items:center;gap:7px;width:100%">'
          +'<span class="badge '+(isJB?'bo':'bteal')+'" style="font-size:10px">'+(isJB?'JusBrasil':'Impacta')+'</span>'
          +(pub.cnj?'<span style="font-size:10px;color:var(--teal)">'+pub.cnj+'</span>':'')
          +'<span style="font-size:10px;color:var(--text3);margin-left:auto">'+data+'</span>'
          +'</div>'
          +((pub.movimento||pub.raw||'').slice(0,80)?'<div style="font-size:11px;color:var(--text2);padding-left:2px">'+(pub.movimento||pub.raw||'').slice(0,80)+'...</div>':'')
          +'</div>';
      });
      if(html)el.innerHTML=html;
    },400);
  };

  window.lexVerPub=function(pubId){
    try{
      var pub=(LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).find(function(p){return p.id===pubId;});
      if(!pub)return;
      var bodyEl=document.getElementById('emailBody');if(bodyEl)bodyEl.value=pub.raw||pub.movimento||'';
      var remEl=document.getElementById('emailRem');if(remEl)remEl.value=pub.fonte||'impacta';
      if(window.toast)window.toast('📋 Clique em Extrair & Processar','blue');
    }catch(e){}
  };

  // ── CSS ──────────────────────────────────────────────────
  if(!document.getElementById('lex-css')){
    var s=document.createElement('style');s.id='lex-css';
    s.textContent='.af{border-color:var(--teal)!important;background:rgba(62,207,207,.04)!important;transition:all .3s}';
    document.head.appendChild(s);
  }

  // ── Init ─────────────────────────────────────────────────
  function hookBotaoNovo(){
    var btn=document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
    if(!btn||btn._h)return;
    btn._h=true;btn.setAttribute('onclick','');
    btn.addEventListener('click',function(e){e.preventDefault();novoProc();});
  }

  function init(){
    hookBotaoNovo();
    var og=window.go;
    if(og&&!og._enh){
      window.go=function(page,el){og(page,el);
        if(page==='processos')setTimeout(hookBotaoNovo,400);
        if(page==='emails')setTimeout(function(){if(typeof carregarInbox==='function')carregarInbox();},500);
      };
      window.go._enh=true;
    }
    console.log('[LexOfficeAT Enhancements v3.1] ✅ DataJud+Claude+AutoCriar+Prazo5d+Amilcar=Cliente');
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(init,900);});}
  else{setTimeout(init,900);}

})();

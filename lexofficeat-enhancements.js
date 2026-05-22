/**
 * LexOfficeAT — Enhancements v3.0 (ROBUSTO)
 * Abordagem direta: sem depender de outros módulos
 */
(function() {
  'use strict';

  var PROXY = 'https://lexoffice-datajud.amilcaradvocacia.workers.dev';

  function getKey()    { return localStorage.getItem('lex_anthropic_key') || ''; }
  function getModelo() { return localStorage.getItem('lex_claude_modelo') || 'claude-sonnet-4-20250514'; }

  // ── Preenche campo por ID ─────────────────────────────────
  function fill(id, val) {
    if (!val && val !== 0) return;
    var el = document.getElementById(id);
    if (!el) return;
    el.value = String(val);
    el.classList.add('af');
    el.dispatchEvent(new Event('input',  {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function fillSelect(id, val) {
    if (!val) return;
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'SELECT') return;
    var v = val.toString().toUpperCase();
    for (var i = 0; i < el.options.length; i++) {
      if (el.options[i].value.toUpperCase() === v ||
          el.options[i].text.toUpperCase().includes(v.slice(0,4))) {
        el.selectedIndex = i;
        el.classList.add('af');
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return;
      }
    }
  }

  // ── Busca DataJud via Worker ──────────────────────────────
  async function buscarDataJud(cnj) {
    var partes = parseCNJ(cnj);
    if (!partes) return null;
    var mapa = {
      '8.16':'tjpr','8.26':'tjsp','8.19':'tjrj','8.13':'tjmg','8.21':'tjrs',
      '8.12':'tjsc','8.24':'tjpe','5.09':'trt9','5.04':'trt4','5.02':'trt2',
      '5.01':'trt1','5.03':'trt3','5.15':'trt15','5.17':'trt17','5.12':'trt12',
      '4.04':'trf4','4.01':'trf1','4.02':'trf2','3.00':'stj','5.00':'tst','1.00':'stf'
    };
    var sigla = mapa[partes.chave] || 'tjpr';
    var body  = JSON.stringify({
      query:{bool:{should:[
        {match:{numeroProcesso:cnj}},
        {term:{'numeroProcesso.keyword':cnj}}
      ]}}, size:1
    });
    var resp = await fetch(PROXY + '/api_publica_' + sigla + '/_search', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: body
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    var hits = data && data.hits && data.hits.hits;
    if (!hits || !hits.length) return null;
    return normalizarDJ(hits[0]._source, cnj);
  }

  function parseCNJ(cnj) {
    var c = (cnj||'').replace(/\s/g,'');
    var m = c.match(/^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/);
    if (!m) return null;
    return {numero:m[1],digito:m[2],ano:m[3],justica:m[4],tribunal:m[5],origem:m[6],
            raw:c, chave:m[4]+'.'+m[5]};
  }

  function normalizarDJ(src, cnj) {
    var pArr = src.partes     || [];
    var aArr = src.advogados  || [];
    var sArr = src.assuntos   || [];
    var mArr = src.movimentos || [];
    var autor = pArr.find(function(p){return /ATIVO|AUTOR|RECLAMANTE|EXEQUENTE|IMPETRANTE|REQUERENTE/i.test(p.polo||'');});
    var reu   = pArr.find(function(p){return /PASSIVO|R[EÉ]U|RECLAMADO|EXECUTAD|IMPETRADO|REQUERIDO/i.test(p.polo||'');});
    var advsA = aArr.filter(function(a){return /ATIVO|AUTOR|RECLAMANTE/i.test(a.polo||'');});
    var advsP = aArr.filter(function(a){return /PASSIVO|R[EÉ]U|RECLAMADO/i.test(a.polo||'');});
    var amilcar = aArr.find(function(a){return a.nome&&a.nome.toLowerCase().includes('amilcar');});
    var eAtivo  = amilcar ? /ATIVO|AUTOR|RECLAMANTE/i.test(amilcar.polo||'') : true;
    return {
      cnj:          cnj,
      fonte:        'DataJud ✅',
      tipo_acao:    mapTipo((src.classe&&src.classe.nome)||''),
      vara:         (src.orgaoJulgador&&src.orgaoJulgador.nome)||'',
      comarca:      (src.municipio&&src.municipio.nome)||'',
      estado:       (src.tribunal&&src.tribunal.uf)||'PR',
      tribunal_nome:(src.tribunal&&src.tribunal.nome)||'',
      instancia:    src.grau||'1º Grau',
      status:       normStatus(src.situacao),
      polo_ativo:   autor ? autor.nome : '',
      polo_passivo: reu   ? reu.nome   : '',
      nosso_cliente:eAtivo ? (autor?autor.nome:'') : (reu?reu.nome:''),
      adverso:      eAtivo ? (reu?reu.nome:'')     : (autor?autor.nome:''),
      polo_cliente: eAtivo ? 'AUTOR' : 'RÉU',
      adv_cliente:  advsA.map(function(a){return a.nome+(a.numeroOAB?' OAB '+a.numeroOAB:'');}).join('; '),
      adv_adverso:  advsP.map(function(a){return a.nome+(a.numeroOAB?' OAB '+a.numeroOAB:'');}).join('; '),
      advogados:    aArr,
      data_inicio:  src.dataAjuizamento||'',
      assuntos:     sArr.map(function(a){return a.nome;}).join(', '),
      movimentos:   mArr.slice(0,5).map(function(m){return {data:m.dataHora,desc:m.nome};}),
      ultima_mov:   mArr.length ? mArr[0].nome : '',
    };
  }

  function mapTipo(c) {
    if (!c) return '';
    var u = c.toUpperCase();
    var m = [
      [/RECLAMAT|TRABALHIST/,'RECLAMATÓRIA TRABALHISTA'],
      [/EXECU.*TRAB|EXECU.*CLT/,'EXECUÇÃO TRABALHISTA'],
      [/EXECU.*FISCAL|D[IÍ]VIDA.*ATIVA/,'EXECUÇÃO FISCAL'],
      [/CUMPRI.*SENTEN|EXECU.*CIVIL/,'CUMPRIMENTO DE SENTENÇA'],
      [/INDENIZ|DANO.*MORAL|DANO.*MAT/,'AÇÃO DE INDENIZAÇÃO'],
      [/COBRAN/,'AÇÃO DE COBRANÇA'],
      [/DESPEJO|LOCA/,'AÇÃO DE DESPEJO'],
      [/ALIMENT/,'AÇÃO DE ALIMENTOS'],
      [/DIV[OÓ]RCIO/,'AÇÃO DE DIVÓRCIO'],
      [/INVENT[AÁ]RIO/,'INVENTÁRIO'],
      [/HABEAS.*CORPUS/,'HABEAS CORPUS'],
      [/MANDADO.*SEGURAN/,'MANDADO DE SEGURANÇA'],
      [/RECUPERA.*JUDICI/,'RECUPERAÇÃO JUDICIAL'],
      [/MONITÓ|MONITOR/,'AÇÃO MONITÓRIA'],
      [/USUCAP/,'USUCAPIÃO'],
      [/REVISIONAL/,'AÇÃO REVISIONAL'],
    ];
    for (var i=0;i<m.length;i++) if (m[i][0].test(u)) return m[i][1];
    return c;
  }

  function normStatus(sit) {
    var s = ((sit&&sit.nome)||sit||'').toUpperCase();
    if (/BAIXAD|ARQUIVAD/.test(s)) return 'Arquivado';
    if (/SUSPEN/.test(s)) return 'Suspenso';
    if (/TRANSIT|JULGAD/.test(s)) return 'Encerrado';
    return 'Em Andamento';
  }

  // ── Preenche TODOS os campos do modal com dados do DataJud ──
  function preencherModal(d, tribunal) {
    if (!d) return;

    // ABA DADOS
    fill('f_auto',    d.cnj);
    fill('cnj_input_api', d.cnj);
    fill('f_acao',    d.tipo_acao);
    fill('f_vara',    d.vara);
    var comarca = d.comarca || '';
    if (d.estado && comarca && !comarca.includes('/')) comarca += '/' + d.estado;
    fill('f_comarca', comarca);
    if (d.instancia)    fill('f_instancia', d.instancia);
    if (d.tribunal_nome) fill('f_tribunal',  d.tribunal_nome);

    // Status
    fillSelect('f_status', d.status);

    // Advogado responsável → Dr. Amilcar
    var respEl = document.getElementById('f_resp');
    if (respEl && !respEl.value) {
      for (var i=0;i<respEl.options.length;i++) {
        if (respEl.options[i].text.toLowerCase().includes('amilcar')) {
          respEl.selectedIndex = i; break;
        }
      }
    }

    // ABA PARTES
    fill('f_parte1',  d.nosso_cliente || d.polo_ativo);
    fill('f_exadv',   d.adverso || d.polo_passivo);
    fillSelect('f_polo', d.polo_cliente || 'AUTOR');

    // Tipo adverso (PF/PJ)
    var adv = d.adverso || d.polo_passivo || '';
    var isPJ = /LTDA|S\.?A\.?|EIRELI|ME\b|EPP\b|S\/A|SOCIEDADE|EMPRESA|CIA\.|COMPANHIA|BANCO|INSTITUTO/i.test(adv);
    fillSelect('f_tipo_adv', isPJ ? 'PJ' : 'PF');

    // Advogado do adverso
    fill('f_adv_adv', d.adv_adverso);

    // Anotações
    if (d.assuntos || d.ultima_mov) {
      var anEl = document.getElementById('f_anotacoes');
      if (anEl && !anEl.value) {
        anEl.value = (d.assuntos ? 'Assunto: ' + d.assuntos : '') +
          (d.ultima_mov ? '\nÚlt. mov.: ' + d.ultima_mov : '');
      }
    }

    // Salva no LexDB
    salvarNoLexDB(d);

    // Cria pasta no Drive
    if (d.nosso_cliente && typeof LexAT !== 'undefined' && LexAT.DRIVE) {
      var nomePasta = (d.nosso_cliente + (d.adverso ? ' vs ' + d.adverso : '')).slice(0,100);
      LexAT.DRIVE.criarPastaCliente(nomePasta).catch(function(){});
    }

    // Exibe resultado
    var res = document.getElementById('cnj_resultado');
    if (res) {
      var fc = d.fonte.includes('DataJud') ? 'var(--green)' : 'var(--blue)';
      res.innerHTML = '<div style="background:var(--surface2);border-radius:10px;padding:11px;margin-top:6px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
        '<span style="color:'+fc+';font-size:12px;font-weight:600">'+d.fonte+'</span>' +
        (tribunal?'<span style="background:rgba(201,168,76,.15);color:var(--gold);padding:2px 7px;border-radius:8px;font-size:10px">'+tribunal+'</span>':'') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px">' +
        campo('⚖️ Ação',     d.tipo_acao) +
        campo('🏛️ Vara',     d.vara) +
        campo('📍 Comarca',  comarca) +
        campo('👤 Cliente',  d.nosso_cliente||d.polo_ativo) +
        campo('⚔️ Adverso',  d.adverso||d.polo_passivo) +
        campo('📊 Status',   d.status) +
        campo('👨‍💼 Adv.Cli', d.adv_cliente) +
        campo('⚖️ Adv.Adv', d.adv_adverso) +
        campo('🏢 Instância',d.instancia) +
        campo('📅 Ajuizamento', d.data_inicio ? d.data_inicio.slice(0,10) : '') +
        '</div>' +
        (d.assuntos?'<div style="margin-top:7px;font-size:10px;color:var(--text3)">📋 '+d.assuntos.slice(0,80)+'</div>':'') +
        '</div>';
    }

    if (typeof window.toast === 'function') window.toast('✅ ' + d.fonte + ' — dados preenchidos!', 'green');
  }

  function campo(l, v) {
    if (!v) return '';
    return '<div style="background:var(--surface3);border-radius:6px;padding:5px 8px">' +
      '<div style="color:var(--text3);font-size:9px">'+l+'</div>' +
      '<div style="color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+v+'">'+v+'</div></div>';
  }

  function salvarNoLexDB(d) {
    try {
      if (typeof LexSync === 'undefined') return;
      var db = LexSync.DB;
      var ex = db.findByCNJ(d.cnj);
      var dados = {
        cnj:d.cnj, tipo_acao:d.tipo_acao, vara:d.vara, comarca:d.comarca+'/'+d.estado,
        status:d.status, polo_cliente:d.nosso_cliente||d.polo_ativo,
        polo_processual:d.polo_cliente, ex_adverso:d.adverso||d.polo_passivo,
        adv_adverso:d.adv_adverso, adv_cliente:d.adv_cliente,
        tribunal_sigla:'', instancia:d.instancia, assuntos:d.assuntos,
        fonte_consulta:d.fonte, updatedAt:new Date().toISOString()
      };
      if (ex) db.update(db.KEYS.processos, ex.id, dados);
      else { dados.id=db.newId('proc'); dados.createdAt=new Date().toISOString(); db.add(db.KEYS.processos,dados); }
    } catch(e) {}
  }

  // ── consultarCNJ PRINCIPAL ───────────────────────────────
  window.consultarCNJ = async function() {
    var cnjEl = document.getElementById('cnj_input_api') || document.getElementById('f_auto');
    var cnj   = ((cnjEl?cnjEl.value:'')||'').trim();
    var btn   = document.getElementById('btn_consultar_api');
    var res   = document.getElementById('cnj_resultado');

    if (!cnj || cnj.length < 15) {
      if (window.toast) window.toast('⚠️ CNJ inválido','orange');
      return;
    }

    var partes = parseCNJ(cnj);
    if (!partes) { if(window.toast)window.toast('⚠️ Formato CNJ inválido','orange'); return; }

    var trib = ({'8.16':'TJPR','5.09':'TRT9','5.17':'TRT17','4.04':'TRF4','3.00':'STJ','5.00':'TST','1.00':'STF'})[partes.chave] || ('J'+partes.justica+'T'+partes.tribunal);

    if (btn) { btn.innerHTML='⏳...'; btn.disabled=true; }
    if (res)  res.innerHTML='<span style="color:var(--teal)">🔍 Consultando '+trib+' via DataJud...</span>';

    var dados = null;

    // 1. DataJud via Worker
    try {
      dados = await buscarDataJud(cnj);
      if (dados) console.log('[CNJ] DataJud OK:', dados.tipo_acao, dados.polo_ativo);
    } catch(e) {
      console.log('[CNJ] DataJud erro:', e.message);
    }

    // 2. Claude IA se DataJud falhou
    if (!dados && getKey()) {
      try {
        if (res) res.innerHTML='<span style="color:var(--blue)">🤖 Buscando via Claude IA...</span>';
        var txt = await callClaude([{role:'user',content:'Busque dados do processo '+cnj+' e retorne APENAS JSON: {"tipo_acao":"","vara":"","comarca":"","estado":"","polo_ativo":"","polo_passivo":"","adv_adverso":"","adv_cliente":"","status":"","data_inicio":"","assuntos":""}'}], 600);
        var r2 = JSON.parse(txt.replace(/```json|```/g,'').trim());
        if (r2.tipo_acao || r2.vara || r2.polo_ativo) {
          dados = Object.assign({cnj:cnj, fonte:'Claude IA 🤖', nosso_cliente:r2.polo_ativo,
            adverso:r2.polo_passivo, polo_cliente:'AUTOR', instancia:'1º Grau'}, r2);
        }
      } catch(e) { console.log('[CNJ] IA erro:', e.message); }
    }

    // 3. Fallback LexDB
    if (!dados) {
      try {
        if (typeof LexSync !== 'undefined') {
          var db2 = LexSync.DB.findByCNJ(cnj);
          if (db2) {
            dados = { cnj:cnj, fonte:'LexDB 💾',
              tipo_acao:db2.tipo_acao||'', vara:db2.vara||'', comarca:db2.comarca||'',
              estado:'PR', status:db2.status||'Em Andamento',
              nosso_cliente:db2.polo_cliente||'', adverso:db2.ex_adverso||'',
              polo_cliente:db2.polo_processual||'AUTOR',
              adv_adverso:db2.adv_adverso||'', adv_cliente:db2.adv_cliente||'',
              instancia:db2.instancia||'1º Grau', assuntos:db2.assuntos||'',
              data_inicio:db2.data_inicio||'', ultima_mov:'', advogados:[]
            };
          }
        }
      } catch(e) {}
    }

    if (!dados) {
      if (res) res.innerHTML='<span style="color:var(--orange)">⚠️ Não encontrado. Configure Claude API para busca via IA.</span>';
      if (btn) { btn.innerHTML='🔍 Consultar'; btn.disabled=false; }
      return;
    }

    preencherModal(dados, trib);
    if (btn) { btn.innerHTML='🔍 Consultar'; btn.disabled=false; }
  };

  // ── Claude via Worker ────────────────────────────────────
  async function callClaude(messages, maxTokens) {
    var key = getKey();
    if (!key) throw new Error('Sem API Key');
    var resp = await fetch(PROXY + '/claude', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:getModelo(), max_tokens:maxTokens||500, messages:messages})
    });
    var data = await resp.json();
    if (data.error) throw new Error(data.error.message||'Erro Claude');
    return (data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
  }

  // ── Testar Claude ────────────────────────────────────────
  if (window.LexAT) {
    window.LexAT.testarIA = async function() {
      var st = document.getElementById('lexat_status');
      var key = getKey();
      if (!key) { if(st)st.innerHTML='❌ API Key não configurada'; return; }
      if (st) st.innerHTML='🔍 Testando via Worker...';
      try {
        var txt = await callClaude([{role:'user',content:'Responda: Claude ativo no LexOfficeAT!'}], 50);
        if (st) st.innerHTML='✅ Claude ativo! Modelo: '+getModelo().replace('claude-','')+' — '+txt;
        if(window.toast)window.toast('✅ Claude funcionando!','green');
        var b=document.getElementById('badge-claude');
        if(b){b.textContent='Ativo ✅';b.className='badge bteal';}
      } catch(e) {
        if (st) st.innerHTML='❌ '+e.message;
        if(window.toast)window.toast('❌ '+e.message.slice(0,60),'red');
      }
    };
  }

  // ── Novo Processo com ficha automática ──────────────────
  function abrirNovoProcessoEnh() {
    if (typeof openModal === 'function') openModal('mProcesso');
    setTimeout(function() {
      if (typeof switchTab === 'function') switchTab('dados');
      var maxNum = 0;
      if (typeof XLS2_DATA !== 'undefined') {
        XLS2_DATA.forEach(function(r){ var n=parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum)maxNum=n; });
      }
      try {
        if (typeof LexSync !== 'undefined') {
          LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){ var n=parseInt((p.ficha||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum)maxNum=n; });
        }
      } catch(e) {}
      var novaFicha = 'A' + String(maxNum+1).padStart(4,'0');
      ['f_acao','f_auto','f_vara','f_comarca','f_parte1','f_exadv','f_cpf_cli','f_qual_cli','f_cpf_adv','f_qual_adv','f_adv_adv','f_anotacoes']
        .forEach(function(id){ var el=document.getElementById(id); if(el)el.value=''; });
      fill('f_proc', novaFicha);
      fillSelect('f_polo', 'AUTOR');
      fillSelect('f_tipo_adv', 'PF');
      var respEl=document.getElementById('f_resp');
      if(respEl){for(var i=0;i<respEl.options.length;i++){if(respEl.options[i].text.toLowerCase().includes('amilcar')){respEl.selectedIndex=i;break;}}}
      var b=document.getElementById('autoFillBanner');
      if(b){b.style.display='flex';b.innerHTML='✨ Novo — <strong>'+novaFicha+'</strong> — Digite o CNJ e pressione Enter';}
      var ci=document.getElementById('cnj_input_api'); if(ci)setTimeout(function(){ci.focus();},200);
    }, 200);
  }

  // ── abrirProcessoXLS2 melhorado ─────────────────────────
  var _origAbrir = window.abrirProcessoXLS2;
  window.abrirProcessoXLS2 = function(r) {
    if (_origAbrir) _origAbrir(r);
    setTimeout(function() {
      try {
        var row = typeof r === 'string' ? JSON.parse(r) : (r || []);
        var respEl = document.getElementById('f_resp');
        if (respEl && !respEl.value) {
          for (var i=0;i<respEl.options.length;i++) {
            if (respEl.options[i].text.toLowerCase().includes('amilcar')) { respEl.selectedIndex=i; break; }
          }
        }
        if (!((document.getElementById('f_parte1')||{}).value) && row[7]) fill('f_parte1', row[7]);
        if (!((document.getElementById('f_exadv') ||{}).value) && row[9]) {
          fill('f_exadv', row[9]);
          var tipoEl=document.getElementById('f_tipo_adv');
          if(tipoEl) tipoEl.value=/LTDA|S\.A|EIRELI|ME |EPP|CIA\.|EMPRESA|SOCIEDADE/i.test(row[9]||'')?'PJ':'PF';
        }
        var cnj  = ((document.getElementById('f_auto') ||{}).value||'');
        var acao = ((document.getElementById('f_acao') ||{}).value||'');
        if (cnj && !acao) { var ci=document.getElementById('cnj_input_api'); if(ci)ci.value=cnj; setTimeout(function(){window.consultarCNJ();},400); }
      } catch(e) {}
    }, 350);
  };

  // ── Processar e-mail e criar processo automaticamente ────
  window.lexProcessarEmailECriarProcesso = async function(email) {
    if (!email || !email.corpo) return;
    // Extrai CNJs do corpo do e-mail
    var cnjs = [];
    var matches = email.corpo.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g) || [];
    cnjs = [...new Set(matches)];
    if (!cnjs.length) return;

    for (var i = 0; i < cnjs.length; i++) {
      var cnj = cnjs[i];
      // Verifica se já existe
      var jaExiste = false;
      try { if(typeof LexSync!=='undefined'&&LexSync.DB.findByCNJ(cnj)) jaExiste=true; } catch(e){}
      if (typeof XLS2_DATA !== 'undefined') {
        if (XLS2_DATA.some(function(r){ return (r[2]||'').replace(/[.\-]/g,'').includes(cnj.replace(/[.\-]/g,'')); })) jaExiste=true;
      }

      // Busca dados no DataJud
      var dados = null;
      try { dados = await buscarDataJud(cnj); } catch(e){}

      // Se não achou no DataJud, extrai do próprio e-mail
      if (!dados) {
        var ctx = email.corpo;
        var idxCNJ = ctx.indexOf(cnj);
        var trecho = ctx.slice(Math.max(0,idxCNJ-400), idxCNJ+500);
        dados = {
          cnj:          cnj,
          fonte:        'E-mail ' + (email.fonte||''),
          tipo_acao:    '',
          vara:         (trecho.match(/(\d+[ªº]?\s*Vara[^\n,]{0,50})/i)||[])[1]||'',
          comarca:      '',
          estado:       'PR',
          status:       'Em Andamento',
          polo_ativo:   (trecho.match(/(?:AUTOR[A]?|RECLAMANTE|EXEQUENTE)[:\s]+([^\n,]{3,60})/i)||[])[1]||'',
          polo_passivo: (trecho.match(/(?:RÉU|RECLAMAD[OA]|EXECUTAD[OA])[:\s]+([^\n,]{3,60})/i)||[])[1]||'',
          nosso_cliente:'',
          adverso:      '',
          polo_cliente: 'AUTOR',
          adv_adverso:  '',
          adv_cliente:  '',
          instancia:    '1º Grau',
          assuntos:     '',
          movimentos:   [],
          ultima_mov:   (trecho.match(/(?:Publica|Decis|Despacho|Senten|Acord)[^\n]{5,100}/i)||[])[0]||'',
          advogados:    [],
        };
      }

      // Determina nosso cliente
      var advAmilcar = dados.advogados && dados.advogados.find(function(a){return a.nome&&a.nome.toLowerCase().includes('amilcar');});
      if (advAmilcar) {
        var eAtivo2 = /ATIVO|AUTOR|RECLAMANTE/i.test(advAmilcar.polo||'');
        dados.nosso_cliente = eAtivo2 ? dados.polo_ativo : dados.polo_passivo;
        dados.adverso       = eAtivo2 ? dados.polo_passivo : dados.polo_ativo;
        dados.polo_cliente  = eAtivo2 ? 'AUTOR' : 'RÉU';
      } else {
        dados.nosso_cliente = dados.polo_ativo;
        dados.adverso       = dados.polo_passivo;
      }

      // Gera ficha
      var maxNum2 = 0;
      if (typeof XLS2_DATA !== 'undefined') XLS2_DATA.forEach(function(r){ var n=parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum2)maxNum2=n; });
      try { if(typeof LexSync!=='undefined') LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){ var n=parseInt((p.ficha||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum2)maxNum2=n; }); } catch(e){}
      var novaFicha2 = 'A' + String(maxNum2+1).padStart(4,'0');

      // Salva no LexDB
      try {
        if (typeof LexSync !== 'undefined') {
          var db3 = LexSync.DB;
          var procData = {
            id:db3.newId('proc'), cnj:cnj, ficha:novaFicha2,
            tipo_acao:dados.tipo_acao, vara:dados.vara,
            comarca: dados.comarca+(dados.estado&&!dados.comarca.includes('/')?'/'+dados.estado:''),
            status:dados.status, polo_cliente:dados.nosso_cliente,
            polo_processual:dados.polo_cliente, ex_adverso:dados.adverso,
            adv_adverso:dados.adv_adverso, adv_cliente:dados.adv_cliente,
            instancia:dados.instancia, assuntos:dados.assuntos,
            fonte_criacao:email.fonte||'email',
            movimentos: dados.ultima_mov ? [{data:new Date().toLocaleDateString('pt-BR'),descricao:dados.ultima_mov,fonte:email.fonte}] : [],
            createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
          };
          if (!jaExiste) db3.add(db3.KEYS.processos, procData);
          else db3.update(db3.KEYS.processos, db3.findByCNJ(cnj)&&db3.findByCNJ(cnj).id, {movimentos:procData.movimentos, updatedAt:procData.updatedAt});
        }
      } catch(e) {}

      // Prazo automático de 5 dias para manifestação
      var venc = new Date(); venc.setDate(venc.getDate()+5);
      try {
        if (typeof LexSync !== 'undefined') {
          LexSync.DB.add(LexSync.DB.KEYS.prazos, {
            id:LexSync.DB.newId('prazo'), cnj:cnj, ficha:novaFicha2,
            cliente:dados.nosso_cliente, tipo:'Manifestação (5 dias)',
            dias:5, fundamento:'Prazo automático — publicação',
            urgencia:'alta', vencimento:venc.toLocaleDateString('pt-BR'),
            vencimentoISO:venc.toISOString().slice(0,10),
            status:'pendente', createdAt:new Date().toISOString(),
          });
        }
      } catch(e) {}

      // Calendar
      try {
        if (typeof LexAT !== 'undefined' && LexAT.CALENDAR) {
          LexAT.CALENDAR.criarPrazoFatal({
            tipo:'Manifestação', cliente:dados.nosso_cliente||'Cliente',
            processo:cnj, data:venc.toLocaleDateString('pt-BR'),
            vara:dados.vara||'', advogado:'Dr. Amilcar Cordeiro Teixeira Filho',
          }).catch(function(){});
        }
      } catch(e) {}

      // Pasta Drive
      if (dados.nosso_cliente && typeof LexAT !== 'undefined' && LexAT.DRIVE) {
        LexAT.DRIVE.criarPastaCliente((novaFicha2+' — '+dados.nosso_cliente+(dados.adverso?' vs '+dados.adverso:'')).slice(0,100)).catch(function(){});
      }

      if (!jaExiste && window.toast) window.toast('✨ '+novaFicha2+' criado: '+dados.nosso_cliente+' (prazo: '+venc.toLocaleDateString('pt-BR')+')', 'teal');
    }
  };

  // ── Publicações no inbox ─────────────────────────────────
  var _origInbox = window.carregarInbox;
  window.carregarInbox = function() {
    if (_origInbox) _origInbox();
    setTimeout(function(){
      var el = document.getElementById('inboxList');
      if (!el) return;
      var pubs = [];
      try { if(typeof LexSync!=='undefined') pubs=(LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).slice(-60).reverse(); } catch(e){}
      if (!pubs.length) return;
      var html = '';
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
          +((pub.movimento||pub.raw||'').slice(0,80)?'<div style="font-size:11px;color:var(--text2)">'+(pub.movimento||pub.raw||'').slice(0,80)+'</div>':'')
          +'</div>';
      });
      if (html) el.innerHTML = html;
    }, 400);
  };

  window.lexVerPub = function(pubId) {
    try {
      var pub = (LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).find(function(p){return p.id===pubId;});
      if (!pub) return;
      var bodyEl=document.getElementById('emailBody'); if(bodyEl)bodyEl.value=pub.raw||pub.movimento||'';
      var remEl=document.getElementById('emailRem');   if(remEl)remEl.value=pub.fonte||'impacta';
      if(window.toast)window.toast('📋 Clique em Extrair & Processar','blue');
    } catch(e){}
  };

  // ── Validação ao salvar ──────────────────────────────────
  var _origSalvar = window.salvarProcesso;
  window.salvarProcesso = function() {
    var g=function(id){return((document.getElementById(id)||{}).value||'').trim();};
    var erros=[{id:'f_proc',n:'Ficha'},{id:'f_auto',n:'CNJ'},{id:'f_acao',n:'Tipo de Ação'},{id:'f_parte1',n:'Nome do Cliente'}]
      .filter(function(c){return !g(c.id);});
    if (erros.length) {
      if(window.toast)window.toast('⚠️ Obrigatório: '+erros.map(function(c){return c.n;}).join(' · '),'orange');
      erros.forEach(function(c){
        var el=document.getElementById(c.id);
        if(el){el.style.borderColor='var(--red)';el.style.boxShadow='0 0 0 2px rgba(224,92,92,.2)';
          setTimeout(function(){el.style.borderColor='';el.style.boxShadow='';},3000);}
      });
      if(typeof switchTab==='function'){if(!g('f_proc')||!g('f_auto')||!g('f_acao'))switchTab('dados');else switchTab('partes');}
      return;
    }
    if (_origSalvar) _origSalvar();
  };

  // ── CSS ──────────────────────────────────────────────────
  if (!document.getElementById('lex-enh-css')) {
    var s=document.createElement('style');s.id='lex-enh-css';
    s.textContent='.af{border-color:var(--teal)!important;background:rgba(62,207,207,.04)!important;transition:border-color .4s}';
    document.head.appendChild(s);
  }

  // ── Init ─────────────────────────────────────────────────
  function interceptarBotaoNovo() {
    var btn = document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
    if (!btn || btn._enhHooked) return;
    btn._enhHooked = true;
    btn.setAttribute('onclick','');
    btn.addEventListener('click', function(e){ e.preventDefault(); abrirNovoProcessoEnh(); });
  }

  function init() {
    interceptarBotaoNovo();
    // Hook go()
    var origGo = window.go;
    if (origGo && !origGo._enhanced) {
      window.go = function(page, el) {
        origGo(page, el);
        if (page==='processos') setTimeout(interceptarBotaoNovo, 400);
        if (page==='emails')    setTimeout(function(){if(typeof carregarInbox==='function')carregarInbox();}, 500);
      };
      window.go._enhanced = true;
    }
    console.log('[LexOfficeAT Enhancements v3.0] ✅ consultarCNJ·DataJud·auto-criar·prazo5d·validação');
  }

  if (document.readyState==='loading') { document.addEventListener('DOMContentLoaded',function(){setTimeout(init,900);}); }
  else { setTimeout(init,900); }

})();

/**
 * LexOfficeAT — CNJ Auto-Fill v2.0
 * DataJud · Projudi · eSAJ · PJe · TRTs · STJ · STF · TST
 */
(function () {
  'use strict';

  var TRIBUNAIS = {
    '5.01':{ nome:'TRT 1ª Região (RJ)', sigla:'TRT1',  pje:'https://pje.trt1.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.02':{ nome:'TRT 2ª Região (SP)', sigla:'TRT2',  pje:'https://pje.trt2.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.03':{ nome:'TRT 3ª Região (MG)', sigla:'TRT3',  pje:'https://pje.trt3.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.04':{ nome:'TRT 4ª Região (RS)', sigla:'TRT4',  pje:'https://pje.trt4.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.09':{ nome:'TRT 9ª Região (PR)', sigla:'TRT9',  pje:'https://pje.trt9.jus.br/consultaprocessual/detalhe-processo/{cnj}',
             projudi:'https://projudi.trt9.jus.br/projudi/?numeroProcesso={cnj}' },
    '5.15':{ nome:'TRT 15ª Região (Campinas)', sigla:'TRT15', pje:'https://pje.trt15.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '8.16':{ nome:'TJPR — Paraná',      sigla:'TJPR',  projudi:'https://projudi.tjpr.jus.br/projudi/?numeroProcesso={cnj}' },
    '8.26':{ nome:'TJSP — São Paulo',   sigla:'TJSP',  esaj:'https://esaj.tjsp.jus.br/cpopg/show.do?processo.numero={cnj}' },
    '8.19':{ nome:'TJRJ — Rio de Janeiro', sigla:'TJRJ', pje:'https://tjrj.jus.br' },
    '8.13':{ nome:'TJMG — Minas Gerais',   sigla:'TJMG', pje:'https://www5.tjmg.jus.br/jurisprudencia/pesquisaNumeroCNJProcesso.do?numeroProcesso={cnj}' },
    '8.21':{ nome:'TJRS — Rio Grande do Sul', sigla:'TJRS', pje:'https://www.tjrs.jus.br' },
    '8.12':{ nome:'TJSC — Santa Catarina',   sigla:'TJSC', esaj:'https://esaj.tjsc.jus.br/cpopg/show.do?processo.numero={cnj}' },
    '4.01':{ nome:'TRF 1ª Região',      sigla:'TRF1',  pje:'https://processual.trf1.jus.br/consultaProcessual/processo.php?proc={cnj}' },
    '4.02':{ nome:'TRF 2ª Região',      sigla:'TRF2',  pje:'https://consulta.trf2.jus.br/consulta/processo?nproc={cnj}' },
    '4.04':{ nome:'TRF 4ª Região',      sigla:'TRF4',  pje:'https://eproc.trf4.jus.br/eproc2trf4/controlador.php?acao=processo_selecionar&num_processo={cnj}' },
    '3.00':{ nome:'STJ',                sigla:'STJ',   pje:'https://processo.stj.jus.br/processo/pesquisa/?num_processo={cnj}' },
    '1.00':{ nome:'STF',                sigla:'STF',   pje:'https://portal.stf.jus.br/processos/detalhe.asp?incidente={cnj}' },
    '5.00':{ nome:'TST',                sigla:'TST',   pje:'https://consultaprocessual.tst.jus.br/consultaProcessual/consultaTstNumUnica.do?consulta=Consultar&numeroTst={cnj}' },
  };

  var DATAJUD_MAP = {
    '8.16':'tjpr','8.26':'tjsp','8.19':'tjrj','8.13':'tjmg','8.21':'tjrs','8.12':'tjsc',
    '8.24':'tjpe','8.06':'tjba','8.07':'tjce','8.08':'tjdf','5.09':'trt9','5.04':'trt4',
    '5.02':'trt2','5.01':'trt1','5.03':'trt3','5.15':'trt15','5.12':'trt12',
    '4.04':'trf4','4.01':'trf1','4.02':'trf2','4.03':'trf3','3.00':'stj','5.00':'tst','1.00':'stf'
  };

  var CORS_PROXIES = [
    '',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
  ];

  function parseCNJ(cnj) {
    var clean = (cnj||'').replace(/\s/g,'');
    var m = clean.match(/^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/);
    if (!m) return null;
    return { numero:m[1], digito:m[2], ano:m[3], justica:m[4], tribunal:m[5], origem:m[6],
             raw:clean, chave:m[4]+'.'+m[5] };
  }

  function detectarTribunal(p) {
    if (!p) return null;
    return TRIBUNAIS[p.chave] || TRIBUNAIS[p.justica+'.00'] || null;
  }

  function tentarFetch(url, opts) {
    var proxies = CORS_PROXIES.slice();
    var idx = 0;
    function tentar() {
      if (idx >= proxies.length) return Promise.reject(new Error('Proxies esgotados'));
      var u = proxies[idx] ? proxies[idx] + encodeURIComponent(url) : url;
      idx++;
      return fetch(u, opts||{})
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .catch(function(){ return tentar(); });
    }
    return tentar();
  }

  function consultarDataJud(cnj, partes) {
    var sigla = partes ? (DATAJUD_MAP[partes.chave] || 'tjpr') : 'tjpr';
    var apiUrl = 'https://api-publica.datajud.cnj.jus.br/api_publica_'+sigla+'/_search';
    var body = JSON.stringify({
      query:{ match:{ numeroProcesso: (cnj||'').replace(/[^0-9]/g,'') } }, size:1
    });
    return tentarFetch(apiUrl, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'ApiKey cDZHYzlZa0JadVREZDJCendFbGFkUnBQbXQrTldjSE10' }
    }).then(function(data){
      var hits = data && data.hits && data.hits.hits;
      if (!hits || !hits.length) throw new Error('Não encontrado');
      var src = hits[0]._source || {};
      var partes2 = src.partes || [];
      var advs   = src.advogados || [];
      var autor  = partes2.find(function(p){ return p.polo==='ATIVO'||p.polo==='AUTOR'; });
      var reu    = partes2.find(function(p){ return p.polo==='PASSIVO'||p.polo==='REU'; });
      return {
        cnj:          cnj,
        tipo_acao:    (src.classe&&src.classe.nome)||'',
        vara:         (src.orgaoJulgador&&src.orgaoJulgador.nome)||'',
        comarca:      (src.municipio&&src.municipio.nome)||'',
        estado:       (src.tribunal&&src.tribunal.uf)||'PR',
        status:       normStatus(src.situacao),
        polo_ativo:   autor?autor.nome:'',
        polo_passivo: reu?reu.nome:'',
        advogados:    advs.map(function(a){ return {nome:a.nome,oab:a.numeroOAB,polo:a.polo}; }),
        data_inicio:  src.dataAjuizamento||'',
        assuntos:     (src.assuntos||[]).map(function(a){ return a.nome; }).join(', '),
        movimentos:   (src.movimentos||[]).slice(0,3),
        fonte:        'DataJud CNJ ✅',
      };
    });
  }

  function normStatus(sit) {
    var s = ((sit&&sit.nome)||sit||'').toUpperCase();
    if (s.includes('BAIXAD')||s.includes('ARQUIVAD')) return 'Arquivado';
    if (s.includes('SUSPEN')) return 'Suspenso';
    if (s.includes('TRANSIT')||s.includes('JULGAD')) return 'Encerrado';
    return 'Em Andamento';
  }

  async function consultarViaIA(cnj, partes, tribunal) {
    var key = localStorage.getItem('lex_anthropic_key');
    if (!key) throw new Error('sem key');
    var nomeTrib = tribunal ? tribunal.nome : 'tribunal brasileiro';
    var urlPortal = tribunal ? (tribunal.projudi||tribunal.esaj||tribunal.pje||'').replace('{cnj}',cnj) : '';
    var prompt = 'Busque dados do processo ' + cnj + ' no ' + nomeTrib + '.' +
      (urlPortal ? ' Portal: '+urlPortal : '') +
      '\nRetorne APENAS JSON: {"tipo_acao":"","vara":"","comarca":"","estado":"","polo_ativo":"","polo_passivo":"","advogados":[{"nome":"","oab":"","polo":""}],"status":"","data_inicio":"","assuntos":""}' +
      '\nSe não encontrado: {"erro":"nao_encontrado"}';
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514', max_tokens:800,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        system:'Consulte processos judiciais brasileiros. Retorne APENAS JSON válido sem markdown.',
        messages:[{role:'user',content:prompt}]
      })
    });
    var data = await resp.json();
    var texto = (data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
    var r = JSON.parse(texto.replace(/```json|```/g,'').trim());
    if (r.erro) throw new Error('Não encontrado');
    r.cnj=cnj; r.fonte='Claude IA + Web 🤖';
    return r;
  }

  function extrairDoCNJ(cnj, partes, tribunal) {
    var j = partes?partes.justica:'8';
    var tipoJus = j==='5'?'TRABALHISTA':j==='4'?'FEDERAL':j==='3'?'STJ':j==='1'?'STF':'ESTADUAL';
    var procDB = typeof LexSync!=='undefined' ? LexSync.DB.findByCNJ(cnj) : null;
    return {
      cnj:          cnj,
      tipo_acao:    procDB?procDB.tipo_acao:(tipoJus==='TRABALHISTA'?'RECLAMATÓRIA TRABALHISTA':'AÇÃO CÍVEL'),
      vara:         procDB?procDB.vara:(tribunal?tribunal.nome:''),
      comarca:      procDB?procDB.comarca:(tribunal?tribunal.nome.replace(/.*—\s*/,''):'Curitiba/PR'),
      estado:       'PR',
      status:       procDB?procDB.status:'Em Andamento',
      polo_ativo:   procDB?procDB.polo_cliente:'',
      polo_passivo: procDB?procDB.ex_adverso:'',
      advogados:    [{nome:'Dr. Amilcar Cordeiro Teixeira Filho',oab:'',polo:'ATIVO'}],
      data_inicio:  partes?partes.ano+'-01-01':'',
      assuntos:     '',
      movimentos:   procDB&&procDB.movimentos?procDB.movimentos.slice(0,3):[],
      fonte:        procDB?'LexDB (importado) 💾':'CNJ parcial ℹ️',
    };
  }

  window.consultarCNJ = async function() {
    var cnjEl = document.getElementById('cnj_input_api') || document.getElementById('f_auto');
    var cnj   = (cnjEl?cnjEl.value:'').trim();
    var btn   = document.getElementById('btn_consultar_api');
    var res   = document.getElementById('cnj_resultado');
    if (!cnj||cnj.length<15){ if(window.toast) window.toast('⚠️ CNJ inválido','orange'); return; }

    var partes   = parseCNJ(cnj);
    var tribunal = detectarTribunal(partes);
    if (btn){ btn.innerHTML='⏳ Consultando...'; btn.disabled=true; }
    if (res) res.innerHTML='<span style="color:var(--teal)">🔍 Consultando '+(tribunal?tribunal.sigla:'DataJud')+'...</span>';
    _log('🔍 CNJ: '+cnj+(tribunal?' ['+tribunal.sigla+']':''));

    var dados = null;

    // 1. DataJud
    try {
      if(res) res.innerHTML='<span style="color:var(--teal)">📡 DataJud CNJ...</span>';
      dados = await consultarDataJud(cnj, partes);
      _log('✅ DataJud OK');
    } catch(e){ _log('⚠️ DataJud: '+e.message); }

    // 2. Claude IA + Web
    if (!dados && localStorage.getItem('lex_anthropic_key')) {
      try {
        if(res) res.innerHTML='<span style="color:var(--blue)">🤖 Consultando via IA...</span>';
        dados = await consultarViaIA(cnj, partes, tribunal);
        _log('✅ IA OK');
      } catch(e){ _log('⚠️ IA: '+e.message); }
    }

    // 3. Fallback LexDB + CNJ
    if (!dados) { dados = extrairDoCNJ(cnj, partes, tribunal); _log('ℹ️ Fallback LexDB'); }

    _preencherCampos(dados, tribunal);
    _exibirResultado(dados, tribunal, res);
    if (window.toast) window.toast('✅ '+dados.fonte, 'teal');
    if (btn){ btn.innerHTML='🔍 Consultar'; btn.disabled=false; }
  };

  function _preencherCampos(d, t) {
    function set(id, val) {
      var el=document.getElementById(id);
      if (el&&val){ el.value=val; el.classList.add('af');
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true})); }
    }
    set('f_auto',    d.cnj);
    set('f_acao',    d.tipo_acao);
    set('f_vara',    d.vara);
    set('f_comarca', d.comarca+(d.estado&&!d.comarca.includes('/')?'/'+d.estado:''));
    set('cnj_input_api', d.cnj);
    set('f_parte1',  d.polo_ativo);
    set('p_polo1',   d.polo_ativo);
    set('f_exadv',   d.polo_passivo);
    set('p_exadv',   d.polo_passivo);

    // Status
    var st=document.getElementById('f_status');
    if (st&&d.status) {
      for(var i=0;i<st.options.length;i++){
        if(st.options[i].text.toLowerCase().includes(d.status.toLowerCase())){st.selectedIndex=i;break;}
      }
    }

    // Advogado — seleciona Dr. Amilcar
    var advSel=document.getElementById('f_adv')||document.getElementById('p_adv');
    if (advSel) {
      for(var i=0;i<advSel.options.length;i++){
        if(advSel.options[i].text.toLowerCase().includes('amilcar')){advSel.selectedIndex=i;break;}
      }
    }

    // Polo
    var poloAdv = d.advogados&&d.advogados.find(function(a){return a.nome&&a.nome.toLowerCase().includes('amilcar');});
    if (poloAdv) set('f_polo', poloAdv.polo==='PASSIVO'?'Réu':'Autor');

    // Assuntos → anotações
    if (d.assuntos) {
      var an=document.getElementById('f_anotacoes')||document.getElementById('p_anotacoes');
      if (an&&!an.value) an.value='Assunto: '+d.assuntos;
    }

    // Salva no LexDB
    if (typeof LexSync!=='undefined') {
      var ex = LexSync.DB.findByCNJ(d.cnj);
      var db = { cnj:d.cnj, tipo_acao:d.tipo_acao, vara:d.vara, comarca:d.comarca,
                 status:d.status||'Em Andamento', polo_cliente:d.polo_ativo,
                 ex_adverso:d.polo_passivo, tribunal_sigla:t?t.sigla:'',
                 fonte_consulta:d.fonte, updatedAt:new Date().toISOString() };
      if (ex) LexSync.DB.update(LexSync.DB.KEYS.processos, ex.id, db);
      else { db.id=LexSync.DB.newId('proc'); db.createdAt=new Date().toISOString();
             LexSync.DB.add(LexSync.DB.KEYS.processos, db); }
    }
  }

  function _exibirResultado(d, t, el) {
    if (!el) return;
    var fc = d.fonte.includes('DataJud')?'var(--green)':d.fonte.includes('IA')?'var(--blue)':'var(--teal)';
    var h = '<div style="background:var(--surface2);border-radius:10px;padding:11px;margin-top:8px">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    h += '<span style="color:'+fc+';font-weight:600;font-size:12px">'+d.fonte+'</span>';
    if (t) h += '<span style="background:rgba(201,168,76,.15);color:var(--gold);border:1px solid rgba(201,168,76,.3);padding:2px 7px;border-radius:8px;font-size:10px">'+t.sigla+'</span>';
    h += '</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px">';
    function c(l,v){ if(!v)return''; return '<div style="background:var(--surface3);border-radius:6px;padding:5px 8px"><div style="color:var(--text3);font-size:9px">'+l+'</div><div style="color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+v+'</div></div>'; }
    h += c('⚖️ Ação',d.tipo_acao)+c('🏛️ Vara',d.vara)+c('📍 Comarca',d.comarca+(d.estado&&!d.comarca.includes('/')?'/'+d.estado:''))+c('👤 Autor',d.polo_ativo)+c('⚔️ Réu',d.polo_passivo)+c('📊 Status',d.status);
    h += '</div>';
    if (d.advogados&&d.advogados.length) {
      h += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border);font-size:11px">';
      d.advogados.forEach(function(a){
        var ia = a.nome&&a.nome.toLowerCase().includes('amilcar');
        h += '<div style="color:'+(ia?'var(--gold)':'var(--text2)')+'">'+( ia?'⭐ ':'👤 ')+a.nome+(a.oab?' OAB '+a.oab:'')+' — '+(a.polo||'')+'</div>';
      });
      h += '</div>';
    }
    // Links tribunais
    if (t) {
      h += '<div style="margin-top:8px;display:flex;gap:5px;flex-wrap:wrap">';
      var links = { projudi:t.projudi, eSAJ:t.esaj, portal:t.pje };
      Object.entries(links).forEach(function(kv){ if(!kv[1])return;
        h += '<a href="'+kv[1].replace(/\{cnj\}/g,d.cnj)+'" target="_blank" style="font-size:10px;color:var(--teal);text-decoration:none;border:1px solid rgba(62,207,207,.3);padding:3px 7px;border-radius:6px">🔗 '+kv[0]+'</a>';
      });
      h += '</div>';
    }
    h += '</div>';
    el.innerHTML = h;
  }

  function _log(msg) {
    var el=document.getElementById('emailLog');
    if(el){var t=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      el.innerHTML+='<div style="color:var(--teal)">['+t+'] '+msg+'</div>'; el.scrollTop=el.scrollHeight;}
    console.log('[LexCNJ]',msg);
  }

  function hookInputs() {
    ['cnj_input_api','f_auto'].forEach(function(id){
      var el=document.getElementById(id);
      if(!el||el._lhook) return; el._lhook=true;
      el.addEventListener('input', function(){
        var p=parseCNJ(el.value.trim());
        if(p){ var t=detectarTribunal(p);
          var ce=document.getElementById('f_comarca');
          if(ce&&!ce.value&&t){ ce.value=t.nome.replace(/.*—\s*/,''); ce.classList.add('af'); }
          if(id==='cnj_input_api'){var fa=document.getElementById('f_auto');if(fa)fa.value=el.value.trim();}
        }
      });
      el.addEventListener('keydown',function(e){ if(e.key==='Enter'&&parseCNJ(el.value.trim()))window.consultarCNJ(); });
    });
  }

  window.LexCNJ = { parseCNJ:parseCNJ, detectarTribunal:detectarTribunal, TRIBUNAIS:TRIBUNAIS };

  function init() {
    hookInputs();
    // Estilo auto-fill
    if (!document.getElementById('lex-cnj-css')) {
      var s=document.createElement('style'); s.id='lex-cnj-css';
      s.textContent='.af{border-color:var(--teal)!important;background:rgba(62,207,207,.05)!important;transition:all .3s}';
      document.head.appendChild(s);
    }
    // Observer para modal
    new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType===1&&n.querySelector&&n.querySelector('#cnj_input_api'))setTimeout(hookInputs,100);
    });});}).observe(document.body,{childList:true,subtree:true});

    console.log('[LexCNJ v2.0] ✅ Auto-fill CNJ ativo | '+Object.keys(TRIBUNAIS).length+' tribunais mapeados');
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();

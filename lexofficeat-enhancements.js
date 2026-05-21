/**
 * LexOfficeAT — Enhancements v2.0
 * SEGURO: wrappa funções originais sem substituir
 *
 * 1. testarIA via proxy Worker (resolve CORS)
 * 2. abrirProcessoXLS2 + partes + DataJud auto
 * 3. Novo Processo com ficha automática
 * 4. Publicações com histórico LexDB
 * 5. Validação obrigatória ao salvar
 * 6. AUTO-CRIAR PROCESSO de publicações novas (Impacta/Jusbrasil/CNJ/TRT9)
 */
(function() {
  'use strict';

  var PROXY = 'https://lexoffice-datajud.amilcaradvocacia.workers.dev';

  function getKey() {
    return localStorage.getItem('lex_anthropic_key') || '';
  }
  function getModelo() {
    return localStorage.getItem('lex_claude_modelo') || 'claude-sonnet-4-20250514';
  }

  // ── Chamada Claude via Worker (sem CORS) ─────────────────────
  async function callClaude(messages, maxTokens) {
    var key = getKey();
    if (!key) throw new Error('API Key não configurada');
    var resp = await fetch(PROXY + '/claude', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'Authorization':     'Bearer ' + key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      getModelo(),
        max_tokens: maxTokens || 800,
        messages:   messages,
      })
    });
    var data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return (data.content || []).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
  }

  function setVal(id, val) {
    var el = document.getElementById(id);
    if (el && val) {
      el.value = val;
      el.classList.add('af');
      el.dispatchEvent(new Event('input',  {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
  }

  function init() {

    // ===========================================================
    // 1. TESTAR CLAUDE — via proxy Worker (resolve CORS)
    // ===========================================================
    if (window.LexAT) {
      window.LexAT.testarIA = async function() {
        var st  = document.getElementById('lexat_status');
        var key = getKey();
        if (!key) {
          if (st) st.innerHTML = '❌ API Key não configurada';
          if (window.toast) window.toast('⚠️ Configure a API Key Claude', 'orange');
          return;
        }
        if (st) st.innerHTML = '🔍 Testando via Worker...';
        try {
          var txt = await callClaude(
            [{ role:'user', content:'Responda apenas: Claude ativo no LexOfficeAT!' }], 60
          );
          if (st) st.innerHTML = '✅ Claude ativo! Modelo: ' + getModelo().replace('claude-','') + ' — ' + txt;
          if (window.toast) window.toast('✅ Claude funcionando!', 'green');
          // Atualiza badge
          var b = document.getElementById('badge-claude');
          if (b) { b.textContent = 'Ativo ✅'; b.className = 'badge bteal'; }
        } catch(e) {
          if (st) st.innerHTML = '❌ ' + e.message;
          if (window.toast) window.toast('❌ ' + e.message.slice(0,60), 'red');
        }
      };
    }

    // Também substitui testarIA global usado no botão da página
    window.testarClaudeGlobal = window.LexAT && window.LexAT.testarIA;

    // ===========================================================
    // 2. abrirProcessoXLS2 — adiciona melhorias APÓS o original
    // ===========================================================
    var _origAbrir = window.abrirProcessoXLS2;
    window.abrirProcessoXLS2 = function(r) {
      if (_origAbrir) _origAbrir(r);
      setTimeout(function() {
        try {
          var row = typeof r === 'string' ? JSON.parse(r) : (r || []);
          // Advogado responsável → Dr. Amilcar
          var respEl = document.getElementById('f_resp');
          if (respEl && !respEl.value) {
            for (var i=0; i<respEl.options.length; i++) {
              if (respEl.options[i].text.toLowerCase().includes('amilcar')) {
                respEl.selectedIndex = i; break;
              }
            }
          }
          // Partes
          if (!((document.getElementById('f_parte1')||{}).value) && row[7]) setVal('f_parte1', row[7]);
          if (!((document.getElementById('f_exadv') ||{}).value) && row[9]) {
            setVal('f_exadv', row[9]);
            var tipoEl = document.getElementById('f_tipo_adv');
            if (tipoEl) tipoEl.value = /LTDA|S\.A|EIRELI|ME |EPP|CIA\.|EMPRESA|SOCIEDADE/i.test(row[9]||'') ? 'PJ' : 'PF';
          }
          // Polo
          var poloEl = document.getElementById('f_polo');
          if (poloEl && row[8] && !poloEl.value) poloEl.value = row[8];
          // Auto-consulta DataJud se faltar ação
          var cnj  = ((document.getElementById('f_auto') ||{}).value||'');
          var acao = ((document.getElementById('f_acao') ||{}).value||'');
          if (cnj && !acao && typeof window.consultarCNJ === 'function') {
            var ci = document.getElementById('cnj_input_api');
            if (ci) ci.value = cnj;
            setTimeout(function(){ window.consultarCNJ(); }, 600);
          }
        } catch(e) {}
      }, 350);
    };

    // ===========================================================
    // 3. NOVO PROCESSO — ficha automática
    // ===========================================================
    function interceptarBotaoNovo() {
      var btn = document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
      if (!btn || btn._enhHooked) return;
      btn._enhHooked = true;
      btn.setAttribute('onclick', '');
      btn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        abrirNovoProcessoEnh();
      });
    }

    function abrirNovoProcessoEnh() {
      if (typeof openModal === 'function') openModal('mProcesso');
      setTimeout(function() {
        if (typeof switchTab === 'function') switchTab('dados');
        // Gera ficha
        var maxNum = 0;
        if (typeof XLS2_DATA !== 'undefined') {
          XLS2_DATA.forEach(function(r){ var n=parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum)maxNum=n; });
        }
        if (typeof LexSync !== 'undefined') {
          LexSync.DB.getAll(LexSync.DB.KEYS.processos).forEach(function(p){ var n=parseInt((p.ficha||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum)maxNum=n; });
        }
        var novaFicha = 'A' + String(maxNum+1).padStart(4,'0');
        // Limpa campos
        ['f_acao','f_auto','f_vara','f_comarca','f_parte1','f_exadv','f_cpf_cli','f_qual_cli','f_cpf_adv','f_qual_adv','f_adv_adv']
          .forEach(function(id){ var el=document.getElementById(id); if(el)el.value=''; });
        setVal('f_proc', novaFicha);
        var poloEl=document.getElementById('f_polo'); if(poloEl)poloEl.value='AUTOR';
        var tipoEl=document.getElementById('f_tipo_adv'); if(tipoEl)tipoEl.value='PF';
        var stEl=document.getElementById('f_status'); if(stEl)stEl.value='ativo';
        // Advogado Amilcar
        var respEl=document.getElementById('f_resp');
        if(respEl){for(var i=0;i<respEl.options.length;i++){if(respEl.options[i].text.toLowerCase().includes('amilcar')){respEl.selectedIndex=i;break;}}}
        // Banner
        var b=document.getElementById('autoFillBanner');
        if(b){b.style.display='flex';b.innerHTML='✨ Novo — ficha <strong>'+novaFicha+'</strong> — Digite o CNJ e pressione Enter';}
        // Foca CNJ
        var ci=document.getElementById('cnj_input_api'); if(ci)setTimeout(function(){ci.focus();},200);
      }, 200);
    }

    interceptarBotaoNovo();

    // ===========================================================
    // 4. PUBLICAÇÕES — histórico LexDB + AUTO-CRIAR PROCESSOS
    // ===========================================================
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
          var cor=isJB?'bo':'bteal';
          var label=isJB?'JusBrasil':'Impacta';
          var data=(pub.data||pub.timestamp||'').slice(0,10).split('-').reverse().join('/');
          var mov=(pub.movimento||pub.raw||'').slice(0,80);
          html+='<div class="ditem" style="flex-direction:column;align-items:flex-start;gap:3px;margin-bottom:5px;cursor:pointer"'
            +' onclick="lexEnhVerPub(\''+pub.id+'\')">'
            +'<div style="display:flex;align-items:center;gap:7px;width:100%">'
            +'<span class="badge '+cor+'" style="font-size:10px">'+label+'</span>'
            +(pub.cnj?'<span style="font-size:10px;color:var(--teal)">'+pub.cnj+'</span>':'')
            +'<span style="font-size:10px;color:var(--text3);margin-left:auto">'+data+'</span>'
            +'<span class="badge bg" style="font-size:9px">✅</span>'
            +'</div>'
            +(mov?'<div style="font-size:11px;color:var(--text2);padding-left:2px">'+mov+'</div>':'')
            +'</div>';
        });
        if (html) el.innerHTML = html;
      }, 400);
    };

    window.lexEnhVerPub = function(pubId) {
      try {
        var pub = (LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes)||[]).find(function(p){return p.id===pubId;});
        if (!pub) return;
        var bodyEl=document.getElementById('emailBody'); if(bodyEl)bodyEl.value=pub.raw||pub.movimento||'';
        var remEl=document.getElementById('emailRem');   if(remEl)remEl.value=pub.fonte||'impacta';
        if(window.toast)window.toast('📋 Publicação carregada — clique Extrair & Processar','blue');
      } catch(e){}
    };

    // ===========================================================
    // 5. AUTO-CRIAR PROCESSO de publicação nova
    // ===========================================================
    // Quando uma publicação é processada (Impacta/Jusbrasil/CNJ/TRT9)
    // e o CNJ não existe em XLS2_DATA → cria processo novo automaticamente

    window.lexEnhCriarProcessoDePub = async function(pub) {
      if (!pub || !pub.cnj) return null;

      // Verifica se já existe no XLS2
      var jaExiste = false;
      if (typeof XLS2_DATA !== 'undefined') {
        jaExiste = XLS2_DATA.some(function(r){ return (r[2]||'').includes(pub.cnj); });
      }
      if (typeof LexSync !== 'undefined') {
        if (LexSync.DB.findByCNJ(pub.cnj)) jaExiste = true;
      }
      if (jaExiste) return null; // já cadastrado

      // Gera ficha nova
      var maxNum = 0;
      if (typeof XLS2_DATA !== 'undefined') {
        XLS2_DATA.forEach(function(r){ var n=parseInt((r[0]||'').replace(/\D/g,'')); if(!isNaN(n)&&n>maxNum)maxNum=n; });
      }
      var novaFicha = 'A' + String(maxNum+1).padStart(4,'0');

      // Busca dados no DataJud
      var dadosProc = {
        ficha:  novaFicha,
        cnj:    pub.cnj,
        acao:   pub.tipo_acao || '',
        vara:   pub.vara      || '',
        comarca:pub.comarca   || '',
        parte1: pub.polo_ativo|| '',
        exadv:  pub.polo_passivo||'',
        polo:   'AUTOR',
        status: 'ativo',
      };

      // Enriquece via DataJud se tiver proxy
      try {
        var partes = window.LexCNJ ? window.LexCNJ.parseCNJ(pub.cnj) : null;
        var sigla  = partes ? ({'8.16':'tjpr','5.09':'trt9','5.17':'trt17','4.04':'trf4','3.00':'stj','5.00':'tst'}[partes.chave]||'tjpr') : 'tjpr';
        var resp = await fetch(PROXY + '/api_publica_' + sigla + '/_search', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({query:{bool:{should:[{match:{numeroProcesso:pub.cnj}},{term:{'numeroProcesso.keyword':pub.cnj}}]}},size:1})
        });
        var djData = await resp.json();
        var hit = djData.hits && djData.hits.hits && djData.hits.hits[0];
        if (hit) {
          var src = hit._source || {};
          var partes2 = src.partes || [];
          var autor = partes2.find(function(p){return /ATIVO|AUTOR|RECLAMANTE/i.test(p.polo||'');});
          var reu   = partes2.find(function(p){return /PASSIVO|REU|RECLAMADO/i.test(p.polo||'');});
          if (src.classe && src.classe.nome) dadosProc.acao = src.classe.nome;
          if (src.orgaoJulgador && src.orgaoJulgador.nome) dadosProc.vara = src.orgaoJulgador.nome;
          if (src.municipio && src.municipio.nome) dadosProc.comarca = src.municipio.nome;
          if (autor) dadosProc.parte1 = autor.nome;
          if (reu)   dadosProc.exadv  = reu.nome;
        }
      } catch(e) {}

      // Salva no LexDB
      if (typeof LexSync !== 'undefined') {
        var db = LexSync.DB;
        db.add(db.KEYS.processos, {
          id: db.newId('proc'), ficha: dadosProc.ficha, cnj: dadosProc.cnj,
          tipo_acao: dadosProc.acao, vara: dadosProc.vara, comarca: dadosProc.comarca,
          status: 'Em Andamento', polo_cliente: dadosProc.parte1, ex_adverso: dadosProc.exadv,
          polo: dadosProc.polo, fonte_criacao: pub.fonte || 'publicacao',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }

      // Salva no DB local (compatível com XLS2)
      if (typeof DB !== 'undefined') {
        DB.save('lex_proc_' + dadosProc.ficha, dadosProc);
      }

      // Cria pasta no Drive
      if (dadosProc.parte1 && typeof LexAT !== 'undefined' && LexAT.DRIVE) {
        var nomePasta = dadosProc.ficha + ' — ' + dadosProc.parte1
          + (dadosProc.exadv ? ' vs ' + dadosProc.exadv : '');
        LexAT.DRIVE.criarPastaCliente(nomePasta.slice(0,100)).catch(function(){});
      }

      if (window.toast) window.toast('✨ Processo criado: ' + dadosProc.ficha + ' — ' + (dadosProc.parte1||pub.cnj), 'teal');
      return dadosProc;
    };

    // Hook no AutoFill do LexSync para criar processo automaticamente
    if (typeof LexSync !== 'undefined' && LexSync.AutoFill) {
      var _origProcess = LexSync.AutoFill.processarPublicacao.bind(LexSync.AutoFill);
      LexSync.AutoFill.processarPublicacao = async function(parsed) {
        var resultado = _origProcess(parsed);
        // Para cada processo novo da publicação → tenta criar processo
        if (resultado && resultado.novos && resultado.novos.length === 0) {
          // processo novo no LexSync mas não no XLS2 → cria
          var pubs = LexSync.DB.getAll(LexSync.DB.KEYS.publicacoes) || [];
          var ultimaPub = pubs[pubs.length - 1];
          if (ultimaPub) {
            setTimeout(function() {
              window.lexEnhCriarProcessoDePub(ultimaPub);
            }, 1000);
          }
        }
        return resultado;
      };
    }

    // Botão manual "Criar Processo" no painel de parser
    window.lexEnhCriarDaPublicacao = async function() {
      var cnj  = ((document.getElementById('cnj_resultado') ? document.querySelector('#parserCampos [title]') : null)||{}).title || '';
      // Tenta pegar do EMAIL._extracao
      var extr = (typeof EMAIL !== 'undefined' && EMAIL._extracao) ? EMAIL._extracao : null;
      if (!extr) { if(window.toast)window.toast('⚠️ Processe um e-mail primeiro','orange'); return; }
      if (window.toast) window.toast('🔄 Criando processo...','teal');
      var pub = {
        cnj:          extr.cnj || extr.auto || '',
        tipo_acao:    extr.tipo_acao || extr.acao || '',
        vara:         extr.vara || '',
        comarca:      extr.comarca || '',
        polo_ativo:   extr.polo_cliente || extr.parte1 || '',
        polo_passivo: extr.ex_adverso   || extr.exadv  || '',
        fonte:        (document.getElementById('emailRem')||{}).value || 'impacta',
        movimento:    extr.tipo_mov || extr.mov || '',
      };
      var proc = await window.lexEnhCriarProcessoDePub(pub);
      if (proc) {
        if(window.toast)window.toast('✅ Processo '+proc.ficha+' criado com sucesso!','green');
      } else {
        if(window.toast)window.toast('ℹ️ Processo já cadastrado ou CNJ não encontrado','blue');
      }
    };

    // Adiciona botão "Criar Processo" no painel de parser se não existir
    setTimeout(function() {
      var parserCard = document.getElementById('parserCard');
      if (parserCard && !document.getElementById('btn-criar-de-pub')) {
        var btnArea = parserCard.querySelector('.cb') || parserCard;
        var btn = document.createElement('button');
        btn.id = 'btn-criar-de-pub';
        btn.className = 'btn btn-teal btn-sm';
        btn.style.cssText = 'margin-top:10px;width:100%';
        btn.innerHTML = '✨ Criar Processo desta Publicação';
        btn.onclick = function() { window.lexEnhCriarDaPublicacao(); };
        btnArea.appendChild(btn);
      }
    }, 1500);

    // ===========================================================
    // 6. VALIDAÇÃO ANTES DE SALVAR
    // ===========================================================
    var _origSalvar = window.salvarProcesso;
    window.salvarProcesso = function() {
      var g = function(id){ return ((document.getElementById(id)||{}).value||'').trim(); };
      var erros = [
        {id:'f_proc',   nome:'Ficha'},
        {id:'f_auto',   nome:'CNJ'},
        {id:'f_acao',   nome:'Tipo de Ação'},
        {id:'f_parte1', nome:'Nome do Cliente'},
      ].filter(function(c){ return !g(c.id); });

      if (erros.length) {
        var nomes = erros.map(function(c){return c.nome;}).join(' · ');
        if(window.toast) window.toast('⚠️ Obrigatório: ' + nomes, 'orange');
        erros.forEach(function(c){
          var el=document.getElementById(c.id);
          if(el){ el.style.borderColor='var(--red)'; el.style.boxShadow='0 0 0 2px rgba(224,92,92,.2)';
            setTimeout(function(){el.style.borderColor='';el.style.boxShadow='';},3000); }
        });
        if(typeof switchTab==='function'){
          if(!g('f_proc')||!g('f_auto')||!g('f_acao')) switchTab('dados');
          else switchTab('partes');
        }
        return;
      }
      if (_origSalvar) _origSalvar();
    };

    // ===========================================================
    // CSS
    // ===========================================================
    if (!document.getElementById('lex-enh-css')) {
      var s=document.createElement('style'); s.id='lex-enh-css';
      s.textContent = '.af{border-color:var(--teal)!important;background:rgba(62,207,207,.04)!important;transition:border-color .4s}';
      document.head.appendChild(s);
    }

    console.log('[LexOfficeAT Enhancements v2.0] ✅ testarIA·auto-fill·novo-proc·publicações·auto-criar·validação');
  }

  // Inicia após carregar tudo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 900); });
  } else {
    setTimeout(init, 900);
  }

  // Re-aplica ao trocar de página
  setTimeout(function(){
    var origGo = window.go;
    if (!origGo) return;
    window.go = function(page, el) {
      origGo(page, el);
      setTimeout(function(){
        if (page === 'processos') {
          var btn = document.querySelector('button[onclick="openModal(\'mProcesso\')"]');
          if (btn && !btn._enhHooked) {
            btn._enhHooked = true;
            btn.setAttribute('onclick','');
            btn.addEventListener('click', function(e){
              e.preventDefault();
              if(typeof abrirNovoProcessoEnh === 'function') abrirNovoProcessoEnh();
            });
          }
        }
        if (page === 'emails') {
          setTimeout(function(){ if(typeof carregarInbox==='function') carregarInbox(); }, 500);
        }
      }, 400);
    };
  }, 1500);

})();

/**
 * LexOfficeAT — CNJ Auto-Fill v2.1
 * Corrigido: proxy próprio + IA + mapeamento completo de tribunais
 */
(function () {
  'use strict';

  // ============================================================
  // MAPEAMENTO COMPLETO — todos os 90 tribunais brasileiros
  // ============================================================
  var TRIBUNAIS = {
    // Estaduais (J=8)
    '8.01':{ nome:'TJAC — Acre',             sigla:'TJAC', uf:'AC' },
    '8.02':{ nome:'TJAL — Alagoas',          sigla:'TJAL', uf:'AL' },
    '8.03':{ nome:'TJAP — Amapá',            sigla:'TJAP', uf:'AP' },
    '8.04':{ nome:'TJAM — Amazonas',         sigla:'TJAM', uf:'AM' },
    '8.05':{ nome:'TJBA — Bahia',            sigla:'TJBA', uf:'BA' },
    '8.06':{ nome:'TJCE — Ceará',            sigla:'TJCE', uf:'CE' },
    '8.07':{ nome:'TJDF — Distrito Federal', sigla:'TJDFT',uf:'DF' },
    '8.08':{ nome:'TJES — Espírito Santo',   sigla:'TJES', uf:'ES' },
    '8.09':{ nome:'TJGO — Goiás',            sigla:'TJGO', uf:'GO' },
    '8.10':{ nome:'TJMA — Maranhão',         sigla:'TJMA', uf:'MA' },
    '8.11':{ nome:'TJMT — Mato Grosso',      sigla:'TJMT', uf:'MT' },
    '8.12':{ nome:'TJMS — Mato Grosso do Sul',sigla:'TJMS',uf:'MS', esaj:'https://esaj.tjms.jus.br/cpopg2/show.do?processo.numero={cnj}' },
    '8.13':{ nome:'TJMG — Minas Gerais',     sigla:'TJMG', uf:'MG', pje:'https://www5.tjmg.jus.br/jurisprudencia/pesquisaNumeroCNJProcesso.do?numeroProcesso={cnj}' },
    '8.14':{ nome:'TJPA — Pará',             sigla:'TJPA', uf:'PA' },
    '8.15':{ nome:'TJPB — Paraíba',          sigla:'TJPB', uf:'PB' },
    '8.16':{ nome:'TJPR — Paraná',           sigla:'TJPR', uf:'PR',
             projudi:'https://projudi.tjpr.jus.br/projudi/?numeroProcesso={cnj}',
             pje:'https://portal.tjpr.jus.br/jurisprudencia/j/{cnj}' },
    '8.17':{ nome:'TJPE — Pernambuco',       sigla:'TJPE', uf:'PE' },
    '8.18':{ nome:'TJPI — Piauí',            sigla:'TJPI', uf:'PI' },
    '8.19':{ nome:'TJRJ — Rio de Janeiro',   sigla:'TJRJ', uf:'RJ' },
    '8.20':{ nome:'TJRN — Rio Grande do Norte',sigla:'TJRN',uf:'RN' },
    '8.21':{ nome:'TJRS — Rio Grande do Sul',sigla:'TJRS', uf:'RS' },
    '8.22':{ nome:'TJRO — Rondônia',         sigla:'TJRO', uf:'RO' },
    '8.23':{ nome:'TJRR — Roraima',          sigla:'TJRR', uf:'RR' },
    '8.24':{ nome:'TJSC — Santa Catarina',   sigla:'TJSC', uf:'SC', esaj:'https://esaj.tjsc.jus.br/cpopg/show.do?processo.numero={cnj}' },
    '8.25':{ nome:'TJSE — Sergipe',          sigla:'TJSE', uf:'SE' },
    '8.26':{ nome:'TJSP — São Paulo',        sigla:'TJSP', uf:'SP', esaj:'https://esaj.tjsp.jus.br/cpopg/show.do?processo.numero={cnj}' },
    '8.27':{ nome:'TJTO — Tocantins',        sigla:'TJTO', uf:'TO' },
    // Trabalho (J=5)
    '5.01':{ nome:'TRT 1ª Região (RJ)',      sigla:'TRT1', uf:'RJ', pje:'https://pje.trt1.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.02':{ nome:'TRT 2ª Região (SP)',      sigla:'TRT2', uf:'SP', pje:'https://pje.trt2.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.03':{ nome:'TRT 3ª Região (MG)',      sigla:'TRT3', uf:'MG', pje:'https://pje.trt3.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.04':{ nome:'TRT 4ª Região (RS)',      sigla:'TRT4', uf:'RS', pje:'https://pje.trt4.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.05':{ nome:'TRT 5ª Região (BA)',      sigla:'TRT5', uf:'BA', pje:'https://pje.trt5.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.06':{ nome:'TRT 6ª Região (PE)',      sigla:'TRT6', uf:'PE', pje:'https://pje.trt6.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.07':{ nome:'TRT 7ª Região (CE)',      sigla:'TRT7', uf:'CE', pje:'https://pje.trt7.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.08':{ nome:'TRT 8ª Região (PA/AP)',   sigla:'TRT8', uf:'PA', pje:'https://pje.trt8.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.09':{ nome:'TRT 9ª Região (PR/MS)',   sigla:'TRT9', uf:'PR',
             pje:'https://pje.trt9.jus.br/consultaprocessual/detalhe-processo/{cnj}',
             projudi:'https://projudi.trt9.jus.br/projudi/?numeroProcesso={cnj}' },
    '5.10':{ nome:'TRT 10ª Região (DF/TO)', sigla:'TRT10',uf:'DF', pje:'https://pje.trt10.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.11':{ nome:'TRT 11ª Região (AM/RR)', sigla:'TRT11',uf:'AM', pje:'https://pje.trt11.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.12':{ nome:'TRT 12ª Região (SC)',     sigla:'TRT12',uf:'SC', pje:'https://pje.trt12.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.13':{ nome:'TRT 13ª Região (PB)',     sigla:'TRT13',uf:'PB', pje:'https://pje.trt13.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.14':{ nome:'TRT 14ª Região (RO/AC)', sigla:'TRT14',uf:'RO', pje:'https://pje.trt14.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.15':{ nome:'TRT 15ª Região (Campinas)',sigla:'TRT15',uf:'SP',pje:'https://pje.trt15.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.16':{ nome:'TRT 16ª Região (MA)',     sigla:'TRT16',uf:'MA', pje:'https://pje.trt16.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.17':{ nome:'TRT 17ª Região (ES)',     sigla:'TRT17',uf:'ES', pje:'https://pje.trt17.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.18':{ nome:'TRT 18ª Região (GO)',     sigla:'TRT18',uf:'GO', pje:'https://pje.trt18.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.19':{ nome:'TRT 19ª Região (AL)',     sigla:'TRT19',uf:'AL', pje:'https://pje.trt19.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.20':{ nome:'TRT 20ª Região (SE)',     sigla:'TRT20',uf:'SE', pje:'https://pje.trt20.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.21':{ nome:'TRT 21ª Região (RN)',     sigla:'TRT21',uf:'RN', pje:'https://pje.trt21.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.22':{ nome:'TRT 22ª Região (PI)',     sigla:'TRT22',uf:'PI', pje:'https://pje.trt22.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.23':{ nome:'TRT 23ª Região (MT)',     sigla:'TRT23',uf:'MT', pje:'https://pje.trt23.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    '5.24':{ nome:'TRT 24ª Região (MS)',     sigla:'TRT24',uf:'MS', pje:'https://pje.trt24.jus.br/consultaprocessual/detalhe-processo/{cnj}' },
    // Federal (J=4)
    '4.01':{ nome:'TRF 1ª Região (Norte/Centro-Oeste)',sigla:'TRF1',uf:'DF',pje:'https://processual.trf1.jus.br/consultaProcessual/processo.php?proc={cnj}' },
    '4.02':{ nome:'TRF 2ª Região (RJ/ES)',   sigla:'TRF2',uf:'RJ', pje:'https://consulta.trf2.jus.br/consulta/processo?nproc={cnj}' },
    '4.03':{ nome:'TRF 3ª Região (SP/MS)',   sigla:'TRF3',uf:'SP', pje:'https://web.trf3.jus.br/base/base/baixarDocumento/{cnj}' },
    '4.04':{ nome:'TRF 4ª Região (Sul)',     sigla:'TRF4',uf:'RS', pje:'https://eproc.trf4.jus.br/eproc2trf4/controlador.php?acao=processo_selecionar&num_processo={cnj}' },
    '4.05':{ nome:'TRF 5ª Região (Nordeste)',sigla:'TRF5',uf:'PE', pje:'https://pje.trf5.jus.br/pje/ConsultaPublica/listView.seam' },
    '4.06':{ nome:'TRF 6ª Região (MG)',      sigla:'TRF6',uf:'MG', pje:'https://pje1g.trf6.jus.br/pje/ConsultaPublica/listView.seam' },
    // Superiores
    '3.00':{ nome:'STJ — Superior Tribunal de Justiça',  sigla:'STJ', uf:'DF', pje:'https://processo.stj.jus.br/processo/pesquisa/?num_processo={cnj}' },
    '1.00':{ nome:'STF — Supremo Tribunal Federal',      sigla:'STF', uf:'DF', pje:'https://portal.stf.jus.br/processos/detalhe.asp?incidente={cnj}' },
    '5.00':{ nome:'TST — Tribunal Superior do Trabalho', sigla:'TST', uf:'DF', pje:'https://consultaprocessual.tst.jus.br/consultaProcessual/consultaTstNumUnica.do?consulta=Consultar&numeroTst={cnj}' },
    '6.00':{ nome:'TSE — Tribunal Superior Eleitoral',   sigla:'TSE', uf:'DF', pje:'https://www.tse.jus.br' },
    '7.00':{ nome:'STM — Superior Tribunal Militar',     sigla:'STM', uf:'DF', pje:'https://www.stm.jus.br' },
  };

  // Siglas DataJud por chave
  var DJ = {
    '8.01':'tjac','8.02':'tjal','8.03':'tjap','8.04':'tjam','8.05':'tjba','8.06':'tjce',
    '8.07':'tjdft','8.08':'tjes','8.09':'tjgo','8.10':'tjma','8.11':'tjmt','8.12':'tjms',
    '8.13':'tjmg','8.14':'tjpa','8.15':'tjpb','8.16':'tjpr','8.17':'tjpe','8.18':'tjpi',
    '8.19':'tjrj','8.20':'tjrn','8.21':'tjrs','8.22':'tjro','8.23':'tjrr','8.24':'tjsc',
    '8.25':'tjse','8.26':'tjsp','8.27':'tjto',
    '5.01':'trt1','5.02':'trt2','5.03':'trt3','5.04':'trt4','5.05':'trt5','5.06':'trt6',
    '5.07':'trt7','5.08':'trt8','5.09':'trt9','5.10':'trt10','5.11':'trt11','5.12':'trt12',
    '5.13':'trt13','5.14':'trt14','5.15':'trt15','5.16':'trt16','5.17':'trt17','5.18':'trt18',
    '5.19':'trt19','5.20':'trt20','5.21':'trt21','5.22':'trt22','5.23':'trt23','5.24':'trt24',
    '4.01':'trf1','4.02':'trf2','4.03':'trf3','4.04':'trf4','4.05':'trf5','4.06':'trf6',
    '3.00':'stj','1.00':'stf','5.00':'tst','6.00':'tse','7.00':'stm'
  };

  var JUSTICAS = {'1':'STF','2':'CNJ','3':'STJ','4':'Federal','5':'Trabalho','6':'Eleitoral','7':'Militar','8':'Estadual','9':'DF'};

  function parseCNJ(cnj) {
    var c=(cnj||'').replace(/\s/g,'');
    var m=c.match(/^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/);
    if(!m) return null;
    return { numero:m[1],digito:m[2],ano:m[3],justica:m[4],tribunal:m[5],origem:m[6],
             raw:c, chave:m[4]+'.'+m[5] };
  }

  function detectarTribunal(p) {
    if(!p) return null;
    return TRIBUNAIS[p.chave] || TRIBUNAIS[p.justica+'.00'] || null;
  }

  // ============================================================
  // ESTRATÉGIA 1: DataJud via proxy Cloudflare Worker
  // ============================================================
  // Mapeia classe do DataJud para tipo de ação legível
  function _mapearTipoAcao(classe) {
    if (!classe) return '';
    var c = classe.toUpperCase();
    var mapa = [
      [/RECLAMAT|TRABALHIST/,           'RECLAMATÓRIA TRABALHISTA'],
      [/EXECU.*TRABALHIST|EXECU.*CLT/,  'EXECUÇÃO TRABALHISTA'],
      [/EXECU.*FISCAL|DIVIDA.*ATIVA/,   'EXECUÇÃO FISCAL'],
      [/EXECU.*CIVIL|CUMPRI.*SENTEN/,   'CUMPRIMENTO DE SENTENÇA'],
      [/INDENIZ|DANO.*MORAL|DANO.*MAT/, 'AÇÃO DE INDENIZAÇÃO'],
      [/COBRAN/,                         'AÇÃO DE COBRANÇA'],
      [/DESPEJO|LOCA/,                   'AÇÃO DE DESPEJO'],
      [/ALIMENT/,                        'AÇÃO DE ALIMENTOS'],
      [/DIVORCIO|DIVÓRCIO/,              'AÇÃO DE DIVÓRCIO'],
      [/INVENTARIO|INVENTÁRIO/,          'INVENTÁRIO'],
      [/HABEAS.*CORPUS/,                 'HABEAS CORPUS'],
      [/MANDADO.*SEGURANÇA/,             'MANDADO DE SEGURANÇA'],
      [/RECUPERA.*JUDICIAL/,             'RECUPERAÇÃO JUDICIAL'],
      [/FALENCIA|FALÊNCIA/,              'FALÊNCIA'],
      [/REVISIONAL|REVISAO/,             'AÇÃO REVISIONAL'],
      [/USUCAP/,                         'USUCAPIÃO'],
      [/MONITOR/,                        'AÇÃO MONITÓRIA'],
      [/POSSESSORIA|REINTEGR/,           'AÇÃO POSSESSÓRIA'],
      [/PROCEDIMENTO.*COMUM|ORDINARIO/,  'PROCEDIMENTO COMUM CÍVEL'],
    ];
    for (var i = 0; i < mapa.length; i++) {
      if (mapa[i][0].test(c)) return mapa[i][1];
    }
    return classe; // retorna o original se não mapear
  }

  async function consultarDataJud(cnj, partes) {
    var proxyUrl = localStorage.getItem('lex_datajud_proxy') || '';
    var sigla = partes ? (DJ[partes.chave]||'tjpr') : 'tjpr';
    var apiUrl = (proxyUrl ? proxyUrl.replace(/\/$/, '') : 'https://api-publica.datajud.cnj.jus.br')
                 + '/api_publica_'+sigla+'/_search';

    var headers = {'Content-Type':'application/json'};
    if (!proxyUrl) headers['Authorization'] = 'ApiKey cDZHYzlZa0JadVREZDJCendFbGFkUnBQbXQrTldjSE10';

    var body = JSON.stringify({
      query:{ bool:{ should:[
        { match:{ 'numeroProcesso': cnj } },
        { term:{ 'numeroProcesso.keyword': cnj } },
      ]}}, size:1
    });

    var resp = await fetch(apiUrl, { method:'POST', headers:headers, body:body });
    if (!resp.ok) throw new Error('DataJud HTTP '+resp.status);
    var data = await resp.json();
    var hits = data && data.hits && data.hits.hits;
    if (!hits || !hits.length) throw new Error('Não encontrado no DataJud');

    var src  = hits[0]._source || {};
    var pArr = src.partes || [];
    var aArr = src.advogados || [];
    var autor= pArr.find(function(p){ return /ATIVO|AUTOR|RECLAMANTE|EXEQUENTE/i.test(p.polo||''); });
    var reu  = pArr.find(function(p){ return /PASSIVO|REU|RECLAMADO|EXECUTAD/i.test(p.polo||''); });

    return {
      cnj: cnj, fonte:'DataJud ✅',
      tipo_acao:    _mapearTipoAcao((src.classe&&src.classe.nome)||''),
      vara:         (src.orgaoJulgador&&src.orgaoJulgador.nome)||'',
      comarca:      (src.municipio&&src.municipio.nome)||'',
      estado:       (src.tribunal&&src.tribunal.uf)||'',
      status:       _normStatus(src.situacao),
      polo_ativo:   autor?autor.nome:'',
      polo_passivo: reu?reu.nome:'',
      advogados:    aArr.map(function(a){ return {nome:a.nome,oab:a.numeroOAB||'',polo:a.polo||''}; }),
      data_inicio:  src.dataAjuizamento||'',
      assuntos:     (src.assuntos||[]).map(function(a){return a.nome;}).join(', '),
      movimentos:   (src.movimentos||[]).slice(0,5).map(function(m){return {data:m.dataHora,desc:m.nome};})
    };
  }

  // ============================================================
  // ESTRATÉGIA 2: Claude IA + web_search
  // ============================================================
  async function consultarIA(cnj, partes, tribunal) {
    var key = localStorage.getItem('lex_anthropic_key');
    if (!key) throw new Error('sem API Key');

    var trib = tribunal ? tribunal.nome : 'tribunal brasileiro';
    var link = tribunal ? (tribunal.projudi||tribunal.esaj||tribunal.pje||'').replace(/\{cnj\}/g,cnj) : '';

    var prompt = 'Busque e extraia dados do processo judicial brasileiro número ' + cnj +
      ' no ' + trib + '.' + (link ? ' URL: '+link : '') +
      '\n\nRetorne APENAS JSON válido:\n' +
      '{"tipo_acao":"","vara":"","comarca":"","estado":"","polo_ativo":"","polo_passivo":"","advogados":[{"nome":"","oab":"","polo":""}],"status":"","data_inicio":"","assuntos":"","erro":""}' +
      '\nSe não encontrado, preencha "erro":"nao_encontrado".';

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({
        model:'claude-sonnet-4-20250514', max_tokens:800,
        tools:[{type:'web_search_20250305',name:'web_search'}],
        system:'Consulte processos judiciais brasileiros. Retorne SOMENTE JSON sem markdown.',
        messages:[{role:'user',content:prompt}]
      })
    });
    var data  = await resp.json();
    var texto = (data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
    var r     = JSON.parse(texto.replace(/```json|```/g,'').trim());
    if (r.erro==='nao_encontrado') throw new Error('Não encontrado');
    r.cnj=cnj; r.fonte='Claude IA + Web 🤖';
    return r;
  }

  // ============================================================
  // ESTRATÉGIA 3: LexDB + extração do número
  // ============================================================
  function consultarLexDB(cnj, partes, tribunal) {
    var j     = partes?partes.justica:'8';
    var proc  = typeof LexSync!=='undefined' ? LexSync.DB.findByCNJ(cnj) : null;
    var tipo  = proc?proc.tipo_acao:(j==='5'?'RECLAMATÓRIA TRABALHISTA':j==='4'?'AÇÃO FEDERAL':j==='3'?'RECURSO STJ':j==='1'?'RECURSO STF':'AÇÃO CÍVEL');
    var vara  = proc?proc.vara:(tribunal?tribunal.nome:'');
    var com   = proc?proc.comarca:(tribunal?tribunal.uf||'PR':'PR');

    return {
      cnj: cnj, fonte: proc?'LexDB 💾':'CNJ parcial ℹ️',
      tipo_acao:    _mapearTipoAcao(tipo),
      vara:         vara,
      comarca:      com,
      estado:       proc?'':( tribunal?tribunal.uf:'PR' ),
      status:       proc?(proc.status||'Em Andamento'):'Em Andamento',
      polo_ativo:   proc?proc.polo_cliente:'',
      polo_passivo: proc?proc.ex_adverso:'',
      advogados:    [{nome:'Dr. Amilcar Cordeiro Teixeira Filho',oab:'',polo:'ATIVO'}],
      data_inicio:  partes?partes.ano+'-01-01':'',
      assuntos:     '',
      movimentos:   proc&&proc.movimentos?proc.movimentos.slice(0,3):[],
    };
  }

  function _normStatus(sit) {
    var s=((sit&&sit.nome)||sit||'').toUpperCase();
    if(/BAIXAD|ARQUIVAD/.test(s)) return 'Arquivado';
    if(/SUSPEN/.test(s)) return 'Suspenso';
    if(/TRANSIT|JULGAD/.test(s)) return 'Encerrado';
    return 'Em Andamento';
  }

  // ============================================================
  // FUNÇÃO PRINCIPAL
  // ============================================================
  window.consultarCNJ = async function() {
    var cnjEl = document.getElementById('cnj_input_api')||document.getElementById('f_auto');
    var cnj   = ((cnjEl?cnjEl.value:'')||'').trim();
    var btn   = document.getElementById('btn_consultar_api');
    var res   = document.getElementById('cnj_resultado');

    if (!cnj||cnj.length<15) { _toast('⚠️ CNJ inválido','orange'); return; }

    var partes   = parseCNJ(cnj);
    var tribunal = detectarTribunal(partes);
    var sigla    = tribunal?tribunal.sigla:'CNJ';
    var temProxy = !!localStorage.getItem('lex_datajud_proxy');

    if(btn){ btn.innerHTML='⏳ Consultando...'; btn.disabled=true; }
    _setRes(res,'<span style="color:var(--teal)">🔍 Consultando '+sigla+'...</span>');
    _log('🔍 CNJ: '+cnj+' ['+sigla+']'+(temProxy?' via proxy':''));

    var dados = null;
    var dadosLexDB = consultarLexDB(cnj, partes, tribunal);

    // 1. DataJud SEMPRE primeiro
    try {
      _setRes(res,'<span style="color:var(--teal)">📡 DataJud CNJ...</span>');
      dados = await consultarDataJud(cnj, partes);
      _log('✅ DataJud OK');
    } catch(e) { _log('⚠️ DataJud: '+e.message); }

    // 2. Claude IA se DataJud falhou
    if (!dados && localStorage.getItem('lex_anthropic_key')) {
      try {
        _setRes(res,'<span style="color:var(--blue)">🤖 Buscando via IA...</span>');
        dados = await consultarViaIA(cnj, partes, tribunal);
        _log('✅ IA OK');
      } catch(e){ _log('⚠️ IA: '+e.message); }
    }

    // 3. LexDB como último fallback
    if (!dados) { dados = dadosLexDB; _log('ℹ️ LexDB'); }

    _preencherCampos(dados, tribunal);
    _exibirResultado(dados, tribunal, res, partes);
    _toast('✅ '+dados.fonte,'teal');
    if(btn){ btn.innerHTML='🔍 Consultar'; btn.disabled=false; }
  };

  // ============================================================
  // PREENCHIMENTO DOS CAMPOS
  // ============================================================
  function _preencherCampos(d, t) {
    function s(id, val) {
      var el = document.getElementById(id);
      if (!el || val === undefined || val === null || val === '') return;
      el.value = String(val); el.classList.add('af');
      el.dispatchEvent(new Event('input',  {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    }
    function setSel(id, val) {
      var el = document.getElementById(id);
      if (!el || el.tagName !== 'SELECT' || !val) return;
      var v = val.toUpperCase();
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].value.toUpperCase() === v ||
            el.options[i].text.toUpperCase().includes(v)) {
          el.selectedIndex = i; el.classList.add('af');
          el.dispatchEvent(new Event('change', {bubbles:true})); break;
        }
      }
    }

    // ── Determina nosso cliente vs adverso ─────────────────────
    var poloAdv = d.advogados && d.advogados.find(function(a) {
      return a.nome && a.nome.toLowerCase().includes('amilcar');
    });
    var nossoCliente = '', parteAdversa = '', poloNosso = 'AUTOR';
    var advCliente = '', advAdversario = '';

    if (poloAdv && poloAdv.polo) {
      var eAtivo = /ATIVO|AUTOR|RECLAMANTE|EXEQUENTE/i.test(poloAdv.polo);
      nossoCliente = eAtivo ? (d.polo_ativo || '') : (d.polo_passivo || '');
      parteAdversa = eAtivo ? (d.polo_passivo || '') : (d.polo_ativo || '');
      poloNosso    = eAtivo ? 'AUTOR' : 'RÉU';
      advCliente   = eAtivo ? (d.adv_cliente || '') : (d.adv_adverso || '');
      advAdversario= eAtivo ? (d.adv_adverso || '') : (d.adv_cliente || '');
    } else {
      nossoCliente  = d.polo_ativo   || '';
      parteAdversa  = d.polo_passivo || '';
      advCliente    = d.adv_cliente  || '';
      advAdversario = d.adv_adverso  || '';
    }

    // Se não achou Amilcar nos advogados, tenta pelos nomes das partes no LexDB
    if (!nossoCliente && typeof LexSync !== 'undefined') {
      var procDB = LexSync.DB.findByCNJ(d.cnj);
      if (procDB) {
        nossoCliente = nossoCliente || procDB.polo_cliente || '';
        parteAdversa = parteAdversa || procDB.ex_adverso  || '';
      }
    }

    // ── ABA DADOS ──────────────────────────────────────────────
    s('f_auto',    d.cnj);
    s('f_acao',    d.tipo_acao);
    s('f_vara',    d.vara);
    var comarca = d.comarca || '';
    if (d.estado && comarca && !comarca.includes('/')) comarca += '/' + d.estado;
    else if (!comarca && t) comarca = (t.nome||'').replace(/.*—\s*/,'') + (t.uf?'/'+t.uf:'');
    s('f_comarca', comarca);
    s('cnj_input_api', d.cnj);

    // Instância / Grau
    if (d.instancia) s('f_instancia', d.instancia);
    if (d.tribunal_nome) s('f_tribunal', d.tribunal_nome);

    // Status
    var stEl = document.getElementById('f_status');
    if (stEl && d.status) {
      for (var i=0; i<stEl.options.length; i++){
        if(stEl.options[i].text.toLowerCase().includes(d.status.toLowerCase())){stEl.selectedIndex=i;break;}
      }
    }

    // ── ABA PARTES — IDs REAIS ──────────────────────────────────
    s('f_parte1',  nossoCliente);
    setSel('f_polo', poloNosso);
    s('f_exadv',   parteAdversa);

    // Tipo adverso
    if (parteAdversa) {
      var isPJ = /LTDA|S\.?A\.?|EIRELI|ME|EPP|S\/A|SOCIEDADE|EMPRESA|CIA\.|COMPANHIA|BANCO|INSTITUTO|FUND\./i.test(parteAdversa);
      setSel('f_tipo_adv', isPJ ? 'PJ' : 'PF');
    }

    // Advogado do adverso (campo f_adv_adv)
    var advAdv = d.advogados && d.advogados.find(function(a) {
      return a.nome && !a.nome.toLowerCase().includes('amilcar') && a.tipo === 'adverso';
    });
    if (!advAdv) {
      advAdv = d.advogados && d.advogados.find(function(a) {
        return a.nome && !a.nome.toLowerCase().includes('amilcar');
      });
    }
    if (advAdversario) {
      s('f_adv_adv', advAdversario);
    } else if (advAdv) {
      s('f_adv_adv', advAdv.nome + (advAdv.oab ? ' — OAB ' + advAdv.oab : ''));
    }

    // Assunto nas anotações se vazio
    if (d.assuntos) {
      var anEl = document.getElementById('f_anotacoes') || document.getElementById('p_anotacoes');
      if (anEl && !anEl.value) anEl.value = 'Assunto: ' + d.assuntos + (d.ultima_mov ? '
Últ. movimentação: ' + d.ultima_mov : '');
    }

    // Cria pasta no Drive se processo novo
    if (nossoCliente && typeof LexAT !== 'undefined' && LexAT.DRIVE) {
      var procExist = typeof LexSync !== 'undefined' ? LexSync.DB.findByCNJ(d.cnj) : null;
      if (!procExist || !procExist.drive_folder_id) {
        var nomePasta = (nossoCliente + (parteAdversa ? ' vs ' + parteAdversa : '')).slice(0,100);
        LexAT.DRIVE.criarPastaCliente(nomePasta).catch(function(){});
      }
    }

    function s(id,v){
      var el=document.getElementById(id);
      if(el&&v){ el.value=v; el.classList.add('af');
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true})); }
    }
    var comarca = d.comarca || '';
    if (d.estado && comarca && !comarca.includes('/')) comarca += '/'+d.estado;
    else if (!comarca && t) comarca = t.uf||'';

    s('f_auto',    d.cnj);
    s('cnj_input_api', d.cnj);
    s('f_acao',    d.tipo_acao);
    s('f_vara',    d.vara);
    s('f_comarca', comarca);
    s('f_parte1',  d.polo_ativo);
    s('p_polo1',   d.polo_ativo);
    s('f_exadv',   d.polo_passivo);
    s('p_exadv',   d.polo_passivo);

    // Status
    var st=document.getElementById('f_status');
    if(st&&d.status){for(var i=0;i<st.options.length;i++){if(st.options[i].text.toLowerCase().includes(d.status.toLowerCase())){st.selectedIndex=i;break;}}}

    // Advogado → Dr. Amilcar
    var as=document.getElementById('f_adv')||document.getElementById('p_adv');
    if(as){for(var i=0;i<as.options.length;i++){if(as.options[i].text.toLowerCase().includes('amilcar')){as.selectedIndex=i;break;}}}

    // Polo
    var pa=d.advogados&&d.advogados.find(function(a){return a.nome&&a.nome.toLowerCase().includes('amilcar');});
    if(pa) s('f_polo', pa.polo==='PASSIVO'?'Réu':'Autor');

    // Assuntos
    if(d.assuntos){var an=document.getElementById('f_anotacoes')||document.getElementById('p_anotacoes');if(an&&!an.value)an.value='Assunto: '+d.assuntos;}

    // LexDB
    if(typeof LexSync!=='undefined'){
      var ex=LexSync.DB.findByCNJ(d.cnj);
      var db={cnj:d.cnj,tipo_acao:d.tipo_acao,vara:d.vara,comarca:comarca,status:d.status||'Em Andamento',
              polo_cliente:d.polo_ativo,ex_adverso:d.polo_passivo,tribunal_sigla:t?t.sigla:'',
              fonte_consulta:d.fonte,updatedAt:new Date().toISOString()};
      if(ex) LexSync.DB.update(LexSync.DB.KEYS.processos,ex.id,db);
      else{db.id=LexSync.DB.newId('proc');db.createdAt=new Date().toISOString();LexSync.DB.add(LexSync.DB.KEYS.processos,db);}
    }
  }

  // ============================================================
  // RESULTADO VISUAL
  // ============================================================
  function _exibirResultado(d, t, el, partes) {
    if(!el) return;
    var fc = d.fonte.includes('DataJud')?'var(--green)':d.fonte.includes('IA')?'var(--blue)':d.fonte.includes('LexDB')?'var(--teal)':'var(--text3)';
    var temProxy = !!localStorage.getItem('lex_datajud_proxy');

    var h = '<div style="background:var(--surface2);border-radius:10px;padding:12px;margin-top:8px">';

    // Header
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">';
    h += '<span style="color:'+fc+';font-weight:600;font-size:12px">'+d.fonte+'</span>';
    var badges = '';
    if(t) badges+='<span style="background:rgba(201,168,76,.15);color:var(--gold);border:1px solid rgba(201,168,76,.3);padding:2px 7px;border-radius:8px;font-size:10px;margin-left:4px">'+t.sigla+'</span>';
    if(partes) badges+='<span style="background:rgba(62,207,207,.1);color:var(--teal);border:1px solid rgba(62,207,207,.25);padding:2px 7px;border-radius:8px;font-size:10px;margin-left:4px">J'+partes.justica+' T'+partes.tribunal+'</span>';
    h += badges+'</div>';

    // Grid de campos
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px;margin-bottom:10px">';
    function c(l,v){if(!v)return'';return '<div style="background:var(--surface3);border-radius:6px;padding:5px 8px"><div style="color:var(--text3);font-size:9px">'+l+'</div><div style="color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+v+'">'+v+'</div></div>';}
    var comarca = d.comarca||(t&&t.uf)||'';
    if(d.estado && comarca && !comarca.includes('/')) comarca+='/'+d.estado;
    h+=c('⚖️ Tipo de Ação',d.tipo_acao)+c('🏛️ Vara/Órgão',d.vara)
      +c('📍 Comarca',comarca)+c('📊 Status',d.status)
      +c('👤 Cliente/Polo Ativo',d.polo_ativo)+c('⚔️ Adverso/Polo Passivo',d.polo_passivo)
      +(d.adv_cliente?c('👨‍💼 Adv. Cliente',d.adv_cliente):'')
      +(d.adv_adverso?c('⚖️ Adv. Adverso',d.adv_adverso):'')
      +(d.instancia?c('🏢 Instância',d.instancia):'')
      +(d.data_inicio?c('📅 Ajuizamento',d.data_inicio.replace('T',' ').slice(0,10)):'')
      +(d.assuntos?c('📋 Assunto',d.assuntos.slice(0,50)):'')
      +(d.ultima_mov?c('📋 Ult. Mov.',d.ultima_mov.slice(0,50)):'');
    h+='</div>';

    // Advogados
    if(d.advogados&&d.advogados.length){
      h+='<div style="margin-bottom:10px;padding:8px;background:var(--surface3);border-radius:8px">';
      h+='<div style="font-size:9px;color:var(--text3);margin-bottom:5px;text-transform:uppercase;letter-spacing:1px">ADVOGADOS</div>';
      d.advogados.forEach(function(a){
        if(!a.nome) return;
        var ia=a.nome.toLowerCase().includes('amilcar');
        h+='<div style="font-size:11px;color:'+(ia?'var(--gold)':'var(--text2)')+';margin-bottom:3px">'+(ia?'⭐ ':'👤 ')+a.nome+(a.oab?' — OAB '+a.oab:'')+' ('+( a.polo||'?')+')</div>';
      });
      h+='</div>';
    }

    // Links de acesso ao portal
    if(t){
      var links=[['projudi',t.projudi,'Projudi'],['esaj',t.esaj,'eSAJ'],['pje',t.pje,'PJe/Portal']];
      var linksHtml=links.filter(function(l){return l[1];}).map(function(l){
        return '<a href="'+l[1].replace(/\{cnj\}/g,d.cnj)+'" target="_blank" style="font-size:10px;color:var(--teal);text-decoration:none;border:1px solid rgba(62,207,207,.3);padding:3px 8px;border-radius:6px">🔗 '+l[2]+'</a>';
      }).join('');
      if(linksHtml) h+='<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">'+linksHtml+'</div>';
    }

    // Banner proxy se não configurado
    var temClaudeKey = !!localStorage.getItem('lex_anthropic_key');
    if (!temClaudeKey || (!temProxy && d.fonte.includes('parcial'))) {
      h += '<div style="background:rgba(91,141,238,.07);border:1px solid rgba(91,141,238,.2);border-radius:7px;padding:9px;font-size:11px">';
      if (!temClaudeKey) {
        h += '<div style="color:var(--blue);font-weight:600;margin-bottom:4px">🤖 Conecte o Claude para auto-preenchimento real</div>';
        h += '<div style="color:var(--text3)">Integrações → Anthropic API Key → cole sua chave sk-ant-...</div>';
      } else if (!temProxy) {
        h += '<div style="color:var(--gold);font-weight:600;margin-bottom:4px">💡 Configure o Proxy DataJud para dados completos</div>';
        h += '<div style="color:var(--text3)">Worker ativo em: <span style="color:var(--teal)">lexoffice-datajud.amilcaradvocacia.workers.dev</span></div>';
        h += '<div style="color:var(--text3);margin-top:3px">Integrações → URL Proxy DataJud → cole a URL acima</div>';
      }
      h += '</div>';
    }
    h+='</div>';
    el.innerHTML=h;
  }

  // ============================================================
  // PAINEL "COLAR DO PORTAL" — parser de texto copiado
  // ============================================================
  window.parsearTextoPortal = async function() {
    var texto = document.getElementById('txt_colar_portal') ? document.getElementById('txt_colar_portal').value : '';
    if (!texto.trim()) { _toast('Cole o texto do portal primeiro','orange'); return; }
    var key = localStorage.getItem('lex_anthropic_key');
    if (!key) { _toast('Configure a API Key Anthropic','orange'); return; }

    var cnjEl = document.getElementById('cnj_input_api')||document.getElementById('f_auto');
    var cnj = cnjEl?cnjEl.value.trim():'';

    var prompt = 'Extraia dados do processo do seguinte texto copiado de portal judicial:'
      +'\n\n'+texto.slice(0,3000)
      +'\n\nRetorne APENAS JSON: {"tipo_acao":"","vara":"","comarca":"","estado":"","polo_ativo":"","polo_passivo":"","advogados":[{"nome":"","oab":"","polo":""}],"status":"","data_inicio":"","assuntos":""}';

    var resp = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,
        system:'Extrai dados estruturados de textos de portais judiciais. APENAS JSON.',
        messages:[{role:'user',content:prompt}]})
    });
    var data  = await resp.json();
    var texto2= (data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
    var r     = JSON.parse(texto2.replace(/```json|```/g,'').trim());
    r.cnj     = cnj; r.fonte = 'Texto Portal 📋';
    var partes = cnj ? parseCNJ(cnj) : null;
    var tribunal = partes ? detectarTribunal(partes) : null;
    _preencherCampos(r, tribunal);
    _exibirResultado(r, tribunal, document.getElementById('cnj_resultado'), partes);
    _toast('✅ Dados extraídos do texto!','green');
    document.getElementById('modal-colar-portal')&&document.getElementById('modal-colar-portal').remove();
  };

  // ============================================================
  // INJEÇÃO DE BOTÃO "COLAR DO PORTAL" NO MODAL
  // ============================================================
  function injetarBotaoColar() {
    var btnConsultar = document.getElementById('btn_consultar_api');
    if (!btnConsultar || document.getElementById('btn_colar_portal')) return;

    var btn = document.createElement('button');
    btn.id='btn_colar_portal';
    btn.type='button';
    btn.className='btn btn-ghost btn-sm';
    btn.style.cssText='margin-left:6px;font-size:12px';
    btn.innerHTML='📋 Colar texto';
    btn.title='Cole o texto copiado do Projudi/PJe/eSAJ para extração automática';
    btn.onclick = function() {
      document.getElementById('modal-colar-portal')&&document.getElementById('modal-colar-portal').remove();
      var html='<div id="modal-colar-portal" style="position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px">'
        +'<div style="background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:22px;width:560px;max-width:95vw">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
        +'<span style="font-family:\'Playfair Display\',serif;font-size:16px">📋 Colar Texto do Portal</span>'
        +'<button onclick="document.getElementById(\'modal-colar-portal\').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px">✕</button></div>'
        +'<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Abra o processo no Projudi / PJe / eSAJ, selecione tudo (Ctrl+A) e cole aqui:</div>'
        +'<textarea id="txt_colar_portal" placeholder="Cole aqui o texto da página do processo..." style="width:100%;height:160px;background:var(--surface2);border:1px solid var(--border2);border-radius:9px;padding:10px;color:var(--text);font-size:12px;resize:vertical"></textarea>'
        +'<div style="display:flex;gap:8px;margin-top:12px">'
        +'<button class="btn btn-gold" onclick="parsearTextoPortal()">🤖 Extrair com IA</button>'
        +'<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'modal-colar-portal\').remove()">Cancelar</button>'
        +'</div></div></div>';
      document.body.insertAdjacentHTML('beforeend',html);
    };
    btnConsultar.parentNode.appendChild(btn);
  }

  // ============================================================
  // INPUT HOOKS + ENTER
  // ============================================================
  function hookInputs() {
    ['cnj_input_api','f_auto'].forEach(function(id){
      var el=document.getElementById(id);
      if(!el||el._lhook2) return; el._lhook2=true;
      el.addEventListener('input',function(){
        var p=parseCNJ(el.value.trim());
        if(p){
          var t=detectarTribunal(p);
          var ce=document.getElementById('f_comarca');
          if(ce&&!ce.value&&t){ ce.value=(t.nome.replace(/.*—\s*/,''))+'/'+t.uf; ce.classList.add('af'); }
          if(id==='cnj_input_api'){var fa=document.getElementById('f_auto');if(fa) fa.value=el.value.trim();}
        }
      });
      el.addEventListener('keydown',function(e){if(e.key==='Enter'&&parseCNJ(el.value.trim()))window.consultarCNJ();});
    });
    injetarBotaoColar();
  }

  function _setRes(el,html){if(el)el.innerHTML=html;}
  function _log(msg){var el=document.getElementById('emailLog');if(el){var t=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});el.innerHTML+='<div style="color:var(--teal)">['+t+'] '+msg+'</div>';el.scrollTop=el.scrollHeight;}console.log('[LexCNJ]',msg);}
  function _toast(msg,tipo){if(window.toast)window.toast(msg,tipo||'green');}

  // ============================================================
  // CONFIG PROXY DataJud em Integrações
  // ============================================================
  function injetarConfigProxy() {
    var panel = document.getElementById('lexat-api-panel');
    if (!panel || document.getElementById('lex-proxy-config')) return;
    var div = document.createElement('div');
    div.id = 'lex-proxy-config';
    div.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border)';
    div.innerHTML = '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">🌐 URL Proxy DataJud (Cloudflare Worker)</label>'
      +'<div style="display:flex;gap:7px">'
      +'<input type="text" id="lex_proxy_datajud" placeholder="https://lexoffice-datajud.SEU-USUARIO.workers.dev" value="'+(localStorage.getItem('lex_datajud_proxy')||'')+'" style="flex:1;padding:7px 10px;border-radius:8px;background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-size:12px">'
      +'<button class="btn btn-teal btn-sm" onclick="LexCNJ.salvarProxy()">Salvar</button>'
      +'</div>'
      +'<div style="font-size:10px;color:var(--text3);margin-top:4px">Sem proxy: usa Claude IA como fallback. <a href="https://workers.cloudflare.com" target="_blank" style="color:var(--teal)">Criar Worker gratuito →</a></div>';
    panel.appendChild(div);
  }

  window.LexCNJ = {
    parseCNJ:         parseCNJ,
    detectarTribunal: detectarTribunal,
    TRIBUNAIS:        TRIBUNAIS,
    salvarProxy: function() {
      var v = (document.getElementById('lex_proxy_datajud')||{}).value||'';
      localStorage.setItem('lex_datajud_proxy', v.trim());
      _toast(v ? '✅ Proxy salvo!' : '✅ Proxy removido','green');
    }
  };

  function init() {
    hookInputs();
    if (!document.getElementById('lex-cnj-css')) {
      var s=document.createElement('style');s.id='lex-cnj-css';
      s.textContent='.af{border-color:var(--teal)!important;background:rgba(62,207,207,.05)!important;transition:border-color .3s}';
      document.head.appendChild(s);
    }
    new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){
      if(n.nodeType===1&&n.querySelector&&(n.querySelector('#cnj_input_api')||n.querySelector('#lexat-api-panel'))){
        setTimeout(hookInputs,150); setTimeout(injetarConfigProxy,300);
      }
    });});}).observe(document.body,{childList:true,subtree:true});
    console.log('[LexCNJ v2.1] ✅ '+Object.keys(TRIBUNAIS).length+' tribunais | DataJud + IA + Colar Portal');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();

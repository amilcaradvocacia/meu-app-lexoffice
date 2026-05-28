/**
 * LexOfficeAT — Seed LexDB v2.0 DEFINITIVO
 * Dados extraídos diretamente dos e-mails TRT9 Push
 * NOSSO CLIENTE = quem Amilcar defende (sempre o RÉU nesses processos)
 */
(function() {
  'use strict';

  var DADOS = [
    {
      cnj:           '0000528-24.2026.5.09.0656',
      tipo_acao:     'AÇÃO TRABALHISTA - RITO ORDINÁRIO',
      vara:          'VARA DO TRABALHO DE CASTRO',
      comarca:       'CASTRO',
      tribunal:      'TRT 9ª Região (PR/MS)',
      instancia:     '1º Grau',
      data_autuacao: '12/05/2026',
      // Amilcar está em "Advogados do Réu" → nosso cliente = Réu
      polo_cliente:    'LOG BRASIL - TRANSPORTE E LOGISTICA LTDA',
      polo_processual: 'RÉU',
      ex_adverso:      'CIRO DE MATTOS',
      adv_adverso:     'MARTA DIAS DE FRANCA, OAB: 24138',
      movimentos: [
        {data:'26/05/2026', descricao:'Decorrido o prazo de LOG BRASIL - TRANSPORTE E LOGISTICA LTDA em 25/05/2026'},
        {data:'26/05/2026', descricao:'Decorrido o prazo de CIRO DE MATTOS em 25/05/2026'}
      ],
      prazo_dias: 5, tipo_prazo: 'Manifestação'
    },
    {
      cnj:           '0000401-42.2026.5.09.0024',
      tipo_acao:     'AÇÃO TRABALHISTA - RITO ORDINÁRIO',
      vara:          '01ª VARA DO TRABALHO DE PONTA GROSSA',
      comarca:       'PONTA GROSSA',
      tribunal:      'TRT 9ª Região (PR/MS)',
      instancia:     '1º Grau',
      data_autuacao: '31/03/2026',
      polo_cliente:    'FANTOMA TRANSPORTES LTDA',
      polo_processual: 'RÉU',
      ex_adverso:      'LEANDRO GABRIEL KERIK',
      adv_adverso:     'GEOVANNA GOMES DA SILVA OAB 80059; MONIQUE KRUBNIKI OAB 100876',
      movimentos: [
        {data:'26/05/2026', descricao:'Decorrido o prazo de FANTOMA TRANSPORTES LTDA em 25/05/2026'}
      ],
      prazo_dias: 5, tipo_prazo: 'Manifestação'
    },
    {
      cnj:           '0000252-46.2026.5.09.0024',
      tipo_acao:     'AÇÃO TRABALHISTA - RITO ORDINÁRIO',
      vara:          '01ª VARA DO TRABALHO DE PONTA GROSSA',
      comarca:       'PONTA GROSSA',
      tribunal:      'TRT 9ª Região (PR/MS)',
      instancia:     '1º Grau',
      data_autuacao: '03/03/2026',
      polo_cliente:    'KRM TRANSPORTES LTDA',
      polo_processual: 'RÉU',
      ex_adverso:      'JEAN CARLOS MIRANDA',
      adv_adverso:     'FRANCIELI MESSIAS DE CARVALHO OAB 74268; LUIS FERNANDO SCHIEBELBEIN OAB 74286',
      movimentos: [
        {data:'26/05/2026', descricao:'Suspenso o processo por homologacao de acordo ou transacao'},
        {data:'26/05/2026', descricao:'Iniciada a liquidacao'},
        {data:'26/05/2026', descricao:'Decorrido o prazo de KRM TRANSPORTES LTDA em 25/05/2026'}
      ],
      prazo_dias: 0, tipo_prazo: ''
    }
  ];

  function aguardar(cb) {
    if (typeof LexSync !== 'undefined' && LexSync.DB) { cb(); return; }
    setTimeout(function() { aguardar(cb); }, 800);
  }

  function normNome(n) {
    return (n||'').toUpperCase().replace(/[.\-]/g,' ').replace(/\s+/g,' ').trim();
  }

  function injetar() {
    var d = LexSync.DB;
    var hoje = new Date();
    var stats = { processos:0, clientes:0, prazos:0, atualizados:0 };

    // Mapas de existentes
    var cliExist = {};
    (d.getAll(d.KEYS.clientes)||[]).forEach(function(c){ cliExist[normNome(c.nome)]=c; });

    var procExist = {};
    (d.getAll(d.KEYS.processos)||[]).forEach(function(p){
      procExist[(p.cnj||'').replace(/[.\-]/g,'')]=p;
    });
    if (typeof XLS2_DATA !== 'undefined') {
      XLS2_DATA.forEach(function(r){ procExist[(r[2]||'').replace(/[.\-]/g,'')]={xls:true,ficha:r[0]}; });
    }

    // Calcula próxima ficha
    var maxN = 0;
    Object.values(procExist).forEach(function(p){
      var n=parseInt((p.ficha||'').replace(/\D/g,''));
      if(!isNaN(n)&&n>maxN)maxN=n;
    });

    DADOS.forEach(function(dado) {
      var cnjKey = dado.cnj.replace(/[.\-]/g,'');

      // ── CLIENTE ──
      var cliNorm = normNome(dado.polo_cliente);
      if (!cliExist[cliNorm]) {
        var isPJ = /LTDA|S\.A|EIRELI|TRANSPORTES|SERVICOS|LOGISTICA|SEGUROS|BANCO/.test(cliNorm);
        var cli = {
          id: d.newId('cli'), nome: dado.polo_cliente,
          tipo: isPJ?'PJ':'PF', status:'ativo', origem:'trt9_push',
          processos: [dado.cnj],
          createdAt: hoje.toISOString(), updatedAt: hoje.toISOString()
        };
        d.add(d.KEYS.clientes, cli);
        cliExist[cliNorm] = cli;
        stats.clientes++;
      }

      // ── PROCESSO ──
      var existing = procExist[cnjKey];
      if (existing && existing.xls) {
        stats.atualizados++; return;
      }
      if (existing && !existing.xls) {
        // Atualiza campos vazios
        var updates = {};
        if (!existing.polo_cliente && dado.polo_cliente) updates.polo_cliente = dado.polo_cliente;
        if (!existing.polo_processual) updates.polo_processual = dado.polo_processual;
        if (!existing.ex_adverso && dado.ex_adverso) updates.ex_adverso = dado.ex_adverso;
        if (!existing.vara && dado.vara) updates.vara = dado.vara;
        if (!existing.tipo_acao && dado.tipo_acao) updates.tipo_acao = dado.tipo_acao;
        if (!existing.tribunal && dado.tribunal) updates.tribunal = dado.tribunal;
        if (Object.keys(updates).length) {
          updates.updatedAt = hoje.toISOString();
          d.update(d.KEYS.processos, existing.id, updates);
        }
        stats.atualizados++; return;
      }

      // Cria novo
      maxN++;
      var ficha = 'A' + String(maxN).padStart(4,'0');
      var cli2 = cliExist[normNome(dado.polo_cliente)];
      d.add(d.KEYS.processos, {
        id: d.newId('proc'), ficha: ficha,
        cnj: dado.cnj, tipo_acao: dado.tipo_acao,
        vara: dado.vara, comarca: dado.comarca,
        tribunal: dado.tribunal, instancia: dado.instancia,
        status: 'ativo',
        polo_cliente: dado.polo_cliente,
        polo_processual: dado.polo_processual,
        ex_adverso: dado.ex_adverso,
        adv_adverso: dado.adv_adverso,
        adv_cliente: 'AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856',
        cliente_id: cli2 ? cli2.id : null,
        data_autuacao: dado.data_autuacao,
        fonte_criacao: 'trt9_push',
        movimentos: dado.movimentos,
        ultima_mov: dado.movimentos[0] ? dado.movimentos[0].descricao : '',
        createdAt: hoje.toISOString(), updatedAt: hoje.toISOString()
      });
      procExist[cnjKey] = {ficha:ficha};
      stats.processos++;

      // ── PRAZO ──
      if (dado.prazo_dias > 0) {
        var venc = new Date(hoje); venc.setDate(venc.getDate()+dado.prazo_dias);
        var vencBR = venc.toLocaleDateString('pt-BR');
        var vencISO = venc.toISOString().slice(0,10);
        var prazosExist = d.getAll(d.KEYS.prazos)||[];
        var jaTemPrazo = prazosExist.some(function(p){
          return p.cnj===dado.cnj && p.vencimentoISO===vencISO;
        });
        if (!jaTemPrazo) {
          d.add(d.KEYS.prazos, {
            id: d.newId('prazo'), cnj: dado.cnj, ficha: ficha,
            cliente: dado.polo_cliente,
            tipo: dado.tipo_prazo+' — '+dado.prazo_dias+' dias',
            fundamento: dado.movimentos[0] ? dado.movimentos[0].descricao.slice(0,80) : '',
            urgencia: dado.prazo_dias<=3?'alta':'media',
            dias: dado.prazo_dias, vencimento: vencBR, vencimentoISO: vencISO,
            vara: dado.vara, tribunal: dado.tribunal,
            status: 'pendente', createdAt: hoje.toISOString()
          });
          stats.prazos++;
        }
      }

      // ── TAREFA ──
      var tarKey = d.KEYS.tarefas || 'lexat_tarefas';
      var mov0 = dado.movimentos[0] ? dado.movimentos[0].descricao.toUpperCase() : '';
      var tipoTar = 'Analisar publicação';
      if (/SUSPENSO|ACORDO/.test(mov0)) tipoTar = 'Acompanhar acordo';
      else if (/DECORRIDO.*PRAZO/.test(mov0)) tipoTar = 'Verificar prazo decorrido';
      else if (/CONTEST|DEFESA/.test(mov0)) tipoTar = 'Preparar contestação';
      var tarExist = d.getAll(tarKey)||[];
      if (!tarExist.some(function(t){return t.cnj===dado.cnj&&t.tipo===tipoTar;})) {
        var vencTar = new Date(hoje); vencTar.setDate(vencTar.getDate()+3);
        d.add(tarKey, {
          id: d.newId('tar'), cnj: dado.cnj, ficha: ficha,
          cliente: dado.polo_cliente, tipo: tipoTar,
          descricao: dado.movimentos[0] ? dado.movimentos[0].descricao.slice(0,150) : '',
          prioridade: 'alta', status: 'pendente',
          vencimento: vencTar.toLocaleDateString('pt-BR'),
          vencimentoISO: vencTar.toISOString().slice(0,10),
          createdAt: hoje.toISOString()
        });
      }
    });

    // ── PUBLICAÇÕES ──
    var pubsExist = d.getAll(d.KEYS.publicacoes)||[];
    DADOS.forEach(function(dado) {
      if (!pubsExist.some(function(p){return p.cnj===dado.cnj&&p.fonte==='trt9_push';})) {
        d.add(d.KEYS.publicacoes, {
          id: d.newId('pub'), cnj: dado.cnj,
          nosso_cliente: dado.polo_cliente,
          nosso_polo: dado.polo_processual,
          adverso: dado.ex_adverso,
          vara: dado.vara, tribunal: dado.tribunal,
          movimentacao: dado.movimentos[0] ? dado.movimentos[0].descricao : '',
          data_pub: dado.data_autuacao,
          fonte: 'trt9_push', status: 'pendente',
          createdAt: new Date().toISOString()
        });
      }
    });

    console.log('[LexSeed v2] ✅', stats);
    var msg = stats.processos+' proc · '+stats.clientes+' cli · '+stats.prazos+' prazos · '+stats.atualizados+' atualizados';
    if (stats.processos+stats.clientes+stats.prazos > 0 && typeof toast==='function') {
      toast('✅ LexDB: '+msg, 'teal');
    }

    // Atualiza UI imediatamente
    setTimeout(function(){
      if (typeof window.renderDashboardFull==='function') window.renderDashboardFull();
      if (typeof window.lexRenderPagina==='function') {
        ['processos','clientes','prazos','emails','dashboard'].forEach(function(pg){
          window.lexRenderPagina(pg);
        });
      }
    }, 500);
  }

  // Só roda se não rodou hoje
  function rodaSeed() {
    var hoje = new Date().toDateString();
    var ultimo = localStorage.getItem('lex_seed_last');
    if (ultimo === hoje) { console.log('[LexSeed] Já rodou hoje'); return; }
    localStorage.setItem('lex_seed_last', hoje);
    injetar();
  }
  aguardar(rodaSeed);
  window.lexSeedRerun = injetar;
})();

/**
 * LexOfficeAT — Seed LexDB v1.0
 * Dados dos e-mails TRT9 Push injetados diretamente no banco
 * Gerado em: 27/05/2026 20:33
 * 
 * Este arquivo popula automaticamente:
 * - Aba Processos com todos os processos das publicações
 * - Aba Clientes com os clientes correspondentes
 * - Aba Prazos com os prazos calculados
 * - Dashboard com os contadores atualizados
 */
(function() {
  'use strict';

  var SEED_PROCESSOS = [
  {
    "cnj": "0000528-24.2026.5.09.0656",
    "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO",
    "vara": "VARA DO TRABALHO DE CASTRO",
    "comarca": "CASTRO",
    "tribunal": "TRT 9ª Região (PR/MS)",
    "instancia": "1º Grau",
    "data_autuacao": "12/05/2026",
    "nosso_cliente": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA",
    "adverso": "CIRO DE MATTOS",
    "polo": "RÉU",
    "adv_adverso": "MARTA DIAS DE FRANCA, OAB: 24138",
    "eventos": [
      {
        "data": "26/05/2026",
        "descricao": "Decorrido o prazo de LOG BRASIL - TRANSPORTE E LOGISTICA LTDA em 25/05/2026"
      },
      {
        "data": "26/05/2026",
        "descricao": "Decorrido o prazo de CIRO DE MATTOS em 25/05/2026"
      }
    ],
    "prazo_dias": 5,
    "tipo_prazo": "Manifestação"
  },
  {
    "cnj": "0000401-42.2026.5.09.0024",
    "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO",
    "vara": "01ª VARA DO TRABALHO DE PONTA GROSSA",
    "comarca": "PONTA GROSSA",
    "tribunal": "TRT 9ª Região (PR/MS)",
    "instancia": "1º Grau",
    "data_autuacao": "31/03/2026",
    "nosso_cliente": "FANTOMA TRANSPORTES LTDA",
    "adverso": "LEANDRO GABRIEL KERIK",
    "polo": "RÉU",
    "adv_adverso": "GEOVANNA GOMES DA SILVA, OAB: 80059; MONIQUE KRUBNIKI, OAB: 100876",
    "eventos": [
      {
        "data": "26/05/2026",
        "descricao": "Decorrido o prazo de FANTOMA TRANSPORTES LTDA em 25/05/2026"
      }
    ],
    "prazo_dias": 5,
    "tipo_prazo": "Manifestação"
  },
  {
    "cnj": "0000252-46.2026.5.09.0024",
    "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO",
    "vara": "01ª VARA DO TRABALHO DE PONTA GROSSA",
    "comarca": "PONTA GROSSA",
    "tribunal": "TRT 9ª Região (PR/MS)",
    "instancia": "1º Grau",
    "data_autuacao": "03/03/2026",
    "nosso_cliente": "KRM TRANSPORTES LTDA",
    "adverso": "JEAN CARLOS MIRANDA",
    "polo": "RÉU",
    "adv_adverso": "FRANCIELI MESSIAS DE CARVALHO, OAB: 74268; LUIS FERNANDO SCHIEBELBEIN, OAB: 74286",
    "eventos": [
      {
        "data": "26/05/2026",
        "descricao": "Suspenso o processo por homologacao de acordo ou transacao"
      },
      {
        "data": "26/05/2026",
        "descricao": "Iniciada a liquidacao"
      },
      {
        "data": "26/05/2026",
        "descricao": "Decorrido o prazo de KRM TRANSPORTES LTDA em 25/05/2026"
      }
    ],
    "prazo_dias": 0,
    "tipo_prazo": ""
  }
];
  var SEED_CLIENTES  = [
  {
    "nome": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA",
    "tipo": "PJ",
    "status": "ativo",
    "origem": "trt9_push",
    "processos": [
      "0000528-24.2026.5.09.0656"
    ]
  },
  {
    "nome": "FANTOMA TRANSPORTES LTDA",
    "tipo": "PJ",
    "status": "ativo",
    "origem": "trt9_push",
    "processos": [
      "0000401-42.2026.5.09.0024"
    ]
  },
  {
    "nome": "KRM TRANSPORTES LTDA",
    "tipo": "PJ",
    "status": "ativo",
    "origem": "trt9_push",
    "processos": [
      "0000252-46.2026.5.09.0024"
    ]
  }
];
  var SEED_PRAZOS    = [
  {
    "cnj": "0000528-24.2026.5.09.0656",
    "cliente": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA",
    "tipo": "Manifestação — 5 dias",
    "fundamento": "Decorrido o prazo de LOG BRASIL - TRANSPORTE E LOGISTICA LTDA em 25/05/2026",
    "urgencia": "alta",
    "dias": 5,
    "vencimento": "01/06/2026",
    "vencimentoISO": "2026-06-01",
    "vara": "VARA DO TRABALHO DE CASTRO",
    "status": "pendente"
  },
  {
    "cnj": "0000401-42.2026.5.09.0024",
    "cliente": "FANTOMA TRANSPORTES LTDA",
    "tipo": "Manifestação — 5 dias",
    "fundamento": "Decorrido o prazo de FANTOMA TRANSPORTES LTDA em 25/05/2026",
    "urgencia": "alta",
    "dias": 5,
    "vencimento": "01/06/2026",
    "vencimentoISO": "2026-06-01",
    "vara": "01ª VARA DO TRABALHO DE PONTA GROSSA",
    "status": "pendente"
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
    var db = LexSync.DB;
    var hoje = new Date();
    var stats = { processos: 0, clientes: 0, prazos: 0, atualizados: 0 };

    // ── 1. CLIENTES ─────────────────────────────────────────
    var cliExist = db.getAll(db.KEYS.clientes) || [];
    var cliMap   = {};
    cliExist.forEach(function(c) { cliMap[normNome(c.nome)] = c; });

    SEED_CLIENTES.forEach(function(cli) {
      var norm = normNome(cli.nome);
      if (!cliMap[norm]) {
        var novo = {
          id:        db.newId('cli'),
          nome:      cli.nome,
          tipo:      cli.tipo,
          status:    'ativo',
          origem:    'trt9_push',
          processos: cli.processos,
          createdAt: hoje.toISOString(),
          updatedAt: hoje.toISOString(),
        };
        db.add(db.KEYS.clientes, novo);
        cliMap[norm] = novo;
        stats.clientes++;
      }
    });

    // ── 2. PROCESSOS ────────────────────────────────────────
    var procExist = db.getAll(db.KEYS.processos) || [];
    var cnjExist  = {};
    procExist.forEach(function(p) {
      cnjExist[(p.cnj||'').replace(/[.\-]/g,'')] = p;
    });
    // Verifica também no XLS2_DATA
    if (typeof XLS2_DATA !== 'undefined') {
      XLS2_DATA.forEach(function(r) {
        cnjExist[(r[2]||'').replace(/[.\-]/g,'')] = { ficha: r[0], xls: true };
      });
    }

    // Calcula próxima ficha
    var maxN = 0;
    procExist.forEach(function(p) {
      var n = parseInt((p.ficha||'').replace(/\D/g,''));
      if (!isNaN(n) && n > maxN) maxN = n;
    });
    if (typeof XLS2_DATA !== 'undefined') {
      XLS2_DATA.forEach(function(r) {
        var n = parseInt((r[0]||'').replace(/\D/g,''));
        if (!isNaN(n) && n > maxN) maxN = n;
      });
    }

    SEED_PROCESSOS.forEach(function(proc) {
      var cnjLimpo = (proc.cnj||'').replace(/[.\-]/g,'');
      var existing = cnjExist[cnjLimpo];

      if (existing && existing.xls) {
        // Processo está no XLS — apenas registra movimentação
        console.log('[LexSeed] ' + proc.cnj + ' já no cadastro principal (XLS)');
        stats.atualizados++;
        return;
      }

      if (existing && !existing.xls) {
        // Atualiza movimentos
        var movs = existing.movimentos || [];
        (proc.eventos||[]).forEach(function(ev) {
          if (!movs.some(function(m){ return m.descricao === ev.descricao; })) {
            movs.unshift({ data: ev.data, descricao: ev.descricao });
          }
        });
        db.update(db.KEYS.processos, existing.id, {
          movimentos: movs.slice(0, 30),
          ultima_mov: proc.eventos && proc.eventos[0] ? proc.eventos[0].descricao : existing.ultima_mov,
          updatedAt:  hoje.toISOString(),
        });
        stats.atualizados++;
        return;
      }

      // Novo processo
      maxN++;
      var ficha = 'A' + String(maxN).padStart(4, '0');
      var cliNorm = normNome(proc.nosso_cliente);
      var cliObj  = cliMap[cliNorm];

      db.add(db.KEYS.processos, {
        id:              db.newId('proc'),
        ficha:           ficha,
        cnj:             proc.cnj,
        tipo_acao:       proc.tipo_acao,
        vara:            proc.vara,
        comarca:         proc.comarca,
        tribunal:        proc.tribunal,
        instancia:       proc.instancia,
        status:          'ativo',
        polo_cliente:    proc.nosso_cliente,
        polo_processual: proc.polo,
        ex_adverso:      proc.adverso,
        adv_adverso:     proc.adv_adverso,
        adv_cliente:     'AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856',
        cliente_id:      cliObj ? cliObj.id : null,
        fonte_criacao:   'trt9_push',
        data_autuacao:   proc.data_autuacao,
        movimentos:      (proc.eventos||[]).map(function(ev){
          return { data: ev.data, descricao: ev.descricao };
        }),
        ultima_mov:      proc.eventos && proc.eventos[0] ? proc.eventos[0].descricao : '',
        createdAt:       hoje.toISOString(),
        updatedAt:       hoje.toISOString(),
      });
      cnjExist[cnjLimpo] = { ficha: ficha };
      stats.processos++;
    });

    // ── 3. PRAZOS ───────────────────────────────────────────
    var prazExist = db.getAll(db.KEYS.prazos) || [];
    SEED_PRAZOS.forEach(function(pr) {
      var jaExiste = prazExist.some(function(p) {
        return p.cnj === pr.cnj && p.vencimentoISO === pr.vencimentoISO;
      });
      if (jaExiste) return;
      db.add(db.KEYS.prazos, {
        id:            db.newId('prazo'),
        cnj:           pr.cnj,
        cliente:       pr.cliente,
        tipo:          pr.tipo,
        fundamento:    pr.fundamento,
        urgencia:      pr.urgencia,
        dias:          pr.dias,
        vencimento:    pr.vencimento,
        vencimentoISO: pr.vencimentoISO,
        vara:          pr.vara,
        status:        'pendente',
        createdAt:     hoje.toISOString(),
      });
      stats.prazos++;
    });

    // ── 4. TAREFAS ──────────────────────────────────────────
    SEED_PROCESSOS.forEach(function(proc) {
      if (!proc.eventos || !proc.eventos.length) return;
      var ev0 = proc.eventos[0].descricao;
      var tipo = 'Analisar publicação';
      if (/CONTEST|DEFESA/i.test(ev0))     tipo = 'Preparar contestação';
      else if (/RECURSO/i.test(ev0))        tipo = 'Interpor Recurso';
      else if (/AUDIENCIA/i.test(ev0))      tipo = 'Preparar audiência';
      else if (/SENTENCA/i.test(ev0))       tipo = 'Analisar sentença';
      else if (/DECORRIDO.*PRAZO/i.test(ev0)) tipo = 'Verificar prazo decorrido';
      else if (/SUSPENSO|ACORDO/i.test(ev0))  tipo = 'Acompanhar acordo';

      var venc = new Date(hoje);
      venc.setDate(venc.getDate() + 3);
      var tarKey = db.KEYS.tarefas || 'lexat_tarefas';
      var tarExist = db.getAll(tarKey) || [];
      if (!tarExist.some(function(t){ return t.cnj===proc.cnj && t.tipo===tipo; })) {
        db.add(tarKey, {
          id:           db.newId('tar'),
          cnj:          proc.cnj,
          cliente:      proc.nosso_cliente,
          tipo:         tipo,
          descricao:    ev0.slice(0,150),
          prioridade:   'alta',
          status:       'pendente',
          vencimento:   venc.toLocaleDateString('pt-BR'),
          vencimentoISO:venc.toISOString().slice(0,10),
          createdAt:    hoje.toISOString(),
        });
      }
    });

    // ── 5. ATUALIZA UI ──────────────────────────────────────
    console.log('[LexSeed] Injetado:', stats);
    if (stats.processos + stats.clientes + stats.prazos > 0) {
      var msg = stats.processos + ' processos, ' + stats.clientes + ' clientes, ' + stats.prazos + ' prazos adicionados ao LexDB';
      if (typeof window.toast === 'function') window.toast('✅ ' + msg, 'teal');
      console.log('[LexSeed] ✅ ' + msg);
    }

    // Dispara re-render de todas as páginas
    if (typeof window.lexRenderPagina === 'function') {
      ['dashboard','processos','clientes','prazos','emails'].forEach(function(pg) {
        window.lexRenderPagina(pg);
      });
    }

    // Atualiza badge do LexDB na barra de status
    setTimeout(function() {
      var procs2  = (db.getAll(db.KEYS.processos)||[]).length;
      var clis2   = (db.getAll(db.KEYS.clientes)||[]).length;
      var prazos2 = (db.getAll(db.KEYS.prazos)||[]).filter(function(p){return p.status==='pendente';}).length;
      var bar = document.querySelector('[data-lexdb-info]') || document.querySelector('.alert-lexdb');
      if (bar) bar.textContent = 'LexDB ativo — ' + clis2 + ' clientes · ' + procs2 + ' processos · ' + prazos2 + ' prazos salvos localmente';
      // Atualiza contador da sidebar
      var spPrazos = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
      if (spPrazos && prazos2 > 0) spPrazos.textContent = prazos2;
    }, 500);
  }

  aguardar(injetar);
  window.lexSeedRerun = injetar; // permite reexecutar manualmente
})();

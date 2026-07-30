/**
 * LexOfficeAT — Seed de dados reais dos processos
 * Processos reais do escritório Dr. Amilcar
 * Executa 1x para popular o localStorage
 */
(function() {
  var KEY = 'lex_seed_real_v1';
  if (localStorage.getItem(KEY)) { console.log('[Seed] já executado'); return; }

  var DADOS = {
    lexat_processos:   [{"cnj": "0000528-24.2026.5.09.0656", "ficha": "A0001", "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO", "vara": "VARA DO TRABALHO DE CASTRO", "comarca": "CASTRO", "tribunal": "TRT 9ª Região (PR/MS)", "polo_cliente": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA", "polo_processual": "RÉU", "ex_adverso": "CIRO DE MATTOS", "adv_adverso": "MARTA DIAS DE FRANCA OAB 24138", "status": "ativo", "data_autuacao": "12/05/2026", "id": "proc_00005282", "adv_cliente": "AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856", "createdAt": "2026-07-30T16:35:20.810290", "updatedAt": "2026-07-30T16:35:20.810290"}, {"cnj": "0000401-42.2026.5.09.0024", "ficha": "A0002", "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO", "vara": "01ª VARA DO TRABALHO DE PONTA GROSSA", "comarca": "PONTA GROSSA", "tribunal": "TRT 9ª Região (PR/MS)", "polo_cliente": "FANTOMA TRANSPORTES LTDA", "polo_processual": "RÉU", "ex_adverso": "LEANDRO GABRIEL KERIK", "adv_adverso": "GEOVANNA GOMES DA SILVA OAB 80059", "status": "ativo", "data_autuacao": "31/03/2026", "id": "proc_00004014", "adv_cliente": "AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856", "createdAt": "2026-07-30T16:35:20.810290", "updatedAt": "2026-07-30T16:35:20.810290"}, {"cnj": "0000252-46.2026.5.09.0024", "ficha": "A0003", "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO", "vara": "01ª VARA DO TRABALHO DE PONTA GROSSA", "comarca": "PONTA GROSSA", "tribunal": "TRT 9ª Região (PR/MS)", "polo_cliente": "KRM TRANSPORTES LTDA", "polo_processual": "RÉU", "ex_adverso": "JEAN CARLOS MIRANDA", "adv_adverso": "FRANCIELI MESSIAS OAB 74268", "status": "suspenso", "data_autuacao": "03/03/2026", "id": "proc_00002524", "adv_cliente": "AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856", "createdAt": "2026-07-30T16:35:20.810290", "updatedAt": "2026-07-30T16:35:20.810290"}, {"cnj": "0000588-19.2025.5.09.0660", "ficha": "A0004", "tipo_acao": "AÇÃO TRABALHISTA - RITO ORDINÁRIO", "vara": "02ª VARA DO TRABALHO DE PONTA GROSSA", "comarca": "PONTA GROSSA", "tribunal": "TRT 9ª Região (PR/MS)", "polo_cliente": "KIPPER TRANSPORTES RODOVIARIOS EIRELI", "polo_processual": "RÉU", "ex_adverso": "KLEBER ROBERTO BRISOLA", "adv_adverso": "FRANCIELI MESSIAS OAB 74268", "status": "ativo", "data_autuacao": "21/05/2025", "id": "proc_00005881", "adv_cliente": "AMILCAR CORDEIRO TEIXEIRA FILHO, OAB: 21856", "createdAt": "2026-07-30T16:35:20.810290", "updatedAt": "2026-07-30T16:35:20.810290"}],
    lexat_clientes:    [{"nome": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA", "tipo": "PJ", "id": "cli_LOG_BR", "status": "ativo", "origem": "manual", "createdAt": "2026-07-30T16:35:20.810290"}, {"nome": "FANTOMA TRANSPORTES LTDA", "tipo": "PJ", "id": "cli_FANTOM", "status": "ativo", "origem": "manual", "createdAt": "2026-07-30T16:35:20.810290"}, {"nome": "KRM TRANSPORTES LTDA", "tipo": "PJ", "id": "cli_KRM_TR", "status": "ativo", "origem": "manual", "createdAt": "2026-07-30T16:35:20.810290"}, {"nome": "KIPPER TRANSPORTES RODOVIARIOS EIRELI", "tipo": "PJ", "id": "cli_KIPPER", "status": "ativo", "origem": "manual", "createdAt": "2026-07-30T16:35:20.810290"}],
    lexat_prazos:      [{"id": "pr_001", "cnj": "0000528-24.2026.5.09.0656", "ficha": "A0001", "cliente": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA", "tipo": "Manifestação — 5 dias", "fundamento": "Expedida intimação a LOG BRASIL em 01/07/2026", "urgencia": "alta", "dias": 5, "vencimento": "04/08/2026", "vencimentoISO": "2026-08-04", "vara": "VARA DO TRABALHO DE CASTRO", "status": "pendente", "createdAt": "2026-07-30T16:35:20.810290"}, {"id": "pr_002", "cnj": "0000401-42.2026.5.09.0024", "ficha": "A0002", "cliente": "FANTOMA TRANSPORTES LTDA", "tipo": "Manifestação — 5 dias", "fundamento": "Expedida intimação a FANTOMA em 24/06/2026", "urgencia": "media", "dias": 7, "vencimento": "06/08/2026", "vencimentoISO": "2026-08-06", "vara": "01ª VT PONTA GROSSA", "status": "pendente", "createdAt": "2026-07-30T16:35:20.810290"}, {"id": "pr_003", "cnj": "0000588-19.2025.5.09.0660", "ficha": "A0004", "cliente": "KIPPER TRANSPORTES RODOVIARIOS EIRELI", "tipo": "Recurso Ordinário — 8 dias", "fundamento": "Sentença proferida em 27/05/2026", "urgencia": "alta", "dias": 8, "vencimento": "06/08/2026", "vencimentoISO": "2026-08-06", "vara": "02ª VT PONTA GROSSA", "status": "pendente", "createdAt": "2026-07-30T16:35:20.810290"}],
    lexat_publicacoes: [{"id": "pub_001", "cnj": "0000528-24.2026.5.09.0656", "nosso_cliente": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA", "nosso_polo": "RÉU", "adverso": "CIRO DE MATTOS", "vara": "VARA DO TRABALHO DE CASTRO", "movimentacao": "Expedida intimação a LOG BRASIL em 01/07/2026", "data_pub": "2026-07-01", "fonte": "trt9_push", "status": "pendente", "createdAt": "2026-07-30T16:35:20.810290"}, {"id": "pub_002", "cnj": "0000401-42.2026.5.09.0024", "nosso_cliente": "FANTOMA TRANSPORTES LTDA", "nosso_polo": "RÉU", "adverso": "LEANDRO GABRIEL KERIK", "vara": "01ª VT PONTA GROSSA", "movimentacao": "Expedida intimação a FANTOMA em 24/06/2026", "data_pub": "2026-06-24", "fonte": "trt9_push", "status": "pendente", "createdAt": "2026-07-30T16:35:20.810290"}, {"id": "pub_003", "cnj": "0000588-19.2025.5.09.0660", "nosso_cliente": "KIPPER TRANSPORTES RODOVIARIOS EIRELI", "nosso_polo": "RÉU", "adverso": "KLEBER ROBERTO BRISOLA", "vara": "02ª VT PONTA GROSSA", "movimentacao": "Sentença - Extinta a execução por cumprimento integral do acordo", "data_pub": "2026-05-27", "fonte": "trt9_push", "status": "pendente", "createdAt": "2026-07-30T16:35:20.810290"}],
    lexat_tarefas:     [{"id": "tar_001", "cnj": "0000528-24.2026.5.09.0656", "ficha": "A0001", "cliente": "LOG BRASIL - TRANSPORTE E LOGISTICA LTDA", "tipo": "Responder intimação", "descricao": "Expedida intimação — prazo 5 dias", "prioridade": "alta", "status": "pendente", "vencimento": "04/08/2026", "vencimentoISO": "2026-08-04", "createdAt": "2026-07-30T16:35:20.810290"}, {"id": "tar_002", "cnj": "0000588-19.2025.5.09.0660", "ficha": "A0004", "cliente": "KIPPER TRANSPORTES RODOVIARIOS EIRELI", "tipo": "Analisar sentença", "descricao": "Sentença — Extinta execução por acordo. Verificar recurso ordinário", "prioridade": "alta", "status": "pendente", "vencimento": "06/08/2026", "vencimentoISO": "2026-08-06", "createdAt": "2026-07-30T16:35:20.810290"}],
    lexat_audiencias:  []
  };

  Object.keys(DADOS).forEach(function(key) {
    // Merge com dados existentes (não sobrescreve)
    var existing = [];
    try { existing = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    if (!existing.length) {
      localStorage.setItem(key, JSON.stringify(DADOS[key]));
      console.log('[Seed] ' + key + ': ' + DADOS[key].length + ' registros');
    } else {
      console.log('[Seed] ' + key + ': já tem ' + existing.length + ' registros');
    }
  });

  localStorage.setItem(KEY, '1');
  console.log('[Seed] ✅ Dados reais inseridos no LexDB');

  // Atualiza UI após 1s
  setTimeout(function() {
    if (typeof window.renderDashboardFull === 'function') window.renderDashboardFull();
    if (typeof window.lexRenderPrazosAba === 'function' &&
        document.getElementById('pg-prazos') &&
        document.getElementById('pg-prazos').classList.contains('active')) {
      window.lexRenderPrazosAba('pendente');
    }
  }, 1000);
})();

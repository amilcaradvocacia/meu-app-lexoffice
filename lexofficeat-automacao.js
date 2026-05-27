/**
 * LexOfficeAT — Módulo de Automação Completa v1.0
 * Inspirado em DataJuri/Projuris:
 * - Importação automática de publicações do Gmail
 * - Cadastro automático de processos e clientes
 * - Prazos automáticos (5 dias manifestação)
 * - Tarefas automáticas
 * - Agenda (Google Calendar)
 * - Dashboard em tempo real
 * - Normalização de nomes de clientes
 */
(function() {
  'use strict';

  var PROXY = localStorage.getItem('lex_datajud_proxy') ||
              'https://lexoffice-datajud.amilcaradvocacia.workers.dev';

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function normNome(n) {
    if (!n) return '';
    return n.toUpperCase()
      .replace(/\./g, ' ').replace(/\-/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function toast(msg, tipo) {
    if (typeof window.toast === 'function') window.toast(msg, tipo||'teal');
  }

  function log(msg) {
    console.log('[LexAuto] ' + msg);
    var el = document.getElementById('lexAutoLog');
    if (el) {
      var line = document.createElement('div');
      line.style.cssText = 'font-size:11px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05)';
      line.style.color = msg.includes('✅') ? 'var(--green)' :
                         msg.includes('❌') ? 'var(--red)' :
                         msg.includes('⚠️') ? 'var(--orange)' : 'var(--text2)';
      line.textContent = '[' + new Date().toLocaleTimeString('pt-BR') + '] ' + msg;
      el.insertBefore(line, el.firstChild);
      if (el.children.length > 50) el.removeChild(el.lastChild);
    }
  }

  function getDB() {
    return (typeof LexSync !== 'undefined' && LexSync.DB) ? LexSync.DB : null;
  }

  // ============================================================
  // NORMALIZAÇÃO DE CLIENTES — evita duplicatas (KRM = K.R.M)
  // ============================================================

  function encontrarOuCriarCliente(nome, cnpjCpf) {
    var db = getDB();
    if (!db || !nome) return null;
    var nomeNorm = normNome(nome);
    var clientes = db.getAll(db.KEYS.clientes) || [];

    // Busca por nome normalizado
    var existente = clientes.find(function(c) {
      return normNome(c.nome) === nomeNorm ||
             normNome(c.razaoSocial || '') === nomeNorm;
    });

    if (existente) return existente;

    // Cria novo cliente
    var isPJ = /LTDA|S\.A|EIRELI|\bME\b|\bEPP\b|TRANSPORTES|LOGISTICA|SERVICOS|BANCO|IND\.|COM\.|SEGUROS|SEGURADORA/.test(nomeNorm);
    var novoCliente = {
      id:         db.newId('cli'),
      nome:       nome,
      tipo:       isPJ ? 'PJ' : 'PF',
      status:     'ativo',
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
      processos:  [],
      origem:     'publicacao_automatica',
    };
    if (cnpjCpf) novoCliente.cnpjCpf = cnpjCpf;
    db.add(db.KEYS.clientes, novoCliente);
    log('✅ Cliente criado: ' + nome);
    return novoCliente;
  }

  // ============================================================
  // CRIAÇÃO AUTOMÁTICA DE PROCESSO
  // ============================================================

  function criarOuAtualizarProcesso(dados) {
    var db = getDB();
    if (!db || !dados.cnj) return null;

    // Verifica duplicata por CNJ
    var cnj = dados.cnj.replace(/[.\-]/g, '');
    var existente = (db.getAll(db.KEYS.processos) || []).find(function(p) {
      return p.cnj && p.cnj.replace(/[.\-]/g, '') === cnj;
    });

    // Verifica também no XLS2_DATA
    var noXLS = typeof XLS2_DATA !== 'undefined' &&
      XLS2_DATA.some(function(r) {
        return (r[2] || '').replace(/[.\-]/g, '') === cnj;
      });

    if (noXLS) {
      log('ℹ️ ' + dados.cnj + ' já existe no cadastro principal');
      // Mesmo assim cria prazo e tarefa se tiver movimentação nova
      if (dados.movimentacao) {
        criarPrazoAutomatico(dados.cnj, dados.nosso_cliente || '', dados.vara || '', dados.movimentacao);
        criarTarefaAutomatica(dados.cnj, dados.nosso_cliente || '', dados.movimentacao);
      }
      return null;
    }

    if (existente) {
      // Atualiza movimentação
      if (dados.movimentacao) {
        var movs = existente.movimentos || [];
        var jaTemMov = movs.some(function(m) {
          return m.descricao === dados.movimentacao;
        });
        if (!jaTemMov) {
          movs.unshift({ data: new Date().toLocaleDateString('pt-BR'), descricao: dados.movimentacao });
          db.update(db.KEYS.processos, existente.id, {
            movimentos: movs.slice(0, 20),
            ultima_mov: dados.movimentacao,
            updatedAt: new Date().toISOString()
          });
          log('🔄 Atualizado: ' + existente.ficha + ' — ' + dados.movimentacao.slice(0, 50));
          criarPrazoAutomatico(dados.cnj, existente.polo_cliente || '', existente.vara || '', dados.movimentacao);
          criarTarefaAutomatica(dados.cnj, existente.polo_cliente || '', dados.movimentacao);
        }
      }
      return existente;
    }

    // Gera ficha nova
    var maxN = 0;
    if (typeof XLS2_DATA !== 'undefined') {
      XLS2_DATA.forEach(function(r) {
        var n = parseInt((r[0] || '').replace(/\D/g, ''));
        if (!isNaN(n) && n > maxN) maxN = n;
      });
    }
    (db.getAll(db.KEYS.processos) || []).forEach(function(p) {
      var n = parseInt((p.ficha || '').replace(/\D/g, ''));
      if (!isNaN(n) && n > maxN) maxN = n;
    });
    var ficha = 'A' + String(maxN + 1).padStart(4, '0');

    // Cadastra cliente automaticamente
    var clienteObj = null;
    if (dados.nosso_cliente) {
      clienteObj = encontrarOuCriarCliente(dados.nosso_cliente, dados.cpf_cliente);
    }

    // Cria processo
    var novoProc = {
      id:              db.newId('proc'),
      ficha:           ficha,
      cnj:             dados.cnj,
      tipo_acao:       dados.tipo_acao || 'RECLAMATÓRIA TRABALHISTA',
      vara:            dados.vara || '',
      comarca:         dados.comarca || '',
      tribunal:        dados.tribunal || '',
      instancia:       dados.instancia || '1º Grau',
      status:          'ativo',
      polo_cliente:    dados.nosso_cliente || '',
      polo_processual: dados.polo_cliente || 'AUTOR',
      ex_adverso:      dados.adverso || '',
      adv_adverso:     dados.adv_adverso || '',
      adv_cliente:     dados.adv_cliente || '',
      assuntos:        dados.assuntos || '',
      cliente_id:      clienteObj ? clienteObj.id : null,
      fonte_criacao:   dados.fonte || 'publicacao',
      movimentos:      dados.movimentacao ? [{ data: new Date().toLocaleDateString('pt-BR'), descricao: dados.movimentacao }] : [],
      ultima_mov:      dados.movimentacao || '',
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };

    db.add(db.KEYS.processos, novoProc);
    log('✅ Processo criado: ' + ficha + ' — ' + (dados.nosso_cliente || dados.cnj));

    // Cria prazo automático
    criarPrazoAutomatico(dados.cnj, dados.nosso_cliente || '', dados.vara || '', dados.movimentacao || '');

    // Cria tarefa
    criarTarefaAutomatica(dados.cnj, dados.nosso_cliente || '', dados.movimentacao || '');

    // Cria pasta no Drive
    if (dados.nosso_cliente && typeof LexAT !== 'undefined' && LexAT.DRIVE) {
      var nomePasta = (ficha + ' — ' + dados.nosso_cliente + (dados.adverso ? ' vs ' + dados.adverso : '')).slice(0, 100);
      LexAT.DRIVE.criarPastaCliente(nomePasta).catch(function() {});
    }

    // Atualiza link do processo no cliente
    if (clienteObj) {
      var procs = clienteObj.processos || [];
      procs.push({ ficha: ficha, cnj: dados.cnj });
      getDB().update(getDB().KEYS.clientes, clienteObj.id, { processos: procs });
    }

    return novoProc;
  }

  // ============================================================
  // PRAZOS AUTOMÁTICOS
  // ============================================================

  function criarPrazoAutomatico(cnj, cliente, vara, movimentacao) {
    var db = getDB();
    if (!db) return;

    // Detecta prazo mencionado na movimentação
    var diasPrazo = 5; // padrão
    if (movimentacao) {
      var m = movimentacao.match(/[Pp]razo\s+(?:de\s+)?(\d+)\s+dia/);
      if (m) diasPrazo = parseInt(m[1]);
      // Tipos de prazo específicos
      if (/contest|defesa|impugna/i.test(movimentacao)) diasPrazo = 15;
      if (/recurso\s+ordin/i.test(movimentacao)) diasPrazo = 8;
      if (/agravo/i.test(movimentacao)) diasPrazo = 15;
      if (/embargos\s+declar/i.test(movimentacao)) diasPrazo = 5;
      if (/manifest/i.test(movimentacao)) diasPrazo = 5;
      if (/vista/i.test(movimentacao)) diasPrazo = 5;
      if (/intima/i.test(movimentacao)) diasPrazo = 5;
    }

    var venc = new Date();
    venc.setDate(venc.getDate() + diasPrazo);
    var vencBR = venc.toLocaleDateString('pt-BR');
    var vencISO = venc.toISOString().slice(0, 10);

    // Verifica se já existe prazo para este CNJ/data
    var prazos = db.getAll(db.KEYS.prazos) || [];
    var jaExiste = prazos.some(function(p) {
      return p.cnj === cnj && p.vencimentoISO === vencISO;
    });
    if (jaExiste) return;

    var tipoPrazo = 'Manifestação';
    if (movimentacao) {
      if (/contest|defesa/i.test(movimentacao)) tipoPrazo = 'Contestação';
      else if (/recurso/i.test(movimentacao)) tipoPrazo = 'Recurso';
      else if (/agravo/i.test(movimentacao)) tipoPrazo = 'Agravo';
      else if (/embargos/i.test(movimentacao)) tipoPrazo = 'Embargos';
      else if (/impugna/i.test(movimentacao)) tipoPrazo = 'Impugnação';
    }

    var prazo = {
      id:            db.newId('prazo'),
      cnj:           cnj,
      cliente:       cliente,
      tipo:          tipoPrazo + ' — ' + diasPrazo + ' dias',
      fundamento:    movimentacao ? movimentacao.slice(0, 80) : 'Prazo automático de publicação',
      urgencia:      diasPrazo <= 3 ? 'alta' : diasPrazo <= 7 ? 'media' : 'baixa',
      dias:          diasPrazo,
      vencimento:    vencBR,
      vencimentoISO: vencISO,
      vara:          vara,
      status:        'pendente',
      createdAt:     new Date().toISOString(),
    };

    db.add(db.KEYS.prazos, prazo);
    log('⏰ Prazo criado: ' + tipoPrazo + ' — ' + diasPrazo + 'd — ' + cliente.slice(0, 30));

    // Google Calendar
    try {
      if (typeof LexAT !== 'undefined' && LexAT.CALENDAR && cliente) {
        LexAT.CALENDAR.criarPrazoFatal({
          tipo: tipoPrazo,
          cliente: cliente,
          processo: cnj,
          data: vencBR,
          vara: vara,
          advogado: 'Dr. Amilcar Cordeiro Teixeira Filho',
        }).catch(function() {});
      }
    } catch(e) {}
  }

  // ============================================================
  // TAREFAS AUTOMÁTICAS
  // ============================================================

  function criarTarefaAutomatica(cnj, cliente, movimentacao) {
    var db = getDB();
    if (!db || !movimentacao) return;

    // Só cria tarefa se a movimentação requer ação
    var requerAcao = /intima|cita|prazo|manifest|contest|recurso|agravo|embargos|vista|audiencia|julgamento|sentenca/i.test(movimentacao);
    if (!requerAcao) return;

    var tipo = 'Analisar publicação';
    if (/contest|defesa/i.test(movimentacao)) tipo = 'Preparar contestação';
    else if (/recurso\s+ordin/i.test(movimentacao)) tipo = 'Interpor Recurso Ordinário';
    else if (/agravo/i.test(movimentacao)) tipo = 'Interpor Agravo';
    else if (/audiencia/i.test(movimentacao)) tipo = 'Preparar audiência';
    else if (/sentenca|julgamento/i.test(movimentacao)) tipo = 'Analisar decisão/sentença';
    else if (/manifest|vista/i.test(movimentacao)) tipo = 'Manifestar nos autos';

    var venc = new Date();
    venc.setDate(venc.getDate() + 3); // 3 dias para analisar

    db.add(db.KEYS.tarefas || 'lexat_tarefas', {
      id:        db.newId('tar'),
      cnj:       cnj,
      cliente:   cliente,
      tipo:      tipo,
      descricao: movimentacao.slice(0, 150),
      prioridade:'alta',
      status:    'pendente',
      vencimento: venc.toLocaleDateString('pt-BR'),
      vencimentoISO: venc.toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    });
    log('📋 Tarefa: ' + tipo + ' — ' + cliente.slice(0, 30));
  }

  // ============================================================
  // HOOK NO AUTOFILL — intercepta criação de processos
  // ============================================================

  function hookAutoFill() {
    if (typeof LexSync === 'undefined' || !LexSync.AutoFill) return;
    if (LexSync.AutoFill._lexAutoHooked) return;
    LexSync.AutoFill._lexAutoHooked = true;

    var origProcessar = LexSync.AutoFill.processarPublicacao.bind(LexSync.AutoFill);
    LexSync.AutoFill.processarPublicacao = function(parsed) {
      var resultado = origProcessar(parsed) || { novos: [], atualizados: [], erros: [] };

      if (!parsed || !parsed.processos) return resultado;

      parsed.processos.forEach(function(proc, idx) {
        if (!proc.cnj) return;
        setTimeout(function() {
          // Busca DataJud para enriquecer os dados
          if (typeof window.buscarDadosCNJ === 'function') {
            window.buscarDadosCNJ(proc.cnj).then(function(dadosDJ) {
              var dados = dadosDJ || proc;
              dados.cnj = proc.cnj;
              dados.movimentacao = proc.movimento || proc.movimentacao || '';
              dados.fonte = parsed.fonte || 'publicacao';
              criarOuAtualizarProcesso(dados);
            }).catch(function() {
              // Usa dados do parser se DataJud falhar
              criarOuAtualizarProcesso({
                cnj: proc.cnj,
                nosso_cliente: proc.nosso_cliente || proc.partes && proc.partes.autor || '',
                adverso: proc.adverso || proc.partes && proc.partes.adverso || '',
                polo_cliente: proc.polo_nosso || 'AUTOR',
                vara: proc.vara || '',
                tipo_acao: proc.classe || proc.tipo_acao || '',
                movimentacao: proc.movimento || proc.movimentacao || '',
                adv_adverso: proc.adv_adverso || '',
                fonte: parsed.fonte || 'publicacao',
              });
            });
          } else {
            criarOuAtualizarProcesso({
              cnj: proc.cnj,
              nosso_cliente: proc.nosso_cliente || '',
              adverso: proc.adverso || '',
              polo_cliente: proc.polo_nosso || 'AUTOR',
              vara: proc.vara || '',
              tipo_acao: proc.classe || '',
              movimentacao: proc.movimento || proc.movimentacao || '',
              fonte: parsed.fonte || 'publicacao',
            });
          }
        }, idx * 500);
      });

      // Atualiza dashboard
      setTimeout(atualizarDashboard, 3000);
      return resultado;
    };
    log('✅ AutoFill hooked para criação automática de processos');
  }

  // ============================================================
  // BUSCA DATAJUD
  // ============================================================

  var DJ_MAP = {
    '8.16':'tjpr','5.09':'trt9','5.04':'trt4','5.02':'trt2','5.01':'trt1',
    '4.04':'trf4','3.00':'stj','5.00':'tst','1.00':'stf'
  };

  window.buscarDadosCNJ = function(cnj) {
    return new Promise(function(resolve, reject) {
      var m = cnj.match(/\.(\d)\.(\d{2})\./);
      if (!m) return reject(new Error('CNJ inválido'));
      var sigla = DJ_MAP[m[1]+'.'+m[2]] || 'tjpr';
      var body = JSON.stringify({ query:{ bool:{ should:[
        { match:{ numeroProcesso:cnj } },
        { term:{ 'numeroProcesso.keyword':cnj } }
      ]}}, size:1 });
      fetch(PROXY + '/api_publica_' + sigla + '/_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      }).then(function(r) { return r.json(); })
        .then(function(data) {
          var hits = data && data.hits && data.hits.hits;
          if (!hits || !hits.length) return reject(new Error('Não encontrado'));
          var src = hits[0]._source || {};
          var pArr = src.partes || [];
          var aArr = src.advogados || [];
          var autor = pArr.find(function(p) { return /ATIVO|AUTOR|RECLAMANTE/i.test(p.polo||''); });
          var reu   = pArr.find(function(p) { return /PASSIVO|R[EÉ]U|RECLAMADO/i.test(p.polo||''); });
          var amil  = aArr.find(function(a) { return a.nome && a.nome.toLowerCase().includes('amilcar'); });
          var amAtivo = !amil || /ATIVO|AUTOR|RECLAMANTE/i.test((amil&&amil.polo)||'');
          var nosso = amAtivo ? (autor&&autor.nome||'') : (reu&&reu.nome||'');
          var adverso = amAtivo ? (reu&&reu.nome||'') : (autor&&autor.nome||'');
          if (!nosso) {
            var passivoPJ = reu && /LTDA|S\.A|EIRELI|TRANSPORTES|SERVICOS/.test(reu.nome||'');
            var isTrab = /TRAB|RECLAMAT/.test(((src.classe&&src.classe.nome)||'').toUpperCase());
            if (isTrab && passivoPJ) { nosso = reu&&reu.nome||''; adverso = autor&&autor.nome||''; }
            else { nosso = autor&&autor.nome||''; adverso = reu&&reu.nome||''; }
          }
          var advsP = aArr.filter(function(a){return /PASSIVO|R[EÉ]U|RECLAMADO/i.test(a.polo||'');});
          resolve({
            cnj: cnj, fonte: 'DataJud',
            tipo_acao: (src.classe&&src.classe.nome)||'',
            vara: (src.orgaoJulgador&&src.orgaoJulgador.nome)||'',
            comarca: (src.municipio&&src.municipio.nome)||'',
            estado: (src.tribunal&&src.tribunal.uf)||'PR',
            tribunal: (src.tribunal&&src.tribunal.nome)||'',
            instancia: src.grau==='G2'?'2º Grau':'1º Grau',
            nosso_cliente: nosso, adverso: adverso,
            polo_cliente: amAtivo ? 'AUTOR' : 'RÉU',
            adv_adverso: advsP.map(function(a){return a.nome+(a.numeroOAB?' OAB '+a.numeroOAB:'');}).join('; '),
            assuntos: (src.assuntos||[]).map(function(a){return a.nome;}).join(', '),
          });
        }).catch(reject);
    });
  };

  // ============================================================
  // DASHBOARD EM TEMPO REAL
  // ============================================================

  function atualizarDashboard() {
    var db = getDB();
    if (!db) return;

    var processos  = db.getAll(db.KEYS.processos) || [];
    var prazos     = db.getAll(db.KEYS.prazos) || [];
    var pubs       = db.getAll(db.KEYS.publicacoes) || [];
    var clientes   = db.getAll(db.KEYS.clientes) || [];
    var hoje       = new Date();

    var prazosAtivos = prazos.filter(function(p) { return p.status === 'pendente'; });
    var prazosUrgentes = prazosAtivos.filter(function(p) {
      var vISO = p.vencimentoISO || (p.vencimento||'').split('/').reverse().join('-');
      return Math.ceil((new Date(vISO) - hoje) / 86400000) <= 5;
    });

    // Atualiza KPIs do dashboard
    var up = function(id, v) { var e = document.getElementById(id); if(e) e.textContent = v; };
    up('kProcessosDB',   processos.length);
    up('kClientesDB',    clientes.length);
    up('kPrazosDB',      prazosAtivos.length);
    up('kPublicacoesDB', pubs.length);

    // Badge sidebar
    var sbPrazos = document.querySelector('.nitem[onclick*="prazos"] .nbadge');
    if (sbPrazos && prazosUrgentes.length) sbPrazos.textContent = prazosUrgentes.length;

    // Info bar do LexDB
    var infoBar = document.querySelector('.alert-lexdb') || document.querySelector('[data-lexdb-info]');
    if (infoBar) {
      infoBar.textContent = 'LexDB: ' + clientes.length + ' clientes · '
        + processos.length + ' processos · ' + prazosUrgentes.length + ' prazos urgentes';
    }

    // Prazos críticos no dashboard
    if (typeof renderPrazosDash === 'function') renderPrazosDash();
  }

  // ============================================================
  // EXPOSIÇÃO PÚBLICA
  // ============================================================

  window.lexAutoProcessar = criarOuAtualizarProcesso;
  window.lexAutoPrazo     = criarPrazoAutomatico;
  window.lexAutoTarefa    = criarTarefaAutomatica;
  window.lexAutoCliente   = encontrarOuCriarCliente;
  window.lexAutoDashboard = atualizarDashboard;

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function init() {
    hookAutoFill();
    atualizarDashboard();
    setInterval(atualizarDashboard, 30000);
    log('✅ LexOfficeAT Automação v1.0 iniciada');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 2000); });
  } else {
    setTimeout(init, 2000);
  }

})();

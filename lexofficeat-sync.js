/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║        LexOfficeAT — Sync, Parser & Auto-Fill v1.0              ║
 * ║  Persistência · Parser Impacta/Jusbrasil · Auto-fill Processos  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * INSTALAÇÃO: adicione antes do </body> no index.html:
 * <script src="lexofficeat-sync.js"></script>
 *
 * FUNCIONALIDADES:
 * 1. Persistência total — clientes, processos, prazos, tarefas, financeiro
 * 2. Parser Impacta — lê publicações e extrai dados do processo
 * 3. Parser Jusbrasil — lê e-mails de novas publicações
 * 4. Auto-preenchimento — cria/atualiza processo automaticamente
 * 5. Deduplicação — não duplica processos já existentes
 */

(function () {
  'use strict';

  // ============================================================
  // 💾 CAMADA DE PERSISTÊNCIA — LexDB
  // ============================================================
  const LexDB = {

    // Chaves do banco local
    KEYS: {
      clientes:   'lexat_clientes',
      processos:  'lexat_processos',
      prazos:     'lexat_prazos',
      audiencias: 'lexat_audiencias',
      tarefas:    'lexat_tarefas',
      financeiro: 'lexat_financeiro',
      usuarios:   'lexat_usuarios',
      config:     'lexat_config',
      publicacoes:'lexat_publicacoes',
      log:        'lexat_log',
    },

    // Salva dado (localStorage + cookie fallback)
    save(chave, valor) {
      const json = JSON.stringify(valor);
      try { localStorage.setItem(chave, json); } catch (e) {}
      try {
        const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
        document.cookie = `${chave}=${encodeURIComponent(json)};expires=${exp.toUTCString()};path=/`;
      } catch (e) {}
    },

    // Carrega dado
    load(chave, padrao = null) {
      try {
        const v = localStorage.getItem(chave);
        if (v) return JSON.parse(v);
      } catch (e) {}
      try {
        const m = document.cookie.match('(?:^|; )' + chave + '=([^;]*)');
        if (m) return JSON.parse(decodeURIComponent(m[1]));
      } catch (e) {}
      return padrao;
    },

    // Operações de array
    getAll(chave)          { return this.load(chave, []); },
    setAll(chave, arr)     { this.save(chave, arr); },
    add(chave, item)       { const arr = this.getAll(chave); arr.push(item); this.save(chave, arr); return item; },
    update(chave, id, dados) {
      const arr = this.getAll(chave);
      const idx = arr.findIndex(x => x.id === id || x.cnj === id);
      if (idx >= 0) { arr[idx] = { ...arr[idx], ...dados, updatedAt: new Date().toISOString() }; this.save(chave, arr); return arr[idx]; }
      return null;
    },
    remove(chave, id)      { const arr = this.getAll(chave).filter(x => x.id !== id); this.save(chave, arr); },
    findById(chave, id)    { return this.getAll(chave).find(x => x.id === id || x.cnj === id) || null; },
    findByCNJ(cnj)         { return this.findById(this.KEYS.processos, cnj); },

    // Gera ID único
    newId(prefixo = 'id') { return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; },

    // Log de operações
    log(msg, tipo = 'info') {
      const logs = this.load(this.KEYS.log, []);
      logs.unshift({ ts: new Date().toISOString(), msg, tipo });
      if (logs.length > 200) logs.splice(200);
      this.save(this.KEYS.log, logs);
    },

    // Exporta tudo como JSON
    exportar() {
      const dados = {};
      Object.entries(this.KEYS).forEach(([k, v]) => { dados[k] = this.load(v, []); });
      return JSON.stringify(dados, null, 2);
    },

    // Importa JSON
    importar(jsonStr) {
      try {
        const dados = JSON.parse(jsonStr);
        Object.entries(this.KEYS).forEach(([k, v]) => {
          if (dados[k] !== undefined) this.save(v, dados[k]);
        });
        return true;
      } catch (e) { return false; }
    },

    // Estatísticas
    stats() {
      return {
        clientes:   this.getAll(this.KEYS.clientes).length,
        processos:  this.getAll(this.KEYS.processos).length,
        prazos:     this.getAll(this.KEYS.prazos).length,
        audiencias: this.getAll(this.KEYS.audiencias).length,
        tarefas:    this.getAll(this.KEYS.tarefas).length,
        publicacoes:this.getAll(this.KEYS.publicacoes).length,
      };
    },
  };

  // ============================================================
  // 📬 PARSER IMPACTA — publicacoes@impacta.adv.br
  // ============================================================
  const ParserImpacta = {

    // Padrões de extração específicos da Impacta
    PADROES: {
      cnj:       /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g,
      processo:  /(?:processo|autos|nº?\.?\s*)[:\s]*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/gi,
      vara:      /(?:\d+[ªº]?\s*Vara\s*(?:do\s*Trabalho|Cível|Criminal|Federal)?[^\n,]{0,40}|Juízo[^\n,]{0,40})/gi,
      comarca:   /(?:Comarca\s+de\s+|Foro\s+)?([A-ZÁÉÍÓÚÃÕÇ][a-záéíóúãõç]+(?:\s+[A-ZÁÉÍÓÚÃÕÇ][a-záéíóúãõç]+)*)\s*[\/\-]\s*([A-Z]{2})/g,
      partes:    /(?:AUTOR[A]?|EXEQUENTE|RECLAMANTE)[:\s]+([^\n]+)/gi,
      adverso:   /(?:RÉU|EXECUTAD[OA]|RECLAMAD[OA])[:\s]+([^\n]+)/gi,
      movimento: /(?:Movimento|Decisão|Despacho|Sentença|Acórdão)[:\s]+([^\n]{10,120})/gi,
      advogado:  /(?:Adv\.?|Advogado|Dr\.?)[:\s]+([A-ZÁÉÍÓÚÃÕÇ][^\n,]{5,50})(?:\s*[-–]\s*OAB)?/gi,
      data:      /(\d{2}\/\d{2}\/\d{4})/g,
      tribunal:  /(TRT\d+|TJ[A-Z]{2}|STJ|STF|TST|TRF\d)/gi,
    },

    parse(emailBody, remetente) {
      const texto = emailBody || '';
      const resultado = {
        fonte:      'impacta',
        remetente,
        raw:        texto.slice(0, 500),
        processos:  [],
        timestamp:  new Date().toISOString(),
      };

      // Extrai todos os CNJs do e-mail
      const cnjs = [...new Set([...texto.matchAll(this.PADROES.cnj)].map(m => m[1]))];

      // Para cada CNJ, monta um processo
      cnjs.forEach(cnj => {
        // Pega contexto ao redor do CNJ (300 chars antes e depois)
        const idx = texto.indexOf(cnj);
        const contexto = texto.slice(Math.max(0, idx-300), idx+500);

        const proc = {
          cnj,
          vara:      this._extrair(contexto, this.PADROES.vara),
          comarca:   this._extrairComarca(contexto),
          autor:     this._extrair(contexto, this.PADROES.partes),
          adverso:   this._extrair(contexto, this.PADROES.adverso),
          movimento: this._extrair(contexto, this.PADROES.movimento),
          advogado:  this._extrair(contexto, this.PADROES.advogado),
          data:      this._extrair(contexto, this.PADROES.data),
          tribunal:  this._extrair(contexto, this.PADROES.tribunal),
          prazos:    window.LexIAJuridica ? LexIAJuridica.detectarPrazos(contexto) : [],
          tipo_acao: window.LexIAJuridica ? LexIAJuridica.classificarAcao(contexto)?.tipo : null,
          area:      window.LexIAJuridica ? LexIAJuridica.classificarAcao(contexto)?.area : null,
        };

        resultado.processos.push(proc);
      });

      // Se não encontrou CNJs mas tem conteúdo, tenta extrair dados gerais
      if (cnjs.length === 0 && texto.length > 50) {
        resultado.processos.push({
          cnj:       null,
          movimento: this._extrair(texto, this.PADROES.movimento) || texto.slice(0, 200),
          data:      this._extrair(texto, this.PADROES.data),
          prazos:    window.LexIAJuridica ? LexIAJuridica.detectarPrazos(texto) : [],
          tipo_acao: window.LexIAJuridica ? LexIAJuridica.classificarAcao(texto)?.tipo : null,
        });
      }

      return resultado;
    },

    _extrair(texto, regex) {
      regex.lastIndex = 0;
      const m = regex.exec(texto);
      return m ? m[1]?.trim() : null;
    },

    _extrairComarca(texto) {
      const m = texto.match(/([A-ZÁÉÍÓÚÃÕÇ][a-záéíóúãõç\s]+)\s*\/\s*([A-Z]{2})/);
      return m ? `${m[1].trim()}/${m[2]}` : null;
    },
  };

  // ============================================================
  // 📰 PARSER JUSBRASIL — publicacoes-diarios@jusbrasil.com.br
  // ============================================================
  const ParserJusbrasil = {

    parse(emailBody) {
      const texto = emailBody || '';
      const resultado = {
        fonte:      'jusbrasil',
        processos:  [],
        timestamp:  new Date().toISOString(),
      };

      // PARSER BASEADO NO FORMATO REAL DO JUSBRASIL
      // Formato: "Processo CNJ ... POLO ATIVO ... POLO PASSIVO ... ADVOGADO(A/S) AMILCAR..."
      const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
      const blocosSplit = texto.split(/(?=Processo \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);

      blocosSplit.slice(1).forEach(bloco => {
        const cnjM = bloco.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
        if (!cnjM) return;
        const cnj = cnjM[1];

        // Vara: linha com "Nª Vara..."
        const varaM = bloco.match(/([0-9]+[ªº°]?\s*(?:Vara|VARA|Juizado|JUIZADO|Câmara|CÂMARA)[^\n]{0,80})/i);
        // Tribunal
        const tribM = bloco.match(/(?:Diário\s+)([^\n]+?)(?:\s*Publicação|\s*NÚMERO)/i);
        // Classe processual
        const classeM = bloco.match(/Classe Processual[:\s]+([^\n]+)/i);
        // Assunto
        const assuntoM = bloco.match(/Assunto Principal[:\s]+([^\n]+)/i);
        // Data de disponibilização
        const dataM = bloco.match(/DATA DE DISPONIBILIZAÇÃO[:\s]+(\d{4}-\d{2}-\d{2})/i);

        // Polo ativo — texto entre "POLO ATIVO" e próximo marcador
        let poloAtivo = '';
        const paM = bloco.match(/POLO ATIVO\s+([\s\S]*?)(?=POLO PASSIVO|ADVOGADO|DATA DE|$)/i);
        if (paM) poloAtivo = paM[1].replace(/\s+/g, ' ').trim().slice(0, 100);

        // Polo passivo — texto entre "POLO PASSIVO" e próximo marcador
        let poloPassivo = '';
        const ppM = bloco.match(/POLO PASSIVO\s+([\s\S]*?)(?=ADVOGADO|DATA DE|$)/i);
        if (ppM) poloPassivo = ppM[1].replace(/\s+/g, ' ').trim().slice(0, 100);

        // Nosso cliente = polo onde AMILCAR está como advogado
        const advSection = bloco.match(/ADVOGADO\(A\/S\)\s+([\s\S]*?)(?=DATA DE|$)/i);
        let amilcarPolo = 'ATIVO'; // padrão
        if (advSection) {
          // Verifica se Amilcar está no bloco antes ou depois do POLO PASSIVO
          const advIdx = bloco.indexOf('ADVOGADO(A/S)');
          const ppIdx  = bloco.indexOf('POLO PASSIVO');
          // Se POLO PASSIVO aparece antes de ADVOGADO(A/S) e contém o primeiro polo
          // precisamos ver qual polo o Amilcar representa
          // Na estrutura do Jusbrasil: POLO ATIVO [partes] POLO PASSIVO [partes] ADVOGADO(A/S) [todos]
          // O advogado pode estar representando qualquer polo
          // Heurística: se o único polo preenchido é o passivo, Amilcar representa o passivo
          if (!poloAtivo && poloPassivo) amilcarPolo = 'PASSIVO';
          else if (poloAtivo && !poloPassivo) amilcarPolo = 'ATIVO';
          else amilcarPolo = 'ATIVO'; // padrão para quando ambos existem
        }

        const nossoCliente  = amilcarPolo === 'PASSIVO' ? poloPassivo : poloAtivo;
        const parteAdversa  = amilcarPolo === 'PASSIVO' ? poloAtivo   : poloPassivo;

        // Movimentação principal
        const movM = bloco.match(/(?:Considerando|Trata-se|Vistos|Cite-se|Intimem-se|Determino|Diante do|Pelo exposto|Conheço|Defiro)[^\n]{10,200}/i);

        // Extrai advogados adversos (os que NÃO são Amilcar)
        const advsAdversos = [];
        if (advSection) {
          const advsRaw = advSection[1];
          const advsArr = advsRaw.split(/\|\s*\d{5,}[^\/]*/);
          advsArr.forEach(a => {
            const nome = a.trim().split(/\|/)[0].trim();
            if (nome && !nome.toLowerCase().includes('amilcar') && nome.length > 3) {
              advsAdversos.push(nome);
            }
          });
        }

        resultado.processos.push({
          cnj,
          vara:         varaM ? varaM[1].trim().slice(0, 80) : '',
          tribunal:     tribM ? tribM[1].trim().slice(0, 60) : 'TJPR',
          classe:       classeM ? classeM[1].trim().slice(0, 60) : '',
          assunto:      assuntoM ? assuntoM[1].trim().slice(0, 80) : '',
          data_pub:     dataM ? dataM[1] : '',
          partes: {
            autor:   poloAtivo.slice(0, 80),
            adverso: poloPassivo.slice(0, 80),
          },
          polo_ativo:    poloAtivo.slice(0, 80),
          polo_passivo:  poloPassivo.slice(0, 80),
          nosso_cliente: nossoCliente.slice(0, 80),
          adverso:       parteAdversa.slice(0, 80),
          polo_nosso:    amilcarPolo,
          adv_adverso:   advsAdversos.slice(0, 3).join('; ').slice(0, 120),
          movimento:     movM ? movM[0].trim().slice(0, 150) : '',
          tipo_acao:     classeM ? classeM[1].trim() : '',
          raw:           bloco.slice(0, 500),
          prazos:        (typeof LexIAJuridica !== 'undefined') ? LexIAJuridica.detectarPrazos(bloco) : [],
        });
      });

      if (resultado.processos.length > 0) return resultado;

      // Fallback: blocos genéricos
      const blocos = texto.split(/\n{2,}|-{3,}|_{3,}/);

      blocos.forEach(bloco => {
        if (bloco.trim().length < 30) return;

        const cnjs = [...bloco.matchAll(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g)]
          .map(m => m[1]);

        if (cnjs.length === 0 && !bloco.match(/processo|autos|publicação/i)) return;

        const proc = {
          cnj:       cnjs[0] || null,
          tribunal:  bloco.match(/(TRT\d+|TJ[A-Z]{2}|STJ|STF|TST|TRF\d)/i)?.[1] || null,
          partes:    this._extrairPartes(bloco),
          movimento: this._extrairMovimento(bloco),
          data:      bloco.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
          url:       bloco.match(/https?:\/\/[^\s]+/)?.[0] || null,
          prazos:    window.LexIAJuridica ? LexIAJuridica.detectarPrazos(bloco) : [],
          tipo_acao: window.LexIAJuridica ? LexIAJuridica.classificarAcao(bloco)?.tipo : null,
          area:      window.LexIAJuridica ? LexIAJuridica.classificarAcao(bloco)?.area : null,
          raw:       bloco.trim().slice(0, 400),
        };

        resultado.processos.push(proc);
      });

      return resultado;
    },

    _extrairPartes(texto) {
      const autor   = texto.match(/(?:AUTOR[A]?|RECLAMANTE|REQUERENTE)[:\s]+([^\n,]+)/i)?.[1]?.trim();
      const adverso = texto.match(/(?:RÉU|RECLAMADO|REQUERIDO)[:\s]+([^\n,]+)/i)?.[1]?.trim();
      return { autor, adverso };
    },

    _extrairMovimento(texto) {
      // Jusbrasil costuma ter a movimentação após o número do processo
      const m = texto.match(/(?:Publicado|Decisão|Despacho|Sentença|Acórdão)[:\s]+([^\n]{10,200})/i);
      return m?.[1]?.trim() || texto.slice(0, 150).trim();
    },
  };

  // ============================================================
  // 🔄 AUTO-FILL — Cria ou atualiza processos automaticamente
  // ============================================================
  const AutoFill = {

    /**
     * Processa resultado do parser e cria/atualiza processos no LexOffice
     */
    processarPublicacao(parsed) {
      if (!parsed || !parsed.processos) return { novos:[], atualizados:[], erros:[] };
      const novos = [], atualizados = [], erros = [];

      parsed.processos.forEach(proc => {
        try {
          if (proc.cnj) {
            const existente = LexDB.findByCNJ(proc.cnj);
            if (existente) {
              // ATUALIZA processo existente
              const atualizado = this._atualizarProcesso(existente, proc, parsed.fonte);
              atualizados.push(atualizado);
            } else {
              // CRIA novo processo
              const novo = this._criarProcesso(proc, parsed.fonte);
              novos.push(novo);
            }
          }

          // Salva prazos detectados
          proc.prazos?.forEach(prazo => {
            this._criarPrazo(prazo, proc.cnj, proc.autor || proc.partes?.autor);
          });

          // Salva publicação no histórico
          LexDB.add(LexDB.KEYS.publicacoes, {
            id:        LexDB.newId('pub'),
            cnj:       proc.cnj,
            fonte:     parsed.fonte,
            movimento: proc.movimento || proc.raw?.slice(0,150),
            data:      proc.data || new Date().toLocaleDateString('pt-BR'),
            timestamp: parsed.timestamp,
            raw:       proc.raw,
          });

        } catch (e) {
          erros.push({ cnj: proc.cnj, erro: e.message });
        }
      });

      LexDB.log(`Parser ${parsed.fonte}: ${novos.length} novos, ${atualizados.length} atualizados, ${erros.length} erros`);
      return { novos: novos||[], atualizados: atualizados||[], erros: erros||[] };
    },

    _criarProcesso(proc, fonte) {
      const novoProc = {
        id:           LexDB.newId('proc'),
        cnj:          proc.cnj,
        ficha:        this._gerarFicha(),
        tipo_acao:    proc.tipo_acao || '',
        area:         proc.area || 'Cível',
        vara:         proc.vara || '',
        comarca:      proc.comarca || '',
        estado:       proc.estado || 'PR',
        instancia:    proc.instancia || '1º Grau',
        tribunal:     proc.tribunal || '',
        status:       'Em Andamento',
        polo_cliente:  proc.autor || (proc.partes && proc.partes.autor) || '',
        polo_processual: proc.polo || 'AUTOR',
        ex_adverso:   proc.adverso || (proc.partes && proc.partes.adverso) || '',
        adv_adverso:  proc.adv_adverso || '',
        adv_cliente:  proc.adv_cliente || proc.advogado || '',
        assuntos:     proc.assuntos || '',
        fonte_criacao: fonte,
        movimentos:  [{
          data:      proc.data || new Date().toLocaleDateString('pt-BR'),
          descricao: proc.movimento || '',
          fonte,
        }],
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      };
      LexDB.add(LexDB.KEYS.processos, novoProc);
      LexDB.log(`Processo criado: ${proc.cnj} via ${fonte}`);
      return novoProc;
    },

    _atualizarProcesso(existente, proc, fonte) {
      // Adiciona nova movimentação ao histórico
      const movimentos = existente.movimentos || [];
      if (proc.movimento) {
        const jaTem = movimentos.some(m => m.descricao === proc.movimento);
        if (!jaTem) {
          movimentos.push({
            data:      proc.data || new Date().toLocaleDateString('pt-BR'),
            descricao: proc.movimento,
            fonte,
          });
        }
      }

      // Atualiza campos se vazio
      const updates = { movimentos, updatedAt: new Date().toISOString() };
      const pAutor   = proc.autor   || (proc.partes && proc.partes.autor)   || '';
      const pAdverso = proc.adverso || (proc.partes && proc.partes.adverso) || '';
      if (!existente.vara         && proc.vara)       updates.vara         = proc.vara;
      if (!existente.comarca      && proc.comarca)    updates.comarca      = proc.comarca;
      if (!existente.tipo_acao    && proc.tipo_acao)  updates.tipo_acao    = proc.tipo_acao;
      if (!existente.tribunal     && proc.tribunal)   updates.tribunal     = proc.tribunal;
      if (!existente.instancia    && proc.instancia)  updates.instancia    = proc.instancia;
      if (!existente.polo_cliente && pAutor)          updates.polo_cliente = pAutor;
      if (!existente.ex_adverso   && pAdverso)        updates.ex_adverso   = pAdverso;
      if (!existente.adv_adverso  && proc.adv_adverso)updates.adv_adverso  = proc.adv_adverso;
      if (!existente.assuntos     && proc.assuntos)   updates.assuntos     = proc.assuntos;

      const atualizado = LexDB.update(LexDB.KEYS.processos, existente.id, updates);
      LexDB.log(`Processo atualizado: ${existente.cnj} via ${fonte}`);
      return atualizado;
    },

    _criarPrazo(prazo, cnj, cliente) {
      const prazos = LexDB.getAll(LexDB.KEYS.prazos);
      const jaTem = prazos.some(p => p.cnj === cnj && p.tipo === prazo.tipo && p.vencimento === prazo.vencimento);
      if (jaTem) return;

      LexDB.add(LexDB.KEYS.prazos, {
        id:          LexDB.newId('prazo'),
        cnj:         cnj || '',
        cliente:     cliente || '',
        tipo:        prazo.tipo,
        dias:        prazo.dias,
        fundamento:  prazo.fundamento,
        urgencia:    prazo.urgencia,
        vencimento:  prazo.vencimento,
        vencimentoISO: prazo.vencimentoISO,
        status:      'pendente',
        createdAt:   new Date().toISOString(),
      });
    },

    _gerarFicha() {
      const processos = LexDB.getAll(LexDB.KEYS.processos);
      const nums = processos
        .map(p => parseInt((p.ficha || '').replace(/\D/g, '')))
        .filter(n => !isNaN(n));
      const proximo = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
      return `A${String(proximo).padStart(4, '0')}`;
    },
  };

  // ============================================================
  // 🎯 INTEGRAÇÃO COM UI DO LEXOFFICE
  // ============================================================

  // ── Substitui salvarCliente para persistir ──
  function hookSalvarCliente() {
    const original = window.salvarCliente;
    window.salvarCliente = function () {
      if (original) original();
      // Captura dados do formulário
      const cliente = {
        id:        document.getElementById('c_editId')?.value || LexDB.newId('cli'),
        nome:      document.getElementById('c_nome')?.value || '',
        cpfcnpj:   document.getElementById('c_cpfcnpj')?.value || '',
        email:     document.getElementById('c_email')?.value || '',
        tel:       document.getElementById('c_tel')?.value || '',
        area:      document.getElementById('c_area')?.value || '',
        status:    document.getElementById('c_status')?.value || 'ativo',
        tipo:      document.getElementById('c_tipo')?.value || 'PF',
        exadverso: document.getElementById('c_exadverso')?.value || '',
        endereco:  document.getElementById('c_endereco')?.value || '',
        obs:       document.getElementById('c_obs')?.value || '',
        updatedAt: new Date().toISOString(),
      };
      if (!cliente.nome) return;
      const existente = LexDB.getAll(LexDB.KEYS.clientes).find(c => c.id === cliente.id);
      if (existente) {
        LexDB.update(LexDB.KEYS.clientes, cliente.id, cliente);
      } else {
        cliente.createdAt = new Date().toISOString();
        LexDB.add(LexDB.KEYS.clientes, cliente);
      }
      LexDB.log(`Cliente salvo: ${cliente.nome}`);
    };
  }

  // ── Substitui salvarProcesso para persistir ──
  function hookSalvarProcesso() {
    const original = window.salvarProcesso;
    window.salvarProcesso = function () {
      if (original) original();
      const proc = {
        id:           LexDB.newId('proc'),
        cnj:          document.getElementById('f_auto')?.value || '',
        ficha:        document.getElementById('f_proc')?.value || '',
        tipo_acao:    document.getElementById('f_acao')?.value || '',
        vara:         document.getElementById('f_vara')?.value || '',
        comarca:      document.getElementById('f_comarca')?.value || '',
        status:       document.getElementById('f_status')?.value || 'ativo',
        polo_cliente: document.getElementById('f_parte1')?.value || '',
        polo:         document.getElementById('f_polo')?.value || '',
        ex_adverso:   document.getElementById('f_exadv')?.value || '',
        anotacoes:    document.getElementById('f_anotacoes')?.value || '',
        updatedAt:    new Date().toISOString(),
      };
      if (!proc.cnj && !proc.ficha) return;

      // Deduplicação por CNJ
      if (proc.cnj) {
        const existe = LexDB.findByCNJ(proc.cnj);
        if (existe) {
          LexDB.update(LexDB.KEYS.processos, existe.id, proc);
          LexDB.log(`Processo atualizado: ${proc.cnj}`);
          return;
        }
      }
      proc.createdAt = new Date().toISOString();
      LexDB.add(LexDB.KEYS.processos, proc);
      LexDB.log(`Processo salvo: ${proc.cnj || proc.ficha}`);
    };
  }

  // ── Substitui parseEmail para usar os parsers reais ──
  function hookParseEmail() {
    window.parseEmail = function () {
      const rem   = document.getElementById('emailRem')?.value || 'impacta';
      const corpo = document.getElementById('emailBody')?.value || '';
      if (!corpo.trim()) { _toast('Cole um e-mail primeiro', 'gold'); return; }

      _log('[PARSER] Iniciando extração...');

      // Escolhe o parser correto
      const parsed = rem === 'jusbrasil'
        ? ParserJusbrasil.parse(corpo)
        : ParserImpacta.parse(corpo, rem);

      if (!parsed.processos.length) {
        _log('[PARSER] ⚠️ Nenhum processo encontrado no e-mail');
        _toast('⚠️ Nenhum processo identificado', 'gold');
        return;
      }

      // Processa e salva automaticamente
      const resultado = AutoFill.processarPublicacao(parsed);

      // Renderiza no painel de extração
      _renderizarExtracao(parsed, resultado);

      // Atualiza KPIs
      _atualizarKPIs(resultado);

      _log(`[PARSER] ✅ ${resultado.novos.length} novos | ${resultado.atualizados.length} atualizados | ${parsed.processos[0]?.prazos?.length || 0} prazos`);
      _toast(`✅ ${resultado.novos.length} novos + ${resultado.atualizados.length} atualizados`, 'green');
    };

    // Parser IA — versão avançada
    window.parseEmailIA = async function () {
      const rem   = document.getElementById('emailRem')?.value || 'impacta';
      const corpo = document.getElementById('emailBody')?.value || '';
      if (!corpo.trim()) { _toast('Cole um e-mail primeiro', 'gold'); return; }

      _log('[IA] Analisando com Claude...');

      // Primeiro faz parse local
      window.parseEmail();

      // Depois enriquece com IA se disponível
      if (window.LexIAJuridica && localStorage.getItem('lex_anthropic_key')) {
        try {
          const resumo = await LexIAJuridica.resumirParaCliente(corpo);
          if (resumo) {
            const log = document.getElementById('emailLog');
            if (log) {
              log.innerHTML += `<div style="color:#a8c4ff;margin-top:8px">
                <b>🤖 Resumo IA:</b><br>${resumo}
              </div>`;
              log.scrollTop = log.scrollHeight;
            }
          }
        } catch (e) { _log('[IA] Erro na análise: ' + e.message); }
      }
    };
  }

  // ── Renderiza resultado da extração no painel do LexOffice ──
  function _renderizarExtracao(parsed, resultado) {
    const parserCard   = document.getElementById('parserCard');
    const parserCampos = document.getElementById('parserCampos');
    const parserSrc    = document.getElementById('parserSrc');

    if (!parserCard) return;
    parserCard.style.display = 'block';
    if (parserSrc) parserSrc.textContent = parsed.fonte.toUpperCase();

    const proc = parsed.processos[0];
    if (!proc) return;

    // Preenche EMAIL._extracao para compatibilidade com botões existentes
    if (typeof EMAIL !== 'undefined') {
      EMAIL._extracao = {
        cnj:          proc.cnj || '',
        polo_cliente: proc.autor || proc.partes?.autor || '',
        ex_adverso:   proc.adverso || proc.partes?.adverso || '',
        tipo_acao:    proc.tipo_acao || '',
        vara:         proc.vara || '',
        prazo_data:   proc.prazos?.[0]?.vencimento || '',
        tipo_mov:     proc.prazos?.[0]?.tipo || '',
        movimento:    proc.movimento || '',
      };
    }

    if (!parserCampos) return;

    const urgIcon = { critica: '🔴', alta: '🟠', media: '🟡' };
    const statusBadge = resultado.novos.length > 0
      ? `<span style="background:rgba(76,175,130,.15);color:var(--green);border:1px solid rgba(76,175,130,.3);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✨ NOVO</span>`
      : `<span style="background:rgba(91,141,238,.15);color:var(--blue);border:1px solid rgba(91,141,238,.3);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">🔄 ATUALIZADO</span>`;

    let html = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      ${statusBadge}
      <span style="font-size:11px;color:var(--text3)">${parsed.processos.length} processo(s) detectado(s)</span>
    </div>`;

    // Campos do processo
    const campos = [
      ['📌 CNJ',        proc.cnj],
      ['⚖️ Tipo de Ação', proc.tipo_acao],
      ['👤 Autor/Cliente', proc.autor || proc.partes?.autor],
      ['⚔️ Adverso',    proc.adverso || proc.partes?.adverso],
      ['🏛️ Vara',       proc.vara],
      ['📍 Comarca',    proc.comarca],
      ['⚖️ Tribunal',   proc.tribunal],
      ['📅 Data',       proc.data],
    ];

    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px">`;
    campos.forEach(([label, val]) => {
      if (!val) return;
      html += `<div style="background:var(--surface3);border-radius:8px;padding:8px 10px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${label}</div>
        <div style="font-size:12px;color:var(--text);font-weight:500;word-break:break-all">${val}</div>
      </div>`;
    });
    html += `</div>`;

    // Movimentação
    if (proc.movimento) {
      html += `<div style="background:var(--surface3);border-radius:8px;padding:9px 11px;margin-bottom:11px">
        <div style="font-size:10px;color:var(--text3);margin-bottom:3px">📋 MOVIMENTAÇÃO</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.5">${proc.movimento.slice(0,200)}</div>
      </div>`;
    }

    // Prazos
    if (proc.prazos?.length) {
      html += `<div style="margin-bottom:11px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">⏳ PRAZOS DETECTADOS</div>`;
      proc.prazos.forEach(p => {
        const cor = p.urgencia === 'critica' ? 'var(--red)' : p.urgencia === 'alta' ? 'var(--orange)' : 'var(--gold)';
        html += `<div style="border-left:3px solid ${cor};padding:7px 10px;background:var(--surface3);border-radius:0 8px 8px 0;margin-bottom:5px">
          <div style="font-size:12px;color:var(--text);font-weight:500">${urgIcon[p.urgencia]||'🟡'} ${p.tipo} — vence ${p.vencimento}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${p.fundamento} · ${p.dias} dias · ${p.diasRestantes > 0 ? p.diasRestantes + 'd restantes' : '⚠️ VENCIDO'}</div>
        </div>`;
      });
      html += `</div>`;
    }

    // Múltiplos processos
    if (parsed.processos.length > 1) {
      html += `<div style="background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.2);border-radius:8px;padding:9px 11px;font-size:11px;color:var(--gold)">
        📋 +${parsed.processos.length - 1} processo(s) adicional(is) detectado(s) e salvo(s) automaticamente.
      </div>`;
    }

    parserCampos.innerHTML = html;
  }

  // ── Atualiza KPIs de e-mail ──
  function _atualizarKPIs(resultado) {
    const kET  = document.getElementById('kET');
    const kEP  = document.getElementById('kEP');
    const kEPz = document.getElementById('kEPz');
    if (kET)  kET.textContent  = parseInt(kET.textContent  || 0) + 1;
    if (kEP)  kEP.textContent  = parseInt(kEP.textContent  || 0) + resultado.novos.length + resultado.atualizados.length;
    if (kEPz) kEPz.textContent = parseInt(kEPz.textContent || 0) + (resultado.novos.concat(resultado.atualizados).reduce((s, p) => s + (p?.movimentos?.length || 0), 0));
  }

  // ── Log no painel de e-mail ──
  function _log(msg) {
    const el = document.getElementById('emailLog');
    if (!el) return;
    const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cor = msg.includes('✅') ? 'var(--green)' : msg.includes('⚠️') ? 'var(--orange)' : msg.includes('❌') ? 'var(--red)' : 'var(--teal)';
    el.innerHTML += `<div style="color:${cor}">[${t}] ${msg}</div>`;
    el.scrollTop = el.scrollHeight;
  }

  function _toast(msg, tipo = 'green') {
    if (typeof window.toast === 'function') window.toast(msg, tipo);
  }

  // ============================================================
  // 📊 PAINEL DE DADOS SALVOS — injetado na página
  // ============================================================
  function injetarPainelDados() {
    // Botão de backup/restore na topbar do dashboard
    const topbar = document.querySelector('#pg-dashboard .topbar-actions');
    if (topbar && !document.getElementById('btn-lexdb')) {
      const btn = document.createElement('button');
      btn.id = 'btn-lexdb';
      btn.className = 'btn btn-ghost btn-sm';
      btn.innerHTML = '💾 Dados';
      btn.title = 'Gerenciar dados salvos';
      btn.onclick = () => abrirModalDados();
      topbar.appendChild(btn);
    }

    // Badge de status no dashboard
    const alert = document.querySelector('#pg-dashboard .content .alert-t');
    if (alert) {
      const stats = LexDB.stats();
      const totalSalvos = stats.processos + stats.clientes;
      if (totalSalvos > 0 && !document.getElementById('lexdb-badge')) {
        const badge = document.createElement('div');
        badge.id = 'lexdb-badge';
        badge.style.cssText = `padding:9px 14px;border-radius:10px;margin-bottom:11px;
          background:rgba(76,175,130,.08);border:1px solid rgba(76,175,130,.2);
          color:var(--green);font-size:12.5px;display:flex;align-items:center;gap:8px`;
        badge.innerHTML = `💾 <strong>LexDB ativo</strong> — ${stats.clientes} clientes · ${stats.processos} processos · ${stats.prazos} prazos salvos localmente`;
        alert.parentNode.insertBefore(badge, alert);
      }
    }
  }

  function abrirModalDados() {
    const stats = LexDB.stats();
    const logs  = LexDB.load(LexDB.KEYS.log, []).slice(0, 20);

    const html = `
    <div id="modal-lexdb" style="position:fixed;inset:0;background:rgba(0,0,0,.76);
      backdrop-filter:blur(8px);z-index:300;display:flex;align-items:center;justify-content:center;padding:18px">
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:16px;
        padding:26px;width:600px;max-width:95vw;max-height:90vh;overflow-y:auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div style="font-family:'Playfair Display',serif;font-size:18px">💾 LexDB — Dados Salvos</div>
          <button onclick="document.getElementById('modal-lexdb').remove()"
            style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px">✕</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:18px">
          ${[
            ['👤 Clientes',    stats.clientes],
            ['⚖️ Processos',   stats.processos],
            ['⏳ Prazos',      stats.prazos],
            ['🏛️ Audiências',  stats.audiencias],
            ['✅ Tarefas',     stats.tarefas],
            ['📬 Publicações', stats.publicacoes],
          ].map(([l,v]) => `<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;border:1px solid var(--border)">
            <div style="font-size:19px;font-weight:700;color:var(--text)">${v}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">${l}</div>
          </div>`).join('')}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          <button onclick="LexSync.exportar()" class="btn btn-gold btn-sm">⬇️ Exportar JSON</button>
          <button onclick="document.getElementById('lexdb-import-file').click()" class="btn btn-ghost btn-sm">⬆️ Importar</button>
          <button onclick="LexSync.limparTudo()" class="btn btn-red btn-sm">🗑️ Limpar Tudo</button>
          <input type="file" id="lexdb-import-file" accept=".json" style="display:none"
            onchange="LexSync.importarArquivo(this)">
        </div>

        <div style="margin-bottom:10px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">📋 Log de Operações</div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;max-height:200px;overflow-y:auto;
            font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);line-height:1.8">
            ${logs.length ? logs.map(l => {
              const ts = new Date(l.ts).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
              return `<div>[${ts}] ${l.msg}</div>`;
            }).join('') : 'Nenhuma operação registrada.'}
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ============================================================
  // 🌐 API PÚBLICA — window.LexSync
  // ============================================================
  window.LexSync = {
    DB:     LexDB,
    Parser: { Impacta: ParserImpacta, Jusbrasil: ParserJusbrasil },
    AutoFill,

    // Exporta backup
    exportar() {
      const json = LexDB.exportar();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `lexofficeat-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      _toast('✅ Backup exportado!', 'green');
    },

    // Importa de arquivo
    importarArquivo(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const ok = LexDB.importar(e.target.result);
        _toast(ok ? '✅ Dados importados!' : '❌ Erro ao importar', ok ? 'green' : 'red');
        document.getElementById('modal-lexdb')?.remove();
        setTimeout(() => abrirModalDados(), 300);
      };
      reader.readAsText(file);
    },

    // Limpa tudo (com confirmação)
    limparTudo() {
      if (!confirm('⚠️ Isso apagará TODOS os dados salvos localmente. Tem certeza?')) return;
      Object.values(LexDB.KEYS).forEach(k => localStorage.removeItem(k));
      _toast('🗑️ Dados apagados', 'red');
      document.getElementById('modal-lexdb')?.remove();
    },

    // Processa e-mail manualmente via API
    processarEmail(corpo, fonte = 'impacta') {
      const parsed = fonte === 'jusbrasil'
        ? ParserJusbrasil.parse(corpo)
        : ParserImpacta.parse(corpo, fonte);
      return AutoFill.processarPublicacao(parsed);
    },

    // Busca processo por CNJ
    buscarProcesso: (cnj) => LexDB.findByCNJ(cnj),

    // Stats
    stats: () => LexDB.stats(),
  };

  // ============================================================
  // 🚀 INICIALIZAÇÃO
  // ============================================================
  function init() {
    // Instala hooks nas funções existentes
    hookSalvarCliente();
    hookSalvarProcesso();
    hookParseEmail();

    // Injeta painel após carregamento
    setTimeout(injetarPainelDados, 1000);

    // Reinjeta ao trocar de página
    const originalGo = window.go;
    window.go = function (page, el) {
      try { if (originalGo) originalGo(page, el); } catch(e) { console.warn('[sync go]', e); }
      setTimeout(injetarPainelDados, 400);
    };

    // Restaura dados salvos nos KPIs do dashboard
    setTimeout(() => {
      const stats = LexDB.stats();
      const kC = document.getElementById('kClientes');
      if (kC && stats.clientes > 0) kC.textContent = stats.clientes;
    }, 600);

    const s = LexDB.stats();
    console.log(`[LexSync v1.0] ✅ Banco local: ${s.clientes} clientes | ${s.processos} processos | ${s.prazos} prazos`);
    console.log('[LexSync] Parsers: Impacta ✅ | Jusbrasil ✅ | AutoFill ✅');
    console.log('[LexSync] API: window.LexSync');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

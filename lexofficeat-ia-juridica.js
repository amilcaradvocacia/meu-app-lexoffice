/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      LexOfficeAT — Motor de IA Jurídica Brasileira v1.0     ║
 * ║  Classificação · Detecção de Prazos · Teses · Claude API    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * INSTALAÇÃO:
 * 1. Salve este arquivo no mesmo diretório do index.html
 * 2. Adicione antes do </body>:
 *    <script src="lexofficeat-ia-juridica.js"></script>
 * 3. Configure a API Key Anthropic em Integrações → Claude
 *
 * USO NO CONSOLE / CÓDIGO:
 *    LexIAJuridica.analisarPublicacao(texto)
 *    LexIAJuridica.classificarAcao(texto)
 *    LexIAJuridica.detectarPrazos(texto)
 *    LexIAJuridica.sugerirTeses(area, subtema)
 *    LexIAJuridica.consultarClaudeAPI(prompt)
 */

(function () {
  'use strict';

  // ============================================================
  // 📚 DATASET JURÍDICO BRASILEIRO
  // ============================================================
  const JURIDICO_BR = {

    acoes: [
      { tipo: 'RECLAMATÓRIA TRABALHISTA', area: 'Trabalhista',
        keywords: ['rescisão','justa causa','horas extras','verbas rescisórias','fgts','aviso prévio','clt',
                   'empregado','empregador','tst','trt','reclamatória','trabalhista','reclamante','reclamado'] },
      { tipo: 'AÇÃO DE COBRANÇA', area: 'Cível',
        keywords: ['cobrança','dívida','inadimplência','título','nota promissória','cheque','duplicata','débito'] },
      { tipo: 'AÇÃO DE INDENIZAÇÃO', area: 'Cível',
        keywords: ['dano moral','dano material','indenização','reparação','responsabilidade civil','nexo causal','consumidor'] },
      { tipo: 'AÇÃO DE DESPEJO', area: 'Cível',
        keywords: ['despejo','locação','locatário','locador','sublocação','aluguel','imóvel','inquilinato'] },
      { tipo: 'EXECUÇÃO FISCAL', area: 'Tributário',
        keywords: ['execução fiscal','dívida ativa','cda','pgfn','fazenda pública','imposto','tributo','contribuição'] },
      { tipo: 'MANDADO DE SEGURANÇA', area: 'Público',
        keywords: ['mandado de segurança','ato coator','autoridade coatora','direito líquido','ms'] },
      { tipo: 'AÇÃO DE ALIMENTOS', area: 'Família',
        keywords: ['alimentos','pensão alimentícia','guarda','filho','genitores','eca','família','alimentando'] },
      { tipo: 'INVENTÁRIO', area: 'Sucessões',
        keywords: ['inventário','herança','espólio','herdeiros','partilha','falecido','testamento','meação'] },
      { tipo: 'RECUPERAÇÃO JUDICIAL', area: 'Empresarial',
        keywords: ['recuperação judicial','falência','credor','devedor','plano de recuperação','insolvência'] },
      { tipo: 'HABEAS CORPUS', area: 'Criminal',
        keywords: ['habeas corpus','prisão','liberdade','pena','crime','réu','denúncia','cpp','custódia'] },
      { tipo: 'AÇÃO REVISIONAL', area: 'Cível',
        keywords: ['revisão','contrato bancário','juros abusivos','capitalização','cdc','banco'] },
      { tipo: 'USUCAPIÃO', area: 'Cível',
        keywords: ['usucapião','posse','prescricional','domínio','registro','imóvel','animus domini'] },
    ],

    prazos: [
      { movimento: /contest/i,              tipo: 'Contestação',         dias: 15, urgencia: 'alta',    fundamento: 'Art. 335 CPC' },
      { movimento: /apela/i,                tipo: 'Apelação',            dias: 15, urgencia: 'alta',    fundamento: 'Art. 1003 CPC' },
      { movimento: /recurso ordinário/i,    tipo: 'Recurso Ordinário',   dias: 8,  urgencia: 'critica', fundamento: 'Art. 895 CLT' },
      { movimento: /recurso de revista/i,   tipo: 'Recurso de Revista',  dias: 8,  urgencia: 'critica', fundamento: 'Art. 896 CLT' },
      { movimento: /agravo regimental/i,    tipo: 'Agravo Regimental',   dias: 15, urgencia: 'alta',    fundamento: 'Art. 1021 CPC' },
      { movimento: /agravo interno/i,       tipo: 'Agravo Interno',      dias: 15, urgencia: 'alta',    fundamento: 'Art. 1021 CPC' },
      { movimento: /agravo de instrumento/i,tipo: 'Agravo de Instrumento',dias: 15, urgencia: 'alta',   fundamento: 'Art. 1003 CPC' },
      { movimento: /agravo/i,               tipo: 'Agravo',              dias: 15, urgencia: 'alta',    fundamento: 'Art. 1003 CPC' },
      { movimento: /embargos\s*(de\s*declara|declarat)/i, tipo:'Embargos de Declaração', dias: 5, urgencia: 'critica', fundamento: 'Art. 1023 CPC' },
      { movimento: /embargos/i,             tipo: 'Embargos',            dias: 5,  urgencia: 'critica', fundamento: 'Art. 1023 CPC' },
      { movimento: /contrarrazões/i,        tipo: 'Contrarrazões',       dias: 15, urgencia: 'alta',    fundamento: 'Art. 1010 CPC' },
      { movimento: /réplica/i,              tipo: 'Réplica',             dias: 15, urgencia: 'media',   fundamento: 'Art. 351 CPC' },
      { movimento: /manifest/i,             tipo: 'Manifestação',        dias: 15, urgencia: 'media',   fundamento: 'Art. 351 CPC' },
      { movimento: /impugn/i,               tipo: 'Impugnação',          dias: 15, urgencia: 'media',   fundamento: 'Art. 525 CPC' },
      { movimento: /cumprimento/i,          tipo: 'Cumprimento',         dias: 15, urgencia: 'alta',    fundamento: 'Art. 523 CPC' },
      { movimento: /citar|citação/i,        tipo: 'Citação',             dias: 15, urgencia: 'alta',    fundamento: 'Art. 335 CPC' },
      { movimento: /intimad/i,              tipo: 'Intimação',           dias: 5,  urgencia: 'media',   fundamento: 'Art. 231 CPC' },
    ],

    teses: {
      'Trabalhista': {
        'horas extras': [
          { tese: 'Súmula 437 TST — Intervalo intrajornada suprimido ou reduzido gera pagamento de hora extra + adicional de 50%', tribunal: 'TST', relevancia: 10 },
          { tese: 'Súmula 338 TST — Ônus da prova do horário de trabalho é do empregador quando há obrigação de controle (> 10 empregados)', tribunal: 'TST', relevancia: 9 },
          { tese: 'OJ 394 SDI-1 TST — Horas in itinere: trajeto interno em transporte fornecido pelo empregador integra jornada', tribunal: 'TST', relevancia: 8 },
          { tese: 'Súmula 340 TST — Comissionista: horas extras calculadas sobre valor global da remuneração', tribunal: 'TST', relevancia: 7 },
        ],
        'dano moral': [
          { tese: 'Assédio moral: repetição sistemática de condutas abusivas constitui dano moral indenizável — OJ SDI-1 TST', tribunal: 'TST', relevancia: 9 },
          { tese: 'Dispensa discriminatória (doença grave) gera indenização por dano moral independente de prova de sofrimento', tribunal: 'TST', relevancia: 8 },
          { tese: 'Dano existencial: supressão do direito ao lazer e convívio familiar por jornadas extenuantes — tese crescente no TST', tribunal: 'TST', relevancia: 7 },
        ],
        'justa causa': [
          { tese: 'Súmula 474 TST — Rescisão indireta: mora salarial superior a 3 meses configura falta grave do empregador', tribunal: 'TST', relevancia: 10 },
          { tese: 'Princípio da proporcionalidade: falta deve ser proporcional à penalidade; gradação das penas', tribunal: 'TST', relevancia: 9 },
          { tese: 'Imediatidade da punição: justa causa deve ser aplicada logo após ciência da falta pelo empregador', tribunal: 'TST', relevancia: 8 },
        ],
        'rescisão': [
          { tese: 'Súmula 276 TST — Aviso prévio cumprido em casa: empregador não pode dispensar do cumprimento sem pagamento', tribunal: 'TST', relevancia: 9 },
          { tese: 'OJ 163 SDI-1 TST — Prazo para pagamento das verbas rescisórias: 1 dia útil após término do contrato', tribunal: 'TST', relevancia: 8 },
        ],
      },
      'Cível': {
        'dano moral': [
          { tese: 'Dano moral in re ipsa — negativação indevida dispensa prova de sofrimento: Súmula 385 STJ', tribunal: 'STJ', relevancia: 10 },
          { tese: 'REsp 1.059.663 STJ — critérios para fixação do quantum: extensão do dano, condições do ofensor, caráter pedagógico e vedação ao enriquecimento', tribunal: 'STJ', relevancia: 9 },
          { tese: 'Súmula 385 STJ — cadastro de inadimplentes: não gera dano moral se preexistente inscrição legítima', tribunal: 'STJ', relevancia: 8 },
          { tese: 'STJ — pessoa jurídica pode sofrer dano moral (honra objetiva) — Súmula 227 STJ', tribunal: 'STJ', relevancia: 7 },
        ],
        'prescrição': [
          { tese: 'Art. 206 §3º III CC — prazo trienal para reparação civil conta do conhecimento do dano', tribunal: 'STJ', relevancia: 10 },
          { tese: 'Súmula 150 STF — prescrição da execução ocorre no mesmo prazo da ação', tribunal: 'STF', relevancia: 9 },
          { tese: 'Teoria actio nata subjetiva (REsp 1.354.348 STJ): prazo conta do conhecimento do dano e de sua autoria', tribunal: 'STJ', relevancia: 8 },
        ],
        'locação': [
          { tese: 'Art. 13 Lei 8.245/91 — sublocação exige consentimento prévio e escrito do locador, sob pena de infração legal e contratual', tribunal: 'STJ', relevancia: 10 },
          { tese: 'Inércia do locador diante de sublocação não induz presunção de consentimento — TJPR e STJ', tribunal: 'TJPR/STJ', relevancia: 9 },
          { tese: 'Art. 9º II Lei 8.245/91 — infração contratual legitima a ação de despejo independente de notificação prévia', tribunal: 'STJ', relevancia: 8 },
        ],
        'consumidor': [
          { tese: 'Súmula 297 STJ — CDC aplica-se às instituições financeiras', tribunal: 'STJ', relevancia: 10 },
          { tese: 'Inversão do ônus da prova: art. 6º VIII CDC — verossimilhança da alegação ou hipossuficiência do consumidor', tribunal: 'STJ', relevancia: 9 },
          { tese: 'Teoria finalista mitigada: vulnerabilidade do empresário pessoa física = consumidor equiparado', tribunal: 'STJ', relevancia: 7 },
        ],
      },
      'Tributário': {
        'ICMS': [
          { tese: 'RE 574.706 STF (Tese do Século) — ICMS não compõe base de cálculo do PIS/COFINS. Tese de repercussão geral.', tribunal: 'STF', relevancia: 10 },
          { tese: 'Súmula Vinculante 31 STF — ISSQN não incide sobre operações de locação de bens móveis', tribunal: 'STF', relevancia: 9 },
          { tese: 'ADC 49 STF — ICMS não incide na transferência de mercadorias entre estabelecimentos do mesmo contribuinte', tribunal: 'STF', relevancia: 8 },
        ],
        'execução fiscal': [
          { tese: 'Súmula 106 STJ — propositura da execução fiscal antes da prescrição interrompe o prazo, mesmo com demora na citação por motivo da Fazenda', tribunal: 'STJ', relevancia: 9 },
          { tese: 'REsp 1.340.553 STJ (repetitivo) — redirecionamento ao sócio: exige dissolução irregular ou prática de atos com excesso de poderes', tribunal: 'STJ', relevancia: 8 },
          { tese: 'Súmula 393 STJ — parcelamento do débito não implica renúncia a defesa na execução fiscal', tribunal: 'STJ', relevancia: 7 },
        ],
        'contribuição': [
          { tese: 'RE 595.838 STF — contribuições ao sistema S não estão sujeitas ao teto dos servidores federais', tribunal: 'STF', relevancia: 8 },
          { tese: 'Súmula 331 STJ — CSLL: base de cálculo é o lucro real, não havendo dedução de participações minoritárias', tribunal: 'STJ', relevancia: 7 },
        ],
      },
      'Criminal': {
        'prisão': [
          { tese: 'HC 143.641 STF — mulheres gestantes e mães de crianças até 12 anos: substituição da prisão preventiva por domiciliar', tribunal: 'STF', relevancia: 10 },
          { tese: 'Súmula 9 STJ — excesso de prazo na instrução não gera constrangimento ilegal quando complexidade do feito justifica', tribunal: 'STJ', relevancia: 8 },
          { tese: 'Prisão preventiva: requisitos cumulativos — fumus comissi delicti + periculum libertatis (art. 312 CPP)', tribunal: 'STF/STJ', relevancia: 9 },
        ],
        'pena': [
          { tese: 'Súmula 444 STJ — vedada a utilização de inquéritos policiais como circunstâncias judiciais desfavoráveis', tribunal: 'STJ', relevancia: 9 },
          { tese: 'Súmula 440 STJ — fixação da pena base acima do mínimo exige fundamentação concreta', tribunal: 'STJ', relevancia: 8 },
        ],
      },
      'Família': {
        'alimentos': [
          { tese: 'Súmula 309 STJ — débito alimentar dos 3 últimos meses anteriores ao ajuizamento: prisão civil cabível', tribunal: 'STJ', relevancia: 10 },
          { tese: 'REsp 1.085.664 STJ — alimentos avoengos: obrigação subsidiária em relação aos pais; exige prova de impossibilidade', tribunal: 'STJ', relevancia: 8 },
          { tese: 'Binômio necessidade-possibilidade (art. 1.694 §1º CC): fixação proporcional à capacidade do alimentante', tribunal: 'STJ', relevancia: 9 },
        ],
        'guarda': [
          { tese: 'Síndrome da Alienação Parental: Lei 12.318/10 — atos que dificultem convivência configuram infração', tribunal: 'STJ', relevancia: 9 },
          { tese: 'Guarda compartilhada: regra geral quando ambos os genitores são aptos (Súmula 17 TJPR)', tribunal: 'TJPR/STJ', relevancia: 8 },
        ],
      },
      'Empresarial': {
        'recuperação': [
          { tese: 'STJ — crédito fiscal não se sujeita à recuperação judicial: art. 187 CTN c/c art. 6º §7º Lei 11.101/05', tribunal: 'STJ', relevancia: 10 },
          { tese: 'REsp 1.694.316 STJ — alienação fiduciária: bem não integra patrimônio do devedor; não sujeito à recuperação', tribunal: 'STJ', relevancia: 9 },
        ],
        'desconsideração': [
          { tese: 'Art. 50 CC — desconsideração da personalidade jurídica: exige abuso caracterizado por desvio de finalidade ou confusão patrimonial', tribunal: 'STJ', relevancia: 10 },
          { tese: 'STJ — teoria menor da desconsideração (CDC, art. 28): basta insolvência para satisfação do consumidor', tribunal: 'STJ', relevancia: 8 },
        ],
      },
    },
  };

  // ============================================================
  // ⚙️  MOTOR PRINCIPAL
  // ============================================================
  const LexIACore = {

    classificarAcao(texto) {
      if (!texto) return null;
      const low = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let melhor = null, maxScore = 0;
      for (const acao of JURIDICO_BR.acoes) {
        let score = 0;
        for (const kw of acao.keywords) {
          const kwNorm = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (low.includes(kwNorm)) score++;
        }
        if (score > maxScore) { maxScore = score; melhor = { ...acao, score }; }
      }
      return melhor;
    },

    detectarPrazos(texto) {
      if (!texto) return [];
      const hoje = new Date();
      const prazosDetectados = [];
      // Extrai data do texto
      const dataMatch = texto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      let dataBase = new Date();
      if (dataMatch) {
        const [, d, m, y] = dataMatch;
        const ano = y.length === 2 ? '20' + y : y;
        const tentativa = new Date(`${ano}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
        if (!isNaN(tentativa)) dataBase = tentativa;
      }
      for (const p of JURIDICO_BR.prazos) {
        if (p.movimento.test(texto)) {
          const venc = new Date(dataBase);
          venc.setDate(venc.getDate() + p.dias);
          const diasRestantes = Math.ceil((venc - hoje) / 86400000);
          prazosDetectados.push({
            ...p,
            dataBase: dataBase.toLocaleDateString('pt-BR'),
            vencimento: venc.toLocaleDateString('pt-BR'),
            vencimentoISO: venc.toISOString().slice(0, 10),
            diasRestantes,
          });
        }
      }
      // Remove duplicatas pelo tipo
      const vistos = new Set();
      return prazosDetectados.filter(p => {
        if (vistos.has(p.tipo)) return false;
        vistos.add(p.tipo); return true;
      });
    },

    sugerirTeses(area, subtema) {
      const areaData = JURIDICO_BR.teses[area];
      if (!areaData) return [];
      if (subtema) {
        const low = subtema.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const [key, teses] of Object.entries(areaData)) {
          const keyNorm = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (low.includes(keyNorm) || keyNorm.includes(low.slice(0, 8))) {
            return teses.sort((a, b) => b.relevancia - a.relevancia);
          }
        }
      }
      return Object.values(areaData).flat().sort((a, b) => b.relevancia - a.relevancia).slice(0, 5);
    },

    extrairPartes(texto) {
      const r = { autor: null, reu: null, advogado: null };
      const autorM = texto.match(/(?:AUTOR[A]?|REQUERENTE|RECLAMANTE)[:\s]+([A-ZÁÉÍÓÚÃÕÇÀÜ][A-ZÁÉÍÓÚÃÕÇÀÜa-záéíóúãõçàü\s]+?)(?:\s{2,}|,|\n|vs\.?|X\s)/i);
      const reuM   = texto.match(/(?:RÉU|REQUERIDO|RECLAMADO|RÉUS)[:\s]+([A-ZÁÉÍÓÚÃÕÇÀÜ][A-ZÁÉÍÓÚÃÕÇÀÜa-záéíóúãõçàü\s]+?)(?:\s{2,}|,|\n)/i);
      const advM   = texto.match(/(?:ADV\.?|ADVOGADO[:\s]|OAB)[:\s]+([A-ZÁÉÍÓÚÃÕÇÀÜ][a-záéíóúãõçàü\s]+?)(?:\s{2,}|,|\n|OAB)/i);
      if (autorM) r.autor    = autorM[1].trim();
      if (reuM)   r.reu      = reuM[1].trim();
      if (advM)   r.advogado = advM[1].trim();
      return r;
    },

    analisarPublicacao(texto) {
      const acao   = this.classificarAcao(texto);
      const prazos = this.detectarPrazos(texto);
      const teses  = acao ? this.sugerirTeses(acao.area, texto.slice(0, 300)) : [];
      const cnj    = texto.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || null;
      const partes = this.extrairPartes(texto);
      const vara   = texto.match(/(?:\d+[ªº]?\s*Vara[^\n,]{0,40}|Juízo[^\n,]{0,40}|TRT\d|TJ[A-Z]{2}[^\n,]{0,20})/i)?.[0]?.trim() || null;
      return { acao, prazos, teses, cnj, partes, vara };
    },
  };

  // ============================================================
  // 🤖 INTEGRAÇÃO COM CLAUDE API
  // ============================================================
  const LexIAClaude = {

    getKey() {
      return localStorage.getItem('lex_anthropic_key') ||
             (typeof EMAIL !== 'undefined' && EMAIL?.cfg?.claudeKey) || '';
    },

    async consultar(prompt, sistema) {
      const key = this.getKey();
      if (!key) { this._alertSemChave(); return null; }
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: sistema || `Você é assistente jurídico especializado em direito brasileiro.
Priorize SEMPRE fontes brasileiras: STF, STJ, TST, TRTs, TJs estaduais.
Fundamente com artigos de lei, súmulas e precedentes reais.
Seja objetivo e estruturado. Nunca invente precedentes.`,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await resp.json();
      return data.content?.[0]?.text || null;
    },

    async analisarComIA(texto, elResultado) {
      if (elResultado) { elResultado.textContent = '🤖 Analisando com IA...'; elResultado.classList.add('loading'); }
      // Análise local rápida
      const local = LexIACore.analisarPublicacao(texto);
      // Enriquece com Claude
      const prompt = `Analise esta publicação judicial e responda em JSON com as chaves:
tipo_acao, area_direito, prazos_detectados (array com tipo e dias), teses_aplicaveis (array), resumo_cliente (2 frases simples).

Publicação:
${texto.slice(0, 2000)}

Retorne APENAS JSON válido, sem markdown.`;

      try {
        const iaResp = await this.consultar(prompt,
          'Você é extrator de dados jurídicos. Retorne APENAS JSON válido sem markdown ou explicações.');
        let iaData = {};
        try { iaData = JSON.parse(iaResp || '{}'); } catch (e) { /* usa só local */ }

        const resultado = {
          ...local,
          ia: {
            tipo_acao:         iaData.tipo_acao         || local.acao?.tipo,
            area_direito:      iaData.area_direito       || local.acao?.area,
            prazos_detectados: iaData.prazos_detectados  || local.prazos.map(p => ({ tipo: p.tipo, dias: p.dias })),
            teses_aplicaveis:  iaData.teses_aplicaveis   || local.teses.map(t => t.tese),
            resumo_cliente:    iaData.resumo_cliente      || '',
          },
        };
        if (elResultado) { elResultado.classList.remove('loading'); }
        return resultado;
      } catch (e) {
        if (elResultado) { elResultado.classList.remove('loading'); }
        return local;
      }
    },

    async gerarPeticao(tipo, fatos, area) {
      const prompt = `Redija uma ${tipo} para processo de ${area}.
FATOS: ${fatos}
Estruture com: qualificação das partes (deixar em branco para preenchimento), 
dos fatos, do direito (com fundamentação em lei e jurisprudência brasileira), 
dos pedidos e valor da causa. Use linguagem jurídica formal.`;
      return this.consultar(prompt);
    },

    async resumirParaCliente(textoTecnico) {
      const prompt = `Resuma esta decisão judicial em linguagem SIMPLES para o cliente leigo.
Destaque: o que aconteceu, se é bom ou ruim para o cliente, e o que precisa ser feito agora.
Máximo 3 parágrafos curtos.

Decisão: ${textoTecnico.slice(0, 2000)}`;
      return this.consultar(prompt);
    },

    async gerarWhatsApp(cliente, processo, movimentacao) {
      const prompt = `Crie uma mensagem de WhatsApp profissional e cordial para o cliente ${cliente}
sobre o processo ${processo}. Movimentação: ${movimentacao}.
Seja breve (máximo 4 linhas), profissional e em linguagem acessível.`;
      return this.consultar(prompt);
    },

    _alertSemChave() {
      if (typeof window.toast === 'function') {
        window.toast('⚠️ Configure a API Key Anthropic em Integrações → Claude', 'red');
      } else {
        alert('Configure a API Key Anthropic em Integrações → Claude');
      }
    },
  };

  // ============================================================
  // 🎯 INTEGRAÇÃO COM UI DO LEXOFFICE
  // ============================================================
  function integrarUI() {

    // Sobrescreve parseEmailIA com versão real
    window.parseEmailIA = async function () {
      const texto = document.getElementById('emailBody')?.value;
      if (!texto?.trim()) {
        if (typeof window.toast === 'function') window.toast('⚠️ Cole um e-mail primeiro', 'gold');
        return;
      }
      const log = document.getElementById('emailLog');
      if (log) log.innerHTML += '<div style="color:var(--teal)">[IA] 🔍 Analisando publicação...</div>';

      const resultado = await LexIAClaude.analisarComIA(texto);
      if (!resultado) return;

      // Preenche campos da extração existente no LexOffice
      const extr = {
        cnj:          resultado.cnj || '',
        polo_cliente: resultado.partes?.autor || resultado.partes?.reu || '',
        ex_adverso:   resultado.partes?.reu || resultado.partes?.autor || '',
        tipo_acao:    resultado.ia?.tipo_acao || resultado.acao?.tipo || '',
        vara:         resultado.vara || '',
        prazo_data:   resultado.prazos?.[0]?.vencimento || '',
        tipo_mov:     resultado.prazos?.[0]?.tipo || '',
      };

      // Ativa o painel de extração existente
      if (typeof EMAIL !== 'undefined') EMAIL._extracao = extr;

      // Renderiza resultado
      const parserCard = document.getElementById('parserCard');
      const parserCampos = document.getElementById('parserCampos');
      if (parserCard) parserCard.style.display = 'block';
      if (parserCampos) {
        parserCampos.innerHTML = _renderExtracao(resultado, extr);
      }

      // Log
      if (log) {
        log.innerHTML += `<div style="color:var(--green)">[IA] ✅ ${extr.tipo_acao || 'Ação'} — CNJ: ${extr.cnj || 'n/d'}</div>`;
        if (resultado.prazos?.length) {
          resultado.prazos.forEach(p => {
            const icon = p.urgencia === 'critica' ? '🔴' : '🟠';
            log.innerHTML += `<div style="color:var(--orange)">[IA] ${icon} Prazo: ${p.tipo} — ${p.vencimento}</div>`;
          });
        }
        if (resultado.ia?.resumo_cliente) {
          log.innerHTML += `<div style="color:#a8c4ff">[IA] 💬 Resumo: ${resultado.ia.resumo_cliente}</div>`;
        }
        log.scrollTop = log.scrollHeight;
      }

      // Atualiza KPIs
      const kEP = document.getElementById('kEP');
      const kEPz = document.getElementById('kEPz');
      if (kEP)  kEP.textContent  = parseInt(kEP.textContent  || 0) + 1;
      if (kEPz) kEPz.textContent = parseInt(kEPz.textContent || 0) + (resultado.prazos?.length || 0);
    };

    // Sobrescreve buscarJurisIA com versão enriquecida
    window.buscarJurisIA = async function () {
      const input = document.getElementById('jurisBusca');
      const el    = document.getElementById('jurisResp');
      const tema  = input?.value?.trim();
      if (!tema) {
        if (typeof window.toast === 'function') window.toast('⚠️ Digite um tema', 'gold');
        return;
      }
      if (el) { el.textContent = '🔍 Pesquisando...'; el.classList.add('loading'); }

      // 1. Resultado local imediato
      const acao   = LexIACore.classificarAcao(tema);
      const area   = acao?.area || 'Cível';
      const teses  = LexIACore.sugerirTeses(area, tema);
      let html = `📚 TESES ENCONTRADAS — ${area.toUpperCase()}\n${'─'.repeat(50)}\n`;
      teses.forEach((t, i) => {
        html += `\n${i+1}. [${t.tribunal}] ${t.tese}\n`;
      });
      if (el) el.textContent = html;

      // 2. Enriquece com Claude
      const prompt = `Pesquise jurisprudência brasileira sobre: "${tema}" (área: ${area}).
Traga as principais teses do STJ, STF e tribunais superiores com:
- Número do precedente/súmula
- Tese fixada
- Aplicação prática em petições
Priorize fontes brasileiras. Formate em tópicos numerados.`;

      const iaResp = await LexIAClaude.consultar(prompt);
      if (iaResp && el) {
        el.textContent = iaResp;
        el.classList.remove('loading');
      }
    };

    // Sobrescreve aiDoc com versão real
    window.aiDoc = async function (tipo) {
      const el = document.getElementById('aiDocResp');
      const proc = document.getElementById('docProcSelect')?.value || '';
      if (el) { el.textContent = '🤖 Analisando...'; el.classList.add('loading'); }

      const prompts = {
        resumo:     `Faça um resumo executivo do processo ${proc} para uso interno do escritório`,
        criticos:   `Liste os pontos críticos, riscos e vulnerabilidades do processo ${proc}`,
        argumentos: `Desenvolva os principais argumentos jurídicos disponíveis para o processo ${proc}`,
        prazos:     `Identifique e calcule todos os prazos processuais relevantes do processo ${proc}`,
        juris:      `Pesquise jurisprudência relevante e atual para o processo ${proc}`,
      };

      const resp = await LexIAClaude.consultar(prompts[tipo] || prompts.resumo);
      if (el) { el.textContent = resp || 'Sem resposta.'; el.classList.remove('loading'); }
    };

    console.log('[LexIA] ✅ Funções de IA integradas ao LexOffice');
  }

  // ============================================================
  // 🖼️  RENDERIZAÇÃO DOS RESULTADOS
  // ============================================================
  function _renderExtracao(resultado, extr) {
    const urgIcon = { critica: '🔴', alta: '🟠', media: '🟡' };
    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        ${_campo('⚖️ Ação', extr.tipo_acao)}
        ${_campo('📌 CNJ', extr.cnj)}
        ${_campo('👤 Cliente/Autor', extr.polo_cliente)}
        ${_campo('⚔️ Adverso', extr.ex_adverso)}
        ${_campo('🏛️ Vara', extr.vara)}
        ${_campo('📅 Prazo', extr.prazo_data)}
      </div>`;

    if (resultado.prazos?.length) {
      html += `<div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;
          letter-spacing:1px;margin-bottom:6px">⏳ Prazos Detectados</div>`;
      resultado.prazos.forEach(p => {
        const cor = p.urgencia === 'critica' ? 'var(--red)' : p.urgencia === 'alta' ? 'var(--orange)' : 'var(--gold)';
        html += `<div style="background:var(--surface3);border-radius:8px;padding:8px 11px;
          margin-bottom:5px;border-left:3px solid ${cor}">
          <div style="font-size:12.5px;color:var(--text);font-weight:500">
            ${urgIcon[p.urgencia]||'🟡'} ${p.tipo} — vence ${p.vencimento}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            ${p.dias} dias · ${p.fundamento} · ${p.diasRestantes > 0 ? p.diasRestantes + ' dias restantes' : '⚠️ VENCIDO'}
          </div>
        </div>`;
      });
      html += '</div>';
    }

    if (resultado.ia?.resumo_cliente) {
      html += `<div style="background:linear-gradient(135deg,rgba(91,141,238,.07),rgba(155,114,232,.07));
        border:1px solid rgba(91,141,238,.2);border-radius:8px;padding:10px;margin-bottom:10px">
        <div style="font-size:11px;color:#a8c4ff;font-weight:600;margin-bottom:5px">💬 Resumo para Cliente</div>
        <div style="font-size:12.5px;color:var(--text2);line-height:1.5">${resultado.ia.resumo_cliente}</div>
      </div>`;
    }

    if (resultado.teses?.length) {
      html += `<div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">
          📚 Teses Jurídicas Relevantes
        </div>`;
      resultado.teses.slice(0, 3).forEach(t => {
        html += `<div style="background:var(--surface3);border-radius:8px;padding:8px 11px;margin-bottom:5px">
          <span style="font-size:10px;color:var(--gold);font-weight:600">[${t.tribunal}]</span>
          <span style="font-size:12px;color:var(--text2);margin-left:5px">${t.tese.slice(0,100)}...</span>
        </div>`;
      });
      html += '</div>';
    }

    return html;
  }

  function _campo(label, valor) {
    if (!valor) return '';
    return `<div style="background:var(--surface3);border-radius:8px;padding:8px 11px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:2px">${label}</div>
      <div style="font-size:12.5px;color:var(--text);font-weight:500">${valor}</div>
    </div>`;
  }

  // ============================================================
  // 🌐 API PÚBLICA
  // ============================================================
  window.LexIAJuridica = {
    // Funções locais (offline)
    classificarAcao:    (t)    => LexIACore.classificarAcao(t),
    detectarPrazos:     (t)    => LexIACore.detectarPrazos(t),
    sugerirTeses:       (a, s) => LexIACore.sugerirTeses(a, s),
    analisarPublicacao: (t)    => LexIACore.analisarPublicacao(t),
    // Funções com Claude API
    analisarComIA:      (t, el) => LexIAClaude.analisarComIA(t, el),
    gerarPeticao:       (tp, f, a) => LexIAClaude.gerarPeticao(tp, f, a),
    resumirParaCliente: (t)    => LexIAClaude.resumirParaCliente(t),
    gerarWhatsApp:      (c, p, m) => LexIAClaude.gerarWhatsApp(c, p, m),
    consultarClaude:    (prompt) => LexIAClaude.consultar(prompt),
    // Dataset
    dataset: JURIDICO_BR,
  };

  // ============================================================
  // 🚀 INICIALIZAÇÃO
  // ============================================================
  function init() {
    integrarUI();
    console.log('[LexOfficeAT IA Jurídica v1.0] ✅ Motor carregado');
    console.log('Dataset: ' +
      JURIDICO_BR.acoes.length + ' ações · ' +
      JURIDICO_BR.prazos.length + ' prazos · ' +
      Object.values(JURIDICO_BR.teses).flatMap(a => Object.values(a)).flat().length + ' teses');
    console.log('API pública: window.LexIAJuridica');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

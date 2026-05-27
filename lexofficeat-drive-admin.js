/**
 * LexOfficeAT — Drive Admin Tool
 * Ferramenta para organizar e corrigir pastas do Drive
 * Nova nomenclatura: LETRA+NUM — NOME_CLIENTE
 * Ex: F0001 — FANTOMA TRANSPORTES LTDA
 */
(function() {
  'use strict';

  var PASTA_CLIENTES = localStorage.getItem('lex_drive_clientes_id') || '1xoBLeDu6LKNHHJO-q2pNU0WwxdrLJsnt';

  function getToken() {
    return localStorage.getItem('lex_gmail_auth');
  }

  // Extrai nome do cliente de um título de pasta antigo
  // "A0037 — FANTOMA TRANSPORTES LTDA vs JOAO" -> "FANTOMA TRANSPORTES LTDA"
  // "A0038 — NELI REGINA SOUZA" -> "NELI REGINA SOUZA"
  // "Cliente vs..." -> null (sem nome válido)
  function extrairNomeCliente(titulo) {
    titulo = titulo.trim();
    // Remove prefixo A#### —
    var m = titulo.match(/^[A-Z]?\d{3,5}\s*[—\-]\s*(.+)$/);
    if (m) {
      var nome = m[1].trim();
      // Remove " vs ..." no final
      nome = nome.replace(/\s+vs\.?\s+.+$/i, '').trim();
      nome = nome.replace(/\s+VS\.?\s+.+$/i, '').trim();
      // Ignora nomes genéricos
      if (/^cliente$/i.test(nome) || nome.length < 3) return null;
      return nome;
    }
    // Remove prefixo _TESTE
    if (titulo.startsWith('_TESTE') || titulo.startsWith('_MODELO')) return null;
    // Título sem prefixo numérico
    if (titulo.length > 3 && !/^cliente$/i.test(titulo)) return titulo;
    return null;
  }

  // Normaliza nome para comparação (evita duplicatas)
  function normNome(n) {
    if (!n) return '';
    return n.toUpperCase()
      .replace(/\./g,' ').replace(/-/g,' ')
      .replace(/LTDA\.?$/,'LTDA').replace(/S\.A\.?$/,'SA')
      .replace(/EIRELI\.?$/,'EIRELI').replace(/\bME\b/,'ME')
      .replace(/\s+/g,' ').trim();
  }

  // Gera o código novo: primeira letra + sequencial
  // contadores[letra] = número atual
  function gerarCodigo(nomeCliente, contadores) {
    var letra = nomeCliente.trim().charAt(0).toUpperCase();
    if (!contadores[letra]) contadores[letra] = 0;
    contadores[letra]++;
    return letra + String(contadores[letra]).padStart(4, '0');
  }

  // Lista todas as pastas da pasta CLIENTES
  function listarPastas(token, pastaId) {
    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent("'" + pastaId + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false")
      + '&fields=files(id,name,createdTime,modifiedTime)'
      + '&pageSize=1000'
      + '&orderBy=name';
    return fetch(url, {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
      .then(function(d) { return d.files || []; });
  }

  // Renomeia pasta
  function renomearPasta(token, fileId, novoNome) {
    return fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: novoNome }),
    }).then(function(r) { return r.json(); });
  }

  // Move arquivo para outra pasta
  function moverArquivo(token, fileId, novoPaiId, velhosPais) {
    var url = 'https://www.googleapis.com/drive/v3/files/' + fileId
      + '?addParents=' + novoPaiId
      + '&removeParents=' + velhosPais.join(',')
      + '&fields=id,name,parents';
    return fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(function(r) { return r.json(); });
  }

  // Deleta pasta (move para lixeira)
  function deletarPasta(token, fileId) {
    return fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    }).then(function(r) { return r.json(); });
  }

  // Lista arquivos DENTRO de uma pasta
  function listarConteudo(token, pastaId) {
    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent("'" + pastaId + "' in parents and trashed=false")
      + '&fields=files(id,name,mimeType,parents)'
      + '&pageSize=100';
    return fetch(url, {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function(r) { return r.json(); })
      .then(function(d) { return d.files || []; });
  }

  // ── FUNÇÃO PRINCIPAL: Organizar Drive ─────────────────────
  window.lexOrganizarDrive = async function(modo) {
    var token = getToken();
    if (!token) {
      toast('❌ Gmail não conectado. Vá em Integrações → Conectar Gmail', 'red');
      return;
    }

    var log = document.getElementById('lexDriveLog');
    if (!log) {
      // Cria painel de log
      var panel = document.createElement('div');
      panel.id = 'lexDrivePanel';
      panel.style.cssText = 'position:fixed;top:60px;right:20px;width:500px;max-height:70vh;overflow-y:auto;background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:16px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.5)';
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        + '<span style="color:var(--gold);font-weight:600">🗂️ Organizador Drive</span>'
        + '<button onclick="document.getElementById(\'lexDrivePanel\').remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px">✕</button>'
        + '</div>'
        + '<div id="lexDriveProgress" style="margin-bottom:8px;font-size:12px;color:var(--teal)">Iniciando...</div>'
        + '<div id="lexDriveLog" style="font-size:11px;line-height:1.8;max-height:400px;overflow-y:auto"></div>'
        + '<div style="margin-top:12px;display:flex;gap:8px">'
        + '<button onclick="lexOrganizarDrive(\'renomear\')" class="btn btn-teal btn-sm">✏️ Renomear Pastas</button>'
        + '<button onclick="lexOrganizarDrive(\'duplicatas\')" class="btn btn-gold btn-sm">🔍 Eliminar Duplicatas</button>'
        + '<button onclick="lexOrganizarDrive(\'tudo\')" class="btn btn-red btn-sm">⚡ Fazer Tudo</button>'
        + '</div>';
      document.body.appendChild(panel);
      log = document.getElementById('lexDriveLog');
    }

    var progress = document.getElementById('lexDriveProgress');
    var stats = { renomeadas: 0, duplicatasRemovidas: 0, movidas: 0, erros: 0 };

    function addLog(msg, cor) {
      var d = document.createElement('div');
      d.style.color = cor || 'var(--text2)';
      d.textContent = msg;
      log.insertBefore(d, log.firstChild);
    }

    try {
      progress.textContent = '📋 Listando pastas...';
      var pastas = await listarPastas(token, PASTA_CLIENTES);
      addLog('📋 ' + pastas.length + ' pastas encontradas', 'var(--teal)');

      // Agrupa por nome normalizado
      var grupos = {}; // normNome -> [pasta1, pasta2, ...]
      var contadores = {};

      pastas.forEach(function(pasta) {
        var nomeCliente = extrairNomeCliente(pasta.name);
        if (!nomeCliente) {
          addLog('⚠️ Ignorando: ' + pasta.name, 'var(--orange)');
          return;
        }
        var norm = normNome(nomeCliente);
        if (!grupos[norm]) grupos[norm] = { nomeCliente: nomeCliente, pastas: [] };
        grupos[norm].pastas.push(pasta);
      });

      var nomes = Object.keys(grupos).sort();
      addLog('👥 ' + nomes.length + ' clientes únicos identificados', 'var(--teal)');

      // Calcula códigos novos
      var mapaCodigoPasta = {}; // norm -> { codigo, pasta_principal }

      nomes.forEach(function(norm) {
        var grupo = grupos[norm];
        var codigo = gerarCodigo(grupo.nomeCliente, contadores);
        // Pasta principal = a mais antiga (menor createdTime) que tem conteúdo
        var pastaPrincipal = grupo.pastas.sort(function(a,b){
          return new Date(a.createdTime) - new Date(b.createdTime);
        })[0];
        mapaCodigoPasta[norm] = { codigo: codigo, principal: pastaPrincipal, duplicatas: grupo.pastas.slice(1) };
      });

      // MODO: RENOMEAR
      if (modo === 'renomear' || modo === 'tudo') {
        progress.textContent = '✏️ Renomeando pastas...';
        var i = 0;
        for (var norm of nomes) {
          var info = mapaCodigoPasta[norm];
          var novoNome = info.codigo + ' — ' + info.principal.name.replace(/^[A-Z]?\d{3,5}\s*[—\-]\s*/, '').replace(/\s+vs\.?.+$/i,'').trim();
          // Simplifica: apenas código + nome do cliente
          var nomeCliente = grupos[norm].nomeCliente;
          novoNome = info.codigo + ' — ' + nomeCliente;

          if (info.principal.name !== novoNome) {
            try {
              await renomearPasta(token, info.principal.id, novoNome);
              addLog('✅ ' + info.principal.name + ' → ' + novoNome, 'var(--green)');
              stats.renomeadas++;
            } catch(e) {
              addLog('❌ Erro ao renomear: ' + info.principal.name, 'var(--red)');
              stats.erros++;
            }
          }
          i++;
          if (i % 5 === 0) {
            progress.textContent = '✏️ Renomeando... ' + i + '/' + nomes.length;
            await new Promise(function(r){ setTimeout(r, 100); });
          }
        }
      }

      // MODO: DUPLICATAS
      if (modo === 'duplicatas' || modo === 'tudo') {
        progress.textContent = '🔍 Eliminando duplicatas...';
        for (var norm of nomes) {
          var info = mapaCodigoPasta[norm];
          if (!info.duplicatas.length) continue;

          for (var dup of info.duplicatas) {
            // Move conteúdo da duplicata para pasta principal
            try {
              var conteudo = await listarConteudo(token, dup.id);
              for (var arq of conteudo) {
                await moverArquivo(token, arq.id, info.principal.id, [dup.id]);
                addLog('📦 Movido: ' + arq.name + ' → ' + info.principal.name, 'var(--blue)');
                stats.movidas++;
              }
              // Deleta duplicata (manda para lixeira)
              await deletarPasta(token, dup.id);
              addLog('🗑️ Removida: ' + dup.name, 'var(--orange)');
              stats.duplicatasRemovidas++;
            } catch(e) {
              addLog('❌ Erro com duplicata: ' + dup.name, 'var(--red)');
              stats.erros++;
            }
          }
        }
      }

      progress.textContent = '✅ Concluído!';
      var resumo = '✅ ' + stats.renomeadas + ' renomeadas | '
        + stats.duplicatasRemovidas + ' duplicatas removidas | '
        + stats.movidas + ' arquivos movidos | '
        + stats.erros + ' erros';
      addLog(resumo, 'var(--green)');
      if (typeof toast === 'function') toast(resumo, 'teal');

    } catch(e) {
      addLog('❌ Erro: ' + e.message, 'var(--red)');
      progress.textContent = '❌ Erro: ' + e.message;
    }
  };

  // ── Nova lógica de criação de pasta ───────────────────────
  // Sobrescreve a função criarPastaCliente do LexAT
  function novoCodigo(nomeCliente, token) {
    var letra = nomeCliente.trim().charAt(0).toUpperCase();
    return listarPastas(token, PASTA_CLIENTES).then(function(pastas) {
      // Conta quantas pastas já começam com essa letra
      var count = pastas.filter(function(p) {
        return p.name.charAt(0).toUpperCase() === letra;
      }).length;
      return letra + String(count + 1).padStart(4, '0');
    });
  }

  // Hook no LexAT.DRIVE para usar novo padrão de nomenclatura
  function hookDrive() {
    if (!window.LexAT || !window.LexAT.DRIVE) return;
    var origCriar = window.LexAT.DRIVE.criarPastaCliente.bind(window.LexAT.DRIVE);
    window.LexAT.DRIVE.criarPastaCliente = function(nomeCompleto) {
      var token = getToken();
      if (!token) return origCriar(nomeCompleto);

      // Extrai nome do cliente (remove " vs adverso")
      var nomeCliente = nomeCompleto.replace(/\s+vs\.?\s+.+$/i,'').replace(/^[A-Z]\d+\s*[—\-]\s*/,'').trim();
      if (!nomeCliente) return origCriar(nomeCompleto);

      // Verifica se já existe pasta para esse cliente
      return listarPastas(token, PASTA_CLIENTES).then(function(pastas) {
        var norm = normNome(nomeCliente);
        var existente = pastas.find(function(p) {
          var nomeP = p.name.replace(/^[A-Z]\d+\s*[—\-]\s*/,'').trim();
          return normNome(nomeP) === norm;
        });

        if (existente) {
          console.log('[Drive] Pasta já existe: ' + existente.name);
          return { id: existente.id, name: existente.name, url: 'https://drive.google.com/drive/folders/' + existente.id };
        }

        // Cria nova pasta com código correto
        var letra = nomeCliente.charAt(0).toUpperCase();
        var count = pastas.filter(function(p) { return p.name.charAt(0) === letra; }).length;
        var codigo = letra + String(count + 1).padStart(4,'0');
        var nomePasta = codigo + ' — ' + nomeCliente;

        return fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: nomePasta,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [PASTA_CLIENTES],
          }),
        }).then(function(r){ return r.json(); })
          .then(function(folder) {
            if (!folder.id) throw new Error('Falha ao criar pasta');
            console.log('[Drive] ✅ Pasta criada: ' + nomePasta);

            // Cria subpastas padrão
            var subpastas = ['📄 Petições', '📋 Procurações', '⚖️ Decisões', '📧 Correspondências', '📁 Documentos'];
            subpastas.forEach(function(sub) {
              fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: sub, mimeType: 'application/vnd.google-apps.folder', parents: [folder.id] }),
              });
            });

            return { id: folder.id, name: nomePasta, url: 'https://drive.google.com/drive/folders/' + folder.id };
          });
      });
    };
    console.log('[DriveAdmin] ✅ Criação de pastas atualizada — padrão LETRA+NUM');
  }

  // Init
  function init() {
    hookDrive();
    console.log('[DriveAdmin] ✅ Drive Admin Tool carregado');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 3000); });
  } else {
    setTimeout(init, 3000);
  }

})();

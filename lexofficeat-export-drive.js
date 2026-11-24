/**
 * LexOfficeAT — Exportação automática para o Google Drive v1.0
 *
 * OBJETIVO
 *   Os dados do LexOfficeAT ficam no navegador (localStorage). Este módulo grava uma
 *   cópia em JSON no Google Drive para que a rotina diária de intimações (Claude) cruze
 *   as publicações com a base do escritório: processos cadastrados, prazos e clientes.
 *
 * COMO FUNCIONA
 *   - Ao abrir o sistema (5 s depois) e a cada 30 min, se houver login Google válido.
 *   - Só envia quando os dados mudaram (compara um hash) ou passou 12 h do último envio.
 *   - Arquivo: "lexoffice-export.json" na pasta "Painel de Intimações" do Drive
 *     (ID configurável em localStorage 'lex_export_folder_id'). Sobrescreve o mesmo arquivo.
 *   - Botão manual: window.lexExportarDrive(true) — força o envio.
 *
 * SEGURANÇA
 *   - Exporta SOMENTE chaves de dados 'lexat_*' (exceto 'lexat_config') e 'lex_proc_*'
 *     (anotações). NUNCA exporta tokens, chaves de API, senhas ou configurações.
 *   - Usa o token OAuth já obtido pelo sistema (escopo drive já solicitado no login).
 *   - Nenhuma credencial fica no código.
 *
 * DEPENDÊNCIAS: nenhuma (fetch nativo). Carregar depois dos demais scripts no index.html:
 *   <script src="lexofficeat-export-drive.js"></script>
 */
(function () {
  'use strict';

  var FOLDER_DEFAULT = '1tVqYfUjsoSzHOVJJKLYD852QdZMBOnKU'; // Drive: "Painel de Intimações"
  var FILE_NAME = 'lexoffice-export.json';
  var INTERVALO_MS = 30 * 60 * 1000;
  var REENVIO_MAX_MS = 12 * 60 * 60 * 1000;
  var BLOQUEADAS = /token|auth|key|secret|senha|password|config|cfg|proxy|exp$/i;

  function log(msg) { try { console.log('[LexExport] ' + msg); } catch (e) {} }

  // Token OAuth já salvo pelos módulos de login (sem expor no log)
  function getToken() {
    try {
      var exp = parseInt(localStorage.getItem('lex_token_exp') || localStorage.getItem('lex_gmail_token_exp') || '0', 10);
      if (exp && Date.now() > exp) return null; // expirado: aguarda novo login
      var raw = localStorage.getItem('lex_gmail_token') || localStorage.getItem('lex_gmail_auth');
      if (!raw) return null;
      try { var j = JSON.parse(raw); if (typeof j === 'string') return j; if (j && j.access_token) return j.access_token; } catch (e) {}
      return raw;
    } catch (e) { return null; }
  }

  // Coleta apenas dados de negócio, nunca credenciais
  function coletar() {
    var dados = {};
    var anotacoes = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || BLOQUEADAS.test(k)) continue;
      var v;
      try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { v = localStorage.getItem(k); }
      if (k.indexOf('lexat_') === 0) dados[k.replace('lexat_', '')] = v;
      else if (k.indexOf('lex_proc_') === 0) anotacoes[k.replace('lex_proc_', '')] = v;
    }
    var resumo = {};
    Object.keys(dados).forEach(function (k) { resumo[k] = Array.isArray(dados[k]) ? dados[k].length : 1; });
    return {
      versao: 1,
      origem: 'LexOfficeAT',
      exportado_em: new Date().toISOString(),
      resumo: resumo,
      dados: dados,
      anotacoes: anotacoes,
    };
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h);
  }

  function api(url, opts, token) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); });
      return r.json();
    });
  }

  function acharArquivo(token, pasta) {
    var q = encodeURIComponent("name='" + FILE_NAME + "' and '" + pasta + "' in parents and trashed=false");
    return api('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)', {}, token)
      .then(function (j) { return j.files && j.files[0] ? j.files[0].id : null; });
  }

  function enviar(token, pasta, conteudo, idExistente) {
    var meta = idExistente ? {} : { name: FILE_NAME, parents: [pasta], mimeType: 'application/json' };
    var b = 'lexexport' + Date.now();
    var corpo = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + conteudo + '\r\n--' + b + '--';
    var url = idExistente
      ? 'https://www.googleapis.com/upload/drive/v3/files/' + idExistente + '?uploadType=multipart'
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    return api(url, { method: idExistente ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: corpo }, token);
  }

  function status(msg, ok) {
    try {
      var el = document.getElementById('lexExportStatus');
      if (!el) {
        el = document.createElement('div');
        el.id = 'lexExportStatus';
        el.style.cssText = 'position:fixed;bottom:6px;left:6px;font:11px Arial;padding:3px 7px;border-radius:4px;z-index:9999;opacity:.85;cursor:pointer';
        el.title = 'Clique para exportar agora para o Google Drive';
        el.onclick = function () { window.lexExportarDrive(true); };
        document.body.appendChild(el);
      }
      el.style.background = ok ? '#e2f0d9' : '#fbe4e4';
      el.style.color = ok ? '#375623' : '#9c0006';
      el.textContent = msg;
    } catch (e) {}
  }

  var emAndamento = false;
  window.lexExportarDrive = function (forcar) {
    if (emAndamento) return Promise.resolve();
    var token = getToken();
    if (!token) { status('Drive: faça login Google para exportar', false); return Promise.resolve(); }
    var pacote = coletar();
    var semData = JSON.stringify({ d: pacote.dados, a: pacote.anotacoes });
    var h = hash(semData);
    var ultimo = parseInt(localStorage.getItem('lex_export_last_ts') || '0', 10);
    if (!forcar && h === localStorage.getItem('lex_export_last_hash') && Date.now() - ultimo < REENVIO_MAX_MS) {
      return Promise.resolve();
    }
    var pasta = localStorage.getItem('lex_export_folder_id') || FOLDER_DEFAULT;
    emAndamento = true;
    return acharArquivo(token, pasta)
      .then(function (id) { return enviar(token, pasta, JSON.stringify(pacote), id); })
      .then(function () {
        localStorage.setItem('lex_export_last_hash', h);
        localStorage.setItem('lex_export_last_ts', String(Date.now()));
        status('Drive ✓ ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), true);
        log('Exportado: ' + JSON.stringify(pacote.resumo));
      })
      .catch(function (e) {
        status('Drive: falha na exportação (clique para tentar)', false);
        log('Erro: ' + e.message);
      })
      .then(function () { emAndamento = false; });
  };

  function iniciar() {
    setTimeout(function () { window.lexExportarDrive(false); }, 5000);
    setInterval(function () { window.lexExportarDrive(false); }, INTERVALO_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();

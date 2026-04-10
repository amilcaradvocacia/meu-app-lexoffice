/**
 * LexOffice — Gmail Fix Final
 * Corrige: Cannot read properties of undefined (reading 'cfg')
 */
(function () {

  var CLIENT_ID = '245855517843-4fstpfsna79doa6krmvg3hu5p3o7jtdm.apps.googleusercontent.com';
  var SCOPE     = 'https://www.googleapis.com/auth/gmail.readonly';

  function getCfg() {
    if (!window.EMAIL) window.EMAIL = {};
    if (!window.EMAIL.cfg) window.EMAIL.cfg = {};
    if (!window.EMAIL.cfg.clientId) window.EMAIL.cfg.clientId = CLIENT_ID;
    if (!window.EMAIL.stats) window.EMAIL.stats = { total:0, procs:0, prazos:0, dups:0 };
    if (!window.EMAIL.prazos) window.EMAIL.prazos = [];
    if (!window.EMAIL.cnjs_impacta) window.EMAIL.cnjs_impacta = {};
    if (!window.EMAIL.cfg.intervalo) window.EMAIL.cfg.intervalo = 15;
    if (!window.EMAIL.cfg.autoTarefa) window.EMAIL.cfg.autoTarefa = true;
    if (!window.EMAIL.cfg.autoAgenda) window.EMAIL.cfg.autoAgenda = true;
    return window.EMAIL.cfg;
  }

  function conectar() {
    var cfg = getCfg();
    var clientId = cfg.clientId || CLIENT_ID;
    var tentativas = 0;
    function tentar() {
      tentativas++;
      if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        iniciar(clientId);
      } else if (tentativas < 20) {
        setTimeout(tentar, 500);
      } else {
        alert('Biblioteca Google não carregou. Recarregue a página e tente novamente.');
      }
    }
    tentar();
  }

  function iniciar(clientId) {
    try {
      google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: onToken
      }).requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      alert('Erro OAuth: ' + e.message);
    }
  }

  function onToken(resp) {
    if (resp.error) { alert('Erro Gmail: ' + resp.error); return; }
    var token = resp.access_token;
    var exp   = Date.now() + (resp.expires_in || 3600) * 1000;
    window.EMAIL.token = token;
    window.EMAIL.ok    = true;
    try { localStorage.setItem('lex_gmail_token', token); } catch(e) {}
    try { localStorage.setItem('lex_gmail_token_exp', String(exp)); } catch(e) {}
    var btn = document.getElementById('btnGmail');
    if (btn) { btn.textContent='✅ Gmail Conectado'; btn.style.background='rgba(62,207,207,.18)'; btn.style.color='var(--teal)'; }
    if (typeof toast === 'function') toast('✅ Gmail conectado! Buscando publicações...', 'green');
    if (typeof eLog  === 'function') eLog('✅ Gmail autorizado', 'ok');
    buscarEmails(token);
    var mins = (window.EMAIL.cfg && window.EMAIL.cfg.intervalo) || 15;
    setInterval(function () { if (Date.now() < exp) buscarEmails(token); }, mins * 60 * 1000);
  }

  function buscarEmails(token) {
    var inbox = document.getElementById('inboxList');
    if (inbox) inbox.innerHTML = '<div style="text-align:center;padding:14px;color:var(--teal);font-size:13px">⏳ Buscando publicações...</div>';
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=' + encodeURIComponent('from:publicacoes@impacta.adv.br OR from:publicacoes-diarios@jusbrasil.com.br') + '&maxResults=20', {
      headers: { Authorization: 'Bearer ' + token }
    })
    .then(function(r) { return r.status===401 ? null : r.json(); })
    .then(function(data) {
      if (!data || !data.messages || !data.messages.length) {
        if (inbox) inbox.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
        if (typeof eLog === 'function') eLog('📭 Nenhum e-mail novo', 'info');
        return;
      }
      if (typeof eLog === 'function') eLog('📨 ' + data.messages.length + ' e-mail(s) encontrado(s)', 'ok');
      carregarCorpos(token, data.messages.slice(0, 15));
    })
    .catch(function(e) { if (inbox) inbox.innerHTML = '<div style="padding:14px;color:var(--red);font-size:13px">❌ '+e.message+'</div>'; });
  }

  function carregarCorpos(token, msgs) {
    var res = new Array(msgs.length), done = 0;
    msgs.forEach(function(m, i) {
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+m.id+'?format=full', { headers:{Authorization:'Bearer '+token} })
      .then(function(r){return r.json();})
      .then(function(msg) {
        var hdrs={};
        ((msg.payload&&msg.payload.headers)||[]).forEach(function(h){hdrs[h.name]=h.value;});
        res[i]={id:m.id,assunto:hdrs['Subject']||'(sem assunto)',de:hdrs['From']||'',data:hdrs['Date']||'',corpo:extrairTexto(msg),fonte:(hdrs['From']||'').toLowerCase().indexOf('jusbrasil')>=0?'jusbrasil':'impacta'};
        if(++done===msgs.length) processar(res.filter(Boolean));
      })
      .catch(function(){if(++done===msgs.length) processar(res.filter(Boolean));});
    });
  }

  function extrairTexto(msg) {
    var t='';
    function p(n){if(!n)return;if(n.mimeType==='text/plain'&&n.body&&n.body.data){try{t+=atob(n.body.data.replace(/-/g,'+').replace(/_/g,'/'))+'\n';}catch(e){}}if(n.parts)n.parts.forEach(p);}
    p(msg.payload||{});
    return t.trim();
  }

  function extrairDadosLocal(texto, fonte) {
    var d={fonte:fonte,cnjs:[],partes:'',mov:'',prazo:'',vara:'',datas:[],aud_data:'',aud_hora:'',raw:texto};
    var cnj=texto.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g); if(cnj)d.cnjs=cnj;
    var pm=texto.match(/[Pp]artes?:\s*([^\n]+)/); if(pm)d.partes=pm[1].trim();
    var mm=texto.match(/[Mm]ovi[^\:]*:\s*([^\n]+)/); if(mm)d.mov=mm[1].trim();
    var pz=texto.match(/[Pp]razo[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/); if(pz)d.prazo=pz[1];
    var vm=texto.match(/[Vv]ara:\s*([^\n]+)/); if(vm)d.vara=vm[1].trim();
    var dts=texto.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    if(dts){var s={};d.datas=dts.filter(function(x){return s[x]?false:(s[x]=true);});}
    if(!d.prazo&&d.datas.length>1)d.prazo=d.datas[d.datas.length-1];
    return d;
  }

  function processar(emails) {
    var novos=0, prazos=0;
    emails.forEach(function(email) {
      if(!email.corpo)return;
      var d=typeof extrairDados==='function'?extrairDados(email.corpo,email.fonte):extrairDadosLocal(email.corpo,email.fonte);
      var dup=typeof isDup==='function'?isDup(d,email.fonte):false;
      if(dup){window.EMAIL.stats.dups++;if(typeof eLog==='function')eLog('🔁 Dup: '+(d.cnjs[0]||email.assunto),'warn');return;}
      if(email.fonte==='impacta')(d.cnjs||[]).forEach(function(c){window.EMAIL.cnjs_impacta[c]=true;});
      if(d.prazo&&typeof criarPrazoInterno==='function'){criarPrazoInterno(d);prazos++;}
      window.EMAIL.stats.total++;
      window.EMAIL.stats.procs+=(d.cnjs||[]).length;
      novos++;
      if(typeof eLog==='function')eLog('✅ '+email.assunto.substring(0,50)+' | Prazo: '+(d.prazo||'n/d'),'ok');
    });
    window.EMAIL.stats.prazos+=prazos;
    if(typeof eKPI==='function')eKPI();
    renderInbox(emails);
    if(novos>0&&typeof toast==='function')toast('✅ '+novos+' publicação(ões)! '+prazos+' prazo(s) criado(s).','teal');
  }

  function renderInbox(emails) {
    var c=document.getElementById('inboxList'); if(!c)return;
    window._gmailEmails=emails;
    if(!emails.length){c.innerHTML='<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação nova.</div>';return;}
    c.innerHTML=emails.map(function(m,i){
      var isJB=m.fonte==='jusbrasil',cor=isJB?'bo':'bteal',label=isJB?'JusBrasil':'Impacta';
      var d=new Date(m.data),ds=isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR');
      var trecho=(m.corpo||'').substring(0,100).replace(/\n/g,' ');
      return '<div style="padding:10px 13px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);margin-bottom:6px">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        +'<span class="badge '+cor+'" style="font-size:10px">'+label+'</span>'
        +'<span style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+m.assunto+'</span>'
        +'<span style="font-size:11px;color:var(--text3)">'+ds+'</span>'
        +'<button class="btn btn-ai btn-xs" onclick="verEmailGmail('+i+')">👁 Ver</button>'
        +'</div>'
        +'<div style="font-size:11px;color:var(--text2)">'+trecho+'</div>'
        +'</div>';
    }).join('');
  }

  window.verEmailGmail = function(i) {
    var email=(window._gmailEmails||[])[i]; if(!email)return;
    var bodyEl=document.getElementById('emailBody'),remEl=document.getElementById('emailRem');
    if(bodyEl)bodyEl.value=email.corpo;
    if(remEl)remEl.value=email.fonte==='jusbrasil'?'jusbrasil':'impacta';
    var d=typeof extrairDados==='function'?extrairDados(email.corpo,email.fonte):extrairDadosLocal(email.corpo,email.fonte);
    window.EMAIL._extracao=d;
    if(typeof mostrarParser==='function')mostrarParser(d,email.fonte);
  };

  window.processarEmails = function() {
    var token=window.EMAIL&&window.EMAIL.token;
    if(!token){if(typeof toast==='function')toast('⚠️ Conecte o Gmail primeiro','orange');return;}
    if(typeof eLog==='function')eLog('▶️ Processamento manual...','teal');
    buscarEmails(token);
  };

  function aplicar() {
    getCfg();
    window.conectarGmail = conectar;
    window.iniciarOAuth  = conectar;
    var btn=document.getElementById('btnGmail');
    if(btn) btn.onclick=conectar;
    // Restaurar token salvo
    try {
      var t=localStorage.getItem('lex_gmail_token');
      var exp=parseInt(localStorage.getItem('lex_gmail_token_exp')||'0');
      if(t&&exp>Date.now()){
        window.EMAIL.token=t; window.EMAIL.ok=true;
        var b=document.getElementById('btnGmail');
        if(b){b.textContent='✅ Gmail Conectado';b.style.background='rgba(62,207,207,.18)';b.style.color='var(--teal)';}
        if(typeof eLog==='function')eLog('🔄 Token Gmail restaurado','ok');
        buscarEmails(t);
      }
    } catch(e){}
    console.log('[LexOffice Gmail Fix] ✅ Pronto.');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){setTimeout(aplicar,600);});
  } else {
    setTimeout(aplicar,600);
  }

})();

// LexOffice Fixes v7.0 — mínimo e seguro
(function(){
  function run(){
    fixUsuarios();
    fixProcessos();
    fixGmailToken();
    fixVerEmail();
    fixRenderInbox();
    console.log('[LEX v7] OK');
    try{ eLog('Fixes v7.0 OK','ok'); }catch(e){}
  }
  setTimeout(run, 1000);

  // ── 1. Usuários: reconstrói sidebar se vazia ──
  function fixUsuarios(){
    var el = document.getElementById('sidebarUsers');
    if(!el) return;
    if(el.innerHTML.trim()) return; // já tem conteúdo
    try{
      if(!window.S || !S.usuarios) return;
      var html = S.usuarios.filter(function(u){return u.ativo;}).map(function(u){
        var ini = u.nome.split(' ').filter(function(w){return w.length>1;}).slice(0,2).map(function(w){return w[0].toUpperCase();}).join('');
        var active = u.id===S.uidAtivo?' active':'';
        return '<button class="user-btn'+active+'" onclick="ativarUser('+u.id+',this)">'
          +'<div class="avatar" style="background:'+u.cor+'22;color:'+u.cor+'">'+ini+'</div>'
          +'<div style="flex:1;min-width:0"><div style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+u.nome+'</div>'
          +'<div style="font-size:10px;color:var(--text3)">'+u.perfil+'</div></div></button>';
      }).join('');
      el.innerHTML = html;
      var lbl = document.getElementById('userAreaLabel');
      if(lbl) lbl.textContent = 'Usuários ('+S.usuarios.filter(function(u){return u.ativo;}).length+'/5)';
    }catch(e){ console.warn('[LEX] usuarios:',e); }
  }

  // ── 2. Processos: força carregar xls2_data.js se vazio ──
  function fixProcessos(){
    try{
      // Se tabela vazia e XLS2 não carregou, tenta novamente
      var tbody = document.getElementById('processosBody');
      if(!tbody) return;

      // Monitora e re-tenta após 2s
      setTimeout(function(){
        if(window.XLS2_LOADED && window.XLS2_DATA && XLS2_DATA.length > 0){
          // Já carregou, mas tabela pode estar vazia
          if(!tbody.innerHTML.trim() || tbody.innerHTML.indexOf('Carregando')<0 && tbody.querySelectorAll('tr').length===0){
            if(typeof renderProcTable==='function') renderProcTable();
            else if(typeof filtrarProcessos==='function') filtrarProcessos();
          }
          return;
        }
        // XLS2 não carregou — tenta forçar
        if(window.XLS2_LOADING) return;
        if(typeof carregarXLS2==='function') carregarXLS2();
      }, 2000);

      // Re-tenta depois de 5s também
      setTimeout(function(){
        if(!window.XLS2_LOADED && !window.XLS2_LOADING){
          if(typeof carregarXLS2==='function') carregarXLS2();
        } else if(window.XLS2_LOADED && tbody && tbody.querySelectorAll('tr').length===0){
          if(typeof renderProcTable==='function') renderProcTable();
        }
      }, 5000);
    }catch(e){ console.warn('[LEX] processos:',e); }
  }

  // ── 3. Gmail: captura token da URL se não foi capturado ──
  function fixGmailToken(){
    try{
      var hash = window.location.hash || '';
      if(!hash.includes('access_token=')) return;
      if(window.EMAIL && EMAIL.ok && EMAIL.token) return; // já capturado

      // Extrai token
      var token = '';
      var parts = hash.replace('#','').split('&');
      for(var i=0;i<parts.length;i++){
        if(parts[i].startsWith('access_token=')){
          token = parts[i].replace('access_token=','');
          break;
        }
      }
      if(!token || token.length < 10) return;

      // Salva e ativa
      if(typeof DB !== 'undefined') DB.save('lex_gmail_auth', token);
      if(!window.EMAIL) return;
      EMAIL.ok = true;
      EMAIL.token = token;

      // Limpa URL
      history.replaceState(null, null, window.location.pathname);

      // Atualiza UI
      var btn = document.getElementById('btnGmail');
      if(btn){ btn.textContent='✅ Gmail Conectado'; btn.style.background='rgba(62,207,207,.18)'; btn.style.color='var(--teal)'; }
      var badge = document.getElementById('gmailOkBadge');
      if(badge) badge.style.display='inline-block';
      var banner = document.getElementById('gmailBanner');
      if(banner){ banner.style.display='flex'; banner.textContent='✅ Gmail conectado!'; }

      try{ toast('✅ Gmail conectado!','green'); }catch(e){}
      try{ eLog('Gmail conectado via token','ok'); }catch(e){}

      // Carrega inbox automaticamente
      setTimeout(function(){
        if(typeof carregarInbox==='function') carregarInbox();
      }, 800);
    }catch(e){ console.warn('[LEX] gmail token:',e); }
  }

  // ── 4. Botão VER: abre e-mail real ──
  window.verEmail = function(idx){
    try{
      if(!window.EMAIL || !EMAIL._gmailMsgs || !EMAIL._gmailMsgs[idx]){
        try{toast('E-mail não disponível','orange');}catch(e){}
        return;
      }
      var m = EMAIL._gmailMsgs[idx];
      if(!EMAIL.token){
        try{toast('Gmail não conectado','orange');}catch(e){}
        return;
      }

      // Feedback visual
      var allBtns = document.querySelectorAll('[onclick="verEmail('+idx+')"]');
      allBtns.forEach(function(b){ b.textContent='⏳'; b.disabled=true; });

      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+m.id+'?format=full',{
        headers:{'Authorization':'Bearer '+EMAIL.token}
      })
      .then(function(r){
        if(r.status===401){
          EMAIL.ok=false; EMAIL.token=null;
          try{DB.save('lex_gmail_auth',null);}catch(e){}
          try{toast('Sessão expirada — reconecte','orange');}catch(e){}
          allBtns.forEach(function(b){ b.textContent='👁 Ver'; b.disabled=false; });
          return null;
        }
        return r.json();
      })
      .then(function(msg){
        if(!msg) return;
        allBtns.forEach(function(b){ b.textContent='👁 Ver'; b.disabled=false; });

        var body = '';
        function dig(p){
          if(!p) return;
          if(p.mimeType==='text/plain'&&p.body&&p.body.data){
            try{ var t=atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')); if(t.length>body.length) body=t; }catch(e){}
          }
          if(!body&&p.mimeType==='text/html'&&p.body&&p.body.data){
            try{ body=atob(p.body.data.replace(/-/g,'+').replace(/_/g,'/')).replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s{3,}/g,'\n').trim(); }catch(e){}
          }
          if(p.parts) p.parts.forEach(dig);
        }
        dig(msg.payload||{});
        if(!body) body = m.snippet||'';

        var hdrs={};
        ((msg.payload&&msg.payload.headers)||[]).forEach(function(h){ hdrs[h.name]=h.value; });
        var from = hdrs['From']||m.from||'';
        var isJB = from.toLowerCase().indexOf('jusbrasil')>=0;

        var remEl=document.getElementById('emailRem');
        if(remEl) remEl.value = isJB?'jusbrasil':'impacta';
        var bodEl=document.getElementById('emailBody');
        if(bodEl) bodEl.value = body;

        try{ eLog('E-mail carregado ('+body.length+' chars)','teal'); }catch(e){}

        setTimeout(function(){
          try{ parseEmail(); }catch(e){}
          _autoCadastrar(body, m.subject||'', from);
        },300);
      })
      .catch(function(e){
        allBtns.forEach(function(b){ b.textContent='👁 Ver'; b.disabled=false; });
        try{toast('Erro: '+e.message,'orange');}catch(ex){}
      });
    }catch(e){ console.error('[LEX] verEmail:',e); }
  };

  // ── 5. Renderiza inbox com botão VER ──
  function fixRenderInbox(){
    window._renderGmail = function(msgs){
      if(!window.EMAIL) return;
      EMAIL._gmailMsgs = msgs;
      msgs.sort(function(a,b){ return new Date(b.date)-new Date(a.date); });

      // Usa inboxList (div) — estrutura do HTML atual
      var il = document.getElementById('inboxList');
      if(!il) return;

      if(!msgs.length){
        il.innerHTML='<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">📭 Nenhuma publicação encontrada.</div>';
        return;
      }

      il.innerHTML = msgs.map(function(m,i){
        var isJB=(m.from||'').toLowerCase().indexOf('jusbrasil')>=0;
        var cor=isJB?'bo':'bteal', src=isJB?'JusBrasil':'Impacta';
        var d=new Date(m.date);
        var ds=isNaN(d.getTime())?(m.date||''):d.toLocaleDateString('pt-BR');
        var snip=(m.snippet||'').substring(0,80);
        return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'
          +'<span class="badge '+cor+'" style="font-size:10px;flex-shrink:0;margin-top:2px">'+src+'</span>'
          +'<div style="flex:1;min-width:0;cursor:pointer" onclick="window._abrirGmail('+i+')">'
          +'<div style="font-size:12.5px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(m.subject||'(sem assunto)')+'</div>'
          +'<div style="font-size:10.5px;color:var(--text3);margin-top:2px">'+ds+' — '+snip+'</div>'
          +'</div>'
          +'<button class="btn btn-teal btn-xs" style="flex-shrink:0;white-space:nowrap" onclick="verEmail('+i+')">👁 Ver</button>'
          +'</div>';
      }).join('');

      var badge=document.getElementById('gmailOkBadge');
      if(badge) badge.style.display='inline-block';
    };
  }

  // ── Auto-cadastro interno ──
  function _autoCadastrar(corpo, assunto, from){
    try{
      if(!corpo||!window.S||!S.clientes) return;
      var isJB=(from||'').toLowerCase().indexOf('jusbrasil')>=0;
      var d = (typeof extrairDados==='function') ? extrairDados(corpo,isJB?'jusbrasil':'impacta') : null;

      var nome='';
      if(d&&d.partes){ var px=d.partes.split(/\s+[xX×]\s+/); if(px[0]&&px[0].trim().length>3) nome=px[0].trim(); }
      if(!nome&&assunto){ var m1=assunto.match(/[–\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÀÜa-záéíóúâêôãõçàü\s]{3,}?)\s*[–\-]/); if(m1&&m1[1]&&m1[1].trim().length>3) nome=m1[1].trim(); }
      if(!nome&&d&&d.cnjs&&d.cnjs.length&&window.XLS){
        var num=d.cnjs[0].replace(/[^0-9]/g,'').substring(0,13);
        var xr=XLS.find(function(r){return r.processo&&r.processo.replace(/[^0-9]/g,'').indexOf(num)>=0;});
        if(xr&&xr.parte1) nome=xr.parte1;
      }
      if(!nome||nome.length<4) return;

      var norm=nome.trim().toUpperCase().replace(/\s+/g,' ');
      if(S.clientes.find(function(c){return c.nome.toUpperCase().replace(/\s+/g,' ')===norm;})) return;

      var adverso='';
      if(d&&d.partes){var pa=d.partes.split(/\s+[xX×]\s+/);adverso=(pa[1]||'').trim();}
      var ac=(d&&d.mov||'').toUpperCase();
      var area=ac.indexOf('TRABALH')>=0?'Trabalhista':ac.indexOf('PENAL')>=0?'Penal':ac.indexOf('FAM')>=0?'Família':'Cível';

      S.clientes.push({id:S.nextCid++,nome:nome.trim(),cpfcnpj:'',email:'',tel:'',area:area,tipo:'PF',status:'ativo',resp:S.uidAtivo||1,exadverso:adverso,endereco:(d&&d.vara)||'',obs:'Auto '+new Date().toLocaleDateString('pt-BR')});
      S.cFiltrados=[].concat(S.clientes);
      try{renderKPIClientes();}catch(e){}
      var nb=document.getElementById('nbClientes'); if(nb) nb.textContent=S.clientes.length;
      try{eLog('👤 '+nome.trim(),'ok');}catch(e){}
      try{toast('👤 '+nome.trim(),'teal');}catch(e){}
      if(d&&d.prazo){try{criarPrazoInterno(d);}catch(e){}}
      try{eKPI();}catch(e){}
    }catch(e){ console.warn('[LEX] autoCadastrar:',e); }
  }

  // Dashboard KPIs — atualiza sem quebrar
  setInterval(function(){
    try{
      if(window.XLS2_DATA&&XLS2_DATA.length){
        var el=document.getElementById('kProc2026'); if(el) el.textContent=XLS2_DATA.length;
      }
      if(window.S&&S.clientes){
        var n=S.clientes.filter(function(c){return c.status==='ativo'||c.status==='vip';}).length;
        var kc=document.getElementById('kClientes'); if(kc) kc.textContent=n||S.clientes.length;
        var nb=document.getElementById('nbClientes'); if(nb) nb.textContent=S.clientes.length;
      }
    }catch(e){}
  }, 5000);

  // Sidebar: reconstrói a cada 3s se vazia
  setInterval(fixUsuarios, 3000);

})();

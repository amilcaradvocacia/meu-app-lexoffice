// LexOfficeAT — LexDB Render + Prazos Modal v2.0
(function(){
  'use strict';

  function renderPagina(page){
    if(typeof LexSync==='undefined'||!LexSync.DB)return;
    var db=LexSync.DB;
    var hoje=new Date();

    // ── PRAZOS ──────────────────────────────────────────────
    if(page==='prazos'){
      var todosPrazos=(db.getAll(db.KEYS.prazos)||[])
        .filter(function(p){return p.status==='pendente';})
        .map(function(p){
          var vISO=p.vencimentoISO||(p.vencimento||'').split('/').reverse().join('-');
          var dias=Math.ceil((new Date(vISO)-hoje)/86400000);
          return Object.assign({},p,{dias:dias});
        });

      // Deduplicação: mesmo CNJ + mesmo tipo = mantém 1
      var vistos={};
      var prazos=todosPrazos.filter(function(p){
        var key=(p.cnj||'')+'|'+(p.tipo||'')+'|'+(p.vencimentoISO||p.vencimento||'');
        if(vistos[key])return false;
        vistos[key]=true;
        return true;
      }).sort(function(a,b){return a.dias-b.dias;});

      var cont=document.getElementById('pg-prazos');
      if(!cont)return;

      var tbId='lexdb-prazos-table';
      var urgentes=prazos.filter(function(p){return p.dias<=0;}).length;
      var atencao=prazos.filter(function(p){return p.dias>0&&p.dias<=7;}).length;

      if(!document.getElementById(tbId)){
        var div=document.createElement('div');
        div.className='card';div.style.marginTop='16px';
        div.innerHTML='<div class="ch" style="flex-direction:column;gap:4px">'
          +'<span class="ct" id="lexPrazosTitulo" style="color:var(--teal)"></span>'
          +'<div style="display:flex;gap:8px;margin-top:6px">'
          +'<span id="lexPrazosUrgBadge" class="badge br" style="font-size:11px"></span>'
          +'<span id="lexPrazosAtBadge" class="badge bo" style="font-size:11px"></span>'
          +'</div>'
          +'</div>'
          +'<div class="cb"><table class="dtable" id="'+tbId+'">'
          +'<thead><tr><th>CNJ</th><th>Cliente</th><th>Tipo</th><th>Vara</th><th>Vencimento</th><th>Dias</th><th>Status</th><th></th></tr></thead>'
          +'<tbody id="lexdb-prazos-tbody"></tbody></table></div>';
        var c=cont.querySelector('.content');
        if(c)c.appendChild(div);
      }

      // Atualiza título e badges
      var tit=document.getElementById('lexPrazosTitulo');
      if(tit)tit.textContent='Prazos das Publicações LexDB ('+prazos.length+')';
      var urgBadge=document.getElementById('lexPrazosUrgBadge');
      if(urgBadge)urgBadge.textContent=urgentes+' vencidos/urgentes';
      var atBadge=document.getElementById('lexPrazosAtBadge');
      if(atBadge)atBadge.textContent=atencao+' atenção (até 7d)';

      var tbody=document.getElementById('lexdb-prazos-tbody');
      if(!tbody)return;
      tbody.innerHTML='';
      prazos.forEach(function(p){
        var cor=p.dias<=0?'var(--red)':p.dias<=3?'var(--red)':p.dias<=7?'var(--orange)':'var(--green)';
        var badge=p.dias<=0?'VENCIDO':p.dias<=3?'URGENTE':p.dias<=7?'ATENÇÃO':'OK';
        var cls=p.dias<=3?'br':p.dias<=7?'bo':'bteal';
        var tr=document.createElement('tr');
        tr.style.cursor='pointer';
        tr.innerHTML=
          '<td style="font-size:11px;color:var(--teal);white-space:nowrap">'+(p.cnj||p.ficha||'').slice(0,25)+'</td>'
          +'<td style="font-weight:500;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(p.cliente||'—').slice(0,30)+'</td>'
          +'<td style="color:var(--text2);font-size:12px">'+(p.tipo||'').split('—')[0].trim()+'</td>'
          +'<td style="font-size:11px;color:var(--text3);max-width:120px;overflow:hidden;text-overflow:ellipsis">'+(p.vara||'').slice(0,20)+'</td>'
          +'<td style="white-space:nowrap">'+(p.vencimento||'')+'</td>'
          +'<td style="color:'+cor+';font-weight:700;text-align:center">'+(p.dias<=0?p.dias+'d':'+'+p.dias+'d')+'</td>'
          +'<td><span class="badge '+cls+'">'+badge+'</span></td>'
          +'<td><button class="btn btn-ghost btn-xs" style="white-space:nowrap">📋 Ver</button></td>';
        (function(prazo){
          tr.onclick=function(){ window.lexVerPrazoDetalhe(prazo); };
          var btn=tr.querySelector('button');
          if(btn)btn.onclick=function(e){e.stopPropagation();window.lexVerPrazoDetalhe(prazo);};
        })(p);
        tbody.appendChild(tr);
      });
    }

    // ── PROCESSOS ────────────────────────────────────────────
    if(page==='processos'){
      var procs=(db.getAll(db.KEYS.processos)||[]);
      if(!procs.length)return;
      var cont2=document.getElementById('pg-processos');
      if(!cont2)return;
      var tbId2='lexdb-procs-table';
      if(!document.getElementById(tbId2)){
        var div2=document.createElement('div');div2.style.marginTop='16px';
        div2.innerHTML='<div class="card"><div class="ch">'
          +'<span class="ct" style="color:var(--teal)">Processos das Publicações LexDB ('+procs.length+')</span></div>'
          +'<div class="cb"><table class="dtable" id="'+tbId2+'">'
          +'<thead><tr><th>Ficha</th><th>CNJ</th><th>Cliente</th><th>Polo</th><th>Vara</th><th>Status</th><th></th></tr></thead>'
          +'<tbody id="lexdb-procs-tbody"></tbody></table></div></div>';
        var c2=cont2.querySelector('.content');if(c2)c2.appendChild(div2);
      }
      var tbody2=document.getElementById('lexdb-procs-tbody');
      if(!tbody2)return;
      tbody2.innerHTML='';
      procs.slice(0,200).forEach(function(p){
        var tr=document.createElement('tr');tr.style.cursor='pointer';
        tr.innerHTML='<td style="color:var(--gold);font-weight:600">'+(p.ficha||'')+'</td>'
          +'<td style="font-size:11px;color:var(--teal)">'+(p.cnj||'')+'</td>'
          +'<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(p.polo_cliente||'').slice(0,25)+'</td>'
          +'<td><span class="badge '+(p.polo_processual==='RÉU'?'br':'bteal')+'" style="font-size:10px">'+(p.polo_processual||'')+'</span></td>'
          +'<td style="font-size:11px;color:var(--text3)">'+(p.vara||p.tribunal||'').slice(0,20)+'</td>'
          +'<td><span class="badge '+(p.status==='ativo'?'bteal':'bg')+'">'+(p.status||'')+'</span></td>'
          +'<td><button class="btn btn-ghost btn-xs">Ver</button></td>';
        (function(proc){tr.onclick=function(){window.lexAbrirProcessoDB(proc);};})(p);
        tbody2.appendChild(tr);
      });
    }

    // ── PUBLICAÇÕES ───────────────────────────────────────────
    if(page==='emails'){
      var pubs=(db.getAll(db.KEYS.publicacoes)||[]).slice(-100).reverse();
      var el=document.getElementById('inboxList');
      if(!el||!pubs.length)return;
      el.innerHTML='';
      pubs.forEach(function(pub){
        var div3=document.createElement('div');
        div3.className='ditem';
        div3.style.cssText='flex-direction:column;gap:4px;margin-bottom:6px;cursor:pointer;padding:10px;border-radius:8px;border:1px solid var(--border)';
        var dt=(pub.data_pub||pub.data||pub.timestamp||'').slice(0,10).split('-').reverse().join('/');
        var isJB=(pub.fonte==='jusbrasil'||pub.fonte==='trt9_push');
        var srcLabel=pub.fonte==='trt9_push'?'TRT9 Push':pub.fonte==='jusbrasil'?'JusBrasil':'Impacta';
        div3.innerHTML='<div style="display:flex;align-items:center;gap:7px;width:100%">'
          +'<span class="badge '+(pub.fonte==='trt9_push'?'bteal':isJB?'bo':'bg')+'" style="font-size:10px">'+srcLabel+'</span>'
          +(pub.cnj?'<span style="font-size:11px;color:var(--teal);font-family:monospace">'+pub.cnj+'</span>':'')
          +'<span style="font-size:10px;color:var(--text3);margin-left:auto">'+dt+'</span>'
          +'</div>'
          +'<div style="display:flex;gap:12px;margin-top:2px">'
          +'<div><span style="font-size:10px;color:var(--text3)">Cliente: </span><span style="font-size:12px;color:var(--gold);font-weight:600">'+(pub.nosso_cliente||pub.polo_ativo||'').slice(0,30)+'</span></div>'
          +(pub.adverso||pub.polo_passivo?'<div><span style="font-size:10px;color:var(--text3)">vs: </span><span style="font-size:12px;color:var(--text2)">'+(pub.adverso||pub.polo_passivo||'').slice(0,25)+'</span></div>':'')
          +'</div>'
          +((pub.movimentacao||pub.movimento||'').slice(0,100)
            ?'<div style="font-size:11px;color:var(--text2);font-style:italic;border-top:1px solid var(--border);padding-top:4px;margin-top:2px">'+(pub.movimentacao||pub.movimento||'').slice(0,100)+'</div>'
            :'');
        (function(pb){
          div3.onclick=function(){
            if(!pb.cnj)return;
            var ci=document.getElementById('cnj_input_api');
            if(ci)ci.value=pb.cnj;
            if(typeof openModal==='function')openModal('mProcesso');
            setTimeout(function(){if(typeof window.consultarCNJ==='function')window.consultarCNJ();},400);
          };
        })(pub);
        el.appendChild(div3);
      });
    }

    // ── DASHBOARD ─────────────────────────────────────────────
    if(page==='dashboard'){
      if(typeof renderPrazosDash==='function')renderPrazosDash();
      var pubs4=db.getAll(db.KEYS.publicacoes)||[];
      var procs4=db.getAll(db.KEYS.processos)||[];
      var prazos4=(db.getAll(db.KEYS.prazos)||[]).filter(function(p){return p.status==='pendente';});
      var up=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};
      up('kPublicacoes',pubs4.length);
      up('kProcessosDB',procs4.length);
      up('kPrazosDB',prazos4.length);
    }
  }

  // ── Abre processo do LexDB ────────────────────────────────
  function lexAbrirDB(p){
    if(!p||typeof openModal!=='function')return;
    openModal('mProcesso');
    setTimeout(function(){
      if(typeof switchTab==='function')switchTab('dados');
      var s=function(id,v){var el=document.getElementById(id);if(el&&v)el.value=String(v);};
      s('f_proc',p.ficha);s('f_auto',p.cnj);s('f_acao',p.tipo_acao);
      s('f_vara',p.vara);s('f_comarca',p.comarca);
      s('f_parte1',p.polo_cliente);s('f_exadv',p.ex_adverso);s('f_adv_adv',p.adv_adverso);
      if(p.assuntos){var an=document.getElementById('f_anotacoes');if(an&&!an.value)an.value='Assunto: '+p.assuntos;}
      var re=document.getElementById('f_resp');
      if(re)for(var i=0;i<re.options.length;i++){if(re.options[i].text.toLowerCase().includes('amilcar')){re.selectedIndex=i;break;}}
      var sel=function(id,v){var el=document.getElementById(id);if(!el||!v)return;for(var i=0;i<el.options.length;i++){if(el.options[i].value===v||el.options[i].value.toUpperCase()===v.toUpperCase()){el.selectedIndex=i;break;}}};
      sel('f_polo',p.polo_processual||'AUTOR');sel('f_status',p.status||'ativo');
      var b=document.getElementById('autoFillBanner');
      if(b){b.style.display='flex';b.innerHTML='Processo: '+(p.ficha||p.cnj)+' — '+(p.polo_cliente||'');}
    },300);
  }

  // ── Modal de detalhes do prazo ────────────────────────────
  window.lexVerPrazoDetalhe=function(prazo){
    var db=typeof LexSync!=='undefined'&&LexSync.DB?LexSync.DB:null;
    var pub=null;
    if(db&&prazo.cnj){
      var pubs=db.getAll(db.KEYS.publicacoes)||[];
      pub=pubs.find(function(p){return p.cnj&&p.cnj.replace(/[.\-]/g,'')===prazo.cnj.replace(/[.\-]/g,'');});
    }
    var proc=null;
    if(db&&prazo.cnj){
      var procs2=db.getAll(db.KEYS.processos)||[];
      proc=procs2.find(function(p){return p.cnj&&p.cnj.replace(/[.\-]/g,'')===prazo.cnj.replace(/[.\-]/g,'');});
    }

    var old=document.getElementById('lexPrazoModal');
    if(old)old.remove();

    var cor=prazo.dias<=0?'#f07878':prazo.dias<=3?'#f07878':prazo.dias<=7?'#fbb040':'#4ade98';
    var diasStr=prazo.dias<=0?String(prazo.dias)+'d VENCIDO':'+'+prazo.dias+'d';

    var m=document.createElement('div');
    m.id='lexPrazoModal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';

    var html='<div style="background:#1c2030;border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:24px;width:100%;max-width:660px;max-height:88vh;overflow-y:auto;position:relative">'

    // Fechar
    +'<button id="lexPrazoBtnFechar" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#7080a0;cursor:pointer;font-size:20px;line-height:1">✕</button>'

    // Cabeçalho
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-right:30px">'
    +'<div>'
    +'<div style="font-size:10px;color:#7080a0;text-transform:uppercase;letter-spacing:.8px">Prazo Processual</div>'
    +'<div style="font-size:17px;font-weight:700;color:#e8c060;margin-top:4px">'+(prazo.cliente||prazo.cnj||'?').slice(0,40)+'</div>'
    +'<div style="font-size:12px;color:#48e0d0;margin-top:2px;font-family:monospace">'+(prazo.cnj||'')+'</div>'
    +'</div>'
    +'<div style="text-align:right">'
    +'<div style="font-size:30px;font-weight:700;color:'+cor+'">'+diasStr+'</div>'
    +'<div style="font-size:11px;color:#7080a0">Vence '+prazo.vencimento+'</div>'
    +'</div>'
    +'</div>'

    // Grid de dados
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">'
    +'<div style="background:#242840;border-radius:8px;padding:10px">'
    +'<div style="font-size:10px;color:#7080a0;text-transform:uppercase;margin-bottom:3px">Tipo de Prazo</div>'
    +'<div style="font-size:13px;color:#f4f2ee;font-weight:500">'+(prazo.tipo||'Manifestação')+'</div>'
    +'</div>'
    +'<div style="background:#242840;border-radius:8px;padding:10px">'
    +'<div style="font-size:10px;color:#7080a0;text-transform:uppercase;margin-bottom:3px">Vara / Tribunal</div>'
    +'<div style="font-size:12px;color:#f4f2ee">'+(prazo.vara||'TRT 9ª Região').slice(0,35)+'</div>'
    +'</div>'
    +'</div>';

    // Movimentação
    if(prazo.fundamento){
      html+='<div style="background:rgba(232,192,96,.08);border:1px solid rgba(232,192,96,.2);border-radius:10px;padding:14px;margin-bottom:14px">'
      +'<div style="font-size:10px;color:#e8c060;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📋 Movimentação</div>'
      +'<div style="font-size:13px;color:#f4f2ee;line-height:1.6">'+prazo.fundamento+'</div>'
      +'</div>';
    }

    // Publicação vinculada
    if(pub){
      var srcLabel=pub.fonte==='trt9_push'?'TRT9 Push':pub.fonte==='jusbrasil'?'JusBrasil':'Impacta';
      var dtPub=(pub.data_pub||pub.data||'').split('-').reverse().join('/');
      html+='<div style="background:rgba(72,224,208,.06);border:1px solid rgba(72,224,208,.2);border-radius:10px;padding:14px;margin-bottom:14px">'
      +'<div style="font-size:10px;color:#48e0d0;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">📧 Publicação Vinculada — '+srcLabel+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:8px">'
      +'<div><span style="color:#7080a0">Data: </span><span style="color:#f4f2ee">'+dtPub+'</span></div>'
      +'<div><span style="color:#7080a0">Polo: </span><span style="color:#f4f2ee">'+(pub.nosso_polo||pub.polo||'RÉU')+'</span></div>'
      +'<div><span style="color:#7080a0">Cliente: </span><span style="color:#e8c060;font-weight:600">'+(pub.nosso_cliente||pub.polo_ativo||'').slice(0,30)+'</span></div>'
      +'<div><span style="color:#7080a0">Adverso: </span><span style="color:#f4f2ee">'+(pub.adverso||pub.polo_passivo||'').slice(0,25)+'</span></div>'
      +'</div>'
      +(pub.movimentacao?'<div style="font-size:12px;color:#c0c8d8;font-style:italic;border-top:1px solid rgba(72,224,208,.15);padding-top:8px">"'+pub.movimentacao.slice(0,150)+'"</div>':'')
      +'</div>';
    } else {
      html+='<div style="color:#7080a0;font-size:12px;padding:8px 0;margin-bottom:10px">Publicação original não localizada no LexDB</div>';
    }

    // Histórico de movimentos do processo
    if(proc&&proc.movimentos&&proc.movimentos.length){
      html+='<div style="background:#1a1f2e;border-radius:10px;padding:12px;margin-bottom:14px">'
      +'<div style="font-size:10px;color:#7080a0;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">📂 Histórico do Processo ('+proc.movimentos.length+' movs.)</div>';
      proc.movimentos.slice(0,5).forEach(function(mv){
        html+='<div style="font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
          +'<span style="color:#48e0d0;margin-right:8px">'+mv.data+'</span>'
          +'<span style="color:#c0c8d8">'+mv.descricao.slice(0,80)+'</span>'
          +'</div>';
      });
      html+='</div>';
    }

    // Botões
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<button id="lexPrazoBtnAbrir" style="flex:1;min-width:120px;background:#e8c060;color:#13161f;border:none;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;font-size:13px">⚖️ Abrir Processo</button>'
    +'<button id="lexPrazoBtnPJe" style="background:transparent;color:#48e0d0;border:1px solid rgba(72,224,208,.3);border-radius:8px;padding:10px 14px;cursor:pointer;font-size:13px">🏛️ PJe TRT9</button>'
    +'<button id="lexPrazoBtnConcluir" style="background:transparent;color:#4ade98;border:1px solid rgba(74,222,128,.3);border-radius:8px;padding:10px 14px;cursor:pointer;font-size:13px">✅ Concluído</button>'
    +'</div>'
    +'</div>';

    m.innerHTML=html;
    document.body.appendChild(m);

    // Eventos
    document.getElementById('lexPrazoBtnFechar').onclick=function(){m.remove();};
    m.onclick=function(e){if(e.target===m)m.remove();};

    document.getElementById('lexPrazoBtnAbrir').onclick=function(){
      m.remove();
      if(proc){window.lexAbrirProcessoDB(proc);return;}
      if(prazo.cnj){
        var ci=document.getElementById('cnj_input_api');
        if(ci)ci.value=prazo.cnj;
        if(typeof openModal==='function')openModal('mProcesso');
        setTimeout(function(){if(typeof window.consultarCNJ==='function')window.consultarCNJ();},400);
      }
    };

    document.getElementById('lexPrazoBtnPJe').onclick=function(){
      window.open('https://pje.trt9.jus.br/consultaprocessual/detalhe-processo/'+(prazo.cnj||''),'_blank');
    };

    document.getElementById('lexPrazoBtnConcluir').onclick=function(){
      var db2=typeof LexSync!=='undefined'&&LexSync.DB?LexSync.DB:null;
      if(!db2)return;
      if(prazo.id)db2.update(db2.KEYS.prazos,prazo.id,{status:'concluido',concluidoEm:new Date().toISOString()});
      m.remove();
      renderPagina('prazos');
      if(typeof toast==='function')toast('Prazo marcado como concluído','green');
    };
  };

  // ── Expõe globalmente ─────────────────────────────────────
  window.lexRenderPagina=renderPagina;
  window.lexAbrirProcessoDB=lexAbrirDB;

  // ── Hook go() ─────────────────────────────────────────────
  function hookGo(){
    var origGo=window.go;
    if(origGo&&!origGo._lexDB){
      window.go=function(page,el){
        try{origGo(page,el);}catch(e){}
        setTimeout(function(){renderPagina(page);},300);
      };
      window.go._lexDB=true;
    }
  }

  // ── Init ──────────────────────────────────────────────────
  function init(){
    hookGo();
    renderPagina('dashboard');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){setTimeout(init,2500);});
  } else {
    setTimeout(init,2500);
  }
  setInterval(function(){renderPagina('dashboard');},30000);
})();

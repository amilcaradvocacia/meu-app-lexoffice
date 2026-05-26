// LexOfficeAT — LexDB Render Module
(function(){
  'use strict';

  function renderPagina(page){
    if(typeof LexSync==='undefined'||!LexSync.DB)return;
    var db=LexSync.DB;
    var hoje=new Date();

    // PRAZOS
    if(page==='prazos'){
      var prazos=(db.getAll(db.KEYS.prazos)||[])
        .filter(function(p){return p.status==='pendente';})
        .map(function(p){
          var vISO=p.vencimentoISO||(p.vencimento||'').split('/').reverse().join('-');
          var dias=Math.ceil((new Date(vISO)-hoje)/86400000);
          return Object.assign({},p,{dias:dias});
        }).sort(function(a,b){return a.dias-b.dias;});
      var cont=document.getElementById('pg-prazos');
      if(!cont||!prazos.length)return;
      var tbId='lexdb-prazos-table';
      if(!document.getElementById(tbId)){
        var div=document.createElement('div');
        div.className='card';div.style.marginTop='16px';
        div.innerHTML='<div class="ch"><span class="ct" style="color:var(--teal)">Prazos Publicacoes LexDB ('+prazos.length+')</span></div>'
          +'<div class="cb"><table class="dtable" id="'+tbId+'">'
          +'<thead><tr><th>Processo</th><th>Cliente</th><th>Tipo</th><th>Vencimento</th><th>Dias</th><th>Status</th></tr></thead>'
          +'<tbody id="lexdb-prazos-tbody"></tbody></table></div>';
        var c=cont.querySelector('.content');
        if(c)c.appendChild(div);
      }
      var tbody=document.getElementById('lexdb-prazos-tbody');
      if(!tbody)return;
      tbody.innerHTML=prazos.map(function(p){
        var cor=p.dias<=2?'var(--red)':p.dias<=5?'var(--orange)':'var(--green)';
        var badge=p.dias<=0?'VENCIDO':p.dias<=2?'URGENTE':p.dias<=5?'ATENCAO':'OK';
        var cls=p.dias<=2?'br':p.dias<=5?'bo':'bteal';
        return '<tr><td style="font-size:11px">'+(p.cnj||p.ficha||'').slice(0,30)+'</td>'
          +'<td>'+(p.cliente||'').slice(0,25)+'</td>'
          +'<td>'+(p.tipo||'').slice(0,25)+'</td>'
          +'<td>'+p.vencimento+'</td>'
          +'<td style="color:'+cor+';font-weight:600">'+p.dias+'d</td>'
          +'<td><span class="badge '+cls+'">'+badge+'</span></td></tr>';
      }).join('');
    }

    // PROCESSOS
    if(page==='processos'){
      var procs=(db.getAll(db.KEYS.processos)||[]);
      if(!procs.length)return;
      var cont2=document.getElementById('pg-processos');
      if(!cont2)return;
      var tbId2='lexdb-procs-table';
      if(!document.getElementById(tbId2)){
        var div2=document.createElement('div');
        div2.style.marginTop='16px';
        div2.innerHTML='<div class="card"><div class="ch">'
          +'<span class="ct" style="color:var(--teal)">Processos Publicacoes LexDB ('+procs.length+')</span></div>'
          +'<div class="cb"><table class="dtable" id="'+tbId2+'">'
          +'<thead><tr><th>Ficha</th><th>CNJ</th><th>Cliente</th><th>Adverso</th><th>Vara</th><th>Status</th><th>Ver</th></tr></thead>'
          +'<tbody id="lexdb-procs-tbody"></tbody></table></div></div>';
        var c2=cont2.querySelector('.content');
        if(c2)c2.appendChild(div2);
      }
      var tbody2=document.getElementById('lexdb-procs-tbody');
      if(!tbody2)return;
      tbody2.innerHTML='';
      procs.slice(0,200).forEach(function(p){
        var tr=document.createElement('tr');
        tr.style.cursor='pointer';
        tr.innerHTML='<td style="color:var(--gold);font-weight:600">'+(p.ficha||'')+'</td>'
          +'<td style="font-size:10px">'+(p.cnj||'')+'</td>'
          +'<td>'+(p.polo_cliente||'').slice(0,20)+'</td>'
          +'<td>'+(p.ex_adverso||'').slice(0,20)+'</td>'
          +'<td>'+(p.vara||p.tribunal||'').slice(0,20)+'</td>'
          +'<td><span class="badge '+(p.status==='ativo'?'bteal':'bg')+'">'+(p.status||'')+'</span></td>'
          +'<td><button class="btn btn-ghost btn-xs">Ver</button></td>';
        (function(proc){
          tr.onclick=function(){ lexAbrirDB(proc); };
        })(p);
        tbody2.appendChild(tr);
      });
    }

    // PUBLICACOES
    if(page==='emails'){
      var pubs=(db.getAll(db.KEYS.publicacoes)||[]).slice(-100).reverse();
      var el=document.getElementById('inboxList');
      if(!el||!pubs.length)return;
      el.innerHTML='';
      pubs.forEach(function(pub){
        var div3=document.createElement('div');
        div3.className='ditem';
        div3.style.cssText='flex-direction:column;gap:3px;margin-bottom:5px;cursor:pointer;padding:8px';
        var dt=(pub.data_pub||pub.data||pub.timestamp||'').slice(0,10).split('-').reverse().join('/');
        var isJB=(pub.fonte==='jusbrasil');
        div3.innerHTML='<div style="display:flex;align-items:center;gap:7px;width:100%">'
          +'<span class="badge '+(isJB?'bo':'bteal')+'" style="font-size:10px">'+(isJB?'JusBrasil':'Impacta')+'</span>'
          +(pub.cnj?'<span style="font-size:10px;color:var(--teal)">'+pub.cnj+'</span>':'')
          +'<span style="font-size:10px;color:var(--gold);margin-left:4px">'+(pub.nosso_cliente||pub.polo_ativo||'').slice(0,25)+'</span>'
          +'<span style="font-size:10px;color:var(--text3);margin-left:auto">'+dt+'</span>'
          +'</div>'
          +((pub.movimentacao||pub.movimento||'').slice(0,90)
            ?'<div style="font-size:11px;color:var(--text2)">'+(pub.movimentacao||pub.movimento||'').slice(0,90)+'</div>'
            :'');
        (function(pb){
          div3.onclick=function(){
            if(!pb.cnj)return;
            var ci=document.getElementById('cnj_input_api');
            if(ci)ci.value=pb.cnj;
            if(typeof openModal==='function')openModal('mProcesso');
            setTimeout(function(){
              if(typeof window.consultarCNJ==='function')window.consultarCNJ();
            },400);
          };
        })(pub);
        el.appendChild(div3);
      });
    }

    // DASHBOARD
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

  function lexAbrirDB(p){
    if(!p||typeof openModal!=='function')return;
    openModal('mProcesso');
    setTimeout(function(){
      if(typeof switchTab==='function')switchTab('dados');
      var s=function(id,v){var el=document.getElementById(id);if(el&&v)el.value=String(v);};
      s('f_proc',p.ficha);
      s('f_auto',p.cnj);
      s('f_acao',p.tipo_acao);
      s('f_vara',p.vara);
      s('f_comarca',p.comarca);
      s('f_parte1',p.polo_cliente);
      s('f_exadv',p.ex_adverso);
      s('f_adv_adv',p.adv_adverso);
      if(p.assuntos){
        var an=document.getElementById('f_anotacoes');
        if(an&&!an.value)an.value='Assunto: '+p.assuntos;
      }
      var re=document.getElementById('f_resp');
      if(re){
        for(var i=0;i<re.options.length;i++){
          if(re.options[i].text.toLowerCase().includes('amilcar')){re.selectedIndex=i;break;}
        }
      }
      var sel=function(id,v){
        var el=document.getElementById(id);
        if(!el||!v)return;
        for(var i=0;i<el.options.length;i++){
          if(el.options[i].value===v||el.options[i].value.toUpperCase()===v.toUpperCase()){
            el.selectedIndex=i;break;
          }
        }
      };
      sel('f_polo',p.polo_processual||'AUTOR');
      sel('f_status',p.status||'ativo');
      var b=document.getElementById('autoFillBanner');
      if(b){b.style.display='flex';b.innerHTML='Processo: '+(p.ficha||p.cnj)+' - '+(p.polo_cliente||'');}
    },300);
  }

  // Expoe globalmente
  window.lexRenderPagina=renderPagina;
  window.lexAbrirProcessoDB=lexAbrirDB;

  // Hook go()
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

  // Init
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){
      setTimeout(function(){hookGo();renderPagina('dashboard');},2500);
    });
  } else {
    setTimeout(function(){hookGo();renderPagina('dashboard');},2500);
  }
  setInterval(function(){renderPagina('dashboard');},30000);
})();

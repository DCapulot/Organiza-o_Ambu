var CODE="123456";
var NOME={func:"Funcionário",diamante:"Representante Diamante 💎",gestor:"Gestor",ti:"TI (monitoramento)"};
var CATS=["TI e suporte","Recursos Humanos","Financeiro","Infraestrutura"],PRIO=["Baixa","Média","Alta"];
var DOCS=[{n:"Manual do colaborador.pdf",lv:1},{n:"Política de segurança da informação.pdf",lv:1},{n:"Planejamento trimestral.xlsx",lv:2},{n:"Contratos e folha de pagamento.pdf",lv:3}];
var LV={1:["func","diamante","gestor","ti"],2:["diamante","gestor","ti"],3:["gestor","ti"]},LVN={2:"Representante, Gestor ou TI",3:"Gestor ou TI"};
var S={user:null,auth:0,tmp:"",tab:"atividades",ch:[],at:[],posts:[],us:[],au:[],unsubs:[],busy:false};
var v=document.getElementById("v"),live=document.getElementById("live");
function $(i){return document.getElementById(i)}
function say(t){live.textContent=t}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function err(m,f){$("e").innerHTML='<p class="err" role="alert">'+esc(m)+'</p>';say(m);if(f&&$(f))$(f).focus()}
function pf(){return S.user?S.user.perfil:""}
function isG(){return pf()==="gestor"}function isR(){return pf()==="diamante"}function isTI(){return pf()==="ti"}
function canAdm(){return isG()||isR()}
function canManage(a){return isG()||(isR()&&a.por===S.user.nome)}
function okDoc(l){return LV[l].indexOf(pf())>=0}
function nrm(x){return String(x||"").trim().toLowerCase()}
function hoje(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2)}
function fmt(d){return d?d.split("-").reverse().join("/"):"sem prazo"}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}

/* ---- camada de dados: nuvem (db) ou local ---- */
var db=null,COLL=["chamados","posts","atividades","usuarios","auditoria"],mem={},ls={};
COLL.forEach(function(n){mem[n]={};ls[n]=[]});
function vals(n){return Object.keys(mem[n]).map(function(k){return Object.assign({id:k},mem[n][k])})}
function fire(n){ls[n].forEach(function(f){f(vals(n))})}
var Data={
 sub:function(n,cb){
  if(db)return db.collection(n).onSnapshot(function(sn){cb(sn.docs.map(function(d){return Object.assign({id:d.id},d.data())}))},function(){cb(vals(n))});
  ls[n].push(cb);cb(vals(n));return function(){ls[n]=ls[n].filter(function(f){return f!==cb})}},
 set:function(n,id,o){if(db)return db.collection(n).doc(id).set(o);mem[n][id]=o;fire(n);return Promise.resolve()},
 upd:function(n,id,o){if(db)return db.collection(n).doc(id).update(o);Object.assign(mem[n][id],o);fire(n);return Promise.resolve()},
 del:function(n,id){if(db)return db.collection(n).doc(id).delete();delete mem[n][id];fire(n);return Promise.resolve()}};
function log(a){var u=S.user||S.tmp||{};Data.set("auditoria","L"+uid(),{quem:u.nome||"?",perfil:u.perfil||"?",acao:a,quando:Date.now()})}

/* ---- telas ---- */
function tabsFor(){var t=[["atividades","Atividades"],["chamados","Chamados"],["mural","Mural"],["docs","Documentos"]];if(isTI())t.unshift(["monitor","Monitoramento"]);return t}
function render(){
 var h="";
 if(!S.user){
  h='<div class="card narrow"><h2 tabindex="-1" id="ttl">Entrar no WorkLink</h2>'+(S.auth===0?
  '<label class="f" for="nm">Seu nome</label><input type="text" id="nm" autocomplete="name">'+
  '<label class="f" for="pf">Perfil de acesso (demonstração)</label><select id="pf"><option value="func">Funcionário</option><option value="diamante">Representante Diamante 💎</option><option value="gestor">Gestor</option><option value="ti">TI (monitoramento)</option></select>'+
  '<label class="f" for="pw">Senha</label><input type="password" id="pw" autocomplete="current-password">'+
  '<div id="e"></div><div class="row"><button class="pri" id="l1">Continuar</button></div>':
  '<p>Segundo fator (MFA): digite o código de 6 dígitos enviado ao seu aplicativo autenticador.</p><p class="hint">Demonstração: o código é '+CODE+'.</p>'+
  '<label class="f" for="cd">Código</label><input type="text" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6">'+
  '<div id="e"></div><div class="row"><button id="l0">Voltar</button><button class="pri" id="l2">Verificar e entrar</button></div>')+'</div>';
  v.innerHTML=h;bind();var t=$("ttl");if(t){t.focus();say(t.textContent)};return;
 }
 h='<div class="card"><div class="tools" style="justify-content:space-between"><div><strong>'+esc(S.user.nome)+'</strong> <span class="tag c">'+NOME[S.user.perfil]+'</span></div><button class="sm" id="out">Sair</button></div>'+
 '<div class="tabs" role="tablist" aria-label="Seções">'+tabsFor().map(function(t){return '<button role="tab" id="t-'+t[0]+'" aria-selected="'+(S.tab===t[0])+'" aria-controls="pn" data-t="'+t[0]+'" tabindex="'+(S.tab===t[0]?0:-1)+'">'+t[1]+'</button>'}).join("")+'</div>'+
 '<div id="pn" role="tabpanel" aria-labelledby="t-'+S.tab+'" tabindex="0"></div></div>';
 v.innerHTML=h;bind();draw();
}
function draw(){
 var p=$("pn");if(!p)return;
 ({monitor:drawMon,atividades:drawAtiv,chamados:drawChamados,mural:drawPosts,docs:drawDocs})[S.tab](p);
}

/* ---- monitoramento (TI) ---- */
function drawMon(p){
 var n=function(k){return S.ch.filter(function(a){return a.status===k}).length},td=hoje(),
 fim=function(a){return a.membros.every(function(m){return m.feito})},
 atr=S.at.filter(function(a){return a.prazo&&a.prazo<td&&!fim(a)}).length,ok=S.at.filter(fim).length,
 pc={func:0,diamante:0,gestor:0,ti:0};S.us.forEach(function(u){pc[u.perfil]=(pc[u.perfil]||0)+1});
 var L=S.au.slice().sort(function(a,b){return b.quando-a.quando}).slice(0,40);
 p.innerHTML='<h3>Visão geral do sistema (somente leitura)</h3><div class="cols">'+
 '<section class="col" aria-label="Conexão"><h3>Infraestrutura</h3><p>Conexão: <strong>'+(navigator.onLine?"online":"offline")+'</strong></p><p>Armazenamento: <strong>'+(db?"nuvem, tempo real":"local, só esta aba")+'</strong></p></section>'+
 '<section class="col" aria-label="Usuários"><h3>Usuários ('+S.us.length+')</h3><p>Funcionários: '+pc.func+'<br>Representantes: '+pc.diamante+'<br>Gestores: '+pc.gestor+'<br>TI: '+pc.ti+'</p></section>'+
 '<section class="col" aria-label="Chamados"><h3>Chamados ('+S.ch.length+')</h3><p>Pendentes: '+n("pendente")+'<br>Na fila: '+n("confirmado")+'<br>Em atendimento: '+n("atendimento")+'<br>Atendidos: '+n("atendido")+'<br>Cancelados: '+n("cancelado")+'</p></section>'+
 '<section class="col" aria-label="Atividades"><h3>Atividades ('+S.at.length+')</h3><p>Concluídas: '+ok+'<br>Atrasadas: '+atr+'<br>Em andamento: '+(S.at.length-ok-atr)+'</p></section></div>'+
 '<h3 style="margin-top:1rem">Registro de auditoria (últimos '+L.length+')</h3>'+(L.length?'<div class="tw"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>'+L.map(function(x){return '<tr><td>'+new Date(x.quando).toLocaleString("pt-BR")+'</td><td>'+esc(x.quem)+'</td><td>'+esc(NOME[x.perfil]||x.perfil)+'</td><td>'+(/Falha/.test(x.acao)?'<span class="tag x">'+esc(x.acao)+'</span>':esc(x.acao))+'</td></tr>'}).join("")+'</tbody></table></div>':'<p class="hint">Nenhum evento registrado ainda.</p>');
}

/* ---- atividades ---- */
function elig(){var a=isG()?["func","diamante"]:["func"];return S.us.filter(function(u){return a.indexOf(u.perfil)>=0}).sort(function(a,b){return a.nome.localeCompare(b.nome)})}
function opts(sel){return '<option value="">Selecione o membro</option>'+elig().map(function(u){return '<option value="'+esc(u.nome)+'"'+(u.nome===sel?' selected':'')+'>'+esc(u.nome)+' ('+(u.perfil==="func"?"Funcionário":"Representante")+')</option>'}).join("")}
function rowM(){return '<div class="mrow" style="display:grid;grid-template-columns:1fr 2fr;gap:.5rem;margin-top:.4rem"><select class="mn" aria-label="Membro">'+opts("")+'</select><input type="text" class="mr" aria-label="Responsabilidade do membro" placeholder="Responsabilidade"></div>'}
function refSel(){[].forEach.call(document.querySelectorAll(".mn"),function(s){var x=s.value;s.innerHTML=opts(x)})}
function visAt(a){var me=nrm(S.user.nome),m=a.membros.some(function(x){return nrm(x.nome)===me});return isG()||isTI()||m||(isR()&&a.por===S.user.nome)}
function drawAtiv(p){
 if(!$("al")){
  var hint=isTI()?'Modo vigilância: você vê todas as atividades, sem poder alterá-las.':isR()?'':'Seu perfil é de consulta: você vê as atividades em que o seu nome foi indicado.';
  p.innerHTML=(canAdm()?'<h3>Nova atividade para uma equipe</h3>'+(isR()?'<p class="hint">Como Representante, você atribui atividades somente a funcionários comuns.</p>':'')+'<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div><label class="f" for="atl">Título</label><input type="text" id="atl"></div><div><label class="f" for="ate">Equipe</label><input type="text" id="ate" placeholder="Ex.: Equipe de Vendas"></div><div><label class="f" for="atp">Prazo</label><input type="date" id="atp" min="'+hoje()+'"></div></div><label class="f" for="atr">Requisitos de entrega</label><textarea id="atr" rows="2" placeholder="O que precisa estar pronto para a atividade ser aceita"></textarea><fieldset style="border:0;padding:0;margin:.8rem 0 0"><legend class="f">Membros e responsabilidades</legend><div id="mrows">'+rowM()+rowM()+'</div><div class="row"><button class="sm" id="addm">+ Adicionar membro</button><button class="sm" id="seedu">Carregar funcionários de exemplo</button></div></fieldset><div id="e"></div><div class="row"><button class="pri" id="adda">Criar atividade</button></div>':'<p class="hint">'+hint+'</p>')+'<div id="al"></div>';
  if($("addm"))$("addm").onclick=function(){$("mrows").insertAdjacentHTML("beforeend",rowM());var r=$("mrows").querySelectorAll(".mn");r[r.length-1].focus()};
  if($("seedu"))$("seedu").onclick=function(){[["Ana","func"],["Bruno","func"],["Carla","func"],["Diego","diamante"]].forEach(function(x){Data.set("usuarios",nrm(x[0]),{nome:x[0],perfil:x[1],ultimo:Date.now()})});say("Funcionários de exemplo carregados")};
  if($("adda"))$("adda").onclick=function(){
   if(S.busy)return;
   var t=$("atl").value.trim(),eq=$("ate").value.trim(),pz=$("atp").value,rq=$("atr").value.trim(),m=[],seen={},bad="";
   [].forEach.call($("mrows").querySelectorAll(".mrow"),function(r){var n=r.querySelector(".mn").value,x=r.querySelector(".mr").value.trim();if(n&&x){if(seen[n])bad="Cada membro só pode aparecer uma vez.";seen[n]=1;m.push({nome:n,resp:x,feito:false})}});
   if(t.length<3)return err("Digite o título da atividade.","atl");
   if(eq.length<2)return err("Informe a equipe responsável.","ate");
   if(!pz)return err("Defina o prazo da atividade.","atp");
   if(rq.length<3)return err("Descreva os requisitos de entrega.","atr");
   if(!m.length)return err(elig().length?"Escolha pelo menos um membro e escreva a responsabilidade dele.":"Ainda não há funcionários cadastrados. Use “Carregar funcionários de exemplo” ou peça para eles entrarem uma vez.");
   if(bad)return err(bad);
   var allow=elig().map(function(u){return u.nome});
   for(var i=0;i<m.length;i++)if(allow.indexOf(m[i].nome)<0)return err("Seu perfil não permite atribuir atividade a "+m[i].nome+".");
   S.busy=true;var b=$("adda");b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span> Criando…';
   var id="AT-"+Date.now().toString(36).toUpperCase();
   Data.set("atividades",id,{titulo:t,equipe:eq,prazo:pz,requisitos:rq,membros:m,criado:Date.now(),por:S.user.nome}).then(function(){log("Criou a atividade "+id+" ("+t+")");S.busy=false;b.disabled=false;b.textContent="Criar atividade";["atl","ate","atp","atr"].forEach(function(i){$(i).value=""});$("mrows").innerHTML=rowM()+rowM();$("e").innerHTML='<p class="hint" role="status">Atividade '+id+' criada. A equipe já pode ver a sua parte.</p>';say("Atividade criada")}).catch(function(){S.busy=false;b.disabled=false;b.textContent="Criar atividade";err("Não foi possível criar a atividade. Tente novamente.")});
  };
 }
 refSel();
 var L=S.at.filter(visAt).sort(function(a,b){return (a.prazo||"9").localeCompare(b.prazo||"9")});
 $("al").innerHTML='<h3 style="margin-top:1rem">'+(isG()||isTI()?'Atividades das equipes':canAdm()?'Atividades que você criou ou participa':'Minhas atividades')+' ('+L.length+')</h3>'+(L.length?L.map(function(a){
  var tot=a.membros.length,ok=a.membros.filter(function(x){return x.feito}).length,fim=ok===tot,atr=!fim&&a.prazo&&a.prazo<hoje(),mg=canManage(a);
  return '<div class="task"><p><strong>'+esc(a.titulo)+'</strong> '+(fim?'<span class="tag c">Concluída</span>':atr?'<span class="tag x">Atrasada</span>':'<span class="tag">Em andamento</span>')+'</p><p class="hint">'+esc(a.id)+' · '+esc(a.equipe)+' · prazo '+fmt(a.prazo)+' · criada por '+esc(a.por)+'</p><p><strong>Requisitos:</strong> '+esc(a.requisitos)+'</p><p>Progresso: '+ok+' de '+tot+' partes concluídas <progress max="'+tot+'" value="'+ok+'" aria-label="Progresso de '+esc(a.titulo)+'"></progress></p><ul style="margin:.3rem 0;padding-left:1.2rem">'+a.membros.map(function(x,i){
   return '<li>'+(x.feito?'✔ ':'')+'<strong>'+esc(x.nome)+'</strong>: '+esc(x.resp)+(x.feito?' <span class="tag c">Feito</span>':' <span class="tag">Pendente</span>')+(mg&&!x.feito?' <button class="sm pri" data-a="'+a.id+'" data-i="'+i+'" aria-label="Marcar a parte de '+esc(x.nome)+' em '+esc(a.titulo)+' como feita">Marcar como feito</button>':'')+'</li>'}).join("")+'</ul>'+(mg?'<button class="sm" data-x="'+a.id+'" aria-label="Excluir atividade '+esc(a.titulo)+'">Excluir atividade</button>':'')+'</div>'}).join(""):'<p class="hint">Nenhuma atividade para mostrar.</p>');
 [].forEach.call($("al").querySelectorAll("button"),function(b){b.onclick=function(){
  if(b.dataset.x){Data.del("atividades",b.dataset.x);log("Excluiu a atividade "+b.dataset.x);say("Atividade excluída");return}
  var a=S.at.filter(function(z){return z.id===b.dataset.a})[0];if(!a||!canManage(a))return;
  var m=a.membros.map(function(x,i){return i==b.dataset.i?{nome:x.nome,resp:x.resp,feito:true}:x});
  Data.upd("atividades",a.id,{membros:m});log("Marcou a parte de "+a.membros[b.dataset.i].nome+" como concluída em "+a.id);say("Parte marcada como concluída")}});
}

/* ---- chamados ---- */
function tagS(st){var m={pendente:["","Pendente"],confirmado:["c","Na fila"],atendimento:["c","Em atendimento"],atendido:["c","Atendido"],cancelado:["x","Cancelado"]}[st]||["",st];return '<span class="tag '+m[0]+'">'+m[1]+'</span>'}
function tagP(p){return '<span class="tag'+(p==="Alta"?' x':'')+'">Prioridade '+esc(p)+'</span>'}
function btn(id,s,t,tt,pri){return '<button class="sm'+(pri?' pri':'')+'" data-s="'+s+'" data-id="'+esc(id)+'" aria-label="'+t+' chamado '+esc(tt)+'">'+t+'</button> '}
function filaOrdem(){return S.ch.filter(function(a){return a.status==="confirmado"||a.status==="atendimento"}).sort(function(a,b){return (a.confirmadoEm||0)-(b.confirmadoEm||0)})}
function drawChamados(p){
 if(!$("cl")){
  p.innerHTML=isTI()?'<p class="hint">Modo vigilância: você vê todos os chamados, sem poder alterá-los.</p><div id="cl"></div>':'<h3>Pedir ajuda: abrir chamado</h3><div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div><label class="f" for="ctt">Título</label><input type="text" id="ctt"></div><div><label class="f" for="cct">Categoria</label><select id="cct">'+CATS.map(function(c){return '<option>'+c+'</option>'}).join("")+'</select></div><div><label class="f" for="cpr">Prioridade</label><select id="cpr">'+PRIO.map(function(c,i){return '<option'+(i===1?' selected':'')+'>'+c+'</option>'}).join("")+'</select></div></div><label class="f" for="cds">Descrição do problema</label><textarea id="cds" rows="3"></textarea><div id="e"></div><div class="row"><button class="pri" id="addc">Abrir chamado</button>'+(canAdm()?'<button id="seed">Carregar exemplos</button>':'')+'</div><div id="cl"></div>';
  if($("addc"))$("addc").onclick=function(){
   if(S.busy)return;var t=$("ctt").value.trim(),d=$("cds").value.trim();
   if(t.length<3)return err("Digite um título para o chamado.","ctt");
   if(d.length<5)return err("Descreva o problema para a equipe conseguir ajudar.","cds");
   S.busy=true;var b=$("addc");b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span> Enviando…';
   var id="CH-"+Date.now().toString(36).toUpperCase();
   Data.set("chamados",id,{titulo:t,cat:$("cct").value,prio:$("cpr").value,desc:d,status:"pendente",criado:Date.now(),por:S.user.nome}).then(function(){log("Abriu o chamado "+id+" ("+t+")");S.busy=false;b.disabled=false;b.textContent="Abrir chamado";$("ctt").value="";$("cds").value="";$("e").innerHTML='<p class="hint" role="status">Chamado '+id+' aberto. Acompanhe o status abaixo.</p>';say("Chamado aberto")}).catch(function(){S.busy=false;b.disabled=false;b.textContent="Abrir chamado";err("Não foi possível abrir o chamado. Tente novamente.")});
  };
  if($("seed"))$("seed").onclick=function(){
   [["Notebook não liga","Ana","TI e suporte","Alta"],["Acesso à VPN bloqueado","Bruno","TI e suporte","Média"],["Segunda via de holerite","Carla","Recursos Humanos","Baixa"]].forEach(function(x,i){Data.set("chamados","CH-EX"+Date.now().toString(36).toUpperCase()+i,{titulo:x[0],cat:x[2],prio:x[3],desc:"Exemplo de demonstração.",status:"pendente",criado:Date.now()+i,por:x[1]})});say("Exemplos carregados")};
 }
 var h="";
 if(!canAdm()&&!isTI()){
  var L=S.ch.filter(function(a){return a.por===S.user.nome}).sort(function(a,b){return b.criado-a.criado}),fila=filaOrdem();
  h='<h3 style="margin-top:1rem">Meus chamados ('+L.length+')</h3>'+(L.length?L.map(function(a){
   var pos=fila.findIndex(function(x){return x.id===a.id});
   return '<div class="task"><p><strong>'+esc(a.titulo)+'</strong> '+tagS(a.status)+'</p><p class="hint">'+esc(a.id)+' · '+esc(a.cat)+' · '+tagP(a.prio)+'</p>'+(a.status==="confirmado"&&pos>=0?'<p>Posição na fila de atendimento: <strong>'+(pos+1)+'</strong></p>':'')+(a.status==="atendimento"?'<p>Sendo atendido por <strong>'+esc(a.atendente||"equipe")+'</strong>.</p>':'')+'</div>'}).join(""):'<p class="hint">Você ainda não abriu chamados.</p>')+'<p class="hint">Seu perfil só pede ajuda. Representantes e Gestores administram os chamados.</p>';
 }else{
  var ro=isTI(),pend=S.ch.filter(function(a){return a.status==="pendente"}).sort(function(a,b){return a.criado-b.criado}),fl=filaOrdem(),enc=S.ch.filter(function(a){return a.status==="atendido"||a.status==="cancelado"});
  h='<h3 style="margin-top:1rem">Fila de atendimento ('+fl.length+')</h3>'+(fl.length?'<div class="tw"><table><caption class="hint" style="text-align:left">Ordem de confirmação: o primeiro é o próximo a ser atendido</caption><thead><tr><th>Nº</th><th>Chamado</th><th>Aberto por</th><th>Status</th>'+(ro?'':'<th>Ação</th>')+'</tr></thead><tbody>'+fl.map(function(a,i){
   var ac=ro?'':'<td>'+(a.status==="atendimento"?btn(a.id,"atendido","Concluir",a.titulo,1):btn(a.id,"atendimento","Chamar",a.titulo,1))+btn(a.id,"cancelado","Cancelar",a.titulo)+'</td>';
   return '<tr><td><strong>'+(i+1)+'</strong></td><td>'+esc(a.titulo)+'<br><span class="hint">'+esc(a.id)+' · '+esc(a.cat)+'</span><br>'+tagP(a.prio)+'</td><td>'+esc(a.por)+'</td><td>'+tagS(a.status)+(a.atendente?'<br><span class="hint">'+esc(a.atendente)+'</span>':'')+'</td>'+ac+'</tr>'}).join("")+'</tbody></table></div>':'<p class="hint">A fila está vazia.</p>');
  h+='<h3 style="margin-top:1rem">Chamados pendentes ('+pend.length+')</h3>'+(pend.length?'<div class="tw"><table><thead><tr><th>Chamado</th><th>Descrição</th><th>Aberto por</th>'+(ro?'':'<th>Ação</th>')+'</tr></thead><tbody>'+pend.map(function(a){
   return '<tr><td>'+esc(a.titulo)+'<br><span class="hint">'+esc(a.id)+' · '+esc(a.cat)+'</span><br>'+tagP(a.prio)+'</td><td>'+esc(a.desc)+'</td><td>'+esc(a.por)+'</td>'+(ro?'':'<td>'+btn(a.id,"confirmado","Confirmar",a.titulo,1)+btn(a.id,"cancelado","Cancelar",a.titulo)+'</td>')+'</tr>'}).join("")+'</tbody></table></div>':'<p class="hint">Nenhum chamado pendente.</p>');
  if(enc.length)h+='<h3 style="margin-top:1rem">Encerrados ('+enc.length+')</h3><ul>'+enc.map(function(a){return '<li>'+esc(a.titulo)+' ('+esc(a.por)+') '+tagS(a.status)+'</li>'}).join("")+'</ul>';
 }
 $("cl").innerHTML=h;
 [].forEach.call($("cl").querySelectorAll("button[data-s]"),function(b){b.onclick=function(){
  if(!canAdm())return;
  var up={status:b.dataset.s};if(up.status==="confirmado")up.confirmadoEm=Date.now();if(up.status==="atendimento")up.atendente=S.user.nome;
  Data.upd("chamados",b.dataset.id,up);log("Chamado "+b.dataset.id+": "+({confirmado:"confirmou (entrou na fila)",atendimento:"chamou para atendimento",atendido:"concluiu",cancelado:"cancelou"})[up.status]);
  say(up.status==="confirmado"?"Chamado adicionado à fila de atendimento":"Status atualizado")}});
}

/* ---- mural e documentos ---- */
function drawPosts(p){
 if(!$("pl")){
  p.innerHTML=(canAdm()?'<h3>Novo comunicado</h3><label class="f" for="ptx">Mensagem</label><textarea id="ptx" rows="3"></textarea><div class="chk"><input type="checkbox" id="pim"><label for="pim">Marcar como importante</label></div><div id="e"></div><div class="row"><button class="pri" id="addp">Publicar</button></div>':'<p class="hint">Somente Representantes e Gestores publicam comunicados.</p>')+'<div id="pl"></div>';
  if($("addp"))$("addp").onclick=function(){
   if(S.busy)return;var t=$("ptx").value.trim();
   if(t.length<3)return err("Escreva a mensagem do comunicado.","ptx");
   S.busy=true;var b=$("addp");b.disabled=true;b.innerHTML='<span class="spin" aria-hidden="true"></span> Publicando…';
   Data.set("posts",uid(),{texto:t,imp:$("pim").checked,autor:S.user.nome,criado:Date.now()}).then(function(){log("Publicou um comunicado");S.busy=false;b.disabled=false;b.textContent="Publicar";$("ptx").value="";$("pim").checked=false;$("e").innerHTML="";say("Comunicado publicado")}).catch(function(){S.busy=false;b.disabled=false;b.textContent="Publicar";err("Não foi possível publicar.")});
  };
 }
 var L=S.posts.slice().sort(function(a,b){return b.criado-a.criado});
 $("pl").innerHTML='<h3 style="margin-top:1rem">Comunicados ('+L.length+')</h3>'+(L.length?L.map(function(x){return '<div class="post'+(x.imp?' imp':'')+'">'+(x.imp?'<span class="tag x">Importante</span> ':'')+esc(x.texto)+'<br><span class="hint">'+esc(x.autor)+' · '+new Date(x.criado).toLocaleString("pt-BR")+'</span></div>'}).join(""):'<p class="hint">Nenhum comunicado ainda.</p>');
}
function drawDocs(p){
 p.innerHTML='<h3>Central de documentos</h3><p class="hint">Você vê o que seu perfil permite. Itens restritos aparecem bloqueados.</p><ul class="docs">'+DOCS.map(function(d,i){
  var ok=okDoc(d.lv);return '<li><span class="'+(ok?'':'lock')+'">'+(ok?'📄 ':'🔒 ')+esc(d.n)+(ok?'':' (requer perfil '+LVN[d.lv]+')')+'</span>'+(ok?'<button class="sm" data-o="'+i+'" aria-label="Abrir '+esc(d.n)+'">Abrir</button>':'')+'</li>'}).join("")+'</ul><p id="e" class="hint"></p>';
 [].forEach.call(p.querySelectorAll("button"),function(b){b.onclick=function(){log("Abriu o documento "+DOCS[b.dataset.o].n);$("e").textContent="Download simulado: arquivo enviado por conexão criptografada (TLS).";say("Download simulado")}});
}

/* ---- dados em tempo real, login e eventos ---- */
var REL={chamados:["chamados","monitor"],atividades:["atividades","monitor"],posts:["mural"],usuarios:["atividades","monitor"],auditoria:["monitor"]},KEY={chamados:"ch",atividades:"at",posts:"posts",usuarios:"us",auditoria:"au"};
function sub(){
 S.unsubs.forEach(function(u){u&&u()});S.unsubs=[];
 COLL.forEach(function(n){if(n==="auditoria"&&!isTI())return;
  S.unsubs.push(Data.sub(n,function(l){S[KEY[n]]=l;if(S.user&&REL[n].indexOf(S.tab)>=0)draw()}))})}
function bind(){
 if($("l1"))$("l1").onclick=function(){
  var n=$("nm").value.trim();
  if(n.length<2)return err("Digite seu nome.","nm");
  if($("pw").value.length<3)return err("Digite a senha (qualquer valor na demonstração).","pw");
  S.tmp={nome:n,perfil:$("pf").value};S.auth=1;render()};
 if($("l0"))$("l0").onclick=function(){S.auth=0;render()};
 if($("l2"))$("l2").onclick=function(){
  if($("cd").value.trim()!==CODE){log("Falha de MFA (código incorreto)");return err("Código incorreto. Tente novamente.","cd")}
  S.user=S.tmp;S.auth=0;S.tab=isTI()?"monitor":"atividades";
  Data.set("usuarios",nrm(S.user.nome),{nome:S.user.nome,perfil:S.user.perfil,ultimo:Date.now()});log("Login realizado");
  sub();render();say("Login realizado como "+NOME[S.user.perfil])};
 if($("out"))$("out").onclick=function(){log("Logout");S.unsubs.forEach(function(u){u&&u()});S.unsubs=[];S.user=null;S.ch=[];S.at=[];S.us=[];S.au=[];render()};
 [].forEach.call(document.querySelectorAll('[role="tab"]'),function(b,i,all){
  b.onclick=function(){S.tab=b.dataset.t;render();var n=$("t-"+S.tab);if(n)n.focus()};
  b.onkeydown=function(e){var k=e.key,j=k==="ArrowRight"?i+1:k==="ArrowLeft"?i-1:-1;if(j<0)return;e.preventDefault();all[(j+all.length)%all.length].click()}});
}
$("fp").onclick=function(){fs(2)};$("fm").onclick=function(){fs(-2)};
var size=17;function fs(d){size=Math.max(14,Math.min(28,size+d));document.documentElement.style.setProperty("--fs",size+"px")}
$("ct").onclick=function(){var on=document.documentElement.getAttribute("data-contrast")!=="1";
 if(on)document.documentElement.setAttribute("data-contrast","1");else document.documentElement.removeAttribute("data-contrast");this.setAttribute("aria-pressed",on)};
$("lt").onclick=function(){var on=!document.documentElement.classList.contains("lite");document.documentElement.classList.toggle("lite",on);this.setAttribute("aria-pressed",on);say(on?"Modo leve ativado":"Modo leve desativado")};
function net(){$("net").hidden=navigator.onLine}
window.addEventListener("online",net);window.addEventListener("offline",net);net();
render();
/* ===== FIREBASE (Firestore) ===== */
var firebaseConfig={apiKey:"COLE_AQUI",authDomain:"COLE_AQUI",projectId:"COLE_AQUI",storageBucket:"COLE_AQUI",messagingSenderId:"COLE_AQUI",appId:"COLE_AQUI"};
(function(){
 if(firebaseConfig.projectId==="COLE_AQUI"){console.warn("Firebase não configurado: modo local.");return}
 var base="https://www.gstatic.com/firebasejs/10.14.1/";
 Promise.all([import(base+"firebase-app.js"),import(base+"firebase-firestore.js")]).then(function(m){
  var app=m[0].initializeApp(firebaseConfig),fs=m[1].getFirestore(app),F=m[1];
  db={collection:function(n){return{
   doc:function(id){return{
    set:function(d){return F.setDoc(F.doc(fs,n,id),d)},
    update:function(d){return F.updateDoc(F.doc(fs,n,id),d)},
    delete:function(){return F.deleteDoc(F.doc(fs,n,id))}}},
   onSnapshot:function(next,error){return F.onSnapshot(F.collection(fs,n),function(snap){
    next({docs:snap.docs.map(function(d){return{id:d.id,data:function(){return d.data()}}})})},error)}}}};
 }).catch(function(e){console.warn("Firebase indisponível, modo local.",e)});
})();





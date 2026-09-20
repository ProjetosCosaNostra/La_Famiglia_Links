const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const KEY="blackgold-admin-token-v2";
const state={
  token:sessionStorage.getItem(KEY)||"",
  products:[],
  editing:null,
  pendingUploadKey:"",
  originalImageKey:"",
  busy:false
};

async function api(path,opt={}){
  const h=new Headers(opt.headers||{});
  if(state.token)h.set("authorization","Bearer "+state.token);
  if(opt.body&&!(opt.body instanceof FormData))h.set("content-type","application/json");
  const r=await fetch(path,{...opt,headers:h,cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    if(r.status===401)lockPanel("Sessão inválida. Entre novamente.");
    throw Object.assign(new Error(d.message||d.code||("HTTP "+r.status)),{status:r.status,code:d.code,data:d});
  }
  return d;
}

function esc(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function setBusy(value){
  state.busy=Boolean(value);
  $("#save").disabled=state.busy;
  $("#cancel").disabled=state.busy;
  $("#imageFile").disabled=state.busy;
}

function status(message="",kind=""){
  const el=$("#formStatus");
  el.textContent=message;
  el.className="status"+(kind?" "+kind:"");
}

function updateSummary(){
  const total=state.products.length;
  const published=state.products.filter(p=>p.status==="published").length;
  const draft=total-published;
  $("#count").textContent=total+" "+(total===1?"produto":"produtos");
  $("#publishedCount").textContent=published+" "+(published===1?"publicado":"publicados");
  $("#draftCount").textContent=draft+" "+(draft===1?"rascunho":"rascunhos");
}

function render(){
  updateSummary();
  $("#empty").style.display=state.products.length?"none":"grid";
  $("#list").innerHTML=state.products.map(p=>
    '<div class="row" data-row="'+esc(p.id)+'">'+
      '<div><b>'+esc(p.title)+'</b><br><small>'+esc(p.status)+" · "+esc(p.category||"sem categoria")+(p.featured?" · destaque":"")+'</small></div>'+
      '<div class="actions">'+
        '<button type="button" data-edit="'+esc(p.id)+'">Editar</button>'+
        '<button type="button" data-history="'+esc(p.id)+'">Versões</button>'+
        '<button type="button" data-toggle="'+esc(p.id)+'">'+(p.status==="published"?"Despublicar":"Publicar")+'</button>'+
        '<button type="button" data-del="'+esc(p.id)+'">Excluir</button>'+
      '</div>'+
    '</div>'
  ).join("");
  $$("[data-edit]").forEach(b=>b.onclick=()=>edit(b.dataset.edit));
  $$("[data-history]").forEach(b=>b.onclick=()=>openHistory(b.dataset.history));
  $$("[data-toggle]").forEach(b=>b.onclick=()=>toggle(b.dataset.toggle,b));
  $$("[data-del]").forEach(b=>b.onclick=()=>del(b.dataset.del,b));
}

async function load(){
  state.products=(await api("/api/admin/products")).products||[];
  render();
}

function lockPanel(message=""){
  state.token="";
  sessionStorage.removeItem(KEY);
  document.body.classList.remove("unlocked");
  $("#token").value="";
  $("#lockStatus").textContent=message;
}

async function unlock(token){
  state.token=token;
  $("#lockStatus").textContent="Verificando…";
  try{
    await load();
    sessionStorage.setItem(KEY,token);
    document.body.classList.add("unlocked");
    $("#lockStatus").textContent="";
    return true;
  }catch(e){
    state.token="";
    sessionStorage.removeItem(KEY);
    $("#lockStatus").textContent=e.status===401?"Chave incorreta.":e.message;
    return false;
  }
}

$("#unlock").onsubmit=e=>{
  e.preventDefault();
  const token=$("#token").value.trim();
  if(token)unlock(token);
};

$("#logout").onclick=()=>lockPanel();

function showPreview(url,label=""){
  const box=$("#imagePreview"),img=box.querySelector("img"),span=box.querySelector("span");
  if(!url){
    box.classList.remove("show");
    img.removeAttribute("src");
    span.textContent="";
    return;
  }
  img.src=url;
  span.textContent=label||"Imagem selecionada";
  box.classList.add("show");
}

function openForm(product=null){
  state.editing=product;
  state.pendingUploadKey="";
  state.originalImageKey=product?.imageKey||"";
  const f=$("#form");
  f.reset();
  f.elements.id.value=product?.id||"";
  f.elements.title.value=product?.title||"";
  f.elements.brand.value=product?.brand||"";
  f.elements.category.value=product?.category||"";
  f.elements.currency.value=product?.currency||"BRL";
  f.elements.price.value=product?.price??"";
  f.elements.order.value=product?.order??0;
  f.elements.description.value=product?.description||"";
  f.elements.destinationUrl.value=product?.destinationUrl||"";
  f.elements.imageKey.value=product?.imageKey||"";
  f.elements.imageUrl.value=product?.imageUrl||"";
  f.elements.status.value=product?.status||"draft";
  f.elements.featured.checked=!!product?.featured;
  $("#formTitle").textContent=product?"Editar produto":"Novo produto";
  status();
  showPreview(product?.image||product?.imageUrl||"",product?"Imagem atual":"");
  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden","false");
  setTimeout(()=>f.elements.title.focus(),0);
}

function edit(id){
  const product=state.products.find(p=>p.id===id);
  if(product)openForm(product);
}

function formatDate(value){
  try{return new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}
  catch{return value||""}
}

async function openHistory(productId){
  const product=state.products.find(p=>p.id===productId);
  if(!product)return;
  $("#historyTitle").textContent="Versões · "+product.title;
  $("#historyList").innerHTML="<p>Carregando…</p>";
  $("#historyModal").classList.add("open");
  $("#historyModal").setAttribute("aria-hidden","false");
  try{
    const d=await api("/api/admin/revisions?productId="+encodeURIComponent(productId)+"&limit=30");
    if(!d.revisions?.length){
      $("#historyList").innerHTML="<p>Nenhuma versão anterior registrada.</p>";
      return;
    }
    $("#historyList").innerHTML=d.revisions.map(r=>
      '<div class="history-item">'+
        '<div><b>'+esc(r.snapshot?.title||"Produto")+'</b><br><small>'+esc(r.snapshot?.status||"draft")+" · "+esc(r.reason)+" · "+esc(formatDate(r.createdAt))+'</small></div>'+
        '<button type="button" data-rollback="'+esc(r.id)+'" data-revision-status="'+esc(r.snapshot?.status||"draft")+'">Restaurar</button>'+
      '</div>'
    ).join("");
    $$("[data-rollback]").forEach(b=>b.onclick=()=>rollbackRevision(b.dataset.rollback,b));
  }catch(e){
    $("#historyList").innerHTML='<p class="status error">'+esc(e.message)+'</p>';
  }
}

async function rollbackRevision(revisionId,button){
  if(!confirm("Restaurar esta versão anterior? O estado atual ficará salvo no histórico."))return;
  button.disabled=true;
  try{
    const d=await api("/api/admin/revisions",{
      method:"POST",
      body:JSON.stringify({revisionId})
    });
    await load();
    $("#historyModal").classList.remove("open");
    $("#historyModal").setAttribute("aria-hidden","true");
    if(d.warning)alert(d.warning);
  }catch(e){
    alert(e.message);
  }finally{
    button.disabled=false;
  }
}

$("#historyClose").onclick=()=>{
  $("#historyModal").classList.remove("open");
  $("#historyModal").setAttribute("aria-hidden","true");
};

async function openTrash(){
  $("#trashList").innerHTML="<p>Carregando…</p>";
  $("#trashModal").classList.add("open");
  $("#trashModal").setAttribute("aria-hidden","false");
  try{
    const d=await api("/api/admin/trash?limit=50");
    if(!d.items?.length){
      $("#trashList").innerHTML="<p>A lixeira está vazia.</p>";
      return;
    }
    $("#trashList").innerHTML=d.items.map(item=>
      '<div class="history-item">'+
        '<div><b>'+esc(item.title||"Produto")+'</b><br><small>'+
          esc(item.status||"draft")+" · "+esc(item.category||"sem categoria")+" · "+esc(formatDate(item.deletedAt))+
          (item.imageArchived?" · imagem arquivada":"")+
        '</small></div>'+
        '<button type="button" data-trash-restore="'+esc(item.revisionId)+'">Restaurar</button>'+
      '</div>'
    ).join("");
    $$("[data-trash-restore]").forEach(b=>b.onclick=()=>restoreTrashRevision(b.dataset.trashRestore,b));
  }catch(e){
    $("#trashList").innerHTML='<p class="status error">'+esc(e.message)+'</p>';
  }
}

async function restoreTrashRevision(revisionId,button){
  if(!confirm("Restaurar este produto excluído?"))return;
  button.disabled=true;
  try{
    const d=await api("/api/admin/revisions",{
      method:"POST",
      body:JSON.stringify({revisionId})
    });
    await load();
    await openTrash();
    if(d.warning)alert(d.warning);
  }catch(e){
    alert(e.message);
  }finally{
    button.disabled=false;
  }
}

$("#trash").onclick=()=>openTrash();
$("#trashClose").onclick=()=>{
  $("#trashModal").classList.remove("open");
  $("#trashModal").setAttribute("aria-hidden","true");
};

async function cleanupPendingUpload(){
  if(!state.pendingUploadKey)return;
  const key=state.pendingUploadKey;
  state.pendingUploadKey="";
  try{
    await api("/api/admin/upload?key="+encodeURIComponent(key),{method:"DELETE"});
  }catch(e){
    if(e.code!=="media_in_use")console.warn("pending upload cleanup failed",e.message);
  }
}

async function closeForm(){
  if(state.busy)return;
  await cleanupPendingUpload();
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden","true");
  state.editing=null;
  state.originalImageKey="";
  status();
}

$("#new").onclick=()=>openForm();
$("#cancel").onclick=()=>closeForm();

async function toggle(id,button){
  const product=state.products.find(x=>x.id===id);
  if(!product)return;
  button.disabled=true;
  try{
    await api("/api/admin/products",{
      method:"PATCH",
      body:JSON.stringify({
        id,
        expectedUpdatedAt:product.updatedAt,
        status:product.status==="published"?"draft":"published"
      })
    });
    await load();
  }catch(e){
    if(e.code==="stale_product"||e.code==="expected_updated_at_required"){
      await load().catch(()=>{});
      alert("O produto mudou em outra sessão. A lista foi recarregada; revise antes de tentar novamente.");
    }else{
      alert(e.message);
    }
  }finally{
    button.disabled=false;
  }
}

async function del(id,button){
  if(!confirm("Excluir este produto e movê-lo para a lixeira recuperável?"))return;
  button.disabled=true;
  try{
    await api("/api/admin/products?id="+encodeURIComponent(id),{method:"DELETE"});
    await load();
  }catch(e){
    alert(e.message);
  }finally{
    button.disabled=false;
  }
}

$("#imageFile").onchange=async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  setBusy(true);
  status("Enviando imagem…");
  try{
    await cleanupPendingUpload();
    const form=new FormData();
    form.append("file",file);
    const d=await api("/api/admin/upload",{method:"POST",body:form});
    state.pendingUploadKey=d.key;
    $("#form").elements.imageKey.value=d.key;
    $("#form").elements.imageUrl.value="";
    showPreview(d.url,file.name);
    status("Imagem enviada. Salve o produto para vinculá-la.","ok");
  }catch(err){
    e.target.value="";
    status(err.message,"error");
  }finally{
    setBusy(false);
  }
};

$("#form").elements.imageUrl.addEventListener("input",async e=>{
  const value=e.target.value.trim();
  if(!value)return;
  await cleanupPendingUpload();
  $("#form").elements.imageKey.value="";
  showPreview(value,"Imagem por URL");
});

$("#form").onsubmit=async e=>{
  e.preventDefault();
  const f=e.currentTarget;
  if(state.busy)return;
  setBusy(true);
  status("Salvando…");
  const payload={
    id:state.editing?.id||undefined,
    expectedUpdatedAt:state.editing?.updatedAt||undefined,
    title:f.elements.title.value,
    brand:f.elements.brand.value,
    category:f.elements.category.value,
    currency:f.elements.currency.value,
    price:f.elements.price.value,
    order:Number(f.elements.order.value||0),
    description:f.elements.description.value,
    destinationUrl:f.elements.destinationUrl.value,
    imageKey:f.elements.imageKey.value,
    imageUrl:f.elements.imageUrl.value,
    status:f.elements.status.value,
    featured:f.elements.featured.checked
  };
  const method=state.editing?"PATCH":"POST";
  if(!state.editing)delete payload.id;

  try{
    await api("/api/admin/products",{method,body:JSON.stringify(payload)});
    state.pendingUploadKey="";
    status("Produto salvo.","ok");
    $("#modal").classList.remove("open");
    $("#modal").setAttribute("aria-hidden","true");
    state.editing=null;
    state.originalImageKey="";
    await load();
  }catch(err){
    if(err.code==="stale_product"||err.code==="expected_updated_at_required"){
      await load().catch(()=>{});
      status("Este produto foi alterado em outra sessão. A lista foi recarregada; feche e reabra a edição antes de salvar.","error");
    }else{
      status(err.message,"error");
    }
  }finally{
    setBusy(false);
  }
};

document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  if($("#trashModal").classList.contains("open")){
    $("#trashModal").classList.remove("open");
    $("#trashModal").setAttribute("aria-hidden","true");
    return;
  }
  if($("#historyModal").classList.contains("open")){
    $("#historyModal").classList.remove("open");
    $("#historyModal").setAttribute("aria-hidden","true");
    return;
  }
  if($("#modal").classList.contains("open")&&!state.busy)closeForm();
});

window.addEventListener("beforeunload",()=>{
  if(state.pendingUploadKey&&state.token){
    fetch("/api/admin/upload?key="+encodeURIComponent(state.pendingUploadKey),{
      method:"DELETE",
      headers:{authorization:"Bearer "+state.token},
      keepalive:true
    }).catch(()=>{});
  }
});

if(state.token)unlock(state.token);

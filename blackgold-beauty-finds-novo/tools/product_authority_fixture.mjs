import fs from "node:fs/promises";
import path from "node:path";

const base=process.env.BLACKGOLD_BASE||"http://127.0.0.1:8788";
const token=process.env.BLACKGOLD_ADMIN_TOKEN||"";
const mode=process.argv[2]||"create";
if(!token)throw new Error("BLACKGOLD_ADMIN_TOKEN missing");

const auth={authorization:"Bearer "+token};
const root=path.resolve("..");
const assetDir=path.join(root,"cloudflare-beauty-finds","approved-home");
const stateFile=path.resolve(".visual-gate","authority-fixture.json");
const PREFIX="__BLACKGOLD_AUTHORITY_FIXTURE__";

const FEATURED=[
  {title:"Miss Dior Eau de Parfum",brand:"Dior",description:"Uma fragrância icônica para mulheres que deixam sua marca.",price:"649.90",file:"miss-dior.webp",category:"Beleza",featured:true,order:1},
  {title:"Bolsa LouLou Small",brand:"Saint Laurent",description:"Elegância atemporal em cada detalhe.",price:"14890.00",file:"ysl-loulou.webp",category:"Acessórios",featured:true,order:2},
  {title:"Sandália Gianvito Rossi",brand:"Gianvito Rossi",description:"Sofisticação que eleva qualquer look.",price:"4290.00",file:"gianvito-rossi.webp",category:"Moda",featured:true,order:3}
];
const SHOWCASE=[
  {title:"Chanel Coco Mademoiselle",price:"589.90",file:"chanel-coco.webp",category:"Beleza",order:4},
  {title:"Batom Rouge Dior",price:"349.90",file:"rouge-dior.webp",category:"Beleza",order:5},
  {title:"Creme Facial Lancôme",price:"529.90",file:"lancome-creme.webp",category:"Autocuidado",order:6},
  {title:"Óculos Saint Laurent",price:"2890.00",file:"saint-laurent-oculos.webp",category:"Acessórios",order:7},
  {title:"Relógio Michael Kors",price:"1890.00",file:"michael-kors-relogio.webp",category:"Acessórios",order:8},
  {title:"Brinco Swarovski",price:"1290.00",file:"swarovski-brinco.webp",category:"Acessórios",order:9},
  {title:"Scarpin Jimmy Choo",price:"4990.00",file:"jimmy-choo-scarpin.webp",category:"Moda",order:10},
  {title:"Bolsa Dior Saddle",price:"17890.00",file:"dior-saddle.webp",category:"Acessórios",order:11}
].map(x=>({...x,brand:"",description:"",featured:false}));

async function call(url,opt={}){
  const headers=new Headers(opt.headers||{});
  headers.set("authorization","Bearer "+token);
  if(opt.body&&!(opt.body instanceof FormData)&&!headers.has("content-type"))headers.set("content-type","application/json");
  const r=await fetch(base+url,{...opt,headers,cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(url+" "+r.status+" "+JSON.stringify(d));
  return d;
}
async function cleanup(){
  const d=await call("/api/admin/products");
  for(const p of d.products||[]){
    if(String(p.brand||"").startsWith(PREFIX)){
      await call("/api/admin/products?id="+encodeURIComponent(p.id),{method:"DELETE"});
    }
  }
}
async function upload(file){
  const bytes=await fs.readFile(path.join(assetDir,file));
  const type=file.endsWith(".webp")?"image/webp":"image/png";
  const form=new FormData();
  form.append("file",new Blob([bytes],{type}),file);
  return call("/api/admin/upload",{method:"POST",body:form});
}

if(mode==="create"){
  await cleanup();
  const created=[];
  for(const item of [...FEATURED,...SHOWCASE]){
    const media=await upload(item.file);
    const p=await call("/api/admin/products",{
      method:"POST",
      body:JSON.stringify({
        title:item.title,
        brand:PREFIX+(item.brand?":"+item.brand:""),
        category:item.category,
        description:item.description,
        currency:"BRL",
        price:item.price,
        imageKey:media.key,
        destinationUrl:"https://example.com/authority-fixture",
        status:"published",
        featured:item.featured,
        order:item.order
      })
    });
    created.push({id:p.product.id,imageKey:media.key,title:item.title});
  }
  await fs.mkdir(path.dirname(stateFile),{recursive:true});
  await fs.writeFile(stateFile,JSON.stringify({created},null,2));
  const pub=await (await fetch(base+"/api/products?authority-fixture=1",{cache:"no-store"})).json();
  if(pub.total!==11)throw new Error("authority fixture expected 11 public products, got "+pub.total);
  console.log("BLACKGOLD_AUTHORITY_PRODUCT_FIXTURE=READY");
}else if(mode==="delete"){
  await cleanup();
  const pub=await (await fetch(base+"/api/products?authority-fixture-clean=1",{cache:"no-store"})).json();
  if(pub.total!==0)throw new Error("authority fixture cleanup expected zero products");
  console.log("BLACKGOLD_AUTHORITY_PRODUCT_FIXTURE=CLEAN");
}else{
  throw new Error("mode must be create or delete");
}

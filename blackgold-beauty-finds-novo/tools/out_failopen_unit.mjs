import {onRequestGet} from "../functions/api/out.js";

const product={
  id:"product-test",
  title:"Fail-open Product",
  destination_url:"https://example.com/fail-open",
  status:"published"
};

const BG_DB={
  prepare(sql){
    if(sql.includes("SELECT id,title,destination_url,status FROM products")){
      return {
        bind(){
          return {first:async()=>product};
        }
      };
    }
    if(sql.includes("INSERT INTO outbound_clicks")){
      return {
        bind(){
          return {run:async()=>{throw new Error("simulated click-ledger outage")}};
        }
      };
    }
    throw new Error("unexpected SQL "+sql);
  }
};

const request=new Request("https://store.test/api/out?id=product-test&placement=catalog",{
  headers:{"user-agent":"Mozilla/5.0"}
});
const response=await onRequestGet({request,env:{BG_DB}});

if(response.status!==302)throw new Error("fail-open redirect status "+response.status);
if(response.headers.get("location")!==product.destination_url)throw new Error("fail-open location mismatch");
if(response.headers.get("x-blackgold-click-tracked")!=="0")throw new Error("failed ledger must report untracked");

console.log(JSON.stringify({
  status:response.status,
  location:response.headers.get("location"),
  tracked:response.headers.get("x-blackgold-click-tracked")
},null,2));
console.log("BLACKGOLD_AFFILIATE_FAIL_OPEN=PASS");

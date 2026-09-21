import {onRequestGet} from "../functions/api/out.js";

const product={
  id:"product-test",
  title:"Fail-open Product",
  destination_url:"https://example.com/fail-open",
  status:"published"
};

let rejectLedger;
const delayedFailure=new Promise((_,reject)=>{rejectLedger=reject});
const BG_DB={
  prepare(sql){
    if(sql.includes("SELECT id,title,destination_url,status FROM products")){
      return {bind(){return {first:async()=>product}}};
    }
    if(sql.includes("INSERT INTO outbound_clicks")){
      return {bind(){return {run:()=>delayedFailure}}};
    }
    throw new Error("unexpected SQL "+sql);
  }
};

let scheduled;
const request=new Request("https://store.test/api/out?id=product-test&placement=catalog",{
  headers:{"user-agent":"Mozilla/5.0"}
});
const response=await Promise.race([
  onRequestGet({
    request,
    env:{BG_DB},
    waitUntil(promise){scheduled=promise}
  }),
  new Promise((_,reject)=>setTimeout(()=>reject(new Error("redirect waited for click ledger")),250))
]);

if(response.status!==302)throw new Error("fail-open redirect status "+response.status);
if(response.headers.get("location")!==product.destination_url)throw new Error("fail-open location mismatch");
if(response.headers.get("x-blackgold-click-tracking")!=="queued")throw new Error("ledger must be queued without blocking redirect");
if(!scheduled)throw new Error("waitUntil did not receive click-ledger task");

rejectLedger(new Error("simulated click-ledger outage"));
await scheduled;

console.log(JSON.stringify({
  status:response.status,
  location:response.headers.get("location"),
  tracking:response.headers.get("x-blackgold-click-tracking"),
  nonBlocking:true,
  asyncFailureDidNotBreakRedirect:true
},null,2));
console.log("BLACKGOLD_AFFILIATE_FAIL_OPEN=PASS");

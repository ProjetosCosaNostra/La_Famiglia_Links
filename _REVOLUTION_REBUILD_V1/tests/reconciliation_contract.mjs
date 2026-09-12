import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/admin/reconciliation.js';

class FakeDB{
  constructor(){
    this.products=new Map([
      ['bg-us-0007',{id:'bg-us-0007',title_pt:'Belle Angel',marketplace_item_id:null,marketplace_catalog_product_id:null,marketplace_identity_status:'pending'}],
      ['bg-us-0006',{id:'bg-us-0006',title_pt:'Ruby Rose',marketplace_item_id:null,marketplace_catalog_product_id:null,marketplace_identity_status:'pending'}],
      ['bg-us-0001',{id:'bg-us-0001',title_pt:'Lily',marketplace_item_id:null,marketplace_catalog_product_id:null,marketplace_identity_status:'pending'}]
    ]);
    this.evidence=new Map([
      ['prob',{id:'prob',product_id:'bg-us-0007',candidate_item_id:null,candidate_catalog_product_id:'MLB72180954',classification:'probable',review_status:'pending_review',confidence:.95}],
      ['conf',{id:'conf',product_id:'bg-us-0006',candidate_item_id:null,candidate_catalog_product_id:'MLB76734925',classification:'conflict',review_status:'pending_review',confidence:.9628}],
      ['none',{id:'none',product_id:'bg-us-0001',candidate_item_id:null,candidate_catalog_product_id:null,classification:'unresolved',review_status:'pending_review',confidence:0}]
    ]);
  }
  prepare(sql){
    const db=this;
    const stmt={sql,args:[],bind(...args){this.args=args;return this},async first(){
      if(sql.includes('FROM marketplace_reconciliation r JOIN products p')&&sql.includes('WHERE r.id=?')){
        const e=db.evidence.get(this.args[0]);return e?{...e,...db.products.get(e.product_id)}:null;
      }
      throw new Error(`Unhandled first: ${sql}`);
    }};
    return stmt;
  }
  async batch(stmts){
    for(const s of stmts){const {sql,args:a}=s;
      if(sql.startsWith("UPDATE marketplace_reconciliation SET review_status='accepted'"))this.evidence.get(a[2]).review_status='accepted';
      else if(sql.startsWith("UPDATE marketplace_reconciliation SET review_status='rejected'"))this.evidence.get(a[2]).review_status='rejected';
      else if(sql.startsWith("UPDATE products SET")){const p=this.products.get(a[5]);Object.assign(p,{marketplace_item_id:a[0]??p.marketplace_item_id,marketplace_catalog_product_id:a[1]??p.marketplace_catalog_product_id,marketplace_identity_status:a[2],marketplace_last_reason:a[3]});}
    }
    return [];
  }
}

const req=(body,token='t')=>new Request('https://local/api/admin/reconciliation',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token},body:JSON.stringify(body)});
const env={BG_ADMIN_TOKEN:'t',DB:new FakeDB()};
let r=await onRequestPost({request:req({id:'conf',action:'accept'}),env});assert.equal(r.status,409);assert.equal((await r.json()).error,'candidate_not_accept_ready');
r=await onRequestPost({request:req({id:'prob',action:'accept'}),env});assert.equal(r.status,200);let b=await r.json();assert.equal(b.identity_status,'catalog_only');assert.equal(env.DB.products.get('bg-us-0007').marketplace_catalog_product_id,'MLB72180954');
r=await onRequestPost({request:req({id:'none',action:'reject'}),env});assert.equal(r.status,200);assert.equal(env.DB.evidence.get('none').review_status,'rejected');
r=await onRequestPost({request:req({id:'prob',action:'accept'},'bad'),env});assert.equal(r.status,401);
console.log('RECONCILIATION_CONTRACT=PASS');
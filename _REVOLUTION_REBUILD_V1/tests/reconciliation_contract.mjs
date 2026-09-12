import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/admin/reconciliation.js';

class FakeDB{
  constructor(){
    this.products=new Map([
      ['bg-us-0007',{id:'bg-us-0007',title_pt:'Belle Angel',marketplace_catalog_product_id:null,marketplace_identity_status:'pending',marketplace_last_checked_at:null,marketplace_last_reason:null}],
      ['bg-us-0006',{id:'bg-us-0006',title_pt:'Ruby Rose',marketplace_catalog_product_id:null,marketplace_identity_status:'pending',marketplace_last_checked_at:null,marketplace_last_reason:null}],
      ['bg-us-0001',{id:'bg-us-0001',title_pt:'Lily',marketplace_catalog_product_id:null,marketplace_identity_status:'pending',marketplace_last_checked_at:null,marketplace_last_reason:null}]
    ]);
    this.links=[{product_id:'bg-us-0007',slot:1,marketplace_item_id:'MLB99999999',marketplace_catalog_product_id:'MLBOLD',marketplace_identity_status:'verified_exact',health_status:'verified',variant_match:1,fail_count:0,last_http_status:200,last_title:'Belle'}];
    this.evidence=new Map([
      ['prob',{id:'prob',product_id:'bg-us-0007',candidate_item_id:null,candidate_catalog_product_id:'MLB72180954',classification:'probable',review_status:'pending_review',confidence:.95}],
      ['conf',{id:'conf',product_id:'bg-us-0006',candidate_item_id:null,candidate_catalog_product_id:'MLB76734925',classification:'conflict',review_status:'pending_review',confidence:.9628}],
      ['listing',{id:'listing',product_id:'bg-us-0001',candidate_item_id:'MLB1234567890',candidate_catalog_product_id:null,classification:'probable',review_status:'pending_review',confidence:.8}],
      ['none',{id:'none',product_id:'bg-us-0001',candidate_item_id:null,candidate_catalog_product_id:null,classification:'unresolved',review_status:'pending_review',confidence:0}]
    ]);
  }
  prepare(sql){const db=this;return {sql,args:[],bind(...args){this.args=args;return this},async first(){if(sql.includes('FROM marketplace_reconciliation r JOIN products p')&&sql.includes('WHERE r.id=?')){const e=db.evidence.get(this.args[0]);return e?{...e,...db.products.get(e.product_id)}:null;}throw new Error(`Unhandled first: ${sql}`);}};}
  async batch(stmts){for(const s of stmts){const {sql,args:a}=s;
    if(sql.startsWith("UPDATE marketplace_reconciliation SET review_status='accepted'"))this.evidence.get(a[2]).review_status='accepted';
    else if(sql.startsWith("UPDATE marketplace_reconciliation SET review_status='rejected'"))this.evidence.get(a[2]).review_status='rejected';
    else if(sql.startsWith('UPDATE products SET')){const p=this.products.get(a[5]);Object.assign(p,{marketplace_catalog_product_id:a[0],marketplace_identity_status:a[1],marketplace_last_checked_at:a[2],marketplace_last_reason:a[3]});}
    else if(sql.startsWith('UPDATE product_links SET marketplace_catalog_product_id=NULL'))for(const l of this.links.filter(x=>x.product_id===a[0]))Object.assign(l,{marketplace_catalog_product_id:null,marketplace_identity_status:l.marketplace_item_id?'declared':'pending',health_status:'unknown',variant_match:0,fail_count:0,last_http_status:null,last_title:null});
  }return [];}
}

const req=(body,token='t')=>new Request('https://local/api/admin/reconciliation',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token},body:JSON.stringify(body)});
const env={BG_ADMIN_TOKEN:'t',DB:new FakeDB()};
let r=await onRequestPost({request:req({id:'conf',action:'accept'}),env});assert.equal(r.status,409);assert.equal((await r.json()).error,'candidate_not_accept_ready');
r=await onRequestPost({request:req({id:'listing',action:'accept'}),env});assert.equal(r.status,409);assert.equal((await r.json()).error,'listing_identity_requires_link_slot');
r=await onRequestPost({request:req({id:'prob',action:'accept'}),env});assert.equal(r.status,200);let b=await r.json();assert.equal(b.identity_status,'catalog_only');assert.equal(b.catalog_changed,true);assert.equal(env.DB.products.get('bg-us-0007').marketplace_catalog_product_id,'MLB72180954');assert.equal(env.DB.links[0].health_status,'unknown');assert.equal(env.DB.links[0].variant_match,0);assert.equal(env.DB.links[0].marketplace_identity_status,'declared');
r=await onRequestPost({request:req({id:'none',action:'reject'}),env});assert.equal(r.status,200);assert.equal(env.DB.evidence.get('none').review_status,'rejected');
r=await onRequestPost({request:req({id:'prob',action:'accept'},'bad'),env});assert.equal(r.status,401);
console.log('RECONCILIATION_CONTRACT=PASS');
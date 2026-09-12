import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/admin/link-identity.js';

class FakeDB{
  constructor(){this.link={id:7,product_id:'p1',slot:1,marketplace_item_id:null,marketplace_variation_id:null,health_status:'verified',variant_match:1,fail_count:0};this.audit=[];}
  prepare(sql){const db=this;return {sql,args:[],bind(...args){this.args=args;return this},async first(){
    if(sql.includes('FROM product_links l JOIN products p'))return {...db.link,canonical_catalog_product_id:'MLB11111111'};
    throw new Error(`Unhandled first: ${sql}`);
  }};}
  async batch(stmts){for(const s of stmts){const {sql,args:a}=s;
    if(sql.startsWith('UPDATE product_links SET marketplace_item_id='))Object.assign(this.link,{marketplace_item_id:a[0],marketplace_variation_id:a[1],marketplace_catalog_product_id:null,marketplace_identity_status:a[2],marketplace_seller_id:null,marketplace_seller_level:null,marketplace_last_checked_at:null,marketplace_last_reason:'listing_identity_changed_pending_verification',health_status:'unknown',variant_match:0,fail_count:0});
    else if(sql.startsWith('INSERT INTO admin_audit'))this.audit.push(a);
  }return [];}
}
const request=(body,token='t')=>new Request('https://local/api/admin/link-identity',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token},body:JSON.stringify(body)});
const env={BG_ADMIN_TOKEN:'t',DB:new FakeDB()};
let r=await onRequestPost({request:request({product_id:'p1',slot:1,marketplace_item_id:'MLB1234567890',marketplace_variation_id:'9988'}),env});let b=await r.json();assert.equal(r.status,200);assert.equal(b.marketplace_identity_status,'declared');assert.equal(env.DB.link.health_status,'unknown');assert.equal(env.DB.link.variant_match,0);assert.equal(env.DB.link.marketplace_catalog_product_id,null);
r=await onRequestPost({request:request({product_id:'p1',slot:1,marketplace_item_id:'ABC123'}),env});assert.equal(r.status,400);assert.equal((await r.json()).error,'invalid_marketplace_item_id');
r=await onRequestPost({request:request({product_id:'p1',slot:6,marketplace_item_id:'MLB1234567890'}),env});assert.equal(r.status,400);
r=await onRequestPost({request:request({product_id:'p1',slot:1,marketplace_item_id:'MLB1234567890',marketplace_variation_id:'9988'}),env});assert.equal((await r.json()).unchanged,true);
console.log('LINK_IDENTITY_CONTRACT=PASS');
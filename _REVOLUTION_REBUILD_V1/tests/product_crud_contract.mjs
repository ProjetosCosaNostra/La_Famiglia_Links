import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/admin/products.js';
import {onRequestPut,onRequestDelete} from '../functions/api/admin/products/[id].js';

class FakeDB{
  constructor(){this.products=new Map();this.links=[];this.audits=[];this.nextLinkId=1;}
  prepare(sql){
    const db=this;
    return {sql,args:[],bind(...args){this.args=args;return this},async first(){
      if(sql.includes('SELECT * FROM products WHERE id=?'))return db.products.get(this.args[0])||null;
      throw new Error('Unhandled first '+sql);
    },async all(){
      if(sql.includes('SELECT * FROM product_links WHERE product_id=?'))return {results:db.links.filter(x=>x.product_id===this.args[0]).sort((a,b)=>a.slot-b.slot)};
      if(sql.includes('SELECT id FROM products ORDER BY updated_at DESC'))return {results:[...db.products.values()].map(x=>({id:x.id}))};
      throw new Error('Unhandled all '+sql);
    }};
  }
  async batch(stmts){for(const s of stmts)this.apply(s.sql,s.args);return [];}
  apply(sql,a){
    if(sql.startsWith('INSERT INTO products(')){
      const keys=['id','slug','title_pt','title_en','title_es','brand','category','description_pt','status','market','affiliate_ready','featured','image_path','image_status','created_at','updated_at','marketplace_site_id','marketplace_catalog_product_id','marketplace_identity_status','marketplace_expected_attributes_json','marketplace_last_reason'];
      this.products.set(a[0],Object.fromEntries(keys.map((k,i)=>[k,a[i]])));return;
    }
    if(sql.startsWith('INSERT INTO product_links(')){
      const p=a[0],slot=a[1],url=a[2],priority=a[3],fp=a[4],item=a[5],variation=a[6],identity=a[7],reason=a[8];
      this.links.push({id:this.nextLinkId++,product_id:p,slot,affiliate_url:url,priority,health_status:'unknown',fail_count:0,variant_fingerprint:fp,is_active:1,variant_match:0,marketplace_item_id:item,marketplace_variation_id:variation,marketplace_catalog_product_id:null,marketplace_identity_status:identity,marketplace_seller_id:null,marketplace_seller_level:null,marketplace_last_checked_at:null,marketplace_last_reason:reason,last_checked_at:null,last_ok_at:null,last_http_status:null,last_reason:null,last_final_url:null,last_title:null});return;
    }
    if(sql.startsWith('UPDATE products SET slug=')){
      const id=a[24],p=this.products.get(id);const keys=['slug','title_pt','title_en','title_es','brand','category','description_pt','status','affiliate_ready','featured','image_path','image_status','updated_at','marketplace_catalog_product_id','marketplace_expected_attributes_json','marketplace_identity_status','marketplace_title','marketplace_permalink','marketplace_status','marketplace_seller_id','marketplace_seller_level','marketplace_last_checked_at','marketplace_last_reason'];keys.forEach((k,i)=>p[k]=a[i]);p.market='BR';p.marketplace_site_id='MLB';return;
    }
    if(sql.startsWith("UPDATE product_links SET marketplace_catalog_product_id=NULL")){
      for(const l of this.links.filter(x=>x.product_id===a[0]))Object.assign(l,{marketplace_catalog_product_id:null,marketplace_identity_status:l.marketplace_item_id?'declared':'pending',marketplace_seller_id:null,marketplace_seller_level:null,marketplace_last_checked_at:null,marketplace_last_reason:'canonical_catalog_changed_pending_reverification',health_status:'unknown',variant_match:0,fail_count:0,last_checked_at:null,last_ok_at:null,last_http_status:null,last_reason:null,last_final_url:null,last_title:null});return;
    }
    if(sql.startsWith('UPDATE product_links SET priority=')){const l=this.links.find(x=>x.product_id===a[1]&&x.slot===a[2]);l.priority=a[0];l.is_active=1;return;}
    if(sql.startsWith('UPDATE product_links SET affiliate_url=')){
      const l=this.links.find(x=>x.product_id===a[7]&&x.slot===a[8]);Object.assign(l,{affiliate_url:a[0],priority:a[1],variant_fingerprint:a[2],marketplace_item_id:a[3],marketplace_variation_id:a[4],marketplace_catalog_product_id:null,marketplace_identity_status:a[5],marketplace_seller_id:null,marketplace_seller_level:null,marketplace_last_checked_at:null,marketplace_last_reason:a[6],health_status:'unknown',variant_match:0,fail_count:0,last_checked_at:null,last_ok_at:null,last_http_status:null,last_reason:null,last_final_url:null,last_title:null,is_active:1});return;
    }
    if(sql.startsWith('UPDATE product_links SET is_active=0 WHERE product_id=? AND slot=?')){const l=this.links.find(x=>x.product_id===a[0]&&x.slot===a[1]);if(l)l.is_active=0;return;}
    if(sql.startsWith("UPDATE products SET status='archived'")){const p=this.products.get(a[1]);p.status='archived';p.affiliate_ready=0;p.updated_at=a[0];return;}
    if(sql.startsWith('UPDATE product_links SET is_active=0 WHERE product_id=?')){for(const l of this.links.filter(x=>x.product_id===a[0]))l.is_active=0;return;}
    if(sql.includes('INSERT INTO admin_audit')){this.audits.push({sql,args:a});return;}
    throw new Error('Unhandled batch SQL '+sql);
  }
}

const env={BG_ADMIN_TOKEN:'t',DB:new FakeDB()};
const request=(method,body,token='t')=>new Request('https://local/api/admin/products',{method,headers:{'content-type':'application/json','x-admin-token':token},body:body?JSON.stringify(body):undefined});
const base={id:'p1',slug:'produto-teste',title_pt:'Produto Teste',category:'Beauty',status:'active',affiliate_ready:true,image_status:'approved',marketplace_catalog_product_id:'MLB72180954',marketplace_expected_attributes_json:'{"COLOR":"Nude"}',links:[{slot:1,url:'https://meli.la/abc1234',fingerprint:'nude-28',marketplace_item_id:'MLB99999999',marketplace_variation_id:'123'}]};
let r=await onRequestPost({request:request('POST',base),env});assert.equal(r.status,201);let p=env.DB.products.get('p1'),l=env.DB.links[0];assert.equal(p.marketplace_identity_status,'catalog_only');assert.equal(p.marketplace_catalog_product_id,'MLB72180954');assert.equal(l.marketplace_identity_status,'declared');assert.equal(l.health_status,'unknown');
Object.assign(l,{health_status:'verified',variant_match:1,marketplace_catalog_product_id:'MLB72180954',marketplace_identity_status:'verified_exact',fail_count:0,last_http_status:200,last_title:'Produto Teste'});Object.assign(p,{marketplace_identity_status:'catalog_verified',marketplace_title:'Produto Teste oficial',marketplace_last_reason:'ok'});
const cosmetic={...base,title_pt:'Produto Teste Editado'};r=await onRequestPut({request:request('PUT',cosmetic),env,params:{id:'p1'}});assert.equal(r.status,200);l=env.DB.links[0];p=env.DB.products.get('p1');assert.equal(l.health_status,'verified');assert.equal(l.marketplace_identity_status,'verified_exact');assert.equal(p.marketplace_identity_status,'catalog_verified');
const changedListing={...cosmetic,links:[{...cosmetic.links[0],marketplace_variation_id:'456'}]};r=await onRequestPut({request:request('PUT',changedListing),env,params:{id:'p1'}});assert.equal(r.status,200);l=env.DB.links[0];assert.equal(l.health_status,'unknown');assert.equal(l.variant_match,0);assert.equal(l.marketplace_identity_status,'declared');assert.equal(l.marketplace_catalog_product_id,null);
Object.assign(l,{health_status:'verified',variant_match:1,marketplace_identity_status:'verified_exact',marketplace_catalog_product_id:'MLB72180954'});Object.assign(p,{marketplace_identity_status:'catalog_verified'});const changedCatalog={...changedListing,marketplace_catalog_product_id:'MLB70194949'};r=await onRequestPut({request:request('PUT',changedCatalog),env,params:{id:'p1'}});assert.equal(r.status,200);assert.equal(env.DB.products.get('p1').marketplace_identity_status,'catalog_only');assert.equal(env.DB.links[0].health_status,'unknown');assert.equal(env.DB.links[0].marketplace_identity_status,'declared');
const removed={...changedCatalog,links:[]};r=await onRequestPut({request:request('PUT',removed),env,params:{id:'p1'}});assert.equal(r.status,200);assert.equal(env.DB.links[0].is_active,0);
r=await onRequestDelete({request:request('DELETE'),env,params:{id:'p1'}});assert.equal(r.status,200);assert.equal(env.DB.products.get('p1').status,'archived');assert.equal(env.DB.products.get('p1').affiliate_ready,0);assert.equal(env.DB.links[0].is_active,0);
r=await onRequestPost({request:request('POST',{...base,id:'bad',links:[{slot:1,url:'https://example.com/x'}]}),env});assert.equal(r.status,400);assert.equal((await r.json()).error,'invalid_affiliate_url');
console.log('PRODUCT_CRUD_CONTRACT=PASS');

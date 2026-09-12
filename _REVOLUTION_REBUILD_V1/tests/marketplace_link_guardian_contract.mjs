import assert from 'node:assert/strict';
import {verifyCanonicalCatalog,verifyAffiliateListings} from '../worker/marketplace_link_guardian.js';

class FakeDB{
  constructor(){
    this.products=[{id:'p1',marketplace_catalog_product_id:'MLB11111111',marketplace_expected_attributes_json:'{"MODEL":"X"}',marketplace_identity_status:'catalog_only'}];
    this.links=[{link_id:1,id:1,product_id:'p1',slot:1,marketplace_item_id:'MLB1234567890',marketplace_variation_id:null,fail_count:0,canonical_catalog_product_id:'MLB11111111',marketplace_expected_attributes_json:'{"MODEL":"X"}',product_identity_status:'catalog_only'}];
    this.run=0;
  }
  prepare(sql){
    const db=this;
    return {sql,args:[],bind(...args){this.args=args;return this},async all(){
      if(sql.includes('FROM products WHERE status='))return {results:db.products};
      if(sql.includes('FROM product_links l JOIN products p'))return {results:db.links.map(l=>({...l,product_identity_status:db.products[0].marketplace_identity_status,canonical_catalog_product_id:db.products[0].marketplace_catalog_product_id}))};
      throw new Error(`Unhandled all: ${sql}`);
    },async first(){
      if(sql.includes("INSERT INTO worker_runs"))return {id:++db.run};
      throw new Error(`Unhandled first: ${sql}`);
    },async run(){
      const a=this.args;
      if(sql.startsWith('UPDATE products SET marketplace_identity_status='))Object.assign(db.products[0],{marketplace_identity_status:a[0],marketplace_title:a[1],marketplace_last_reason:a[3]});
      else if(sql.includes("marketplace_identity_status='blocked'"))Object.assign(db.products[0],{marketplace_identity_status:'blocked',marketplace_last_reason:'invalid_catalog_product_id'});
      else if(sql.startsWith('UPDATE product_links SET marketplace_catalog_product_id='))Object.assign(db.links[0],{marketplace_catalog_product_id:a[0],marketplace_identity_status:a[1],marketplace_seller_id:a[2],marketplace_seller_level:a[3],marketplace_last_reason:a[5],health_status:a[6],variant_match:a[7],fail_count:a[8]});
      else if(sql.startsWith('UPDATE worker_runs SET')){}
      else throw new Error(`Unhandled run: ${sql}`);
      return {success:true};
    }};
  }
}

const db=new FakeDB(),env={DB:db,ML_ACCESS_TOKEN:'token'};
let itemCatalog='MLB11111111';
globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('/products/MLB11111111'))return Response.json({id:'MLB11111111',status:'active',name:'Product X',attributes:[{id:'MODEL',value_name:'X'}]});
  if(u.includes('/items/bulk'))return Response.json([{id:'MLB1234567890',status_code:200,body:{id:'MLB1234567890',status:'active',seller_id:777,catalog_product_id:itemCatalog,attributes:[{id:'MODEL',value_name:'X'}],variations:[]}}]);
  if(u.includes('/users/bulk'))return Response.json([{id:777,status_code:200,body:{id:777,seller_reputation:{level_id:'5_green'}}}]);
  return Response.json({error:'unexpected'}, {status:404});
};

let r=await verifyCanonicalCatalog(env);assert.equal(r.results[0].status,'catalog_verified');assert.equal(db.products[0].marketplace_identity_status,'catalog_verified');
r=await verifyAffiliateListings(env);assert.equal(r.verified,1);assert.equal(db.links[0].marketplace_identity_status,'verified_exact');assert.equal(db.links[0].health_status,'verified');assert.equal(db.links[0].marketplace_seller_level,'5_green');
itemCatalog='MLB22222222';db.links[0].fail_count=0;
r=await verifyAffiliateListings(env);assert.equal(r.blocked,1);assert.equal(db.links[0].marketplace_identity_status,'blocked');assert.match(db.links[0].marketplace_last_reason,/catalog_mismatch/);
const skipped=await verifyCanonicalCatalog({DB:db});assert.equal(skipped.status,'skipped');
console.log('MARKETPLACE_LINK_GUARDIAN_CONTRACT=PASS');
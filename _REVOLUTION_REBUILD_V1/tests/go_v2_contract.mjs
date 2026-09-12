import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/go/[sku].js';

class FakeDB{
  constructor(row=null){this.row=row;this.events=[];}
  prepare(sql){const db=this;return {sql,args:[],bind(...args){this.args=args;return this},async first(){if(sql.includes('FROM product_links l JOIN products p'))return db.row;throw new Error('Unhandled first')},async run(){if(sql.startsWith('INSERT INTO events')){db.events.push(this.args);return {success:true}}throw new Error('Unhandled run')}};}
}
const verifiedRow={link_id:7,slot:2,affiliate_url:'https://meli.la/abc1234',marketplace_item_id:'MLB1234567890',marketplace_variation_id:'88',marketplace_catalog_product_id:'MLB72180954',canonical_catalog_product_id:'MLB72180954'};

let env={DB:new FakeDB(null)};
let r=await onRequestGet({request:new Request('https://local/go/bg-us-0007?src=site'),env,params:{sku:'bg-us-0007'}});
assert.equal(r.status,404);assert.equal((await r.json()).error,'offer_unavailable');assert.equal(env.DB.events.length,0);

env={DB:new FakeDB(verifiedRow)};
r=await onRequestGet({request:new Request('https://local/go/bg-us-0007?src=instagram&c=test&p=card'),env,params:{sku:'bg-us-0007'}});
assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://meli.la/abc1234');assert.equal(env.DB.events.length,1);assert.equal(env.DB.events[0][0],'bg-us-0007');assert.equal(env.DB.events[0][1],'instagram');assert.equal(env.DB.events[0][3],2);
const meta=JSON.parse(env.DB.events[0][4]);assert.equal(meta.item_id,'MLB1234567890');assert.equal(meta.catalog_product_id,'MLB72180954');

env={DB:new FakeDB({...verifiedRow,affiliate_url:'https://example.com/steal'})};
r=await onRequestGet({request:new Request('https://local/go/bg-us-0007'),env,params:{sku:'bg-us-0007'}});
assert.equal(r.status,503);assert.equal((await r.json()).error,'invalid_offer_url');assert.equal(env.DB.events.length,0);
console.log('GO_V2_CONTRACT=PASS');
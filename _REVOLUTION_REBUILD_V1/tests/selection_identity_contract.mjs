import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/selection.js';
class FakeDB{
  constructor(){this.sql='';this.args=[];}
  prepare(sql){this.sql=sql;const db=this;return {bind(...args){db.args=args;return this},async all(){return {results:[{campaign_id:'c1',product_id:'p1',name:'Produto',score:1}]}}};}
}
const db=new FakeDB();
const r=await onRequestGet({env:{DB:db}});
assert.equal(r.status,200);const body=await r.json();assert.equal(body.selection.length,1);
assert.match(db.sql,/marketplace_identity_status='catalog_verified'/);
assert.match(db.sql,/marketplace_identity_status='verified_exact'/);
assert.match(db.sql,/variant_match=1/);
assert.match(db.sql,/marketplace_catalog_product_id=p\.marketplace_catalog_product_id/);
assert.match(db.sql,/-18 hours/);
console.log('SELECTION_IDENTITY_CONTRACT=PASS');
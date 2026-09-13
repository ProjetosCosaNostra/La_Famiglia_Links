import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/admin/operations.js';
const jsonReq=(body,token='t')=>new Request('https://local/api/admin/operations',{method:'POST',headers:{'content-type':'application/json','x-admin-token':token},body:JSON.stringify(body)});
function dbForPosts(log){return {prepare(sql){return {bind(...args){return {run:async()=>{log.push({sql,args});return {meta:{changes:1}}}}}}}};}
async function testExternalFailClosed(){
  const log=[];const env={BG_ADMIN_TOKEN:'t',DB:dbForPosts(log)};
  let r=await onRequestPost({request:jsonReq({action:'update_channel',channel:'instagram',policy_status:'ALLOWED',configured:false,live_enabled:true}),env});let b=await r.json();
  assert.equal(r.status,200);assert.equal(b.live_enabled,false);assert.equal(b.configured,false);assert.equal(log.find(x=>x.sql.includes('INSERT INTO channel_state')).args[3],0);
  r=await onRequestPost({request:jsonReq({action:'update_channel',channel:'instagram',policy_status:'INTERNAL_ALLOWED',configured:true,live_enabled:true}),env});b=await r.json();assert.equal(r.status,400);assert.equal(b.error,'internal_policy_reserved');
}
async function testSiteNormalization(){
  const log=[];const env={BG_ADMIN_TOKEN:'t',DB:dbForPosts(log)};const r=await onRequestPost({request:jsonReq({action:'update_channel',channel:'site_daily',policy_status:'REVIEW_REQUIRED',configured:false,live_enabled:true}),env});const b=await r.json();
  assert.equal(b.policy_status,'INTERNAL_ALLOWED');assert.equal(b.configured,true);assert.equal(b.live_enabled,true);assert.deepEqual(log.find(x=>x.sql.includes('INSERT INTO channel_state')).args.slice(0,4),['site_daily','INTERNAL_ALLOWED',1,1]);
}
async function testWorkerBinding(){
  let seen=null;const env={BG_ADMIN_TOKEN:'t',DB:dbForPosts([]),WORKER:{fetch:async req=>{seen=req;return Response.json({ok:true,selected:[1,2,3]})}}};
  const r=await onRequestPost({request:jsonReq({action:'run_daily_selection'}),env});const b=await r.json();assert.equal(r.status,200);assert.equal(b.ok,true);assert.equal(new URL(seen.url).pathname,'/run/daily-selection');assert.equal(seen.headers.get('x-bg-service'),'pages-admin-v1');
}
async function testGetNormalization(){
  const env={BG_ADMIN_TOKEN:'t',WORKER:{fetch:async()=>Response.json({ok:true,ml_access_token_configured:false})},DB:{prepare(sql){return {all:async()=>sql.includes('FROM channel_state')?{results:[{channel:'instagram',policy_status:'INTERNAL_ALLOWED',configured:1,live_enabled:1},{channel:'site_daily',policy_status:'REVIEW_REQUIRED',configured:0,live_enabled:1}]}:{results:[]}}}}};
  const r=await onRequestGet({request:new Request('https://local/api/admin/operations',{headers:{'x-admin-token':'t'}}),env});const b=await r.json();
  assert.equal(b.channels.find(x=>x.channel==='instagram').policy_status,'REVIEW_REQUIRED');assert.equal(b.channels.find(x=>x.channel==='instagram').live_enabled,0);assert.equal(b.channels.find(x=>x.channel==='site_daily').policy_status,'INTERNAL_ALLOWED');assert.equal(b.channels.length,8);assert.equal(b.channels.find(x=>x.channel==='facebook').live_enabled,0);assert.equal(b.channels.find(x=>x.channel==='pinterest').policy_status,'REVIEW_REQUIRED');assert.equal(b.worker_configured,true);assert.equal(b.worker_health?.ok,true);assert.equal(b.worker_health?.ml_access_token_configured,false);
}
await testExternalFailClosed();await testSiteNormalization();await testWorkerBinding();await testGetNormalization();console.log('OPERATIONS_CONTRACT=PASS');
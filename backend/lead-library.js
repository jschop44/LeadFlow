import {createHash} from 'node:crypto';
import {leadKey} from './lead-key.js';
let pool=null;
export async function initLeadLibrary(){
 if(!process.env.DATABASE_URL)return false;
 try{const {Pool}=await import('pg');
 // Local CI databases need no TLS; remote Neon/database connections remain TLS-only.
 const host=new URL(process.env.DATABASE_URL).hostname.toLowerCase();
 const loopback=['localhost','127.0.0.1','[::1]'].includes(host);
 pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,ssl:loopback?false:{rejectUnauthorized:true}});
 await pool.query('CREATE TABLE IF NOT EXISTS leadflow_lead_library (scope TEXT NOT NULL, lead_key TEXT NOT NULL, data JSONB NOT NULL, saved BOOLEAN NOT NULL DEFAULT FALSE, seen BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(scope,lead_key))');
 await pool.query('CREATE INDEX IF NOT EXISTS leadflow_lead_library_updated_idx ON leadflow_lead_library(scope,updated_at DESC)');
 return true}catch(e){console.warn('Lead library unavailable:',e.message);await pool?.end().catch(()=>{});pool=null;return false}
}
export const leadLibraryReady=()=>!!pool;
function scopeFor(token){return createHash('sha256').update('leadflow-library-v1:'+token).digest('hex')}
function safeLead(x){const name=String(x?.name||'').slice(0,240),website=String(x?.website||'').slice(0,1000);if(!name)throw Error('Business name required');return {name,website,address:String(x.address||'').slice(0,500),niche:String(x.niche||'').slice(0,150),phone:String(x.phone||'').slice(0,100),email:String(x.email||'').slice(0,250),owner:String(x.owner||'').slice(0,250),socials:Array.isArray(x.socials)?x.socials.slice(0,12):[],classification:String(x.classification||'').slice(0,80),platform:String(x.platform||'').slice(0,100),source:String(x.source||'').slice(0,500)}}
export async function libraryAction(token,action,data){
 if(!pool)throw Error('Persistent lead library is not configured');
 const scope=scopeFor(token);
 if(action==='check-seen'){
  if(!Array.isArray(data.leads)||data.leads.length>100)throw Error('Check at most 100 leads per batch');
  const keys=[...new Set(data.leads.map(item=>leadKey(safeLead(item))))];
  if(!keys.length)return {seenKeys:[],durable:true};
  const result=await pool.query('SELECT lead_key FROM leadflow_lead_library WHERE scope=$1 AND seen=true AND lead_key=ANY($2::text[])',[scope,keys]);
  return {seenKeys:result.rows.map(row=>row.lead_key),durable:true};
 }
 if(action==='list'){const kind=['all','new','seen','saved'].includes(data.filter)?data.filter:'all';const where=kind==='new'?'AND NOT seen':kind==='seen'?'AND seen':kind==='saved'?'AND saved':'';const rows=await pool.query('SELECT data,saved,seen,updated_at FROM leadflow_lead_library WHERE scope=$1 '+where+' ORDER BY updated_at DESC LIMIT 1500',[scope]);return {leads:rows.rows.map(r=>({...r.data,saved:r.saved,seen:r.seen,archivedAt:new Date(r.updated_at).getTime()})),filter:kind,durable:true}}
 if(action==='upsert'){if(!Array.isArray(data.leads)||data.leads.length>100)throw Error('Send at most 100 leads per batch');let count=0;for(const item of data.leads){const lead=safeLead(item),key=leadKey(lead);await pool.query('INSERT INTO leadflow_lead_library(scope,lead_key,data,saved,seen) VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope,lead_key) DO UPDATE SET data=EXCLUDED.data, saved=CASE WHEN $6 THEN EXCLUDED.saved ELSE leadflow_lead_library.saved END,seen=leadflow_lead_library.seen OR EXCLUDED.seen,updated_at=NOW()',[scope,key,JSON.stringify(lead),item.saved===true,item.seen===true,data.updateSaved===true]);count++}return {stored:count,durable:true}}
 if(action==='mark'){const key=String(data.key||'');if(key.length>1100)throw Error('Invalid lead key');const field=data.field==='saved'?'saved':data.field==='seen'?'seen':null;if(!field)throw Error('Invalid status field');const result=await pool.query('UPDATE leadflow_lead_library SET '+field+'=$3,updated_at=NOW() WHERE scope=$1 AND lead_key=$2',[scope,key,data.value===true]);return {updated:result.rowCount}}
 throw Error('Unknown library action')
}

export async function verifyLeadLibrary(){
 if(!pool)return {passed:false,reason:'Neon library not connected'};
 const client=await pool.connect();
 const scope='leadflow-internal-verification',key='domain:verification.invalid';
 try{
  await client.query('BEGIN');
  await client.query('INSERT INTO leadflow_lead_library(scope,lead_key,data,saved,seen) VALUES($1,$2,$3,false,false) ON CONFLICT(scope,lead_key) DO UPDATE SET data=EXCLUDED.data,saved=false,seen=false',[scope,key,JSON.stringify({name:'LeadFlow Verification',website:'https://verification.invalid'})]);
  const discovered=await client.query('SELECT saved,seen FROM leadflow_lead_library WHERE scope=$1 AND lead_key=$2',[scope,key]);
  if(discovered.rowCount!==1||discovered.rows[0].saved)throw Error('Discovery/retrieval failed');
  await client.query('UPDATE leadflow_lead_library SET saved=true WHERE scope=$1 AND lead_key=$2',[scope,key]);
  const saved=await client.query('SELECT saved FROM leadflow_lead_library WHERE scope=$1 AND lead_key=$2',[scope,key]);
  if(!saved.rows[0]?.saved)throw Error('Save/retrieval failed');
  await client.query('UPDATE leadflow_lead_library SET saved=false WHERE scope=$1 AND lead_key=$2',[scope,key]);
  const unsaved=await client.query('SELECT saved FROM leadflow_lead_library WHERE scope=$1 AND lead_key=$2',[scope,key]);
  if(unsaved.rows[0]?.saved!==false)throw Error('Unsave/retrieval failed');
  await client.query('ROLLBACK');
  return {passed:true,checks:['discover','retrieve','save','retrieve saved','unsave','retrieve unsaved'],rolledBack:true}
 }catch(e){await client.query('ROLLBACK').catch(()=>{});return {passed:false,reason:e.message}}finally{client.release()}
}

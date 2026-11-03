import {createHash} from 'node:crypto';
let pool=null;
export async function initLeadLibrary(){
 if(!process.env.DATABASE_URL)return false;
 try{const {Pool}=await import('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,ssl:{rejectUnauthorized:true}});
 await pool.query('CREATE TABLE IF NOT EXISTS leadflow_lead_library (scope TEXT NOT NULL, lead_key TEXT NOT NULL, data JSONB NOT NULL, saved BOOLEAN NOT NULL DEFAULT FALSE, seen BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(scope,lead_key))');
 await pool.query('CREATE INDEX IF NOT EXISTS leadflow_lead_library_updated_idx ON leadflow_lead_library(scope,updated_at DESC)');
 return true}catch(e){console.warn('Lead library unavailable:',e.message);await pool?.end().catch(()=>{});pool=null;return false}
}
export const leadLibraryReady=()=>!!pool;
function scopeFor(token){return createHash('sha256').update('leadflow-library-v1:'+token).digest('hex')}
function safeLead(x){const name=String(x?.name||'').slice(0,240),website=String(x?.website||'').slice(0,1000);if(!name)throw Error('Business name required');return {name,website,address:String(x.address||'').slice(0,500),niche:String(x.niche||'').slice(0,150),phone:String(x.phone||'').slice(0,100),email:String(x.email||'').slice(0,250),owner:String(x.owner||'').slice(0,250),socials:Array.isArray(x.socials)?x.socials.slice(0,12):[],classification:String(x.classification||'').slice(0,80),platform:String(x.platform||'').slice(0,100),source:String(x.source||'').slice(0,500)}}
function leadKey(x){let domain='';try{domain=new URL(x.website).hostname.toLowerCase().replace(/^www\./,'')}catch{}return domain?'domain:'+domain:'listing:'+(x.name+'|'+x.address).toLowerCase().replace(/\s+/g,' ').trim()}
export async function libraryAction(token,action,data){
 if(!pool)throw Error('Persistent lead library is not configured');
 const scope=scopeFor(token);
 if(action==='list'){const kind=['all','new','seen','saved'].includes(data.filter)?data.filter:'all';const where=kind==='new'?'AND NOT seen':kind==='seen'?'AND seen':kind==='saved'?'AND saved':'';const rows=await pool.query('SELECT data,saved,seen,updated_at FROM leadflow_lead_library WHERE scope=$1 '+where+' ORDER BY updated_at DESC LIMIT 1500',[scope]);return {leads:rows.rows.map(r=>({...r.data,saved:r.saved,seen:r.seen,archivedAt:new Date(r.updated_at).getTime()})),filter:kind,durable:true}}
 if(action==='upsert'){if(!Array.isArray(data.leads)||data.leads.length>100)throw Error('Send at most 100 leads per batch');let count=0;for(const item of data.leads){const lead=safeLead(item),key=leadKey(lead);await pool.query('INSERT INTO leadflow_lead_library(scope,lead_key,data,saved,seen) VALUES($1,$2,$3,$4,$5) ON CONFLICT(scope,lead_key) DO UPDATE SET data=EXCLUDED.data, saved=EXCLUDED.saved,seen=leadflow_lead_library.seen OR EXCLUDED.seen,updated_at=NOW()',[scope,key,JSON.stringify(lead),item.saved===true,item.seen===true]);count++}return {stored:count,durable:true}}
 if(action==='mark'){const key=String(data.key||'');if(key.length>1100)throw Error('Invalid lead key');const field=data.field==='saved'?'saved':data.field==='seen'?'seen':null;if(!field)throw Error('Invalid status field');const result=await pool.query('UPDATE leadflow_lead_library SET '+field+'=$3,updated_at=NOW() WHERE scope=$1 AND lead_key=$2',[scope,key,data.value===true]);return {updated:result.rowCount}}
 throw Error('Unknown library action')
}

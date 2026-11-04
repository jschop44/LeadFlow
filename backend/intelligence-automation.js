import {randomUUID,createHash} from 'node:crypto';
import {knowledgeAction} from './knowledge-base.js';
const INTERVAL_MS=Number(process.env.INTELLIGENCE_ENGINE_INTERVAL_MS||900000);
const patterns=[
 {key:'conversion',re:/conversion|lead capture|contact form|booking|call.to.action|sales funnel/i,action:'Review lead-capture and conversion flow',query:'conversion leads'},
 {key:'performance',re:/speed|latency|performance|loading|page weight|core web vitals/i,action:'Evaluate website performance improvements',query:'website performance'},
 {key:'retention',re:/retention|repeat customer|churn|loyalty|follow.up/i,action:'Review customer retention opportunities',query:'customer retention'},
 {key:'accessibility',re:/accessibility|wcag|screen reader|contrast|keyboard navigation/i,action:'Review accessibility barriers',query:'accessibility'},
 {key:'search',re:/search engine|seo|organic traffic|structured data|local listing/i,action:'Review discoverability improvements',query:'search visibility'}
];
let running=false,lastRun=null,lastError=null,lastCount=0;
const enabled=()=>process.env.KNOWLEDGE_BASE_ENABLED==='true'&&process.env.INTELLIGENCE_AUTOMATION_ENABLED==='true';
const db=async()=>{const {default:pg}=await import('pg');const u=new URL(process.env.DATABASE_URL);return new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:['localhost','127.0.0.1'].includes(u.hostname)?false:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:4000})};
export async function runIntelligenceCycle(){
 if(!enabled())return {enabled:false,reason:'Automation requires explicit feature flag'};
 if(running)return {enabled:true,running:true,lastRun,lastCount};
 running=true;let pool;
 try{
  pool=await db();
  await pool.query(`CREATE TABLE IF NOT EXISTS kb_intelligence_tasks(
   id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
   category text NOT NULL,title text NOT NULL,reason text NOT NULL,
   status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','dismissed')),
   created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(document_id,category))`);
  const documents=await pool.query(`SELECT d.id,d.title,d.content,d.collection
    FROM kb_documents d WHERE NOT d.archived AND d.collection='business'
    ORDER BY d.created_at DESC LIMIT 200`);
  let created=0;
  for(const doc of documents.rows){
   for(const p of patterns){
    if(!p.re.test(doc.content))continue;
    const reason='Source: '+doc.title+'; matched documented topic: '+p.key+'. Verify relevance before use.';
    const r=await pool.query(`INSERT INTO kb_intelligence_tasks(id,document_id,category,title,reason)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id,category) DO NOTHING RETURNING id`,
      [randomUUID(),doc.id,p.key,p.action,reason]);
    created+=r.rowCount;
   }
  }
  lastRun=new Date().toISOString();lastError=null;lastCount=created;
  return {enabled:true,created,documentsScanned:documents.rows.length,lastRun,requiresHumanReview:true,automaticOutreach:false};
 }catch(e){lastError=String(e.message||e).slice(0,180);return {enabled:true,error:lastError,lastRun}}
 finally{running=false;if(pool)await pool.end().catch(()=>{})}
}
export async function intelligenceAction(action,data={}){
 if(!enabled())return {enabled:false,reason:'Automation requires explicit feature flag'};
 if(action==='run')return runIntelligenceCycle();
 if(action==='status')return {enabled:true,running,lastRun,lastError,lastCount,intervalMinutes:Math.round(INTERVAL_MS/60000),automaticOutreach:false};
 const pool=await db();
 try{
  if(action==='tasks'){
   const status=String(data.status||'pending_review');
   if(!['pending_review','approved','dismissed'].includes(status))throw Error('Invalid task status');
   const r=await pool.query(`SELECT t.id,t.category,t.title,t.reason,t.status,t.created_at,d.title AS source_title,d.id AS source_id
     FROM kb_intelligence_tasks t JOIN kb_documents d ON d.id=t.document_id
     WHERE t.status=$1 AND NOT d.archived ORDER BY t.created_at DESC LIMIT 100`,[status]);
   return {tasks:r.rows,status,requiresHumanReview:true};
  }
  if(action==='review'){
   const id=String(data.taskId||'');
   const status=String(data.status||'');
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['approved','dismissed'].includes(status))throw Error('Invalid review');
   const r=await pool.query(`UPDATE kb_intelligence_tasks SET status=$2 WHERE id=$1 AND status='pending_review' RETURNING id`,[id,status]);
   return {updated:r.rowCount===1,status,automaticOutreach:false};
  }
  throw Error('Unknown intelligence action');
 }finally{await pool.end()}
}
export function startIntelligenceScheduler(){
 if(!enabled())return;
 const interval=Math.max(60000,Math.min(86400000,INTERVAL_MS||900000));
 setTimeout(()=>{void runIntelligenceCycle()},12000).unref();
 setInterval(()=>{void runIntelligenceCycle()},interval).unref();
}

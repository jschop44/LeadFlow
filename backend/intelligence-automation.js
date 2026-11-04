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
let prospectProvider=()=>[];
let researchProvider=async()=>({status:'unavailable',reason:'No research provider configured'});
export function configureResearchProvider(provider){if(typeof provider!=='function')throw Error('Research provider must be a function');researchProvider=provider;}
export function configureProspectProvider(provider){if(typeof provider!=='function')throw Error('Prospect provider must be a function');prospectProvider=provider;}
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
  await pool.query(`CREATE TABLE IF NOT EXISTS kb_prospect_candidates(
   id uuid PRIMARY KEY,source_key text NOT NULL UNIQUE,business_name text NOT NULL,
   website text,city text,niche text,source text NOT NULL,
   status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','dismissed')),
   discovered_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(`ALTER TABLE kb_prospect_candidates ADD COLUMN IF NOT EXISTS research_status text NOT NULL DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE kb_prospect_candidates ADD COLUMN IF NOT EXISTS research_summary text`);
  await pool.query(`ALTER TABLE kb_prospect_candidates ADD COLUMN IF NOT EXISTS researched_at timestamptz`);
  let discovered=0;
  const candidates=await Promise.resolve(prospectProvider());
  for(const candidate of (Array.isArray(candidates)?candidates:[]).slice(0,100)){
   const name=String(candidate.name||'').trim().slice(0,180);
   const key=String(candidate.key||'').trim().slice(0,300);
   if(!name||!key)continue;
   const result=await pool.query(`INSERT INTO kb_prospect_candidates(id,source_key,business_name,website,city,niche,source)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_key) DO NOTHING RETURNING id`,
     [randomUUID(),key,name,String(candidate.website||'').slice(0,300)||null,String(candidate.city||'').slice(0,120)||null,String(candidate.niche||'').slice(0,120)||null,'OpenStreetMap indexed snapshot']);
   discovered+=result.rowCount;
  }
  // Research a small, bounded batch. A failed website never blocks other candidates.
  const researchBatch=await pool.query(`SELECT id,website FROM kb_prospect_candidates
    WHERE website IS NOT NULL AND website<>'' AND (researched_at IS NULL OR researched_at<now()-interval '7 days')
    ORDER BY researched_at ASC NULLS FIRST,discovered_at ASC LIMIT 3`);
  let researched=0,failedResearch=0;
  for(const candidate of researchBatch.rows){
   let result;
   try{result=await researchProvider(candidate.website)}
   catch(e){result={status:'unavailable',reason:String(e.message||e).slice(0,120)}}
   const status=result?.status==='verified'?'verified':'unavailable';
   const summary=String(result?.summary||result?.reason||'No verified website evidence').slice(0,450);
   await pool.query('UPDATE kb_prospect_candidates SET research_status=$2,research_summary=$3,researched_at=now() WHERE id=$1',[candidate.id,status,summary]);
   if(status==='verified')researched++;else failedResearch++;
  }
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
  lastRun=new Date().toISOString();lastError=null;lastCount=created+discovered;
  return {enabled:true,created,prospectsDiscovered:discovered,websitesResearched:researched,websiteResearchUnavailable:failedResearch,documentsScanned:documents.rows.length,lastRun,requiresHumanReview:true,automaticOutreach:false};
 }catch(e){lastError=String(e.message||e).slice(0,180);return {enabled:true,error:lastError,lastRun}}
 finally{running=false;if(pool)await pool.end().catch(()=>{})}
}
export async function intelligenceAction(action,data={}){
 if(!enabled())return {enabled:false,reason:'Automation requires explicit feature flag'};
 if(action==='run')return runIntelligenceCycle();
 if(action==='status')return {enabled:true,running,lastRun,lastError,lastCount,intervalMinutes:Math.round(INTERVAL_MS/60000),automaticOutreach:false};
 const pool=await db();
 try{
  if(action==='dashboard'){
   const r=await pool.query(`SELECT
    count(*)::int AS total,
    count(*) FILTER(WHERE status='pending_review')::int AS pending,
    count(*) FILTER(WHERE status='approved')::int AS approved,
    count(*) FILTER(WHERE research_status='verified')::int AS researched,
    count(*) FILTER(WHERE research_status='unavailable')::int AS unavailable,
    count(*) FILTER(WHERE website IS NOT NULL AND website<>'')::int AS with_website
    FROM kb_prospect_candidates`);
   const q=await pool.query("SELECT count(*)::int AS pending FROM kb_intelligence_tasks WHERE status='pending_review'");
   return {enabled:true,prospects:r.rows[0],suggestionsPending:q.rows[0].pending,lastRun,lastError,automaticOutreach:false};
  }
  if(action==='prospects'){
   const status=String(data.status||'pending_review');
   if(!['pending_review','approved','dismissed'].includes(status))throw Error('Invalid prospect status');
   const r=await pool.query('SELECT id,business_name,website,city,niche,source,status,discovered_at,research_status,research_summary,researched_at FROM kb_prospect_candidates WHERE status=$1 ORDER BY discovered_at DESC LIMIT 100',[status]);
   return {prospects:r.rows,source:'indexed OpenStreetMap snapshot',requiresHumanReview:true};
  }
  if(action==='prospect-brief'){
   const id=String(data.prospectId||'');
   if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid prospect id');
   const result=await pool.query('SELECT id,business_name,website,city,niche,source,status,research_status,research_summary,researched_at FROM kb_prospect_candidates WHERE id=$1',[id]);
   if(!result.rowCount)throw Error('Prospect not found');
   const p=result.rows[0];
   const verifiedWebsite=/^https:\/\//i.test(p.website||'');
   const evidence=[{field:'business_name',value:p.business_name,source:p.source}];
   if(p.city)evidence.push({field:'city',value:p.city,source:p.source});
   if(p.niche)evidence.push({field:'niche',value:p.niche,source:p.source});
   if(verifiedWebsite)evidence.push({field:'website',value:p.website,source:p.source});
   if(p.research_status==='verified'&&p.research_summary)evidence.push({field:'website_research',value:p.research_summary,source:p.website});
   const completeness=Math.min(100,35+(p.city?15:0)+(p.niche?15:0)+(verifiedWebsite?35:0));
   return {prospectId:p.id,business:p.business_name,source:p.source,
    evidence,completenessScore:completeness,scoreType:'source-data-completeness-not-sales-potential',
    opportunity:'Website audit recommended before making performance or revenue claims',
    outreachDraft:{subject:'Question about '+p.business_name,
     body:`Hello,\n\nI came across ${p.business_name} while researching businesses${p.city?' in '+p.city:''}. I help businesses review their website experience and lead-capture opportunities. Would you be open to a brief conversation about whether a website review would be useful?\n\nBest regards,\n[Your name]`},
    researchStatus:p.research_status||'pending',researchedAt:p.researched_at||null,
    requiresHumanReview:true,automaticOutreach:false,
    caveat:'Draft is generic. Website research, if available, is preliminary and not a full Growth Lens audit. No contact verification has been performed.'};
  }
  if(action==='review-prospect'){
   const id=String(data.prospectId||''),status=String(data.status||'');
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['approved','dismissed'].includes(status))throw Error('Invalid prospect review');
   const r=await pool.query("UPDATE kb_prospect_candidates SET status=$2 WHERE id=$1 AND status='pending_review' RETURNING id",[id,status]);
   return {updated:r.rowCount===1,status,automaticOutreach:false};
  }
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

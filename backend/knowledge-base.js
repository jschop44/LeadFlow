import {randomUUID,createHash} from 'node:crypto';
async function extractUploadedText(data){
 const filename=String(data.filename||'').slice(0,180);
 const raw=String(data.base64||'');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)||raw.length>1900000||!raw)throw Error('Invalid or oversized upload');
 const bytes=Buffer.from(raw,'base64');
 if(bytes.length>1400000)throw Error('File exceeds 1.4 MB');
 if(/\.(txt|md)$/i.test(filename))return bytes.toString('utf8');
 if(/\.pdf$/i.test(filename)){
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');
  const {default:parse}=await import('pdf-parse');
  return (await parse(bytes,{max:80})).text;
 }
 if(/\.docx$/i.test(filename)){
  if(bytes.subarray(0,2).toString()!=='PK')throw Error('Invalid DOCX');
  const {default:mammoth}=await import('mammoth');
  return (await mammoth.extractRawText({buffer:bytes})).value;
 }
 throw Error('Only PDF, DOCX, TXT and MD files are supported');
}
const enabled=()=>process.env.KNOWLEDGE_BASE_ENABLED==='true';
let pool,ready=false;
export async function knowledgeAction(action,data={}){
 if(!enabled())throw Error('Knowledge base disabled by feature flag');
 if(!process.env.DATABASE_URL)throw Error('Persistent database not configured');
 if(!pool){const {default:pg}=await import('pg');pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:4000});}
 if(!ready){
  await pool.query(`CREATE TABLE IF NOT EXISTS kb_documents(id uuid PRIMARY KEY,collection text NOT NULL CHECK(collection IN ('business','prospects')),title text NOT NULL,content text NOT NULL,sha256 text NOT NULL,created_at timestamptz DEFAULT now(),archived boolean NOT NULL DEFAULT false)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kb_feedback(id uuid PRIMARY KEY,document_id uuid REFERENCES kb_documents(id) ON DELETE CASCADE,signal text NOT NULL CHECK(signal IN ('useful','incorrect')),note text NOT NULL DEFAULT '',created_at timestamptz DEFAULT now())`);
  await pool.query('CREATE INDEX IF NOT EXISTS kb_documents_search_idx ON kb_documents USING gin(to_tsvector(\'english\',content))');
  ready=true;
 }
 if(action==='status'){const r=await pool.query('SELECT collection,count(*)::int AS count FROM kb_documents WHERE NOT archived GROUP BY collection');return {enabled:true,collections:r.rows}}
 if(action==='ingest-file'){
  const content=await extractUploadedText(data);
  if(content.trim().length<10)throw Error('No usable text found. Scanned PDFs need OCR.');
  return knowledgeAction('ingest',{collection:data.collection,title:data.title||data.filename,content});
 }
 if(action==='ingest'){
  const collection=String(data.collection||''),title=String(data.title||'').trim(),content=String(data.content||'').trim();
  if(!['business','prospects'].includes(collection)||!title||title.length>180||content.length<10||content.length>120000)throw Error('Invalid collection, title, or text (10-120000 characters)');
  const hash=createHash('sha256').update(content).digest('hex');
  const existing=await pool.query('SELECT id FROM kb_documents WHERE collection=$1 AND sha256=$2 AND NOT archived LIMIT 1',[collection,hash]);
  if(existing.rows.length)return {id:existing.rows[0].id,duplicate:true};
  const id=randomUUID();await pool.query('INSERT INTO kb_documents(id,collection,title,content,sha256) VALUES($1,$2,$3,$4,$5)',[id,collection,title,content,hash]);
  return {id,duplicate:false,characters:content.length};
 }
 if(action==='search'){
  const q=String(data.query||'').trim().slice(0,250),collection=String(data.collection||'');
  if(!q||!['business','prospects'].includes(collection))throw Error('Search query and collection required');
  const r=await pool.query(`SELECT d.id,d.title,d.collection,(ts_rank_cd(to_tsvector('english',d.content),websearch_to_tsquery('english',$1)) + COALESCE(f.adjustment,0)) AS score,ts_headline('english',d.content,websearch_to_tsquery('english',$1),'MaxFragments=3,MaxWords=35,MinWords=8') AS excerpt FROM kb_documents d LEFT JOIN (SELECT document_id,LEAST(0.2,GREATEST(-0.2,SUM(CASE WHEN signal='useful' THEN 0.02 ELSE -0.05 END))) AS adjustment FROM kb_feedback GROUP BY document_id) f ON f.document_id=d.id WHERE d.collection=$2 AND NOT d.archived AND to_tsvector('english',d.content) @@ websearch_to_tsquery('english',$1) ORDER BY score DESC LIMIT 8`,[q,collection]);
  return {results:r.rows,source:'uploaded-knowledge',learning:'bounded-feedback-ranking',note:'Feedback influences ranking, not factual truth'};
 }
 if(action==='context'){
  const query=String(data.query||'').trim().slice(0,250);
  if(!query)throw Error('Context query required');
  const requested=String(data.collection||'business');
  if(!['business','prospects'].includes(requested))throw Error('Explicit collection required');
  const groups=await Promise.all([requested].map(async collection=>{
   const result=await knowledgeAction('search',{query,collection});
   return result.results.map(row=>({id:row.id,title:row.title,collection:row.collection,excerpt:String(row.excerpt||'').replace(/<[^>]*>/g,'').slice(0,1200),score:Number(row.score)}));
  }));
  return {query,collection:requested,context:groups.flat().sort((a,b)=>b.score-a.score).slice(0,8),source:'knowledge-base',requiresHumanReview:true};
 }
 if(action==='learning-summary'){
  const r=await pool.query("SELECT d.collection,COUNT(DISTINCT d.id)::int AS documents,COUNT(f.id)::int AS feedback_events,COUNT(f.id) FILTER (WHERE f.signal='useful')::int AS useful,COUNT(f.id) FILTER (WHERE f.signal='incorrect')::int AS incorrect FROM kb_documents d LEFT JOIN kb_feedback f ON f.document_id=d.id WHERE NOT d.archived GROUP BY d.collection");
  return {collections:r.rows,modelTraining:false,method:'bounded-feedback-ranking'};
 }
 if(action==='feedback'){
  const id=String(data.documentId||''),signal=String(data.signal||''),note=String(data.note||'').slice(0,1000);
  if(!/^[0-9a-f-]{36}$/i.test(id)||!['useful','incorrect'].includes(signal))throw Error('Invalid feedback');
  const found=await pool.query('SELECT id FROM kb_documents WHERE id=$1 AND NOT archived',[id]);if(!found.rows.length)throw Error('Document not found');
  await pool.query('INSERT INTO kb_feedback(id,document_id,signal,note) VALUES($1,$2,$3,$4)',[randomUUID(),id,signal,note]);return {recorded:true,automaticModelTraining:false};
 }
 if(action==='archive'){
  const id=String(data.documentId||'');if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid document ID');
  const r=await pool.query('UPDATE kb_documents SET archived=true WHERE id=$1 RETURNING id',[id]);return {archived:r.rowCount===1};
 }
 throw Error('Unknown knowledge action');
}

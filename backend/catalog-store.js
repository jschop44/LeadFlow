import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
export function createCatalogStore(dir){
 const file=join(dir,'online-catalog.json');
 let pool=null;
 let durable=false;
 const records=new Map();
 let pending=Promise.resolve();
 async function init(){
  if(process.env.DATABASE_URL){
   try{
    const {Pool}=await import('pg');
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:4000,ssl:{rejectUnauthorized:true}});
    await pool.query('CREATE TABLE IF NOT EXISTS leadflow_online_catalog(domain TEXT PRIMARY KEY, data JSONB NOT NULL, checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const found=await pool.query('SELECT data FROM leadflow_online_catalog LIMIT 10000');
    for(const row of found.rows)if(row.data?.domain)records.set(row.data.domain,row.data);
    durable=true;
   }catch(e){console.warn('Catalog database unavailable:',e.message);await pool?.end().catch(()=>{});pool=null}
  }
  try{for(const row of JSON.parse(await readFile(file,'utf8')))if(row.domain&&!records.has(row.domain))records.set(row.domain,row)}catch(e){if(e.code!=='ENOENT')console.warn('Catalog snapshot unavailable:',e.message)}
 }
 function save(row){
  const operation=pending.catch(()=>{}).then(async()=>{
   const previous=records.get(row.domain);
   if(previous?.sharedFeedback && row.sharedFeedback===undefined)row={...row,sharedFeedback:previous.sharedFeedback};
   const nextRecords=new Map(records);nextRecords.set(row.domain,row);
   if(pool){await pool.query('INSERT INTO leadflow_online_catalog(domain,data,checked_at) VALUES($1,$2,NOW()) ON CONFLICT(domain) DO UPDATE SET data=EXCLUDED.data,checked_at=NOW()',[row.domain,JSON.stringify(row)]);records.set(row.domain,row);return}
   await mkdir(dir,{recursive:true});const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify([...nextRecords.values()].slice(-10000)));await rename(tmp,file);records.set(row.domain,row);
  });
  pending=operation.catch(e=>console.warn('Catalog save failed:',e.message));
  return operation;
 }
 return {records,init,save,health:()=>({count:records.size,durable,storage:durable?'postgres':'ephemeral_snapshot'})};
}

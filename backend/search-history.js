import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
export function createSearchHistory(dir){
 const file=join(dir,'shared-search-history.json');let pool=null,rows=[],durable=false;
 async function init(){
  if(process.env.DATABASE_URL)try{
   const {Pool}=await import('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:4000,ssl:{rejectUnauthorized:true}});
   await pool.query("CREATE TABLE IF NOT EXISTS leadflow_shared_search_history(domain TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '',searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
   const r=await pool.query('SELECT domain,name,searched_at FROM leadflow_shared_search_history ORDER BY searched_at DESC LIMIT 100');
   rows=r.rows.map(x=>({domain:x.domain,name:x.name,searchedAt:x.searched_at}));durable=true;
  }catch(e){console.warn('Shared history database unavailable:',e.message);await pool?.end().catch(()=>{});pool=null}
  if(!pool)try{rows=JSON.parse(await readFile(file,'utf8'))}catch{}
 }
 async function record(elements){
  let count=0;const seen=new Set();
  for(const item of elements.slice(0,30)){
   let domain='';try{const u=new URL(String(item.website||item.url||item.tags?.website||''));if(['https:','http:'].includes(u.protocol))domain=u.hostname.toLowerCase().replace(/^www\./,'')}catch{}
   if(!/^[a-z0-9][a-z0-9.-]{1,250}[a-z0-9]$/.test(domain)||domain.includes('..')||!domain.includes('.')||domain.endsWith('.local')||seen.has(domain))continue;
   seen.add(domain);count++;const name=String(item.name||item.tags?.name||'').slice(0,160);
   if(pool)await pool.query('INSERT INTO leadflow_shared_search_history(domain,name,searched_at) VALUES($1,$2,NOW()) ON CONFLICT(domain) DO UPDATE SET name=EXCLUDED.name,searched_at=NOW()',[domain,name]);
   rows=[{domain,name,searchedAt:new Date().toISOString()},...rows.filter(x=>x.domain!==domain)].slice(0,100);
  }
  if(!pool&&count){await mkdir(dir,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(rows));await rename(file+'.tmp',file)}
  return count;
 }
 async function recent(limit=20){
  limit=Math.max(1,Math.min(50,Number(limit)||20));
  if(pool){const r=await pool.query('SELECT domain,name,searched_at FROM leadflow_shared_search_history ORDER BY searched_at DESC LIMIT $1',[limit]);return r.rows.map(x=>({domain:x.domain,name:x.name,searchedAt:x.searched_at}))}
  return rows.slice(0,limit);
 }
 return {init,record,recent,health:()=>({durable})};
}

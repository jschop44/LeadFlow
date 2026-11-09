import {readFile} from 'node:fs/promises';
const file=new URL('../index.html',import.meta.url);
let document;
export async function serveFrontend(req,res){
 const path=String(req.url||'').split('?')[0];
 if(!['/app','/app/'].includes(path))return false;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true;}
 try{
  document??=await readFile(file);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':document.length,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"frame-ancestors 'none'"});
  res.end(req.method==='HEAD'?undefined:document);
 }catch{res.writeHead(503,{'content-type':'text/plain','retry-after':'5'});res.end('The application interface is temporarily unavailable.');}
 return true;
}

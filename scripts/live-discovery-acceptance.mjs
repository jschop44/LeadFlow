import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const API='https://leadflow-research-api.onrender.com';
const OUT='acceptance-evidence';
const searches=[
 {label:'Local financial advisors',path:'/search',body:{area:'Bel Air, Maryland',niche:'Financial advisors'}},
 {label:'Local pizza businesses',path:'/search',body:{area:'Bel Air, Maryland',niche:'Pizza restaurants'}},
 {label:'US online red light therapy',path:'/search-online',body:{niche:'Wellness products',productKeyword:'red light therapy'}},
 {label:'US online sauna blankets',path:'/search-online',body:{niche:'Wellness products',productKeyword:'sauna blankets'}}
];
async function probe(item){
 const result={case:item.label,status:'unavailable',httpStatus:null,source:null,count:0,samples:[],duplicateDomains:[],limitations:[]};
 try{
  const response=await fetch(API+item.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(item.body),signal:AbortSignal.timeout(55000)});
  result.httpStatus=response.status;
  const data=await response.json().catch(()=>({error:'Non-JSON response'}));
  if(!response.ok){result.limitations.push(String(data.error||'Search endpoint unavailable').slice(0,250));return result;}
  const rows=Array.isArray(data.elements)?data.elements:[];
  result.status='retrieved';result.source=String(data.source||'source not identified').slice(0,200);result.count=rows.length;
  const seen=new Set();
  for(const row of rows){
   const website=String(row.tags?.website||row.tags?.['contact:website']||row.website||'');
   let host='';try{host=new URL(website).hostname.toLowerCase().replace(/^www\./,'')}catch{}
   if(host){if(seen.has(host))result.duplicateDomains.push(host);seen.add(host)}
  }
  result.samples=rows.slice(0,20).map(row=>({
   name:String(row.tags?.name||row.name||'').slice(0,110),
   website:String(row.tags?.website||row.website||'').slice(0,180),
   source:String(row.sourceAgreement?.join(' + ')||row.source||'not specified').slice(0,200),
   platform:String(row.platform||'not verified').slice(0,60),
   usEvidence:String(row.usEvidence||'not supplied').slice(0,200)
  }));
  if(rows.length<20)result.limitations.push('Fewer than 20 qualifying records returned; no full 20-item page established');
  if(result.duplicateDomains.length)result.limitations.push('Repeated website domains in returned candidates');
  if(data.searchStatus==='provider_unavailable')result.limitations.push('Provider unavailable and/or cached results used');
  return result;
 }catch(e){result.limitations.push(String(e instanceof Error?e.message:e).slice(0,250));return result;}
}
async function browserCheck(){
 const result={status:'blocked',firstFailure:null,desktop:null,mobile:null,firstPageRows:null,secondPageRows:null,pageCount:null};
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  page.setDefaultTimeout(18000);
  const rows=Array.from({length:43},(_,index)=>({type:'node',id:index+1,tags:{
   name:'Acceptance Financial Advisor '+String(index+1).padStart(2,'0'),
   website:'https://example-'+String(index+1).padStart(2,'0')+'.example',
   'addr:city':'Bel Air','addr:state':'Maryland',
   'contact:phone':'+1 555 0100'
  },sourceAgreement:['acceptance_fixture']}));
  await page.route('**/search',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:rows,source:'acceptance fixture',indexed:true})}));
  await page.route('**/search-online',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[],source:'acceptance fixture'})}));
  await page.goto(API+'/app',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#area').fill('Bel Air, Maryland');
  await page.locator('#search').click();
  await page.waitForFunction(()=>document.querySelector('#page-label')?.textContent?.includes('43 results'),null,{timeout:30000});
  result.pageCount=(await page.locator('#page-label').textContent())?.trim();
  result.firstPageRows=await page.locator('#results tr').count();
  if(result.firstPageRows!==20)throw Error('Expected 20 displayed results, got '+result.firstPageRows);
  if(!await page.locator('#results').innerText().then(t=>t.includes('Advisor 01')&&!t.includes('Advisor 21')))throw Error('Incorrect first-page boundaries');
  await page.locator('#next-page').click();
  result.secondPageRows=await page.locator('#results tr').count();
  if(result.secondPageRows!==20)throw Error('Second page must contain 20 different records');
  if(!await page.locator('#results').innerText().then(t=>t.includes('Advisor 21')&&!t.includes('Advisor 01')))throw Error('Pagination repeats or skips first-page leads');
  await page.locator('#previous-page').click();
  await page.screenshot({path:join(OUT,'leadflow-desktop.png'),fullPage:true});
  result.desktop=await page.evaluate(()=>({innerWidth,documentWidth:document.documentElement.scrollWidth}));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(OUT,'leadflow-390px.png'),fullPage:true});
  result.mobile=await page.evaluate(()=>({innerWidth,documentWidth:document.documentElement.scrollWidth,tableViewport:document.querySelector('.table-wrap')?.clientWidth,tableScroll:document.querySelector('.table-wrap')?.scrollWidth}));
  if(result.mobile.documentWidth>391)throw Error('390px viewport has horizontal page overflow: '+result.mobile.documentWidth);
  result.status='fixture-browser-passed';await context.close();
 }catch(e){result.firstFailure=String(e instanceof Error?e.message:e).slice(0,600)}
 finally{await browser.close()}
 return result;
}
await mkdir(OUT,{recursive:true});
const report={checkedAt:new Date().toISOString(),api:API,
  notes:['Discovery uses real public API responses; browser pagination uses 43 explicitly synthetic businesses, not real leads.','No messages or outreach sent; no library records changed.','Source availability and business contact verification are not inferred from API health.'],
  cases:[],browser:null};
for(const item of searches){const result=await probe(item);report.cases.push(result);console.log(JSON.stringify({case:result.case,status:result.status,count:result.count,limitations:result.limitations}))}
report.browser=await browserCheck();
await writeFile(join(OUT,'leadflow-acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({browserStatus:report.browser.status,firstFailure:report.browser.firstFailure}));
if(report.browser.status!=='fixture-browser-passed')process.exitCode=1;

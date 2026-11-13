/** Match visible published product wording, never a stored discovery label. */
function normalizeProductWords(value){
 return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(word=>word==='blankets'?'blanket':word).join(' ');
}
export function productTextMatches(html,query){
 const visible=String(html||'').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ');
 const phrase=normalizeProductWords(query);
 return phrase.length>=3&&(' '+normalizeProductWords(visible)+' ').includes(' '+phrase+' ');
}
export function supportedUSCatalogRecord(record){
 const evidence=String(record?.usEvidence||'');
 if(/not (?:independently )?verified|shipping offered|unknown/i.test(evidence))return false;
 if(/US mapped business|Wikidata.*(?:US|United States)/i.test(evidence))return true;
 if(record?.usEvidenceKind!=='first_party_location_statement'||!/^First-party published US office: [A-Za-z0-9 ,.-]{5,90}$/.test(evidence))return false;
 try{
  const website=new URL(record?.element?.tags?.website),source=new URL(record.usEvidenceSource);
  const host=u=>u.hostname.toLowerCase().replace(/^www\./,'');
  return website.protocol==='https:'&&source.protocol==='https:'&&host(website)===host(source)&&!website.username&&!website.password&&!source.username&&!source.password;
 }catch{return false}
}


/** Only an observable enabled shopping control on an official product page
 * establishes storefront functionality. Text in scripts, product descriptions
 * or hidden/disabled controls is not evidence that checkout is available.
 */
export function observedCommerceControl(html){
 const document=String(html||'').slice(0,2_000_000)
  .replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
 const hidden=attrs=>/(?:^|\s)(?:hidden|disabled)(?:\s|=|$)/i.test(attrs)||
  /\baria-hidden\s*=\s*["']?true/i.test(attrs)||
  /\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs);
 const kind=value=>{
  const normalized=normalizeProductWords(value.replace(/&(?:nbsp|amp);|&#160;/gi,' '));
  if(normalized.length>90)return;
  if(/^add to cart(?:\b|$)/.test(normalized))return 'Add to Cart';
  if(/^add to bag(?:\b|$)/.test(normalized))return 'Add to Bag';
  if(/^add to basket(?:\b|$)/.test(normalized))return 'Add to Basket';
  if(/^buy now(?:\b|$)/.test(normalized))return 'Buy Now';
 };
 for(const match of document.matchAll(/<button\b([^>]*)>([\s\S]{0,2500}?)<\/button>/gi)){
  if(hidden(match[1]))continue;
  const aria=match[1].match(/\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const text=(aria?.[1]||aria?.[2]||match[2].replace(/<[^>]*>/g,' ')).trim();
  const control=kind(text);
  if(control)return control;
 }
 for(const match of document.matchAll(/<input\b([^>]*?)\/?>/gi)){
  const attrs=match[1];
  if(hidden(attrs)||!/\btype\s*=\s*["']?(?:submit|button)(?=["'\s]|$)/i.test(attrs))continue;
  const value=attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const control=kind(value?.[1]||value?.[2]||'');
  if(control)return control;
 }
 return undefined;
}

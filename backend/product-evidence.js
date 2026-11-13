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

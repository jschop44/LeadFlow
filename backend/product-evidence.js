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
 return !/not (?:independently )?verified|shipping offered|unknown/i.test(evidence)&&/US mapped business|Wikidata.*(?:US|United States)/i.test(evidence);
}

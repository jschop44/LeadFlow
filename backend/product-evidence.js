/** Match visible published product wording, never a stored discovery label. */
export function productTextMatches(html,query){
 const text=String(html||'').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const phrase=String(query||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 return phrase.length>=3&&(' '+text+' ').includes(' '+phrase.replace(/blankets$/,'blanket')+' ' )||phrase.endsWith('blanket')&&(' '+text+' ').includes(' '+phrase+'s ');
}
export function supportedUSCatalogRecord(record){
 const evidence=String(record?.usEvidence||'');
 return !/not (?:independently )?verified|shipping offered|unknown/i.test(evidence)&&/US mapped business|Wikidata.*(?:US|United States)/i.test(evidence);
}

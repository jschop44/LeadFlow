/** Deduplicate specific OSM physical businesses by their durable element ID.
 * Franchise branches frequently share a single domain; collapsing by website
 * loses legitimate mapped premises and their distinct local contact options.
 * Keep domain identity for online-only companies, non-OSM records, and links
 * without separately sourced physical location identity.
 */
export function leadKey(x){
 const source=String(x?.source||'');
 const osm=source.match(/\b(node|way|relation)\/([1-9]\d{0,18})\b/i);
 if(osm&&/\bopenstreetmap\b/i.test(source))return 'osm:'+osm[1].toLowerCase()+'/'+osm[2];
 let domain='';
 try{
  const website=String(x?.website||'').trim();
  const u=new URL(/^https?:\/\//i.test(website)?website:'https://'+website);
  if(['http:','https:'].includes(u.protocol))domain=u.hostname.toLowerCase().replace(/^www\./,'');
 }catch{}
 return domain?'domain:'+domain:'listing:'+(String(x?.name||'')+'|'+String(x?.address||'')).toLowerCase().replace(/\s+/g,' ').trim();
}

/** A discovery query or previously assigned label is not niche evidence. */
export function supportsCatalogNiche(record,niche){
 if(!record?.niches?.includes(niche))return false;
 if(niche!=='Financial advisors')return true;
 const tags=record.element?.tags||{};
 const facts=['name','description','service','services'].map(key=>String(tags[key]||'')).join(' ');
 return /\b(?:financial advis(?:or|er)s?|financial plann(?:er|ing)|wealth manag(?:er|ement)|investment advis(?:or|er)s?|asset management)\b/i.test(facts);
}

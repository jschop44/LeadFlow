/** Match public business-category evidence, not a broad inferred search label. */
export function financialAdvisorEvidence(tags={}){
 const office=String(tags.office||'').toLowerCase().trim();
 // A source explicitly tagged financial_advisor is relevant, though the
 // public listing still requires identity verification.
 if(office==='financial_advisor')return true;
 // "financial" is a broad OSM office tag: mortgages, accountants, and even
 // mislabeled healthcare businesses cannot qualify without an offering claim.
 const visible=['name','description','service','services'].map(k=>String(tags[k]||'')).join(' ');
 return /\b(?:financial advis(?:or|er)s?|financial plann(?:er|ing)|wealth manag(?:er|ement)|investment advis(?:or|er)s?|retirement plann(?:er|ing)|certified financial planner|cfp)\b/i.test(visible);
}
export function pizzaRestaurantEvidence(tags={}){
 if(!/^(restaurant|fast_food)$/i.test(String(tags.amenity||'')))return false;
 return /(?:^|;)\s*pizza(?:\s|;|$)/i.test(String(tags.cuisine||''));
}

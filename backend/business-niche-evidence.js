/** Require published business identity/offering evidence, not a broad OSM office category. */
export function financialAdvisorEvidence(tags={}){
 const office=String(tags.office||'').toLowerCase().trim();
 if(office==='financial_advisor'||office==='investment_advisor'||office==='wealth_management')return true;
 // "financial" alone includes mortgages, accountants and erroneously tagged clinics.
 const visible=['name','description','service','services'].map(k=>String(tags[k]||'')).join(' ');
 return /\b(?:financial advis(?:or|er)s?|financial plann(?:er|ing)|wealth manag(?:er|ement)|investment advis(?:or|er)s?|retirement plann(?:er|ing)|certified financial planner|cfp)\b/i.test(visible);
}

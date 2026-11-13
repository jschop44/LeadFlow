/** A broad financial-office tag or inferred catalog niche is not advisory evidence. */
export function financialAdvisorEvidence(tags={}){
 const office=String(tags.office||'').toLowerCase().trim();
 if(office==='financial_advisor'||office==='investment_advisor'||office==='wealth_management')return true;
 const text=['name','description','service','services'].map(k=>String(tags[k]||'')).join(' ');
 return /\b(?:financial advis(?:or|er)s?|financial plann(?:er|ing)|wealth manag(?:er|ement)|investment advis(?:or|er)s?|retirement plann(?:er|ing)|certified financial planner|cfp)\b/i.test(text);
}

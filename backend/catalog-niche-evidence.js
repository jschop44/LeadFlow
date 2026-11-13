import {financialAdvisorEvidence} from './business-niche-evidence.js';
/** A discovery query or previously assigned label is not niche evidence. */
export function supportsCatalogNiche(record,niche){
 if(!record?.niches?.includes(niche))return false;
 if(niche!=='Financial advisors')return true;
 return financialAdvisorEvidence(record.element?.tags);
}

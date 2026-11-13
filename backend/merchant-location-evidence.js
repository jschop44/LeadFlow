import {productTextMatches} from './product-evidence.js';

function sameOfficialHost(website,source){
 try{
  const a=new URL(website),b=new URL(source);
  const host=url=>url.hostname.toLowerCase().replace(/^www\./,'');
  return a.protocol==='https:'&&b.protocol==='https:'&&!a.username&&!a.password&&!b.username&&!b.password&&host(a)===host(b);
 }catch{return false}
}
/**
 * Location evidence is an official merchant's own publicly visible claim,
 * NOT independently verified government incorporation or a shipping policy.
 * Only allow source pages on the same merchant hostname and exact visible
 * city/state or company-office phrases from the published page.
 */
export function firstPartyMerchantLocation(merchant,html){
 if(!merchant?.officePage||!merchant?.officePhrase||!merchant?.officeLocation||
    !sameOfficialHost(merchant.website,merchant.officePage)||
    !productTextMatches(html,merchant.officePhrase))return null;
 return {
  usEvidence:'First-party published US office: '+merchant.officeLocation,
  usEvidenceKind:'first_party_location_statement',
  usEvidenceSource:merchant.officePage
 };
}
/** Product evidence must always be fetched from the merchant's own HTTPS host. */
export function merchantProductPage(record){
 const website=record?.element?.tags?.website;
 const source=record?.productEvidencePage;
 return sameOfficialHost(website,source)?source:website;
}
export function sameMerchantHost(website,source){return sameOfficialHost(website,source)}

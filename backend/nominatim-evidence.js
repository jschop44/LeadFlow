/**
 * Translate Nominatim's own published OpenStreetMap tags to the same evidence
 * shape as regional and Overpass listings. A user's niche query is NOT proof
 * that a place offers that niche. In particular, pizza leads must have both
 * restaurant/fast-food type and independently tagged pizza cuisine or name.
 */
export function nominatimBusinessLead(place){
 if(!place||typeof place!=='object')return null;
 const lat=Number(place.lat),lon=Number(place.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -126||lon> -66)return null;
 if(place.address?.country_code&&String(place.address.country_code).toLowerCase()!=='us')return null;
 const category=String(place.category||place.class||'').toLowerCase();
 const kind=String(place.type||'').toLowerCase();
 const amenity=category==='amenity'&&['restaurant','fast_food'].includes(kind)?kind:'';
 const extra=place.extratags&&typeof place.extratags==='object'?place.extratags:{};
 const name=String(place.name||String(place.display_name||'').split(',')[0]).trim().slice(0,240);
 if(!name)return null;
 const cuisine=typeof extra.cuisine==='string'?extra.cuisine.slice(0,180):'';
 const website=typeof extra.website==='string'?extra.website.slice(0,500):'';
 const phone=typeof extra.phone==='string'?extra.phone.slice(0,100):'';
 const city=String(place.address?.city||place.address?.town||place.address?.village||'').slice(0,100);
 return {type:place.osm_type||'place',id:place.osm_id||place.place_id,lat,lon,tags:{
  name,website,phone,'addr:city':city,
  ...(amenity?{amenity}:{}),...(cuisine?{cuisine}:{})
 },sourceAgreement:['Nominatim search'],sourceCount:1,mlScore:0,
 listingVerification:'community_contributed_nominatim'};
}

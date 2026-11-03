#!/usr/bin/env python3
"""Build a real Maryland business index from Geofabrik OpenStreetMap data."""
import json, os, re
from pathlib import Path
import osmium

PBF=os.environ.get("OSM_PBF","/tmp/maryland.osm.pbf")
OUT=Path("backend/data/maryland-businesses.json")
CATEGORIES={
 "Financial advisors":[("office",re.compile(r"financial|investment|insurance",re.I))],
 "Real estate agents":[("office",re.compile(r"estate_agent",re.I))],
 "Accountants":[("office",re.compile(r"accountant",re.I))],
 "Insurance agencies":[("office",re.compile(r"insurance",re.I))],
 "Business coaches":[("office",re.compile(r"consulting",re.I))],
 "Marketing agencies":[("office",re.compile(r"advertising",re.I))],
 "Fitness coaches":[("leisure",re.compile(r"fitness_centre",re.I))],
 "Dental practices":[("amenity",re.compile(r"dentist",re.I))],
 "Med spas":[("beauty",re.compile(r"spa",re.I))],
 "Nutritionists":[("healthcare",re.compile(r"nutrition_counselling",re.I))],
 "Chiropractors":[("healthcare",re.compile(r"chiropractor",re.I))],
 "Wellness clinics":[("healthcare",re.compile(r"clinic",re.I))],
 "Couples counselors":[("healthcare",re.compile(r"psychotherapist",re.I))],
 "Wedding planners":[("office",re.compile(r"event_planner",re.I))],
}
# Specialized relationship services require explicit evidence in the business name or tags.
SPECIALIZED={
 "Dating coaches":re.compile(r"dating coach|dating consultant|dating mentor",re.I),
 "Matchmakers":re.compile(r"matchmak|match.?making",re.I),
 "Relationship coaches":re.compile(r"relationship coach|relationship counsel|relationship therap",re.I),
 "Couples counselors":re.compile(r"couples? counsel|marriage counsel|couples? therap|marriage therap",re.I),
 "Wedding planners":re.compile(r"wedding plann|wedding coordinat|bridal planning",re.I),
 "Nutritionists":re.compile(r"nutritionist|dietitian|nutrition counsel",re.I),
 "Med spas":re.compile(r"med(ical)? spa|aesthetic clinic|medical aesthetic",re.I),
 "Business coaches":re.compile(r"business coach|executive coach|business mentor",re.I),
 "Fitness coaches":re.compile(r"personal train|fitness coach|fitness trainer",re.I),
}
rows={}
class Collect(osmium.SimpleHandler):
 def add(self,obj,typ):
  tags=dict(obj.tags)
  name=tags.get("name","").strip()
  if not name:return
  # Do not infer relationship specialists from generic consulting offices.
  niches=[n for n,criteria in CATEGORIES.items() if any(rx.search(tags.get(k,"")) for k,rx in criteria)]
  searchable=" ".join([name,tags.get("description",""),tags.get("service",""),tags.get("services",""),tags.get("speciality","")])
  for niche,pattern in SPECIALIZED.items():
   if pattern.search(searchable) and niche not in niches:niches.append(niche)
  if not niches:return
  try:
   if typ=="node":lat,lon=obj.location.lat,obj.location.lon
   else:
    coords=[(n.lat,n.lon) for n in obj.nodes if n.location.valid()]
    if not coords:return
    lat=sum(x for x,y in coords)/len(coords);lon=sum(y for x,y in coords)/len(coords)
  except (ValueError,AttributeError):return
  if not 37.8<=lat<=39.8 or not -79.6<=lon<=-75.0:return
  keep={k:v for k,v in tags.items() if k in ("name","website","contact:website","phone","contact:phone","addr:city","addr:postcode","addr:street","addr:housenumber","office","amenity","healthcare","leisure","beauty")}
  rows[typ+"/"+str(obj.id)]={"type":typ,"id":obj.id,"lat":round(lat,6),"lon":round(lon,6),"tags":keep,"niches":niches,"sourceAgreement":["OpenStreetMap Geofabrik Maryland extract"]}
 def node(self,obj):self.add(obj,"node")
 def way(self,obj):self.add(obj,"way")
Collect().apply_file(PBF,locations=True,idx='flex_mem')
OUT.parent.mkdir(parents=True,exist_ok=True)
# Preserve independently sourced seed listings when the statewide OSM index refreshes.
seed_path=Path("backend/data/maryland-seed-businesses.json")
seed_records=json.loads(seed_path.read_text()).get("records",[]) if seed_path.exists() else []
osm_records=list(rows.values())
seen={(str(r.get("tags",{}).get("name","")).casefold(),str(r.get("tags",{}).get("addr:postcode",""))) for r in osm_records}
for record in seed_records:
 key=(str(record.get("tags",{}).get("name","")).casefold(),str(record.get("tags",{}).get("addr:postcode","")))
 if record.get("tags",{}).get("name") and key not in seen:
  osm_records.append(record)
  seen.add(key)
OUT.write_text(json.dumps({"source":"Geofabrik / OpenStreetMap contributors and attributed seed listings","region":"Maryland","records":osm_records},separators=(",",":")))
print("Indexed",len(rows),"named Maryland businesses")
if not rows:raise SystemExit("No real businesses extracted; refusing empty snapshot")

"""Exercise actual Pyosmium parsing in a disposable directory; no fixture is published."""
import gzip,json,os,pathlib,shutil,subprocess,sys,tempfile
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    work=pathlib.Path(directory)
    (work/'scripts').mkdir();(work/'backend/data').mkdir(parents=True)
    shutil.copy(root/'scripts/build_maryland_index.py',work/'scripts')
    shutil.copy(root/'backend/data/us-regions.json',work/'backend/data')
    source=work/'fixtures.osm'
    source.write_text('''<osm version="0.6" generator="isolated-test">
      <node id="1" lat="40.750" lon="-73.996"><tag k="name" v="Synthetic accounting fixture"/><tag k="office" v="accountant"/><tag k="contact:email" v="public@example.test"/><tag k="addr:postcode" v="10001"/></node>
      <node id="2" lat="34.05" lon="-118.24"><tag k="name" v="Outside-region fixture"/><tag k="office" v="accountant"/></node>
      <node id="3" lat="40.751" lon="-73.997"><tag k="name" v="Generic consultant fixture"/><tag k="office" v="consulting"/></node>
      <node id="4" lat="40.752" lon="-73.998"/>
      <node id="5" lat="40.753" lon="-73.999"/>
      <way id="10"><nd ref="4"/><nd ref="5"/><tag k="name" v="Named business on unnamed geometry"/><tag k="office" v="accountant"/></way>
      <node id="6" lat="40.754" lon="-73.995"><tag k="name" v="Test Pizza Restaurant"/><tag k="amenity" v="restaurant"/><tag k="cuisine" v="pizza;italian"/><tag k="description" v="Family pizzeria"/></node>
      <node id="7" lat="40.755" lon="-73.995"><tag k="name" v="Pizza supply warehouse"/><tag k="shop" v="wholesale"/><tag k="cuisine" v="pizza"/></node>
      <node id="8" lat="40.756" lon="-73.995"><tag k="name" v="Test cafe"/><tag k="amenity" v="restaurant"/><tag k="cuisine" v="coffee"/></node>
      <node id="9" lat="40.757" lon="-73.995"><tag k="name" v="Neighborhood Pizza"/><tag k="amenity" v="fast_food"/></node>
      <node id="10" lat="40.758" lon="-73.995"><tag k="name" v="Unrelated restaurant"/><tag k="amenity" v="restaurant"/><tag k="cuisine" v="italian"/></node>
    </osm>''')
    env={**os.environ,'LEADFLOW_REGION':'new-york','OSM_PBF':str(source)}
    subprocess.run([sys.executable,'scripts/build_maryland_index.py'],cwd=work,env=env,check=True)
    data=json.loads(gzip.decompress((work/'backend/data/us-regional/new-york.json.gz').read_bytes()))
    assert data['region_slug']=='new-york' and len(data['records'])==4
    row=next(r for r in data['records'] if r['type']=='node')
    way=next(r for r in data['records'] if r['type']=='way')
    assert way['id']==10 and way['lat']==40.7525 and way['lon']==-73.9985
    assert row['tags']['contact:email']=='public@example.test'
    assert row['niches']==['Accountants'] and 'New York' in row['sourceAgreement'][0]
    pizza=next(r for r in data['records'] if r['tags']['name']=='Test Pizza Restaurant')
    assert 'Pizza restaurants' in pizza['niches'] and pizza['tags']['cuisine']=='pizza;italian'
    assert pizza['tags']['description']=='Family pizzeria'
    assert not any(r['tags']['name'] in ('Pizza supply warehouse','Test cafe') for r in data['records'])
    named=next(r for r in data['records'] if r['tags']['name']=='Neighborhood Pizza')
    assert named['niches']==['Pizza restaurants']
    assert named['tags']['amenity']=='fast_food'
    assert not any(r['tags']['name']=='Unrelated restaurant' for r in data['records'])
    assert data['generated_at']
    # The plain startup snapshot and city-search gzip must remain identical
    # after a live importer refresh; outdated gzip was hiding all pizza leads.
    md=work/'fixtures-maryland.osm'
    md.write_text('''<osm version="0.6" generator="isolated-test">
      <node id="20" lat="39.536" lon="-76.350"><tag k="name" v="Bel Air Pizza House"/><tag k="amenity" v="restaurant"/></node>
      <node id="21" lat="39.537" lon="-76.351"><tag k="name" v="Green Street Diner"/><tag k="amenity" v="fast_food"/><tag k="cuisine" v="pizza"/></node>
      <node id="22" lat="39.538" lon="-76.352"><tag k="name" v="Pizza Supplier"/><tag k="shop" v="wholesale"/></node>
      <node id="23" lat="39.539" lon="-76.353"><tag k="name" v="Pasta Restaurant"/><tag k="amenity" v="restaurant"/><tag k="cuisine" v="italian"/></node>
    </osm>''')
    md_env={**os.environ,'OSM_PBF':str(md)}
    md_env.pop('LEADFLOW_REGION',None)
    subprocess.run([sys.executable,'scripts/build_maryland_index.py'],cwd=work,env=md_env,check=True)
    plain=json.loads((work/'backend/data/maryland-businesses.json').read_text())
    zipped=json.loads(gzip.decompress((work/'backend/data/us-regional/maryland.json.gz').read_bytes()))
    assert plain==zipped
    assert {r['tags']['name'] for r in plain['records']}=={'Bel Air Pizza House','Green Street Diner'}
print('Regional importer geography, named pizza evidence, shared Maryland indexes and attribution verified')

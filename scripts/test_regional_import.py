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
    </osm>''')
    env={**os.environ,'LEADFLOW_REGION':'new-york','OSM_PBF':str(source)}
    subprocess.run([sys.executable,'scripts/build_maryland_index.py'],cwd=work,env=env,check=True)
    data=json.loads(gzip.decompress((work/'backend/data/us-regional/new-york.json.gz').read_bytes()))
    assert data['region_slug']=='new-york' and len(data['records'])==1
    row=data['records'][0]
    assert row['tags']['contact:email']=='public@example.test'
    assert row['niches']==['Accountants'] and 'New York' in row['sourceAgreement'][0]
    assert data['generated_at']
print('Regional importer geography, niche, public contacts and attribution verified')

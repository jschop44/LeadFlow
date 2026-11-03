import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const port = 21000 + Math.floor(Math.random() * 1000);
const token = 'test-shared-intelligence-token';
const child = spawn(process.execPath, ['backend/server.js'], {
  env: {...process.env, PORT: String(port), API_TOKEN: 'separate-private-token',
    SHARED_INTELLIGENCE_TOKEN: token, ALLOWED_ORIGIN: 'https://leadflow-tp57.onrender.com'},
  stdio: 'pipe'
});
const base = 'http://127.0.0.1:' + port;
async function ready() {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error('LeadFlow server exited early');
    try { if ((await fetch(base + '/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('LeadFlow server startup timed out');
}
async function post(path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: 'POST', headers: {'content-type': 'application/json', ...headers},
    body: JSON.stringify(body)
  });
  return {status: response.status, data: await response.json()};
}
test('shared intelligence contract and isolation', async () => {
  try {
    await ready();
    const missing = await post('/intelligence', {query: 'financial'});
    assert.equal(missing.status, 401, 'Anonymous intelligence access must be rejected');
    const wrong = await post('/intelligence', {query: 'financial'},
      {'x-leadflow-token': 'incorrect-token'});
    assert.equal(wrong.status, 401, 'Invalid cross-app token must be rejected');

        const unauthorizedWrite = await post('/intelligence', {action:'feedback-sync',domain:'example.com',positive:1,negative:0}, {'x-leadflow-token':'separate-private-token'});
    assert.equal(unauthorizedWrite.status,403,'Ordinary API token must not write shared feedback');
    const invalidWrite = await post('/intelligence', {action:'feedback-sync',domain:'bad..domain',positive:1,negative:0}, {'x-leadflow-token':token});
    assert.equal(invalidWrite.status,200);
    assert.equal(invalidWrite.data.accepted,false);
    assert.equal(invalidWrite.data.reason,'invalid_domain');

    const unknownDomain = await post('/intelligence', {action:'feedback-sync',domain:'not-in-catalog.invalid',positive:1,negative:0}, {'x-leadflow-token':token});
    assert.equal(unknownDomain.status,200);
    assert.equal(unknownDomain.data.accepted,false);
    assert.equal(unknownDomain.data.reason,'unknown_catalog_domain');

    const authorized = await post('/intelligence', {query: '', limit: 3},
      {'x-leadflow-token': token});
    assert.equal(authorized.status, 200);
    assert.match(authorized.data.engine, /LeadFlow/);
    assert.match(authorized.data.model, /not a trained neural network/i);
    assert.ok(Array.isArray(authorized.data.leads));
    assert.ok(authorized.data.leads.length <= 3);
    assert.ok(Number.isInteger(authorized.data.catalogSize));
       assert.ok(Number.isInteger(authorized.data.refreshQueue.pending));
       assert.ok(authorized.data.refreshQueue.pending >= 0);
       assert.equal(authorized.data.refreshQueue.scheduledBatchSize, 12);
       assert.equal(authorized.data.refreshQueue.refreshIntervalMinutes, 15);
       assert.ok(Array.isArray(authorized.data.refreshQueue.next));
       assert.ok(authorized.data.refreshQueue.next.length <= 12);
    for (const lead of authorized.data.leads) {
      assert.equal(typeof lead.name, 'string');
      assert.equal(typeof lead.website, 'string');
      assert.ok(Number.isFinite(lead.score));
      assert.ok(lead.score >= 0 && lead.score <= 100);
         assert.ok(['recent','stale','unknown'].includes(lead.evidenceStatus));
         assert.equal(lead.needsRefresh, lead.evidenceStatus !== 'recent');
         assert.ok([0,5,15].includes(lead.freshnessPenalty));
         assert.ok(['low','medium','high'].includes(lead.refreshPriority));
         assert.equal(lead.refreshPriority, lead.ageDays === null || lead.ageDays > 30 ? 'high' : lead.ageDays > 7 ? 'medium' : 'low');
         assert.ok(lead.ageDays === null || Number.isInteger(lead.ageDays) && lead.ageDays >= 0);
      assert.ok(['Online', 'Local + Online'].includes(lead.classification));
      assert.equal(typeof lead.evidence, 'string');
    }
    const filtered = await post('/intelligence', {query: 'unmatchable-token-xyz-987', limit: 2},
      {'x-leadflow-token': token});
    assert.equal(filtered.status, 200);
    assert.deepEqual(filtered.data.leads, [], 'Unmatched queries must not invent leads');
    const forbidden = await post('/library', {action: 'list'},
      {'x-leadflow-token': token});
    assert.equal(forbidden.status, 401, 'Shared token must not grant private library access');
  } finally {
    child.kill();
  }
});

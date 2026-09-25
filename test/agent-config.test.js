const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function loadAgentEndpoints() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const start = html.indexOf("  var API = '");
  const end = html.indexOf('  var SESSION =', start);
  assert.ok(start !== -1 && end > start, 'could not find the shipped chat endpoint block');
  const source = html.slice(start, end);
  // Execute the same declarations the browser widget uses rather than copying
  // their values into the test.
  // eslint-disable-next-line no-new-func
  return new Function(`${source}; return { API, STREAM_API };`)();
}

test('chat requests use the live Render agent service', () => {
  const endpoints = loadAgentEndpoints();
  assert.equal(endpoints.API, 'https://rest-solar-agent-cm.onrender.com/api/chat');
  assert.equal(endpoints.STREAM_API, 'https://rest-solar-agent-cm.onrender.com/api/chat/stream');
});

// Runs the Code nodes from templates/google-sheets-to-sprkly-http.json under plain Node, with fake n8n inputs.
// No n8n, no network, no credentials. Run: node test/templates/sheets-http.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = JSON.parse(
	fs.readFileSync(path.join(__dirname, '..', '..', 'templates', 'google-sheets-to-sprkly-http.json'), 'utf8'),
);
const codeOf = (name) => {
	const node = workflow.nodes.find((n) => n.name === name);
	assert.ok(node, `node "${name}" is in workflow.json`);
	return node.parameters.jsCode;
};

// Runs one Code node. outputs maps a node name to the items $('name').all() gives back.
// staticData stands in for $getWorkflowStaticData('global').
function run(name, input, outputs = {}, staticData = {}, zoneName = 'Asia/Singapore') {
	const items = input.map((json) => ({ json }));
	const $input = { all: () => items, first: () => items[0] };
	const $ = (other) => {
		assert.ok(outputs[other], `test gives output for $('${other}')`);
		return { all: () => outputs[other] };
	};
	const fn = new Function('$input', '$', '$now', '$getWorkflowStaticData', codeOf(name));
	return fn($input, $, { zoneName }, () => staticData);
}

const row = (n, fields) => ({
	row_number: n + 1,
	'Row ID': n,
	Status: 'Approved',
	Caption: 'Example caption',
	'Schedule Time': '2099-03-01 09:00',
	Accounts: 'instagram:example_handle',
	'Media URL': '',
	...fields,
});

const rows = [
	row(1, { 'Media URL': 'https://example.com/a.jpg' }), // good
	row(2, { Caption: '   ' }), // no caption
	row(3, { 'Schedule Time': '2020-01-01 09:00' }), // past time
	row(4, { 'Schedule Time': '' }), // no time: must never reach Create
	row(5, { Accounts: 'telegram:Nobody here' }), // unknown account
	row(6, { Accounts: 'Instagram:@Example_Handle, telegram:Example channel' }), // duplicate on create
];

let passed = 0;
const test = (title, fn) => {
	fn();
	passed++;
	console.log(`ok - ${title}`);
};

// ----- Check each row -----
const checked = run('Check each row', rows);
const byRow = (list, n) => list.find((item) => item.json.row_number === n + 1).json;

test('six rows in, six rows out', () => assert.equal(checked.length, 6));

test('good row: valid, time read in the workflow zone, media kept', () => {
	const r = byRow(checked, 1);
	assert.equal(r.valid, true);
	assert.equal(r.scheduledTime, '2099-03-01T01:00:00.000Z'); // 09:00 in Singapore (UTC+8)
	assert.equal(r.mediaUrls, 'https://example.com/a.jpg');
	assert.deepEqual(r.accounts, ['instagram:example_handle']);
});

test('no caption: Error', () => {
	assert.deepEqual(byRow(checked, 2), { row_number: 3, valid: false, Status: 'Error', Error: 'Caption is empty.' });
});

test('past time: Error', () => {
	const r = byRow(checked, 3);
	assert.equal(r.valid, false);
	assert.match(r.Error, /in the past/);
});

test('no time: Error, never posts right away', () => {
	const r = byRow(checked, 4);
	assert.equal(r.valid, false);
	assert.match(r.Error, /never posts right away/);
});

test('time formats: seconds, one-digit hour, a zone, and nonsense', () => {
	const one = (time) => run('Check each row', [row(9, { 'Schedule Time': time })])[0].json;
	assert.equal(one('2099-03-01 9:00:00').scheduledTime, '2099-03-01T01:00:00.000Z');
	assert.equal(one('2099-03-01T09:00:00Z').scheduledTime, '2099-03-01T09:00:00.000Z');
	assert.equal(one('2099-03-01T09:00+02:00').scheduledTime, '2099-03-01T07:00:00.000Z');
	assert.match(one('2099-02-30 09:00').Error, /is not a time/);
	assert.match(one('01/03/2099 09:00').Error, /is not a time/);
	assert.match(one('2099-03-01').Error, /is not a time/);
});

// ----- Match accounts to rows -----
// What "Get sprkly accounts once" gives with Include Response Headers and Status: one item.
const connections = (accounts) => ({ statusCode: 200, headers: {}, body: { accounts } });
const accounts = [
	{ id: 'acc-ig', platform: 'instagram', handle: 'example_handle', displayName: 'Example' },
	{ id: 'acc-tg', platform: 'telegram', handle: 'Example channel' },
];
const matched = run('Match accounts to rows', [connections(accounts)], { 'Check each row': checked });

test('match: bad rows keep their Error, unknown account becomes one', () => {
	assert.equal(matched.length, 6);
	assert.equal(byRow(matched, 2).ready, false);
	assert.equal(byRow(matched, 2).Error, 'Caption is empty.');
	const r5 = byRow(matched, 5);
	assert.equal(r5.ready, false);
	assert.equal(r5.Status, 'Error');
	assert.match(r5.Error, /No connected sprkly account is telegram:Nobody here/);
});

test('match: case, @ and several accounts resolve to ids in the request', () => {
	assert.deepEqual(byRow(matched, 1).request, {
		profileIds: ['acc-ig'],
		caption: 'Example caption',
		scheduledTime: '2099-03-01T01:00:00.000Z',
		externalId: 'sheet-1',
		mediaUrls: ['https://example.com/a.jpg'],
	});
	assert.deepEqual(byRow(matched, 6).request.profileIds, ['acc-ig', 'acc-tg']);
	assert.equal('mediaUrls' in byRow(matched, 6).request, false);
});

test('only rows 1 and 6 reach Create, and both have a time', () => {
	const ready = matched.filter((item) => item.json.ready).map((item) => item.json);
	assert.deepEqual(ready.map((r) => r.rowId), ['1', '6']);
	for (const r of ready) assert.ok(r.request.scheduledTime);
});

test('no accounts connected: every valid row errors', () => {
	const none = run('Match accounts to rows', [connections([])], { 'Check each row': checked });
	assert.equal(none.filter((item) => item.json.ready).length, 0);
});

test('accounts call refused (401): every valid row gets the reason', () => {
	const refused = run('Match accounts to rows', [{ statusCode: 401, body: { error: 'Invalid API key', code: 'invalid_api_key' } }], {
		'Check each row': checked,
	});
	assert.equal(refused.filter((item) => item.json.ready).length, 0);
	assert.equal(byRow(refused, 1).Error, 'sprkly did not send your accounts: Invalid API key (HTTP 401)');
	assert.equal(byRow(refused, 2).Error, 'Caption is empty.');
});

// ----- Read the sprkly answer -----
// What "Schedule post in sprkly" gives with Include Response Headers and Status + Never Error.
const answer = (statusCode, body) => ({ statusCode, statusMessage: '', headers: {}, body });
const readOne = (res) => run('Read the sprkly answer', [res], { 'Match accounts to rows': matched })[0].json;

test('201: Scheduled with Post IDs and time', () => {
	const result = run('Read the sprkly answer', [
		answer(201, { postIds: ['post-111', 'post-112'], status: 'scheduled', scheduledTime: '2099-03-01T01:00:00.000Z' }),
		answer(201, { postIds: ['post-113'], status: 'scheduled', scheduledTime: '2099-03-01T01:00:00.000Z' }),
	], { 'Match accounts to rows': matched });
	assert.deepEqual(result[0].json, {
		row_number: 2,
		Status: 'Scheduled',
		'sprkly Post ID': 'post-111, post-112',
		'Scheduled For': '2099-03-01T01:00:00.000Z',
		Error: '',
	});
	assert.equal(result[1].json.row_number, 7);
});

test('409 duplicate: existing post ID, status mapped, not an error', () => {
	const dup = (existingStatus) => readOne(answer(409, {
		error: 'A post with this externalId already exists',
		code: 'duplicate_external_id',
		existingPostId: 'post-999',
		existingStatus,
	}));
	assert.deepEqual(dup('scheduled'), {
		row_number: 2,
		Status: 'Scheduled',
		'sprkly Post ID': 'post-999',
		'Scheduled For': '2099-03-01T01:00:00.000Z',
		Error: '',
	});
	assert.equal(dup('pending_approval').Status, 'Scheduled');
	assert.equal(dup('draft').Status, 'Scheduled');
	assert.equal(dup('posted').Status, 'Published');
	assert.equal(dup('failed').Status, 'Failed');
	assert.equal(dup(undefined).Status, 'Scheduled');
});

test('400: Status Error with the API error text', () => {
	assert.deepEqual(readOne(answer(400, { error: 'Instagram needs an image or a video', code: 'media_required' })), {
		row_number: 2,
		Status: 'Error',
		Error: 'Instagram needs an image or a video (HTTP 400, media_required)',
	});
});

test('401, 402, 429 and a network failure: Status Error with a reason', () => {
	assert.equal(readOne(answer(401, { error: 'Invalid API key', code: 'invalid_api_key' })).Error, 'Invalid API key (HTTP 401, invalid_api_key)');
	assert.equal(readOne(answer(402, { error: 'Your plan does not include the API', code: 'upgrade_required' })).Status, 'Error');
	assert.match(readOne(answer(429, { error: 'Too many requests', code: 'rate_limited' })).Error, /Too many requests \(HTTP 429/);
	assert.deepEqual(readOne({ error: 'getaddrinfo ENOTFOUND sprkly.app' }), {
		row_number: 2,
		Status: 'Error',
		Error: 'getaddrinfo ENOTFOUND sprkly.app',
	});
});

// ----- Status leg: Load the cursor, Find the row for each post -----
test('first run: cursor set to now, nothing emitted', () => {
	const store = {};
	const before = Date.now();
	assert.deepEqual(run('Load the cursor', [{}], {}, store), []);
	assert.ok(Date.parse(store.sprklyCursor) >= before - 1000);
	assert.deepEqual(store.sprklyHandled, []);
});

test('later run: asks for changes since the cursor', () => {
	const store = { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: [] };
	assert.deepEqual(run('Load the cursor', [{}], {}, store).map((i) => i.json), [{ updatedAfter: '2099-01-01T00:00:00.000Z' }]);
});

const post = (id, fields) => ({ id, status: 'scheduled', externalId: null, permalink: null, failedReason: null, deleted: false, updatedAt: '2099-01-01T00:00:01.000Z', ...fields });
const page = [
	post('p1', { status: 'posted', externalId: 'sheet-1', permalink: 'https://example.com/p/1', updatedAt: '2099-01-01T00:00:01.000Z' }),
	post('p2', { status: 'failed', externalId: 'sheet-6:telegram:acc-tg', failedReason: 'The channel is gone', updatedAt: '2099-01-01T00:00:02.000Z' }),
	post('p3', { status: 'posted', externalId: null, permalink: 'https://example.com/p/3', updatedAt: '2099-01-01T00:00:03.000Z' }),
	post('p4', { status: 'posted', externalId: 'row-42', updatedAt: '2099-01-01T00:00:04.000Z' }),
	post('p5', { status: 'posted', externalId: 'sheet-9', deleted: true, updatedAt: '2099-01-01T00:00:05.000Z' }),
	post('p6', { status: 'scheduled', externalId: 'sheet-10', updatedAt: '2099-01-01T00:00:06.000Z' }),
	post('p7', { status: 'published', externalId: 'sheet-11', permalink: 'https://example.com/p/7', updatedAt: '2099-01-01T00:00:07.000Z' }),
];

// What "Get changed posts" gives with Include Response Headers and Status + Never Error.
const changed = (posts, statusCode = 200) => ({ statusCode, headers: {}, body: { posts, count: posts.length } });

test('posted and failed map to their rows; deleted, outside and unfinished posts skipped; cursor advances', () => {
	const store = { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: [] };
	const out = run('Find the row for each post', [changed(page)], {}, store);
	assert.deepEqual(out.map((item) => item.json), [
		{ 'Row ID': '1', Status: 'Published', Link: 'https://example.com/p/1', Error: '' },
		{ 'Row ID': '6', Status: 'Failed', Link: '', Error: 'telegram: The channel is gone' },
		{ 'Row ID': '11', Status: 'Published', Link: 'https://example.com/p/7', Error: '' },
	]);
	assert.equal(store.sprklyCursor, '2099-01-01T00:00:07.000Z');
	assert.deepEqual(store.sprklyHandled, ['p1', 'p2', 'p7']);
});

test('a post seen twice (cursor is at or after) is written once', () => {
	const store = { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: [] };
	run('Find the row for each post', [changed(page.slice(0, 2))], {}, store);
	const again = run('Find the row for each post', [changed(page.slice(1, 3))], {}, store);
	assert.deepEqual(again, []);
	assert.equal(store.sprklyCursor, '2099-01-01T00:00:03.000Z');
});

test('empty page: cursor stays; handled list capped at 500', () => {
	const store = { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: Array.from({ length: 500 }, (_, i) => `old-${i}`) };
	assert.deepEqual(run('Find the row for each post', [changed([])], {}, store), []);
	assert.equal(store.sprklyCursor, '2099-01-01T00:00:00.000Z');
	run('Find the row for each post', [changed(page.slice(0, 1))], {}, store);
	assert.equal(store.sprklyHandled.length, 500);
	assert.equal(store.sprklyHandled[499], 'p1');
	assert.equal(store.sprklyHandled[0], 'old-1');
});

test('bad key (401), sprkly down, or no answer: nothing written, cursor and handled list stay', () => {
	for (const res of [
		{ statusCode: 401, headers: {}, body: { error: 'Invalid API key', code: 'invalid_api_key' } },
		{ statusCode: 500, headers: {}, body: { posts: page } },
		{ error: 'getaddrinfo ENOTFOUND sprkly.app' },
	]) {
		const store = { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: ['old-1'] };
		assert.deepEqual(run('Find the row for each post', [res], {}, store), []);
		assert.deepEqual(store, { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: ['old-1'] });
	}
});

test('two accounts on one row, both posted: one item with both links', () => {
	const store = { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: [] };
	const out = run('Find the row for each post', [changed([
		post('m1', { status: 'posted', platforms: ['instagram'], externalId: 'sheet-6:instagram:acc-ig', permalink: 'https://example.com/ig/1' }),
		post('m2', { status: 'posted', platforms: ['telegram'], externalId: 'sheet-6:telegram:acc-tg', permalink: 'https://example.com/tg/1' }),
	])], {}, store);
	assert.deepEqual(out.map((item) => item.json), [
		{ 'Row ID': '6', Status: 'Published', Link: 'https://example.com/ig/1 https://example.com/tg/1', Error: '' },
	]);
	assert.deepEqual(store.sprklyHandled, ['m1', 'm2']);
});

test('one row, one posted and one failed: Failed with the reason and the one link', () => {
	const out = run('Find the row for each post', [changed([
		post('m1', { status: 'posted', platforms: ['instagram'], externalId: 'sheet-6:instagram:acc-ig', permalink: 'https://example.com/ig/1' }),
		post('m2', { status: 'failed', platforms: ['tiktok'], externalId: 'sheet-6:tiktok:acc-tt', failedReason: 'Video is too long' }),
	])], {}, { sprklyCursor: '2099-01-01T00:00:00.000Z', sprklyHandled: [] });
	assert.deepEqual(out.map((item) => item.json), [
		{ 'Row ID': '6', Status: 'Failed', Link: 'https://example.com/ig/1', Error: 'tiktok: Video is too long' },
	]);
});

console.log(`\n${passed} passed`);

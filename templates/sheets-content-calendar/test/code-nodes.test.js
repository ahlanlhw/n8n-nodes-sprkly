// Runs the Code nodes from workflow.json under plain Node, with fake n8n inputs.
// No n8n, no network, no credentials. Run: node templates/sheets-content-calendar/test/code-nodes.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflow.json'), 'utf8'));
const codeOf = (name) => {
	const node = workflow.nodes.find((n) => n.name === name);
	assert.ok(node, `node "${name}" is in workflow.json`);
	return node.parameters.jsCode;
};

// Runs one Code node. outputs maps a node name to the items $('name').all() gives back.
function run(name, input, outputs = {}, zoneName = 'Asia/Singapore') {
	const items = input.map((json) => ({ json }));
	const $input = { all: () => items };
	const $ = (other) => {
		assert.ok(outputs[other], `test gives output for $('${other}')`);
		return { all: () => outputs[other] };
	};
	const fn = new Function('$input', '$', '$now', codeOf(name));
	return fn($input, $, { zoneName });
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
const accounts = [
	{ id: 'acc-ig', platform: 'instagram', handle: 'example_handle' },
	{ id: 'acc-tg', platform: 'telegram', handle: 'Example channel' },
];
const matched = run('Match accounts to rows', accounts, { 'Check each row': checked });

test('match: bad rows keep their Error, unknown account becomes one', () => {
	assert.equal(matched.length, 6);
	assert.equal(byRow(matched, 2).ready, false);
	assert.equal(byRow(matched, 2).Error, 'Caption is empty.');
	const r5 = byRow(matched, 5);
	assert.equal(r5.ready, false);
	assert.equal(r5.Status, 'Error');
	assert.match(r5.Error, /No connected sprkly account is telegram:Nobody here/);
});

test('match: case, @ and several accounts resolve to ids', () => {
	assert.deepEqual(byRow(matched, 1).profileIds, ['acc-ig']);
	assert.deepEqual(byRow(matched, 6).profileIds, ['acc-ig', 'acc-tg']);
});

test('only rows 1 and 6 reach Create, and both have a time', () => {
	const ready = matched.filter((item) => item.json.ready).map((item) => item.json);
	assert.deepEqual(ready.map((r) => r.rowId), ['1', '6']);
	for (const r of ready) assert.ok(r.scheduledTime);
});

test('no accounts from sprkly (empty item): every valid row errors', () => {
	const none = run('Match accounts to rows', [{}], { 'Check each row': checked });
	assert.equal(none.filter((item) => item.json.ready).length, 0);
});

// ----- Read the sprkly answer -----
// What the sprkly node gives back with Continue On Fail: one item per row sent.
const answers = [
	{ postIds: ['post-111'], status: 'scheduled', scheduledTime: '2099-03-01T01:00:00.000Z' },
	{
		error: "A post with this 'External ID' already exists: post-999",
		description: 'Nothing new was posted. The existing post is post-999 (status scheduled). Code: duplicate_external_id',
	},
];
const result = run('Read the sprkly answer', answers, { 'Match accounts to rows': matched });

test('good row: Scheduled with Post ID and time', () => {
	assert.deepEqual(result[0].json, {
		row_number: 2,
		Status: 'Scheduled',
		'sprkly Post ID': 'post-111',
		'Scheduled For': '2099-03-01T01:00:00.000Z',
		Error: '',
	});
});

test('duplicate: Scheduled with the existing Post ID, not an error', () => {
	assert.deepEqual(result[1].json, { row_number: 7, Status: 'Scheduled', 'sprkly Post ID': 'post-999', Error: '' });
});

test('other error: Status Error with the message', () => {
	const other = run('Read the sprkly answer', [{ error: 'Instagram needs an image or a video', description: 'Code: media_required' }], {
		'Match accounts to rows': matched,
	});
	assert.deepEqual(other[0].json, { row_number: 2, Status: 'Error', Error: 'Instagram needs an image or a video Code: media_required' });
});

// ----- Find the row for the post -----
test('status leg: published, failed, several accounts, and posts from elsewhere', () => {
	const out = run('Find the row for the post', [
		{ id: 'p1', status: 'posted', externalId: 'sheet-1', permalink: 'https://example.com/p/1' },
		{ id: 'p2', status: 'failed', externalId: 'sheet-6:telegram:acc-tg', failedReason: 'The channel is gone' },
		{ id: 'p3', status: 'posted', externalId: null, permalink: 'https://example.com/p/3' },
		{ id: 'p4', status: 'posted', externalId: 'row-42', permalink: 'https://example.com/p/4' },
	]);
	assert.deepEqual(out.map((item) => item.json), [
		{ 'Row ID': '1', Status: 'Published', Link: 'https://example.com/p/1', Error: '' },
		{ 'Row ID': '6', Status: 'Failed', Error: 'The channel is gone' },
	]);
});

console.log(`\n${passed} passed`);

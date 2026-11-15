// Runs the built sprkly node and trigger with a fake n8n context and a fake sprkly API.
// No n8n, no network, no credentials. Run: npm run build && node --test test/
'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { Sprkly } = require('../dist/nodes/Sprkly/Sprkly.node.js');
const { SprklyTrigger } = require('../dist/nodes/SprklyTrigger/SprklyTrigger.node.js');

const ACCOUNTS = [
	{ id: 'acc-ig', platform: 'instagram', handle: 'example_handle' },
	{ id: 'acc-tg', platform: 'telegram', handle: 'Example channel' },
	{ id: 'acc-x1', platform: 'x', handle: 'twin' },
	{ id: 'acc-x2', platform: 'x', handle: 'Twin' },
];

// A fake API. routes maps "METHOD /path" to (request) => [statusCode, body].
function fakeApi(routes) {
	const calls = [];
	const httpRequestWithAuthentication = async (_credential, request) => {
		const path = request.url.replace('https://sprkly.app', '');
		calls.push({ method: request.method, path, body: request.body });
		const route = routes[`${request.method} ${path}`];
		assert.ok(route, `the test has a route for ${request.method} ${path}`);
		const [statusCode, body] = route(request);
		return { statusCode, body, headers: {} };
	};
	return { calls, httpRequestWithAuthentication };
}

const connections = () => [200, { accounts: ACCOUNTS }];
const created = (request) => [
	201,
	{
		postIds: request.body.profileIds.map((id) => `post-${id}`),
		status: 'scheduled',
		scheduledTime: request.body.scheduledTime ?? '2026-11-15T00:01:00.000Z',
	},
];

// Runs Post: Create. params is the node's parameters, the same for every item unless a value
// is a function of the item.
async function runCreate({
	items = [{}],
	params = {},
	routes = {},
	typeVersion = 1.1,
	continueOnFail = false,
}) {
	const api = fakeApi({
		'GET /api/v1/connections': connections,
		'POST /api/v1/posts': created,
		...routes,
	});
	const node = { name: 'sprkly', type: 'n8n-nodes-sprkly.sprkly', typeVersion, parameters: {} };
	const all = { resource: 'post', operation: 'create', ...params };
	const context = {
		getInputData: () => items.map((json) => ({ json })),
		getNodeParameter: (name, i, fallback) => {
			const value = all[name];
			if (value === undefined) return fallback;
			return typeof value === 'function' ? value({ json: items[i] }, i) : value;
		},
		getTimezone: () => 'Asia/Singapore',
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		getCredentials: async () => ({ apiKey: 'test', baseUrl: 'https://sprkly.app' }),
		helpers: { httpRequestWithAuthentication: api.httpRequestWithAuthentication },
	};
	const [out] = await new Sprkly().execute.call(context);
	return { out: out.map((entry) => entry.json), calls: api.calls };
}

const FUTURE = '2099-03-01 09:00';
const rowParams = (extra = {}) => ({
	accountMode: 'name',
	accountNames: (item) => item.json.Accounts,
	caption: (item) => item.json.Caption,
	scheduledTime: (item) => item.json['Schedule Time'],
	additionalFields: (item) => ({
		externalId: `sheet-${item.json['Row ID']}`,
		mediaUrls: item.json['Media URL'],
	}),
	output: 'resultRow',
	...extra,
});
const sheetRow = (n, fields = {}) => ({
	row_number: n + 1,
	'Row ID': n,
	Status: 'Approved',
	Caption: 'Example caption',
	'Schedule Time': FUTURE,
	Accounts: 'instagram:example_handle',
	'Media URL': '',
	...fields,
});

// ----- Accounts By Name -----

test('names: case, spaces and a leading @ match; several accounts resolve to ids', async () => {
	const { calls } = await runCreate({
		items: [sheetRow(1, { Accounts: ' Instagram:@Example_Handle ,telegram:example CHANNEL' })],
		params: rowParams(),
	});
	assert.deepEqual(calls[1].body.profileIds, ['acc-ig', 'acc-tg']);
});

test('names: unknown, ambiguous and not platform:handle are row problems, nothing is sent', async () => {
	const { out, calls } = await runCreate({
		items: [
			sheetRow(1, { Accounts: 'telegram:Nobody here' }),
			sheetRow(2, { Accounts: 'x:twin' }),
			sheetRow(3, { Accounts: 'example_handle' }),
		],
		params: rowParams(),
	});
	assert.match(out[0].error, /No connected sprkly account is telegram:Nobody here/);
	assert.match(out[1].error, /More than one connected sprkly account is x:twin/);
	assert.match(out[2].error, /is not platform:handle/);
	assert.ok(out.every((row) => row.ok === false && row.status === 'Error'));
	assert.equal(calls.filter((call) => call.method === 'POST').length, 0);
});

test('names: one /connections call per execution, however many items', async () => {
	const { calls } = await runCreate({
		items: [sheetRow(1), sheetRow(2), sheetRow(3)],
		params: rowParams(),
	});
	assert.equal(calls.filter((call) => call.path === '/api/v1/connections').length, 1);
	assert.equal(calls.filter((call) => call.method === 'POST').length, 3);
});

// ----- Schedule guard -----

test('time: empty and Post Now off is refused, in Result Row and in API Response', async () => {
	const rows = await runCreate({
		items: [sheetRow(1, { 'Schedule Time': '' })],
		params: rowParams(),
	});
	assert.match(rows.out[0].error, /Schedule Time is empty/);
	assert.equal(rows.calls.filter((call) => call.method === 'POST').length, 0);

	await assert.rejects(
		runCreate({ params: { profileIds: ['acc-ig'], caption: 'Hi', scheduledTime: '' } }),
		/Schedule Time is empty/,
	);
});

test('time: empty and Post Now on sends no time', async () => {
	const { out, calls } = await runCreate({
		items: [sheetRow(1, { 'Schedule Time': '' })],
		params: rowParams({ postNow: true }),
	});
	assert.equal(out[0].ok, true);
	assert.equal('scheduledTime' in calls[1].body, false);
});

test('time: version 1 keeps sending an empty time as post now', async () => {
	const { calls } = await runCreate({
		typeVersion: 1,
		params: { profileIds: ['acc-ig'], caption: 'Hi', scheduledTime: '' },
	});
	assert.equal('scheduledTime' in calls[0].body, false);
});

test('time: plain local time is read in the workflow time zone', async () => {
	const { calls } = await runCreate({
		items: [sheetRow(1, { 'Schedule Time': '2099-12-20 9:00' })],
		params: rowParams(),
	});
	assert.equal(calls[1].body.scheduledTime, '2099-12-20T01:00:00.000Z');
});

test('time: past, slash dates and impossible dates are row problems', async () => {
	const { out } = await runCreate({
		items: [
			sheetRow(1, { 'Schedule Time': '2020-01-01 09:00' }),
			sheetRow(2, { 'Schedule Time': '01/12/2026' }),
			sheetRow(3, { 'Schedule Time': '2099-02-30 09:00' }),
		],
		params: rowParams(),
	});
	assert.match(out[0].error, /is in the past/);
	assert.match(out[1].error, /01\/12\/2026 can be read two ways/);
	assert.match(out[2].error, /is not a time sprkly can read/);
});

// ----- Result Row -----

test('result row 201: Scheduled with ids, time and the input fields', async () => {
	const { out } = await runCreate({ items: [sheetRow(1)], params: rowParams() });
	assert.deepEqual(out[0], {
		...sheetRow(1),
		ok: true,
		status: 'Scheduled',
		postId: 'post-acc-ig',
		postIds: ['post-acc-ig'],
		scheduledFor: '2099-03-01T01:00:00.000Z',
		link: '',
		error: '',
		externalId: 'sheet-1',
	});
});

test('result row: Keep Input Fields off gives the result alone', async () => {
	const { out } = await runCreate({
		items: [sheetRow(1)],
		params: rowParams({ keepInputFields: false }),
	});
	assert.equal('row_number' in out[0], false);
	assert.equal(out[0].status, 'Scheduled');
});

for (const [existingStatus, status, link, error] of [
	['scheduled', 'Scheduled', '', ''],
	['pending_approval', 'Scheduled', '', ''],
	['posted', 'Published', 'https://example.com/p/1', ''],
	['failed', 'Failed', '', 'The channel is gone'],
]) {
	test(`result row 409 duplicate, existing ${existingStatus}: ok, ${status}, time filled`, async () => {
		const { out } = await runCreate({
			items: [sheetRow(1)],
			params: rowParams(),
			routes: {
				'POST /api/v1/posts': () => [
					409,
					{
						error: 'Duplicate externalId',
						code: 'duplicate_external_id',
						existingPostId: 'post-999',
						existingStatus,
					},
				],
				'GET /api/v1/posts/post-999': () => [
					200,
					{
						id: 'post-999',
						status: existingStatus,
						caption: 'Example caption',
						scheduledTime: '2099-03-01T01:00:00.000Z',
						permalink: link || null,
						failedReason: error || null,
					},
				],
			},
		});
		assert.deepEqual(
			{
				ok: out[0].ok,
				status: out[0].status,
				postId: out[0].postId,
				scheduledFor: out[0].scheduledFor,
				link: out[0].link,
				error: out[0].error,
			},
			{
				ok: true,
				status,
				postId: 'post-999',
				scheduledFor: '2099-03-01T01:00:00.000Z',
				link,
				error,
			},
		);
	});
}

// A 409 for External ID sheet-1, whose existing post-999 has these fields.
const duplicateRoutes = (existing) => ({
	'POST /api/v1/posts': () => [
		409,
		{
			error: 'Duplicate externalId',
			code: 'duplicate_external_id',
			existingPostId: 'post-999',
			existingStatus: 'scheduled',
		},
	],
	'GET /api/v1/posts/post-999': () => [
		200,
		{
			id: 'post-999',
			status: 'scheduled',
			caption: 'Example caption',
			scheduledTime: '2099-03-01T01:00:00.000Z',
			deleted: false,
			...existing,
		},
	],
});
const OTHER_ROW =
	'Another row or an older version of this row already used this ID. sprkly kept the first post. Give each row its own ID, or edit that post in sprkly.';

test('result row 409: same caption (spaces and line endings aside) and time within 60s is ok', async () => {
	const { out } = await runCreate({
		items: [sheetRow(1, { Caption: ' Line one\r\nLine two ' })],
		params: rowParams(),
		routes: duplicateRoutes({
			caption: 'Line one\nLine two',
			scheduledTime: '2099-03-01T01:00:59.000Z',
		}),
	});
	assert.equal(out[0].ok, true);
	assert.equal(out[0].status, 'Scheduled');
	assert.equal(out[0].postId, 'post-999');
});

for (const [what, existing, error] of [
	['another caption', { caption: 'Row one caption' }, OTHER_ROW],
	['a time 61s away', { scheduledTime: '2099-03-01T01:01:01.000Z' }, OTHER_ROW],
	[
		'a deleted post',
		{ deleted: true },
		'This ID was used by a post that was deleted. Give the row a new ID.',
	],
]) {
	test(`result row 409, existing post has ${what}: Error with the existing id`, async () => {
		const { out } = await runCreate({
			items: [sheetRow(1)],
			params: rowParams(),
			routes: duplicateRoutes(existing),
		});
		assert.deepEqual(
			{ ok: out[0].ok, status: out[0].status, postId: out[0].postId, error: out[0].error },
			{ ok: false, status: 'Error', postId: 'post-999', error },
		);
	});
}

test('result row 400: Error with the API text', async () => {
	const { out } = await runCreate({
		items: [sheetRow(1)],
		params: rowParams(),
		routes: {
			'POST /api/v1/posts': () => [
				400,
				{ error: 'Instagram needs an image or a video', code: 'media_required' },
			],
		},
	});
	assert.equal(out[0].ok, false);
	assert.equal(out[0].status, 'Error');
	assert.equal(out[0].error, 'Instagram needs an image or a video');
});

test('result row: no caption and a media link that is not http are row problems', async () => {
	const { out } = await runCreate({
		items: [sheetRow(1, { Caption: '  ' }), sheetRow(2, { 'Media URL': 'photo.jpg' })],
		params: rowParams(),
	});
	assert.equal(out[0].error, 'Caption is empty.');
	assert.match(out[1].error, /Media URL photo\.jpg is not a web link/);
});

test('result row: a field expression that fails is a row problem, the next row still goes', async () => {
	const { out } = await runCreate({
		items: [sheetRow(1), sheetRow(2)],
		params: rowParams({
			additionalFields: (item) => {
				if (item.json['Row ID'] === 1) throw new Error('Expression failed');
				return { externalId: `sheet-${item.json['Row ID']}` };
			},
		}),
	});
	assert.deepEqual(
		out.map((row) => [row.status, row.error]),
		[
			['Error', 'Expression failed'],
			['Scheduled', ''],
		],
	);
});

test('result row: a 401 stops the run once', async () => {
	await assert.rejects(
		runCreate({
			items: [sheetRow(1), sheetRow(2)],
			params: rowParams(),
			routes: {
				'GET /api/v1/connections': () => [
					401,
					{ error: 'Invalid API key', code: 'invalid_api_key' },
				],
			},
		}),
		/Invalid API key/,
	);
});

test('media: one cell with commas, spaces and new lines; an empty cell sends none', async () => {
	const { calls } = await runCreate({
		items: [
			sheetRow(1, {
				'Media URL':
					'https://example.com/a.jpg, https://example.com/b.jpg\nhttps://example.com/c.jpg https://example.com/d.jpg',
			}),
			sheetRow(2, { 'Media URL': '' }),
		],
		params: rowParams(),
	});
	const posts = calls.filter((call) => call.method === 'POST');
	assert.deepEqual(posts[0].body.mediaUrls, [
		'https://example.com/a.jpg',
		'https://example.com/b.jpg',
		'https://example.com/c.jpg',
		'https://example.com/d.jpg',
	]);
	assert.equal('mediaUrls' in posts[1].body, false);
});

// ----- API Response mode stays as it was -----

test('api response 201: the API answer as it is', async () => {
	const { out, calls } = await runCreate({
		params: { profileIds: ['acc-ig'], caption: 'Hi', scheduledTime: '2099-03-01T09:00:00Z' },
	});
	assert.deepEqual(out, [
		{ postIds: ['post-acc-ig'], status: 'scheduled', scheduledTime: '2099-03-01T09:00:00.000Z' },
	]);
	assert.deepEqual(calls[0].body, {
		profileIds: ['acc-ig'],
		caption: 'Hi',
		scheduledTime: '2099-03-01T09:00:00.000Z',
	});
});

test('api response 409: throws the duplicate as before', async () => {
	await assert.rejects(
		runCreate({
			params: {
				profileIds: ['acc-ig'],
				caption: 'Hi',
				scheduledTime: '2099-03-01T09:00:00Z',
				additionalFields: { externalId: 'row-1' },
			},
			routes: {
				'POST /api/v1/posts': () => [
					409,
					{
						error: 'Duplicate externalId',
						code: 'duplicate_external_id',
						existingPostId: 'post-999',
						existingStatus: 'scheduled',
					},
				],
			},
		}),
		/A post with this 'External ID' already exists: post-999/,
	);
});

// ----- Trigger -----

async function runTrigger(posts, params = {}) {
	const state = { event: 'postPublished', cursor: '2026-11-15T00:00:00.000Z', seenAtCursor: [] };
	const all = { event: 'postPublished', ...params };
	const context = {
		getNodeParameter: (name, fallback) => (all[name] === undefined ? fallback : all[name]),
		getMode: () => 'trigger',
		getWorkflowStaticData: () => state,
		getNode: () => ({ name: 'sprkly Trigger', typeVersion: 1, parameters: {} }),
		getCredentials: async () => ({ apiKey: 'test', baseUrl: 'https://sprkly.app' }),
		helpers: {
			httpRequestWithAuthentication: async () => ({
				statusCode: 200,
				body: { posts },
				headers: {},
			}),
			returnJsonArray: (list) => list.map((json) => ({ json })),
		},
	};
	const result = await new SprklyTrigger().poll.call(context);
	return result ? result[0].map((entry) => entry.json) : [];
}

const post = (id, externalId, fields = {}) => ({
	id,
	status: 'posted',
	externalId,
	platforms: ['telegram'],
	profileIds: ['acc-tg'],
	permalink: `https://example.com/${id}`,
	failedReason: null,
	updatedAt: `2026-11-15T00:00:0${id.slice(-1)}.000Z`,
	...fields,
});

test('trigger: sourceId with and without the account suffix, colons kept, flat fields', async () => {
	const out = await runTrigger([
		post('p1', 'sheet-1'),
		post('p2', 'sheet-6:telegram:acc-tg'),
		post('p3', 'sheet-a:b'),
		post('p4', null),
		post('p5', 'sheet-7', {
			status: 'failed',
			permalink: null,
			failedReason: 'The channel is gone',
		}),
	]);
	assert.deepEqual(
		out.map((p) => [p.sourceId, p.statusLabel, p.link, p.error]),
		[
			['sheet-1', 'Published', 'https://example.com/p1', ''],
			['sheet-6', 'Published', 'https://example.com/p2', ''],
			['sheet-a:b', 'Published', 'https://example.com/p3', ''],
			['', 'Published', 'https://example.com/p4', ''],
			['sheet-7', 'Failed', '', 'The channel is gone'],
		],
	);
	assert.equal(out[0].status, 'posted'); // the post's own fields stay as they were
	assert.equal(out[1].externalId, 'sheet-6:telegram:acc-tg');
});

test('trigger: External ID Starts With filters, and can be removed from sourceId', async () => {
	const posts = [
		post('p1', 'sheet-1'),
		post('p2', 'sheet-6:telegram:acc-tg'),
		post('p3', 'row-42'),
		post('p4', null),
	];
	const kept = await runTrigger(posts, { externalIdPrefix: 'sheet-' });
	assert.deepEqual(
		kept.map((p) => p.sourceId),
		['sheet-1', 'sheet-6'],
	);
	const stripped = await runTrigger(posts, { externalIdPrefix: 'sheet-', stripPrefix: true });
	assert.deepEqual(
		stripped.map((p) => p.sourceId),
		['1', '6'],
	);
});

// Static checks on templates/google-sheets-to-sprkly.json. No n8n run, no network, no credentials.
// Run from the repo root after npm run build:
//   node test/templates/sheets-node.test.js [path to n8n-nodes-base]
// With the n8n-nodes-base path (or env N8N_NODES_BASE), each n8n node type and version is checked against that install.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..', '..');
const text = fs.readFileSync(path.join(repo, 'templates', 'google-sheets-to-sprkly.json'), 'utf8');
const workflow = JSON.parse(text);
const nodesBase = process.argv[2] || process.env.N8N_NODES_BASE;

let passed = 0;
let skipped = 0;
const test = (title, fn) => {
	fn();
	passed++;
	console.log(`ok - ${title}`);
};

const isNote = (node) => node.type === 'n8n-nodes-base.stickyNote';
const steps = workflow.nodes.filter((node) => !isNote(node));
const notes = workflow.nodes.filter(isNote);
const words = (content) => content.replace(/[#*`]/g, ' ').split(/\s+/).filter(Boolean).length;

// Every version a node class offers: a versioned node lists them, a plain one has description.version.
function versionsOf(exported) {
	const NodeClass = Object.values(exported).find((value) => typeof value === 'function');
	const instance = new NodeClass();
	if (instance.nodeVersions) return Object.keys(instance.nodeVersions).map(Number);
	const version = instance.description.version;
	return Array.isArray(version) ? version : [version];
}

test('workflow.json parses and has nodes, connections and settings', () => {
	assert.ok(Array.isArray(workflow.nodes));
	assert.equal(typeof workflow.connections, 'object');
	assert.equal(workflow.settings.executionOrder, 'v1');
});

test('no Code nodes; six or seven steps', () => {
	assert.equal(steps.filter((node) => node.type === 'n8n-nodes-base.code').length, 0);
	assert.ok(steps.length >= 6 && steps.length <= 7, `${steps.length} steps`);
});

test('node names are unique', () => {
	const names = workflow.nodes.map((node) => node.name);
	assert.equal(new Set(names).size, names.length);
});

test('every connection points at a node, and every step is connected', () => {
	const names = new Set(workflow.nodes.map((node) => node.name));
	const linked = new Set();
	for (const [from, outputs] of Object.entries(workflow.connections)) {
		assert.ok(names.has(from), `connection from ${from}`);
		linked.add(from);
		for (const output of outputs.main) {
			for (const target of output) {
				assert.ok(names.has(target.node), `connection to ${target.node}`);
				linked.add(target.node);
			}
		}
	}
	for (const step of steps) assert.ok(linked.has(step.name), `${step.name} is connected`);
});

test('no credentials, sheet ids, keys or pinned data', () => {
	assert.ok(!workflow.pinData || Object.keys(workflow.pinData).length === 0);
	for (const node of workflow.nodes) {
		assert.equal(node.credentials, undefined, `${node.name} has no credentials`);
		assert.equal(node.webhookId, undefined, `${node.name} has no webhookId`);
		if (node.parameters.documentId) assert.equal(node.parameters.documentId.value, '');
		if (node.parameters.sheetName) assert.equal(node.parameters.sheetName.value, '');
	}
	assert.doesNotMatch(text, /sk_live_|docs\.google\.com\/spreadsheets\/d\/|"apiKey"|"accessToken"/);
});

test('links are only the sprkly API docs and the GitHub repo, no tracking', () => {
	const links = text.match(/https?:\/\/[^\s"`)\\]+/g) || [];
	for (const link of links) {
		assert.ok(
			link === 'https://sprkly.app/docs/api' ||
				link === 'https://github.com/ahlanlhw/n8n-nodes-sprkly',
			link,
		);
	}
});

test('one yellow overview of 100 to 300 words, other notes white and under 50 words', () => {
	const yellow = notes.filter((note) => (note.parameters.color ?? 1) === 1);
	assert.equal(yellow.length, 1);
	const overview = yellow[0].parameters.content;
	const count = words(overview);
	assert.ok(count >= 100 && count <= 300, `overview has ${count} words`);
	for (const heading of ['How it works', 'Setup', 'Customization']) {
		assert.ok(overview.includes(heading), heading);
	}
	const others = notes.filter((note) => note !== yellow[0]);
	for (const note of others) {
		assert.equal(note.parameters.color, 7, `${note.name} is white`);
		assert.ok(words(note.parameters.content) < 50, `${note.name} is under 50 words`);
	}
	console.log(
		`  overview ${count} words; notes ${others.map((n) => words(n.parameters.content)).join(', ')} words`,
	);
});

test('no em or en dashes', () => {
	const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
	assert.doesNotMatch(text, dashes);
});

test('sprkly nodes: type, version and every parameter exist in the built node', () => {
	const built = {
		'n8n-nodes-sprkly.sprkly': require(path.join(repo, 'dist/nodes/Sprkly/Sprkly.node.js')).Sprkly,
		'n8n-nodes-sprkly.sprklyTrigger': require(
			path.join(repo, 'dist/nodes/SprklyTrigger/SprklyTrigger.node.js'),
		).SprklyTrigger,
	};
	for (const node of steps.filter((n) => n.type.startsWith('n8n-nodes-sprkly.'))) {
		const NodeClass = built[node.type];
		assert.ok(NodeClass, node.type);
		const { description } = new NodeClass();
		const versions = Array.isArray(description.version)
			? description.version
			: [description.version];
		assert.ok(versions.includes(node.typeVersion), `${node.name} version ${node.typeVersion}`);
		const names = new Set(description.properties.map((property) => property.name));
		if (description.polling) names.add('pollTimes');
		for (const key of Object.keys(node.parameters))
			assert.ok(names.has(key), `${node.name}: ${key}`);
	}
});

if (nodesBase) {
	test('n8n nodes: each type and version exists in the given n8n-nodes-base', () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(nodesBase, 'package.json'), 'utf8'));
		for (const node of workflow.nodes.filter((n) => n.type.startsWith('n8n-nodes-base.'))) {
			const want = `${node.type.split('.')[1]}.node.js`.toLowerCase();
			const file = pkg.n8n.nodes.find((entry) => path.basename(entry).toLowerCase() === want);
			assert.ok(file, `${node.type} is in n8n-nodes-base`);
			const versions = versionsOf(require(path.join(nodesBase, file)));
			assert.ok(
				versions.includes(node.typeVersion),
				`${node.name}: ${node.typeVersion} in [${versions}]`,
			);
		}
		console.log(`  checked against n8n-nodes-base ${pkg.version}`);
	});
} else {
	skipped++;
	console.log('skip - n8n node versions (pass the n8n-nodes-base path to check them)');
}

console.log(`\n${passed} passed, ${skipped} skipped`);

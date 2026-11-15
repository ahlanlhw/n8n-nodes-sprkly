// Static checks on every templates/*.json. No n8n run, no network, no credentials.
// Run from the repo root after npm run build:
//   node --test test/templates/all-templates.test.js
// Set N8N_NODES_BASE to an n8n-nodes-base folder to also check each n8n node type and version.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const repo = path.join(__dirname, '..', '..');
const dir = path.join(repo, 'templates');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
const nodesBase = process.env.N8N_NODES_BASE;

const STICKY = 'n8n-nodes-base.stickyNote';
const SPRKLY = 'n8n-nodes-sprkly.sprkly';
const SPRKLY_TRIGGER = 'n8n-nodes-sprkly.sprklyTrigger';
const LINKS = ['https://sprkly.app/docs/api', 'https://github.com/ahlanlhw/n8n-nodes-sprkly'];

// Other schedulers and direct publish endpoints. Only the sprkly node posts to an audience.
// Names that are common words (buffer, later, late, sprout) are matched by domain or app name only.
const OTHER_PUBLISHERS =
	/postiz|blotato|upload-?post|publer|hootsuite|metricool|ayrshare|socialbee|sendible|sprout ?social|zernio|getlate|later\.com|postfast|post-?bridge|adaptly|buffer\.com|bufferapp/i;
const PUBLISH_HOSTS =
	/graph\.facebook\.com|api\.linkedin\.com|api\.twitter\.com|api\.x\.com|open\.tiktokapis\.com|graph\.threads\.net|bsky\.social\/xrpc\/com\.atproto\.repo\.createRecord|api\.pinterest\.com/i;
const PUBLISH_TYPES = [
	'n8n-nodes-base.facebookGraphApi',
	'n8n-nodes-base.linkedIn',
	'n8n-nodes-base.twitter',
];

const words = (content) => content.replace(/[#*`]/g, ' ').split(/\s+/).filter(Boolean).length;

function builtSprkly() {
	const node = path.join(repo, 'dist/nodes/Sprkly/Sprkly.node.js');
	const trigger = path.join(repo, 'dist/nodes/SprklyTrigger/SprklyTrigger.node.js');
	assert.ok(fs.existsSync(node) && fs.existsSync(trigger), 'run npm run build first');
	return {
		[SPRKLY]: new (require(node).Sprkly)().description,
		[SPRKLY_TRIGGER]: new (require(trigger).SprklyTrigger)().description,
	};
}

// Every version a node class offers: a versioned node lists them, a plain one has description.version.
function versionsOf(exported) {
	const NodeClass = Object.values(exported).find((value) => typeof value === 'function');
	const instance = new NodeClass();
	if (instance.nodeVersions) return Object.keys(instance.nodeVersions).map(Number);
	const version = instance.description.version;
	return Array.isArray(version) ? version : [version];
}

function n8nNodeFile(type) {
	const [pkgName, nodeName] = [type.slice(0, type.lastIndexOf('.')), type.slice(type.lastIndexOf('.') + 1)];
	const root =
		pkgName === 'n8n-nodes-base' ? nodesBase : path.join(nodesBase, '..', '@n8n', 'n8n-nodes-langchain');
	const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const want = `${nodeName}.node.js`.toLowerCase();
	const file = pkg.n8n.nodes.find((entry) => path.basename(entry).toLowerCase() === want);
	return file && path.join(root, file);
}

for (const file of files) {
	const text = fs.readFileSync(path.join(dir, file), 'utf8');
	const isHttpCopy = file.endsWith('-http.json');

	describe(file, () => {
		const workflow = safeParse(text);
		test('parses, has name, nodes and connections, inactive, no pinned data', () => {
			JSON.parse(text);
			assert.equal(typeof workflow.name, 'string');
			assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0);
			assert.equal(typeof workflow.connections, 'object');
			assert.equal(workflow.active, false, 'active is false');
			assert.ok(!workflow.pinData || Object.keys(workflow.pinData).length === 0, 'pinData is empty');
		});
		if (!workflow || !Array.isArray(workflow.nodes)) return;
		const steps = workflow.nodes.filter((node) => node.type !== STICKY);
		const notes = workflow.nodes.filter((node) => node.type === STICKY);

		test('node names are unique', () => {
			const names = workflow.nodes.map((node) => node.name);
			assert.equal(new Set(names).size, names.length);
		});

		test('every connection resolves and no step is orphaned', () => {
			const names = new Set(workflow.nodes.map((node) => node.name));
			const linked = new Set();
			for (const [from, byType] of Object.entries(workflow.connections)) {
				assert.ok(names.has(from), `connection from ${from}`);
				linked.add(from);
				for (const outputs of Object.values(byType)) {
					for (const output of outputs || []) {
						for (const target of output || []) {
							assert.ok(names.has(target.node), `connection to ${target.node}`);
							linked.add(target.node);
						}
					}
				}
			}
			for (const step of steps) assert.ok(linked.has(step.name), `${step.name} is connected`);
		});

		test('node types come from n8n or sprkly, and exist when N8N_NODES_BASE is set', (t) => {
			for (const node of steps) {
				assert.match(node.type, /^(n8n-nodes-base|@n8n\/n8n-nodes-langchain|n8n-nodes-sprkly)\./, node.type);
			}
			if (!nodesBase) return t.skip('set N8N_NODES_BASE to check n8n node versions');
			for (const node of steps.filter((n) => !n.type.startsWith('n8n-nodes-sprkly.'))) {
				const nodeFile = n8nNodeFile(node.type);
				assert.ok(nodeFile, `${node.type} exists`);
				const versions = versionsOf(require(nodeFile));
				assert.ok(versions.includes(node.typeVersion), `${node.name}: ${node.typeVersion} in [${versions}]`);
			}
		});

		test('sprkly nodes: version and every parameter key exist in the built node', () => {
			const built = builtSprkly();
			for (const node of steps.filter((n) => n.type.startsWith('n8n-nodes-sprkly.'))) {
				const description = built[node.type];
				assert.ok(description, node.type);
				const versions = [].concat(description.version);
				assert.ok(versions.includes(node.typeVersion), `${node.name} version ${node.typeVersion}`);
				const props = new Map();
				for (const property of description.properties) props.set(property.name, property);
				for (const [key, value] of Object.entries(node.parameters)) {
					if (key === 'pollTimes' && description.polling) continue;
					const property = props.get(key);
					assert.ok(property, `${node.name}: ${key}`);
					if (property.type === 'collection' && value && typeof value === 'object') {
						const inner = new Set(property.options.map((option) => option.name));
						for (const sub of Object.keys(value)) assert.ok(inner.has(sub), `${node.name}: ${key}.${sub}`);
					}
				}
			}
		});

		test('no keys, ids, emails, credentials or stray UUIDs', () => {
			assert.doesNotMatch(text, /sk_live_|sk_test_/);
			assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._~+/-]{12,}/);
			assert.doesNotMatch(text, /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{44}(?![A-Za-z0-9_-])/, 'no 44-char Google id');
			assert.doesNotMatch(text, /\b(app|tbl)[A-Za-z0-9]{14}\b/, 'no Airtable base or table id');
			assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, 'no email');
			const nodeIds = new Set(workflow.nodes.map((node) => node.id));
			const uuids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
			for (const uuid of uuids) assert.ok(nodeIds.has(uuid), `UUID ${uuid} is a node id`);
			for (const node of workflow.nodes) {
				for (const credential of Object.values(node.credentials || {})) {
					assert.equal(credential.id, undefined, `${node.name} has no credential id`);
				}
			}
		});

		test('no other scheduler and no direct publishing to a platform', () => {
			assert.doesNotMatch(text, OTHER_PUBLISHERS);
			assert.doesNotMatch(text, PUBLISH_HOSTS);
			for (const node of steps) {
				assert.ok(!PUBLISH_TYPES.includes(node.type), `${node.name}: ${node.type}`);
				assert.doesNotMatch(node.type, /buffer|later|sprout/i, node.type);
				assert.doesNotMatch(node.name, /^(buffer|later|late)$/i, node.name);
				if (node.type === 'n8n-nodes-base.youTube') {
					assert.notEqual(node.parameters.operation, 'upload', `${node.name} uploads to YouTube`);
				}
			}
		});

		if (!isHttpCopy) {
			test('uses the sprkly node; every Post Create is safe by default', () => {
				assert.ok(steps.some((node) => node.type === SPRKLY), 'has a sprkly node');
				const creates = steps.filter(
					(node) =>
						node.type === SPRKLY && node.parameters.resource === 'post' && node.parameters.operation === 'create',
				);
				for (const node of creates) {
					const p = node.parameters;
					const extra = p.additionalFields || {};
					assert.match(String(p.scheduledTime || ''), /^=.*\S/, `${node.name}: Schedule Time is an expression`);
					assert.notEqual(p.postNow, true, `${node.name}: Post Now is off`);
					assert.ok(String(extra.externalId || '').trim(), `${node.name}: External ID set`);
					assert.equal(extra.requireExternalId, true, `${node.name}: Require External ID on`);
					assert.equal(p.output, 'resultRow', `${node.name}: Output is Result Row`);
				}
			});
		}

		test('one overview note of 100 to 300 words, other notes under 50, no dashes, only our links', () => {
			const yellow = notes.filter((note) => (note.parameters.color ?? 1) === 1);
			assert.equal(yellow.length, 1, 'one yellow overview note');
			const overview = yellow[0].parameters.content;
			const count = words(overview);
			assert.ok(count >= 100 && count <= 300, `overview has ${count} words`);
			assert.match(overview, /How it works/);
			assert.match(overview, /Setup/);
			assert.match(overview, /Customi[sz]/);
			for (const note of notes.filter((n) => n !== yellow[0])) {
				assert.ok(words(note.parameters.content) < 50, `${note.name} is under 50 words`);
			}
			const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
			assert.doesNotMatch(text, dashes);
			for (const note of notes) {
				for (const link of note.parameters.content.match(/https?:\/\/[^\s"`)\\]+/g) || []) {
					assert.ok(LINKS.includes(link), `${note.name}: ${link}`);
				}
			}
		});
	});
}

function safeParse(source) {
	try {
		return JSON.parse(source);
	} catch {
		return undefined;
	}
}

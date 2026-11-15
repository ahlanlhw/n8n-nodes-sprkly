import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

// Every call to the sprkly API goes through this file, so a change in a request or a response
// shape is a change in one place. API reference: https://sprkly.app/docs/api

type SprklyContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export const DEFAULT_BASE_URL = 'https://sprkly.app';

/** The API refuses an upload over 50 MB, so the node stops before sending one. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** The most posts GET /api/v1/posts returns in one call. */
export const LIST_MAX = 500;

/** Post statuses the API filters on (openapi.json, Post.status). */
export const POST_STATUSES = [
	'draft',
	'pending_approval',
	'scheduled',
	'posted',
	'failed',
] as const;

type RequestOptions = {
	body?: IHttpRequestOptions['body'];
	qs?: IDataObject;
	headers?: IDataObject;
	itemIndex?: number;
};

type FullResponse = {
	body: unknown;
	headers: Record<string, string | string[] | undefined>;
	statusCode: number;
};

export async function sprklyApiRequest(
	this: SprklyContext,
	method: IHttpRequestMethods,
	path: string,
	options: RequestOptions = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('sprklyApi');
	const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const request: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (options.body !== undefined) request.body = options.body;
	if (options.qs) request.qs = options.qs;
	if (options.headers) request.headers = options.headers;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'sprklyApi',
		request,
	)) as FullResponse;

	const body = parseBody(response.body);
	if (response.statusCode >= 400) {
		throw sprklyApiError(
			this.getNode(),
			response.statusCode,
			body,
			response.headers,
			options.itemIndex,
		);
	}
	return body;
}

function parseBody(raw: unknown): IDataObject {
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as IDataObject;
	if (typeof raw === 'string' && raw.trim()) {
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
				return parsed as IDataObject;
		} catch {
			return { error: raw.slice(0, 300) };
		}
	}
	return {};
}

function headerValue(headers: FullResponse['headers'], name: string): string | undefined {
	const value = headers?.[name] ?? headers?.[name.toLowerCase()];
	return Array.isArray(value) ? value[0] : value;
}

/**
 * The API answers every refusal as { error, code }. The message is the API's own sentence, and
 * the description says what to do next.
 */
export function sprklyApiError(
	node: INode,
	statusCode: number,
	body: IDataObject,
	headers: FullResponse['headers'],
	itemIndex?: number,
): NodeApiError {
	const code = typeof body.code === 'string' ? body.code : '';
	let message =
		typeof body.error === 'string' && body.error
			? body.error
			: `sprkly answered with status ${statusCode}`;
	let hint = '';

	if (code === 'duplicate_external_id') {
		const existing = String(body.existingPostId ?? '');
		message = `A post with this 'External ID' already exists: ${existing}`;
		hint = `Nothing new was posted. The existing post is ${existing}${
			body.existingStatus ? ` (status ${String(body.existingStatus)})` : ''
		}.`;
	} else if (code === 'duplicate_content' && body.existingPostId) {
		hint = `Another post already has the same content: ${String(body.existingPostId)}. Change the caption or the media.`;
	} else if (statusCode === 401) {
		hint =
			'Check the API key in your sprkly API credential. Make a new key in sprkly under Settings, then API Keys.';
	} else if (statusCode === 403) {
		hint = 'Check what this key may do in sprkly under Settings, then API Keys.';
	} else if (statusCode === 429) {
		const retryAfter = headerValue(headers, 'retry-after');
		hint = retryAfter
			? `Wait ${retryAfter} seconds, then run it again.`
			: 'Wait a minute, then run it again.';
	} else if (code === 'post_failed') {
		hint = 'sprkly never sends a failed post again. Create a new post instead.';
	} else if (code === 'post_not_found') {
		hint =
			"Check the 'Post ID'. A deleted post, or one on an account this key cannot use, also reads as not found.";
	}

	const description = [hint, code ? `Code: ${code}` : ''].filter(Boolean).join(' ');
	return new NodeApiError(node, body as JsonObject, {
		message,
		description: description || undefined,
		httpCode: String(statusCode),
		itemIndex,
	});
}

/** A multipart/form-data body with one file field, built by hand so the package needs no library. */
export function buildMultipartFile(
	field: string,
	fileName: string,
	mimeType: string,
	data: Buffer,
): { body: Buffer; contentType: string } {
	const boundary = `----n8nSprkly${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const safeName = fileName.replace(/["\r\n\\]/g, '_');
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safeName}"\r\n` +
			`Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
		'utf8',
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
	return {
		body: Buffer.concat([head, data, tail]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

function zoneOffsetMs(timestamp: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(timestamp));
	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
	const wallClock = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);
	return wallClock - Math.floor(timestamp / 1000) * 1000;
}

/**
 * A time for the API, as ISO 8601 in UTC. A value with a zone (Z or +08:00) keeps its instant.
 * A value without one, which is what the date picker gives, is read in the workflow's time zone.
 * Returns null when the value is not a time.
 */
export function toApiTime(value: unknown, timeZone: string): string | null {
	const text = String(value ?? '').trim();
	if (!text) return null;
	if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)) {
		const date = new Date(text);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const match = text.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/,
	);
	if (!match) return null;
	const [, y, mo, d, h, mi, s] = match;
	const wallClock = Date.UTC(
		Number(y),
		Number(mo) - 1,
		Number(d),
		Number(h ?? 0),
		Number(mi ?? 0),
		Number(s ?? 0),
	);
	let zone = timeZone || 'UTC';
	try {
		zoneOffsetMs(wallClock, zone);
	} catch {
		zone = 'UTC';
	}
	const firstGuess = wallClock - zoneOffsetMs(wallClock, zone);
	// Second pass: near a daylight saving switch the offset at the real instant can differ.
	const instant = wallClock - zoneOffsetMs(firstGuess, zone);
	return new Date(instant).toISOString();
}

/** A list field typed as "a, b" or one per line, or an array from an expression. */
export function toList(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
	return raw.map((entry) => String(entry ?? '').trim()).filter(Boolean);
}

export type PostPage = { posts: IDataObject[] };

export type ChangedSinceResult = {
	posts: IDataObject[];
	/** The updatedAt of the last post seen: the next updatedAfter. */
	cursor: string;
	/** id|updatedAt of every post seen at the cursor second, because updatedAfter includes it. */
	seenAtCursor: string[];
};

export const postKey = (post: IDataObject) => `${String(post.id)}|${String(post.updatedAt)}`;

/**
 * Pages through GET /api/v1/posts?updatedAfter=, which returns the oldest change first. The
 * cursor moves to the updatedAt of the last post on each page. updatedAfter is "at or after" and
 * kept to the second, so posts already seen at the cursor second are skipped by id + updatedAt.
 */
export async function pagePostsChangedSince(
	fetchPage: (updatedAfter: string, limit: number) => Promise<PostPage>,
	since: string,
	seen: string[],
	pageSize: number,
	maxPages: number,
): Promise<ChangedSinceResult> {
	let cursor = since;
	let seenAtCursor = new Set(seen);
	const posts: IDataObject[] = [];

	for (let page = 0; page < maxPages; page++) {
		const { posts: batch } = await fetchPage(cursor, pageSize);
		for (const post of batch) {
			if (!seenAtCursor.has(postKey(post))) posts.push(post);
		}
		if (batch.length === 0) break;

		const last = batch[batch.length - 1].updatedAt;
		if (typeof last !== 'string' || !last) break;
		const atLast = batch.filter((post) => post.updatedAt === last).map(postKey);
		const moved = last !== cursor;
		if (moved) {
			seenAtCursor = new Set(atLast);
			cursor = last;
		} else {
			atLast.forEach((key) => seenAtCursor.add(key));
		}

		if (batch.length < pageSize) break;
		// A full page that all shares the cursor second would come back the same: stop here.
		if (!moved) break;
	}

	return { posts, cursor, seenAtCursor: [...seenAtCursor] };
}

/**
 * The most used fields first (n8n UX guideline for a "Simplify" option). deleted and deletedAt
 * stay: a binned post keeps its status, so without them it reads as still going out.
 */
export function simplifyPost(post: IDataObject): IDataObject {
	return {
		id: post.id,
		status: post.status,
		caption: post.caption,
		platforms: post.platforms,
		profileIds: post.profileIds,
		scheduledTime: post.scheduledTime,
		publishedAt: post.publishedAt,
		failedReason: post.failedReason,
		permalink: post.permalink,
		externalId: post.externalId,
		deleted: post.deleted,
		deletedAt: post.deletedAt,
	};
}

import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { accountFields, accountOperations } from './AccountDescription';
import {
	buildMultipartFile,
	LIST_MAX,
	MAX_UPLOAD_BYTES,
	pagePostsChangedSince,
	simplifyPost,
	sprklyApiRequest,
	toApiTime,
	toList,
} from './GenericFunctions';
import { mediaFields, mediaOperations } from './MediaDescription';
import { postFields, postOperations } from './PostDescription';

/** "line one\n\nline three" → ['line one', '', 'line three']: an empty line is an image with no alt text. */
function altTextLines(value: unknown): string[] {
	const lines = String(value ?? '')
		.split(/\r?\n/)
		.map((line) => line.trim());
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

/** An object from the JSON field, {} when it is empty, or null when it is not a JSON object. */
function parseJsonObject(value: unknown): IDataObject | null {
	if (value === undefined || value === null || value === '') return {};
	let parsed: unknown = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			return null;
		}
	}
	return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
		? (parsed as IDataObject)
		: null;
}

function setMedia(body: IDataObject, value: unknown) {
	const ids = toList(value);
	if (ids.length === 1) body.mediaId = ids[0];
	else if (ids.length > 1) body.mediaIds = ids;
}

export class Sprkly implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'sprkly',
		name: 'sprkly',
		icon: { light: 'file:../../icons/sprkly.svg', dark: 'file:../../icons/sprkly.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Schedule social media posts with sprkly',
		defaults: {
			name: 'sprkly',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'sprklyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Media', value: 'media' },
					{ name: 'Post', value: 'post' },
				],
				default: 'post',
			},
			...accountOperations,
			...accountFields,
			...mediaOperations,
			...mediaFields,
			...postOperations,
			...postFields,
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await sprklyApiRequest.call(this, 'GET', '/api/v1/connections');
				const accounts = (response.accounts as IDataObject[] | undefined) ?? [];
				return accounts
					.map((account) => ({
						name: `${String(account.handle ?? account.id)} (${String(account.platform ?? '')})`,
						value: String(account.id),
					}))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const timeZone = this.getTimezone();

		const timeOrThrow = (value: unknown, label: string, itemIndex: number): string => {
			const iso = toApiTime(value, timeZone);
			if (!iso) {
				throw new NodeOperationError(
					this.getNode(),
					`'${label}' is not a time sprkly can read: ${String(value)}`,
					{
						itemIndex,
						description: 'Use a time like 2026-11-20T09:00:00, or pick one with the date picker.',
					},
				);
			}
			return iso;
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let output: IDataObject[] = [];

				if (resource === 'account') {
					if (operation === 'getCurrentKey') {
						output = [await sprklyApiRequest.call(this, 'GET', '/api/v1/me', { itemIndex: i })];
					} else if (operation === 'getAll') {
						const response = await sprklyApiRequest.call(this, 'GET', '/api/v1/connections', {
							itemIndex: i,
						});
						const accounts = (response.accounts as IDataObject[] | undefined) ?? [];
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						output = returnAll
							? accounts
							: accounts.slice(0, this.getNodeParameter('limit', i) as number);
					}
				} else if (resource === 'media') {
					if (operation === 'upload') {
						const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
						const binary = this.helpers.assertBinaryData(i, binaryPropertyName);
						const data = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
						if (data.length > MAX_UPLOAD_BYTES) {
							throw new NodeOperationError(
								this.getNode(),
								'The file is larger than 50 MB. sprkly takes files up to 50 MB, so use a smaller one.',
								{ itemIndex: i },
							);
						}
						const multipart = buildMultipartFile(
							'file',
							binary.fileName ?? 'upload',
							binary.mimeType,
							data,
						);
						output = [
							await sprklyApiRequest.call(this, 'POST', '/api/v1/media', {
								body: multipart.body,
								headers: { 'Content-Type': multipart.contentType },
								itemIndex: i,
							}),
						];
					} else if (operation === 'addFromUrl') {
						const url = (this.getNodeParameter('url', i) as string).trim();
						output = [
							await sprklyApiRequest.call(this, 'POST', '/api/v1/media/from-url', {
								body: { url },
								itemIndex: i,
							}),
						];
					}
				} else if (resource === 'post') {
					if (operation === 'create') {
						const body: IDataObject = {
							profileIds: toList(this.getNodeParameter('profileIds', i)),
						};
						const caption = this.getNodeParameter('caption', i, '') as string;
						if (caption) body.caption = caption;
						const scheduledTime = this.getNodeParameter('scheduledTime', i, '');
						if (scheduledTime) body.scheduledTime = timeOrThrow(scheduledTime, 'Schedule Time', i);
						setMedia(body, this.getNodeParameter('mediaIds', i, ''));

						const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						if (extra.title) body.title = extra.title;
						const mediaUrls = toList(extra.mediaUrls);
						if (mediaUrls.length > 0) body.mediaUrls = mediaUrls;
						if (extra.postType) body.postType = extra.postType;
						if (extra.externalId !== undefined && String(extra.externalId).trim()) {
							body.externalId = String(extra.externalId).trim();
						}
						if (extra.requiresApproval !== undefined)
							body.requiresApproval = extra.requiresApproval;
						if (extra.approvalNote) body.approvalNote = extra.approvalNote;
						if (extra.firstComment) body.firstComment = extra.firstComment;
						const altText = altTextLines(extra.altText);
						if (altText.length > 0) body.altText = altText;

						const platformMeta = parseJsonObject(extra.platformMeta);
						if (!platformMeta) {
							throw new NodeOperationError(
								this.getNode(),
								'\'Platform Options (JSON)\' is not a JSON object. Use one like {"tiktok": {"brandContentOptIn": true}}.',
								{ itemIndex: i },
							);
						}
						if (extra.tiktokPrivacyLevel) {
							const tiktok = (platformMeta.tiktok as IDataObject | undefined) ?? {};
							platformMeta.tiktok = { ...tiktok, privacyLevel: extra.tiktokPrivacyLevel };
						}
						if (Object.keys(platformMeta).length > 0) body.platformMeta = platformMeta;

						output = [
							await sprklyApiRequest.call(this, 'POST', '/api/v1/posts', { body, itemIndex: i }),
						];
					} else if (operation === 'get') {
						const postId = (this.getNodeParameter('postId', i) as string).trim();
						const post = await sprklyApiRequest.call(
							this,
							'GET',
							`/api/v1/posts/${encodeURIComponent(postId)}`,
							{
								itemIndex: i,
							},
						);
						output = [this.getNodeParameter('simplify', i) ? simplifyPost(post) : post];
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const status = filters.status ? String(filters.status) : undefined;
						const updatedAfter = filters.updatedAfter
							? timeOrThrow(filters.updatedAfter, 'Updated After', i)
							: undefined;

						const fetchPage = async (after: string | undefined, limit: number) => {
							const qs: IDataObject = { limit };
							if (status) qs.status = status;
							if (after) qs.updatedAfter = after;
							const response = await sprklyApiRequest.call(this, 'GET', '/api/v1/posts', {
								qs,
								itemIndex: i,
							});
							return { posts: (response.posts as IDataObject[] | undefined) ?? [] };
						};

						let posts: IDataObject[];
						if (returnAll && updatedAfter) {
							// Up to 20 pages of 500. With updatedAfter the API pages by the time of the last change.
							posts = (await pagePostsChangedSince(fetchPage, updatedAfter, [], LIST_MAX, 20))
								.posts;
						} else {
							const limit = returnAll ? LIST_MAX : (this.getNodeParameter('limit', i) as number);
							posts = (await fetchPage(updatedAfter, Math.min(limit, LIST_MAX))).posts;
						}
						const simplify = this.getNodeParameter('simplify', i) as boolean;
						output = simplify ? posts.map(simplifyPost) : posts;
					} else if (operation === 'update') {
						const postId = (this.getNodeParameter('postId', i) as string).trim();
						const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
						const body: IDataObject = {};
						// The API ignores a blank caption, so an empty one is not a change.
						if (typeof fields.caption === 'string' && fields.caption.trim())
							body.caption = fields.caption;
						if (fields.scheduledTime)
							body.scheduledTime = timeOrThrow(fields.scheduledTime, 'Schedule Time', i);
						if (fields.profileIds !== undefined && toList(fields.profileIds).length > 0) {
							body.profileIds = toList(fields.profileIds);
						}
						if (fields.mediaIds !== undefined) setMedia(body, fields.mediaIds);
						if (fields.altText !== undefined) body.altText = altTextLines(fields.altText);
						if (fields.postType !== undefined) body.postType = fields.postType;
						if (Object.keys(body).length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								"Nothing to change. Add at least one field under 'Update Fields', then run it again.",
								{ itemIndex: i },
							);
						}
						output = [
							await sprklyApiRequest.call(
								this,
								'PATCH',
								`/api/v1/posts/${encodeURIComponent(postId)}`,
								{
									body,
									itemIndex: i,
								},
							),
						];
					} else if (operation === 'delete') {
						const postId = (this.getNodeParameter('postId', i) as string).trim();
						output = [
							await sprklyApiRequest.call(
								this,
								'DELETE',
								`/api/v1/posts/${encodeURIComponent(postId)}`,
								{
									itemIndex: i,
								},
							),
						];
					}
				}

				for (const json of output) returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					const failure = error as NodeApiError | NodeOperationError;
					returnData.push({
						json: {
							error: failure.message,
							...(failure.description ? { description: failure.description } : {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors hand back an error that is already theirs unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

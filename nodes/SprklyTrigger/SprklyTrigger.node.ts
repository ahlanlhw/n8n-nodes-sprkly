import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { pagePostsChangedSince, sprklyApiRequest } from '../Sprkly/GenericFunctions';

const EVENT_STATUS: Record<string, string> = {
	postFailed: 'failed',
	postPublished: 'posted',
};

const EVENT_LABEL: Record<string, string> = {
	postFailed: 'failed',
	postPublished: 'published',
};

/** How many emitted post ids to remember, so a later edit to a published post does not fire again. */
const EMITTED_MEMORY = 1000;

type PollState = {
	event?: string;
	cursor?: string;
	seenAtCursor?: string[];
	emittedIds?: string[];
};

export class SprklyTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'sprkly Trigger',
		name: 'sprklyTrigger',
		icon: { light: 'file:../../icons/sprkly.svg', dark: 'file:../../icons/sprkly.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when a sprkly post is published or fails',
		defaults: {
			name: 'sprkly Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'sprklyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				required: true,
				options: [
					{
						name: 'Post Failed',
						value: 'postFailed',
						description: 'A post could not go out. sprkly never sends it again.',
					},
					{
						name: 'Post Published',
						value: 'postPublished',
						description: 'A post went out',
					},
				],
				default: 'postPublished',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const status = EVENT_STATUS[event];

		// Test run: show the newest matching post so its fields can be mapped.
		if (this.getMode() === 'manual') {
			const response = await sprklyApiRequest.call(this, 'GET', '/api/v1/posts', {
				qs: { status, limit: 1 },
			});
			const posts = (response.posts as IDataObject[] | undefined) ?? [];
			if (posts.length === 0) {
				throw new NodeOperationError(this.getNode(), `No ${EVENT_LABEL[event]} post found yet`, {
					description: 'Once a post matches this event, test again to see its fields.',
				});
			}
			return [this.helpers.returnJsonArray(posts)];
		}

		const state = this.getWorkflowStaticData('node') as PollState;

		// First poll, or the event changed: start from now and send nothing older.
		if (!state.cursor || state.event !== event) {
			state.event = event;
			state.cursor = new Date().toISOString();
			state.seenAtCursor = [];
			state.emittedIds = [];
			return null;
		}

		const fetchPage = async (updatedAfter: string, limit: number) => {
			const response = await sprklyApiRequest.call(this, 'GET', '/api/v1/posts', {
				qs: { status, updatedAfter, limit },
			});
			return { posts: (response.posts as IDataObject[] | undefined) ?? [] };
		};

		const result = await pagePostsChangedSince(
			fetchPage,
			state.cursor,
			state.seenAtCursor ?? [],
			100,
			10,
		);
		state.cursor = result.cursor;
		state.seenAtCursor = result.seenAtCursor;

		// Published and failed are final, but a published post still changes later (its link, its
		// numbers), which moves updatedAt. Each post fires once per event.
		const emitted = new Set(state.emittedIds ?? []);
		const fresh = result.posts.filter((post) => !emitted.has(String(post.id)));
		if (fresh.length === 0) return null;

		state.emittedIds = [...(state.emittedIds ?? []), ...fresh.map((post) => String(post.id))].slice(
			-EMITTED_MEMORY,
		);
		return [this.helpers.returnJsonArray(fresh)];
	}
}

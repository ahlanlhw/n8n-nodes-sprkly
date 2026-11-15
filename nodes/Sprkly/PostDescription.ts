import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

const showFor = (operation: string[]) => ({ show: { resource: ['post'], operation } });

const MEDIA_IDS_DESCRIPTION =
	"IDs from 'Upload' or 'Add From URL' under Media, in slide order. Separate several with commas.";

const ALT_TEXT_DESCRIPTION =
	'One line per image, in the same order as the media. Leave a line empty for an image with no alt text.';

const postTypeOptions: INodePropertyOptions[] = [
	{
		name: 'Awareness',
		value: 'awareness',
		description: 'Show new people who you are and what you sell',
	},
	{ name: 'Conversation', value: 'conversation', description: 'Get people to reply' },
	{ name: 'Conversion', value: 'conversion', description: 'Ask people to buy, book or order now' },
	{ name: 'Educational', value: 'educational', description: 'Teach something useful' },
	{ name: 'Loyalty', value: 'loyalty', description: 'For people who already bought' },
	{ name: 'Proof', value: 'proof', description: 'Show that other people trust you' },
];

const statusOptions: INodePropertyOptions[] = [
	{ name: 'Draft', value: 'draft' },
	{ name: 'Failed', value: 'failed' },
	{ name: 'Pending Approval', value: 'pending_approval' },
	{ name: 'Posted', value: 'posted' },
	{ name: 'Scheduled', value: 'scheduled' },
];

const postIdField = (operation: string[]): INodeProperties => ({
	displayName: 'Post ID',
	name: 'postId',
	type: 'string',
	required: true,
	default: '',
	displayOptions: showFor(operation),
	description: "The post's ID, from 'Post IDs' after Create or from Get Many",
});

const simplifyField = (operation: string[]): INodeProperties => ({
	displayName: 'Simplify',
	name: 'simplify',
	type: 'boolean',
	default: true,
	displayOptions: showFor(operation),
	description: 'Whether to return a simplified version of the response instead of the raw data',
});

export const postOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['post'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Schedule a post, or send it out within about a minute',
				action: 'Create a post',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Move a post that has not gone out to the Bin',
				action: 'Delete a post',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a post and its status',
				action: 'Get a post',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many posts',
				action: 'Get many posts',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Change a post that has not gone out',
				action: 'Update a post',
			},
		],
		default: 'create',
	},
];

export const postFields: INodeProperties[] = [
	// ----- Create -----
	{
		displayName: 'Account Names or IDs',
		name: 'profileIds',
		type: 'multiOptions',
		description:
			'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		typeOptions: { loadOptionsMethod: 'getAccounts' },
		required: true,
		default: [],
		displayOptions: showFor(['create']),
		hint: 'The connected accounts to post to. sprkly makes one post per account.',
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: showFor(['create']),
		description: 'The text of the post',
	},
	{
		displayName: 'Schedule Time',
		name: 'scheduledTime',
		type: 'dateTime',
		default: '',
		displayOptions: showFor(['create']),
		description:
			'When to post. Leave empty to send it out within about a minute. A time without a time zone uses the time zone of this workflow.',
	},
	{
		displayName: 'Media IDs',
		name: 'mediaIds',
		type: 'string',
		default: '',
		placeholder: 'e.g. 6f1c2a3b-..., 9d8e7f6a-...',
		displayOptions: showFor(['create']),
		description: MEDIA_IDS_DESCRIPTION,
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['create']),
		options: [
			{
				displayName: 'Alt Text',
				name: 'altText',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: ALT_TEXT_DESCRIPTION,
			},
			{
				displayName: 'Approval Note',
				name: 'approvalNote',
				type: 'string',
				default: '',
				description:
					"A note to the owner, shown in the approval email. Used with 'Requires Approval'.",
			},
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				placeholder: 'e.g. row-42',
				description: 'Your own ID for this post. sprkly refuses a second post with the same one.',
				hint: 'Map a stable ID from the source row, so a re-run does not post twice',
			},
			{
				displayName: 'First Comment',
				name: 'firstComment',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Instagram only. Posted as a comment right after the post goes out.',
			},
			{
				displayName: 'Media URLs',
				name: 'mediaUrls',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/photo.jpg',
				description:
					'Public links to images or videos, in slide order. Separate several with commas. Google Drive and Dropbox share links work too.',
			},
			{
				displayName: 'Platform Options (JSON)',
				name: 'platformMeta',
				type: 'json',
				default: '{}',
				description:
					'Settings per platform, as in the sprkly API docs. For example {"tiktok": {"brandContentOptIn": true}}.',
			},
			{
				displayName: 'Post Type',
				name: 'postType',
				type: 'options',
				options: postTypeOptions,
				default: 'awareness',
				description: 'What the post is for. A label for your own reports.',
			},
			{
				displayName: 'Requires Approval',
				name: 'requiresApproval',
				type: 'boolean',
				default: false,
				description:
					'Whether to hold the post until the owner approves it. The owner gets an email with an Approve link.',
			},
			{
				displayName: 'TikTok Privacy Level',
				name: 'tiktokPrivacyLevel',
				type: 'options',
				options: [
					{ name: 'Followers', value: 'FOLLOWER_OF_CREATOR' },
					{ name: 'Friends', value: 'MUTUAL_FOLLOW_FRIENDS' },
					{ name: 'Only Me', value: 'SELF_ONLY' },
					{ name: 'Public', value: 'PUBLIC_TO_EVERYONE' },
				],
				default: 'PUBLIC_TO_EVERYONE',
				description: 'Who can see the post on TikTok. TikTok needs this.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'TikTok and YouTube need a title. YouTube allows up to 100 characters.',
			},
		],
	},

	// ----- Get, Delete, Update -----
	postIdField(['get', 'delete', 'update']),
	simplifyField(['get']),

	// ----- Get Many -----
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: showFor(['getAll']),
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: { show: { resource: ['post'], operation: ['getAll'], returnAll: [false] } },
		typeOptions: { minValue: 1, maxValue: 500 },
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showFor(['getAll']),
		options: [
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: statusOptions,
				default: 'scheduled',
			},
			{
				displayName: 'Updated After',
				name: 'updatedAfter',
				type: 'dateTime',
				default: '',
				description:
					'Only posts changed at or after this time. With this set, the oldest change comes first. Without it, the newest post comes first, and at most 500 come back.',
			},
		],
	},
	simplifyField(['getAll']),

	// ----- Update -----
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showFor(['update']),
		description: 'Only the fields you add here change',
		options: [
			{
				displayName: 'Account Names or IDs',
				name: 'profileIds',
				type: 'multiOptions',
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				default: [],
				hint: 'Replaces the accounts. Each extra account becomes its own new post.',
			},
			{
				displayName: 'Alt Text',
				name: 'altText',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: ALT_TEXT_DESCRIPTION,
			},
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
			},
			{
				displayName: 'Media IDs',
				name: 'mediaIds',
				type: 'string',
				default: '',
				placeholder: 'e.g. 6f1c2a3b-..., 9d8e7f6a-...',
				description:
					"IDs from 'Upload' or 'Add From URL' under Media, in slide order. Separate several with commas. Replaces all the media on the post.",
			},
			{
				displayName: 'Post Type',
				name: 'postType',
				type: 'options',
				options: postTypeOptions,
				default: 'awareness',
			},
			{
				displayName: 'Schedule Time',
				name: 'scheduledTime',
				type: 'dateTime',
				default: '',
				description:
					'A new time in the future. A time without a time zone uses the time zone of this workflow.',
			},
		],
	},
];

import type { INodeProperties } from 'n8n-workflow';

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Add From URL',
				value: 'addFromUrl',
				description: 'Let sprkly download a file from a public link and keep it',
				action: 'Add media from a URL',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a file from an earlier node',
				action: 'Upload media',
			},
		],
		default: 'upload',
	},
];

export const mediaFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
		hint: 'The name of the input binary field that holds the file. Up to 50 MB.',
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/photo.jpg',
		displayOptions: { show: { resource: ['media'], operation: ['addFromUrl'] } },
		description:
			'A public link to an image or video. Google Drive and Dropbox share links work too. Up to 50 MB.',
	},
];

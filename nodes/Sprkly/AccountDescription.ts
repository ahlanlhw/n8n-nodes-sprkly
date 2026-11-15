import type { INodeProperties } from 'n8n-workflow';

const showFor = (operation: string[]) => ({ show: { resource: ['account'], operation } });

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Current Key',
				value: 'getCurrentKey',
				description: 'Get the plan, scopes and accounts of the API key in use',
				action: 'Get current API key',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the social accounts connected to sprkly',
				action: 'Get many connected accounts',
			},
		],
		default: 'getAll',
	},
];

export const accountFields: INodeProperties[] = [
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
		displayOptions: { show: { resource: ['account'], operation: ['getAll'], returnAll: [false] } },
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
	},
];

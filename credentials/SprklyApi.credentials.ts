import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SprklyApi implements ICredentialType {
	name = 'sprklyApi';

	displayName = 'Sprkly API';

	icon: Icon = { light: 'file:../icons/sprkly.svg', dark: 'file:../icons/sprkly.dark.svg' };

	documentationUrl = 'https://sprkly.app/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'e.g. sk_live_...',
			description: 'Make a key in sprkly under Settings, then API Keys',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://sprkly.app',
			description: 'Leave as is unless you were told to change it',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/me',
			method: 'GET',
		},
	};
}

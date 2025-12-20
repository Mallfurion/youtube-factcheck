const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const buildWarmUrl = () => {
	const base = process.env.PROXY_WARM_URL || process.env.DEPLOY_PRIME_URL || process.env.URL;
	if (!base) {
		return null;
	}
	if (base.includes('/api/warm-proxy')) {
		return new URL(base);
	}
	const url = new URL(base);
	const trimmedPath = url.pathname.replace(/\/+$/, '');
	url.pathname = `${trimmedPath}/api/warm-proxy`;
	return url;
};

const requestWarm = (url, secret) =>
	new Promise((resolve) => {
		const transport = url.protocol === 'https:' ? https : http;
		const headers = {};
		if (secret) {
			headers.Authorization = `Bearer ${secret}`;
		}
		const req = transport.request(
			url,
			{
				method: 'POST',
				headers
			},
			(res) => {
				let body = '';
				res.on('data', (chunk) => {
					body += chunk;
				});
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode || 0,
						statusMessage: res.statusMessage || '',
						body
					});
				});
			}
		);

		req.on('error', (error) => {
			resolve({ statusCode: 0, statusMessage: String(error), body: '' });
		});
		req.end();
	});

module.exports = {
	onSuccess: async ({ utils }) => {
		const report = (summary, text) => {
			if (utils?.status?.show) {
				utils.status.show({ summary, text });
				return;
			}
			if (text) {
				console.log(`${summary} ${text}`);
				return;
			}
			console.log(summary);
		};
		const warmUrl = buildWarmUrl();
		if (!warmUrl) {
			report('Proxy warm skipped (no URL available).');
			return;
		}

		const result = await requestWarm(warmUrl, process.env.PROXY_WARM_SECRET || '');
		if (result.statusCode >= 200 && result.statusCode < 300) {
			report('Proxy warm succeeded.', `(${result.statusCode})`);
			return;
		}

		const detail = result.body ? ` ${result.body}` : '';
		report('Proxy warm failed.', `(${result.statusCode} ${result.statusMessage}).${detail}`);
	}
};

const DEFAULT_URL = 'http://localhost:5173/api/warm-proxy';

const url = process.env.PROXY_WARM_URL ?? DEFAULT_URL;
const secret = process.env.PROXY_WARM_SECRET ?? '';
const shouldWriteList =
	process.argv.includes('--write-list') || process.env.PROXY_WARM_WRITE_LIST === 'true';

const requestUrl = new URL(url);
if (shouldWriteList) {
	requestUrl.searchParams.set('writeList', 'true');
}

const headers = {};
if (secret) {
	headers.Authorization = `Bearer ${secret}`;
}

try {
	console.info('Starting [proxy:warm]...');
	const response = await fetch(requestUrl, { method: 'POST', headers });
	if (!response.ok) {
		const body = await response.text();
		console.error(`[proxy:warm] request failed: ${response.status} ${response.statusText}`);
		if (body) {
			console.error(`[proxy:warm] ${body}`);
		}
		process.exitCode = 1;
	} else {
		const data = await response.json().catch(() => ({}));
		const message = data?.message ?? 'Proxy cache warmed.';
		console.info(`[proxy:warm] ${message}`);
		if (data?.proxies !== undefined) {
			console.info(`[proxy:warm] proxies cached: ${data.proxies}`);
		}
		if (data?.listWritten) {
			console.info('[proxy:warm] proxy list file updated.');
		}
	}
} catch (error) {
	console.error(`[proxy:warm] request failed: ${String(error)}`);
	process.exitCode = 1;
}

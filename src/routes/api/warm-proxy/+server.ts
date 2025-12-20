import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { fileURLToPath } from 'node:url';
import { ProxyInterface } from '$lib/proxy-rotation/src';
import type { RequestHandler } from './$types';

const parseEnvNumber = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isNaN(parsed) ? fallback : parsed;
};

const proxyRotation = new ProxyInterface({
	protocol: 'http',
	autoRotate: true,
	autoUpdate: false,
	cachePeriod: parseEnvNumber(env.PROXY_ROTATION_CACHE_PERIOD, 10),
	maxProxies: parseEnvNumber(env.PROXY_ROTATION_MAX_PROXIES, 20),
	cacheFolderPath: env.PROXY_ROTATION_CACHE_DIR ?? undefined,
	debug: env.TRANSCRIPT_DEBUG === 'true'
});

const PROXY_LIST_FILE_PATH = fileURLToPath(
	new URL('../../../lib/proxy-rotation/src/proxy-list.json', import.meta.url)
);

let warmPromise: Promise<void> | null = null;

const ensureWarm = async (): Promise<void> => {
	if (!warmPromise) {
		warmPromise = proxyRotation.update().finally(() => {
			warmPromise = null;
		});
	}
	await warmPromise;
};

const isAuthorized = (request: Request): boolean => {
	const secret = env.PROXY_WARM_SECRET;
	if (!secret) {
		return true;
	}
	const header = request.headers.get('authorization');
	return header === `Bearer ${secret}`;
};

const shouldWriteListFile = (request: Request): boolean => {
	const url = new URL(request.url);
	const value = url.searchParams.get('writeList')?.toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
};

const handleWarm: RequestHandler = async ({ request }) => {
	if (!isAuthorized(request)) {
		return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await ensureWarm();
		const allowWrite = dev || env.PROXY_LIST_WRITE_ENABLED === 'true';
		const shouldWrite = allowWrite && shouldWriteListFile(request);
		if (shouldWrite) {
			await proxyRotation.exportProxyList(PROXY_LIST_FILE_PATH);
		}
		return json({
			ok: true,
			message: 'Proxy cache warmed.',
			proxies: proxyRotation.proxies.length,
			cacheExpiry: proxyRotation.cacheExpiry?.toISOString() ?? null,
			listWritten: shouldWrite
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return json({ ok: false, error: message }, { status: 500 });
	}
};

export const GET = handleWarm;
export const POST = handleWarm;

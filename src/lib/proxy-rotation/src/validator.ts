import { ProxyAgent } from 'undici';

import { fetchWithTimeout } from './fetcher';
import { Proxy } from './models';

const IPV4_PATTERN =
	/\b((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\b/;

const CHECKERS = [
	'checkip.amazonaws.com',
	'ipinfo.io/ip',
	'api.ipify.org/',
	'whatsmyip.dev/api/ip',
	'ip4.anysrc.net/banner',
	'api4.my-ip.io/v2/ip.txt',
	'api.myip.la',
	'api.seeip.org',
	'ips.im/api',
	'ifconfig.me/ip',
	'myip.expert/api/',
	'checkip.info/ip',
	'api.myip.com'
];

export function findIpv4InString(inputString: string): string | null {
	const match = IPV4_PATTERN.exec(inputString);
	return match ? match[0] : null;
}

async function getHostIp(): Promise<string | null> {
	try {
		const response = await fetchWithTimeout('http://checkip.amazonaws.com', {}, 5000);
		const text = await response.text();
		return findIpv4InString(text);
	} catch {
		return null;
	}
}

async function checkProxy(proxy: Proxy, checker: string): Promise<string> {
	const proxyAgent = new ProxyAgent(proxy.asString());
	const url = `${proxy.protocol}://${checker}`;
	const response = await fetchWithTimeout(
		url,
		{ dispatcher: proxyAgent } as RequestInit & { dispatcher?: unknown },
		5000
	);
	return response.text();
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let nextIndex = 0;

	const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= tasks.length) {
				break;
			}
			try {
				results[currentIndex] = await tasks[currentIndex]();
			} catch {
				results[currentIndex] = null as T;
			}
		}
	});

	await Promise.all(workers);
	return results;
}

export async function validateProxies(proxies: Proxy[]): Promise<Proxy[]> {
	if (proxies.length === 0) {
		return [];
	}

	const hostIp = await getHostIp();
	const tasks = proxies.map((proxy, idx) => async () => {
		const checker = CHECKERS[idx % CHECKERS.length];
		try {
			const text = await checkProxy(proxy, checker);
			const resultIp = findIpv4InString(text);
			if (resultIp && resultIp !== hostIp) {
				return proxy;
			}
			return null;
		} catch {
			return null;
		}
	});

	const results = await runWithConcurrency(tasks, 100);
	return results.filter((proxy): proxy is Proxy => Boolean(proxy));
}

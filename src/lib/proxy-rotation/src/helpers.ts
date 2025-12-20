import { ProxyAgent } from 'undici';

import { fetchWithTimeout } from './fetcher';
import type { ProxyProtocol } from './models';
import { Proxy } from './models';

export function normalizeCountries(countries: string[]): string[] {
	return countries.map((country) => country.toUpperCase());
}

export async function checkProxy(proxy: Proxy): Promise<boolean> {
	const proxyAgent = new ProxyAgent(proxy.asString());
	try {
		const response = await fetchWithTimeout(
			'http://checkip.amazonaws.com',
			{ dispatcher: proxyAgent } as RequestInit & { dispatcher?: unknown },
			2000
		);
		const text = await response.text();
		return text.split('.').length - 1 === 3;
	} catch {
		return false;
	}
}

export function log(level: string, message: string): void {
	const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
	const label = level.toUpperCase();
	console.log(`${timestamp} - [swiftshadow] - ${label} : ${message}`);
}

export function plaintextToProxies(text: string, protocol: ProxyProtocol): Proxy[] {
	const proxies: Proxy[] = [];
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [ip, port] = trimmed.split(':');
		if (!ip || !port) {
			continue;
		}
		const parsedPort = Number.parseInt(port, 10);
		if (Number.isNaN(parsedPort)) {
			continue;
		}
		proxies.push(new Proxy({ ip, port: parsedPort, protocol }));
	}
	return proxies;
}

export function deduplicateProxies(proxies: Proxy[]): Proxy[] {
	const seen = new Set<string>();
	const final: Proxy[] = [];
	for (const proxy of proxies) {
		const proxyString = proxy.asString();
		if (seen.has(proxyString)) {
			continue;
		}
		seen.add(proxyString);
		final.push(proxy);
	}
	return final;
}

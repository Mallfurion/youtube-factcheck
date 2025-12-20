import { fetchJson, fetchText } from './fetcher';
import { plaintextToProxies } from './helpers';
import { Proxy, type Provider, type ProviderFunction, type ProxyProtocol } from './models';
import type { MonosansProxyDict } from './types';
import { validateProxies } from './validator';

type ProxyScrapeResponse = {
	proxies: Array<{ ip: string; port: number }>;
};

async function runWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) {
				break;
			}
			try {
				results[currentIndex] = await worker(items[currentIndex], currentIndex);
			} catch {
				results[currentIndex] = null as R;
			}
		}
	});

	await Promise.all(runners);
	return results;
}

function parseProxyDbTotal(html: string): number {
	const match = html.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+total proxies/i);
	if (!match) {
		return 0;
	}
	const total = Number.parseInt(match[1], 10);
	return Number.isNaN(total) ? 0 : total;
}

function parseProxyDbRows(html: string, countries: string[], protocol: ProxyProtocol): Proxy[] {
	const proxies: Proxy[] = [];
	const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
	for (const row of rows) {
		const match = row.match(/href="\/([0-9.]+)\/(\d+)#(?:http|https)"/);
		if (!match) {
			continue;
		}
		const ip = match[1];
		const port = Number.parseInt(match[2], 10);
		if (Number.isNaN(port)) {
			continue;
		}
		const countryMatch = row.match(/<abbr[^>]*>([A-Z]{2})<\/abbr>/);
		const countryCode = countryMatch?.[1];
		if (countries.length && (!countryCode || !countries.includes(countryCode))) {
			continue;
		}
		proxies.push(new Proxy({ ip, port, protocol }));
	}
	return proxies;
}

export async function GenericPlainTextProxyProvider(
	url: string,
	protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const raw = await fetchText(url);
	const proxies = plaintextToProxies(raw, protocol);
	return validateProxies(proxies);
}

export async function Monosans(
	countries: string[] = [],
	protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const proxyDicts = await fetchJson<MonosansProxyDict[]>(
		'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies.json'
	);
	const proxiesToValidate: Proxy[] = [];
	for (const proxyDict of proxyDicts) {
		if (proxyDict.protocol !== protocol) {
			continue;
		}
		const countryCode = proxyDict.geolocation?.country?.iso_code;
		if (countries.length && !countryCode) {
			continue;
		}
		if (countries.length && countryCode && !countries.includes(countryCode)) {
			continue;
		}
		proxiesToValidate.push(
			new Proxy({ ip: proxyDict.host, port: proxyDict.port, protocol: protocol })
		);
	}
	return validateProxies(proxiesToValidate);
}

export async function Thespeedx(
	_countries: string[] = [],
	protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	return GenericPlainTextProxyProvider(
		'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
		protocol
	);
}

export async function ProxyScrape(
	countries: string[] = [],
	_protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const baseUrl =
		'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&proxy_format=ipport&format=json';
	const apiUrl =
		countries.length === 0
			? `${baseUrl}&country=all`
			: `${baseUrl}&country=${countries.map((country) => country.toUpperCase()).join(',')}`;
	const raw = await fetchJson<ProxyScrapeResponse>(apiUrl);
	const proxies: Proxy[] = raw.proxies.map(
		(proxy) => new Proxy({ ip: proxy.ip, port: proxy.port, protocol: 'http' })
	);
	return validateProxies(proxies);
}

export async function GoodProxy(
	_countries: string[] = [],
	_protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const raw = await fetchText(
		'https://raw.githubusercontent.com/yuceltoluyag/GoodProxy/refs/heads/main/GoodProxy.txt'
	);
	const proxies: Proxy[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [hostPart] = trimmed.split('|');
		const [ip, port] = hostPart.split(':');
		if (!ip || !port) {
			continue;
		}
		const parsedPort = Number.parseInt(port, 10);
		if (Number.isNaN(parsedPort)) {
			continue;
		}
		proxies.push(new Proxy({ ip, port: parsedPort, protocol: 'http' }));
	}
	return validateProxies(proxies);
}

export async function OpenProxyList(
	_countries: string[] = [],
	_protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	return GenericPlainTextProxyProvider(
		'https://raw.githubusercontent.com/roosterkid/openproxylist/refs/heads/main/HTTPS_RAW.txt',
		'http'
	);
}

export async function MuRongPIG(
	_countries: string[] = [],
	_protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	return GenericPlainTextProxyProvider(
		'https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/refs/heads/main/http_checked.txt',
		'http'
	);
}

export async function Mmpx12(
	_countries: string[] = [],
	protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const url = `https://github.com/mmpx12/proxy-list/raw/refs/heads/master/${protocol}.txt`;
	return GenericPlainTextProxyProvider(url, protocol);
}

export async function Anonym0usWork1221(
	_countries: string[] = [],
	protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const url = `https://github.com/Anonym0usWork1221/Free-Proxies/raw/refs/heads/main/proxy_files/${protocol}_proxies.txt`;
	return GenericPlainTextProxyProvider(url, protocol);
}

export async function ProxyDB(
	countries: string[] = [],
	protocol: ProxyProtocol = 'http'
): Promise<Proxy[]> {
	const baseUrl = `https://www.proxydb.net/?protocol=${protocol}&sort_column_id=uptime&sort_order_desc=true`;
	const firstPage = await fetchText(baseUrl, {}, 15_000);
	const total = parseProxyDbTotal(firstPage);
	const proxies: Proxy[] = parseProxyDbRows(firstPage, countries, protocol);

	if (total === 0) {
		return proxies;
	}

	const offsets: number[] = [];
	for (let offset = 30; offset < total; offset += 30) {
		offsets.push(offset);
	}

	const pages = await runWithConcurrency(offsets, 5, async (offset) => {
		const pageHtml = await fetchText(`${baseUrl}&offset=${offset}`, {}, 15_000);
		return parseProxyDbRows(pageHtml, countries, protocol);
	});

	for (const page of pages) {
		if (!page) {
			continue;
		}
		proxies.push(...page);
	}

	return proxies;
}

export const Providers: Map<ProviderFunction, Provider> = new Map([
	[
		ProxyScrape,
		{
			providerFunction: ProxyScrape,
			countryFilter: true,
			protocols: ['http']
		}
	],
	[
		Monosans,
		{
			providerFunction: Monosans,
			countryFilter: true,
			protocols: ['http']
		}
	],
	[
		MuRongPIG,
		{
			providerFunction: MuRongPIG,
			countryFilter: false,
			protocols: ['http']
		}
	],
	[
		Thespeedx,
		{
			providerFunction: Thespeedx,
			countryFilter: false,
			protocols: ['http']
		}
	],
	[
		Anonym0usWork1221,
		{
			providerFunction: Anonym0usWork1221,
			countryFilter: false,
			protocols: ['http', 'https']
		}
	],
	[
		Mmpx12,
		{
			providerFunction: Mmpx12,
			countryFilter: false,
			protocols: ['http', 'https']
		}
	],
	[
		GoodProxy,
		{
			providerFunction: GoodProxy,
			countryFilter: false,
			protocols: ['http']
		}
	],
	[
		OpenProxyList,
		{
			providerFunction: OpenProxyList,
			countryFilter: false,
			protocols: ['http']
		}
	],
	[
		ProxyDB,
		{
			providerFunction: ProxyDB,
			countryFilter: true,
			protocols: ['http', 'https']
		}
	]
]);

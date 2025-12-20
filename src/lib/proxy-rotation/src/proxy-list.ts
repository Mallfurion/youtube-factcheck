import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Proxy, type ProxyListFile, type ProxyRecord, type ProxyProtocol } from './models';

const isProxyRecord = (value: unknown): value is ProxyRecord => {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const record = value as ProxyRecord;
	return (
		typeof record.ip === 'string' &&
		typeof record.port === 'number' &&
		(record.protocol === 'http' || record.protocol === 'https')
	);
};

export const normalizeProxyList = (list: Array<ProxyRecord | Proxy>): Proxy[] => {
	const proxies: Proxy[] = [];
	for (const entry of list) {
		if (entry instanceof Proxy) {
			proxies.push(entry);
			continue;
		}
		if (isProxyRecord(entry)) {
			proxies.push(new Proxy(entry));
		}
	}
	return proxies;
};

export const parseProxyListData = (data: unknown): Proxy[] => {
	if (Array.isArray(data)) {
		return normalizeProxyList(data as ProxyRecord[]);
	}
	if (data && typeof data === 'object' && Array.isArray((data as ProxyListFile).proxies)) {
		return normalizeProxyList((data as ProxyListFile).proxies);
	}
	return [];
};

export const readProxyListFile = async (filePath: string): Promise<Proxy[]> => {
	const raw = await fs.readFile(filePath, 'utf8');
	const parsed = JSON.parse(raw) as ProxyListFile | ProxyRecord[];
	return parseProxyListData(parsed);
};

export const writeProxyListFile = async (
	filePath: string,
	proxies: Proxy[],
	protocol: ProxyProtocol
): Promise<void> => {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const payload: ProxyListFile = {
		generatedAt: new Date().toISOString(),
		protocol,
		proxies: proxies.map((proxy) => proxy.toJSON())
	};
	const content = `${JSON.stringify(payload, null, 2)}\n`;
	await fs.writeFile(filePath, content, 'utf8');
};

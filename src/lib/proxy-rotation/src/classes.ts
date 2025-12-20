import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkExpiry, getExpiry } from './cache';
import { UnsupportedProxyProtocol } from './exceptions';
import { deduplicateProxies, normalizeCountries } from './helpers';
import type { CacheData, Provider, ProviderFunction, ProxyProtocol, ProxyRecord } from './models';
import { Proxy } from './models';
import { normalizeProxyList, writeProxyListFile } from './proxy-list';
import { Providers as ProvidersMap } from './providers';

type Logger = {
	info: (message: string) => void;
	debug: (message: string) => void;
	error: (message: string) => void;
};

const LOG_NAME = 'swiftshadow';
const CACHE_FILENAME = 'swiftshadow.cache.json';

function formatLog(level: string, message: string): string {
	return `${new Date().toISOString()} - ${LOG_NAME} [${level}]:${message}`;
}

function createLogger({
	debugEnabled,
	logToFile,
	logFilePath
}: {
	debugEnabled: boolean;
	logToFile: boolean;
	logFilePath: string;
}): Logger {
	const writeToFile = (line: string): void => {
		if (!logToFile) {
			return;
		}
		void fsPromises.appendFile(logFilePath, `${line}\n`, 'utf8');
	};

	return {
		info: (message: string) => {
			const line = formatLog('INFO', message);
			console.info(line);
			writeToFile(line);
		},
		debug: (message: string) => {
			if (!debugEnabled) {
				return;
			}
			const line = formatLog('DEBUG', message);
			console.info(line);
			writeToFile(line);
		},
		error: (message: string) => {
			const line = formatLog('ERROR', message);
			console.error(line);
			writeToFile(line);
		}
	};
}

function getDefaultCacheFolder(): string {
	if (process.env.SWIFTSHADOW_CACHE_DIR) {
		return path.resolve(process.env.SWIFTSHADOW_CACHE_DIR);
	}

	if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
		return path.join(os.tmpdir(), LOG_NAME);
	}

	const platform = os.platform();
	if (platform === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Caches', LOG_NAME);
	}
	if (platform === 'win32') {
		const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
		return path.join(base, LOG_NAME);
	}

	const base = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
	return path.join(base, LOG_NAME);
}

export type ProxyInterfaceOptions = {
	countries?: string[];
	protocol?: ProxyProtocol;
	selectedProviders?: ProviderFunction[];
	proxyList?: Array<ProxyRecord | Proxy>;
	maxProxies?: number;
	autoRotate?: boolean;
	autoUpdate?: boolean;
	cachePeriod?: number;
	cacheFolderPath?: string;
	debug?: boolean;
	logToFile?: boolean;
};

export class ProxyInterface {
	countries: string[];
	protocol: ProxyProtocol;
	providers: Provider[];
	maxProxies: number;
	autorotate: boolean;
	cachePeriod: number;
	configString: string;
	cacheFolderPath: string;
	proxies: Proxy[] = [];
	current: Proxy | null = null;
	cacheExpiry: Date | null = null;
	autoUpdate: boolean;

	private proxyList: Proxy[] = [];
	private logger: Logger;
	private cacheFilePath: string;
	private updatePromise: Promise<void> | null = null;

	constructor({
		countries = [],
		protocol = 'http',
		selectedProviders = [],
		proxyList = [],
		maxProxies = 10,
		autoRotate = false,
		autoUpdate = true,
		cachePeriod = 10,
		cacheFolderPath,
		debug = false,
		logToFile = false
	}: ProxyInterfaceOptions = {}) {
		this.countries = normalizeCountries(countries);

		if (protocol !== 'http' && protocol !== 'https') {
			throw new UnsupportedProxyProtocol(protocol);
		}
		this.protocol = protocol;

		if (selectedProviders.length > 0) {
			const providers: Provider[] = [];
			for (const providerFunction of selectedProviders) {
				const provider = ProvidersMap.get(providerFunction);
				if (!provider) {
					throw new Error(
						`Unknown provider ${providerFunction.name} in the list of selected providers.`
					);
				}
				providers.push(provider);
			}
			this.providers = providers;
		} else {
			this.providers = Array.from(ProvidersMap.values());
		}

		this.proxyList = normalizeProxyList(proxyList);
		this.maxProxies = maxProxies;
		this.autorotate = autoRotate;
		this.cachePeriod = cachePeriod;
		this.configString = `${maxProxies}${protocol}${this.countries.join('')}`;

		const resolvedCacheFolder = cacheFolderPath
			? path.resolve(cacheFolderPath)
			: getDefaultCacheFolder();
		fs.mkdirSync(resolvedCacheFolder, { recursive: true });
		this.cacheFolderPath = resolvedCacheFolder;
		this.cacheFilePath = path.join(this.cacheFolderPath, CACHE_FILENAME);

		this.logger = createLogger({
			debugEnabled: debug,
			logToFile,
			logFilePath: path.join(this.cacheFolderPath, 'swiftshadow.log')
		});

		this.autoUpdate = autoUpdate;
		if (this.autoUpdate) {
			this.updatePromise = this.update().catch((error) => {
				this.logger.error(`Auto-update failed: ${String(error)}`);
				throw error;
			});
		}
	}

	get autoRotate(): boolean {
		return this.autorotate;
	}

	set autoRotate(value: boolean) {
		this.autorotate = value;
	}

	get maxproxies(): number {
		return this.maxProxies;
	}

	set maxproxies(value: number) {
		this.maxProxies = value;
	}

	private async loadCache(): Promise<void> {
		try {
			const raw = await fsPromises.readFile(this.cacheFilePath, 'utf8');
			const cache = JSON.parse(raw) as CacheData;

			if (this.configString !== cache.configString) {
				this.logger.info('Cache invalid due to configuration changes.');
				return;
			}

			const expiryIn = new Date(cache.expiryIn);
			if (Number.isNaN(expiryIn.getTime())) {
				this.logger.info('Cache expiry is invalid.');
				return;
			}

			if (!checkExpiry(expiryIn)) {
				this.proxies = cache.proxies.map((proxy) => Proxy.fromJSON(proxy));
				this.logger.info('Loaded proxies from cache.');
				this.logger.debug(`Cache with ${this.proxies.length} proxies, expire in ${expiryIn}`);
				this.current = this.proxies[0] ?? null;
				this.cacheExpiry = expiryIn;
				this.logger.debug(`Cache set to expire at ${expiryIn}`);
			} else {
				this.logger.info('Cache expired.');
			}
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === 'ENOENT') {
				this.logger.info('No cache found, will be created after update.');
			} else {
				this.logger.debug(`Cache read failed: ${String(error)}`);
			}
		}
	}

	async update(): Promise<void> {
		this.proxies = [];
		this.current = null;
		this.cacheExpiry = null;

		if (this.proxyList.length > 0) {
			const filtered = this.proxyList.filter((proxy) => proxy.protocol === this.protocol);
			if (filtered.length > 0) {
				this.proxies = deduplicateProxies(filtered).slice(0, this.maxProxies);
				this.current = this.proxies[0] ?? null;
				return;
			}
		}

		await this.loadCache();
		if (this.proxies.length > 0) {
			return;
		}

		for (const provider of this.providers) {
			if (!provider.protocols.includes(this.protocol)) {
				continue;
			}
			if (this.countries.length !== 0 && !provider.countryFilter) {
				continue;
			}
			const providerProxies = await provider.providerFunction(
				this.countries,
				this.protocol
			);
			this.logger.debug(
				`${providerProxies.length} proxies from ${provider.providerFunction.name}`
			);
			this.proxies.push(...providerProxies);
			if (this.proxies.length >= this.maxProxies) {
				break;
			}
		}

		if (this.proxies.length === 0) {
			if (this.protocol === 'https') {
				throw new Error(
					'No proxies were found for the current filter settings. Tip: https proxies can be rare; recommend setting protocol to http'
				);
			}
			throw new Error('No proxies were found for the current filter settings.');
		}

		this.proxies = deduplicateProxies(this.proxies);
		const cacheExpiry = getExpiry(this.cachePeriod);
		this.cacheExpiry = cacheExpiry;
		const cache: CacheData = {
			expiryIn: cacheExpiry.toISOString(),
			configString: this.configString,
			proxies: this.proxies.map((proxy) => proxy.toJSON())
		};
		await fsPromises.writeFile(this.cacheFilePath, JSON.stringify(cache), 'utf8');
		this.current = this.proxies[0] ?? null;
	}

	async asyncUpdate(): Promise<void> {
		return this.update();
	}

	async async_update(): Promise<void> {
		return this.asyncUpdate();
	}

	async exportProxyList(filePath: string): Promise<void> {
		if (this.proxies.length === 0) {
			await this.update();
		}
		if (this.proxies.length === 0) {
			throw new Error('No proxies available to export.');
		}
		await writeProxyListFile(filePath, this.proxies, this.protocol);
	}

	private async ensureUpdated(): Promise<void> {
		if (this.updatePromise) {
			await this.updatePromise;
			this.updatePromise = null;
		}
	}

	async rotate(options: { validateCache?: boolean; validate_cache?: boolean } = {}): Promise<void> {
		const validateCache = options.validateCache ?? options.validate_cache ?? false;
		if (validateCache) {
			if (this.cacheExpiry) {
				if (checkExpiry(this.cacheExpiry)) {
					this.logger.debug('Cache expired on rotate call, updating.');
					await this.update();
				}
			} else if (this.proxies.length === 0) {
				throw new Error('No cache available but validateCache is true.');
			} else {
				this.logger.debug('Cache validation skipped (no cache metadata available).');
			}
		}

		if (this.proxies.length === 0) {
			throw new Error('No proxies available to rotate.');
		}
		const nextIndex = Math.floor(Math.random() * this.proxies.length);
		this.current = this.proxies[nextIndex];
	}

	async get(): Promise<Proxy> {
		await this.ensureUpdated();
		if (this.autorotate) {
			await this.rotate({ validateCache: this.autoUpdate });
		}
		if (this.current) {
			return this.current;
		}
		throw new Error('No proxy available in current, current is null');
	}
}

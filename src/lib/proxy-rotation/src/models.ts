export type ProxyProtocol = 'http' | 'https';

export type ProxyRecord = {
	ip: string;
	protocol: ProxyProtocol;
	port: number;
};

export class Proxy {
	ip: string;
	protocol: ProxyProtocol;
	port: number;

	constructor({ ip, protocol, port }: ProxyRecord) {
		this.ip = ip;
		this.protocol = protocol;
		this.port = port;
	}

	asRequestsDict(): Record<ProxyProtocol, string> {
		return { [this.protocol]: `${this.ip}:${this.port}` } as Record<ProxyProtocol, string>;
	}

	asString(): string {
		return `${this.protocol}://${this.ip}:${this.port}`;
	}

	toJSON(): ProxyRecord {
		return { ip: this.ip, protocol: this.protocol, port: this.port };
	}

	static fromJSON(data: ProxyRecord): Proxy {
		return new Proxy(data);
	}
}

export type CacheData = {
	expiryIn: string;
	configString: string;
	proxies: ProxyRecord[];
};

export type ProxyListFile = {
	generatedAt: string;
	protocol: ProxyProtocol;
	proxies: ProxyRecord[];
};

export type ProviderFunction = (countries: string[], protocol: ProxyProtocol) => Promise<Proxy[]>;

export type Provider = {
	providerFunction: ProviderFunction;
	countryFilter: boolean;
	protocols: ProxyProtocol[];
};

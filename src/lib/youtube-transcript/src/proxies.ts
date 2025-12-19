export class InvalidProxyConfig extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type ProxyOptions = {
  http?: string | null;
  https?: string | null;
};

export class ProxyConfig {
  toProxyOptions(): ProxyOptions | null {
    return null;
  }

  get preventKeepingConnectionsAlive(): boolean {
    return false;
  }

  get retriesWhenBlocked(): number {
    return 0;
  }
}

export class GenericProxyConfig extends ProxyConfig {
  private _httpUrl: string | null;
  private _httpsUrl: string | null;

  constructor({
    httpUrl = null,
    httpsUrl = null,
    allowEmpty = false,
  }: {
    httpUrl?: string | null;
    httpsUrl?: string | null;
    allowEmpty?: boolean;
  } = {}) {
    super();
    if (!allowEmpty && !httpUrl && !httpsUrl) {
      throw new InvalidProxyConfig(
        "GenericProxyConfig requires you to define at least one of the two: http or https"
      );
    }
    this._httpUrl = httpUrl;
    this._httpsUrl = httpsUrl;
  }

  get httpUrl(): string | null {
    return this._httpUrl;
  }

  get httpsUrl(): string | null {
    return this._httpsUrl;
  }

  toProxyOptions(): ProxyOptions {
    return {
      http: this._httpUrl || this._httpsUrl || undefined,
      https: this._httpsUrl || this._httpUrl || undefined,
    };
  }
}

export class WebshareProxyConfig extends GenericProxyConfig {
  static DEFAULT_DOMAIN_NAME = "p.webshare.io";
  static DEFAULT_PORT = 80;

  private _filterIpLocations: string[];
  private _retriesWhenBlocked: number;

  constructor({
    proxyUsername,
    proxyPassword,
    filterIpLocations = [],
    retriesWhenBlocked = 10,
    domainName = WebshareProxyConfig.DEFAULT_DOMAIN_NAME,
    proxyPort = WebshareProxyConfig.DEFAULT_PORT,
  }: {
    proxyUsername: string;
    proxyPassword: string;
    filterIpLocations?: string[];
    retriesWhenBlocked?: number;
    domainName?: string;
    proxyPort?: number;
  }) {
    super({ allowEmpty: true });
    this.proxyUsername = proxyUsername;
    this.proxyPassword = proxyPassword;
    this.domainName = domainName;
    this.proxyPort = proxyPort;
    this._filterIpLocations = filterIpLocations;
    this._retriesWhenBlocked = retriesWhenBlocked;
  }

  proxyUsername: string;
  proxyPassword: string;
  domainName: string;
  proxyPort: number;

  get url(): string {
    const locationCodes = this._filterIpLocations
      .map((code) => `-${String(code).toUpperCase()}`)
      .join("");
    return (
      `http://${this.proxyUsername}${locationCodes}-rotate:${this.proxyPassword}` +
      `@${this.domainName}:${this.proxyPort}/`
    );
  }

  get httpUrl(): string {
    return this.url;
  }

  get httpsUrl(): string {
    return this.url;
  }

  get preventKeepingConnectionsAlive(): boolean {
    return true;
  }

  get retriesWhenBlocked(): number {
    return this._retriesWhenBlocked;
  }
}

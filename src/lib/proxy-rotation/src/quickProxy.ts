import { normalizeCountries } from './helpers';
import type { ProxyProtocol } from './models';
import { Proxy } from './models';
import { Providers } from './providers';

export async function QuickProxy(
	countries: string[] = [],
	protocol: ProxyProtocol = 'http'
): Promise<Proxy | null> {
	const normalizedCountries = normalizeCountries(countries);

	for (const provider of Providers.values()) {
		if (!provider.protocols.includes(protocol)) {
			continue;
		}
		if (normalizedCountries.length && !provider.countryFilter) {
			continue;
		}
		try {
			const proxies = await provider.providerFunction(normalizedCountries, protocol);
			if (proxies.length > 0) {
				return proxies[0];
			}
		} catch {
			continue;
		}
	}

	return null;
}

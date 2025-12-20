export class UnsupportedProxyProtocol extends Error {
	constructor(protocol: string) {
		super(
			`Protocol ${protocol} is not supported by swiftshadow, please choose between HTTP or HTTPS`
		);
		this.name = 'UnsupportedProxyProtocol';
	}
}

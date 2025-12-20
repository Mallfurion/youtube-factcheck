export type MonosansNames = {
	de: string;
	en: string;
	es: string;
	fr: string;
	ja: string;
	pt_BR: string;
	ru: string;
	zh_CN: string;
};

export type MonosansContinent = {
	code: string;
	geoname_id: number;
	names: MonosansNames;
};

export type MonosansCountry = {
	geoname_id: number;
	is_in_european_union: boolean;
	iso_code: string;
	names: MonosansNames;
};

export type MonosansLocation = {
	accuracy_radius: number;
	latitude: number;
	longitude: number;
	time_zone: string;
};

export type MonosansGeolocation = {
	continent: MonosansContinent;
	country: MonosansCountry;
	location: MonosansLocation;
	registered_country: MonosansCountry;
};

export type MonosansProxyDict = {
	protocol: string;
	username: string | null;
	password: string | null;
	host: string;
	port: number;
	exit_ip: string;
	timeout: number;
	geolocation: MonosansGeolocation | null;
};

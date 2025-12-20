export function getExpiry(timeToLiveMinutes: number): Date {
	return new Date(Date.now() + timeToLiveMinutes * 60_000);
}

export function checkExpiry(expiryDate: Date): boolean {
	return Date.now() >= expiryDate.getTime();
}

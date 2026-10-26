const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] }
export const TIME_ZONES: string[] = intl.supportedValuesOf?.('timeZone') ?? ['Asia/Colombo', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC']

import channelData from '../../channel.json';

export type AppChannel = 'release' | 'beta';

const envChannel = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_CHANNEL) as AppChannel | undefined;
export const APP_CHANNEL: AppChannel = envChannel || (channelData.channel as AppChannel) || 'release';
export const IS_BETA: boolean = APP_CHANNEL === 'beta';
export const APP_NAME: string = 'DBNerd';
export const APP_FULL_NAME: string = IS_BETA ? 'DBNerd Beta' : 'DBNerd';
export const APP_TAG: string = IS_BETA ? 'Beta' : 'Release';
export const APP_VERSION: string = '0.1.0';

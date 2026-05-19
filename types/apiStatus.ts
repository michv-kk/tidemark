export interface SourceStatus {
  ok: boolean;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  itemCount: number;
}

export interface ApiStatusMap {
  etherscan: SourceStatus;
  mempool: SourceStatus;
  dexscreener: SourceStatus;
  coingecko: SourceStatus;
}

export const INITIAL_SOURCE_STATUS: SourceStatus = {
  ok: false,
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  itemCount: 0,
};

export function createInitialApiStatus(): ApiStatusMap {
  return {
    etherscan: { ...INITIAL_SOURCE_STATUS },
    mempool: { ...INITIAL_SOURCE_STATUS },
    dexscreener: { ...INITIAL_SOURCE_STATUS },
    coingecko: { ...INITIAL_SOURCE_STATUS },
  };
}

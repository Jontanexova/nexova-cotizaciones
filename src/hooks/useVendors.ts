import { useCallback } from 'react';
import { fetchVendors } from '../lib/db';
import { useAsyncData } from './useAsyncData';

export function useVendors() {
  const fetcher = useCallback((signal: AbortSignal) => fetchVendors(signal), []);
  const { data, loading, error, reload } = useAsyncData(fetcher, []);
  return { vendors: data, loading, error, reload };
}

import { useCallback } from 'react';
import { fetchQuotes } from '../lib/db';
import { useAsyncData } from './useAsyncData';

export function useQuotes() {
  const fetcher = useCallback((signal: AbortSignal) => fetchQuotes(signal), []);
  const { data, loading, error, reload } = useAsyncData(fetcher, []);
  return { quotes: data, loading, error, reload };
}

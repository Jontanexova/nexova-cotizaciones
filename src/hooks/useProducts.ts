import { useCallback } from 'react';
import { fetchProductsWithModules } from '../lib/db';
import { useAsyncData } from './useAsyncData';

export function useProducts() {
  const fetcher = useCallback(
    (signal: AbortSignal) => fetchProductsWithModules(signal),
    [],
  );
  const { data, loading, error, reload } = useAsyncData(fetcher, []);
  return { products: data, loading, error, reload };
}

import { useEffect, useState } from 'react';
import { fetchProductsWithModules } from '../lib/db';
import type { Product } from '../lib/types';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = async () => {
    try {
      setLoading(true);
      const data = await fetchProductsWithModules();
      setProducts(data);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { products, loading, error, reload };
}

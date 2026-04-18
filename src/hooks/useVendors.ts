import { useEffect, useState } from 'react';
import { fetchVendors } from '../lib/db';
import type { Vendor } from '../lib/types';

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = async () => {
    try {
      setLoading(true);
      const data = await fetchVendors();
      setVendors(data);
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

  return { vendors, loading, error, reload };
}

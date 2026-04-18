import { useEffect, useState, useCallback } from 'react';
import { fetchQuotes } from '../lib/db';
import type { Quote } from '../lib/types';

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchQuotes();
      setQuotes(data);
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { quotes, loading, error, reload };
}

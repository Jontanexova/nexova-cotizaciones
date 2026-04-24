import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook universal para cargar datos asíncronos con cancelación correcta.
 *
 * Características:
 *  - Cancela la query si el componente se desmonta (evita setState en componente
 *    desmontado y memory leaks).
 *  - Cancela queries anteriores si `reload()` se llama mientras otra está en curso.
 *  - Detecta si una respuesta es obsoleta comparando un identificador secuencial,
 *    previene race conditions cuando múltiples llamadas se resuelven en desorden.
 *
 * @param fetcher función async que recibe un AbortSignal y retorna los datos.
 *   DEBE pasar el signal al `supabase.from(...).abortSignal(signal)` para
 *   cancelar la request HTTP real.
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  initialValue: T,
) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Mantenemos la referencia al controller activo para poder abortarlo.
  const activeControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    // Cancelar cualquier petición anterior que esté en curso.
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    const thisRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    try {
      const result = await fetcher(controller.signal);
      // Si otra llamada más reciente ya empezó, descartamos este resultado.
      if (thisRequestId !== requestIdRef.current) return;
      if (!mountedRef.current) return;
      setData(result);
    } catch (e: any) {
      // Un abort es intencional, no es un error real.
      if (e?.name === 'AbortError' || controller.signal.aborted) return;
      if (thisRequestId !== requestIdRef.current) return;
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (thisRequestId === requestIdRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
    // fetcher debe ser estable (useCallback upstream) o el caller debe aceptar
    // que cada render recrea el fetcher — lo cual invalida nuestro dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    run();
    return () => {
      mountedRef.current = false;
      activeControllerRef.current?.abort();
    };
  }, [run]);

  return { data, loading, error, reload: run, setData };
}

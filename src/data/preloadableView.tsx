import React, { useEffect, useState, type ComponentType } from 'react';
import { DataPlaceholder } from '@/components/common/DataPlaceholder';

export function preloadable<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
): { View: (props: P) => React.ReactElement; preload: () => Promise<void>; isReady: () => boolean } {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<void> | undefined;
  const preload = () =>
    (pending ??= loader()
      .then((module) => {
        loaded = module.default;
      })
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      }));
  const View = (props: P) => {
    const [, ready] = useState(0);
    const [error, setError] = useState<Error | null>(null);
    useEffect(() => {
      let mounted = true;
      if (!loaded)
        void preload().then(
          () => {
            if (mounted) ready((value) => value + 1);
          },
          (reason: Error) => {
            if (mounted) setError(reason);
          },
        );
      return () => {
        mounted = false;
      };
    }, []);
    if (error) throw error;
    return loaded ? React.createElement(loaded, props) : <DataPlaceholder />;
  };
  return { View, preload, isReady: () => loaded !== undefined };
}

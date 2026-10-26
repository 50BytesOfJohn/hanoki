import * as React from "react";

/**
 * A callback whose identity never changes but always runs the latest closure,
 * so memoized children are not re-rendered just because a handler was rebuilt.
 * Only for event handlers — never call it during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const callbackRef = React.useRef(callback);

  React.useInsertionEffect(() => {
    callbackRef.current = callback;
  });

  return React.useCallback((...args: Args) => callbackRef.current(...args), []);
}

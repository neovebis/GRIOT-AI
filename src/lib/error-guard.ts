// In production SSR builds where React jsx-dev-runtime is resolved without jsxDEV,
// ensure globalThis/React has a reliable fallback so prerendering and SSR render smoothly.
try {
  const g = globalThis as any;
  if (!g.__jsxDEV_polyfilled__) {
    g.__jsxDEV_polyfilled__ = true;
    const REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
    const fallbackJsx = (type: any, config: any, maybeKey: any) => {
      let key = null;
      if (maybeKey !== undefined) key = "" + maybeKey;
      if (config && config.key !== undefined) key = "" + config.key;
      const props = { ...(config || {}) };
      delete props.key;
      const ref = props.ref !== undefined ? props.ref : null;
      delete props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref,
        props,
      };
    };

    if (typeof (globalThis as any).jsxDEV !== "function") {
      (globalThis as any).jsxDEV = fallbackJsx;
    }
  }
} catch {}

/**
 * Filters out harmless noise caused by third-party browser extensions
 * (e.g. Coinbase Wallet extension `acmacodkjbdgmoleebolmdjonilkdbch`, MetaMask, Grammarly).
 *
 * When an extension service worker idles or restarts, the extension's
 * injected content script throws asynchronous `Message channel disconnected`
 * (code 4900) errors that are not caused by the application.
 */

export function isExtensionNoise(err: unknown): boolean {
  if (!err) return false;
  const str = typeof err === "string" ? err : "";
  const obj = typeof err === "object" ? (err as Record<string, unknown>) : {};
  const message = typeof obj.message === "string" ? obj.message : str;
  const stack = typeof obj.stack === "string" ? obj.stack : "";
  const code = obj.code;
  const name = typeof obj.name === "string" ? obj.name : "";

  return (
    code === 4900 ||
    code === "4900" ||
    name === "MessageDisconnectedError" ||
    message.includes("Message channel disconnected") ||
    message.includes("Extension context invalidated") ||
    message.includes("Could not establish connection. Receiving end does not exist") ||
    message.includes("Receiving end does not exist") ||
    stack.includes("-extension://") ||
    stack.includes("acmacodkjbdgmoleebolmdjonilkdbch")
  );
}

export const EXTENSION_GUARD_INLINE_SCRIPT = `(function() {
  function isExtensionNoise(err) {
    if (!err) return false;
    var str = typeof err === 'string' ? err : '';
    var msg = (err && err.message) || str;
    var stack = (err && err.stack) || '';
    var code = err && err.code;
    var name = (err && err.name) || '';
    return (
      code === 4900 ||
      code === '4900' ||
      name === 'MessageDisconnectedError' ||
      msg.indexOf('Message channel disconnected') !== -1 ||
      msg.indexOf('Extension context invalidated') !== -1 ||
      msg.indexOf('Receiving end does not exist') !== -1 ||
      stack.indexOf('-extension://') !== -1 ||
      stack.indexOf('acmacodkjbdgmoleebolmdjonilkdbch') !== -1
    );
  }

  try {
    // 1. Intercept future addEventListener calls for error and unhandledrejection
    var origAdd = window.addEventListener;
    window.addEventListener = function(type, listener, options) {
      if ((type === 'unhandledrejection' || type === 'error') && typeof listener === 'function') {
        var wrapped = function(event) {
          var targetErr = type === 'unhandledrejection' ? event.reason : (event.error || event.message);
          if (isExtensionNoise(targetErr) || (event.filename && event.filename.indexOf('-extension://') !== -1)) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
            return;
          }
          return listener.apply(this, arguments);
        };
        listener.__griot_wrapped__ = wrapped;
        return origAdd.call(window, type, wrapped, options);
      }
      return origAdd.call(window, type, listener, options);
    };

    var origRemove = window.removeEventListener;
    window.removeEventListener = function(type, listener, options) {
      var target = (listener && listener.__griot_wrapped__) || listener;
      return origRemove.call(window, type, target, options);
    };

    // 2. Immediate capture listeners to discard extension errors
    origAdd.call(window, 'unhandledrejection', function(event) {
      if (isExtensionNoise(event.reason)) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
    }, true);

    origAdd.call(window, 'error', function(event) {
      if (
        isExtensionNoise(event.error) ||
        isExtensionNoise(event.message) ||
        (event.filename && event.filename.indexOf('-extension://') !== -1)
      ) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
    }, true);

    // 3. Prevent console.error from polluting when extension fails
    var origConsole = console.error;
    console.error = function() {
      for (var i = 0; i < arguments.length; i++) {
        if (isExtensionNoise(arguments[i])) {
          return;
        }
      }
      return origConsole.apply(console, arguments);
    };

    // 4. Guard window.onerror & window.onunhandledrejection
    var origOnError = window.onerror;
    window.onerror = function(msg, url, line, col, error) {
      if (isExtensionNoise(error) || isExtensionNoise(msg) || (url && url.indexOf('-extension://') !== -1)) {
        return true;
      }
      if (origOnError) return origOnError.apply(this, arguments);
    };

    var origOnUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = function(event) {
      if (isExtensionNoise(event.reason)) {
        if (event.preventDefault) event.preventDefault();
        return true;
      }
      if (origOnUnhandled) return origOnUnhandled.apply(this, arguments);
    };
  } catch (_) {}
})();`;

export function installExtensionErrorSuppression() {
  if (typeof window === "undefined") return;

  try {
    window.addEventListener(
      "unhandledrejection",
      (event: PromiseRejectionEvent) => {
        if (isExtensionNoise(event.reason)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );

    window.addEventListener(
      "error",
      (event: ErrorEvent) => {
        if (
          isExtensionNoise(event.error) ||
          isExtensionNoise(event.message) ||
          (event.filename && event.filename.includes("-extension://"))
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  } catch (_) {}
}

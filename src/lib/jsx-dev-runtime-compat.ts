// Universal compatibility shim for react/jsx-dev-runtime in SSR/prerender bundles
const REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");

export function jsxDEV(type: any, config: any, maybeKey: any, _isStaticChildren: any, _source: any, _self: any) {
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
}

export const Fragment = REACT_FRAGMENT_TYPE;
export default {
  jsxDEV,
  Fragment,
};

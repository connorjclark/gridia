// Temporary. https://github.com/developit/linkstate/issues/28

// @ts-nocheck
/* eslint-disable */

import delve from 'dlv';

/** @typedef {import('preact').AnyComponent} Component */

/**
 * @param {HTMLElement} t
 */
export function val(t) {
  if (t.type.match(/^che|rad/)) return t.checked;
  if (t.type.match(/^number|range/)) return t.valueAsNumber;
  return t.value;
}

/** Create an Event handler function that sets a given state property.
 *
 *	@param {Component} component	The component whose state should be updated
 *	@param {string} key				A dot-notated key path to update in the component's state
 *	@param {string} eventPath		A dot-notated key path to the value that should be retrieved from the Event or component
 *	@returns {function} linkedStateHandler
 */
export default function linkState(component, key, eventPath?: any) {
  const path = key.split('.'),
    cache = component.__lsc || (component.__lsc = {});

  return cache[key+eventPath] || (cache[key+eventPath] = function(e) {
    let t = e && e.target || this,
      state = {},
      obj = state,
      // v = typeof eventPath==='string' ? delve(e, eventPath) : (t && t.nodeName) ? (t.type.match(/^che|rad/) ? t.checked : t.value) : e,
      i = 0;

    let v = typeof eventPath==='string' ? delve(e, eventPath) : (t && t.nodeName) ? val(t) : e;

    for ( ; i<path.length-1; i++) {
      obj = obj[path[i]] || (obj[path[i]] = !i && component.state[path[i]] || {});
    }
    obj[path[i]] = v;
    component.setState(state);
  });
}

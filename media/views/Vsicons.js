var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(anchor = null) {
            this.a = anchor;
            this.e = this.n = null;
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                this.e = element(target.nodeName);
                this.t = target;
                this.h(html);
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.38.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const icons = [
        {
            name: "business",
            iconsvg: [
                {
                    name: "anticlockwise-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zm1 2v8h8v-8h-8zm-6-.414l1.828-1.829 1.415 1.415L5 14.414.757 10.172l1.415-1.415L4 10.586V8a5 5 0 0 1 5-5h4v2H9a3 3 0 0 0-3 3v2.586z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anticlockwise-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 10h3l-4 5-4-5h3V8a5 5 0 0 1 5-5h4v2H9a3 3 0 0 0-3 3v2zm5-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anticlockwise-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13.414 6l1.829 1.828-1.415 1.415L9.586 5 13.828.757l1.415 1.415L13.414 4H16a5 5 0 0 1 5 5v4h-2V9a3 3 0 0 0-3-3h-2.586zM15 11v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1zm-2 1H5v8h8v-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anticlockwise-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 4h2a5 5 0 0 1 5 5v4h-2V9a3 3 0 0 0-3-3h-2v3L9 5l5-4v3zm1 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 6h12v12H6V6zm0-4h2v3H6V2zm0 17h2v3H6v-3zM2 6h3v2H2V6zm0 10h3v2H2v-2zM19 6h3v2h-3V6zm0 10h3v2h-3v-2zM16 2h2v3h-2V2zm0 17h2v3h-2v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.586 17H3v-2h18v2h-5.586l3.243 3.243-1.414 1.414L13 17.414V20h-2v-2.586l-4.243 4.243-1.414-1.414L8.586 17zM5 3h14a1 1 0 0 1 1 1v10H4V4a1 1 0 0 1 1-1zm1 2v7h12V5H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 8v8h8V8H8zM6 6h12v12H6V6zm0-4h2v3H6V2zm0 17h2v3H6v-3zM2 6h3v2H2V6zm0 10h3v2H2v-2zM19 6h3v2h-3V6zm0 10h3v2h-3v-2zM16 2h2v3h-2V2zm0 17h2v3h-2v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.586 17H3v-2h18v2h-5.586l3.243 3.243-1.414 1.414L13 17.414V20h-2v-2.586l-4.243 4.243-1.414-1.414L8.586 17zM5 3h14a1 1 0 0 1 1 1v10H4V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ball-pen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.849 11.808l-.707-.707-9.9 9.9H3v-4.243L14.313 5.444l5.657 5.657a1 1 0 0 1 0 1.414l-7.07 7.071-1.415-1.414 6.364-6.364zm-2.121-2.121l-1.415-1.414L5 17.586v1.415h1.414l9.314-9.314zm2.828-7.071l2.829 2.828a1 1 0 0 1 0 1.414L19.97 8.273 15.728 4.03l1.414-1.414a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "blur-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.432 6.846L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414-3.038-3.04A9 9 0 0 1 5.432 6.848zM8.243 4.03L12 .272l6.364 6.364a9.002 9.002 0 0 1 2.05 9.564L8.244 4.03z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "blur-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.154 19.568A9 9 0 0 1 5.432 6.846L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414-3.038-3.04zM6.847 8.262a7 7 0 0 0 9.891 9.89l-9.89-9.89zM20.414 16.2l-1.599-1.599a6.995 6.995 0 0 0-1.865-6.55L12 3.1 9.657 5.443 8.243 4.03 12 .272l6.364 6.364a9.002 9.002 0 0 1 2.05 9.564z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 11V8h-6V4h-4v4H4v3h16zm1 2v8a1 1 0 0 1-1 1H10v-6H8v6H4a1 1 0 0 1-1-1v-8H2V7a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3h5a1 1 0 0 1 1 1v6h-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ball-pen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.849 11.808l-.707-.707-9.9 9.9H3v-4.243L14.313 5.444l5.657 5.657a1 1 0 0 1 0 1.414l-7.07 7.071-1.415-1.414 6.364-6.364zm.707-9.192l2.829 2.828a1 1 0 0 1 0 1.414L19.97 8.273 15.728 4.03l1.414-1.414a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.536 15.95l2.12-2.122-3.181-3.182 3.535-3.535-2.12-2.121-3.536 3.535-3.182-3.182L8.05 7.464l8.486 8.486zm-1.415 1.414L6.636 8.879l-2.828 2.828 8.485 8.485 2.828-2.828zM13.354 5.697l2.828-2.829a1 1 0 0 1 1.414 0l3.536 3.536a1 1 0 0 1 0 1.414l-2.829 2.828 2.475 2.475a1 1 0 0 1 0 1.415L13 22.314a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l7.778-7.778a1 1 0 0 1 1.415 0l2.475 2.475z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.536 15.95l2.12-2.122-3.181-3.182 3.535-3.535-2.12-2.121-3.536 3.535-3.182-3.182L8.05 7.464l8.486 8.486zM13.354 5.697l2.828-2.829a1 1 0 0 1 1.414 0l3.536 3.536a1 1 0 0 1 0 1.414l-2.829 2.828 2.475 2.475a1 1 0 0 1 0 1.415L13 22.314a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l7.778-7.778a1 1 0 0 1 1.415 0l2.475 2.475z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 20v-5h2v5h9v-7H5v7h3zm-4-9h16V8h-6V4h-4v4H4v3zM3 21v-8H2V7a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3h5a1 1 0 0 1 1 1v6h-1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 5v6.273H7V5H5v9h14V5H9zm11 11H4v2h16v-2zM3 14V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10h1v5a1 1 0 0 1-1 1h-8v3h-2v-3H3a1 1 0 0 1-1-1v-5h1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.289 6.216l4.939-3.841a1 1 0 0 1 1.32.082l2.995 2.994a1 1 0 0 1 .082 1.321l-3.84 4.938a7.505 7.505 0 0 1-7.283 9.292C8 21.002 3.5 19.5 1 18c3.98-3 3.047-4.81 3.5-6.5 1.058-3.95 4.842-6.257 8.789-5.284zm3.413 1.879c.065.063.13.128.193.194l1.135 1.134 2.475-3.182-1.746-1.746-3.182 2.475 1.125 1.125z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.456 9.678l-.142-.142a5.475 5.475 0 0 0-2.39-1.349c-2.907-.778-5.699.869-6.492 3.83-.043.16-.066.34-.104.791-.154 1.87-.594 3.265-1.8 4.68 2.26.888 4.938 1.514 6.974 1.514a5.505 5.505 0 0 0 5.31-4.078 5.497 5.497 0 0 0-1.356-5.246zM13.29 6.216l4.939-3.841a1 1 0 0 1 1.32.082l2.995 2.994a1 1 0 0 1 .082 1.321l-3.84 4.938a7.505 7.505 0 0 1-7.283 9.292C8 21.002 3.5 19.5 1 18c3.98-3 3.047-4.81 3.5-6.5 1.058-3.95 4.842-6.257 8.789-5.284zm3.413 1.879c.065.063.13.128.193.194l1.135 1.134 2.475-3.182-1.746-1.746-3.182 2.475 1.125 1.125z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 16H4v2h16v-2zM3 14V4a1 1 0 0 1 1-1h3v8.273h2V3h11a1 1 0 0 1 1 1v10h1v5a1 1 0 0 1-1 1h-8v3h-2v-3H3a1 1 0 0 1-1-1v-5h1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 4V1l5 4-5 4V6H8a3 3 0 0 0-3 3v4H3V9a5 5 0 0 1 5-5h2zm-1 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10.586 4L8.757 2.172 10.172.757 14.414 5l-4.242 4.243-1.415-1.415L10.586 6H8a3 3 0 0 0-3 3v4H3V9a5 5 0 0 1 5-5h2.586zM9 11a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V11zm2 1v8h8v-8h-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 10h3l-4 5-4-5h3V8a3 3 0 0 0-3-3h-4V3h4a5 5 0 0 1 5 5v2zm-7-1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 10.586l1.828-1.829 1.415 1.415L19 14.414l-4.243-4.242 1.415-1.415L18 10.586V8a3 3 0 0 0-3-3h-4V3h4a5 5 0 0 1 5 5v2.586zM13 9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h10zm-1 2H4v8h8v-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "collage-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zm-8.811 10.158L5 14.25V19h7.218l-1.03-5.842zM19 5h-7.219l2.468 14H19V5zM9.75 5H5v7.218l5.842-1.03L9.75 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "collage-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11.189 13.157L12.57 21 4 21c-.552 0-1-.448-1-1v-5.398l8.189-1.445zM20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1h-5.398L11.428 3H20zM9.397 3l1.444 8.188L3 12.57 3 4c0-.552.448-1 1-1h5.397z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.33 13.5A6.988 6.988 0 0 0 19 8h2a8.987 8.987 0 0 1-3.662 7.246l2.528 4.378a2 2 0 0 1-.732 2.732l-3.527-6.108A8.97 8.97 0 0 1 12 17a8.97 8.97 0 0 1-3.607-.752l-3.527 6.108a2 2 0 0 1-.732-2.732l5.063-8.77A4.002 4.002 0 0 1 11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728L16.33 13.5zM14.6 14.502l-1.528-2.647a4.004 4.004 0 0 1-2.142 0l-1.528 2.647c.804.321 1.68.498 2.599.498.918 0 1.795-.177 2.599-.498zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.33 13.5A6.988 6.988 0 0 0 19 8h2a8.987 8.987 0 0 1-3.662 7.246l2.528 4.378a2 2 0 0 1-.732 2.732l-3.527-6.108A8.97 8.97 0 0 1 12 17a8.97 8.97 0 0 1-3.607-.752l-3.527 6.108a2 2 0 0 1-.732-2.732l5.063-8.77A4.002 4.002 0 0 1 11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728L16.33 13.5zM14.6 14.502l-1.528-2.647a4.004 4.004 0 0 1-2.142 0l-1.528 2.647c.804.321 1.68.498 2.599.498.918 0 1.795-.177 2.599-.498zM12 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728l6.063 10.502-1.732 1-6.063-10.501a4.004 4.004 0 0 1-2.142 0L4.866 22.356l-1.732-1 6.063-10.502A4.002 4.002 0 0 1 11 4.126zM12 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-6.671-5.575A8 8 0 1 0 16.425 5.328a8.997 8.997 0 0 1-2.304 8.793 8.997 8.997 0 0 1-8.792 2.304z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728l6.063 10.502-1.732 1-6.063-10.501a4.004 4.004 0 0 1-2.142 0L4.866 22.356l-1.732-1 6.063-10.502A4.002 4.002 0 0 1 11 4.126zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0zM12 3.101L7.05 8.05A6.978 6.978 0 0 0 5 13h14a6.978 6.978 0 0 0-2.05-4.95L12 3.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-5-4.68a8.965 8.965 0 0 0 5.707-2.613A8.965 8.965 0 0 0 15.32 7 6 6 0 1 1 7 15.32z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272zM7 13h10a5 5 0 0 1-10 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0zM7.05 8.05A7 7 0 0 0 12.004 20L12 3.1 7.05 8.05z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272zM12 18V8a5 5 0 0 1 0 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2V4a8 8 0 1 0 0 16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.586 5l2.556-2.556 1.414 1.414L19 6.414V17h3v2h-3v3h-2V7H9V5h8.586zM15 17v2H6a1 1 0 0 1-1-1V7H2V5h3V2h2v15h8zM9 9h6v6H9V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-2V6a6 6 0 1 1 0 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.414 17H15v2H6a1 1 0 0 1-1-1V7H2V5h3V2h2v13.586L15.586 7H9V5h8.586l2.556-2.556 1.414 1.414L19 6.414V17h3v2h-3v3h-2V8.414L8.414 17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 17h3v2h-3v3h-2v-3H6a1 1 0 0 1-1-1V7H2V5h3V2h2v3h11a1 1 0 0 1 1 1v11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-drop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M16 13l6.964 4.062-2.973.85 2.125 3.681-1.732 1-2.125-3.68-2.223 2.15L16 13zm-2-7h2v2h5a1 1 0 0 1 1 1v4h-2v-3H10v10h4v2H9a1 1 0 0 1-1-1v-5H6v-2h2V9a1 1 0 0 1 1-1h5V6zM4 14v2H2v-2h2zm0-4v2H2v-2h2zm0-4v2H2V6h2zm0-4v2H2V2h2zm4 0v2H6V2h2zm4 0v2h-2V2h2zm4 0v2h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 11V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8l4-4 4 4h-3v5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22l-4-4h8l-4 4zm0-20l4 4H8l4-4zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM2 12l4-4v8l-4-4zm20 0l-4 4V8l4 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 11V5.828L9.172 7.657 7.757 6.243 12 2l4.243 4.243-1.415 1.414L13 5.828V11h5.172l-1.829-1.828 1.414-1.415L22 12l-4.243 4.243-1.414-1.415L18.172 13H13v5.172l1.828-1.829 1.415 1.414L12 22l-4.243-4.243 1.415-1.414L11 18.172V13H5.828l1.829 1.828-1.414 1.415L2 12l4.243-4.243 1.414 1.415L5.828 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2l4.243 4.243-1.415 1.414L12 4.828 9.172 7.657 7.757 6.243 12 2zM2 12l4.243-4.243 1.414 1.415L4.828 12l2.829 2.828-1.414 1.415L2 12zm20 0l-4.243 4.243-1.414-1.415L19.172 12l-2.829-2.828 1.414-1.415L22 12zm-10 2a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8l-4.243-4.243 1.415-1.414L12 19.172l2.828-2.829 1.415 1.414L12 22z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 17v2H6a1 1 0 0 1-1-1V7H2V5h3V2h2v15h8zm2 5V7H9V5h9a1 1 0 0 1 1 1v11h3v2h-3v3h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-drop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 6h2v2h5a1 1 0 0 1 1 1v7.5L16 13l.036 8.062 2.223-2.15L20.041 22H9a1 1 0 0 1-1-1v-5H6v-2h2V9a1 1 0 0 1 1-1h5V6zm8 11.338V21a1 1 0 0 1-.048.307l-1.96-3.394L22 17.338zM4 14v2H2v-2h2zm0-4v2H2v-2h2zm0-4v2H2V6h2zm0-4v2H2V2h2zm4 0v2H6V2h2zm4 0v2h-2V2h2zm4 0v2h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.757 3l-7.466 7.466.008 4.247 4.238-.007L21 7.243V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12.757zm3.728-.9L21.9 3.516l-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.757 3l-2 2H5v14h14V9.243l2-2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12.757zm3.728-.9L21.9 3.516l-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.626 3.132L9.29 10.466l.008 4.247 4.238-.007 7.331-7.332A9.957 9.957 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2c1.669 0 3.242.409 4.626 1.132zm3.86-1.031l1.413 1.414-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.684 4.029a8 8 0 1 0 7.287 7.287 7.936 7.936 0 0 0-.603-2.44l1.5-1.502A9.933 9.933 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2a9.982 9.982 0 0 1 4.626 1.132l-1.501 1.5a7.941 7.941 0 0 0-2.44-.603zM20.485 2.1L21.9 3.515l-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.243 19H21v2H3v-4.243l9.9-9.9 4.242 4.244L9.242 19zm5.07-13.556l2.122-2.122a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414l-2.122 2.121-4.242-4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.243 18H3v-4.243L14.435 2.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 18zM3 20h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 19h1.414l9.314-9.314-1.414-1.414L5 17.586V19zm16 2H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L9.243 19H21v2zM15.728 6.858l1.414 1.414 1.414-1.414-1.414-1.414-1.414 1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "eraser-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.586 8.858l-4.95 4.95 5.194 5.194H10V19h1.172l3.778-3.778-6.364-6.364zM10 7.444l6.364 6.364 2.828-2.829-6.364-6.364L10 7.444zM14 19h7v2h-9l-3.998.002-6.487-6.487a1 1 0 0 1 0-1.414L12.12 2.494a1 1 0 0 1 1.415 0l7.778 7.778a1 1 0 0 1 0 1.414L14 19z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 18c4.427 0 8-3.573 8-8s-3.573-8-8-8a7.99 7.99 0 0 0-8 8c0 4.427 3.573 8 8 8zm0-2c-3.32 0-6-2.68-6-6s2.68-6 6-6 6 2.68 6 6-2.68 6-6 6zm0-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.414 16L16.556 5.858l-1.414-1.414L5 14.586V16h1.414zm.829 2H3v-4.243L14.435 2.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 18zM3 20h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "eraser-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 19h7v2h-9l-3.998.002-6.487-6.487a1 1 0 0 1 0-1.414L12.12 2.494a1 1 0 0 1 1.415 0l7.778 7.778a1 1 0 0 1 0 1.414L14 19zm1.657-4.485l3.535-3.536-6.364-6.364-3.535 3.536 6.364 6.364z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-4a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13 1l.001 3.062A8.004 8.004 0 0 1 19.938 11H23v2l-3.062.001a8.004 8.004 0 0 1-6.937 6.937L13 23h-2v-3.062a8.004 8.004 0 0 1-6.938-6.937L1 13v-2h3.062A8.004 8.004 0 0 1 11 4.062V1h2zm-1 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "grid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 10v4h-4v-4h4zm2 0h5v4h-5v-4zm-2 11h-4v-5h4v5zm2 0v-5h5v4a1 1 0 0 1-1 1h-4zM14 3v5h-4V3h4zm2 0h4a1 1 0 0 1 1 1v4h-5V3zm-8 7v4H3v-4h5zm0 11H4a1 1 0 0 1-1-1v-4h5v5zM8 3v5H3V4a1 1 0 0 1 1-1h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 1l.001 3.062A8.004 8.004 0 0 1 19.938 11H23v2l-3.062.001a8.004 8.004 0 0 1-6.937 6.937L13 23h-2v-3.062a8.004 8.004 0 0 1-6.938-6.937L1 13v-2h3.062A8.004 8.004 0 0 1 11 4.062V1h2zm-1 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "grid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 10h-4v4h4v-4zm2 0v4h3v-4h-3zm-2 9v-3h-4v3h4zm2 0h3v-3h-3v3zM14 5h-4v3h4V5zm2 0v3h3V5h-3zm-8 5H5v4h3v-4zm0 9v-3H5v3h3zM8 5H5v3h3V5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hammer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 8V2h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3zm-2 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8H2.5V6.074a1 1 0 0 1 .496-.863L8.5 2H15v20z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ink-bottle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 9l4.371 1.749c.38.151.629.52.629.928V21c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1v-9.323c0-.409.249-.777.629-.928L8 9h8zm-.385 2h-7.23L5 12.354V20h14v-1H8v-5h11v-1.646L15.615 11zM16 3c.552 0 1 .448 1 1v4H7V4c0-.552.448-1 1-1h8zm-1 2H9v1h6V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hammer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5v13a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9H3.5a1 1 0 0 1-1-1V5.618a1 1 0 0 1 .553-.894L8.5 2H20zm-5 2H8.972L4.5 6.236V7H11v14h2V7h2V4zm4 0h-2v3h2V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "input-method-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5.869 12h4.262l.82 2h2.216L13 7h-2L6.833 17H9.05l.82-2zm.82-2L12 9.8l1.311 3.2H10.69z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16zM11 5H5v14h6V5zm8 8h-6v6h6v-6zm0-8h-6v6h6V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ink-bottle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 9l4.371 1.749c.38.151.629.52.629.928V21c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1v-9.323c0-.409.249-.777.629-.928L8 9h8zm4 5H8v5h12v-5zM16 3c.552 0 1 .448 1 1v4H7V4c0-.552.448-1 1-1h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 3v18H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7zm10 10v7a1 1 0 0 1-1 1h-7v-8h8zM20 3a1 1 0 0 1 1 1v7h-8V3h7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "input-method-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V5H5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5.869 12l-.82 2H6.833L11 7h2l4.167 10H14.95l-.82-2H9.87zm.82-2h2.622L12 9.8 10.689 13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 10v11H4a1 1 0 0 1-1-1V10h5zm13 0v10a1 1 0 0 1-1 1H10V10h11zm-1-7a1 1 0 0 1 1 1v4H3V4a1 1 0 0 1 1-1h16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16zm-9 10H5v6h6v-6zm2 6h6V5h-6v14zM11 5H5v6h6V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M4 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4zm4-11H5v9h3v-9zm11 0h-9v9h9v-9zm0-5H5v3h14V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 13v8H4a1 1 0 0 1-1-1v-7h8zm2-10h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7V3zM3 4a1 1 0 0 1 1-1h7v8H3V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 10v11H3a1 1 0 0 1-1-1V10h5zm15 0v10a1 1 0 0 1-1 1H9V10h13zm-1-7a1 1 0 0 1 1 1v4H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-6-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 10v11H3a1 1 0 0 1-1-1V10h13zm7 0v10a1 1 0 0 1-1 1h-4V10h5zm-1-7a1 1 0 0 1 1 1v4H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-6-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3zm12-11H4v9h11v-9zm5 0h-3v9h3v-9zm0-5H4v3h16V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3zm4-11H4v9h3v-9zm13 0H9v9h11v-9zm0-5H4v3h16V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-2 13H5v2h14v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM4 16v3h16v-3H4zm0-2h16V5H4v9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-2 10v2H6v-2h12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 16v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4h20zM21 3a1 1 0 0 1 1 1v10H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-column-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 5H5v14h6V5zm2 0v14h6V5h-6zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 21V10h5v10a1 1 0 0 1-1 1h-4zm-2 0H4a1 1 0 0 1-1-1V10h11v11zm7-13H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-grid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 12.999V20a1 1 0 0 1-1 1h-8v-8.001h9zm-11 0V21H3a1 1 0 0 1-1-1v-7.001h9zM11 3v7.999H2V4a1 1 0 0 1 1-1h8zm10 0a1 1 0 0 1 1 1v6.999h-9V3h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-grid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM11 13H4v6h7v-6zm9 0h-7v6h7v-6zm-9-8H4v6h7V5zm9 0h-7v6h7V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM7 6H5v12h2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-column-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 5v14h7V5h-7zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM7 5H4v14h3V5zm13 0H9v14h11V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9V3h12zM7 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4v18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zM8 7v10H6V7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-masonry-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 9.999V20a1 1 0 0 1-1 1h-8V9.999h9zm-11 6V21H3a1 1 0 0 1-1-1v-4.001h9zM11 3v10.999H2V4a1 1 0 0 1 1-1h8zm10 0a1 1 0 0 1 1 1v3.999h-9V3h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-masonry-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16zm-11-5H4v4h7v-4zm9-4h-7v8h7v-8zm-9-6H4v8h7V5zm9 0h-7v4h7V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-2 3h-2v12h2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-2 2v10h-2V7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4V3h4zm-6 18H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12v18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-row-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M19 12H5v7h14v-7zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-row-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M19 11V5H5v6h14zm0 2H5v6h14v-6zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-6 2H4v14h11V5zm5 0h-3v14h3V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-2 3H5v2h14V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-2 2v2H6V7h12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 10v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10h20zm-1-7a1 1 0 0 1 1 1v4H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM4 10v9h16v-9H4zm0-2h16V5H4v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "magic-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.224 15.508l-2.213 4.65a.6.6 0 0 1-.977.155l-3.542-3.739a.6.6 0 0 0-.357-.182l-5.107-.668a.6.6 0 0 1-.449-.881l2.462-4.524a.6.6 0 0 0 .062-.396L4.16 4.86a.6.6 0 0 1 .7-.7l5.063.943a.6.6 0 0 0 .396-.062l4.524-2.462a.6.6 0 0 1 .881.45l.668 5.106a.6.6 0 0 0 .182.357l3.739 3.542a.6.6 0 0 1-.155.977l-4.65 2.213a.6.6 0 0 0-.284.284zm.797 1.927l1.414-1.414 4.243 4.242-1.415 1.415-4.242-4.243z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "magic-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.199 9.945a2.6 2.6 0 0 1-.79-1.551l-.403-3.083-2.73 1.486a2.6 2.6 0 0 1-1.72.273L6.5 6.5l.57 3.056a2.6 2.6 0 0 1-.273 1.72l-1.486 2.73 3.083.403a2.6 2.6 0 0 1 1.55.79l2.138 2.257 1.336-2.807a2.6 2.6 0 0 1 1.23-1.231l2.808-1.336-2.257-2.137zm.025 5.563l-2.213 4.65a.6.6 0 0 1-.977.155l-3.542-3.739a.6.6 0 0 0-.357-.182l-5.107-.668a.6.6 0 0 1-.449-.881l2.462-4.524a.6.6 0 0 0 .062-.396L4.16 4.86a.6.6 0 0 1 .7-.7l5.063.943a.6.6 0 0 0 .396-.062l4.524-2.462a.6.6 0 0 1 .881.45l.668 5.106a.6.6 0 0 0 .182.357l3.739 3.542a.6.6 0 0 1-.155.977l-4.65 2.213a.6.6 0 0 0-.284.284zm.797 1.927l1.414-1.414 4.243 4.242-1.415 1.415-4.242-4.243z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8h14V5H5v3zm9 11v-9H5v9h9zm2 0h3v-9h-3v9zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mark-pen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.95 2.393l5.657 5.657a1 1 0 0 1 0 1.414l-7.779 7.779-2.12.707-1.415 1.414a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414l1.414-1.414.707-2.121 7.779-7.779a1 1 0 0 1 1.414 0zm.707 3.536l-6.364 6.364 1.414 1.414 6.364-6.364-1.414-1.414zM4.282 16.889l2.829 2.829-1.414 1.414-4.243-1.414 2.828-2.829z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mark-pen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.243 4.515l-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.829 1.04-1.041 2.122-.707 6.737-6.738-4.242-4.242zm6.364 3.535a1 1 0 0 1 0 1.414l-7.779 7.779-2.12.707-1.415 1.414a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414l1.414-1.414.707-2.121 7.779-7.779a1 1 0 0 1 1.414 0l5.657 5.657zm-6.364-.707l1.414 1.414-4.95 4.95-1.414-1.414 4.95-4.95zM4.283 16.89l2.828 2.829-1.414 1.414-4.243-1.414 2.828-2.829z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-brush-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 9h6a1 1 0 0 1 1 1v3h1v6h-4v-6h1v-2H5a1 1 0 0 1-1-1v-2h2v1zm11.732 1.732l1.768-1.768 1.768 1.768a2.5 2.5 0 1 1-3.536 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "markup-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm5.051-3.796l-.862-3.447a1 1 0 0 0-.97-.757H8.781a1 1 0 0 0-.97.757l-.862 3.447A7.967 7.967 0 0 0 12 20a7.967 7.967 0 0 0 5.051-1.796zM10 12h4v-1.5l-1.038-3.635a1 1 0 0 0-1.924 0L10 10.5V12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-brush-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v3h14V5H5zM4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 9h6a1 1 0 0 1 1 1v3h1v6h-4v-6h1v-2H5a1 1 0 0 1-1-1v-2h2v1zm11.732 1.732l1.768-1.768 1.768 1.768a2.5 2.5 0 1 1-3.536 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.228 18.732l1.768-1.768 1.767 1.768a2.5 2.5 0 1 1-3.535 0zM8.878 1.08l11.314 11.313a1 1 0 0 1 0 1.415l-8.485 8.485a1 1 0 0 1-1.414 0l-8.485-8.485a1 1 0 0 1 0-1.415l7.778-7.778-2.122-2.121L8.88 1.08zM11 6.03L3.929 13.1H18.07L11 6.03z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.228 18.732l1.768-1.768 1.767 1.768a2.5 2.5 0 1 1-3.535 0zM8.878 1.08l11.314 11.313a1 1 0 0 1 0 1.415l-8.485 8.485a1 1 0 0 1-1.414 0l-8.485-8.485a1 1 0 0 1 0-1.415l7.778-7.778-2.122-2.121L8.88 1.08zM11 6.03L3.929 13.1 11 20.173l7.071-7.071L11 6.029z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "markup-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10 10.5l1.038-3.635a1 1 0 0 1 1.924 0L14 10.5V12h.72a1 1 0 0 1 .97.757l1.361 5.447a8 8 0 1 0-10.102 0l1.362-5.447A1 1 0 0 1 9.28 12H10v-1.5zm2 9.5a7.952 7.952 0 0 0 3.265-.694L13.938 14h-3.876l-1.327 5.306A7.95 7.95 0 0 0 12 20zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "palette-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.522 0 10 3.978 10 8.889a5.558 5.558 0 0 1-5.556 5.555h-1.966c-.922 0-1.667.745-1.667 1.667 0 .422.167.811.422 1.1.267.3.434.689.434 1.122C13.667 21.256 12.9 22 12 22 6.478 22 2 17.522 2 12S6.478 2 12 2zm-1.189 16.111a3.664 3.664 0 0 1 3.667-3.667h1.966A3.558 3.558 0 0 0 20 10.89C20 7.139 16.468 4 12 4a8 8 0 0 0-.676 15.972 3.648 3.648 0 0 1-.513-1.86zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM12 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pen-nib-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 21.485l5.846-5.846a2 2 0 1 0-1.414-1.414l-5.846 5.846-1.06-1.06c2.827-3.3 3.888-6.954 5.302-13.082l6.364-.707 5.657 5.657-.707 6.364c-6.128 1.414-9.782 2.475-13.081 5.303l-1.061-1.06zM16.596 2.04l6.347 6.346a.5.5 0 0 1-.277.848l-1.474.23-5.656-5.656.212-1.485a.5.5 0 0 1 .848-.283z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pantone-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 18.922l-1.35-.545a1 1 0 0 1-.552-1.302L4 12.367v6.555zM8.86 21H7a1 1 0 0 1-1-1v-6.078L8.86 21zM6.022 5.968l9.272-3.746a1 1 0 0 1 1.301.552l5.62 13.908a1 1 0 0 1-.553 1.302L12.39 21.73a1 1 0 0 1-1.302-.553L5.47 7.27a1 1 0 0 1 .553-1.301zM9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pantone-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.764 8l-.295-.73a1 1 0 0 1 .553-1.302l9.272-3.746a1 1 0 0 1 1.301.552l5.62 13.908a1 1 0 0 1-.553 1.302L12.39 21.73a1 1 0 0 1-1.302-.553L11 20.96V21H7a1 1 0 0 1-1-1v-.27l-3.35-1.353a1 1 0 0 1-.552-1.302L5.764 8zM8 19h2.209L8 13.533V19zm-2-6.244l-1.673 4.141L6 17.608v-4.852zm1.698-5.309l4.87 12.054 7.418-2.997-4.87-12.053-7.418 2.996zm2.978 2.033a1 1 0 1 1-.749-1.855 1 1 0 0 1 .75 1.855z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.9 6.858l4.242 4.243L7.242 21H3v-4.243l9.9-9.9zm1.414-1.414l2.121-2.122a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414l-2.122 2.121-4.242-4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "palette-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.522 0 10 3.978 10 8.889a5.558 5.558 0 0 1-5.556 5.555h-1.966c-.922 0-1.667.745-1.667 1.667 0 .422.167.811.422 1.1.267.3.434.689.434 1.122C13.667 21.256 12.9 22 12 22 6.478 22 2 17.522 2 12S6.478 2 12 2zM7.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pen-nib-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.596 1.04l6.347 6.346a.5.5 0 0 1-.277.848l-1.474.23-5.656-5.656.212-1.485a.5.5 0 0 1 .848-.283zM4.595 20.15c3.722-3.331 7.995-4.328 12.643-5.52l.446-4.018-4.297-4.297-4.018.446c-1.192 4.648-2.189 8.92-5.52 12.643L2.454 18.01c2.828-3.3 3.89-6.953 5.303-13.081l6.364-.707 5.657 5.657-.707 6.364c-6.128 1.414-9.782 2.475-13.081 5.303L4.595 20.15zm5.284-6.03a2 2 0 1 1 2.828-2.828A2 2 0 0 1 9.88 14.12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.728 9.686l-1.414-1.414L5 17.586V19h1.414l9.314-9.314zm1.414-1.414l1.414-1.414-1.414-1.414-1.414 1.414 1.414 1.414zM7.242 21H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 12.707l1.828 1.829L8.88 13.12 7.05 11.293l1.414-1.414 1.829 1.828 1.414-1.414L9.88 8.464l1.414-1.414L13.12 8.88l1.415-1.415-1.829-1.828 2.829-2.828a1 1 0 0 1 1.414 0l4.242 4.242a1 1 0 0 1 0 1.414L8.464 21.192a1 1 0 0 1-1.414 0L2.808 16.95a1 1 0 0 1 0-1.414l2.828-2.829zm8.485 5.656l4.243-4.242L21 16.757V21h-4.242l-2.637-2.637zM5.636 9.878L2.807 7.05a1 1 0 0 1 0-1.415l2.829-2.828a1 1 0 0 1 1.414 0L9.88 5.635 5.636 9.878z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.05 14.121L4.93 16.243l2.828 2.828L19.071 7.757 16.243 4.93 14.12 7.05l1.415 1.414L14.12 9.88l-1.414-1.415-1.414 1.415 1.414 1.414-1.414 1.414-1.414-1.414-1.415 1.414 1.415 1.414-1.415 1.415L7.05 14.12zm9.9-11.313l4.242 4.242a1 1 0 0 1 0 1.414L8.464 21.192a1 1 0 0 1-1.414 0L2.808 16.95a1 1 0 0 1 0-1.414L15.536 2.808a1 1 0 0 1 1.414 0zM14.12 18.363l1.415-1.414 2.242 2.243h1.414v-1.414l-2.242-2.243 1.414-1.414L21 16.757V21h-4.242l-2.637-2.637zM5.636 9.878L2.807 7.05a1 1 0 0 1 0-1.415l2.829-2.828a1 1 0 0 1 1.414 0L9.88 5.635 8.464 7.05 6.343 4.928 4.929 6.343l2.121 2.12-1.414 1.415z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 18v2h4v-2H5zM3 7l4-5 4 5v15H3V7zm18 1h-2v2h2v2h-3v2h3v2h-2v2h2v3a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "quill-pen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.94 14.036c-.233.624-.43 1.2-.606 1.783.96-.697 2.101-1.139 3.418-1.304 2.513-.314 4.746-1.973 5.876-4.058l-1.456-1.455 1.413-1.415 1-1.001c.43-.43.915-1.224 1.428-2.368-5.593.867-9.018 4.292-11.074 9.818zM17 9.001L18 10c-1 3-4 6-8 6.5-2.669.334-4.336 2.167-5.002 5.5H3C4 16 6 2 21 2c-1 2.997-1.998 4.996-2.997 5.997L17 9.001z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 19h2v-5h-9V5H5v2h2v2H5v2h3v2H5v2h2v2H5v2h2v-2h2v2h2v-3h2v3h2v-2h2v2zm-5-7h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 21h-2v-3h-2v3H9v-2H7v2H4a1 1 0 0 1-1-1v-3h2v-2H3v-2h3v-2H3V9h2V7H3V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3v-2h-2v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8v12h4V8H5zM3 7l4-5 4 5v15H3V7zm16 9v-2h-3v-2h3v-2h-2V8h2V6h-4v14h4v-2h-2v-2h2zM14 4h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "quill-pen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2C6 2 4 16 3 22h1.998c.666-3.333 2.333-5.166 5.002-5.5 4-.5 7-4 8-7l-1.5-1 1-1c1-1 2.004-2.5 3.5-5.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.343 14.621L3.515 17.45l3.535 3.535L20.485 7.55 16.95 4.015l-2.122 2.121 1.415 1.414-1.415 1.414-1.414-1.414-2.121 2.122 2.121 2.12L12 13.208l-2.121-2.121-2.122 2.121 1.415 1.414-1.415 1.415-1.414-1.415zM17.657 1.893l4.95 4.95a1 1 0 0 1 0 1.414l-14.85 14.85a1 1 0 0 1-1.414 0l-4.95-4.95a1 1 0 0 1 0-1.414l14.85-14.85a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 13.207l2.121 2.121 1.414-1.414-2.12-2.121 2.12-2.121 2.829 2.828 1.414-1.414L9.88 8.257 12 6.136l2.121 2.121 1.415-1.414-2.122-2.121 2.829-2.829a1 1 0 0 1 1.414 0l4.95 4.95a1 1 0 0 1 0 1.414l-14.85 14.85a1 1 0 0 1-1.414 0l-4.95-4.95a1 1 0 0 1 0-1.414l3.536-3.536z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 14.121l-2.317 2.317a4 4 0 1 1-2.121-2.121L9.88 12 4.21 6.333a2 2 0 0 1 0-2.829l.708-.707L12 9.88l7.081-7.082.708.707a2 2 0 0 1 0 2.829L14.12 12l2.317 2.317a4 4 0 1 1-2.121 2.121L12 14.12zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13.414l-2.554 2.554a4 4 0 1 1-1.414-1.414L10.586 12 4.565 5.98a2 2 0 0 1 0-2.83L12 10.587l7.435-7.435a2 2 0 0 1 0 2.828L13.415 12l2.553 2.554a4 4 0 1 1-1.414 1.414L12 13.414zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-cut-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.879 12L7.562 9.683a4 4 0 1 1 2.121-2.121L12 9.88l6.374-6.375a2 2 0 0 1 2.829 0l.707.707L9.683 16.438a4 4 0 1 1-2.121-2.121L9.88 12zM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9.535-6.587l6.375 6.376-.707.707a2 2 0 0 1-2.829 0l-4.96-4.961 2.12-2.122zM16 11h2v2h-2v-2zm4 0h2v2h-2v-2zM6 11h2v2H6v-2zm-4 0h2v2H2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.683 7.562L12 9.88l6.374-6.375a2 2 0 0 1 2.829 0l.707.707L9.683 16.438a4 4 0 1 1-2.121-2.121L9.88 12 7.562 9.683a4 4 0 1 1 2.121-2.121zM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9.535-6.587l6.375 6.376-.707.707a2 2 0 0 1-2.829 0l-4.96-4.961 2.12-2.122z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.446 8.032L12 10.586l6.728-6.728a2 2 0 0 1 2.828 0l-12.11 12.11a4 4 0 1 1-1.414-1.414L10.586 12 8.032 9.446a4 4 0 1 1 1.414-1.414zm5.38 5.38l6.73 6.73a2 2 0 0 1-2.828 0l-5.317-5.316 1.415-1.415zm-7.412 3.174a2 2 0 1 0-2.828 2.828 2 2 0 0 0 2.828-2.828zm0-9.172a2 2 0 1 0-2.828-2.828 2 2 0 0 0 2.828 2.828z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-cut-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 6c0 .732-.197 1.419-.54 2.01L12 10.585l6.728-6.728a2 2 0 0 1 2.828 0l-12.11 12.11a4 4 0 1 1-1.414-1.414L10.586 12 8.032 9.446A4 4 0 1 1 10 6zM8 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm13.556 14.142a2 2 0 0 1-2.828 0l-5.317-5.316 1.415-1.415 6.73 6.731zM16 11h2v2h-2v-2zm4 0h2v2h-2v-2zM6 11h2v2H6v-2zm-4 0h2v2H2v-2zm4 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h2v2H3V3zm4 0h2v2H7V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm0 4h2v2h-2V7zM3 19h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3V7zm7.667 4l1.036-1.555A1 1 0 0 1 12.535 9h2.93a1 1 0 0 1 .832.445L17.333 11H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2.667zM14 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.993 14.407l-1.552 1.552a4 4 0 1 1-1.418-1.41l1.555-1.556-3.124-3.125a1.5 1.5 0 0 1 0-2.121l.354-.354 4.185 4.185 4.189-4.189.353.354a1.5 1.5 0 0 1 0 2.12l-3.128 3.13 1.561 1.56a4 4 0 1 1-1.414 1.414l-1.561-1.56zM19 13V5H5v8H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v9h-2zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.993 14.407l-1.552 1.552a4 4 0 1 1-1.418-1.41l1.555-1.556-4.185-4.185 1.415-1.415 4.185 4.185 4.189-4.189 1.414 1.414-4.19 4.19 1.562 1.56a4 4 0 1 1-1.414 1.414l-1.561-1.56zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm2-7V5H5v8H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v9h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 2h5v5H2V2zm0 15h5v5H2v-5zM17 2h5v5h-5V2zm0 15h5v5h-5v-5zM8 4h8v2H8V4zM4 8h2v8H4V8zm14 0h2v8h-2V8zM8 18h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h2v2H3V3zm4 0h2v2H7V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm0 4h2v2h-2V7zM3 19h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3V7zm7.667 4l1.036-1.555A1 1 0 0 1 12.535 9h2.93a1 1 0 0 1 .832.445L17.333 11H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2.667zM9 19h10v-6h-2.737l-1.333-2h-1.86l-1.333 2H9v6zm5-1a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm14 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM5 22a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM9 4h6v2H9V4zm0 14h6v2H9v-2zM4 9h2v6H4V9zm14 0h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 16h2v6h-6v-2H8v2H2v-6h2V8H2V2h6v2h8V2h6v6h-2v8zm-2 0V8h-2V6H8v2H6v8h2v2h8v-2h2zM4 4v2h2V4H4zm0 14v2h2v-2H4zM18 4v2h2V4h-2zm0 14v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.83 20A3.001 3.001 0 1 1 4 16.17V7.83A3.001 3.001 0 1 1 7.83 4h8.34A3.001 3.001 0 1 1 20 7.83v8.34A3.001 3.001 0 1 1 16.17 20H7.83zm0-2h8.34A3.008 3.008 0 0 1 18 16.17V7.83A3.008 3.008 0 0 1 16.17 6H7.83A3.008 3.008 0 0 1 6 7.83v8.34A3.008 3.008 0 0 1 7.83 18zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm14 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "slice-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15.69 12.918l1.769 1.768c-6.01 6.01-10.96 6.01-15.203 4.596L17.812 3.726l3.536 3.535-5.657 5.657zm-2.828 0l5.657-5.657-.707-.707L6.314 18.052c2.732.107 5.358-.907 8.267-3.416l-1.719-1.718z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sip-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.96 6.504l2.829-2.828a1 1 0 0 1 1.414 0l2.121 2.121a1 1 0 0 1 0 1.414l-2.828 2.829 1.767 1.768-1.414 1.414-7.07-7.071 1.413-1.414 1.768 1.767zM10.778 8.98l4.243 4.243L7.243 21H3v-4.243l7.778-7.778z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "slice-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.768 12.232l2.121 2.122c-4.596 4.596-10.253 6.01-13.788 5.303L17.657 4.1l2.121 2.12-6.01 6.011z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sip-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.457 18.957l8.564-8.564-1.414-1.414-8.564 8.564 1.414 1.414zm5.735-11.392l-1.414-1.414 1.414-1.414 1.768 1.767 2.829-2.828a1 1 0 0 1 1.414 0l2.121 2.121a1 1 0 0 1 0 1.414l-2.828 2.829 1.767 1.768-1.414 1.414-1.414-1.414L7.243 21H3v-4.243l9.192-9.192z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-alt-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 14V3H3a1 1 0 0 0-1 1v10h5zm8 0V3H9v11h6zm7 0V4a1 1 0 0 0-1-1h-4v11h5zm-1 7a1 1 0 0 0 1-1v-4H2v4a1 1 0 0 0 1 1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "t-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V5H5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9 7v7h-2v-7H7V8h10v2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "t-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 8H7v2h4v7h2v-7h4V8zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-alt-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 13H4v3h16v-3zM8 5H4v9h4V5zm6 0h-4v9h4V5zm6 0h-4v9h4V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 21H9V10h6v11zm2 0V10h5v10a1 1 0 0 1-1 1h-4zM7 21H3a1 1 0 0 1-1-1V10h5v11zM22 8H2V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tools-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.33 3.271a3.5 3.5 0 0 1 4.472 4.474L20.647 18.59l-2.122 2.121L7.68 9.867a3.5 3.5 0 0 1-4.472-4.474L5.444 7.63a1.5 1.5 0 1 0 2.121-2.121L5.329 3.27zm10.367 1.884l3.182-1.768 1.414 1.414-1.768 3.182-1.768.354-2.12 2.121-1.415-1.414 2.121-2.121.354-1.768zm-7.071 7.778l2.121 2.122-4.95 4.95A1.5 1.5 0 0 1 3.58 17.99l.097-.107 4.95-4.95z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 8h16V5H4v3zm10 11v-9h-4v9h4zm2 0h4v-9h-4v9zm-8 0v-9H4v9h4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tools-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.33 3.271a3.5 3.5 0 0 1 4.254 4.963l10.709 10.71-1.414 1.414-10.71-10.71a3.502 3.502 0 0 1-4.962-4.255L5.444 7.63a1.5 1.5 0 1 0 2.121-2.121L5.329 3.27zm10.367 1.884l3.182-1.768 1.414 1.414-1.768 3.182-1.768.354-2.12 2.121-1.415-1.414 2.121-2.121.354-1.768zm-6.718 8.132l1.414 1.414-5.303 5.303a1 1 0 0 1-1.492-1.327l.078-.087 5.303-5.303z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "communication",
            iconsvg: [
                {
                    name: "chat-1-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 3h4a8 8 0 1 1 0 16v3.5c-5-2-12-5-12-11.5a8 8 0 0 1 8-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-1-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 3h4a8 8 0 1 1 0 16v3.5c-5-2-12-5-12-11.5a8 8 0 0 1 8-8zm2 14h2a6 6 0 1 0 0-12h-4a6 6 0 0 0-6 6c0 3.61 2.462 5.966 8 8.48V17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.45 19L12 22.5 9.55 19H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6.55z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.45 19L12 22.5 9.55 19H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6.55zm-1.041-2H20V5H4v12h6.591L12 19.012 13.409 17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.291 20.824L2 22l1.176-5.291A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.956 9.956 0 0 1-4.709-1.176z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.291 20.824L2 22l1.176-5.291A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.956 9.956 0 0 1-4.709-1.176zm.29-2.113l.653.35A7.955 7.955 0 0 0 12 20a8 8 0 1 0-8-8c0 1.334.325 2.618.94 3.766l.349.653-.655 2.947 2.947-.655z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.763 17H20V5H4v13.385L5.763 17zm.692 2L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-check-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm4.838-6.879L8.818 9.646l-1.414 1.415 3.889 3.889 5.657-5.657-1.414-1.414-4.243 4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-check-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm-.692-2H20V5H4v13.385L5.763 17zm5.53-4.879l4.243-4.242 1.414 1.414-5.657 5.657-3.89-3.89 1.415-1.414 2.475 2.475z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-delete-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm6.96-8l2.474-2.475-1.414-1.414L12 9.586 9.525 7.11 8.111 8.525 10.586 11 8.11 13.475l1.414 1.414L12 12.414l2.475 2.475 1.414-1.414L13.414 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-delete-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM4 18.385L5.763 17H20V5H4v13.385zM13.414 11l2.475 2.475-1.414 1.414L12 12.414 9.525 14.89l-1.414-1.414L10.586 11 8.11 8.525l1.414-1.414L12 9.586l2.475-2.475 1.414 1.414L13.414 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-download-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM13 11V7h-2v4H8l4 4 4-4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-download-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM4 18.385L5.763 17H20V5H4v13.385zM13 11h3l-4 4-4-4h3V7h2v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-follow-up-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H6.455L2 22.5V4c0-.552.448-1 1-1h18zm-4 4h-2v8h2V7zm-6 1H9v1.999L7 10v2l2-.001V14h2v-2.001L13 12v-2l-2-.001V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-follow-up-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H6.455L2 22.5V4c0-.552.448-1 1-1h18zm-1 2H4v13.385L5.763 17H20V5zm-3 2v8h-2V7h2zm-6 1v1.999L13 10v2l-2-.001V14H9v-2.001L7 12v-2l2-.001V8h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-forward-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM12 10H8v2h4v3l4-4-4-4v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-forward-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM4 18.385L5.763 17H20V5H4v13.385zM12 10V7l4 4-4 4v-3H8v-2h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-heart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm5.563-4.3l3.359-3.359a2.25 2.25 0 0 0-3.182-3.182l-.177.177-.177-.177a2.25 2.25 0 0 0-3.182 3.182l3.359 3.359z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-heart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM4 18.385L5.763 17H20V5H4v13.385zm8.018-3.685L8.659 11.34a2.25 2.25 0 0 1 3.182-3.182l.177.177.177-.177a2.25 2.25 0 0 1 3.182 3.182l-3.36 3.359z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-history-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.702 0-3.305-.425-4.708-1.175L2 22l1.176-5.29C2.426 15.306 2 13.703 2 12 2 6.477 6.477 2 12 2zm1 5h-2v7h6v-2h-4V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-history-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.702 0-3.305-.425-4.708-1.175L2 22l1.176-5.29C2.426 15.306 2 13.703 2 12 2 6.477 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8 0 1.335.326 2.618.94 3.766l.35.654-.656 2.946 2.948-.654.653.349c1.148.614 2.43.939 3.765.939 4.418 0 8-3.582 8-8s-3.582-8-8-8zm1 3v5h4v2h-6V7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-new-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM11 10H8v2h3v3h2v-3h3v-2h-3V7h-2v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-new-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 3v2H4v13.385L5.763 17H20v-7h2v8a1 1 0 0 1-1 1H6.455L2 22.5V4a1 1 0 0 1 1-1h11zm5 0V0h2v3h3v2h-3v3h-2V5h-3V3h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.808 1.393l19.799 19.8-1.415 1.414-3.608-3.608L6.455 19 2 22.5V4c0-.17.042-.329.116-.469l-.723-.723 1.415-1.415zM21 3a1 1 0 0 1 1 1v13.785L7.214 3H21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.808 1.393l19.799 19.8-1.415 1.414-3.608-3.608L6.455 19 2 22.5V4c0-.17.042-.329.116-.469l-.723-.723 1.415-1.415zm1.191 4.02L4 18.385 5.763 17h9.821L4 5.412zM21 3a1 1 0 0 1 1 1v13.785l-2-2V5L9.213 4.999 7.214 3H21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-poll-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H6.455L2 22.5V4c0-.552.448-1 1-1h18zm-8 4h-2v8h2V7zm4 2h-2v6h2V9zm-8 2H7v4h2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-poll-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H6.455L2 22.5V4c0-.552.448-1 1-1h18zm-1 2H4v13.385L5.763 17H20V5zm-7 2v8h-2V7h2zm4 2v6h-2V9h2zm-8 2v4H7v-4h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-private-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.702 0-3.305-.425-4.708-1.175L2 22l1.176-5.29C2.426 15.306 2 13.703 2 12 2 6.477 6.477 2 12 2zm0 5c-1.598 0-3 1.34-3 3v1H8v5h8v-5h-1v-1c0-1.657-1.343-3-3-3zm2 6v1h-4v-1h4zm-2-4c.476 0 1 .49 1 1v1h-2v-1c0-.51.487-1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-quote-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H6.455L2 22.5V4c0-.552.448-1 1-1h18zM10.962 8.1l-.447-.688C8.728 8.187 7.5 9.755 7.5 11.505c0 .995.277 1.609.792 2.156.324.344.837.589 1.374.589.966 0 1.75-.784 1.75-1.75 0-.92-.711-1.661-1.614-1.745-.16-.015-.324-.012-.479.01v-.092c.006-.422.092-1.633 1.454-2.466l.185-.107-.447-.688zm4.553-.688c-1.787.775-3.015 2.343-3.015 4.093 0 .995.277 1.609.792 2.156.324.344.837.589 1.374.589.966 0 1.75-.784 1.75-1.75 0-.92-.711-1.661-1.614-1.745-.16-.015-.324-.012-.479.01 0-.313-.029-1.762 1.639-2.665z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-private-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.702 0-3.305-.425-4.708-1.175L2 22l1.176-5.29C2.426 15.306 2 13.703 2 12 2 6.477 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8 0 1.335.326 2.618.94 3.766l.35.654-.656 2.946 2.948-.654.653.349c1.148.614 2.43.939 3.765.939 4.418 0 8-3.582 8-8s-3.582-8-8-8zm0 3c1.657 0 3 1.343 3 3v1h1v5H8v-5h1v-1c0-1.657 1.343-3 3-3zm2 6h-4v1h4v-1zm-2-4c-.552 0-1 .45-1 1v1h2v-1c0-.552-.448-1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-quote-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H6.455L2 22.5V4c0-.552.448-1 1-1h18zm-1 2H4v13.385L5.763 17H20V5zm-9.485 2.412l.447.688c-1.668.903-1.639 2.352-1.639 2.664.155-.02.318-.024.48-.009.902.084 1.613.825 1.613 1.745 0 .966-.784 1.75-1.75 1.75-.537 0-1.05-.245-1.374-.59-.515-.546-.792-1.16-.792-2.155 0-1.75 1.228-3.318 3.015-4.093zm5 0l.447.688c-1.668.903-1.639 2.352-1.639 2.664.155-.02.318-.024.48-.009.902.084 1.613.825 1.613 1.745 0 .966-.784 1.75-1.75 1.75-.537 0-1.05-.245-1.374-.59-.515-.546-.792-1.16-.792-2.155 0-1.75 1.228-3.318 3.015-4.093z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-settings-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm1.69-6.929l-.975.563 1 1.732.976-.563c.501.51 1.14.887 1.854 1.071V16h2v-1.126a3.996 3.996 0 0 0 1.854-1.071l.976.563 1-1.732-.975-.563a4.004 4.004 0 0 0 0-2.142l.975-.563-1-1.732-.976.563A3.996 3.996 0 0 0 13 7.126V6h-2v1.126a3.996 3.996 0 0 0-1.854 1.071l-.976-.563-1 1.732.975.563a4.004 4.004 0 0 0 0 2.142zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-settings-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 12h-2V5H4v13.385L5.763 17H12v2H6.455L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v8zm-7.855 7.071a4.004 4.004 0 0 1 0-2.142l-.975-.563 1-1.732.976.563A3.996 3.996 0 0 1 17 14.126V13h2v1.126c.715.184 1.353.56 1.854 1.071l.976-.563 1 1.732-.975.563a4.004 4.004 0 0 1 0 2.142l.975.563-1 1.732-.976-.563c-.501.51-1.14.887-1.854 1.071V23h-2v-1.126a3.996 3.996 0 0 1-1.854-1.071l-.976.563-1-1.732.975-.563zM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-smile-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.291 20.824L2 22l1.176-5.291A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.956 9.956 0 0 1-4.709-1.176zM7 12a5 5 0 0 0 10 0h-2a3 3 0 0 1-6 0H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-smile-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.291 20.824L2 22l1.176-5.291A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.956 9.956 0 0 1-4.709-1.176zm.29-2.113l.653.35A7.955 7.955 0 0 0 12 20a8 8 0 1 0-8-8c0 1.334.325 2.618.94 3.766l.349.653-.655 2.947 2.947-.655zM7 12h2a3 3 0 0 0 6 0h2a5 5 0 0 1-10 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-smile-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 19.071A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10H2l2.929-2.929zM8 13a4 4 0 1 0 8 0H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-smile-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10H2l2.929-2.929A9.969 9.969 0 0 1 2 12zm4.828 8H12a8 8 0 1 0-8-8c0 2.152.851 4.165 2.343 5.657l1.414 1.414-.929.929zM8 13h8a4 4 0 1 1-8 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-smile-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM7 10a5 5 0 0 0 10 0h-2a3 3 0 0 1-6 0H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-smile-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm-.692-2H20V5H4v13.385L5.763 17zM7 10h2a3 3 0 0 0 6 0h2a5 5 0 0 1-10 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-upload-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM13 11h3l-4-4-4 4h3v4h2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-upload-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM4 18.385L5.763 17H20V5H4v13.385zM13 11v4h-2v-4H8l4-4 4 4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-voice-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 19.071A9.969 9.969 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10H2l2.929-2.929zM11 6v12h2V6h-2zM7 9v6h2V9H7zm8 0v6h2V9h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "chat-voice-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10H2l2.929-2.929A9.969 9.969 0 0 1 2 12zm4.828 8H12a8 8 0 1 0-8-8c0 2.152.851 4.165 2.343 5.657l1.414 1.414-.929.929zM11 6h2v12h-2V6zM7 9h2v6H7V9zm8 0h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "discuss-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.8 19L14 22.5 11.2 19H6a1 1 0 0 1-1-1V7.103a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-5.2zM2 2h17v2H3v11H1V3a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "discuss-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 22.5L11.2 19H6a1 1 0 0 1-1-1V7.103a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-5.2L14 22.5zm1.839-5.5H21V8.103H7V17H12.161L14 19.298 15.839 17zM2 2h17v2H3v11H1V3a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "feedback-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM11 13v2h2v-2h-2zm0-6v5h2V7h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "feedback-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM4 18.385L5.763 17H20V5H4v13.385zM11 13h2v2h-2v-2zm0-6h2v5h-2V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "message-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM7 10v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "message-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm-.692-2H20V5H4v13.385L5.763 17zM11 10h2v2h-2v-2zm-4 0h2v2H7v-2zm8 0h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "message-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 8.994A5.99 5.99 0 0 1 8 3h8c3.313 0 6 2.695 6 5.994V21H8c-3.313 0-6-2.695-6-5.994V8.994zM14 11v2h2v-2h-2zm-6 0v2h2v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "message-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 8.994A5.99 5.99 0 0 1 8 3h8c3.313 0 6 2.695 6 5.994V21H8c-3.313 0-6-2.695-6-5.994V8.994zM20 19V8.994A4.004 4.004 0 0 0 16 5H8a3.99 3.99 0 0 0-4 3.994v6.012A4.004 4.004 0 0 0 8 19h12zm-6-8h2v2h-2v-2zm-6 0h2v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "message-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM8 10v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "message-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zm-.692-2H20V5H4v13.385L5.763 17zM8 10h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "question-answer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 18h10.237L20 19.385V9h1a1 1 0 0 1 1 1v13.5L17.545 20H9a1 1 0 0 1-1-1v-1zm-2.545-2L1 19.5V4a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v12H5.455z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "question-answer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.455 15L1 18.5V3a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v12H5.455zm-.692-2H16V4H3v10.385L4.763 13zM8 17h10.237L20 18.385V8h1a1 1 0 0 1 1 1v13.5L17.545 19H9a1 1 0 0 1-1-1v-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "questionnaire-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM11 14v2h2v-2h-2zM8.567 8.813l1.962.393A1.5 1.5 0 1 1 12 11h-1v2h1a3.5 3.5 0 1 0-3.433-4.187z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "questionnaire-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M5.763 17H20V5H4v13.385L5.763 17zm.692 2L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM11 14h2v2h-2v-2zM8.567 8.813A3.501 3.501 0 1 1 12 13h-1v-2h1a1.5 1.5 0 1 0-1.471-1.794l-1.962-.393z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-chat-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.455 19L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455zM14 10.25V8H7v6h7v-2.25L17 14V8l-3 2.25z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-chat-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 10.25L17 8v6l-3-2.25V14H7V8h7v2.25zM5.763 17H20V5H4v13.385L5.763 17zm.692 2L2 22.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.455z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "design",
            iconsvg: [
                {
                    name: "anticlockwise-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 4h2a5 5 0 0 1 5 5v4h-2V9a3 3 0 0 0-3-3h-2v3L9 5l5-4v3zm1 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anticlockwise-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13.414 6l1.829 1.828-1.415 1.415L9.586 5 13.828.757l1.415 1.415L13.414 4H16a5 5 0 0 1 5 5v4h-2V9a3 3 0 0 0-3-3h-2.586zM15 11v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1zm-2 1H5v8h8v-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anticlockwise-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 10h3l-4 5-4-5h3V8a5 5 0 0 1 5-5h4v2H9a3 3 0 0 0-3 3v2zm5-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anticlockwise-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H11a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zm1 2v8h8v-8h-8zm-6-.414l1.828-1.829 1.415 1.415L5 14.414.757 10.172l1.415-1.415L4 10.586V8a5 5 0 0 1 5-5h4v2H9a3 3 0 0 0-3 3v2.586z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 6h12v12H6V6zm0-4h2v3H6V2zm0 17h2v3H6v-3zM2 6h3v2H2V6zm0 10h3v2H2v-2zM19 6h3v2h-3V6zm0 10h3v2h-3v-2zM16 2h2v3h-2V2zm0 17h2v3h-2v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 8v8h8V8H8zM6 6h12v12H6V6zm0-4h2v3H6V2zm0 17h2v3H6v-3zM2 6h3v2H2V6zm0 10h3v2H2v-2zM19 6h3v2h-3V6zm0 10h3v2h-3v-2zM16 2h2v3h-2V2zm0 17h2v3h-2v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.586 17H3v-2h18v2h-5.586l3.243 3.243-1.414 1.414L13 17.414V20h-2v-2.586l-4.243 4.243-1.414-1.414L8.586 17zM5 3h14a1 1 0 0 1 1 1v10H4V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "artboard-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.586 17H3v-2h18v2h-5.586l3.243 3.243-1.414 1.414L13 17.414V20h-2v-2.586l-4.243 4.243-1.414-1.414L8.586 17zM5 3h14a1 1 0 0 1 1 1v10H4V4a1 1 0 0 1 1-1zm1 2v7h12V5H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ball-pen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.849 11.808l-.707-.707-9.9 9.9H3v-4.243L14.313 5.444l5.657 5.657a1 1 0 0 1 0 1.414l-7.07 7.071-1.415-1.414 6.364-6.364zm.707-9.192l2.829 2.828a1 1 0 0 1 0 1.414L19.97 8.273 15.728 4.03l1.414-1.414a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ball-pen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.849 11.808l-.707-.707-9.9 9.9H3v-4.243L14.313 5.444l5.657 5.657a1 1 0 0 1 0 1.414l-7.07 7.071-1.415-1.414 6.364-6.364zm-2.121-2.121l-1.415-1.414L5 17.586v1.415h1.414l9.314-9.314zm2.828-7.071l2.829 2.828a1 1 0 0 1 0 1.414L19.97 8.273 15.728 4.03l1.414-1.414a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "blur-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.432 6.846L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414-3.038-3.04A9 9 0 0 1 5.432 6.848zM8.243 4.03L12 .272l6.364 6.364a9.002 9.002 0 0 1 2.05 9.564L8.244 4.03z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "blur-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.154 19.568A9 9 0 0 1 5.432 6.846L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414-3.038-3.04zM6.847 8.262a7 7 0 0 0 9.891 9.89l-9.89-9.89zM20.414 16.2l-1.599-1.599a6.995 6.995 0 0 0-1.865-6.55L12 3.1 9.657 5.443 8.243 4.03 12 .272l6.364 6.364a9.002 9.002 0 0 1 2.05 9.564z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.536 15.95l2.12-2.122-3.181-3.182 3.535-3.535-2.12-2.121-3.536 3.535-3.182-3.182L8.05 7.464l8.486 8.486zM13.354 5.697l2.828-2.829a1 1 0 0 1 1.414 0l3.536 3.536a1 1 0 0 1 0 1.414l-2.829 2.828 2.475 2.475a1 1 0 0 1 0 1.415L13 22.314a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l7.778-7.778a1 1 0 0 1 1.415 0l2.475 2.475z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.536 15.95l2.12-2.122-3.181-3.182 3.535-3.535-2.12-2.121-3.536 3.535-3.182-3.182L8.05 7.464l8.486 8.486zm-1.415 1.414L6.636 8.879l-2.828 2.828 8.485 8.485 2.828-2.828zM13.354 5.697l2.828-2.829a1 1 0 0 1 1.414 0l3.536 3.536a1 1 0 0 1 0 1.414l-2.829 2.828 2.475 2.475a1 1 0 0 1 0 1.415L13 22.314a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l7.778-7.778a1 1 0 0 1 1.415 0l2.475 2.475z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 11V8h-6V4h-4v4H4v3h16zm1 2v8a1 1 0 0 1-1 1H10v-6H8v6H4a1 1 0 0 1-1-1v-8H2V7a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3h5a1 1 0 0 1 1 1v6h-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 20v-5h2v5h9v-7H5v7h3zm-4-9h16V8h-6V4h-4v4H4v3zM3 21v-8H2V7a1 1 0 0 1 1-1h5V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3h5a1 1 0 0 1 1 1v6h-1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 16H4v2h16v-2zM3 14V4a1 1 0 0 1 1-1h3v8.273h2V3h11a1 1 0 0 1 1 1v10h1v5a1 1 0 0 1-1 1h-8v3h-2v-3H3a1 1 0 0 1-1-1v-5h1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 5v6.273H7V5H5v9h14V5H9zm11 11H4v2h16v-2zM3 14V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10h1v5a1 1 0 0 1-1 1h-8v3h-2v-3H3a1 1 0 0 1-1-1v-5h1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.289 6.216l4.939-3.841a1 1 0 0 1 1.32.082l2.995 2.994a1 1 0 0 1 .082 1.321l-3.84 4.938a7.505 7.505 0 0 1-7.283 9.292C8 21.002 3.5 19.5 1 18c3.98-3 3.047-4.81 3.5-6.5 1.058-3.95 4.842-6.257 8.789-5.284zm3.413 1.879c.065.063.13.128.193.194l1.135 1.134 2.475-3.182-1.746-1.746-3.182 2.475 1.125 1.125z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brush-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.456 9.678l-.142-.142a5.475 5.475 0 0 0-2.39-1.349c-2.907-.778-5.699.869-6.492 3.83-.043.16-.066.34-.104.791-.154 1.87-.594 3.265-1.8 4.68 2.26.888 4.938 1.514 6.974 1.514a5.505 5.505 0 0 0 5.31-4.078 5.497 5.497 0 0 0-1.356-5.246zM13.29 6.216l4.939-3.841a1 1 0 0 1 1.32.082l2.995 2.994a1 1 0 0 1 .082 1.321l-3.84 4.938a7.505 7.505 0 0 1-7.283 9.292C8 21.002 3.5 19.5 1 18c3.98-3 3.047-4.81 3.5-6.5 1.058-3.95 4.842-6.257 8.789-5.284zm3.413 1.879c.065.063.13.128.193.194l1.135 1.134 2.475-3.182-1.746-1.746-3.182 2.475 1.125 1.125z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 4V1l5 4-5 4V6H8a3 3 0 0 0-3 3v4H3V9a5 5 0 0 1 5-5h2zm-1 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10.586 4L8.757 2.172 10.172.757 14.414 5l-4.242 4.243-1.415-1.415L10.586 6H8a3 3 0 0 0-3 3v4H3V9a5 5 0 0 1 5-5h2.586zM9 11a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V11zm2 1v8h8v-8h-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 10h3l-4 5-4-5h3V8a3 3 0 0 0-3-3h-4V3h4a5 5 0 0 1 5 5v2zm-7-1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clockwise-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 10.586l1.828-1.829 1.415 1.415L19 14.414l-4.243-4.242 1.415-1.415L18 10.586V8a3 3 0 0 0-3-3h-4V3h4a5 5 0 0 1 5 5v2.586zM13 9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h10zm-1 2H4v8h8v-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "collage-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11.189 13.157L12.57 21 4 21c-.552 0-1-.448-1-1v-5.398l8.189-1.445zM20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1h-5.398L11.428 3H20zM9.397 3l1.444 8.188L3 12.57 3 4c0-.552.448-1 1-1h5.397z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "collage-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zm-8.811 10.158L5 14.25V19h7.218l-1.03-5.842zM19 5h-7.219l2.468 14H19V5zM9.75 5H5v7.218l5.842-1.03L9.75 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.33 13.5A6.988 6.988 0 0 0 19 8h2a8.987 8.987 0 0 1-3.662 7.246l2.528 4.378a2 2 0 0 1-.732 2.732l-3.527-6.108A8.97 8.97 0 0 1 12 17a8.97 8.97 0 0 1-3.607-.752l-3.527 6.108a2 2 0 0 1-.732-2.732l5.063-8.77A4.002 4.002 0 0 1 11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728L16.33 13.5zM14.6 14.502l-1.528-2.647a4.004 4.004 0 0 1-2.142 0l-1.528 2.647c.804.321 1.68.498 2.599.498.918 0 1.795-.177 2.599-.498zM12 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.33 13.5A6.988 6.988 0 0 0 19 8h2a8.987 8.987 0 0 1-3.662 7.246l2.528 4.378a2 2 0 0 1-.732 2.732l-3.527-6.108A8.97 8.97 0 0 1 12 17a8.97 8.97 0 0 1-3.607-.752l-3.527 6.108a2 2 0 0 1-.732-2.732l5.063-8.77A4.002 4.002 0 0 1 11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728L16.33 13.5zM14.6 14.502l-1.528-2.647a4.004 4.004 0 0 1-2.142 0l-1.528 2.647c.804.321 1.68.498 2.599.498.918 0 1.795-.177 2.599-.498zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728l6.063 10.502-1.732 1-6.063-10.501a4.004 4.004 0 0 1-2.142 0L4.866 22.356l-1.732-1 6.063-10.502A4.002 4.002 0 0 1 11 4.126zM12 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compasses-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 4.126V2h2v2.126a4.002 4.002 0 0 1 1.803 6.728l6.063 10.502-1.732 1-6.063-10.501a4.004 4.004 0 0 1-2.142 0L4.866 22.356l-1.732-1 6.063-10.502A4.002 4.002 0 0 1 11 4.126zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-6.671-5.575A8 8 0 1 0 16.425 5.328a8.997 8.997 0 0 1-2.304 8.793 8.997 8.997 0 0 1-8.792 2.304z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-5-4.68a8.965 8.965 0 0 0 5.707-2.613A8.965 8.965 0 0 0 15.32 7 6 6 0 1 1 7 15.32z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0zM12 3.101L7.05 8.05A6.978 6.978 0 0 0 5 13h14a6.978 6.978 0 0 0-2.05-4.95L12 3.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272zM7 13h10a5 5 0 0 1-10 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0zM7.05 8.05A7 7 0 0 0 12.004 20L12 3.1 7.05 8.05z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-drop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272zM12 18V8a5 5 0 0 1 0 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2V4a8 8 0 1 0 0 16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contrast-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-2V6a6 6 0 1 1 0 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.586 5l2.556-2.556 1.414 1.414L19 6.414V17h3v2h-3v3h-2V7H9V5h8.586zM15 17v2H6a1 1 0 0 1-1-1V7H2V5h3V2h2v15h8zM9 9h6v6H9V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.414 17H15v2H6a1 1 0 0 1-1-1V7H2V5h3V2h2v13.586L15.586 7H9V5h8.586l2.556-2.556 1.414 1.414L19 6.414V17h3v2h-3v3h-2V8.414L8.414 17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 17h3v2h-3v3h-2v-3H6a1 1 0 0 1-1-1V7H2V5h3V2h2v3h11a1 1 0 0 1 1 1v11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "crop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 17v2H6a1 1 0 0 1-1-1V7H2V5h3V2h2v15h8zm2 5V7H9V5h9a1 1 0 0 1 1 1v11h3v2h-3v3h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-drop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 6h2v2h5a1 1 0 0 1 1 1v7.5L16 13l.036 8.062 2.223-2.15L20.041 22H9a1 1 0 0 1-1-1v-5H6v-2h2V9a1 1 0 0 1 1-1h5V6zm8 11.338V21a1 1 0 0 1-.048.307l-1.96-3.394L22 17.338zM4 14v2H2v-2h2zm0-4v2H2v-2h2zm0-4v2H2V6h2zm0-4v2H2V2h2zm4 0v2H6V2h2zm4 0v2h-2V2h2zm4 0v2h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-drop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M16 13l6.964 4.062-2.973.85 2.125 3.681-1.732 1-2.125-3.68-2.223 2.15L16 13zm-2-7h2v2h5a1 1 0 0 1 1 1v4h-2v-3H10v10h4v2H9a1 1 0 0 1-1-1v-5H6v-2h2V9a1 1 0 0 1 1-1h5V6zM4 14v2H2v-2h2zm0-4v2H2v-2h2zm0-4v2H2V6h2zm0-4v2H2V2h2zm4 0v2H6V2h2zm4 0v2h-2V2h2zm4 0v2h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 11V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8l4-4 4 4h-3v5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22l-4-4h8l-4 4zm0-20l4 4H8l4-4zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM2 12l4-4v8l-4-4zm20 0l-4 4V8l4 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 11V5.828L9.172 7.657 7.757 6.243 12 2l4.243 4.243-1.415 1.414L13 5.828V11h5.172l-1.829-1.828 1.414-1.415L22 12l-4.243 4.243-1.414-1.415L18.172 13H13v5.172l1.828-1.829 1.415 1.414L12 22l-4.243-4.243 1.415-1.414L11 18.172V13H5.828l1.829 1.828-1.414 1.415L2 12l4.243-4.243 1.414 1.415L5.828 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drag-move-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2l4.243 4.243-1.415 1.414L12 4.828 9.172 7.657 7.757 6.243 12 2zM2 12l4.243-4.243 1.414 1.415L4.828 12l2.829 2.828-1.414 1.415L2 12zm20 0l-4.243 4.243-1.414-1.415L19.172 12l-2.829-2.828 1.414-1.415L22 12zm-10 2a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8l-4.243-4.243 1.415-1.414L12 19.172l2.828-2.829 1.415 1.414L12 22z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "drop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.243 19H21v2H3v-4.243l9.9-9.9 4.242 4.244L9.242 19zm5.07-13.556l2.122-2.122a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414l-2.122 2.121-4.242-4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 19h1.414l9.314-9.314-1.414-1.414L5 17.586V19zm16 2H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L9.243 19H21v2zM15.728 6.858l1.414 1.414 1.414-1.414-1.414-1.414-1.414 1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.757 3l-7.466 7.466.008 4.247 4.238-.007L21 7.243V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12.757zm3.728-.9L21.9 3.516l-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.757 3l-2 2H5v14h14V9.243l2-2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12.757zm3.728-.9L21.9 3.516l-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.626 3.132L9.29 10.466l.008 4.247 4.238-.007 7.331-7.332A9.957 9.957 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2c1.669 0 3.242.409 4.626 1.132zm3.86-1.031l1.413 1.414-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.684 4.029a8 8 0 1 0 7.287 7.287 7.936 7.936 0 0 0-.603-2.44l1.5-1.502A9.933 9.933 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2a9.982 9.982 0 0 1 4.626 1.132l-1.501 1.5a7.941 7.941 0 0 0-2.44-.603zM20.485 2.1L21.9 3.515l-9.192 9.192-1.412.003-.002-1.417L20.485 2.1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.243 18H3v-4.243L14.435 2.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 18zM3 20h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "edit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.414 16L16.556 5.858l-1.414-1.414L5 14.586V16h1.414zm.829 2H3v-4.243L14.435 2.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 18zM3 20h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "eraser-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 19h7v2h-9l-3.998.002-6.487-6.487a1 1 0 0 1 0-1.414L12.12 2.494a1 1 0 0 1 1.415 0l7.778 7.778a1 1 0 0 1 0 1.414L14 19zm1.657-4.485l3.535-3.536-6.364-6.364-3.535 3.536 6.364 6.364z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "eraser-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.586 8.858l-4.95 4.95 5.194 5.194H10V19h1.172l3.778-3.778-6.364-6.364zM10 7.444l6.364 6.364 2.828-2.829-6.364-6.364L10 7.444zM14 19h7v2h-9l-3.998.002-6.487-6.487a1 1 0 0 1 0-1.414L12.12 2.494a1 1 0 0 1 1.415 0l7.778 7.778a1 1 0 0 1 0 1.414L14 19z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 18c4.427 0 8-3.573 8-8s-3.573-8-8-8a7.99 7.99 0 0 0-8 8c0 4.427 3.573 8 8 8zm0-2c-3.32 0-6-2.68-6-6s2.68-6 6-6 6 2.68 6 6-2.68 6-6 6zm0-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-4a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 1l.001 3.062A8.004 8.004 0 0 1 19.938 11H23v2l-3.062.001a8.004 8.004 0 0 1-6.937 6.937L13 23h-2v-3.062a8.004 8.004 0 0 1-6.938-6.937L1 13v-2h3.062A8.004 8.004 0 0 1 11 4.062V1h2zm-1 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13 1l.001 3.062A8.004 8.004 0 0 1 19.938 11H23v2l-3.062.001a8.004 8.004 0 0 1-6.937 6.937L13 23h-2v-3.062a8.004 8.004 0 0 1-6.938-6.937L1 13v-2h3.062A8.004 8.004 0 0 1 11 4.062V1h2zm-1 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "focus-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "grid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 10v4h-4v-4h4zm2 0h5v4h-5v-4zm-2 11h-4v-5h4v5zm2 0v-5h5v4a1 1 0 0 1-1 1h-4zM14 3v5h-4V3h4zm2 0h4a1 1 0 0 1 1 1v4h-5V3zm-8 7v4H3v-4h5zm0 11H4a1 1 0 0 1-1-1v-4h5v5zM8 3v5H3V4a1 1 0 0 1 1-1h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "grid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 10h-4v4h4v-4zm2 0v4h3v-4h-3zm-2 9v-3h-4v3h4zm2 0h3v-3h-3v3zM14 5h-4v3h4V5zm2 0v3h3V5h-3zm-8 5H5v4h3v-4zm0 9v-3H5v3h3zM8 5H5v3h3V5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hammer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 8V2h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3zm-2 14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8H2.5V6.074a1 1 0 0 1 .496-.863L8.5 2H15v20z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hammer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5v13a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V9H3.5a1 1 0 0 1-1-1V5.618a1 1 0 0 1 .553-.894L8.5 2H20zm-5 2H8.972L4.5 6.236V7H11v14h2V7h2V4zm4 0h-2v3h2V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ink-bottle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 9l4.371 1.749c.38.151.629.52.629.928V21c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1v-9.323c0-.409.249-.777.629-.928L8 9h8zm4 5H8v5h12v-5zM16 3c.552 0 1 .448 1 1v4H7V4c0-.552.448-1 1-1h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ink-bottle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 9l4.371 1.749c.38.151.629.52.629.928V21c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1v-9.323c0-.409.249-.777.629-.928L8 9h8zm-.385 2h-7.23L5 12.354V20h14v-1H8v-5h11v-1.646L15.615 11zM16 3c.552 0 1 .448 1 1v4H7V4c0-.552.448-1 1-1h8zm-1 2H9v1h6V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "input-method-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5.869 12h4.262l.82 2h2.216L13 7h-2L6.833 17H9.05l.82-2zm.82-2L12 9.8l1.311 3.2H10.69z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "input-method-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V5H5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5.869 12l-.82 2H6.833L11 7h2l4.167 10H14.95l-.82-2H9.87zm.82-2h2.622L12 9.8 10.689 13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 3v18H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7zm10 10v7a1 1 0 0 1-1 1h-7v-8h8zM20 3a1 1 0 0 1 1 1v7h-8V3h7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16zM11 5H5v14h6V5zm8 8h-6v6h6v-6zm0-8h-6v6h6V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 10v11H4a1 1 0 0 1-1-1V10h5zm13 0v10a1 1 0 0 1-1 1H10V10h11zm-1-7a1 1 0 0 1 1 1v4H3V4a1 1 0 0 1 1-1h16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M4 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4zm4-11H5v9h3v-9zm11 0h-9v9h9v-9zm0-5H5v3h14V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 13v8H4a1 1 0 0 1-1-1v-7h8zm2-10h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7V3zM3 4a1 1 0 0 1 1-1h7v8H3V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16zm-9 10H5v6h6v-6zm2 6h6V5h-6v14zM11 5H5v6h6V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 10v11H3a1 1 0 0 1-1-1V10h5zm15 0v10a1 1 0 0 1-1 1H9V10h13zm-1-7a1 1 0 0 1 1 1v4H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3zm4-11H4v9h3v-9zm13 0H9v9h11v-9zm0-5H4v3h16V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-6-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 10v11H3a1 1 0 0 1-1-1V10h13zm7 0v10a1 1 0 0 1-1 1h-4V10h5zm-1-7a1 1 0 0 1 1 1v4H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-6-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3zm12-11H4v9h11v-9zm5 0h-3v9h3v-9zm0-5H4v3h16V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-2 13H5v2h14v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-2 10v2H6v-2h12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 16v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4h20zM21 3a1 1 0 0 1 1 1v10H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-bottom-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM4 16v3h16v-3H4zm0-2h16V5H4v9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-column-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 5v14h7V5h-7zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-column-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 5H5v14h6V5zm2 0v14h6V5h-6zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 21V10h5v10a1 1 0 0 1-1 1h-4zm-2 0H4a1 1 0 0 1-1-1V10h11v11zm7-13H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-grid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 12.999V20a1 1 0 0 1-1 1h-8v-8.001h9zm-11 0V21H3a1 1 0 0 1-1-1v-7.001h9zM11 3v7.999H2V4a1 1 0 0 1 1-1h8zm10 0a1 1 0 0 1 1 1v6.999h-9V3h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-grid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM11 13H4v6h7v-6zm9 0h-7v6h7v-6zm-9-8H4v6h7V5zm9 0h-7v6h7V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM7 6H5v12h2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zM8 7v10H6V7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H9V3h12zM7 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4v18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-left-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM7 5H4v14h3V5zm13 0H9v14h11V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8h14V5H5v3zm9 11v-9H5v9h9zm2 0h3v-9h-3v9zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-masonry-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 9.999V20a1 1 0 0 1-1 1h-8V9.999h9zm-11 6V21H3a1 1 0 0 1-1-1v-4.001h9zM11 3v10.999H2V4a1 1 0 0 1 1-1h8zm10 0a1 1 0 0 1 1 1v3.999h-9V3h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-masonry-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v16zm-11-5H4v4h7v-4zm9-4h-7v8h7v-8zm-9-6H4v8h7V5zm9 0h-7v4h7V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-2 3h-2v12h2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-2 2v10h-2V7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4V3h4zm-6 18H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12v18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-right-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-6 2H4v14h11V5zm5 0h-3v14h3V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-row-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M19 12H5v7h14v-7zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-row-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M19 11V5H5v6h14zm0 2H5v6h14v-6zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-2 3H5v2h14V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 10v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10h20zm-1-7a1 1 0 0 1 1 1v4H2V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-2 2v2H6V7h12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "layout-top-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zM4 10v9h16v-9H4zm0-2h16V5H4v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "magic-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.224 15.508l-2.213 4.65a.6.6 0 0 1-.977.155l-3.542-3.739a.6.6 0 0 0-.357-.182l-5.107-.668a.6.6 0 0 1-.449-.881l2.462-4.524a.6.6 0 0 0 .062-.396L4.16 4.86a.6.6 0 0 1 .7-.7l5.063.943a.6.6 0 0 0 .396-.062l4.524-2.462a.6.6 0 0 1 .881.45l.668 5.106a.6.6 0 0 0 .182.357l3.739 3.542a.6.6 0 0 1-.155.977l-4.65 2.213a.6.6 0 0 0-.284.284zm.797 1.927l1.414-1.414 4.243 4.242-1.415 1.415-4.242-4.243z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "magic-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.199 9.945a2.6 2.6 0 0 1-.79-1.551l-.403-3.083-2.73 1.486a2.6 2.6 0 0 1-1.72.273L6.5 6.5l.57 3.056a2.6 2.6 0 0 1-.273 1.72l-1.486 2.73 3.083.403a2.6 2.6 0 0 1 1.55.79l2.138 2.257 1.336-2.807a2.6 2.6 0 0 1 1.23-1.231l2.808-1.336-2.257-2.137zm.025 5.563l-2.213 4.65a.6.6 0 0 1-.977.155l-3.542-3.739a.6.6 0 0 0-.357-.182l-5.107-.668a.6.6 0 0 1-.449-.881l2.462-4.524a.6.6 0 0 0 .062-.396L4.16 4.86a.6.6 0 0 1 .7-.7l5.063.943a.6.6 0 0 0 .396-.062l4.524-2.462a.6.6 0 0 1 .881.45l.668 5.106a.6.6 0 0 0 .182.357l3.739 3.542a.6.6 0 0 1-.155.977l-4.65 2.213a.6.6 0 0 0-.284.284zm.797 1.927l1.414-1.414 4.243 4.242-1.415 1.415-4.242-4.243z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mark-pen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.95 2.393l5.657 5.657a1 1 0 0 1 0 1.414l-7.779 7.779-2.12.707-1.415 1.414a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414l1.414-1.414.707-2.121 7.779-7.779a1 1 0 0 1 1.414 0zm.707 3.536l-6.364 6.364 1.414 1.414 6.364-6.364-1.414-1.414zM4.282 16.889l2.829 2.829-1.414 1.414-4.243-1.414 2.828-2.829z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mark-pen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.243 4.515l-6.738 6.737-.707 2.121-1.04 1.041 2.828 2.829 1.04-1.041 2.122-.707 6.737-6.738-4.242-4.242zm6.364 3.535a1 1 0 0 1 0 1.414l-7.779 7.779-2.12.707-1.415 1.414a1 1 0 0 1-1.414 0l-4.243-4.243a1 1 0 0 1 0-1.414l1.414-1.414.707-2.121 7.779-7.779a1 1 0 0 1 1.414 0l5.657 5.657zm-6.364-.707l1.414 1.414-4.95 4.95-1.414-1.414 4.95-4.95zM4.283 16.89l2.828 2.829-1.414 1.414-4.243-1.414 2.828-2.829z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "markup-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm5.051-3.796l-.862-3.447a1 1 0 0 0-.97-.757H8.781a1 1 0 0 0-.97.757l-.862 3.447A7.967 7.967 0 0 0 12 20a7.967 7.967 0 0 0 5.051-1.796zM10 12h4v-1.5l-1.038-3.635a1 1 0 0 0-1.924 0L10 10.5V12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "markup-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10 10.5l1.038-3.635a1 1 0 0 1 1.924 0L14 10.5V12h.72a1 1 0 0 1 .97.757l1.361 5.447a8 8 0 1 0-10.102 0l1.362-5.447A1 1 0 0 1 9.28 12H10v-1.5zm2 9.5a7.952 7.952 0 0 0 3.265-.694L13.938 14h-3.876l-1.327 5.306A7.95 7.95 0 0 0 12 20zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-brush-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 9h6a1 1 0 0 1 1 1v3h1v6h-4v-6h1v-2H5a1 1 0 0 1-1-1v-2h2v1zm11.732 1.732l1.768-1.768 1.768 1.768a2.5 2.5 0 1 1-3.536 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-brush-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v3h14V5H5zM4 3h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 9h6a1 1 0 0 1 1 1v3h1v6h-4v-6h1v-2H5a1 1 0 0 1-1-1v-2h2v1zm11.732 1.732l1.768-1.768 1.768 1.768a2.5 2.5 0 1 1-3.536 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.228 18.732l1.768-1.768 1.767 1.768a2.5 2.5 0 1 1-3.535 0zM8.878 1.08l11.314 11.313a1 1 0 0 1 0 1.415l-8.485 8.485a1 1 0 0 1-1.414 0l-8.485-8.485a1 1 0 0 1 0-1.415l7.778-7.778-2.122-2.121L8.88 1.08zM11 6.03L3.929 13.1H18.07L11 6.03z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paint-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.228 18.732l1.768-1.768 1.767 1.768a2.5 2.5 0 1 1-3.535 0zM8.878 1.08l11.314 11.313a1 1 0 0 1 0 1.415l-8.485 8.485a1 1 0 0 1-1.414 0l-8.485-8.485a1 1 0 0 1 0-1.415l7.778-7.778-2.122-2.121L8.88 1.08zM11 6.03L3.929 13.1 11 20.173l7.071-7.071L11 6.029z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "palette-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.522 0 10 3.978 10 8.889a5.558 5.558 0 0 1-5.556 5.555h-1.966c-.922 0-1.667.745-1.667 1.667 0 .422.167.811.422 1.1.267.3.434.689.434 1.122C13.667 21.256 12.9 22 12 22 6.478 22 2 17.522 2 12S6.478 2 12 2zM7.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "palette-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.522 0 10 3.978 10 8.889a5.558 5.558 0 0 1-5.556 5.555h-1.966c-.922 0-1.667.745-1.667 1.667 0 .422.167.811.422 1.1.267.3.434.689.434 1.122C13.667 21.256 12.9 22 12 22 6.478 22 2 17.522 2 12S6.478 2 12 2zm-1.189 16.111a3.664 3.664 0 0 1 3.667-3.667h1.966A3.558 3.558 0 0 0 20 10.89C20 7.139 16.468 4 12 4a8 8 0 0 0-.676 15.972 3.648 3.648 0 0 1-.513-1.86zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM12 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pantone-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 18.922l-1.35-.545a1 1 0 0 1-.552-1.302L4 12.367v6.555zM8.86 21H7a1 1 0 0 1-1-1v-6.078L8.86 21zM6.022 5.968l9.272-3.746a1 1 0 0 1 1.301.552l5.62 13.908a1 1 0 0 1-.553 1.302L12.39 21.73a1 1 0 0 1-1.302-.553L5.47 7.27a1 1 0 0 1 .553-1.301zM9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pantone-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.764 8l-.295-.73a1 1 0 0 1 .553-1.302l9.272-3.746a1 1 0 0 1 1.301.552l5.62 13.908a1 1 0 0 1-.553 1.302L12.39 21.73a1 1 0 0 1-1.302-.553L11 20.96V21H7a1 1 0 0 1-1-1v-.27l-3.35-1.353a1 1 0 0 1-.552-1.302L5.764 8zM8 19h2.209L8 13.533V19zm-2-6.244l-1.673 4.141L6 17.608v-4.852zm1.698-5.309l4.87 12.054 7.418-2.997-4.87-12.053-7.418 2.996zm2.978 2.033a1 1 0 1 1-.749-1.855 1 1 0 0 1 .75 1.855z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pen-nib-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 21.485l5.846-5.846a2 2 0 1 0-1.414-1.414l-5.846 5.846-1.06-1.06c2.827-3.3 3.888-6.954 5.302-13.082l6.364-.707 5.657 5.657-.707 6.364c-6.128 1.414-9.782 2.475-13.081 5.303l-1.061-1.06zM16.596 2.04l6.347 6.346a.5.5 0 0 1-.277.848l-1.474.23-5.656-5.656.212-1.485a.5.5 0 0 1 .848-.283z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pen-nib-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.596 1.04l6.347 6.346a.5.5 0 0 1-.277.848l-1.474.23-5.656-5.656.212-1.485a.5.5 0 0 1 .848-.283zM4.595 20.15c3.722-3.331 7.995-4.328 12.643-5.52l.446-4.018-4.297-4.297-4.018.446c-1.192 4.648-2.189 8.92-5.52 12.643L2.454 18.01c2.828-3.3 3.89-6.953 5.303-13.081l6.364-.707 5.657 5.657-.707 6.364c-6.128 1.414-9.782 2.475-13.081 5.303L4.595 20.15zm5.284-6.03a2 2 0 1 1 2.828-2.828A2 2 0 0 1 9.88 14.12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.9 6.858l4.242 4.243L7.242 21H3v-4.243l9.9-9.9zm1.414-1.414l2.121-2.122a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414l-2.122 2.121-4.242-4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.728 9.686l-1.414-1.414L5 17.586V19h1.414l9.314-9.314zm1.414-1.414l1.414-1.414-1.414-1.414-1.414 1.414 1.414 1.414zM7.242 21H3v-4.243L16.435 3.322a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414L7.243 21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 12.707l1.828 1.829L8.88 13.12 7.05 11.293l1.414-1.414 1.829 1.828 1.414-1.414L9.88 8.464l1.414-1.414L13.12 8.88l1.415-1.415-1.829-1.828 2.829-2.828a1 1 0 0 1 1.414 0l4.242 4.242a1 1 0 0 1 0 1.414L8.464 21.192a1 1 0 0 1-1.414 0L2.808 16.95a1 1 0 0 1 0-1.414l2.828-2.829zm8.485 5.656l4.243-4.242L21 16.757V21h-4.242l-2.637-2.637zM5.636 9.878L2.807 7.05a1 1 0 0 1 0-1.415l2.829-2.828a1 1 0 0 1 1.414 0L9.88 5.635 5.636 9.878z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.05 14.121L4.93 16.243l2.828 2.828L19.071 7.757 16.243 4.93 14.12 7.05l1.415 1.414L14.12 9.88l-1.414-1.415-1.414 1.415 1.414 1.414-1.414 1.414-1.414-1.414-1.415 1.414 1.415 1.414-1.415 1.415L7.05 14.12zm9.9-11.313l4.242 4.242a1 1 0 0 1 0 1.414L8.464 21.192a1 1 0 0 1-1.414 0L2.808 16.95a1 1 0 0 1 0-1.414L15.536 2.808a1 1 0 0 1 1.414 0zM14.12 18.363l1.415-1.414 2.242 2.243h1.414v-1.414l-2.242-2.243 1.414-1.414L21 16.757V21h-4.242l-2.637-2.637zM5.636 9.878L2.807 7.05a1 1 0 0 1 0-1.415l2.829-2.828a1 1 0 0 1 1.414 0L9.88 5.635 8.464 7.05 6.343 4.928 4.929 6.343l2.121 2.12-1.414 1.415z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 18v2h4v-2H5zM3 7l4-5 4 5v15H3V7zm18 1h-2v2h2v2h-3v2h3v2h-2v2h2v3a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pencil-ruler-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8v12h4V8H5zM3 7l4-5 4 5v15H3V7zm16 9v-2h-3v-2h3v-2h-2V8h2V6h-4v14h4v-2h-2v-2h2zM14 4h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "quill-pen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2C6 2 4 16 3 22h1.998c.666-3.333 2.333-5.166 5.002-5.5 4-.5 7-4 8-7l-1.5-1 1-1c1-1 2.004-2.5 3.5-5.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "quill-pen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.94 14.036c-.233.624-.43 1.2-.606 1.783.96-.697 2.101-1.139 3.418-1.304 2.513-.314 4.746-1.973 5.876-4.058l-1.456-1.455 1.413-1.415 1-1.001c.43-.43.915-1.224 1.428-2.368-5.593.867-9.018 4.292-11.074 9.818zM17 9.001L18 10c-1 3-4 6-8 6.5-2.669.334-4.336 2.167-5.002 5.5H3C4 16 6 2 21 2c-1 2.997-1.998 4.996-2.997 5.997L17 9.001z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 21h-2v-3h-2v3H9v-2H7v2H4a1 1 0 0 1-1-1v-3h2v-2H3v-2h3v-2H3V9h2V7H3V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3v-2h-2v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 19h2v-5h-9V5H5v2h2v2H5v2h3v2H5v2h2v2H5v2h2v-2h2v2h2v-3h2v3h2v-2h2v2zm-5-7h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 13.207l2.121 2.121 1.414-1.414-2.12-2.121 2.12-2.121 2.829 2.828 1.414-1.414L9.88 8.257 12 6.136l2.121 2.121 1.415-1.414-2.122-2.121 2.829-2.829a1 1 0 0 1 1.414 0l4.95 4.95a1 1 0 0 1 0 1.414l-14.85 14.85a1 1 0 0 1-1.414 0l-4.95-4.95a1 1 0 0 1 0-1.414l3.536-3.536z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ruler-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.343 14.621L3.515 17.45l3.535 3.535L20.485 7.55 16.95 4.015l-2.122 2.121 1.415 1.414-1.415 1.414-1.414-1.414-2.121 2.122 2.121 2.12L12 13.208l-2.121-2.121-2.122 2.121 1.415 1.414-1.415 1.415-1.414-1.415zM17.657 1.893l4.95 4.95a1 1 0 0 1 0 1.414l-14.85 14.85a1 1 0 0 1-1.414 0l-4.95-4.95a1 1 0 0 1 0-1.414l14.85-14.85a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 14.121l-2.317 2.317a4 4 0 1 1-2.121-2.121L9.88 12 4.21 6.333a2 2 0 0 1 0-2.829l.708-.707L12 9.88l7.081-7.082.708.707a2 2 0 0 1 0 2.829L14.12 12l2.317 2.317a4 4 0 1 1-2.121 2.121L12 14.12zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13.414l-2.554 2.554a4 4 0 1 1-1.414-1.414L10.586 12 4.565 5.98a2 2 0 0 1 0-2.83L12 10.587l7.435-7.435a2 2 0 0 1 0 2.828L13.415 12l2.553 2.554a4 4 0 1 1-1.414 1.414L12 13.414zM6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-cut-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.879 12L7.562 9.683a4 4 0 1 1 2.121-2.121L12 9.88l6.374-6.375a2 2 0 0 1 2.829 0l.707.707L9.683 16.438a4 4 0 1 1-2.121-2.121L9.88 12zM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9.535-6.587l6.375 6.376-.707.707a2 2 0 0 1-2.829 0l-4.96-4.961 2.12-2.122zM16 11h2v2h-2v-2zm4 0h2v2h-2v-2zM6 11h2v2H6v-2zm-4 0h2v2H2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-cut-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 6c0 .732-.197 1.419-.54 2.01L12 10.585l6.728-6.728a2 2 0 0 1 2.828 0l-12.11 12.11a4 4 0 1 1-1.414-1.414L10.586 12 8.032 9.446A4 4 0 1 1 10 6zM8 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm13.556 14.142a2 2 0 0 1-2.828 0l-5.317-5.316 1.415-1.415 6.73 6.731zM16 11h2v2h-2v-2zm4 0h2v2h-2v-2zM6 11h2v2H6v-2zm-4 0h2v2H2v-2zm4 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.683 7.562L12 9.88l6.374-6.375a2 2 0 0 1 2.829 0l.707.707L9.683 16.438a4 4 0 1 1-2.121-2.121L9.88 12 7.562 9.683a4 4 0 1 1 2.121-2.121zM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm9.535-6.587l6.375 6.376-.707.707a2 2 0 0 1-2.829 0l-4.96-4.961 2.12-2.122z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scissors-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.446 8.032L12 10.586l6.728-6.728a2 2 0 0 1 2.828 0l-12.11 12.11a4 4 0 1 1-1.414-1.414L10.586 12 8.032 9.446a4 4 0 1 1 1.414-1.414zm5.38 5.38l6.73 6.73a2 2 0 0 1-2.828 0l-5.317-5.316 1.415-1.415zm-7.412 3.174a2 2 0 1 0-2.828 2.828 2 2 0 0 0 2.828-2.828zm0-9.172a2 2 0 1 0-2.828-2.828 2 2 0 0 0 2.828 2.828z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h2v2H3V3zm4 0h2v2H7V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm0 4h2v2h-2V7zM3 19h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3V7zm7.667 4l1.036-1.555A1 1 0 0 1 12.535 9h2.93a1 1 0 0 1 .832.445L17.333 11H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2.667zM14 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h2v2H3V3zm4 0h2v2H7V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm4 0h2v2h-2V3zm0 4h2v2h-2V7zM3 19h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3v-2zm0-4h2v2H3V7zm7.667 4l1.036-1.555A1 1 0 0 1 12.535 9h2.93a1 1 0 0 1 .832.445L17.333 11H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2.667zM9 19h10v-6h-2.737l-1.333-2h-1.86l-1.333 2H9v6zm5-1a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.993 14.407l-1.552 1.552a4 4 0 1 1-1.418-1.41l1.555-1.556-3.124-3.125a1.5 1.5 0 0 1 0-2.121l.354-.354 4.185 4.185 4.189-4.189.353.354a1.5 1.5 0 0 1 0 2.12l-3.128 3.13 1.561 1.56a4 4 0 1 1-1.414 1.414l-1.561-1.56zM19 13V5H5v8H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v9h-2zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "screenshot-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.993 14.407l-1.552 1.552a4 4 0 1 1-1.418-1.41l1.555-1.556-4.185-4.185 1.415-1.415 4.185 4.185 4.189-4.189 1.414 1.414-4.19 4.19 1.562 1.56a4 4 0 1 1-1.414 1.414l-1.561-1.56zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm2-7V5H5v8H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v9h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 2h5v5H2V2zm0 15h5v5H2v-5zM17 2h5v5h-5V2zm0 15h5v5h-5v-5zM8 4h8v2H8V4zM4 8h2v8H4V8zm14 0h2v8h-2V8zM8 18h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 16h2v6h-6v-2H8v2H2v-6h2V8H2V2h6v2h8V2h6v6h-2v8zm-2 0V8h-2V6H8v2H6v8h2v2h8v-2h2zM4 4v2h2V4H4zm0 14v2h2v-2H4zM18 4v2h2V4h-2zm0 14v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm14 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM5 22a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM9 4h6v2H9V4zm0 14h6v2H9v-2zM4 9h2v6H4V9zm14 0h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shape-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.83 20A3.001 3.001 0 1 1 4 16.17V7.83A3.001 3.001 0 1 1 7.83 4h8.34A3.001 3.001 0 1 1 20 7.83v8.34A3.001 3.001 0 1 1 16.17 20H7.83zm0-2h8.34A3.008 3.008 0 0 1 18 16.17V7.83A3.008 3.008 0 0 1 16.17 6H7.83A3.008 3.008 0 0 1 6 7.83v8.34A3.008 3.008 0 0 1 7.83 18zM5 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm14 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sip-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.96 6.504l2.829-2.828a1 1 0 0 1 1.414 0l2.121 2.121a1 1 0 0 1 0 1.414l-2.828 2.829 1.767 1.768-1.414 1.414-7.07-7.071 1.413-1.414 1.768 1.767zM10.778 8.98l4.243 4.243L7.243 21H3v-4.243l7.778-7.778z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sip-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.457 18.957l8.564-8.564-1.414-1.414-8.564 8.564 1.414 1.414zm5.735-11.392l-1.414-1.414 1.414-1.414 1.768 1.767 2.829-2.828a1 1 0 0 1 1.414 0l2.121 2.121a1 1 0 0 1 0 1.414l-2.828 2.829 1.767 1.768-1.414 1.414-1.414-1.414L7.243 21H3v-4.243l9.192-9.192z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "slice-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.768 12.232l2.121 2.122c-4.596 4.596-10.253 6.01-13.788 5.303L17.657 4.1l2.121 2.12-6.01 6.011z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "slice-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15.69 12.918l1.769 1.768c-6.01 6.01-10.96 6.01-15.203 4.596L17.812 3.726l3.536 3.535-5.657 5.657zm-2.828 0l5.657-5.657-.707-.707L6.314 18.052c2.732.107 5.358-.907 8.267-3.416l-1.719-1.718z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "t-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 8H7v2h4v7h2v-7h4V8zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "t-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V5H5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9 7v7h-2v-7H7V8h10v2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-alt-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 14V3H3a1 1 0 0 0-1 1v10h5zm8 0V3H9v11h6zm7 0V4a1 1 0 0 0-1-1h-4v11h5zm-1 7a1 1 0 0 0 1-1v-4H2v4a1 1 0 0 0 1 1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-alt-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 13H4v3h16v-3zM8 5H4v9h4V5zm6 0h-4v9h4V5zm6 0h-4v9h4V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 21H9V10h6v11zm2 0V10h5v10a1 1 0 0 1-1 1h-4zM7 21H3a1 1 0 0 1-1-1V10h5v11zM22 8H2V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 8h16V5H4v3zm10 11v-9h-4v9h4zm2 0h4v-9h-4v9zm-8 0v-9H4v9h4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tools-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.33 3.271a3.5 3.5 0 0 1 4.472 4.474L20.647 18.59l-2.122 2.121L7.68 9.867a3.5 3.5 0 0 1-4.472-4.474L5.444 7.63a1.5 1.5 0 1 0 2.121-2.121L5.329 3.27zm10.367 1.884l3.182-1.768 1.414 1.414-1.768 3.182-1.768.354-2.12 2.121-1.415-1.414 2.121-2.121.354-1.768zm-7.071 7.778l2.121 2.122-4.95 4.95A1.5 1.5 0 0 1 3.58 17.99l.097-.107 4.95-4.95z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tools-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.33 3.271a3.5 3.5 0 0 1 4.254 4.963l10.709 10.71-1.414 1.414-10.71-10.71a3.502 3.502 0 0 1-4.962-4.255L5.444 7.63a1.5 1.5 0 1 0 2.121-2.121L5.329 3.27zm10.367 1.884l3.182-1.768 1.414 1.414-1.768 3.182-1.768.354-2.12 2.121-1.415-1.414 2.121-2.121.354-1.768zm-6.718 8.132l1.414 1.414-5.303 5.303a1 1 0 0 1-1.492-1.327l.078-.087 5.303-5.303z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "development",
            iconsvg: [
                {
                    name: "braces-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 18v-3.7a1.5 1.5 0 0 0-1.5-1.5H2v-1.6h.5A1.5 1.5 0 0 0 4 9.7V6a3 3 0 0 1 3-3h1v2H7a1 1 0 0 0-1 1v4.1A2 2 0 0 1 4.626 12 2 2 0 0 1 6 13.9V18a1 1 0 0 0 1 1h1v2H7a3 3 0 0 1-3-3zm16-3.7V18a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1v-4.1a2 2 0 0 1 1.374-1.9A2 2 0 0 1 18 10.1V6a1 1 0 0 0-1-1h-1V3h1a3 3 0 0 1 3 3v3.7a1.5 1.5 0 0 0 1.5 1.5h.5v1.6h-.5a1.5 1.5 0 0 0-1.5 1.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "braces-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 18v-3.7a1.5 1.5 0 0 0-1.5-1.5H2v-1.6h.5A1.5 1.5 0 0 0 4 9.7V6a3 3 0 0 1 3-3h1v2H7a1 1 0 0 0-1 1v4.1A2 2 0 0 1 4.626 12 2 2 0 0 1 6 13.9V18a1 1 0 0 0 1 1h1v2H7a3 3 0 0 1-3-3zm16-3.7V18a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1v-4.1a2 2 0 0 1 1.374-1.9A2 2 0 0 1 18 10.1V6a1 1 0 0 0-1-1h-1V3h1a3 3 0 0 1 3 3v3.7a1.5 1.5 0 0 0 1.5 1.5h.5v1.6h-.5a1.5 1.5 0 0 0-1.5 1.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brackets-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 3v2H6v14h3v2H4V3h5zm6 0h5v18h-5v-2h3V5h-3V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bug-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.056 8.3a7.01 7.01 0 0 1 .199-.3h11.49c.069.098.135.199.199.3l2.02-1.166 1 1.732-2.213 1.278c.162.59.249 1.213.249 1.856v1h3v2h-3c0 .953-.19 1.862-.536 2.69l2.5 1.444-1 1.732-2.526-1.458A6.992 6.992 0 0 1 13 21.929V14h-2v7.93a6.992 6.992 0 0 1-4.438-2.522l-2.526 1.458-1-1.732 2.5-1.443A6.979 6.979 0 0 1 5 15H2v-2h3v-1c0-.643.087-1.265.249-1.856L3.036 8.866l1-1.732L6.056 8.3zM8 6a4 4 0 1 1 8 0H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bug-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.07 16A7.06 7.06 0 0 1 5 15v-1H3v-2h2v-1c0-.34.024-.673.07-1H3V8h2.674a7.03 7.03 0 0 1 2.84-3.072l-1.05-1.05L8.88 2.465l1.683 1.684a7.03 7.03 0 0 1 2.876 0l1.683-1.684 1.415 1.415-1.05 1.05A7.03 7.03 0 0 1 18.326 8H21v2h-2.07c.046.327.07.66.07 1v1h2v2h-2v1c0 .34-.024.673-.07 1H21v2h-2.674a7 7 0 0 1-12.652 0H3v-2h2.07zM9 10v2h6v-2H9zm0 4v2h6v-2H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bug-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.562 4.148a7.03 7.03 0 0 1 2.876 0l1.683-1.684 1.415 1.415-1.05 1.05A7.03 7.03 0 0 1 18.326 8H21v2h-2.07c.046.327.07.66.07 1v1h2v2h-2v1c0 .34-.024.673-.07 1H21v2h-2.674a7 7 0 0 1-12.652 0H3v-2h2.07A7.06 7.06 0 0 1 5 15v-1H3v-2h2v-1c0-.34.024-.673.07-1H3V8h2.674a7.03 7.03 0 0 1 2.84-3.072l-1.05-1.05L8.88 2.465l1.683 1.684zM12 6a5 5 0 0 0-5 5v4a5 5 0 0 0 10 0v-4a5 5 0 0 0-5-5zm-3 8h6v2H9v-2zm0-4h6v2H9v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "brackets-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 3v2H6v14h3v2H4V3h5zm6 0h5v18h-5v-2h3V5h-3V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm13.464 12.536L20 12l-3.536-3.536L15.05 9.88 17.172 12l-2.122 2.121 1.414 1.415zM6.828 12L8.95 9.879 7.536 8.464 4 12l3.536 3.536L8.95 14.12 6.828 12zm4.416 5l3.64-10h-2.128l-3.64 10h2.128z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bug-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 19.9a5.002 5.002 0 0 0 4-4.9v-3a4.98 4.98 0 0 0-.415-2h-9.17A4.98 4.98 0 0 0 7 12v3a5.002 5.002 0 0 0 4 4.9V14h2v5.9zm-7.464-2.21A6.979 6.979 0 0 1 5 15H2v-2h3v-1c0-.643.087-1.265.249-1.856L3.036 8.866l1-1.732L6.056 8.3a7.01 7.01 0 0 1 .199-.3h11.49c.069.098.135.199.199.3l2.02-1.166 1 1.732-2.213 1.278c.162.59.249 1.213.249 1.856v1h3v2h-3c0 .953-.19 1.862-.536 2.69l2.5 1.444-1 1.732-2.526-1.458A6.986 6.986 0 0 1 12 22a6.986 6.986 0 0 1-5.438-2.592l-2.526 1.458-1-1.732 2.5-1.443zM8 6a4 4 0 1 1 8 0H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm16 7l-3.536 3.536-1.414-1.415L17.172 12 15.05 9.879l1.414-1.415L20 12zM6.828 12l2.122 2.121-1.414 1.415L4 12l3.536-3.536L8.95 9.88 6.828 12zm4.416 5H9.116l3.64-10h2.128l-3.64 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M23 12l-7.071 7.071-1.414-1.414L20.172 12l-5.657-5.657 1.414-1.414L23 12zM3.828 12l5.657 5.657-1.414 1.414L1 12l7.071-7.071 1.414 1.414L3.828 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-s-slash-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M24 12l-5.657 5.657-1.414-1.414L21.172 12l-4.243-4.243 1.414-1.414L24 12zM2.828 12l4.243 4.243-1.414 1.414L0 12l5.657-5.657L7.07 7.757 2.828 12zm6.96 9H7.66l6.552-18h2.128L9.788 21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-s-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M24 12l-5.657 5.657-1.414-1.414L21.172 12l-4.243-4.243 1.414-1.414L24 12zM2.828 12l4.243 4.243-1.414 1.414L0 12l5.657-5.657L7.07 7.757 2.828 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-s-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M24 12l-5.657 5.657-1.414-1.414L21.172 12l-4.243-4.243 1.414-1.414L24 12zM2.828 12l4.243 4.243-1.414 1.414L0 12l5.657-5.657L7.07 7.757 2.828 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M23 12l-7.071 7.071-1.414-1.414L20.172 12l-5.657-5.657 1.414-1.414L23 12zM3.828 12l5.657 5.657-1.414 1.414L1 12l7.071-7.071 1.414 1.414L3.828 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "css3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M5 3l-.65 3.34h13.59L17.5 8.5H3.92l-.66 3.33h13.59l-.76 3.81-5.48 1.81-4.75-1.81.33-1.64H2.85l-.79 4 7.85 3 9.05-3 1.2-6.03.24-1.21L21.94 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-s-slash-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M24 12l-5.657 5.657-1.414-1.414L21.172 12l-4.243-4.243 1.414-1.414L24 12zM2.828 12l4.243 4.243-1.414 1.414L0 12l5.657-5.657L7.07 7.757 2.828 12zm6.96 9H7.66l6.552-18h2.128L9.788 21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "command-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10 8h4V6.5a3.5 3.5 0 1 1 3.5 3.5H16v4h1.5a3.5 3.5 0 1 1-3.5 3.5V16h-4v1.5A3.5 3.5 0 1 1 6.5 14H8v-4H6.5A3.5 3.5 0 1 1 10 6.5V8zM8 8V6.5A1.5 1.5 0 1 0 6.5 8H8zm0 8H6.5A1.5 1.5 0 1 0 8 17.5V16zm8-8h1.5A1.5 1.5 0 1 0 16 6.5V8zm0 8v1.5a1.5 1.5 0 1 0 1.5-1.5H16zm-6-6v4h4v-4h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "command-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10 8h4V6.5a3.5 3.5 0 1 1 3.5 3.5H16v4h1.5a3.5 3.5 0 1 1-3.5 3.5V16h-4v1.5A3.5 3.5 0 1 1 6.5 14H8v-4H6.5A3.5 3.5 0 1 1 10 6.5V8zM8 8V6.5A1.5 1.5 0 1 0 6.5 8H8zm0 8H6.5A1.5 1.5 0 1 0 8 17.5V16zm8-8h1.5A1.5 1.5 0 1 0 16 6.5V8zm0 8v1.5a1.5 1.5 0 1 0 1.5-1.5H16zm-6-6v4h4v-4h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "css3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.8 14h2.04l-.545 2.725 5.744 2.154 7.227-2.41L18.36 11H3.4l.4-2h14.96l.8-4H4.6L5 3h17l-3 15-9 3-8-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cursor-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.91 12.36L17 20.854l-2.818 1.026-3.092-8.494-4.172 3.156 1.49-14.909 10.726 10.463z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-branch-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.105 15.21A3.001 3.001 0 1 1 5 15.17V8.83a3.001 3.001 0 1 1 2 0V12c.836-.628 1.874-1 3-1h4a3.001 3.001 0 0 0 2.895-2.21 3.001 3.001 0 1 1 2.032.064A5.001 5.001 0 0 1 14 13h-4a3.001 3.001 0 0 0-2.895 2.21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cursor-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15.388 13.498l2.552 7.014-4.698 1.71-2.553-7.014-3.899 2.445L8.41 1.633l11.537 11.232-4.558.633zm-.011 5.818l-2.715-7.46 2.96-.41-5.64-5.49-.79 7.83 2.53-1.587 2.715 7.46.94-.343z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-commit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.874 13a4.002 4.002 0 0 1-7.748 0H3v-2h5.126a4.002 4.002 0 0 1 7.748 0H21v2h-5.126z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-branch-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.105 15.21A3.001 3.001 0 1 1 5 15.17V8.83a3.001 3.001 0 1 1 2 0V12c.836-.628 1.874-1 3-1h4a3.001 3.001 0 0 0 2.895-2.21 3.001 3.001 0 1 1 2.032.064A5.001 5.001 0 0 1 14 13h-4a3.001 3.001 0 0 0-2.895 2.21zM6 17a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM6 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm12 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-merge-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.105 8.79A3.001 3.001 0 0 0 10 11h4a5.001 5.001 0 0 1 4.927 4.146A3.001 3.001 0 0 1 18 21a3 3 0 0 1-1.105-5.79A3.001 3.001 0 0 0 14 13h-4a4.978 4.978 0 0 1-3-1v3.17a3.001 3.001 0 1 1-2 0V8.83a3.001 3.001 0 1 1 2.105-.04z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-merge-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.105 8.79A3.001 3.001 0 0 0 10 11h4a5.001 5.001 0 0 1 4.927 4.146A3.001 3.001 0 0 1 18 21a3 3 0 0 1-1.105-5.79A3.001 3.001 0 0 0 14 13h-4a4.978 4.978 0 0 1-3-1v3.17a3.001 3.001 0 1 1-2 0V8.83a3.001 3.001 0 1 1 2.105-.04zM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm12 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-pull-request-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 5h2a2 2 0 0 1 2 2v8.17a3.001 3.001 0 1 1-2 0V7h-2v3l-4.5-4L15 2v3zM5 8.83a3.001 3.001 0 1 1 2 0v6.34a3.001 3.001 0 1 1-2 0V8.83z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-pull-request-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 5h2a2 2 0 0 1 2 2v8.17a3.001 3.001 0 1 1-2 0V7h-2v3l-4.5-4L15 2v3zM5 8.83a3.001 3.001 0 1 1 2 0v6.34a3.001 3.001 0 1 1-2 0V8.83zM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm12 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-repository-commits-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 17v6h-2v-6H9l4-5 4 5h-3zm2 2h3v-3h-.8L13 9.5 7.647 16H6.5a1.5 1.5 0 0 0 0 3H10v2H6.5A3.5 3.5 0 0 1 3 17.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-4v-2zM7 5v2h2V5H7zm0 3v2h2V8H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-repository-commits-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M18 16v-2h1V4H6v10.035A3.53 3.53 0 0 1 6.5 14H8v2H6.5a1.5 1.5 0 0 0 0 3H10v2H6.5A3.5 3.5 0 0 1 3 17.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-4v-2h3v-3h-1zM7 5h2v2H7V5zm0 3h2v2H7V8zm7 9v6h-2v-6H9l4-5 4 5h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-repository-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 21v2.5l-3-2-3 2V21h-.5A3.5 3.5 0 0 1 3 17.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-7zm-6-2v-2h6v2h6v-3H6.5a1.5 1.5 0 0 0 0 3H7zM7 5v2h2V5H7zm0 3v2h2V8H7zm0 3v2h2v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-repository-private-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M18 8h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2V7a6 6 0 1 1 12 0v1zm-2 0V7a4 4 0 1 0-8 0v1h8zm-9 3v2h2v-2H7zm0 3v2h2v-2H7zm0 3v2h2v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-repository-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13 21v2.5l-3-2-3 2V21h-.5A3.5 3.5 0 0 1 3 17.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-7zm0-2h6v-3H6.5a1.5 1.5 0 0 0 0 3H7v-2h6v2zm6-5V4H6v10.035A3.53 3.53 0 0 1 6.5 14H19zM7 5h2v2H7V5zm0 3h2v2H7V8zm0 3h2v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-commit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.874 13a4.002 4.002 0 0 1-7.748 0H3v-2h5.126a4.002 4.002 0 0 1 7.748 0H21v2h-5.126zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "git-repository-private-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M6 10v10h13V10H6zm12-2h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h2V7a6 6 0 1 1 12 0v1zm-2 0V7a4 4 0 1 0-8 0v1h8zm-9 3h2v2H7v-2zm0 3h2v2H7v-2zm0 3h2v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "html5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 18.178l4.62-1.256.623-6.778H9.026L8.822 7.89h8.626l.227-2.211H6.325l.636 6.678h7.82l-.261 2.866-2.52.667-2.52-.667-.158-1.844h-2.27l.329 3.544L12 18.178zM3 2h18l-1.623 18L12 22l-7.377-2L3 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "html5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 18.178l-4.62-1.256-.328-3.544h2.27l.158 1.844 2.52.667 2.52-.667.26-2.866H6.96l-.635-6.678h11.35l-.227 2.21H8.822l.204 2.256h8.217l-.624 6.778L12 18.178zM3 2h18l-1.623 18L12 22l-7.377-2L3 2zm2.188 2L6.49 18.434 12 19.928l5.51-1.494L18.812 4H5.188z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "parentheses-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.923 21C5.113 18.664 4 15.493 4 12c0-3.493 1.113-6.664 2.923-9h2.014C7.235 5.388 6.2 8.542 6.2 12s1.035 6.612 2.737 9H6.923zm10.151 0H15.06c1.702-2.388 2.737-5.542 2.737-9s-1.035-6.612-2.737-9h2.014c1.81 2.336 2.923 5.507 2.923 9 0 3.493-1.112 6.664-2.923 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "parentheses-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.923 21C5.113 18.664 4 15.493 4 12c0-3.493 1.113-6.664 2.923-9h2.014C7.235 5.388 6.2 8.542 6.2 12s1.035 6.612 2.737 9H6.923zm10.151 0H15.06c1.702-2.388 2.737-5.542 2.737-9s-1.035-6.612-2.737-9h2.014c1.81 2.336 2.923 5.507 2.923 9 0 3.493-1.112 6.664-2.923 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "terminal-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 12l-7.071 7.071-1.414-1.414L8.172 12 2.515 6.343 3.929 4.93 11 12zm0 7h10v2H11v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "terminal-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9 12v2h6v-2h-6zm-3.586-3l-2.828 2.828L7 16.243 11.243 12 7 7.757 5.586 9.172 8.414 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "terminal-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm8 10h6v2h-6v-2zm-3.333-3L5.838 9.172l1.415-1.415L11.495 12l-4.242 4.243-1.415-1.415L8.667 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "terminal-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 12l-7.071 7.071-1.414-1.414L8.172 12 2.515 6.343 3.929 4.93 11 12zm0 7h10v2H11v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "terminal-window-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 10H4v9h16v-9zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 3v2h2V6H5zm4 0v2h2V6H9zm-4 5h3v5H5v-5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "terminal-window-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 9V5H4v4h16zm0 2H4v8h16v-8zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 9h3v5H5v-5zm0-6h2v2H5V6zm4 0h2v2H9V6z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "device",
            iconsvg: [
                {
                    name: "airplay-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.4 13.533l5 6.667a.5.5 0 0 1-.4.8H7a.5.5 0 0 1-.4-.8l5-6.667a.5.5 0 0 1 .8 0zM18 19v-2h2V5H4v12h2v2H2.992A.994.994 0 0 1 2 18V4c0-.552.455-1 .992-1h18.016c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "airplay-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.4 13.533l5 6.667a.5.5 0 0 1-.4.8H7a.5.5 0 0 1-.4-.8l5-6.667a.5.5 0 0 1 .8 0zM12 16.33L10 19h4l-2-2.67zM18 19v-2h2V5H4v12h2v2H2.992A.994.994 0 0 1 2 18V4c0-.552.455-1 .992-1h18.016c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "barcode-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 4v10h3V7H6zm4 0v10h2V7h-2zm3 0v10h1V7h-1zm2 0v10h3V7h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "barcode-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 4h3v10H6V7zm4 0h2v10h-2V7zm3 0h1v10h-1V7zm2 0h3v10h-3V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "barcode-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 4h2v16H2V4zm4 0h2v16H6V4zm3 0h3v16H9V4zm4 0h2v16h-2V4zm3 0h2v16h-2V4zm3 0h3v16h-3V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "barcode-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 4h2v16H2V4zm4 0h1v16H6V4zm2 0h2v16H8V4zm3 0h2v16h-2V4zm3 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h3v16h-3V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "base-station-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13l6 9H6l6-9zm-1.06-2.44a1.5 1.5 0 1 1 2.12-2.12 1.5 1.5 0 0 1-2.12 2.12zM5.281 2.783l1.415 1.415a7.5 7.5 0 0 0 0 10.606l-1.415 1.415a9.5 9.5 0 0 1 0-13.436zm13.436 0a9.5 9.5 0 0 1 0 13.436l-1.415-1.415a7.5 7.5 0 0 0 0-10.606l1.415-1.415zM8.11 5.611l1.414 1.414a3.5 3.5 0 0 0 0 4.95l-1.414 1.414a5.5 5.5 0 0 1 0-7.778zm7.778 0a5.5 5.5 0 0 1 0 7.778l-1.414-1.414a3.5 3.5 0 0 0 0-4.95l1.414-1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "base-station-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 13l6 9H6l6-9zm0 3.6L9.74 20h4.52L12 16.6zm-1.06-6.04a1.5 1.5 0 1 1 2.12-2.12 1.5 1.5 0 0 1-2.12 2.12zM5.281 2.783l1.415 1.415a7.5 7.5 0 0 0 0 10.606l-1.415 1.415a9.5 9.5 0 0 1 0-13.436zm13.436 0a9.5 9.5 0 0 1 0 13.436l-1.415-1.415a7.5 7.5 0 0 0 0-10.606l1.415-1.415zM8.11 5.611l1.414 1.414a3.5 3.5 0 0 0 0 4.95l-1.414 1.414a5.5 5.5 0 0 1 0-7.778zm7.778 0a5.5 5.5 0 0 1 0 7.778l-1.414-1.414a3.5 3.5 0 0 0 0-4.95l1.414-1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-2-charge-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm4 8V7l-5 7h3v5l5-7h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 6H7v14h10V6h-4V4h-2v2zM9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-charge-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 11V5l-5 8h3v6l5-8h-3zM3 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm18 4h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-charge-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 19H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6.625L8.458 7H4v10h4v2zm4.375 0l1.167-2H18V7h-4V5h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6.625zM21 9h2v6h-2V9zm-9 2h3l-5 8v-6H7l5-8v6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm18 4h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 7v10h14V7H4zM3 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm18 4h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-low-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 3v8h4V8H5zm16 1h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-low-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 7v10h14V7H4zM3 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm2 3h4v8H5V8zm16 1h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-saver-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 2a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h4zm-1 7h-2v3H8v2h3v3h2v-3h3v-2h-3V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-saver-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 2a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h4zm-1 2h-2v2H7v14h10V6h-4V4zm0 5v3h3v2h-3v3h-2v-3H8v-2h3V9h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-share-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 2a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v2h-2V6h-4V4h-2v2H7v14h10v-3h2v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h4zm1 6l5 4-5 4v-3h-1c-1.054 0-2 .95-2 2v3h-2v-3a4 4 0 0 1 4-4h1V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-share-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 2a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v6.2L15 8v3h-1c-2.142 0-4 1.79-4 4v3h2v-3c0-1.05.95-2 2-2h1v3l4-3.2V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bluetooth-connect-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.341 12.03l4.343 4.343-5.656 5.656h-2v-6.686l-4.364 4.364-1.415-1.414 5.779-5.778v-.97L5.249 5.765l1.415-1.414 4.364 4.364V2.029h2l5.656 5.657-4.343 4.343zm-1.313 1.514v5.657l2.828-2.828-2.828-2.829zm0-3.03l2.828-2.828-2.828-2.828v5.657zM19.5 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-13 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bluetooth-connect-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.341 12.03l4.343 4.343-5.656 5.656h-2v-6.686l-4.364 4.364-1.415-1.414 5.779-5.778v-.97L5.249 5.765l1.415-1.414 4.364 4.364V2.029h2l5.656 5.657-4.343 4.343zm-1.313 1.514v5.657l2.828-2.828-2.828-2.829zm0-3.03l2.828-2.828-2.828-2.828v5.657zM19.5 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-13 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bluetooth-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.341 12.03l4.343 4.343-5.656 5.656h-2v-6.686l-4.364 4.364-1.415-1.414 5.779-5.778v-.97L5.249 5.765l1.415-1.414 4.364 4.364V2.029h2l5.656 5.657-4.343 4.343zm-1.313 1.514v5.657l2.828-2.828-2.828-2.829zm0-3.03l2.828-2.828-2.828-2.828v5.657z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cast-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6a13.1 13.1 0 0 0-.153-2H20V5H4v3.153A13.1 13.1 0 0 0 2 8V4a1 1 0 0 1 1-1zm10 18h-2a9 9 0 0 0-9-9v-2c6.075 0 11 4.925 11 11zm-4 0H7a5 5 0 0 0-5-5v-2a7 7 0 0 1 7 7zm-4 0H2v-3a3 3 0 0 1 3 3zm9.373-4A13.032 13.032 0 0 0 6 8.627V7h12v10h-3.627z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-2-charge-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 12h3l-5 7v-5H8l5-7v5zm-2-6H7v14h10V6h-4V4h-2v2zM9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "battery-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cellphone-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 2h11a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V0h2v2zm0 2v5h10V4H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cellphone-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 2h11a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V0h2v2zm0 7h10V4H7v5zm0 2v9h10v-9H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "computer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 18v2h4v2H7v-2h4v-2H2.992A.998.998 0 0 1 2 16.993V4.007C2 3.451 2.455 3 2.992 3h18.016c.548 0 .992.449.992 1.007v12.986c0 .556-.455 1.007-.992 1.007H13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "computer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 16h16V5H4v11zm9 2v2h4v2H7v-2h4v-2H2.992A.998.998 0 0 1 2 16.993V4.007C2 3.451 2.455 3 2.992 3h18.016c.548 0 .992.449.992 1.007v12.986c0 .556-.455 1.007-.992 1.007H13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cpu-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 20h-4v2H8v-2H5a1 1 0 0 1-1-1v-3H2v-2h2v-4H2V8h2V5a1 1 0 0 1 1-1h3V2h2v2h4V2h2v2h3a1 1 0 0 1 1 1v3h2v2h-2v4h2v2h-2v3a1 1 0 0 1-1 1h-3v2h-2v-2zM7 7v4h4V7H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bluetooth-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.341 12.03l4.343 4.343-5.656 5.656h-2v-6.686l-4.364 4.364-1.415-1.414 5.779-5.778v-.97L5.249 5.765l1.415-1.414 4.364 4.364V2.029h2l5.656 5.657-4.343 4.343zm-1.313 1.514v5.657l2.828-2.828-2.828-2.829zm0-3.03l2.828-2.828-2.828-2.828v5.657z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cpu-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 18h12V6H6v12zm8 2h-4v2H8v-2H5a1 1 0 0 1-1-1v-3H2v-2h2v-4H2V8h2V5a1 1 0 0 1 1-1h3V2h2v2h4V2h2v2h3a1 1 0 0 1 1 1v3h2v2h-2v4h2v2h-2v3a1 1 0 0 1-1 1h-3v2h-2v-2zM8 8h8v8H8V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cast-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6a13.1 13.1 0 0 0-.153-2H20V5H4v3.153A13.1 13.1 0 0 0 2 8V4a1 1 0 0 1 1-1zm10 18h-2a9 9 0 0 0-9-9v-2c6.075 0 11 4.925 11 11zm-4 0H7a5 5 0 0 0-5-5v-2a7 7 0 0 1 7 7zm-4 0H2v-3a3 3 0 0 1 3 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dashboard-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 3c-3.866 0-7 3.134-7 7 0 1.852.72 3.537 1.894 4.789l.156.16 1.414-1.413C7.56 14.63 7 13.38 7 12c0-2.761 2.239-5 5-5 .448 0 .882.059 1.295.17l1.563-1.562C13.985 5.218 13.018 5 12 5zm6.392 4.143l-1.561 1.562c.11.413.169.847.169 1.295 0 1.38-.56 2.63-1.464 3.536l1.414 1.414C18.216 15.683 19 13.933 19 12c0-1.018-.217-1.985-.608-2.857zm-2.15-2.8l-3.725 3.724C12.352 10.023 12.179 10 12 10c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2c0-.179-.023-.352-.067-.517l3.724-3.726-1.414-1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dashboard-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm4.596 5.404c-.204-.205-.526-.233-.763-.067-2.89 2.028-4.52 3.23-4.894 3.602-.585.586-.585 1.536 0 2.122.586.585 1.536.585 2.122 0 .219-.22 1.418-1.851 3.598-4.897.168-.234.141-.556-.063-.76zM17.5 11c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm-11 0c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm2.318-3.596c-.39-.39-1.024-.39-1.414 0-.39.39-.39 1.023 0 1.414.39.39 1.023.39 1.414 0 .39-.39.39-1.024 0-1.414zM12 5.5c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dashboard-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 1c1.018 0 1.985.217 2.858.608L13.295 7.17C12.882 7.06 12.448 7 12 7c-2.761 0-5 2.239-5 5 0 1.38.56 2.63 1.464 3.536L7.05 16.95l-.156-.161C5.72 15.537 5 13.852 5 12c0-3.866 3.134-7 7-7zm6.392 4.143c.39.872.608 1.84.608 2.857 0 1.933-.784 3.683-2.05 4.95l-1.414-1.414C16.44 14.63 17 13.38 17 12c0-.448-.059-.882-.17-1.295l1.562-1.562zm-2.15-2.8l1.415 1.414-3.724 3.726c.044.165.067.338.067.517 0 1.105-.895 2-2 2s-2-.895-2-2 .895-2 2-2c.179 0 .352.023.517.067l3.726-3.724z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dashboard-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 2c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm3.833 3.337c.237-.166.559-.138.763.067.204.204.23.526.063.76-2.18 3.046-3.38 4.678-3.598 4.897-.586.585-1.536.585-2.122 0-.585-.586-.585-1.536 0-2.122.374-.373 2.005-1.574 4.894-3.602zM17.5 11c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm-11 0c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm2.318-3.596c.39.39.39 1.023 0 1.414-.39.39-1.024.39-1.414 0-.39-.39-.39-1.024 0-1.414.39-.39 1.023-.39 1.414 0zM12 5.5c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "database-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M5 12.5c0 .313.461.858 1.53 1.393C7.914 14.585 9.877 15 12 15c2.123 0 4.086-.415 5.47-1.107 1.069-.535 1.53-1.08 1.53-1.393v-2.171C17.35 11.349 14.827 12 12 12s-5.35-.652-7-1.671V12.5zm14 2.829C17.35 16.349 14.827 17 12 17s-5.35-.652-7-1.671V17.5c0 .313.461.858 1.53 1.393C7.914 19.585 9.877 20 12 20c2.123 0 4.086-.415 5.47-1.107 1.069-.535 1.53-1.08 1.53-1.393v-2.171zM3 17.5v-10C3 5.015 7.03 3 12 3s9 2.015 9 4.5v10c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5zm9-7.5c2.123 0 4.086-.415 5.47-1.107C18.539 8.358 19 7.813 19 7.5c0-.313-.461-.858-1.53-1.393C16.086 5.415 14.123 5 12 5c-2.123 0-4.086.415-5.47 1.107C5.461 6.642 5 7.187 5 7.5c0 .313.461.858 1.53 1.393C7.914 9.585 9.877 10 12 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "database-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 7V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h8zm-6 9v2h5v-2H5zm9 0v2h5v-2h-5zm0-3v2h5v-2h-5zm0-3v2h5v-2h-5zm-9 3v2h5v-2H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "database-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 9.5v3c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5v-3c0 2.485 4.03 4.5 9 4.5s9-2.015 9-4.5zm-18 5c0 2.485 4.03 4.5 9 4.5s9-2.015 9-4.5v3c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5v-3zm9-2.5c-4.97 0-9-2.015-9-4.5S7.03 3 12 3s9 2.015 9 4.5-4.03 4.5-9 4.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "device-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 6h-8a1 1 0 0 0-1 1v13H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3zm-6 2h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "database-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 19V9H4v10h7zm0-12V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h8zm2-2v14h7V5h-7zM5 16h5v2H5v-2zm9 0h5v2h-5v-2zm0-3h5v2h-5v-2zm0-3h5v2h-5v-2zm-9 3h5v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "device-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 8h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5zm-2 0V4H5v14h7V9a1 1 0 0 1 1-1h4zm-3 2v10h6V10h-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "device-recover-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h14zm-1 2H6v16h12V4zm-6 3a5 5 0 0 1 2.628 9.254L12.5 12H15a3 3 0 1 0-3 3l.955 1.909A5 5 0 1 1 12 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dual-sim-1-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 2l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h10zm-2 6h-3v2h1v6h2V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "device-recover-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h14zm-7 5a5 5 0 1 0 .955 9.909L12 15a3 3 0 0 1 0-6c1.598 0 3 1.34 3 3h-2.5l2.128 4.254A5 5 0 0 0 12 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dual-sim-1-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15 2l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h10zm-.829 2H6v16h12V7.829L14.171 4zM13 16h-2v-6h-1V8h3v8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dual-sim-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 2l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h10zm-3 5.5a3 3 0 0 0-2.995 2.824L9 10.5h2a1 1 0 1 1 1.751.66l-.082.083L9 14.547 9 16h6v-2h-2.405l1.412-1.27-.006-.01.008.008A3 3 0 0 0 12 7.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dual-sim-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15 2l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h10zm-.829 2H6v16h12V7.829L14.171 4zM12 7.5a3 3 0 0 1 2.009 5.228l-.008-.008.006.01L12.595 14H15v2H9v-1.453l3.67-3.304A1 1 0 1 0 11 10.5H9a3 3 0 0 1 3-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fingerprint-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 13v1c0 2.77-.664 5.445-1.915 7.846l-.227.42-1.747-.974c1.16-2.08 1.81-4.41 1.882-6.836L15 14v-1h2zm-6-3h2v4l-.005.379a12.941 12.941 0 0 1-2.691 7.549l-.231.29-1.55-1.264a10.944 10.944 0 0 0 2.471-6.588L11 14v-4zm1-4a5 5 0 0 1 5 5h-2a3 3 0 0 0-6 0v3c0 2.235-.82 4.344-2.271 5.977l-.212.23-1.448-1.38a6.969 6.969 0 0 0 1.925-4.524L7 14v-3a5 5 0 0 1 5-5zm0-4a9 9 0 0 1 9 9v3c0 1.698-.202 3.37-.597 4.99l-.139.539-1.93-.526c.392-1.437.613-2.922.658-4.435L19 14v-3A7 7 0 0 0 7.808 5.394L6.383 3.968A8.962 8.962 0 0 1 12 2zM4.968 5.383l1.426 1.425a6.966 6.966 0 0 0-1.39 3.951L5 11 5.004 13c0 1.12-.264 2.203-.762 3.177l-.156.29-1.737-.992c.38-.665.602-1.407.646-2.183L3.004 13v-2a8.94 8.94 0 0 1 1.964-5.617z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fingerprint-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 13v1c0 2.77-.664 5.445-1.915 7.846l-.227.42-1.747-.974c1.16-2.08 1.81-4.41 1.882-6.836L15 14v-1h2zm-6-3h2v4l-.005.379a12.941 12.941 0 0 1-2.691 7.549l-.231.29-1.55-1.264a10.944 10.944 0 0 0 2.471-6.588L11 14v-4zm1-4a5 5 0 0 1 5 5h-2a3 3 0 0 0-6 0v3c0 2.235-.82 4.344-2.271 5.977l-.212.23-1.448-1.38a6.969 6.969 0 0 0 1.925-4.524L7 14v-3a5 5 0 0 1 5-5zm0-4a9 9 0 0 1 9 9v3c0 1.698-.202 3.37-.597 4.99l-.139.539-1.93-.526c.392-1.437.613-2.922.658-4.435L19 14v-3A7 7 0 0 0 7.808 5.394L6.383 3.968A8.962 8.962 0 0 1 12 2zM4.968 5.383l1.426 1.425a6.966 6.966 0 0 0-1.39 3.951L5 11 5.004 13c0 1.12-.264 2.203-.762 3.177l-.156.29-1.737-.992c.38-.665.602-1.407.646-2.183L3.004 13v-2a8.94 8.94 0 0 1 1.964-5.617z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fingerprint-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1a9 9 0 0 1 9 9v4a8.99 8.99 0 0 1-3.81 7.354c.474-1.522.75-3.131.802-4.797L18 16v-2.001h-2V16l-.003.315a15.932 15.932 0 0 1-1.431 6.315 9.045 9.045 0 0 1-3.574.314 12.935 12.935 0 0 0 2.001-6.52L13 16V9h-2v7l-.004.288a10.95 10.95 0 0 1-2.087 6.167 8.98 8.98 0 0 1-2.626-1.504 7.959 7.959 0 0 0 1.71-4.623L8 16v-6l.005-.2a3.978 3.978 0 0 1 .435-1.625l.114-.207-1.445-1.445a5.969 5.969 0 0 0-1.102 3.18L6 10v6l-.004.225a5.968 5.968 0 0 1-1.121 3.273A8.958 8.958 0 0 1 3 14v-4a9 9 0 0 1 9-9zm0 3c-1.196 0-2.31.35-3.246.953l-.23.156 1.444 1.445a3.977 3.977 0 0 1 1.787-.547L12 6l.2.005a4 4 0 0 1 3.795 3.789L16 10v2h2v-2a6 6 0 0 0-6-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gamepad-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 4a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6v-4a6 6 0 0 1 6-6h10zm-7 5H8v2H6v2h1.999L8 15h2l-.001-2H12v-2h-2V9zm8 4h-2v2h2v-2zm-2-4h-2v2h2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fingerprint-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1a9 9 0 0 1 9 9v4a9 9 0 0 1-12.092 8.455c.128-.177.251-.357.369-.542l.17-.28a10.918 10.918 0 0 0 1.55-5.345L11 16V9h2v7a12.96 12.96 0 0 1-.997 5.001 7.026 7.026 0 0 0 2.27-.378c.442-1.361.693-2.808.724-4.31L15 16v-3.001h2V16c0 1.088-.102 2.153-.298 3.185a6.978 6.978 0 0 0 2.294-4.944L19 14v-4A7 7 0 0 0 7.808 4.394L6.383 2.968A8.962 8.962 0 0 1 12 1zm-5 9a5 5 0 1 1 10 0v1h-2v-1a3 3 0 0 0-5.995-.176L9 10v6c0 1.567-.4 3.04-1.104 4.323l-.024.04c-.23.414-.491.808-.782 1.179a9.03 9.03 0 0 1-1.237-.97l-.309-.3A8.97 8.97 0 0 1 3 14v-4c0-2.125.736-4.078 1.968-5.617l1.426 1.425a6.966 6.966 0 0 0-1.39 3.951L5 10v4c0 1.675.588 3.212 1.57 4.417a6.91 6.91 0 0 0 .426-2.176L7 16v-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gamepad-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M17 4a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6v-4a6 6 0 0 1 6-6h10zm0 2H7a4 4 0 0 0-3.995 3.8L3 10v4a4 4 0 0 0 3.8 3.995L7 18h10a4 4 0 0 0 3.995-3.8L21 14v-4a4 4 0 0 0-3.8-3.995L17 6zm-7 3v2h2v2H9.999L10 15H8l-.001-2H6v-2h2V9h2zm8 4v2h-2v-2h2zm-2-4v2h-2V9h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gps-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 16l3 6H9l3-6zm-2.627.255a5 5 0 1 1 5.255 0l-1.356-2.711a2 2 0 1 0-2.544 0l-1.355 2.71zm-2.241 4.482A9.997 9.997 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10a9.997 9.997 0 0 1-5.132 8.737l-1.343-2.688a7 7 0 1 0-7.05 0l-1.343 2.688z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gps-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.132 20.737A9.997 9.997 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10a9.997 9.997 0 0 1-5.132 8.737l-.896-1.791a8 8 0 1 0-7.945 0l-.895 1.791zm1.792-3.584a6 6 0 1 1 6.151 0l-.898-1.797a4 4 0 1 0-4.354 0l-.899 1.797zM12 16l3 6H9l3-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gradienter-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.05 13h2.012a8.001 8.001 0 0 0 15.876 0h2.013c-.502 5.053-4.766 9-9.951 9-5.185 0-9.449-3.947-9.95-9zm0-2C2.55 5.947 6.814 2 12 2s9.449 3.947 9.95 9h-2.012a8.001 8.001 0 0 0-15.876 0H2.049zM12 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gradienter-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM8.126 11H4.062a8.079 8.079 0 0 0 0 2h4.064a4.007 4.007 0 0 1 0-2zm7.748 0a4.007 4.007 0 0 1 0 2h4.064a8.079 8.079 0 0 0 0-2h-4.064zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hard-drive-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1zM5 16v4h14v-4H5zm10 1h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hard-drive-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 14h14V4H5v10zm0 2v4h14v-4H5zM4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm11 15h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hard-drive-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.95 2H20a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.05c.329.033.663.05 1 .05 5.523 0 10-4.477 10-10 0-.337-.017-.671-.05-1zM15 16v2h2v-2h-2zM11.938 2A8 8 0 0 1 3 10.938V3a1 1 0 0 1 1-1h7.938z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hard-drive-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 10.938A8.004 8.004 0 0 0 11.938 4H5v6.938zm0 2.013V20h14V4h-5.05A10.003 10.003 0 0 1 5 12.95zM4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm11 14h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hotspot-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 2v9h7v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h6zm2 5a2 2 0 0 1 2 2h-2V7zm0-3a5 5 0 0 1 5 5h-2a3 3 0 0 0-3-3V4zm0-3a8 8 0 0 1 8 8h-2a6 6 0 0 0-6-6V1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hotspot-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 2v2H7v16h10v-9h2v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h5zm2 5a2 2 0 0 1 2 2h-2V7zm0-3a5 5 0 0 1 5 5h-2a3 3 0 0 0-3-3V4zm0-3a8 8 0 0 1 8 8h-2a6 6 0 0 0-6-6V1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "install-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M9 2v2H5l-.001 10h14L19 4h-4V2h5a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h5zm9.999 14h-14L5 20h14l-.001-4zM17 17v2h-2v-2h2zM13 2v5h3l-4 4-4-4h3V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "keyboard-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 4v2h2V7H5zm0 4v2h2v-2H5zm0 4v2h14v-2H5zm4-4v2h2v-2H9zm0-4v2h2V7H9zm4 0v2h2V7h-2zm4 0v2h2V7h-2zm-4 4v2h2v-2h-2zm4 0v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "keyboard-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 4h2v2H6V7zm0 4h2v2H6v-2zm0 4h12v2H6v-2zm5-4h2v2h-2v-2zm0-4h2v2h-2V7zm5 0h2v2h-2V7zm0 4h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "keyboard-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 17h18v2H3v-2zm0-6h3v3H3v-3zm5 0h3v3H8v-3zM3 5h3v3H3V5zm10 0h3v3h-3V5zm5 0h3v3h-3V5zm-5 6h3v3h-3v-3zm5 0h3v3h-3v-3zM8 5h3v3H8V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "keyboard-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 17h18v2H3v-2zm0-6h3v3H3v-3zm5 0h3v3H8v-3zM3 5h3v3H3V5zm10 0h3v3h-3V5zm5 0h3v3h-3V5zm-5 6h3v3h-3v-3zm5 0h3v3h-3v-3zM8 5h3v3H8V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mac-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 18v2l2 1v1H8l-.004-.996L10 20v-2H2.992A.998.998 0 0 1 2 16.993V4.007C2 3.451 2.455 3 2.992 3h18.016c.548 0 .992.449.992 1.007v12.986c0 .556-.455 1.007-.992 1.007H14zM4 14v2h16v-2H4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "install-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 2v5H8l4 4 4-4h-3V2h7a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h7zm8 14H5v4h14v-4zm-2 1v2h-2v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mac-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 18v2l2 1v1H8l-.004-.996L10 20v-2H2.992A.998.998 0 0 1 2 16.993V4.007C2 3.451 2.455 3 2.992 3h18.016c.548 0 .992.449.992 1.007v12.986c0 .556-.455 1.007-.992 1.007H14zM4 5v9h16V5H4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "macbook-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 4.007C2 3.45 2.455 3 2.992 3h18.016c.548 0 .992.45.992 1.007V17H2V4.007zM1 19h22v2H1v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "macbook-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v11h16V5H4zm-2-.993C2 3.451 2.455 3 2.992 3h18.016c.548 0 .992.449.992 1.007V18H2V4.007zM1 19h22v2H1v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mouse-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.141 2h1.718c2.014 0 3.094.278 4.072.801a5.452 5.452 0 0 1 2.268 2.268c.523.978.801 2.058.801 4.072v5.718c0 2.014-.278 3.094-.801 4.072a5.452 5.452 0 0 1-2.268 2.268c-.978.523-2.058.801-4.072.801H11.14c-2.014 0-3.094-.278-4.072-.801a5.452 5.452 0 0 1-2.268-2.268C4.278 17.953 4 16.873 4 14.859V9.14c0-2.014.278-3.094.801-4.072A5.452 5.452 0 0 1 7.07 2.801C8.047 2.278 9.127 2 11.141 2zM11 6v5h2V6h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 16.42v3.536a1 1 0 0 1-.93.998c-.437.03-.794.046-1.07.046-8.837 0-16-7.163-16-16 0-.276.015-.633.046-1.07A1 1 0 0 1 4.044 3H7.58a.5.5 0 0 1 .498.45c.023.23.044.413.064.552A13.901 13.901 0 0 0 9.35 8.003c.095.2.033.439-.147.567l-2.158 1.542a13.047 13.047 0 0 0 6.844 6.844l1.54-2.154a.462.462 0 0 1 .573-.149 13.901 13.901 0 0 0 4 1.205c.139.02.322.042.55.064a.5.5 0 0 1 .449.498z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mouse-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.141 4c-1.582 0-2.387.169-3.128.565a3.453 3.453 0 0 0-1.448 1.448C6.169 6.753 6 7.559 6 9.14v5.718c0 1.582.169 2.387.565 3.128.337.63.818 1.111 1.448 1.448.74.396 1.546.565 3.128.565h1.718c1.582 0 2.387-.169 3.128-.565a3.453 3.453 0 0 0 1.448-1.448c.396-.74.565-1.546.565-3.128V9.14c0-1.582-.169-2.387-.565-3.128a3.453 3.453 0 0 0-1.448-1.448C15.247 4.169 14.441 4 12.86 4H11.14zm0-2h1.718c2.014 0 3.094.278 4.072.801a5.452 5.452 0 0 1 2.268 2.268c.523.978.801 2.058.801 4.072v5.718c0 2.014-.278 3.094-.801 4.072a5.452 5.452 0 0 1-2.268 2.268c-.978.523-2.058.801-4.072.801H11.14c-2.014 0-3.094-.278-4.072-.801a5.452 5.452 0 0 1-2.268-2.268C4.278 17.953 4 16.873 4 14.859V9.14c0-2.014.278-3.094.801-4.072A5.452 5.452 0 0 1 7.07 2.801C8.047 2.278 9.127 2 11.141 2zM11 6h2v5h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-find-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2a1 1 0 0 1 1 1v8.529A6 6 0 0 0 9 16c0 3.238 2.76 6 6 6H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zm-3 10a4 4 0 0 1 3.446 6.032l2.21 2.21-1.413 1.415-2.211-2.21A4 4 0 1 1 15 12zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-find-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2a1 1 0 0 1 1 1v8h-2V4H7v16h4v2H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zm-3 10a4 4 0 0 1 3.446 6.032l2.21 2.21-1.413 1.415-2.212-2.21A4 4 0 1 1 15 12zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-lock-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2a1 1 0 0 1 1 1l.001 7.1A5.002 5.002 0 0 0 13.1 14H12v8H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zm0 10a3 3 0 0 1 3 3v1h1v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-5h1v-1a3 3 0 0 1 3-3zm0 2c-.513 0-1 .45-1 1v1h2v-1a1 1 0 0 0-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-lock-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2a1 1 0 0 1 1 1v7h-2V4H7v16h5v2H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zm0 10a3 3 0 0 1 3 3v1h1v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-5h1v-1a3 3 0 0 1 3-3zm2 6h-4v2h4v-2zm-2-4c-.508 0-1 .45-1 1v1h2v-1a1 1 0 0 0-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "qr-code-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 17v-1h-3v-3h3v2h2v2h-1v2h-2v2h-2v-3h2v-1h1zm5 4h-4v-2h2v-2h2v4zM3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v2h-3v-2zM6 6h2v2H6V6zm0 10h2v2H6v-2zM16 6h2v2h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "qr-scan-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 3h6v6h-6V3zM9 3v6H3V3h6zm6 18v-6h6v6h-6zm-6 0H3v-6h6v6zM3 11h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M9.366 10.682a10.556 10.556 0 0 0 3.952 3.952l.884-1.238a1 1 0 0 1 1.294-.296 11.422 11.422 0 0 0 4.583 1.364 1 1 0 0 1 .921.997v4.462a1 1 0 0 1-.898.995c-.53.055-1.064.082-1.602.082C9.94 21 3 14.06 3 5.5c0-.538.027-1.072.082-1.602A1 1 0 0 1 4.077 3h4.462a1 1 0 0 1 .997.921A11.422 11.422 0 0 0 10.9 8.504a1 1 0 0 1-.296 1.294l-1.238.884zm-2.522-.657l1.9-1.357A13.41 13.41 0 0 1 7.647 5H5.01c-.006.166-.009.333-.009.5C5 12.956 11.044 19 18.5 19c.167 0 .334-.003.5-.01v-2.637a13.41 13.41 0 0 1-3.668-1.097l-1.357 1.9a12.442 12.442 0 0 1-1.588-.75l-.058-.033a12.556 12.556 0 0 1-4.702-4.702l-.033-.058a12.442 12.442 0 0 1-.75-1.588z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "qr-scan-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 3h6v5h-2V5h-4V3zM9 3v2H5v3H3V3h6zm6 18v-2h4v-3h2v5h-6zm-6 0H3v-5h2v3h4v2zM3 11h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "qr-code-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 17v-1h-3v-3h3v2h2v2h-1v2h-2v2h-2v-3h2v-1h1zm5 4h-4v-2h2v-2h2v4zM3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm15 0h3v2h-3v-2zM6 6v2h2V6H6zm0 10v2h2v-2H6zM16 6v2h2V6h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "qr-scan-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 15v5.007a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 20.007V15h18zM2 11h20v2H2v-2zm19-2H3V3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.445.993.993V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "qr-scan-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 16v5H3v-5h2v3h14v-3h2zM3 11h18v2H3v-2zm18-3h-2V5H5v3H3V3h18v5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "radar-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.368 4.398l-3.484 6.035 1.732 1L16.1 5.398c4.17 2.772 6.306 7.08 4.56 10.102-1.86 3.222-7.189 3.355-11.91.63C4.029 13.402 1.48 8.721 3.34 5.5c1.745-3.023 6.543-3.327 11.028-1.102zm1.516-2.625l1.732 1-1.5 2.598-1.732-1 1.5-2.598zM6.732 20H17v2H5.017a.995.995 0 0 1-.883-.5 1.005 1.005 0 0 1 0-1l2.25-3.897 1.732 1L6.732 20z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "radar-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.506 3.623l-1.023 1.772c-2.91-.879-5.514-.45-6.411 1.105-1.178 2.04.79 5.652 4.678 7.897s8 2.142 9.178.103c.898-1.555-.033-4.024-2.249-6.105l1.023-1.772c3.082 2.709 4.463 6.27 2.958 8.877-1.86 3.222-7.189 3.355-11.91.63C4.029 13.402 1.48 8.721 3.34 5.5c1.505-2.607 5.28-3.192 9.166-1.877zm3.378-1.85l1.732 1-5 8.66-1.732-1 5-8.66zM6.732 20H17v2H5.017a.995.995 0 0 1-.883-.5 1.005 1.005 0 0 1 0-1l2.25-3.897 1.732 1L6.732 20z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "remote-control-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zm-3 13h-2v2h2v-2zm-4 0H9v2h2v-2zm2-9h-2v2H9v2h1.999L11 12h2l-.001-2H15V8h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "remote-control-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M18 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zm-1 2H7v16h10V4zm-2 11v2h-2v-2h2zm-4 0v2H9v-2h2zm2-9v2h2v2h-2.001L13 12h-2l-.001-2H9V8h2V6h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "remote-control-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 12a1 1 0 0 1 1 1v9H6v-9a1 1 0 0 1 1-1h10zm-7 2H8v2h2v-2zm2-8a6 6 0 0 1 5.368 3.316l-1.79.895a4 4 0 0 0-7.157 0l-1.789-.895A6 6 0 0 1 12 6zm0-4a10 10 0 0 1 8.946 5.527l-1.789.895A8 8 0 0 0 12 4a8 8 0 0 0-7.157 4.422l-1.79-.895A10 10 0 0 1 12 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "remote-control-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 12a1 1 0 0 1 1 1v9h-2v-8H8v8H6v-9a1 1 0 0 1 1-1h10zm-5 4v2h-2v-2h2zm0-10a6 6 0 0 1 5.368 3.316l-1.79.895a4 4 0 0 0-7.157 0l-1.789-.895A6 6 0 0 1 12 6zm0-4a10 10 0 0 1 8.946 5.527l-1.789.895A8 8 0 0 0 12 4a8 8 0 0 0-7.157 4.422l-1.79-.895A10 10 0 0 1 12 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "restart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm4.82-4.924a7 7 0 1 0-1.852 1.266l-.975-1.755A5 5 0 1 1 17 12h-3l2.82 5.076z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "restart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.537 19.567A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10c0 2.136-.67 4.116-1.81 5.74L17 12h3a8 8 0 1 0-2.46 5.772l.997 1.795z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rotate-lock-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.811 5.741L17 12h3a8 8 0 1 0-2.46 5.772l.998 1.795A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12S6.477 2 12 2zm0 5a3 3 0 0 1 3 3v1h1v5H8v-5h1v-1a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-.993.883L11 10v1h2v-1a1 1 0 0 0-.883-.993L12 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rotate-lock-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.811 5.741L17 12h3a8 8 0 1 0-2.46 5.772l.998 1.795A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12S6.477 2 12 2zm0 5a3 3 0 0 1 3 3v1h1v5H8v-5h1v-1a3 3 0 0 1 3-3zm2 6h-4v1h4v-1zm-2-4a1 1 0 0 0-.993.883L11 10v1h2v-1a1 1 0 0 0-.883-.993L12 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "router-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 14v-3h2v3h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h5zM2.51 8.837C3.835 4.864 7.584 2 12 2s8.166 2.864 9.49 6.837l-1.898.632a8.003 8.003 0 0 0-15.184 0l-1.897-.632zm3.796 1.265a6.003 6.003 0 0 1 11.388 0l-1.898.633a4.002 4.002 0 0 0-7.592 0l-1.898-.633z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "router-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 14v-3h2v3h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h5zM2.51 8.837C3.835 4.864 7.584 2 12 2s8.166 2.864 9.49 6.837l-1.898.632a8.003 8.003 0 0 0-15.184 0l-1.897-.632zm3.796 1.265a6.003 6.003 0 0 1 11.388 0l-1.898.633a4.002 4.002 0 0 0-7.592 0l-1.898-.633zM7 16v4h10v-4H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rss-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3c9.941 0 18 8.059 18 18h-3c0-8.284-6.716-15-15-15V3zm0 7c6.075 0 11 4.925 11 11h-3a8 8 0 0 0-8-8v-3zm0 7a4 4 0 0 1 4 4H3v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rss-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 17a4 4 0 0 1 4 4H3v-4zm0-7c6.075 0 11 4.925 11 11h-2a9 9 0 0 0-9-9v-2zm0-7c9.941 0 18 8.059 18 18h-2c0-8.837-7.163-16-16-16V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "save-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h13l3.707 3.707a1 1 0 0 1 .293.707V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 5v4h10V5H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "save-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V7.828L16.172 5H5zM4 3h13l3.707 3.707a1 1 0 0 1 .293.707V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM6 6h9v4H6V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "save-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h14l2.707 2.707a1 1 0 0 1 .293.707V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 1v5h9V4H7zm-1 8v7h12v-7H6zm7-7h2v3h-2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "save-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 19h1V6.828L17.172 5H16v4H7V5H5v14h1v-7h12v7zM4 3h14l2.707 2.707a1 1 0 0 1 .293.707V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4 11v5h8v-5H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "save-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 21v-8H6v8H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h13l4 4v13a1 1 0 0 1-1 1h-2zm-2 0H8v-6h8v6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "save-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 19v-6h10v6h2V7.828L16.172 5H5v14h2zM4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5 12v4h6v-4H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scan-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.257 5.671l2.137 2.137a7 7 0 1 0 1.414-1.414L5.67 4.257A9.959 9.959 0 0 1 12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12c0-2.401.846-4.605 2.257-6.329zm3.571 3.572L12 13.414 13.414 12 9.243 7.828a5 5 0 1 1-1.414 1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scan-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.671 4.257L13.414 12 12 13.414 8.554 9.968a4 4 0 1 0 3.697-1.96l-1.805-1.805a6 6 0 1 1-3.337 2.32L5.68 7.094a8 8 0 1 0 3.196-2.461L7.374 3.132A9.957 9.957 0 0 1 12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12a9.98 9.98 0 0 1 3.671-7.743z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scan-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.257 5.671L12 13.414 13.414 12 5.671 4.257A9.959 9.959 0 0 1 12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12c0-2.401.846-4.605 2.257-6.329z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "scan-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.671 4.257L13.414 12 12 13.414l-6.32-6.32a8 8 0 1 0 3.706-2.658L7.85 2.9A9.963 9.963 0 0 1 12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12a9.98 9.98 0 0 1 3.671-7.743z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sd-card-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.293 6.707L9 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.414a1 1 0 0 1 .293-.707zM15 5v4h2V5h-2zm-3 0v4h2V5h-2zM9 5v4h2V5H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sd-card-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 7.828V20h12V4H9.828L6 7.828zm-1.707-1.12L9 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.414a1 1 0 0 1 .293-.707zM15 5h2v4h-2V5zm-3 0h2v4h-2V5zM9 6h2v3H9V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sd-card-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.58a1 1 0 0 1 .292-.706l1.562-1.568A.5.5 0 0 0 6 9.793V3a1 1 0 0 1 1-1zm8 2v4h2V4h-2zm-3 0v4h2V4h-2zM9 4v4h2V4H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sd-card-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 4v5.793a2.5 2.5 0 0 1-.73 1.765L6 12.833V20h12V4H8zM7 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.58a1 1 0 0 1 .292-.706l1.562-1.568A.5.5 0 0 0 6 9.793V3a1 1 0 0 1 1-1zm8 3h2v4h-2V5zm-3 0h2v4h-2V5zM9 5h2v4H9V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sensor-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 8v2h12V8h-3V2h2v4h5v2h-2v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8H2V6h5V2h2v6H6zm7-6v6h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sensor-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 8v11h12V8h-3V2h2v4h5v2h-2v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8H2V6h5V2h2v6H6zm7-6v6h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "server-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v7H3V4a1 1 0 0 1 1-1zM3 13h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7zm4 3v2h3v-2H7zM7 6v2h3V6H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shut-down-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 2.05V12h2V2.05c5.053.501 9 4.765 9 9.95 0 5.523-4.477 10-10 10S2 17.523 2 12c0-5.185 3.947-9.449 9-9.95z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "server-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 11h14V5H5v6zm16-7v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1zm-2 9H5v6h14v-6zM7 15h3v2H7v-2zm0-8h3v2H7V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shut-down-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.265 3.807l1.147 1.639a8 8 0 1 0 9.176 0l1.147-1.639A9.988 9.988 0 0 1 22 12c0 5.523-4.477 10-10 10S2 17.523 2 12a9.988 9.988 0 0 1 4.265-8.193zM11 12V2h2v10h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-1-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 2c-3.028 0-5.923.842-8.42 2.392l5.108 6.324C9.698 13.256 10.818 13 12 13c1.181 0 2.303.256 3.312.716L20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-1-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 12c-.693 0-1.367.117-2 .34l2 2.477 2-2.477c-.63-.22-1.307-.34-2-.34zm0-10c-3.028 0-5.923.842-8.42 2.392l5.108 6.324C9.698 13.256 10.818 13 12 13c1.181 0 2.303.256 3.312.716L20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 2c-3.028 0-5.923.842-8.42 2.392l3.178 3.935C8.316 10.481 10.102 10 12 10c1.898 0 3.683.48 5.241 1.327L20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 9c-1.42 0-2.764.33-3.959.915L12 17.817l3.958-4.902C14.764 12.329 13.42 12 12 12zm0-7c-3.028 0-5.923.842-8.42 2.392l3.178 3.935C8.316 10.481 10.102 10 12 10c1.898 0 3.683.48 5.241 1.327L20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 2c-3.028 0-5.923.842-8.42 2.392l1.904 2.357C7.4 8.637 9.625 8 12 8s4.6.637 6.516 1.749L20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 7c-1.898 0-3.683.48-5.241 1.327l5.24 6.49 5.242-6.49C15.683 10.48 13.898 10 12 10zm0-5c-3.028 0-5.923.842-8.42 2.392l1.904 2.357C7.4 8.637 9.625 8 12 8s4.6.637 6.516 1.749L20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-error-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L22.498 8H18v5.571L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm10 16v2h-2v-2h2zm0-9v7h-2v-7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-error-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996l-1.257 1.556C19.306 6.331 15.808 5 12 5c-3.089 0-5.973.875-8.419 2.392L12 17.817l6-7.429v3.183L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm10 16v2h-2v-2h2zm0-9v7h-2v-7h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c4.284 0 8.22 1.497 11.31 3.996L12 21 .69 6.997C3.78 4.497 7.714 3 12 3zm0 2c-3.028 0-5.923.842-8.42 2.392L12 17.817 20.42 7.39C17.922 5.841 15.027 5 12 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sim-card-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 2h10l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 16v-8H8v2h3v6h2zm-5-5v2h2v-2H8zm6 0v2h2v-2h-2zm0-3v2h2v-2h-2zm-6 6v2h2v-2H8zm6 0v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M2.808 1.393l17.677 17.678-1.414 1.414-3.683-3.683L12 21 .69 6.997c.914-.74 1.902-1.391 2.95-1.942L1.394 2.808l1.415-1.415zM12 3c4.284 0 8.22 1.497 11.31 3.996l-5.407 6.693L7.724 3.511C9.094 3.177 10.527 3 12 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-wifi-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M2.808 1.393l17.677 17.678-1.414 1.414-3.683-3.682L12 21 .69 6.997c.914-.74 1.902-1.391 2.95-1.942L1.394 2.808l1.415-1.415zm.771 5.999L12 17.817l1.967-2.437-8.835-8.836c-.532.254-1.05.536-1.552.848zM12 3c4.284 0 8.22 1.497 11.31 3.996l-5.407 6.693-1.422-1.422 3.939-4.876C17.922 5.841 15.027 5 12 5c-.873 0-1.735.07-2.58.207L7.725 3.51C9.094 3.177 10.527 3 12 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sim-card-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 4v16h12V7.828L14.172 4H6zM5 2h10l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 8v8h-2v-6H8v-2h5zm-5 3h2v2H8v-2zm6 0h2v2h-2v-2zm0-3h2v2h-2v-2zm-6 6h2v2H8v-2zm6 0h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sim-card-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 2h10l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 10v6h8v-6H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "smartphone-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm6 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sim-card-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 4v16h12V7.828L14.172 4H6zM5 2h10l4.707 4.707a1 1 0 0 1 .293.707V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm3 10h8v6H8v-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "smartphone-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 4v16h10V4H7zM6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm6 15a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tablet-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm7 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tablet-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 4v16h12V4H6zM5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm7 15a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tv-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 4c0-.552.455-1 .992-1h18.016c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H2.992A.994.994 0 0 1 2 18V4zm3 16h14v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tv-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 4c0-.552.455-1 .992-1h18.016c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H2.992A.994.994 0 0 1 2 18V4zm2 1v12h16V5H4zm1 15h14v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tv-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.414 5h5.594c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H2.992A.994.994 0 0 1 2 20V6c0-.552.455-1 .992-1h5.594L6.05 2.464 7.464 1.05 11.414 5h1.172l3.95-3.95 1.414 1.414L15.414 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tv-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.414 5h5.594c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H2.992A.994.994 0 0 1 2 20V6c0-.552.455-1 .992-1h5.594L6.05 2.464 7.464 1.05 11.414 5h1.172l3.95-3.95 1.414 1.414L15.414 5zM4 7v12h16V7H4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "u-disk-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 12H5v8h14v-8zM5 10V2h14v8h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h10V4H7v6zm2-4h2v2H9V6zm4 0h2v2h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "u-disk-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 12h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM5 2h14v8H5V2zm4 3v2h2V5H9zm4 0v2h2V5h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "usb-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 1l3 5h-2v7.381l3-1.499-.001-.882H15V7h4v4h-1.001L18 13.118l-5 2.5v1.553c1.166.412 2 1.523 2 2.829 0 1.657-1.343 3-3 3s-3-1.343-3-3c0-1.187.69-2.213 1.69-2.7L6 14l-.001-2.268C5.402 11.386 5 10.74 5 10c0-1.105.895-2 2-2s2 .895 2 2c0 .74-.402 1.387-1 1.732V13l3 2.086V6H9l3-5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "usb-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 1l3 5h-2v7.381l3-1.499-.001-.882H15V7h4v4h-1.001L18 13.118l-5 2.5v1.553c1.166.412 2 1.523 2 2.829 0 1.657-1.343 3-3 3s-3-1.343-3-3c0-1.187.69-2.213 1.69-2.7L6 14l-.001-2.268C5.402 11.386 5 10.74 5 10c0-1.105.895-2 2-2s2 .895 2 2c0 .74-.402 1.387-1 1.732V13l3 2.086V6H9l3-5zm0 18c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "uninstall-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16zm-1 14H5v4h14v-4zm-2 1v2h-2v-2h2zM12 2L8 6h3v5h2V6h3l-4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M.69 6.997A17.925 17.925 0 0 1 12 3c4.285 0 8.22 1.497 11.31 3.997L21.425 9.33A14.937 14.937 0 0 0 12 6C8.43 6 5.15 7.248 2.575 9.33L.69 6.997zm3.141 3.89A12.946 12.946 0 0 1 12 8c3.094 0 5.936 1.081 8.169 2.886l-1.885 2.334A9.958 9.958 0 0 0 12 11c-2.38 0-4.566.832-6.284 2.22l-1.885-2.334zm3.142 3.89A7.967 7.967 0 0 1 12 13c1.904 0 3.653.665 5.027 1.776l-1.885 2.334A4.98 4.98 0 0 0 12 16a4.98 4.98 0 0 0-3.142 1.11l-1.885-2.334zm3.142 3.89A2.987 2.987 0 0 1 12 18c.714 0 1.37.25 1.885.666L12 21l-1.885-2.334z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "uninstall-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M8 2v2H5l-.001 10h14L19 4h-3V2h4a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h4zm10.999 14h-14L5 20h14l-.001-4zM17 17v2h-2v-2h2zM12 2l4 4h-3v5h-2V6H8l4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M.69 6.997A17.925 17.925 0 0 1 12 3c4.285 0 8.22 1.497 11.31 3.997l-1.256 1.556A15.933 15.933 0 0 0 12 5C8.191 5 4.694 6.33 1.946 8.553L.69 6.997zm3.141 3.89A12.946 12.946 0 0 1 12 8c3.094 0 5.936 1.081 8.169 2.886l-1.257 1.556A10.954 10.954 0 0 0 12 10c-2.618 0-5.023.915-6.912 2.442l-1.257-1.556zm3.142 3.89A7.967 7.967 0 0 1 12 13c1.904 0 3.653.665 5.027 1.776l-1.257 1.556A5.975 5.975 0 0 0 12 15c-1.428 0-2.74.499-3.77 1.332l-1.257-1.556zm3.142 3.89A2.987 2.987 0 0 1 12 18c.714 0 1.37.25 1.885.666L12 21l-1.885-2.334z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wifi-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 18c.714 0 1.37.25 1.886.666L12 21l-1.886-2.334A2.987 2.987 0 0 1 12 18zM2.808 1.393l17.677 17.678-1.414 1.414-3.682-3.68-.247.306A4.98 4.98 0 0 0 12 16a4.98 4.98 0 0 0-3.141 1.11l-1.885-2.334a7.963 7.963 0 0 1 4.622-1.766l-1.773-1.772a9.963 9.963 0 0 0-4.106 1.982L3.83 10.887A12.984 12.984 0 0 1 7.416 8.83L5.885 7.3a15 15 0 0 0-3.31 2.031L.689 6.997c.915-.74 1.903-1.391 2.952-1.942L1.393 2.808l1.415-1.415zM16.084 11.87l-3.868-3.867L12 8c3.095 0 5.937 1.081 8.17 2.887l-1.886 2.334a10 10 0 0 0-2.2-1.352zM12 3c4.285 0 8.22 1.497 11.31 3.997L21.426 9.33A14.937 14.937 0 0 0 12 6c-.572 0-1.136.032-1.69.094L7.723 3.511C9.094 3.177 10.527 3 12 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wifi-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 18c.714 0 1.37.25 1.886.666L12 21l-1.886-2.334A2.987 2.987 0 0 1 12 18zM2.808 1.393l17.677 17.678-1.414 1.414-5.18-5.18A5.994 5.994 0 0 0 12 15c-1.428 0-2.74.499-3.77 1.332l-1.256-1.556a7.963 7.963 0 0 1 4.622-1.766L9 10.414a10.969 10.969 0 0 0-3.912 2.029L3.83 10.887A12.984 12.984 0 0 1 7.416 8.83L5.132 6.545a16.009 16.009 0 0 0-3.185 2.007L.689 6.997c.915-.74 1.903-1.391 2.952-1.942L1.393 2.808l1.415-1.415zM14.5 10.285l-2.284-2.283L12 8c3.095 0 5.937 1.081 8.17 2.887l-1.258 1.556a10.96 10.96 0 0 0-4.412-2.158zM12 3c4.285 0 8.22 1.497 11.31 3.997l-1.257 1.555A15.933 15.933 0 0 0 12 5c-.878 0-1.74.07-2.58.207L7.725 3.51C9.094 3.177 10.527 3 12 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wireless-charging-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M3.929 4.929l1.414 1.414C3.895 7.791 3 9.791 3 12c0 2.21.895 4.21 2.343 5.657L3.93 19.07C2.119 17.261 1 14.761 1 12s1.12-5.261 2.929-7.071zm16.142 0C21.881 6.739 23 9.239 23 12s-1.12 5.262-2.929 7.071l-1.414-1.414C20.105 16.209 21 14.209 21 12s-.895-4.208-2.342-5.656L20.07 4.93zM13 5v6h3l-5 8v-6H8l5-8zM6.757 7.757l1.415 1.415C7.448 9.895 7 10.895 7 12c0 1.105.448 2.105 1.172 2.828l-1.415 1.415C5.672 15.157 5 13.657 5 12c0-1.657.672-3.157 1.757-4.243zm10.487.001C18.329 8.844 19 10.344 19 12c0 1.657-.672 3.157-1.757 4.243l-1.415-1.415C16.552 14.105 17 13.105 17 12c0-1.104-.447-2.104-1.17-2.827l1.414-1.415z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wireless-charging-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M3.929 4.929l1.414 1.414C3.895 7.791 3 9.791 3 12c0 2.21.895 4.21 2.343 5.657L3.93 19.07C2.119 17.261 1 14.761 1 12s1.12-5.261 2.929-7.071zm16.142 0C21.881 6.739 23 9.239 23 12s-1.12 5.262-2.929 7.071l-1.414-1.414C20.105 16.209 21 14.209 21 12s-.895-4.208-2.342-5.656L20.07 4.93zM13 5v6h3l-5 8v-6H8l5-8zM6.757 7.757l1.415 1.415C7.448 9.895 7 10.895 7 12c0 1.105.448 2.105 1.172 2.828l-1.415 1.415C5.672 15.157 5 13.657 5 12c0-1.657.672-3.157 1.757-4.243zm10.487.001C18.329 8.844 19 10.344 19 12c0 1.657-.672 3.157-1.757 4.243l-1.415-1.415C16.552 14.105 17 13.105 17 12c0-1.104-.447-2.104-1.17-2.827l1.414-1.415z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "document",
            iconsvg: [
                {
                    name: "article-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM7 6v4h4V6H7zm0 6v2h10v-2H7zm0 4v2h10v-2H7zm6-9v2h4V7h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "article-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2V4H5v16h14zM7 6h4v4H7V6zm0 6h10v2H7v-2zm0 4h10v2H7v-2zm6-9h4v2h-4V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bill-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM8 9v2h8V9H8zm0 4v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bill-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2V4H5v16h14zM8 9h8v2H8V9zm0 4h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 18H6a1 1 0 0 0 0 2h15v2H6a3 3 0 0 1-3-3V4a2 2 0 0 1 2-2h16v16zm-5-9V7H8v2h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 18H6a1 1 0 0 0 0 2h15v2H6a3 3 0 0 1-3-3V4a2 2 0 0 1 2-2h16v16zM5 16.05c.162-.033.329-.05.5-.05H19V4H5v12.05zM16 9H8V7h8v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 18.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A3.5 3.5 0 0 1 3 18.5zM19 20v-3H6.5a1.5 1.5 0 0 0 0 3H19zM5 15.337A3.486 3.486 0 0 1 6.5 15H19V4H6a1 1 0 0 0-1 1v10.337z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 4H7a2 2 0 1 0 0 4h14v13a1 1 0 0 1-1 1H7a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h13a1 1 0 0 1 1 1v1zm-1 3H7a1 1 0 1 1 0-2h13v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H6.5A3.5 3.5 0 0 1 3 18.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2v-3H6.5a1.5 1.5 0 0 0 0 3H19z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 4H7a2 2 0 1 0 0 4h14v13a1 1 0 0 1-1 1H7a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h13a1 1 0 0 1 1 1v1zM5 18a2 2 0 0 0 2 2h12V10H7a3.982 3.982 0 0 1-2-.535V18zM20 7H7a1 1 0 1 1 0-2h13v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-mark-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H6.5A3.5 3.5 0 0 1 3 18.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2v-3H6.5a1.5 1.5 0 0 0 0 3H19zM10 4v8l3.5-2 3.5 2V4h-7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-open-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 21h-8V6a3 3 0 0 1 3-3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1zm-10 0H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a3 3 0 0 1 3 3v15zm0 0h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-read-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM11 5H4v14h7V5zm2 0v14h7V5h-7zm1 2h5v2h-5V7zm0 3h5v2h-5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-mark-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 18.5V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5A3.5 3.5 0 0 1 3 18.5zM19 20v-3H6.5a1.5 1.5 0 0 0 0 3H19zM10 4H6a1 1 0 0 0-1 1v10.337A3.486 3.486 0 0 1 6.5 15H19V4h-2v8l-3.5-2-3.5 2V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "booklet-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20.005 2C21.107 2 22 2.898 22 3.99v16.02c0 1.099-.893 1.99-1.995 1.99H4v-4H2v-2h2v-3H2v-2h2V8H2V6h2V2h16.005zM8 4H6v16h2V4zm12 0H10v16h10V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-open-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 21v2h-2v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6a3.99 3.99 0 0 1 3 1.354A3.99 3.99 0 0 1 15 3h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-8zm7-2V5h-5a2 2 0 0 0-2 2v12h7zm-9 0V7a2 2 0 0 0-2-2H4v14h7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clipboard-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 4v4h12V4h2.007c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 21.007V4.993C3 4.445 3.445 4 3.993 4H6zm2-2h8v4H8V2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "book-read-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM12 5v14h8V5h-8zm1 2h6v2h-6V7zm0 3h6v2h-6v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "booklet-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 2v20H4v-4H2v-2h2v-3H2v-2h2V8H2V6h2V2h4zm12.005 0C21.107 2 22 2.898 22 3.99v16.02c0 1.099-.893 1.99-1.995 1.99H10V2h10.005z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clipboard-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 4V2h10v2h3.007c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 21.007V4.993C3 4.445 3.445 4 3.993 4H7zm0 2H5v14h14V6h-2v2H7V6zm2-2v2h6V4H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contacts-book-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2v-2H6a1 1 0 0 0 0 2h13zM5 16.17c.313-.11.65-.17 1-.17h13V4H6a1 1 0 0 0-1 1v11.17zM12 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-3 4a3 3 0 0 1 6 0H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contacts-book-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 2h16.005C20.107 2 21 2.898 21 3.99v16.02c0 1.099-.893 1.99-1.995 1.99H3V2zm4 2H5v16h2V4zm2 16h10V4H9v16zm2-4a3 3 0 0 1 6 0h-6zm3-4a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-6h2v4h-2V6zm0 6h2v4h-2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contacts-book-upload-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 2v20H3V2h4zm12.005 0C20.107 2 21 2.898 21 3.99v16.02c0 1.099-.893 1.99-1.995 1.99H9V2h10.005zM15 8l-4 4h3v4h2v-4h3l-4-4zm9 4v4h-2v-4h2zm0-6v4h-2V6h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contacts-book-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 2v20H3V2h4zm2 0h10.005C20.107 2 21 2.898 21 3.99v16.02c0 1.099-.893 1.99-1.995 1.99H9V2zm13 4h2v4h-2V6zm0 6h2v4h-2v-4zm-7 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 4h6a3 3 0 0 0-6 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "draft-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M20 2c.552 0 1 .448 1 1v3.757l-8.999 9-.006 4.238 4.246.006L21 15.242V21c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h16zm1.778 6.808l1.414 1.414L15.414 18l-1.416-.002.002-1.412 7.778-7.778zM12 12H7v2h5v-2zm3-4H7v2h8V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contacts-book-upload-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.005 2C20.107 2 21 2.898 21 3.99v16.02c0 1.099-.893 1.99-1.995 1.99H3V2h16.005zM7 4H5v16h2V4zm12 0H9v16h10V4zm-5 4l4 4h-3v4h-2v-4h-3l4-4zm10 4v4h-2v-4h2zm0-6v4h-2V6h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "contacts-book-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2v-2H6a1 1 0 0 0 0 2h13zm-7-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 4h6a3 3 0 0 0-6 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 9h6a1 1 0 0 0 1-1V2h10.002c.551 0 .998.455.998.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V9zm0-2l5-4.997V7H3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 8v12.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.449 2 4.002 2h10.995L21 8zm-2 1h-5V4H5v16h14V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "draft-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M20 2c.552 0 1 .448 1 1v3.757l-2 2V4H5v16h14v-2.758l2-2V21c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h16zm1.778 6.808l1.414 1.414L15.414 18l-1.416-.002.002-1.412 7.778-7.778zM13 12v2H8v-2h5zm3-4v2H8V8h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 8l6.003-6h10.995C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8zm7-4v5H5v11h14V4h-9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-5 9H8v2h3v3h2v-3h3v-2h-3V8h-2v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 16l-6.003 6H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v13zm-2-1V4H5v16h9v-5h5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 15h-7v7H3.998C3.447 22 3 21.545 3 21.008V2.992C3 2.444 3.445 2 3.993 2h16.014A1 1 0 0 1 21 3.007V15zm0 2l-5 4.997V17h5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM11 11V8h2v3h3v2h-3v3h-2v-3H8v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 9v11.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.447 2 3.998 2H14v6a1 1 0 0 0 1 1h6zm0-2h-5V2.003L21 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-chart-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-4 6a4 4 0 1 0 4 4h-4V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-chart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-5 5v10h2V7h-2zm4 4v6h2v-6h-2zm-8 2v4h2v-4H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-chart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 7h2v10h-2V7zm4 4h2v6h-2v-6zm-8 2h2v4H7v-4zm8-9H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-cloud-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.997 2L21 8l.001 4.26A5.466 5.466 0 0 0 17.5 11l-.221.004a5.503 5.503 0 0 0-5.127 4.205l-.016.074-.03.02A4.75 4.75 0 0 0 10.878 22L3.993 22a.993.993 0 0 1-.986-.876L3 21.008V2.992c0-.498.387-.927.885-.985L4.002 2h10.995zM17.5 13a3.5 3.5 0 0 1 3.5 3.5l-.001.103a2.75 2.75 0 0 1-.581 5.392L20.25 22h-5.5l-.168-.005a2.75 2.75 0 0 1-.579-5.392L14 16.5a3.5 3.5 0 0 1 3.5-3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-cloud-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14.997 2L21 8l.001 4.26a5.471 5.471 0 0 0-2-1.053L19 9h-5V4H5v16h5.06a4.73 4.73 0 0 0 .817 2H3.993a.993.993 0 0 1-.986-.876L3 21.008V2.992c0-.498.387-.927.885-.985L4.002 2h10.995zM17.5 13a3.5 3.5 0 0 1 3.5 3.5l-.001.103a2.75 2.75 0 0 1-.581 5.392L20.25 22h-5.5l-.168-.005a2.75 2.75 0 0 1-.579-5.392L14 16.5a3.5 3.5 0 0 1 3.5-3.5zm0 2a1.5 1.5 0 0 0-1.473 1.215l-.02.14L16 16.5v1.62l-1.444.406a.75.75 0 0 0 .08 1.466l.109.008h5.51a.75.75 0 0 0 .19-1.474l-1.013-.283L19 18.12V16.5l-.007-.144A1.5 1.5 0 0 0 17.5 15z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-code-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM17.657 12l-3.536 3.536-1.414-1.415L14.828 12l-2.12-2.121 1.413-1.415L17.657 12zM6.343 12L9.88 8.464l1.414 1.415L9.172 12l2.12 2.121-1.413 1.415L6.343 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-copy-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7zm2 0h8v10h2V4H9v2zm-2 5v2h6v-2H7zm0 4v2h6v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-copy-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.006-1H7zM5.002 8L5 20h10V8H5.002zM9 6h8v10h2V4H9v2zm-2 5h6v2H7v-2zm0 4h6v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-copy-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7zm2 0h8v10h2V4H9v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-copy-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7zM5.003 8L5 20h10V8H5.003zM9 6h8v10h2V4H9v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-damage-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 14l4 2.5 3-3.5 3 4 2-2.5 3 .5-3-3-2 2.5-3-5-3.5 3.75L3 10V2.992C3 2.455 3.447 2 3.998 2H14v6a1 1 0 0 0 1 1h6v11.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V14zm18-7h-5V2.003L21 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-damage-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M19 9h-5V4H5v7.857l1.5 1.393L10 9.5l3 5 2-2.5 3 3-3-.5-2 2.5-3-4-3 3.5-2-1.25V20h14V9zm2-1v12.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.449 2 4.002 2h10.995L21 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-download-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-3 10V8h-2v4H8l4 4 4-4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-edit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 15.243v5.765a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V9h6a1 1 0 0 0 1-1V2h10.002c.551 0 .998.455.998.992v3.765l-8.999 9-.006 4.238 4.246.006L21 15.243zm.778-6.435l1.414 1.414L15.414 18l-1.416-.002.002-1.412 7.778-7.778zM3 7l5-4.997V7H3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-edit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 6.757l-2 2V4h-9v5H5v11h14v-2.757l2-2v5.765a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8l6.003-6h10.995C20.55 2 21 2.455 21 2.992v3.765zm.778 2.05l1.414 1.415L15.414 18l-1.416-.002.002-1.412 7.778-7.778z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-download-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13 12h3l-4 4-4-4h3V8h2v4zm2-8H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-excel-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.859 2.877l12.57-1.795a.5.5 0 0 1 .571.495v20.846a.5.5 0 0 1-.57.495L2.858 21.123a1 1 0 0 1-.859-.99V3.867a1 1 0 0 1 .859-.99zM17 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4V3zm-6.8 9L13 8h-2.4L9 10.286 7.4 8H5l2.8 4L5 16h2.4L9 13.714 10.6 16H13l-2.8-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-excel-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.859 2.877l12.57-1.795a.5.5 0 0 1 .571.495v20.846a.5.5 0 0 1-.57.495L2.858 21.123a1 1 0 0 1-.859-.99V3.867a1 1 0 0 1 .859-.99zM4 4.735v14.53l10 1.429V3.306L4 4.735zM17 19h3V5h-3V3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4v-2zm-6.8-7l2.8 4h-2.4L9 13.714 7.4 16H5l2.8-4L5 8h2.4L9 10.286 10.6 8H13l-2.8 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-chart-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM12 8v4h4a4 4 0 1 1-4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-excel-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-2.8 10L16 8h-2.4L12 10.286 10.4 8H8l2.8 4L8 16h2.4l1.6-2.286L13.6 16H16l-2.8-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-excel-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.2 12l2.8 4h-2.4L12 13.714 10.4 16H8l2.8-4L8 8h2.4l1.6 2.286L13.6 8H15V4H5v16h14V8h-3l-2.8 4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 8l6.003-6h10.995C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8zm7-4.5L4.5 9H10V3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-forbid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 11.674A7 7 0 0 0 12.255 22H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16l5 5v4.674zM18 23a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm-1.293-2.292a3 3 0 0 0 4.001-4.001l-4.001 4zm-1.415-1.415l4.001-4a3 3 0 0 0-4.001 4.001z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-gif-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M16 2l5 5v13.993c0 .556-.445 1.007-.993 1.007H3.993C3.445 22 3 21.545 3 21.008V2.992C3 2.444 3.447 2 3.999 2H16zm-1 2H5v16h14V8h-4V4zm-2 6v5h-1v-5h1zm-2 0v1H9c-.552 0-1 .448-1 1v1c0 .552.448 1 1 1h1v-1H9v-1h2v2c0 .552-.448 1-1 1H9c-1.105 0-2-.895-2-2v-1c0-1.105.895-2 2-2h2zm6 0v1h-2v1h2v1h-2v2h-1v-5h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-history-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M16 2l5 4.999v14.01c0 .547-.445.991-.993.991H3.993C3.445 22 3 21.545 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-3 7h-2v6h5v-2h-3V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-history-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M16 2l5 5v13.993c0 .556-.445 1.007-.993 1.007H3.993C3.445 22 3 21.545 3 21.008V2.992C3 2.444 3.447 2 3.999 2H16zm-1 2H5v16h14V8h-4V4zm-2 5v4h3v2h-5V9h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-hwp-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.447 2 3.999 2H16zM9.333 14.667H8V18h8v-1.333l-6.667-.001v-2zM12 14.333a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM12 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm0 1.333a1.167 1.167 0 1 1 0 2.334 1.167 1.167 0 0 1 0-2.334zM12.667 6h-1.334v1.333H8v1.334h8V7.333h-3.334V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-hwp-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.447 2 3.999 2H16zm0 6.667H8V7.333h3.333V6h1.334l-.001 1.333h2.333L15 4H5v16h14V8l-3-.001v.668zm-6.667 6v1.999H16V18H8v-3.333h1.333zM12 14.333a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM12 9a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 1.333a1.167 1.167 0 1 0 0 2.334 1.167 1.167 0 0 0 0-2.334z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-info-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-5 5v2h2V7h-2zm0 4v6h2v-6h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-info-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM11 11h2v6h-2v-6zm0-4h2v2h-2V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-forbid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.29 20c.215.722.543 1.396.965 2H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.447 2 3.999 2H16l5 5v4.674a6.95 6.95 0 0 0-2-.603V8h-4V4H5v16h6.29zM18 23a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm-1.293-2.292a3 3 0 0 0 4.001-4.001l-4.001 4zm-1.415-1.415l4.001-4a3 3 0 0 0-4.001 4.001z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-gif-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M16 2l5 5v13.993c0 .556-.445 1.007-.993 1.007H3.993C3.445 22 3 21.545 3 21.008V2.992C3 2.444 3.447 2 3.999 2H16zm-3 8h-1v5h1v-5zm-2 0H9c-1.105 0-2 .895-2 2v1c0 1.105.895 2 2 2h1c.552 0 1-.448 1-1v-2H9v1h1v1H9c-.552 0-1-.448-1-1v-1c0-.552.448-1 1-1h2v-1zm6 0h-3v5h1v-2h2v-1h-2v-1h2v-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 2.003V2h10.998C20.55 2 21 2.455 21 2.992v18.016a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8l6-5.997zM5.83 8H9V4.83L5.83 8zM11 4v5a1 1 0 0 1-1 1H5v10h14V4h-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-list-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM8 7v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-list-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2V4H5v16h14zM8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-list-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 22H5a3 3 0 0 1-3-3V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12h4v4a3 3 0 0 1-3 3zm-1-5v2a1 1 0 0 0 2 0v-2h-2zm-2 3V4H4v15a1 1 0 0 0 1 1h11zM6 7h8v2H6V7zm0 4h8v2H6v-2zm0 4h5v2H6v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-list-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM8 7v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-list-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 22H5a3 3 0 0 1-3-3V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12h4v4a3 3 0 0 1-3 3zm-1-5v2a1 1 0 0 0 2 0v-2h-2zM6 7v2h8V7H6zm0 4v2h8v-2H6zm0 4v2h5v-2H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-lock-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-1 9v-1a3 3 0 0 0-6 0v1H8v5h8v-5h-1zm-2 0h-2v-1a1 1 0 0 1 2 0v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-list-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2V4H5v16h14zM8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-lock-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM15 11h1v5H8v-5h1v-1a3 3 0 0 1 6 0v1zm-2 0v-1a1 1 0 0 0-2 0v1h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-mark-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2.992v18.016a1 1 0 0 1-.993.992H3.993A.993.993 0 0 1 3 21.008V2.992A1 1 0 0 1 3.993 2h16.014c.548 0 .993.444.993.992zM7 4v9l3.5-2 3.5 2V4H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-mark-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM7 4H5v16h14V4h-5v9l-3.5-2L7 13V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-music-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-5 10.05a2.5 2.5 0 1 0 2 2.45V10h3V8h-5v4.05z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-music-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 8v2h-3v4.5a2.5 2.5 0 1 1-2-2.45V8h4V4H5v16h14V8h-3zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-paper-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 2a3 3 0 0 1 3 3v2h-2v12a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-2h16v2a1 1 0 0 0 .883.993L18 20a1 1 0 0 0 .993-.883L19 19V4H6a1 1 0 0 0-.993.883L5 5v10H3V5a3 3 0 0 1 3-3h14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-paper-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 15V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-2h16v2a1 1 0 0 0 2 0v-4H3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-paper-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 2a3 3 0 0 1 3 3v2h-2v12a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-2h16v2a1 1 0 0 0 .883.993L18 20a1 1 0 0 0 .993-.883L19 19v-4H3V5a3 3 0 0 1 3-3h14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-pdf-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-4 14a4 4 0 1 0 0-8H8v8h4zm-2-6h2a2 2 0 1 1 0 4h-2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-paper-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 17v2a1 1 0 0 0 2 0V4H5v11H3V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3v-2h16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-ppt-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4V3zM2.859 2.877l12.57-1.795a.5.5 0 0 1 .571.495v20.846a.5.5 0 0 1-.57.495L2.858 21.123a1 1 0 0 1-.859-.99V3.867a1 1 0 0 1 .859-.99zM5 8v8h2v-2h6V8H5zm2 2h4v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-pdf-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 16H8V8h4a4 4 0 1 1 0 8zm-2-6v4h2a2 2 0 1 0 0-4h-2zm5-6H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-ppt-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.859 2.877l12.57-1.795a.5.5 0 0 1 .571.495v20.846a.5.5 0 0 1-.57.495L2.858 21.123a1 1 0 0 1-.859-.99V3.867a1 1 0 0 1 .859-.99zM4 4.735v14.53l10 1.429V3.306L4 4.735zM17 19h3V5h-3V3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4v-2zM5 8h8v6H7v2H5V8zm2 2v2h4v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-ppt-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zM8 8v8h2v-2h6V8H8zm2 2h4v2h-4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-reduce-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-8 9v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-ppt-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM5 4v16h14V8h-3v6h-6v2H8V8h7V4H5zm5 6v2h4v-2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-reduce-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM16 11v2H8v-2h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-search-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-2.471 12.446l2.21 2.21 1.415-1.413-2.21-2.21a4.002 4.002 0 0 0-6.276-4.861 4 4 0 0 0 4.861 6.274zm-.618-2.032a2 2 0 1 1-2.828-2.828 2 2 0 0 1 2.828 2.828z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-settings-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M8.595 12.812a3.51 3.51 0 0 1 0-1.623l-.992-.573 1-1.732.992.573A3.496 3.496 0 0 1 11 8.645V7.5h2v1.145c.532.158 1.012.44 1.405.812l.992-.573 1 1.732-.992.573a3.51 3.51 0 0 1 0 1.622l.992.573-1 1.732-.992-.573a3.496 3.496 0 0 1-1.405.812V16.5h-2v-1.145a3.496 3.496 0 0 1-1.405-.812l-.992.573-1-1.732.992-.572zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-settings-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zM8.595 12.812l-.992.572 1 1.732.992-.573c.393.372.873.654 1.405.812V16.5h2v-1.145a3.496 3.496 0 0 0 1.405-.812l.992.573 1-1.732-.992-.573a3.51 3.51 0 0 0 0-1.622l.992-.573-1-1.732-.992.573A3.496 3.496 0 0 0 13 8.645V7.5h-2v1.145a3.496 3.496 0 0 0-1.405.812l-.992-.573-1 1.732.992.573a3.51 3.51 0 0 0 0 1.623zM12 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-search-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zm10.529 11.454a4.002 4.002 0 0 1-4.86-6.274 4 4 0 0 1 6.274 4.86l2.21 2.21-1.414 1.415-2.21-2.21zm-.618-2.032a2 2 0 1 0-2.828-2.828 2 2 0 0 0 2.828 2.828z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-shield-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 9V4H5v16h6.056c.328.417.724.785 1.18 1.085l1.39.915H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.449 2 4.002 2h10.995L21 8v1h-7zm-2 2h9v5.949c0 .99-.501 1.916-1.336 2.465L16.5 21.498l-3.164-2.084A2.953 2.953 0 0 1 12 16.95V11zm2 5.949c0 .316.162.614.436.795l2.064 1.36 2.064-1.36a.954.954 0 0 0 .436-.795V13h-5v3.949z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-shield-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 10H11v7.382c0 1.563.777 3.023 2.074 3.892l1.083.726H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.447 2 3.998 2h11.999L21 7v3zm-8 2h8v5.382c0 .897-.446 1.734-1.187 2.23L17 21.499l-2.813-1.885A2.685 2.685 0 0 1 13 17.383V12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-shield-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 7v13.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.447 2 3.998 2h11.999L21 7zM8 8v5.6c0 .85.446 1.643 1.187 2.114L12 17.5l2.813-1.786A2.51 2.51 0 0 0 16 13.6V8H8zm2 2h4v3.6c0 .158-.09.318-.26.426L12 15.13l-1.74-1.105c-.17-.108-.26-.268-.26-.426V10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-shield-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 8V4H5v16h14V9h-3v4.62c0 .844-.446 1.633-1.187 2.101L12 17.498 9.187 15.72C8.446 15.253 8 14.464 8 13.62V8h6zm7 0v12.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.449 2 4.002 2h10.995L21 8zm-11 5.62c0 .15.087.304.255.41L12 15.132l1.745-1.102c.168-.106.255-.26.255-.41V10h-4v3.62z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-shred-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 12v2H2v-2h2V2.995c0-.55.445-.995.996-.995H15l5 5v5h2zM3 16h2v6H3v-6zm16 0h2v6h-2v-6zm-4 0h2v6h-2v-6zm-4 0h2v6h-2v-6zm-4 0h2v6H7v-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-text-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 9v11.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.447 2 3.998 2H14v6a1 1 0 0 0 1 1h6zm0-2h-5V2.003L21 7zM8 7v2h3V7H8zm0 4v2h8v-2H8zm0 4v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-text-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 8v12.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.449 2 4.002 2h10.995L21 8zm-2 1h-5V4H5v16h14V9zM8 7h3v2H8V7zm0 4h8v2H8v-2zm0 4h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-transfer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-4 9H8v2h4v3l4-4-4-4v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-transfer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM12 11V8l4 4-4 4v-3H8v-2h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-unknow-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-5 13v2h2v-2h-2zm2-1.645A3.502 3.502 0 0 0 12 6.5a3.501 3.501 0 0 0-3.433 2.813l1.962.393A1.5 1.5 0 1 1 12 11.5a1 1 0 0 0-1 1V14h2v-.645z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-unknow-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 15h2v2h-2v-2zm2-1.645V14h-2v-1.5a1 1 0 0 1 1-1 1.5 1.5 0 1 0-1.471-1.794l-1.962-.393A3.501 3.501 0 1 1 13 13.355zM15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-upload-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-3 10h3l-4-4-4 4h3v4h2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-user-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-4 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7.527 17h8.946a4.5 4.5 0 0 0-8.946 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-upload-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM13 12v4h-2v-4H8l4-4 4 4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-shred-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 12h12V8h-4V4H6v8zm-2 0V2.995c0-.55.445-.995.996-.995H15l5 5v5h2v2H2v-2h2zm-1 4h2v6H3v-6zm16 0h2v6h-2v-6zm-4 0h2v6h-2v-6zm-4 0h2v6h-2v-6zm-4 0h2v6H7v-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-code-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm1.657 10L14.12 8.464 12.707 9.88 14.828 12l-2.12 2.121 1.413 1.415L17.657 12zM6.343 12l3.536 3.536 1.414-1.415L9.172 12l2.12-2.121L9.88 8.464 6.343 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-user-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zm9 8.508a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM7.527 17a4.5 4.5 0 0 1 8.946 0H7.527z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-word-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4V3zM2.859 2.877l12.57-1.795a.5.5 0 0 1 .571.495v20.846a.5.5 0 0 1-.57.495L2.858 21.123a1 1 0 0 1-.859-.99V3.867a1 1 0 0 1 .859-.99zM11 8v4.989L9 11l-1.99 2L7 8H5v8h2l2-2 2 2h2V8h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-word-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-2 6v4.989L12 11l-1.99 2L10 8H8v8h2l2-2 2 2h2V8h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-word-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 19h3V5h-3V3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4v-2zM2.859 2.877l12.57-1.795a.5.5 0 0 1 .571.495v20.846a.5.5 0 0 1-.57.495L2.858 21.123a1 1 0 0 1-.859-.99V3.867a1 1 0 0 1 .859-.99zM4 4.735v14.53l10 1.429V3.306L4 4.735zM11 8h2v8h-2l-2-2-2 2H5V8h2l.01 5L9 11l2 1.989V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-warning-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 2l5 5v14.008a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 21.008V2.992C3 2.444 3.445 2 3.993 2H16zm-5 13v2h2v-2h-2zm0-8v6h2V7h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-warning-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4H5v16h14V8h-4V4zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992zM11 15h2v2h-2v-2zm0-8h2v6h-2V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-word-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 8v8h-2l-2-2-2 2H8V8h2v5l2-2 2 2V8h1V4H5v16h14V8h-3zM3 2.992C3 2.444 3.447 2 3.999 2H16l5 5v13.993A1 1 0 0 1 20.007 22H3.993A1 1 0 0 1 3 21.008V2.992z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-zip-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 2v2h2V2h8.007c.548 0 .993.444.993.992v18.016a1 1 0 0 1-.993.992H3.993A.993.993 0 0 1 3 21.008V2.992A1 1 0 0 1 3.993 2H10zm2 2v2h2V4h-2zm-2 2v2h2V6h-2zm2 2v2h2V8h-2zm-2 2v2h2v-2h-2zm2 2v2h-2v3h4v-5h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "file-zip-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2V4H5v16h14zm-5-8v5h-4v-3h2v-2h2zm-2-8h2v2h-2V4zm-2 2h2v2h-2V6zm2 2h2v2h-2V8zm-2 2h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9h20zm0-2H2V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM20 11H4v8h16v-8zm0-2V7h-8.414l-2-2H4v4h16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 8v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7h19a1 1 0 0 1 1 1zm-9.586-3H2V4a1 1 0 0 1 1-1h7.414l2 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 7v12h16V7H4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 21V11h14v9a1 1 0 0 1-1 1H8zm-2 0H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v3H7a1 1 0 0 0-1 1v11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM8 19h12v-8H8v8zm-2 0v-9a1 1 0 0 1 1-1h13V7h-8.414l-2-2H4v14h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.414 5H20a1 1 0 0 1 1 1v1H3V4a1 1 0 0 1 1-1h7.414l2 2zM3.087 9h17.826a1 1 0 0 1 .997 1.083l-.834 10a1 1 0 0 1-.996.917H3.92a1 1 0 0 1-.996-.917l-.834-10A1 1 0 0 1 3.087 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3.087 9h17.826a1 1 0 0 1 .997 1.083l-.834 10a1 1 0 0 1-.996.917H3.92a1 1 0 0 1-.996-.917l-.834-10A1 1 0 0 1 3.087 9zM4.84 19h14.32l.666-8H4.174l.666 8zm8.574-14H20a1 1 0 0 1 1 1v1H3V4a1 1 0 0 1 1-1h7.414l2 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM11 12H8v2h3v3h2v-3h3v-2h-3V9h-2v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm7 7V9h2v3h3v2h-3v3h-2v-3H8v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-chart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM11 9v8h2V9h-2zm4 3v5h2v-5h-2zm-8 2v3h2v-3H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-chart-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM12 9a4 4 0 1 0 4 4h-4V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-chart-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm8 4v4h4a4 4 0 1 1-4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-chart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm7 4h2v8h-2V9zm4 3h2v5h-2v-5zm-8 2h2v3H7v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-download-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM13 13V9h-2v4H8l4 4 4-4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-download-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm9 8h3l-4 4-4-4h3V9h2v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-forbid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11.255A7 7 0 0 0 12.255 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v5.255zM18 22a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm-1.293-2.292a3 3 0 0 0 4.001-4.001l-4.001 4zm-1.415-1.415l4.001-4a3 3 0 0 0-4.001 4.001z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-history-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M10.414 3l2 2H21c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h7.414zm-.828 2H4v14h16V7h-8.414l-2-2zM13 9v4h3v2h-5V9h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-info-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM11 9v2h2V9h-2zm0 3v5h2v-5h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-history-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M10.414 3l2 2H21c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h7.414zM13 9h-2v6h5v-2h-3V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-forbid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11.255a6.972 6.972 0 0 0-2-.965V7h-8.414l-2-2H4v14h7.29c.215.722.543 1.396.965 2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v5.255zM18 22a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm-1.293-2.292a3 3 0 0 0 4.001-4.001l-4.001 4zm-1.415-1.415l4.001-4a3 3 0 0 0-4.001 4.001z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-keyhole-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10.414 3l2 2H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414zm-.828 2H4v14h16V7h-8.414l-2-2zM12 9a2 2 0 0 1 1.001 3.732L13 17h-2v-4.268A2 2 0 0 1 12 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-info-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm7 7h2v5h-2v-5zm0-3h2v2h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V7h-8.414l-2-2H4zm8.414 0H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-keyhole-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10.414 3l2 2H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414zM12 9a2 2 0 0 0-1 3.732V17h2l.001-4.268A2 2 0 0 0 12 9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-lock-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm11 8h1v4H8v-4h1v-1a3 3 0 0 1 6 0v1zm-2 0v-1a1 1 0 0 0-2 0v1h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-music-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm7 8.05V9h5v2h-3v4.5a2.5 2.5 0 1 1-2-2.45z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-lock-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM15 13v-1a3 3 0 0 0-6 0v1H8v4h8v-4h-1zm-2 0h-2v-1a1 1 0 0 1 2 0v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-music-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM11 13.05a2.5 2.5 0 1 0 2 2.45V11h3V9h-5v4.05z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-open-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H20a1 1 0 0 1 1 1v3h-2V7h-7.414l-2-2H4v11.998L5.5 11h17l-2.31 9.243a1 1 0 0 1-.97.757H3zm16.938-8H7.062l-1.5 6h12.876l1.5-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-open-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 21a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H20a1 1 0 0 1 1 1v3H4v9.996L6 11h16.5l-2.31 9.243a1 1 0 0 1-.97.757H3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-received-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 13.126A6 6 0 0 0 13.303 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v7.126zM20 17h3v2h-3v3.5L15 18l5-4.5V17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-received-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 13h-2V7h-8.414l-2-2H4v14h9v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v7zm-2 4h3v2h-3v3.5L15 18l5-4.5V17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-reduce-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM8 12v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-settings-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm4.591 8.809a3.508 3.508 0 0 1 0-1.622l-.991-.572 1-1.732.991.573a3.495 3.495 0 0 1 1.404-.812V8.5h2v1.144c.532.159 1.01.44 1.403.812l.992-.573 1 1.731-.991.573a3.508 3.508 0 0 1 0 1.622l.991.572-1 1.731-.991-.572a3.495 3.495 0 0 1-1.404.811v1.145h-2V16.35a3.495 3.495 0 0 1-1.404-.811l-.991.572-1-1.73.991-.573zm3.404.688a1.5 1.5 0 1 0 0-2.998 1.5 1.5 0 0 0 0 2.998z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-reduce-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm4 7h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-settings-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zm-3.823 8.809l-.991.572 1 1.731.991-.572c.393.371.872.653 1.405.811v1.145h1.999V16.35a3.495 3.495 0 0 0 1.404-.811l.991.572 1-1.73-.991-.573a3.508 3.508 0 0 0 0-1.622l.99-.573-.999-1.73-.992.572a3.495 3.495 0 0 0-1.404-.812V8.5h-1.999v1.144a3.495 3.495 0 0 0-1.404.812L8.6 9.883 7.6 11.615l.991.572a3.508 3.508 0 0 0 0 1.622zm3.404.688a1.5 1.5 0 1 1 0-2.998 1.5 1.5 0 0 1 0 2.998z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-shared-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 13.126A6 6 0 0 0 13.303 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v7.126zM18 17v-3.5l5 4.5-5 4.5V19h-3v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-shield-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 10H12v7.382c0 1.409.632 2.734 1.705 3.618H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v4zm-8 2h8v5.382c0 .897-.446 1.734-1.187 2.23L18 21.499l-2.813-1.885A2.685 2.685 0 0 1 14 17.383V12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-shared-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 13h-2V7h-8.414l-2-2H4v14h9v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v7zm-4 4v-3.5l5 4.5-5 4.5V19h-3v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-shield-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M22 9h-2V7h-8.414l-2-2H4v14h7.447a4.97 4.97 0 0 0 1.664 2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H21a1 1 0 0 1 1 1v3zm-9 2h9v5.949c0 .99-.501 1.916-1.336 2.465L17.5 21.498l-3.164-2.084A2.953 2.953 0 0 1 13 16.95V11zm2 5.949c0 .316.162.614.436.795l2.064 1.36 2.064-1.36a.954.954 0 0 0 .436-.795V13h-5v3.949z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-shield-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm4 4h8v4.904c0 .892-.446 1.724-1.187 2.219L12 17.998l-2.813-1.875A2.667 2.667 0 0 1 8 13.904V9zm2 4.904c0 .223.111.431.297.555L12 15.594l1.703-1.135a.667.667 0 0 0 .297-.555V11h-4v2.904z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-shield-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM8 9v4.904c0 .892.446 1.724 1.187 2.219L12 17.998l2.813-1.875A2.667 2.667 0 0 0 16 13.904V9H8zm2 4.904V11h4v2.904a.667.667 0 0 1-.297.555L12 15.594l-1.703-1.135a.667.667 0 0 1-.297-.555z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-transfer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm8 7V9l4 4-4 4v-3H8v-2h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-transfer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM12 12H8v2h4v3l4-4-4-4v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-unknow-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM11 16v2h2v-2h-2zm-2.433-5.187l1.962.393A1.5 1.5 0 1 1 12 13h-1v2h1a3.5 3.5 0 1 0-3.433-4.187z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-unknow-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm7 11h2v2h-2v-2zm-2.433-5.187A3.501 3.501 0 1 1 12 15h-1v-2h1a1.5 1.5 0 1 0-1.471-1.794l-1.962-.393z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-user-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-4 5h8a4 4 0 1 0-8 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-upload-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM13 13h3l-4-4-4 4h3v4h2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-upload-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm9 8v4h-2v-4H8l4-4 4 4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-user-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm4 13a4 4 0 1 1 8 0H8zm4-5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-zip-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2H16v2h2V5h3zm-3 8h-2v2h-2v3h4v-5zm-2-2h-2v2h2v-2zm2-2h-2v2h2V9zm-2-2h-2v2h2V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-warning-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM4 5v14h16V7h-8.414l-2-2H4zm7 10h2v2h-2v-2zm0-6h2v5h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-warning-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.414 5H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414l2 2zM11 9v5h2V9h-2zm0 6v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folder-zip-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M10.414 3l2 2H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414zM18 18h-4v-3h2v-2h-2v-2h2V9h-2V7h-2.414l-2-2H4v14h16V7h-4v2h2v2h-2v2h2v5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "keynote-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 12v8h4v2H7v-2h4v-8H2.992c-.548 0-.906-.43-.797-.977l1.61-8.046C3.913 2.437 4.445 2 5 2h13.998c.553 0 1.087.43 1.196.977l1.61 8.046c.108.54-.26.977-.797.977H13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "keynote-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.44 10h15.12l-1.2-6H5.64l-1.2 6zM13 12v8h4v2H7v-2h4v-8H2.992c-.548 0-.906-.43-.797-.977l1.61-8.046C3.913 2.437 4.445 2 5 2h13.998c.553 0 1.087.43 1.196.977l1.61 8.046c.108.54-.26.977-.797.977H13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folders-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 7V4a1 1 0 0 1 1-1h6.414l2 2H21a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3zm0 2H4v10h12v-2H6V9zm2-4v10h12V7h-5.414l-2-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "folders-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 7V4a1 1 0 0 1 1-1h6.414l2 2H21a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3zm0 2H4v10h12v-2H6V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "markdown-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4 12.5v-4l2 2 2-2v4h2v-7h-2l-2 2-2-2H5v7h2zm11-3v-4h-2v4h-2l3 3 3-3h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "newspaper-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M16 20V4H4v15a1 1 0 0 0 1 1h11zm3 2H5a3 3 0 0 1-3-3V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h4v9a3 3 0 0 1-3 3zm-1-10v7a1 1 0 0 0 2 0v-7h-2zM6 6h6v6H6V6zm2 2v2h2V8H8zm-2 5h8v2H6v-2zm0 3h8v2H6v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "numbers-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 18H4v-8h5v8zm6 0h-5V6h5v12zm6 0h-5V2h5v16zm1 4H3v-2h19v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "markdown-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm3 10.5H5v-7h2l2 2 2-2h2v7h-2v-4l-2 2-2-2v4zm11-3h2l-3 3-3-3h2v-4h2v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "newspaper-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 22H5a3 3 0 0 1-3-3V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h4v9a3 3 0 0 1-3 3zm-1-10v7a1 1 0 0 0 2 0v-7h-2zM5 6v6h6V6H5zm0 7v2h10v-2H5zm0 3v2h10v-2H5zm2-8h2v2H7V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "numbers-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 18H4v-8h5v8zm-2-2v-4H6v4h1zm6 0V8h-1v8h1zm2 2h-5V6h5v12zm4-2V4h-1v12h1zm2 2h-5V2h5v16zm1 4H3v-2h19v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pages-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V8h18v13a1 1 0 0 1-1 1zm1-16H3V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3zM7 11v4h4v-4H7zm0 6v2h10v-2H7zm6-5v2h4v-2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pages-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 8v12h14V8H5zm0-2h14V4H5v2zm15 16H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM7 10h4v4H7v-4zm0 6h10v2H7v-2zm6-5h4v2h-4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sticky-note-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 16l-5.003 5H3.998A.996.996 0 0 1 3 20.007V3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.447.993.999V16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sticky-note-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3.998 21A.996.996 0 0 1 3 20.007V3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.447.993.999V16l-5.003 5H3.998zM5 19h10.169L19 15.171V5H5v14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sticky-note-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 14l-.117.007a1 1 0 0 0-.876.876L14 15v6H3.998A.996.996 0 0 1 3 20.007V3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.447.993.999V14h-6zm6 2l-5 4.997V16h5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sticky-note-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 15l-6 5.996L4.002 21A.998.998 0 0 1 3 20.007V3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.456.993 1.002V15zM19 5H5v14h8v-5a1 1 0 0 1 .883-.993L14 13l5-.001V5zm-.829 9.999L15 15v3.169l3.171-3.17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "survey-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M6 4v4h12V4h2.007c.548 0 .993.445.993.993v16.014c0 .548-.445.993-.993.993H3.993C3.445 22 3 21.555 3 21.007V4.993C3 4.445 3.445 4 3.993 4H6zm3 13H7v2h2v-2zm0-3H7v2h2v-2zm0-3H7v2h2v-2zm7-9v4H8V2h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "task-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2.992v18.016a1 1 0 0 1-.993.992H3.993A.993.993 0 0 1 3 21.008V2.992A1 1 0 0 1 3.993 2h16.014c.548 0 .993.444.993.992zm-9.707 10.13l-2.475-2.476-1.414 1.415 3.889 3.889 5.657-5.657-1.414-1.414-4.243 4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "survey-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M17 2v2h3.007c.548 0 .993.445.993.993v16.014c0 .548-.445.993-.993.993H3.993C3.445 22 3 21.555 3 21.007V4.993C3 4.445 3.445 4 3.993 4H7V2h10zM7 6H5v14h14V6h-2v2H7V6zm2 10v2H7v-2h2zm0-3v2H7v-2h2zm0-3v2H7v-2h2zm6-6H9v2h6V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "todo-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 2h3a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3V0h2v2h6V0h2v2zM7 8v2h10V8H7zm0 4v2h10v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "task-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2.992v18.016a1 1 0 0 1-.993.992H3.993A.993.993 0 0 1 3 21.008V2.992A1 1 0 0 1 3.993 2h16.014c.548 0 .993.444.993.992zM19 4H5v16h14V4zm-7.707 9.121l4.243-4.242 1.414 1.414-5.657 5.657-3.89-3.89 1.415-1.414 2.475 2.475z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "todo-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 2h3a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h3V0h2v2h6V0h2v2zm0 2v2h-2V4H9v2H7V4H5v16h14V4h-2zM7 8h10v2H7V8zm0 4h10v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "editor",
            iconsvg: [
                {
                    name: "a-b",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path d="M5 15v2c0 1.054.95 2 2 2h3v2H7a4 4 0 0 1-4-4v-2h2zm13-5l4.4 11h-2.155l-1.201-3h-4.09l-1.199 3h-2.154L16 10h2zm-1 2.885L15.753 16h2.492L17 12.885zM3 3h6a3 3 0 0 1 2.235 5A3 3 0 0 1 9 13H3V3zm6 6H5v2h4a1 1 0 0 0 0-2zm8-6a4 4 0 0 1 4 4v2h-2V7a2 2 0 0 0-2-2h-3V3h3zM9 5H5v2h4a1 1 0 1 0 0-2z"/>\n</svg>\n',
                },
                {
                    name: "align-bottom",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 19h18v2H3v-2zm5-6h3l-4 4-4-4h3V3h2v10zm10 0h3l-4 4-4-4h3V3h2v10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "align-center",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 4h18v2H3V4zm2 15h14v2H5v-2zm-2-5h18v2H3v-2zm2-5h14v2H5V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "align-justify",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 4h18v2H3V4zm0 15h18v2H3v-2zm0-5h18v2H3v-2zm0-5h18v2H3V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "align-left",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 4h18v2H3V4zm0 15h14v2H3v-2zm0-5h18v2H3v-2zm0-5h14v2H3V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "align-right",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 4h18v2H3V4zm4 15h14v2H7v-2zm-4-5h18v2H3v-2zm4-5h14v2H7V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "align-top",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18v2H3V3zm5 8v10H6V11H3l4-4 4 4H8zm10 0v10h-2V11h-3l4-4 4 4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "align-vertically",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 11h18v2H3v-2zm15 7v3h-2v-3h-3l4-4 4 4h-3zM8 18v3H6v-3H3l4-4 4 4H8zM18 6h3l-4 4-4-4h3V3h2v3zM8 6h3l-4 4-4-4h3V3h2v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "asterisk",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 3v7.267l6.294-3.633 1 1.732-6.293 3.633 6.293 3.635-1 1.732L13 13.732V21h-2v-7.268l-6.294 3.634-1-1.732L9.999 12 3.706 8.366l1-1.732L11 10.267V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "attachment-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.828 7.757l-5.656 5.657a1 1 0 1 0 1.414 1.414l5.657-5.656A3 3 0 1 0 12 4.929l-5.657 5.657a5 5 0 1 0 7.071 7.07L19.071 12l1.414 1.414-5.657 5.657a7 7 0 1 1-9.9-9.9l5.658-5.656a5 5 0 0 1 7.07 7.07L12 16.244A3 3 0 1 1 7.757 12l5.657-5.657 1.414 1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bold",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 11h4.5a2.5 2.5 0 1 0 0-5H8v5zm10 4.5a4.5 4.5 0 0 1-4.5 4.5H6V4h6.5a4.5 4.5 0 0 1 3.256 7.606A4.498 4.498 0 0 1 18 15.5zM8 13v5h5.5a2.5 2.5 0 1 0 0-5H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bring-forward",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M14 3c.552 0 1 .448 1 1v5h5c.552 0 1 .448 1 1v10c0 .552-.448 1-1 1H10c-.552 0-1-.448-1-1v-5H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h10zm-1 2H5v8h8V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bring-to-front",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 3c.552 0 1 .448 1 1v2h5c.552 0 1 .448 1 1v5h2c.552 0 1 .448 1 1v7c0 .552-.448 1-1 1h-7c-.552 0-1-.448-1-1v-2H7c-.552 0-1-.448-1-1v-5H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h7zm5 5H8v8h8V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "code-view",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.95 8.464l1.414-1.414 4.95 4.95-4.95 4.95-1.414-1.414L20.485 12 16.95 8.464zm-9.9 0L3.515 12l3.535 3.536-1.414 1.414L.686 12l4.95-4.95L7.05 8.464z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "delete-column",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 3c.552 0 1 .448 1 1v8c.835-.628 1.874-1 3-1 2.761 0 5 2.239 5 5s-2.239 5-5 5c-1.032 0-1.99-.313-2.787-.848L13 20c0 .552-.448 1-1 1H6c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h6zm-1 2H7v14h4V5zm8 10h-6v2h6v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "delete-row",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 5c.552 0 1 .448 1 1v6c0 .552-.448 1-1 1 .628.835 1 1.874 1 3 0 2.761-2.239 5-5 5s-5-2.239-5-5c0-1.126.372-2.165 1-3H4c-.552 0-1-.448-1-1V6c0-.552.448-1 1-1h16zm-7 10v2h6v-2h-6zm6-8H5v4h14V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "double-quotes-l",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "double-quotes-r",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.417 6.679C20.447 7.773 21 9 21 10.989c0 3.5-2.457 6.637-6.03 8.188l-.893-1.378c3.335-1.804 3.987-4.145 4.247-5.621-.537.278-1.24.375-1.929.311-1.804-.167-3.226-1.648-3.226-3.489a3.5 3.5 0 0 1 3.5-3.5c1.073 0 2.099.49 2.748 1.179zm-10 0C10.447 7.773 11 9 11 10.989c0 3.5-2.457 6.637-6.03 8.188l-.893-1.378c3.335-1.804 3.987-4.145 4.247-5.621-.537.278-1.24.375-1.929.311C4.591 12.322 3.17 10.841 3.17 9a3.5 3.5 0 0 1 3.5-3.5c1.073 0 2.099.49 2.748 1.179z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "emphasis-cn",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 19a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-5.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm11 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM13 2v2h6v2h-1.968a18.222 18.222 0 0 1-3.621 6.302 14.685 14.685 0 0 0 5.327 3.042l-.536 1.93A16.685 16.685 0 0 1 12 13.726a16.696 16.696 0 0 1-6.202 3.547l-.536-1.929a14.7 14.7 0 0 0 5.327-3.042 18.077 18.077 0 0 1-2.822-4.3h2.24A16.031 16.031 0 0 0 12 10.876a16.168 16.168 0 0 0 2.91-4.876L5 6V4h6V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "emphasis",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 19a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-5.5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm11 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM18 3v2H8v4h9v2H8v4h10v2H6V3h12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "english-input",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path d="M14 10h2v.757a4.5 4.5 0 0 1 7 3.743V20h-2v-5.5c0-1.43-1.175-2.5-2.5-2.5S16 13.07 16 14.5V20h-2V10zm-2-6v2H4v5h8v2H4v5h8v2H2V4h10z"/>\n</svg>\n',
                },
                {
                    name: "flow-chart",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M6 21.5c-1.933 0-3.5-1.567-3.5-3.5s1.567-3.5 3.5-3.5c1.585 0 2.924 1.054 3.355 2.5H15v-2h2V9.242L14.757 7H9V9H3V3h6v2h5.757L18 1.756 22.243 6 19 9.241V15L21 15v6h-6v-2H9.355c-.43 1.446-1.77 2.5-3.355 2.5zm0-5c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm13 .5h-2v2h2v-2zM18 4.586L16.586 6 18 7.414 19.414 6 18 4.586zM7 5H5v2h2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "font-color",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.246 14H8.754l-1.6 4H5l6-15h2l6 15h-2.154l-1.6-4zm-.8-2L12 5.885 9.554 12h4.892zM3 20h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "font-size-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 6v15H8V6H2V4h14v2h-6zm8 8v7h-2v-7h-3v-2h8v2h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "font-size",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.246 15H4.754l-2 5H.6L7 4h2l6.4 16h-2.154l-2-5zm-.8-2L8 6.885 5.554 13h4.892zM21 12.535V12h2v8h-2v-.535a4 4 0 1 1 0-6.93zM19 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "functions",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 18l7.68-6L5 6V4h14v2H8.263L16 12l-7.737 6H19v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "format-clear",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.651 14.065L11.605 20H9.574l1.35-7.661-7.41-7.41L4.93 3.515 20.485 19.07l-1.414 1.414-6.42-6.42zm-.878-6.535l.27-1.53h-1.8l-2-2H20v2h-5.927L13.5 9.257 11.773 7.53z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "h-1",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M13 20h-2v-7H4v7H2V4h2v7h7V4h2v16zm8-12v12h-2v-9.796l-2 .536V8.67L19.5 8H21z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "h-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M4 4v7h7V4h2v16h-2v-7H4v7H2V4h2zm14.5 4c2.071 0 3.75 1.679 3.75 3.75 0 .857-.288 1.648-.772 2.28l-.148.18L18.034 18H22v2h-7v-1.556l4.82-5.546c.268-.307.43-.709.43-1.148 0-.966-.784-1.75-1.75-1.75-.918 0-1.671.707-1.744 1.606l-.006.144h-2C14.75 9.679 16.429 8 18.5 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "h-3",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M22 8l-.002 2-2.505 2.883c1.59.435 2.757 1.89 2.757 3.617 0 2.071-1.679 3.75-3.75 3.75-1.826 0-3.347-1.305-3.682-3.033l1.964-.382c.156.806.866 1.415 1.718 1.415.966 0 1.75-.784 1.75-1.75s-.784-1.75-1.75-1.75c-.286 0-.556.069-.794.19l-1.307-1.547L19.35 10H15V8h7zM4 4v7h7V4h2v16h-2v-7H4v7H2V4h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "h-4",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M13 20h-2v-7H4v7H2V4h2v7h7V4h2v16zm9-12v8h1.5v2H22v2h-2v-2h-5.5v-1.34l5-8.66H22zm-2 3.133L17.19 16H20v-4.867z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "h-5",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M22 8v2h-4.323l-.464 2.636c.33-.089.678-.136 1.037-.136 2.21 0 4 1.79 4 4s-1.79 4-4 4c-1.827 0-3.367-1.224-3.846-2.897l1.923-.551c.24.836 1.01 1.448 1.923 1.448 1.105 0 2-.895 2-2s-.895-2-2-2c-.63 0-1.193.292-1.56.748l-1.81-.904L16 8h6zM4 4v7h7V4h2v16h-2v-7H4v7H2V4h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "h-6",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21.097 8l-2.598 4.5c2.21 0 4.001 1.79 4.001 4s-1.79 4-4 4-4-1.79-4-4c0-.736.199-1.426.546-2.019L18.788 8h2.309zM4 4v7h7V4h2v16h-2v-7H4v7H2V4h2zm14.5 10.5c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hashtag",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.784 14l.42-4H4V8h4.415l.525-5h2.011l-.525 5h3.989l.525-5h2.011l-.525 5H20v2h-3.784l-.42 4H20v2h-4.415l-.525 5h-2.011l.525-5H9.585l-.525 5H7.049l.525-5H4v-2h3.784zm2.011 0h3.99l.42-4h-3.99l-.42 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "indent-decrease",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 4h18v2H3V4zm0 15h18v2H3v-2zm8-5h10v2H11v-2zm0-5h10v2H11V9zm-8 3.5L7 9v7l-4-3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heading",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 11V4h2v17h-2v-8H7v8H5V4h2v7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "indent-increase",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 4h18v2H3V4zm0 15h18v2H3v-2zm8-5h10v2H11v-2zm0-5h10v2H11V9zm-4 3.5L3 16V9l4 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "input-cursor-move",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path d="M8 21v-2h3V5H8V3h8v2h-3v14h3v2H8zM18.05 7.05L23 12l-4.95 4.95-1.414-1.414L20.172 12l-3.536-3.536L18.05 7.05zm-12.1 0l1.414 1.414L3.828 12l3.536 3.536L5.95 16.95 1 12l4.95-4.95z"/>\n</svg>\n',
                },
                {
                    name: "insert-column-left",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1h-6c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h6zm-1 2h-4v14h4V5zM6 7c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm1 2H5v1.999L3 11v2l2-.001V15h2v-2.001L9 13v-2l-2-.001V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "insert-column-right",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M10 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h6zM9 5H5v14h4V5zm9 2c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm1 2h-2v1.999L15 11v2l2-.001V15h2v-2.001L21 13v-2l-2-.001V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "insert-row-bottom",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 13c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm1 2h-2v1.999L9 17v2l2-.001V21h2v-2.001L15 19v-2l-2-.001V15zm7-12c.552 0 1 .448 1 1v6c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zM5 5v4h14V5H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "insert-row-top",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 13c.552 0 1 .448 1 1v6c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1v-6c0-.552.448-1 1-1h16zm-1 2H5v4h14v-4zM12 1c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zm1 2h-2v1.999L9 5v2l2-.001V9h2V6.999L15 7V5l-2-.001V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "italic",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 20H7v-2h2.927l2.116-12H9V4h8v2h-2.927l-2.116 12H15z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "line-height",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 4h10v2H11V4zM6 7v4H4V7H1l4-4 4 4H6zm0 10h3l-4 4-4-4h3v-4h2v4zm5 1h10v2H11v-2zm-2-7h12v2H9v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "link-m",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.657 14.828l-1.414-1.414L17.657 12A4 4 0 1 0 12 6.343l-1.414 1.414-1.414-1.414 1.414-1.414a6 6 0 0 1 8.485 8.485l-1.414 1.414zm-2.829 2.829l-1.414 1.414a6 6 0 1 1-8.485-8.485l1.414-1.414 1.414 1.414L6.343 12A4 4 0 1 0 12 17.657l1.414-1.414 1.414 1.414zm0-9.9l1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "link-unlink-m",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.657 14.828l-1.414-1.414L17.657 12A4 4 0 1 0 12 6.343l-1.414 1.414-1.414-1.414 1.414-1.414a6 6 0 0 1 8.485 8.485l-1.414 1.414zm-2.829 2.829l-1.414 1.414a6 6 0 1 1-8.485-8.485l1.414-1.414 1.414 1.414L6.343 12A4 4 0 1 0 12 17.657l1.414-1.414 1.414 1.414zm0-9.9l1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07zM5.775 2.293l1.932-.518L8.742 5.64l-1.931.518-1.036-3.864zm9.483 16.068l1.931-.518 1.036 3.864-1.932.518-1.035-3.864zM2.293 5.775l3.864 1.036-.518 1.931-3.864-1.035.518-1.932zm16.068 9.483l3.864 1.035-.518 1.932-3.864-1.036.518-1.931z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "link-unlink",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 17h5v2h-3v3h-2v-5zM7 7H2V5h3V2h2v5zm11.364 8.536L16.95 14.12l1.414-1.414a5 5 0 1 0-7.071-7.071L9.879 7.05 8.464 5.636 9.88 4.222a7 7 0 0 1 9.9 9.9l-1.415 1.414zm-2.828 2.828l-1.415 1.414a7 7 0 0 1-9.9-9.9l1.415-1.414L7.05 9.88l-1.414 1.414a5 5 0 1 0 7.071 7.071l1.414-1.414 1.415 1.414zm-.708-10.607l1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "link",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.364 15.536L16.95 14.12l1.414-1.414a5 5 0 1 0-7.071-7.071L9.879 7.05 8.464 5.636 9.88 4.222a7 7 0 0 1 9.9 9.9l-1.415 1.414zm-2.828 2.828l-1.415 1.414a7 7 0 0 1-9.9-9.9l1.415-1.414L7.05 9.88l-1.414 1.414a5 5 0 1 0 7.071 7.071l1.414-1.414 1.415 1.414zm-.708-10.607l1.415 1.415-7.071 7.07-1.415-1.414 7.071-7.07z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "list-check-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 4h10v2H11V4zm0 4h6v2h-6V8zm0 6h10v2H11v-2zm0 4h6v2h-6v-2zM3 4h6v6H3V4zm2 2v2h2V6H5zm-2 8h6v6H3v-6zm2 2v2h2v-2H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "list-check",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 4h13v2H8V4zm-5-.5h3v3H3v-3zm0 7h3v3H3v-3zm0 7h3v3H3v-3zM8 11h13v2H8v-2zm0 7h13v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "list-ordered",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 4h13v2H8V4zM5 3v3h1v1H3V6h1V4H3V3h2zM3 14v-2.5h2V11H3v-1h3v2.5H4v.5h2v1H3zm2 5.5H3v-1h2V18H3v-1h3v4H3v-1h2v-.5zM8 11h13v2H8v-2zm0 7h13v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "list-unordered",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 4h13v2H8V4zM4.5 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM8 11h13v2H8v-2zm0 7h13v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "merge-cells-horizontal",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zm-9 2H5v5.999h2V9l3 3-3 3v-2H5v6h6v-2h2v2h6v-6h-2v2l-3-3 3-3v1.999h2V5h-6v2h-2V5zm2 8v2h-2v-2h2zm0-4v2h-2V9h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "merge-cells-vertical",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 20c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16c.552 0 1 .448 1 1v16zm-2-9V5h-5.999v2H15l-3 3-3-3h2V5H5v6h2v2H5v6h6v-2H9l3-3 3 3h-1.999v2H19v-6h-2v-2h2zm-8 2H9v-2h2v2zm4 0h-2v-2h2v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mind-map",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M18 3c1.657 0 3 1.343 3 3s-1.343 3-3 3h-3c-1.306 0-2.417-.834-2.829-2H11c-1.1 0-2 .9-2 2v.171c1.166.412 2 1.523 2 2.829 0 1.306-.834 2.417-2 2.829V15c0 1.1.9 2 2 2h1.17c.412-1.165 1.524-2 2.83-2h3c1.657 0 3 1.343 3 3s-1.343 3-3 3h-3c-1.306 0-2.417-.834-2.829-2H11c-2.21 0-4-1.79-4-4H5c-1.657 0-3-1.343-3-3s1.343-3 3-3h2c0-2.21 1.79-4 4-4h1.17c.412-1.165 1.524-2 2.83-2h3zm0 14h-3c-.552 0-1 .448-1 1s.448 1 1 1h3c.552 0 1-.448 1-1s-.448-1-1-1zM8 11H5c-.552 0-1 .448-1 1s.448 1 1 1h3c.552 0 1-.448 1-1s-.448-1-1-1zm10-6h-3c-.552 0-1 .448-1 1s.448 1 1 1h3c.552 0 1-.448 1-1s-.448-1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "node-tree",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M10 2c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1H8v2h5V9c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1h-6c-.552 0-1-.448-1-1v-1H8v6h5v-1c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1h-6c-.552 0-1-.448-1-1v-1H7c-.552 0-1-.448-1-1V8H4c-.552 0-1-.448-1-1V3c0-.552.448-1 1-1h6zm9 16h-4v2h4v-2zm0-8h-4v2h4v-2zM9 4H5v2h4V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-0",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1.5c1.321 0 2.484.348 3.447.994.963.645 1.726 1.588 2.249 2.778.522 1.19.804 2.625.804 4.257v4.942c0 1.632-.282 3.068-.804 4.257-.523 1.19-1.286 2.133-2.25 2.778-.962.646-2.125.994-3.446.994-1.321 0-2.484-.348-3.447-.994-.963-.645-1.726-1.588-2.249-2.778-.522-1.19-.804-2.625-.804-4.257V9.529c0-1.632.282-3.068.804-4.257.523-1.19 1.286-2.133 2.25-2.778C9.515 1.848 10.678 1.5 12 1.5zm0 2c-.916 0-1.694.226-2.333.655-.637.427-1.158 1.07-1.532 1.92-.412.94-.635 2.108-.635 3.454v4.942c0 1.346.223 2.514.635 3.453.374.851.895 1.494 1.532 1.921.639.429 1.417.655 2.333.655.916 0 1.694-.226 2.333-.655.637-.427 1.158-1.07 1.532-1.92.412-.94.635-2.108.635-3.454V9.529c0-1.346-.223-2.514-.635-3.453-.374-.851-.895-1.494-1.532-1.921C13.694 3.726 12.916 3.5 12 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-1",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 1.5V22h-2V3.704L7.5 4.91V2.839l5-1.339z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 7.5a4 4 0 1 0-8 0H6a6 6 0 1 1 10.663 3.776l-7.32 8.723L18 20v2H6v-1.127l9.064-10.802A3.982 3.982 0 0 0 16 7.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-3",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2v1.362L12.809 9.55a6.501 6.501 0 1 1-7.116 8.028l1.94-.486A4.502 4.502 0 0 0 16.5 16a4.5 4.5 0 0 0-6.505-4.03l-.228.122-.69-1.207L14.855 4 6.5 4V2H18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-5",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 2v2H9.3l-.677 6.445a6.5 6.5 0 1 1-2.93 7.133l1.94-.486A4.502 4.502 0 0 0 16.5 16a4.5 4.5 0 0 0-4.5-4.5c-2.022 0-3.278.639-3.96 1.53l-1.575-1.182L7.5 2H18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-4",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 1.5V16h3v2h-3v4h-2v-4H4v-1.102L14 1.5h2zM14 16V5.171L6.968 16H14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-6",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.886 2l-4.438 7.686A6.5 6.5 0 1 1 6.4 12.7L12.576 2h2.31zM12 11.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-7",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 2v1.5L10.763 22H8.574l8.013-18H6V2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-8",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1.5a5.5 5.5 0 0 1 3.352 9.86C17.24 12.41 18.5 14.32 18.5 16.5c0 3.314-2.91 6-6.5 6s-6.5-2.686-6.5-6c0-2.181 1.261-4.09 3.147-5.141A5.5 5.5 0 0 1 12 1.5zm0 11c-2.52 0-4.5 1.828-4.5 4 0 2.172 1.98 4 4.5 4s4.5-1.828 4.5-4c0-2.172-1.98-4-4.5-4zm0-9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "number-9",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1.5a6.5 6.5 0 0 1 5.619 9.77l-6.196 10.729H9.114l4.439-7.686A6.5 6.5 0 1 1 12 1.5zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "omega",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 20v-2.157c1.863-1.192 3.5-3.875 3.5-6.959 0-3.073-2-6.029-5.5-6.029s-5.5 2.956-5.5 6.03c0 3.083 1.637 5.766 3.5 6.958V20H3v-2h4.76C5.666 16.505 4 13.989 4 10.884 4 6.247 7.5 3 12 3s8 3.247 8 7.884c0 3.105-1.666 5.621-3.76 7.116H21v2h-7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "organization-chart",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 3c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1h-2v2h4c.552 0 1 .448 1 1v3h2c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1h-6c-.552 0-1-.448-1-1v-4c0-.552.448-1 1-1h2v-2H8v2h2c.552 0 1 .448 1 1v4c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1v-4c0-.552.448-1 1-1h2v-3c0-.552.448-1 1-1h4V9H9c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h6zM9 17H5v2h4v-2zm10 0h-4v2h4v-2zM14 5h-4v2h4V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "page-separator",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 21v-4H7v4H5v-5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v5h-2zM7 3v4h10V3h2v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3h2zM2 9l4 3-4 3V9zm20 0v6l-4-3 4-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "paragraph",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 6v15h-2v-5a6 6 0 1 1 0-12h10v2h-3v15h-2V6h-3zm-2 0a4 4 0 1 0 0 8V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pinyin-input",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path d="M17.934 3.036l1.732 1L18.531 6H21v2h-2v4h2v2h-2v7h-2v-7h-3.084c-.325 2.862-1.564 5.394-3.37 7.193l-1.562-1.27c1.52-1.438 2.596-3.522 2.917-5.922L10 14v-2l2-.001V8h-2V6h2.467l-1.133-1.964 1.732-1L14.777 6h1.444l1.713-2.964zM5 13.803l-2 .536v-2.071l2-.536V8H3V6h2V3h2v3h2v2H7v3.197l2-.536v2.07l-2 .536V18.5A2.5 2.5 0 0 1 4.5 21H3v-2h1.5a.5.5 0 0 0 .492-.41L5 18.5v-4.697zM17 8h-3v4h3V8z"/>\n</svg>\n',
                },
                {
                    name: "question-mark",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 19c.828 0 1.5.672 1.5 1.5S12.828 22 12 22s-1.5-.672-1.5-1.5.672-1.5 1.5-1.5zm0-17c3.314 0 6 2.686 6 6 0 2.165-.753 3.29-2.674 4.923C13.399 14.56 13 15.297 13 17h-2c0-2.474.787-3.695 3.031-5.601C15.548 10.11 16 9.434 16 8c0-2.21-1.79-4-4-4S8 5.79 8 8v1H6V8c0-3.314 2.686-6 6-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rounded-corner",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 19v2h-2v-2h2zm-4 0v2h-2v-2h2zm-4 0v2h-2v-2h2zm-4 0v2H7v-2h2zm-4 0v2H3v-2h2zm16-4v2h-2v-2h2zM5 15v2H3v-2h2zm0-4v2H3v-2h2zm11-8c2.687 0 4.882 2.124 4.995 4.783L21 8v5h-2V8c0-1.591-1.255-2.903-2.824-2.995L16 5h-5V3h5zM5 7v2H3V7h2zm0-4v2H3V3h2zm4 0v2H7V3h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "send-backward",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M14 3c.552 0 1 .448 1 1v5h5c.552 0 1 .448 1 1v10c0 .552-.448 1-1 1H10c-.552 0-1-.448-1-1v-5H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h10zm-1 2H5v8h4v-3c0-.552.448-1 1-1h3V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "send-to-back",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 3c.552 0 1 .448 1 1v2h5c.552 0 1 .448 1 1v5h2c.552 0 1 .448 1 1v7c0 .552-.448 1-1 1h-7c-.552 0-1-.448-1-1v-2H7c-.552 0-1-.448-1-1v-5H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h7zm5 5h-4v3c0 .552-.448 1-1 1H8v4h4v-3c0-.552.448-1 1-1h3V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "separator",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 11h2v2H2v-2zm4 0h12v2H6v-2zm14 0h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "single-quotes-l",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.583 17.321C8.553 16.227 8 15 8 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "single-quotes-r",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.417 6.679C15.447 7.773 16 9 16 10.989c0 3.5-2.457 6.637-6.03 8.188l-.893-1.378c3.335-1.804 3.987-4.145 4.247-5.621-.537.278-1.24.375-1.929.311C9.591 12.322 8.17 10.841 8.17 9a3.5 3.5 0 0 1 3.5-3.5c1.073 0 2.099.49 2.748 1.179z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sort-asc",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19 3l4 5h-3v12h-2V8h-3l4-5zm-5 15v2H3v-2h11zm0-7v2H3v-2h11zm-2-7v2H3V4h9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sort-desc",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 4v12h3l-4 5-4-5h3V4h2zm-8 14v2H3v-2h9zm2-7v2H3v-2h11zm0-7v2H3V4h11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "split-cells-horizontal",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zm-9 2H5v14h6v-4h2v4h6V5h-6v4h-2V5zm4 4l3 3-3 3v-2H9v2l-3-3 3-3v2h6V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "space",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 9v4h16V9h2v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "split-cells-vertical",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zm-1 2H5v5.999L9 11v2H5v6h14v-6h-4v-2l4-.001V5zm-7 1l3 3h-2v6h2l-3 3-3-3h2V9H9l3-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "strikethrough-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 9h-2V6H5V4h14v2h-6v3zm0 6v5h-2v-5h2zM3 11h18v2H3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "strikethrough",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.154 14c.23.516.346 1.09.346 1.72 0 1.342-.524 2.392-1.571 3.147C14.88 19.622 13.433 20 11.586 20c-1.64 0-3.263-.381-4.87-1.144V16.6c1.52.877 3.075 1.316 4.666 1.316 2.551 0 3.83-.732 3.839-2.197a2.21 2.21 0 0 0-.648-1.603l-.12-.117H3v-2h18v2h-3.846zm-4.078-3H7.629a4.086 4.086 0 0 1-.481-.522C6.716 9.92 6.5 9.246 6.5 8.452c0-1.236.466-2.287 1.397-3.153C8.83 4.433 10.271 4 12.222 4c1.471 0 2.879.328 4.222.984v2.152c-1.2-.687-2.515-1.03-3.946-1.03-2.48 0-3.719.782-3.719 2.346 0 .42.218.786.654 1.099.436.313.974.562 1.613.75.62.18 1.297.414 2.03.699z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "subscript-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 6v13H9V6H3V4h14v2h-6zm8.55 10.58a.8.8 0 1 0-1.32-.36l-1.154.33A2.001 2.001 0 0 1 19 14a2 2 0 0 1 1.373 3.454L18.744 19H21v1h-4v-1l2.55-2.42z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "subscript",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.596 4L10.5 9.928 15.404 4H18l-6.202 7.497L18 18.994V19h-2.59l-4.91-5.934L5.59 19H3v-.006l6.202-7.497L3 4h2.596zM21.55 16.58a.8.8 0 1 0-1.32-.36l-1.155.33A2.001 2.001 0 0 1 21 14a2 2 0 0 1 1.373 3.454L20.744 19H23v1h-4v-1l2.55-2.42z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "superscript-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 7v13H9V7H3V5h12v2h-4zm8.55-.42a.8.8 0 1 0-1.32-.36l-1.154.33A2.001 2.001 0 0 1 19 4a2 2 0 0 1 1.373 3.454L18.744 9H21v1h-4V9l2.55-2.42z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "superscript",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.596 5l4.904 5.928L15.404 5H18l-6.202 7.497L18 19.994V20h-2.59l-4.91-5.934L5.59 20H3v-.006l6.202-7.497L3 5h2.596zM21.55 6.58a.8.8 0 1 0-1.32-.36l-1.155.33A2.001 2.001 0 0 1 21 4a2 2 0 0 1 1.373 3.454L20.744 9H23v1h-4V9l2.55-2.42z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "table-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M13 10v4h6v-4h-6zm-2 0H5v4h6v-4zm2 9h6v-3h-6v3zm-2 0v-3H5v3h6zm2-14v3h6V5h-6zm-2 0H5v3h6V5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "text-direction-r",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 5v10H9v-4a4 4 0 1 1 0-8h8v2h-2v10h-2V5h-2zM9 5a2 2 0 1 0 0 4V5zM7 17h12v2H7v2.5L3 18l4-3.5V17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "text-direction-l",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 5v10H9v-4a4 4 0 1 1 0-8h8v2h-2v10h-2V5h-2zM9 5a2 2 0 1 0 0 4V5zm8 12v-2.5l4 3.5-4 3.5V19H5v-2h12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "text-spacing",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 17h10v-2.5l3.5 3.5-3.5 3.5V19H7v2.5L3.5 18 7 14.5V17zm6-11v9h-2V6H5V4h14v2h-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "text-wrap",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 18h1.5a2.5 2.5 0 1 0 0-5H3v-2h13.5a4.5 4.5 0 1 1 0 9H15v2l-4-3 4-3v2zM3 4h18v2H3V4zm6 14v2H3v-2h6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "text",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 6v15h-2V6H5V4h14v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "translate-2",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.5 10l4.4 11h-2.155l-1.201-3h-4.09l-1.199 3h-2.154L16.5 10h2zM10 2v2h6v2h-1.968a18.222 18.222 0 0 1-3.62 6.301 14.864 14.864 0 0 0 2.336 1.707l-.751 1.878A17.015 17.015 0 0 1 9 13.725a16.676 16.676 0 0 1-6.201 3.548l-.536-1.929a14.7 14.7 0 0 0 5.327-3.042A18.078 18.078 0 0 1 4.767 8h2.24A16.032 16.032 0 0 0 9 10.877a16.165 16.165 0 0 0 2.91-4.876L2 6V4h6V2h2zm7.5 10.885L16.253 16h2.492L17.5 12.885z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "translate",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 15v2a2 2 0 0 0 1.85 1.995L7 19h3v2H7a4 4 0 0 1-4-4v-2h2zm13-5l4.4 11h-2.155l-1.201-3h-4.09l-1.199 3h-2.154L16 10h2zm-1 2.885L15.753 16h2.492L17 12.885zM8 2v2h4v7H8v3H6v-3H2V4h4V2h2zm9 1a4 4 0 0 1 4 4v2h-2V7a2 2 0 0 0-2-2h-3V3h3zM6 6H4v3h2V6zm4 0H8v3h2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "underline",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 3v9a4 4 0 1 0 8 0V3h2v9a6 6 0 1 1-12 0V3h2zM4 20h16v2H4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wubi-input",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path d="M3 21v-2h3.662l1.234-7H5v-2h3.249l.881-5H4V3h16v2h-8.839l-.882 5H18v9h3v2H3zm13-9H9.927l-1.235 7H16v-7z"/>\n</svg>\n',
                },
            ]
        },
        {
            name: "finance",
            iconsvg: [
                {
                    name: "24-hours-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 13c1.657 0 3 1.343 3 3 0 .85-.353 1.616-.92 2.162L12.17 20H15v2H9v-1.724l3.693-3.555c.19-.183.307-.438.307-.721 0-.552-.448-1-1-1s-1 .448-1 1H9c0-1.657 1.343-3 3-3zm6 0v4h2v-4h2v9h-2v-3h-4v-6h2zM4 12c0 2.527 1.171 4.78 3 6.246v2.416C4.011 18.933 2 15.702 2 12h2zm8-10c5.185 0 9.449 3.947 9.95 9h-2.012C19.446 7.054 16.08 4 12 4 9.536 4 7.332 5.114 5.865 6.865L8 9H2V3l2.447 2.446C6.28 3.336 8.984 2 12 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "24-hours-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 13c1.657 0 3 1.343 3 3 0 .85-.353 1.616-.92 2.162L12.17 20H15v2H9v-1.724l3.693-3.555c.19-.183.307-.438.307-.721 0-.552-.448-1-1-1s-1 .448-1 1H9c0-1.657 1.343-3 3-3zm6 0v4h2v-4h2v9h-2v-3h-4v-6h2zM4 12c0 2.527 1.171 4.78 3 6.246v2.416C4.011 18.933 2 15.702 2 12h2zm8-10c5.185 0 9.449 3.947 9.95 9h-2.012C19.446 7.054 16.08 4 12 4 9.25 4 6.824 5.387 5.385 7.5H8v2H2v-6h2V6c1.824-2.43 4.729-4 8-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bank-card-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm17 9H4v7h16v-7zm0-4V5H4v3h16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "auction-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 20v2H2v-2h12zM14.586.686l7.778 7.778L20.95 9.88l-1.06-.354L17.413 12l5.657 5.657-1.414 1.414L16 13.414l-2.404 2.404.283 1.132-1.415 1.414-7.778-7.778 1.415-1.414 1.13.282 6.294-6.293-.353-1.06L14.586.686zm.707 3.536l-7.071 7.07 3.535 3.536 7.071-7.07-3.535-3.536z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "auction-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 20v2H2v-2h12zM14.586.686l7.778 7.778L20.95 9.88l-1.06-.354L17.413 12l5.657 5.657-1.414 1.414L16 13.414l-2.404 2.404.283 1.132-1.415 1.414-7.778-7.778 1.415-1.414 1.13.282 6.294-6.293-.353-1.06L14.586.686z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bank-card-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9h20zm0-4H2V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bank-card-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 10v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10h20zm0-2H2V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v4zm-7 8v2h4v-2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bit-coin-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-6v2h2v-2h1a2.5 2.5 0 0 0 2-4 2.5 2.5 0 0 0-2-4h-1V6h-2v2H8v8h3zm-1-3h4a.5.5 0 1 1 0 1h-4v-1zm0-3h4a.5.5 0 1 1 0 1h-4v-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bank-card-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm17 8H4v8h16v-8zm0-2V5H4v4h16zm-6 6h4v2h-4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bit-coin-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-4H8V8h3V6h2v2h1a2.5 2.5 0 0 1 2 4 2.5 2.5 0 0 1-2 4h-1v2h-2v-2zm-1-3v1h4a.5.5 0 1 0 0-1h-4zm0-3v1h4a.5.5 0 1 0 0-1h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coin-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M23 12v2c0 3.314-4.925 6-11 6-5.967 0-10.824-2.591-10.995-5.823L1 14v-2c0 3.314 4.925 6 11 6s11-2.686 11-6zM12 4c6.075 0 11 2.686 11 6s-4.925 6-11 6-11-2.686-11-6 4.925-6 11-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coin-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 4c6.075 0 11 2.686 11 6v4c0 3.314-4.925 6-11 6-5.967 0-10.824-2.591-10.995-5.823L1 14v-4c0-3.314 4.925-6 11-6zm0 12c-3.72 0-7.01-1.007-9-2.55V14c0 1.882 3.883 4 9 4 5.01 0 8.838-2.03 8.995-3.882L21 14l.001-.55C19.011 14.992 15.721 16 12 16zm0-10c-5.117 0-9 2.118-9 4 0 1.882 3.883 4 9 4s9-2.118 9-4c0-1.882-3.883-4-9-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coins-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14 2a8 8 0 0 1 3.292 15.293A8 8 0 1 1 6.706 6.707 8.003 8.003 0 0 1 14 2zm-4 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm1 1v1h2v2H9a.5.5 0 0 0-.09.992L9 13h2a2.5 2.5 0 1 1 0 5v1H9v-1H7v-2h4a.5.5 0 0 0 .09-.992L11 15H9a2.5 2.5 0 1 1 0-5V9h2zm3-5a5.985 5.985 0 0 0-4.484 2.013 8 8 0 0 1 8.47 8.471A6 6 0 0 0 14 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coins-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 2a8 8 0 0 1 3.292 15.293A8 8 0 1 1 6.706 6.707 8.003 8.003 0 0 1 14 2zm-3 7H9v1a2.5 2.5 0 0 0-.164 4.995L9 15h2l.09.008a.5.5 0 0 1 0 .984L11 16H7v2h2v1h2v-1a2.5 2.5 0 0 0 .164-4.995L11 13H9l-.09-.008a.5.5 0 0 1 0-.984L9 12h4v-2h-2V9zm3-5a5.985 5.985 0 0 0-4.484 2.013 8 8 0 0 1 8.47 8.471A6 6 0 0 0 14 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "copper-diamond-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9 8h6l2.5 3.5L12 17l-5.5-5.5L9 8zm1.03 2l-.92 1.29L12 14.18l2.89-2.89-.92-1.29h-3.94z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "copper-coin-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-14.243L7.757 12 12 16.243 16.243 12 12 7.757z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "copper-coin-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-12.95L16.95 12 12 16.95 7.05 12 12 7.05zm0 2.829L9.879 12 12 14.121 14.121 12 12 9.879z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "copper-diamond-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM9.5 9L7 11.5l5 5 5-5L14.5 9h-5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 3v18H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5V4a1 1 0 0 1 1-1h11zm2 0h5a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1h-5V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zm6.085 15a1.5 1.5 0 0 1 2.83 0H20v-2.968a4.5 4.5 0 0 1 0-8.064V5h-9.085a1.5 1.5 0 0 1-2.83 0H4v14h4.085zM9.5 11a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 21a1.5 1.5 0 0 0-3 0H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a1.5 1.5 0 0 0 3 0h10a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H11zM9.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 9.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5zM14 5H4v2.968a4.5 4.5 0 0 1 0 8.064V19h10V5zm2 0v14h4v-2.968a4.5 4.5 0 0 1 0-8.064V5h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7a2 2 0 1 0 4 0h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7a2 2 0 1 0-4 0zM6 8v8h2V8H6zm10 0v8h2V8h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 14v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a2 2 0 1 0 0-4V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7a2 2 0 1 0 0 4zm-2 1.465A3.998 3.998 0 0 1 17 12c0-1.48.804-2.773 2-3.465V4H5v4.535C6.196 9.227 7 10.52 7 12c0 1.48-.804 2.773-2 3.465V20h14v-4.535zM9 6h6v2H9V6zm0 10h6v2H9v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 21H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7a2 2 0 1 0 4 0h7a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-7a2 2 0 1 0-4 0zm-1.465-2A3.998 3.998 0 0 1 12 17c1.48 0 2.773.804 3.465 2H20V5h-4.535A3.998 3.998 0 0 1 12 7a3.998 3.998 0 0 1-3.465-2H4v14h4.535zM6 8h2v8H6V8zm10 0h2v8h-2V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 14v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a2 2 0 1 0 0-4V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7a2 2 0 1 0 0 4zM9 6v2h6V6H9zm0 10v2h6v-2H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 9.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5zM9 9v2h6V9H9zm0 4v2h6v-2H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "currency-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 16h2V4H9v2h8v10zm0 2v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3zM7 16v2h2v1h2v-1h.5a2.5 2.5 0 1 0 0-5h-3a.5.5 0 1 1 0-1H13v-2h-2V9H9v1h-.5a2.5 2.5 0 1 0 0 5h3a.5.5 0 1 1 0 1H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "currency-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 16h2V4H9v2h8v10zm0 2v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3zM5.003 8L5 20h10V8H5.003zM7 16h4.5a.5.5 0 1 0 0-1h-3a2.5 2.5 0 1 1 0-5H9V9h2v1h2v2H8.5a.5.5 0 1 0 0 1h3a2.5 2.5 0 1 1 0 5H11v1H9v-1H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "coupon-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 9.5V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5zm2-1.532a4.5 4.5 0 0 1 0 8.064V19h16v-2.968a4.5 4.5 0 0 1 0-8.064V5H4v2.968zM9 9h6v2H9V9zm0 4h6v2H9v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-cny-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.375 15.103A8.001 8.001 0 0 0 8.03 5.053l-.992-1.737A9.996 9.996 0 0 1 17 3.34c4.49 2.592 6.21 8.142 4.117 12.77l1.342.774-4.165 2.214-.165-4.714 1.246.719zM4.625 8.897a8.001 8.001 0 0 0 11.345 10.05l.992 1.737A9.996 9.996 0 0 1 7 20.66C2.51 18.068.79 12.518 2.883 7.89L1.54 7.117l4.165-2.214.165 4.714-1.246-.719zM13 13.536h3v2h-3v2h-2v-2H8v-2h3v-1H8v-2h2.586L8.464 8.414 9.88 7 12 9.121 14.121 7l1.415 1.414-2.122 2.122H16v2h-3v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9 6H8v2h9l-5-5v3zm-5 4l5 5v-3h4v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm9 6V6l5 5H8V9h4zm-5 4h9v2h-4v3l-5-5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-cny-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.373 4.51A9.962 9.962 0 0 1 12 2c5.523 0 10 4.477 10 10a9.954 9.954 0 0 1-1.793 5.715L17.5 12H20A8 8 0 0 0 6.274 6.413l-.9-1.902zm13.254 14.98A9.962 9.962 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.125.663-4.095 1.793-5.715L6.5 12H4a8 8 0 0 0 13.726 5.587l.9 1.902zM13 13.535h3v2h-3v2h-2v-2H8v-2h3v-1H8v-2h2.586L8.464 8.414 9.88 7 12 9.121 14.121 7l1.415 1.414-2.122 2.122H16v2h-3v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-dollar-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.373 4.51A9.962 9.962 0 0 1 12 2c5.523 0 10 4.477 10 10a9.954 9.954 0 0 1-1.793 5.715L17.5 12H20A8 8 0 0 0 6.274 6.413l-.9-1.902zm13.254 14.98A9.962 9.962 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.125.663-4.095 1.793-5.715L6.5 12H4a8 8 0 0 0 13.726 5.587l.9 1.902zM8.5 14H14a.5.5 0 1 0 0-1h-4a2.5 2.5 0 1 1 0-5h1V7h2v1h2.5v2H10a.5.5 0 1 0 0 1h4a2.5 2.5 0 1 1 0 5h-1v1h-2v-1H8.5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-13H8v2h9l-5-5v3zm-5 4l5 5v-3h4v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-dollar-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.375 15.103A8.001 8.001 0 0 0 8.03 5.053l-.992-1.737A9.996 9.996 0 0 1 17 3.34c4.49 2.592 6.21 8.142 4.117 12.77l1.342.774-4.165 2.214-.165-4.714 1.246.719zM4.625 8.897a8.001 8.001 0 0 0 11.345 10.05l.992 1.737A9.996 9.996 0 0 1 7 20.66C2.51 18.068.79 12.518 2.883 7.89L1.54 7.117l4.165-2.214.165 4.714-1.246-.719zM8.5 14H14a.5.5 0 1 0 0-1h-4a2.5 2.5 0 1 1 0-5h1V7h2v1h2.5v2H10a.5.5 0 1 0 0 1h4a2.5 2.5 0 1 1 0 5h-1v1h-2v-1H8.5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-funds-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.373 4.51A9.962 9.962 0 0 1 12 2c5.523 0 10 4.477 10 10a9.954 9.954 0 0 1-1.793 5.715L17.5 12H20A8 8 0 0 0 6.274 6.413l-.9-1.902zm13.254 14.98A9.962 9.962 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.125.663-4.095 1.793-5.715L6.5 12H4a8 8 0 0 0 13.726 5.587l.9 1.902zm-5.213-4.662L10.586 12l-2.829 2.828-1.414-1.414 4.243-4.242L13.414 12l2.829-2.828 1.414 1.414-4.243 4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-funds-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.375 15.103A8.001 8.001 0 0 0 8.03 5.053l-.992-1.737A9.996 9.996 0 0 1 17 3.34c4.49 2.592 6.21 8.142 4.117 12.77l1.342.774-4.165 2.214-.165-4.714 1.246.719zM4.625 8.897a8.001 8.001 0 0 0 11.345 10.05l.992 1.737A9.996 9.996 0 0 1 7 20.66C2.51 18.068.79 12.518 2.883 7.89L1.54 7.117l4.165-2.214.165 4.714-1.246-.719zm8.79 5.931L10.584 12l-2.828 2.828-1.414-1.414 4.243-4.242L13.414 12l2.829-2.828 1.414 1.414-4.243 4.242z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "funds-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm11.793 6.793L13 8h5v5l-1.793-1.793-3.864 3.864-2.121-2.121-2.829 2.828-1.414-1.414 4.243-4.243 2.121 2.122 2.45-2.45z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "exchange-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-5-7h9v2h-4v3l-5-5zm5-4V6l5 5H8V9h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "funds-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm11.793 6.793l-2.45 2.45-2.121-2.122-4.243 4.243 1.414 1.414 2.829-2.828 2.121 2.121 3.864-3.864L18 13V8h-5l1.793 1.793z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gift-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14.5 2a3.5 3.5 0 0 1 3.163 5.001L21 7a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1l3.337.001a3.5 3.5 0 0 1 5.664-3.95A3.48 3.48 0 0 1 14.5 2zM18 13H6v7h12v-7zm2-4H4v2h16V9zM9.5 4a1.5 1.5 0 0 0-.144 2.993L9.5 7H11V5.5a1.5 1.5 0 0 0-1.356-1.493L9.5 4zm5 0l-.144.007a1.5 1.5 0 0 0-1.35 1.349L13 5.5V7h1.5l.144-.007a1.5 1.5 0 0 0 0-2.986L14.5 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "funds-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3.897 17.86l3.91-3.91 2.829 2.828 4.571-4.57L17 14V9h-5l1.793 1.793-3.157 3.157-2.828-2.829-4.946 4.946A9.965 9.965 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10a9.987 9.987 0 0 1-8.103-4.14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "funds-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.406 14.523l3.402-3.402 2.828 2.829 3.157-3.157L12 9h5v5l-1.793-1.793-4.571 4.571-2.828-2.828-2.475 2.474a8 8 0 1 0-.927-1.9zm-1.538 1.558l-.01-.01.004-.004A9.965 9.965 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10c-4.07 0-7.57-2.43-9.132-5.919z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gift-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 13v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7h16zM14.5 2a3.5 3.5 0 0 1 3.163 5.001L21 7a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1l3.337.001a3.5 3.5 0 0 1 5.664-3.95A3.48 3.48 0 0 1 14.5 2zm-5 2a1.5 1.5 0 0 0-.144 2.993L9.5 7H11V5.5a1.5 1.5 0 0 0-1.356-1.493L9.5 4zm5 0l-.144.007a1.5 1.5 0 0 0-1.35 1.349L13 5.5V7h1.5l.144-.007a1.5 1.5 0 0 0 0-2.986L14.5 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gift-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 2a4 4 0 0 1 3.464 6.001L23 8v2h-2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10H1V8l4.536.001A4 4 0 0 1 12 3.355 3.983 3.983 0 0 1 15 2zm-2 8h-2v10h2V10zM9 4a2 2 0 0 0-.15 3.995L9 8h2V6a2 2 0 0 0-1.697-1.977l-.154-.018L9 4zm6 0a2 2 0 0 0-1.995 1.85L13 6v2h2a2 2 0 0 0 1.995-1.85L17 6a2 2 0 0 0-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hand-coin-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M5 9a1 1 0 0 1 1 1 6.97 6.97 0 0 1 4.33 1.5h2.17c1.333 0 2.53.58 3.354 1.5H19a5 5 0 0 1 4.516 2.851C21.151 18.972 17.322 21 13 21c-2.79 0-5.15-.603-7.06-1.658A.998.998 0 0 1 5 20H2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm1.001 3L6 17.022l.045.032C7.84 18.314 10.178 19 13 19c3.004 0 5.799-1.156 7.835-3.13l.133-.133-.12-.1a2.994 2.994 0 0 0-1.643-.63L19 15h-2.111c.072.322.111.656.111 1v1H8v-2l6.79-.001-.034-.078a2.501 2.501 0 0 0-2.092-1.416L12.5 13.5H9.57A4.985 4.985 0 0 0 6.002 12zM4 11H3v7h1v-7zm14-6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-7-5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gift-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15 2a4 4 0 0 1 3.464 6.001L23 8v2h-2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10H1V8l4.536.001A4 4 0 0 1 12 3.355 3.983 3.983 0 0 1 15 2zm-4 8H5v9h6v-9zm8 0h-6v9h6v-9zM9 4a2 2 0 0 0-.15 3.995L9 8h2V6a2 2 0 0 0-1.697-1.977l-.154-.018L9 4zm6 0a2 2 0 0 0-1.995 1.85L13 6v2h2a2 2 0 0 0 1.995-1.85L17 6a2 2 0 0 0-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hand-coin-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M9.33 11.5h2.17A4.5 4.5 0 0 1 16 16H8.999L9 17h8v-1a5.578 5.578 0 0 0-.886-3H19a5 5 0 0 1 4.516 2.851C21.151 18.972 17.322 21 13 21c-2.761 0-5.1-.59-7-1.625L6 10.071A6.967 6.967 0 0 1 9.33 11.5zM5 19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9zM18 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-7-3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hand-heart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.33 11.5h2.17A4.5 4.5 0 0 1 16 16H8.999L9 17h8v-1a5.578 5.578 0 0 0-.886-3H19a5 5 0 0 1 4.516 2.851C21.151 18.972 17.322 21 13 21c-2.761 0-5.1-.59-7-1.625L6 10.071A6.967 6.967 0 0 1 9.33 11.5zM4 9a1 1 0 0 1 .993.883L5 10V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h2zm9.646-5.425L14 3.93l.354-.354a2.5 2.5 0 1 1 3.535 3.536L14 11l-3.89-3.89a2.5 2.5 0 1 1 3.536-3.535z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hand-heart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M5 9a1 1 0 0 1 1 1 6.97 6.97 0 0 1 4.33 1.5h2.17c1.332 0 2.53.579 3.353 1.499L19 13a5 5 0 0 1 4.516 2.851C21.151 18.972 17.322 21 13 21c-2.79 0-5.15-.603-7.06-1.658A.998.998 0 0 1 5 20H2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm1.001 3L6 17.021l.045.033C7.84 18.314 10.178 19 13 19c3.004 0 5.799-1.156 7.835-3.13l.133-.133-.12-.1a2.994 2.994 0 0 0-1.643-.63L19 15l-2.112-.001c.073.322.112.657.112 1.001v1H8v-2l6.79-.001-.034-.078a2.501 2.501 0 0 0-2.092-1.416L12.5 13.5H9.57A4.985 4.985 0 0 0 6.002 12zM4 11H3v7h1v-7zm9.646-7.425L14 3.93l.354-.354a2.5 2.5 0 1 1 3.535 3.536L14 11l-3.89-3.89a2.5 2.5 0 1 1 3.536-3.535zm-2.12 1.415a.5.5 0 0 0-.06.637l.058.069L14 8.17l2.476-2.474a.5.5 0 0 0 .058-.638l-.058-.07a.5.5 0 0 0-.638-.057l-.07.058-1.769 1.768-1.767-1.77-.068-.056a.5.5 0 0 0-.638.058z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "increase-decrease-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm6 8V9H7v2H5v2h2v2h2v-2h2v-2H9zm4 0v2h6v-2h-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "increase-decrease-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm5 6h2v2H9v2H7v-2H5v-2h2V9h2v2zm4 0h6v2h-6v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-cny-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-7h3v2h-3v2h-2v-2H8v-2h3v-1H8v-2h2.586L8.464 7.879 9.88 6.464 12 8.586l2.121-2.122 1.415 1.415L13.414 10H16v2h-3v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-cny-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm10 10v-1h3v-2h-2.586l2.122-2.121-1.415-1.415L12 8.586 9.879 6.464 8.464 7.88 10.586 10H8v2h3v1H8v2h3v2h2v-2h3v-2h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-cny-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm9 8h3v2h-3v2h-2v-2H8v-2h3v-1H8v-2h2.586L8.464 7.879 9.88 6.464 12 8.586l2.121-2.122 1.415 1.415L13.414 10H16v2h-3v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-dollar-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-3.5-8v2H11v2h2v-2h1a2.5 2.5 0 1 0 0-5h-4a.5.5 0 1 1 0-1h5.5V8H13V6h-2v2h-1a2.5 2.5 0 0 0 0 5h4a.5.5 0 1 1 0 1H8.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-cny-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm1-9v-1h3v-2h-2.586l2.122-2.121-1.415-1.415L12 8.586 9.879 6.464 8.464 7.88 10.586 10H8v2h3v1H8v2h3v2h2v-2h3v-2h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-dollar-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm4.5 9H14a.5.5 0 1 0 0-1h-4a2.5 2.5 0 1 1 0-5h1V6h2v2h2.5v2H10a.5.5 0 1 0 0 1h4a2.5 2.5 0 1 1 0 5h-1v2h-2v-2H8.5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-dollar-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5.5 11v2H11v2h2v-2h1a2.5 2.5 0 1 0 0-5h-4a.5.5 0 1 1 0-1h5.5V8H13V6h-2v2h-1a2.5 2.5 0 0 0 0 5h4a.5.5 0 1 1 0 1H8.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-dollar-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-3.5-6H14a.5.5 0 1 0 0-1h-4a2.5 2.5 0 1 1 0-5h1V6h2v2h2.5v2H10a.5.5 0 1 0 0 1h4a2.5 2.5 0 1 1 0 5h-1v2h-2v-2H8.5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-euro-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm6.05 6H15v2h-4.95a2.5 2.5 0 0 0 4.064 1.41l1.7 1.133A4.5 4.5 0 0 1 8.028 13H7v-2h1.027a4.5 4.5 0 0 1 7.788-2.543L14.114 9.59A2.5 2.5 0 0 0 10.05 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-euro-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7.05 8a2.5 2.5 0 0 1 4.064-1.41l1.701-1.133A4.5 4.5 0 0 0 8.028 11H7v2h1.027a4.5 4.5 0 0 0 7.788 2.543l-1.701-1.134A2.5 2.5 0 0 1 10.05 13l4.95.001v-2h-4.95z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-euro-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1.95-11a2.5 2.5 0 0 1 4.064-1.41l1.701-1.133A4.5 4.5 0 0 0 8.028 11H7v2h1.027a4.5 4.5 0 0 0 7.788 2.543l-1.701-1.134A2.5 2.5 0 0 1 10.05 13l4.95.001v-2h-4.95z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-euro-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1.95-9H15v2h-4.95a2.5 2.5 0 0 0 4.064 1.41l1.7 1.133A4.5 4.5 0 0 1 8.028 13H7v-2h1.027a4.5 4.5 0 0 1 7.788-2.543L14.114 9.59A2.5 2.5 0 0 0 10.05 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-pound-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm6 10v2H8v2h8v-2h-5v-2h3v-2h-3v-1a1.5 1.5 0 0 1 2.76-.815l1.986-.496A3.501 3.501 0 0 0 9 10v1H8v2h1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-pound-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5H4zm5 8H8v-2h1v-1a3.5 3.5 0 0 1 6.746-1.311l-1.986.496A1.499 1.499 0 0 0 11 10v1h3v2h-3v2h5v2H8v-2h1v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-pound-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-3-7H8v-2h1v-1a3.5 3.5 0 0 1 6.746-1.311l-1.986.496A1.499 1.499 0 0 0 11 10v1h3v2h-3v2h5v2H8v-2h1v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "money-pound-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-3-9v2H8v2h8v-2h-5v-2h3v-2h-3v-1a1.5 1.5 0 0 1 2.76-.815l1.986-.496A3.501 3.501 0 0 0 9 10v1H8v2h1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "price-tag-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 7l8.445-5.63a1 1 0 0 1 1.11 0L21 7v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7zm2 1.07V20h14V8.07l-7-4.666L5 8.07zM8 16h8v2H8v-2zm0-3h8v2H8v-2zm4-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "percent-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.5 21a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm-11-11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm12.571-6.485l1.414 1.414L4.93 20.485l-1.414-1.414L19.07 3.515z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "percent-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.5 21a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm0-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-11-9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm0-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm12.571-4.485l1.414 1.414L4.93 20.485l-1.414-1.414L19.07 3.515z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "price-tag-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 7l8.445-5.63a1 1 0 0 1 1.11 0L21 7v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7zm9 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-4 5v2h8v-2H8zm0-3v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "price-tag-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 7l8.445-5.63a1 1 0 0 1 1.11 0L21 7v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7zm2 1.07V20h14V8.07l-7-4.666L5 8.07zM12 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "price-tag-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.9 2.1l9.899 1.415 1.414 9.9-9.192 9.192a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414L10.9 2.1zm2.828 8.486a2 2 0 1 0 2.828-2.829 2 2 0 0 0-2.828 2.829z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "price-tag-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.9 2.1l9.899 1.415 1.414 9.9-9.192 9.192a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414L10.9 2.1zm.707 2.122L3.828 12l8.486 8.485 7.778-7.778-1.06-7.425-7.425-1.06zm2.12 6.364a2 2 0 1 1 2.83-2.829 2 2 0 0 1-2.83 2.829z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "price-tag-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 7l8.445-5.63a1 1 0 0 1 1.11 0L21 7v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7zm9 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "red-packet-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 5.937A11.985 11.985 0 0 1 14.194 9.8a2.5 2.5 0 0 0-4.388 0A11.985 11.985 0 0 1 3 5.937V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.937zm0 2.787V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.724A13.944 13.944 0 0 0 9.63 11.8a2.501 2.501 0 0 0 4.74 0A13.944 13.944 0 0 0 21 8.724z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "red-packet-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.173 9.763A9.98 9.98 0 0 0 19 7.141V4H5v3.141a9.98 9.98 0 0 0 4.827 2.622 2.5 2.5 0 0 1 4.346 0zm.208 2a2.501 2.501 0 0 1-4.762 0A11.94 11.94 0 0 1 5 9.749V20h14V9.748a11.94 11.94 0 0 1-4.619 2.016zM4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "refund-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10a9.96 9.96 0 0 1-6.383-2.302l-.244-.209.902-1.902a8 8 0 1 0-2.27-5.837l-.005.25h2.5l-2.706 5.716A9.954 9.954 0 0 1 2 12C2 6.477 6.477 2 12 2zm1 4v2h2.5v2H10a.5.5 0 0 0-.09.992L10 11h4a2.5 2.5 0 1 1 0 5h-1v2h-2v-2H8.5v-2H14a.5.5 0 0 0 .09-.992L14 13h-4a2.5 2.5 0 1 1 0-5h1V6h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "refund-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.671 4.257c3.928-3.219 9.733-2.995 13.4.672 3.905 3.905 3.905 10.237 0 14.142-3.905 3.905-10.237 3.905-14.142 0A9.993 9.993 0 0 1 2.25 9.767l.077-.313 1.934.51a8 8 0 1 0 3.053-4.45l-.221.166 1.017 1.017-4.596 1.06 1.06-4.596 1.096 1.096zM13 6v2h2.5v2H10a.5.5 0 0 0-.09.992L10 11h4a2.5 2.5 0 1 1 0 5h-1v2h-2v-2H8.5v-2H14a.5.5 0 0 0 .09-.992L14 13h-4a2.5 2.5 0 1 1 0-5h1V6h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "refund-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 7H2V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3zm0 2v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9h20zm-11 5v-2.5L6.5 16H17v-2h-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "refund-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 8V5H4v3h16zm0 2H4v9h16v-9zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 11h6v2H6.5l4.5-4.5V14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "safe-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 20H6v2H4v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7V1.59a.5.5 0 0 1 .582-.493l10.582 1.764a1 1 0 0 1 .836.986V6h1v2h-1v7h1v2h-1v2.153a1 1 0 0 1-.836.986L20 20.333V22h-2v-1.333l-7.418 1.236A.5.5 0 0 1 10 21.41V20zm2-.36l8-1.334V4.694l-8-1.333v16.278zM16.5 14c-.828 0-1.5-1.12-1.5-2.5S15.672 9 16.5 9s1.5 1.12 1.5 2.5-.672 2.5-1.5 2.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "safe-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20.333V22h-2v-1.333l-7.418 1.236A.5.5 0 0 1 10 21.41V20H6v2H4v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7V1.59a.5.5 0 0 1 .582-.493l10.582 1.764a1 1 0 0 1 .836.986V6h1v2h-1v7h1v2h-1v2.153a1 1 0 0 1-.836.986L20 20.333zM4 5v13h6V5H4zm8 14.64l8-1.334V4.694l-8-1.333v16.278zM16.5 14c-.828 0-1.5-1.12-1.5-2.5S15.672 9 16.5 9s1.5 1.12 1.5 2.5-.672 2.5-1.5 2.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "safe-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 20H6v2H4v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-1v2h-2v-2zm-7-6.126V17h2v-3.126A4.002 4.002 0 0 0 12 6a4 4 0 0 0-1 7.874zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "safe-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 20H6v2H4v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-1v2h-2v-2zM4 18h16V5H4v13zm9-4.126V17h-2v-3.126A4.002 4.002 0 0 1 12 6a4 4 0 0 1 1 7.874zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "secure-payment-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 2l7.298 2.28a1 1 0 0 1 .702.955V7h2a1 1 0 0 1 1 1v2H9V8a1 1 0 0 1 1-1h7V5.97l-6-1.876L5 5.97v7.404a4 4 0 0 0 1.558 3.169l.189.136L11 19.58 14.782 17H10a1 1 0 0 1-1-1v-4h13v4a1 1 0 0 1-1 1l-3.22.001c-.387.51-.857.96-1.4 1.33L11 22l-5.38-3.668A6 6 0 0 1 3 13.374V5.235a1 1 0 0 1 .702-.954L11 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "secure-payment-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M11 2l7.298 2.28a1 1 0 0 1 .702.955V7h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1l-3.22.001c-.387.51-.857.96-1.4 1.33L11 22l-5.38-3.668A6 6 0 0 1 3 13.374V5.235a1 1 0 0 1 .702-.954L11 2zm0 2.094L5 5.97v7.404a4 4 0 0 0 1.558 3.169l.189.136L11 19.58 14.782 17H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h7V5.97l-6-1.876zM11 12v3h9v-3h-9zm0-2h9V9h-9v1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-bag-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zM9 6H7v2a5 5 0 0 0 10 0V6h-2v2a3 3 0 0 1-6 0V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-bag-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.5 2h11a1 1 0 0 1 .8.4L21 6v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6l2.7-3.6a1 1 0 0 1 .8-.4zm12 4L17 4H7L5.5 6h13zM9 10H7v2a5 5 0 0 0 10 0v-2h-2v2a3 3 0 0 1-6 0v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-bag-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.5 2h11a1 1 0 0 1 .8.4L21 6v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6l2.7-3.6a1 1 0 0 1 .8-.4zM19 8H5v12h14V8zm-.5-2L17 4H7L5.5 6h13zM9 10v2a3 3 0 0 0 6 0v-2h2v2a5 5 0 0 1-10 0v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-bag-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 22H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1zm-1-2V4H5v16h14zM9 6v2a3 3 0 0 0 6 0V6h2v2A5 5 0 0 1 7 8V6h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-bag-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1a5 5 0 0 1 5 5v2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3V6a5 5 0 0 1 5-5zm5 10h-2v1a1 1 0 0 0 1.993.117L17 12v-1zm-8 0H7v1a1 1 0 0 0 1.993.117L9 12v-1zm3-8a3 3 0 0 0-2.995 2.824L9 6v2h6V6a3 3 0 0 0-2.824-2.995L12 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-bag-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 8V6a5 5 0 1 1 10 0v2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3zm0 2H5v10h14V10h-2v2h-2v-2H9v2H7v-2zm2-2h6V6a3 3 0 0 0-6 0v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-basket-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.366 3.438L18.577 9H22v2h-1.167l-.757 9.083a1 1 0 0 1-.996.917H4.92a1 1 0 0 1-.996-.917L3.166 11H2V9h3.422l3.212-5.562 1.732 1L7.732 9h8.535l-2.633-4.562 1.732-1zM13 13h-2v4h2v-4zm-4 0H7v4h2v-4zm8 0h-2v4h2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-basket-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M15.366 3.438L18.577 9H22v2h-1.167l-.757 9.083a1 1 0 0 1-.996.917H4.92a1 1 0 0 1-.996-.917L3.166 11H2V9h3.422l3.212-5.562 1.732 1L7.732 9h8.535l-2.633-4.562 1.732-1zM18.826 11H5.173l.667 8h12.319l.667-8zM13 13v4h-2v-4h2zm-4 0v4H7v-4h2zm8 0v4h-2v-4h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-cart-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 6.414L.757 3.172l1.415-1.415L5.414 5h15.242a1 1 0 0 1 .958 1.287l-2.4 8a1 1 0 0 1-.958.713H6v2h11v2H5a1 1 0 0 1-1-1V6.414zM6 7v6h11.512l1.8-6H6zm-.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm12 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-basket-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2a6 6 0 0 1 6 6v1h4v2h-1.167l-.757 9.083a1 1 0 0 1-.996.917H4.92a1 1 0 0 1-.996-.917L3.166 11H2V9h4V8a6 6 0 0 1 6-6zm1 11h-2v4h2v-4zm-4 0H7v4h2v-4zm8 0h-2v4h2v-4zm-5-9a4 4 0 0 0-3.995 3.8L8 8v1h8V8a4 4 0 0 0-3.8-3.995L12 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-basket-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 2a6 6 0 0 1 6 6v1h4v2h-1.167l-.757 9.083a1 1 0 0 1-.996.917H4.92a1 1 0 0 1-.996-.917L3.166 11H2V9h4V8a6 6 0 0 1 6-6zm6.826 9H5.173l.667 8h12.319l.667-8zM13 13v4h-2v-4h2zm-4 0v4H7v-4h2zm8 0v4h-2v-4h2zm-5-9a4 4 0 0 0-3.995 3.8L8 8v1h8V8a4 4 0 0 0-3.8-3.995L12 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-cart-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 6.414L.757 3.172l1.415-1.415L5.414 5h15.242a1 1 0 0 1 .958 1.287l-2.4 8a1 1 0 0 1-.958.713H6v2h11v2H5a1 1 0 0 1-1-1V6.414zM5.5 23a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm12 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-cart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 9h13.938l.5-2H8V5h13.72a1 1 0 0 1 .97 1.243l-2.5 10a1 1 0 0 1-.97.757H5a1 1 0 0 1-1-1V4H2V2h3a1 1 0 0 1 1 1v6zm0 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm12 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shopping-cart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 16V4H2V2h3a1 1 0 0 1 1 1v12h12.438l2-8H8V5h13.72a1 1 0 0 1 .97 1.243l-2.5 10a1 1 0 0 1-.97.757H5a1 1 0 0 1-1-1zm2 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm12 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stock-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 5h3v9H8v3H6v-3H3V5h3V2h2v3zM5 7v5h4V7H5zm13 3h3v9h-3v3h-2v-3h-3v-9h3V7h2v3zm-3 2v5h4v-5h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "swap-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 4v2h-4v2h4v2l3.5-3L15 7zM9 17v-2h4v-2H9v-2l-3.5 3L9 17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "swap-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM7 9h2v4h2V9h2l-3-3.5L7 9zm10 6h-2v-4h-2v4h-2l3 3.5 3-3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "swap-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM7 9l3-3.5L13 9h-2v4H9V9H7zm10 6l-3 3.5-3-3.5h2v-4h2v4h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "swap-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 4l3.5 3-3.5 3v-2h-4V9h4V7zM9 17l-3.5-3L9 11v2h4v2H9v2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ticket-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5V4a1 1 0 0 1 1-1h18zm-5 6H8v6h8V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ticket-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5V4a1 1 0 0 1 1-1h18zm-1 2H4v2.968l.156.081a4.5 4.5 0 0 1 2.34 3.74L6.5 12a4.499 4.499 0 0 1-2.344 3.95L4 16.032V19h16v-2.969l-.156-.08a4.5 4.5 0 0 1-2.34-3.74L17.5 12c0-1.704.947-3.187 2.344-3.95L20 7.967V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stock-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 5h3v9H8v3H6v-3H3V5h3V2h2v3zm10 5h3v9h-3v3h-2v-3h-3v-9h3V7h2v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ticket-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5V4a1 1 0 0 1 1-1h18zm-1 2H4v2.968l.156.081a4.5 4.5 0 0 1 2.34 3.74L6.5 12a4.499 4.499 0 0 1-2.344 3.95L4 16.032V19h16v-2.969l-.156-.08a4.5 4.5 0 0 1-2.34-3.74L17.5 12c0-1.704.947-3.187 2.344-3.95L20 7.967V5zm-4 4v6H8V9h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "trophy-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 16.938V19h5v2H6v-2h5v-2.062A8.001 8.001 0 0 1 4 9V3h16v6a8.001 8.001 0 0 1-7 7.938zM1 5h2v4H1V5zm20 0h2v4h-2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-crown-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M3.492 8.065L4.778 19h14.444l1.286-10.935-4.01 2.673L12 4.441l-4.498 6.297-4.01-2.673zM2.801 5.2L7 8l4.186-5.86a1 1 0 0 1 1.628 0L17 8l4.2-2.8a1 1 0 0 1 1.547.95l-1.643 13.967a1 1 0 0 1-.993.883H3.889a1 1 0 0 1-.993-.883L1.253 6.149A1 1 0 0 1 2.8 5.2zM12 15a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-crown-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.8 5.2L7 8l4.186-5.86a1 1 0 0 1 1.628 0L17 8l4.2-2.8a1 1 0 0 1 1.547.95l-1.643 13.967a1 1 0 0 1-.993.883H3.889a1 1 0 0 1-.993-.883L1.253 6.149A1 1 0 0 1 2.8 5.2zM12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "trophy-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 16.938V19h5v2H6v-2h5v-2.062A8.001 8.001 0 0 1 4 9V3h16v6a8.001 8.001 0 0 1-7 7.938zM6 5v4a6 6 0 1 0 12 0V5H6zM1 5h2v4H1V5zm20 0h2v4h-2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ticket-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v5.5a2.5 2.5 0 1 0 0 5V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5.5a2.5 2.5 0 1 0 0-5V4a1 1 0 0 1 1-1h18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-crown-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 19h20v2H2v-2zM2 5l5 3 5-6 5 6 5-3v12H2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-diamond-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.873 3h14.254a1 1 0 0 1 .809.412l3.823 5.256a.5.5 0 0 1-.037.633L12.367 21.602a.5.5 0 0 1-.734 0L.278 9.302a.5.5 0 0 1-.037-.634l3.823-5.256A1 1 0 0 1 4.873 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-crown-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 19h20v2H2v-2zM2 5l5 3.5L12 2l5 6.5L22 5v12H2V5zm2 3.841V15h16V8.841l-3.42 2.394L12 5.28l-4.58 5.955L4 8.84z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-diamond-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.873 3h14.254a1 1 0 0 1 .809.412l3.823 5.256a.5.5 0 0 1-.037.633L12.367 21.602a.5.5 0 0 1-.706.028c-.007-.006-3.8-4.115-11.383-12.329a.5.5 0 0 1-.037-.633l3.823-5.256A1 1 0 0 1 4.873 3zm.51 2l-2.8 3.85L12 19.05 21.417 8.85 18.617 5H5.383z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 5.5v7h2v-7h-2zm-.285 0H8.601l-1.497 4.113L5.607 8.5H3.493l2.611 6.964h2L10.715 8.5zm5.285 5h1.5a2.5 2.5 0 1 0 0-5H14v7h2v-2zm0-2v-1h1.5a.5.5 0 1 1 0 1H16z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wallet-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 7V5H4v14h16v-2h-8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h8zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm10 6v6h7V9h-7zm2 2h3v2h-3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wallet-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 8h-9a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v4zm-7 3h3v2h-3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vip-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 19h20v2H2v-2zm9-11h2v8h-2V8zM7.965 8h2.125l-2.986 7.964h-2L2.118 8h2.125l1.861 5.113L7.965 8zM17 14v2h-2V8h4a3 3 0 0 1 0 6h-2zm0-4v2h2a1 1 0 0 0 0-2h-2zM2 3h20v2H2V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wallet-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 9h19a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9zm1-6h15v4H2V4a1 1 0 0 1 1-1zm12 11v2h3v-2h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "water-flash-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.636 6.636L12 .272l6.364 6.364a9 9 0 1 1-12.728 0zM13 11V6.5L8.5 13H11v4.5l4.5-6.5H13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wallet-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 7h1v10h-1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3zm-2 10h-6a5 5 0 0 1 0-10h6V5H4v14h16v-2zm1-2V9h-7a3 3 0 0 0 0 6h7zm-7-4h3v2h-3v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wallet-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 6h-7a6 6 0 1 0 0 12h7v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v2zm-7 2h8v8h-8a4 4 0 1 1 0-8zm0 3v2h3v-2h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "water-flash-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.1L7.05 8.05a7 7 0 1 0 9.9 0L12 3.1zm0-2.828l6.364 6.364a9 9 0 1 1-12.728 0L12 .272zM13 11h2.5L11 17.5V13H8.5L13 6.5V11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "wallet-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 7h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h15v4zM4 9v10h16V9H4zm0-4v2h12V5H4zm11 8h3v2h-3v-2z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "health",
            iconsvg: [
                {
                    name: "capsule-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19.778 4.222c2.343 2.343 2.343 6.142 0 8.485l-2.122 2.12-4.949 4.951c-2.343 2.343-6.142 2.343-8.485 0-2.343-2.343-2.343-6.142 0-8.485l7.07-7.071c2.344-2.343 6.143-2.343 8.486 0zm-4.95 10.606L9.172 9.172l-3.536 3.535c-1.562 1.562-1.562 4.095 0 5.657 1.562 1.562 4.095 1.562 5.657 0l3.535-3.536z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dislike-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M2.808 1.393l18.384 18.385-1.414 1.414-3.747-3.747L12 21.485 3.52 12.993c-2.04-2.284-2.028-5.753.034-8.023L1.393 2.808l1.415-1.415zm2.172 10.23L12 18.654l2.617-2.623-9.645-9.645c-1.294 1.497-1.3 3.735.008 5.237zm15.263-6.866c2.262 2.268 2.34 5.88.236 8.236l-1.635 1.636-1.414-1.414 1.59-1.592c1.374-1.576 1.299-3.958-.193-5.453-1.5-1.502-3.92-1.563-5.49-.153l-1.335 1.198-1.336-1.197c-.35-.314-.741-.555-1.155-.723l-2.25-2.25c1.668-.206 3.407.289 4.74 1.484 2.349-2.109 5.979-2.039 8.242.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dislike-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M2.808 1.393l18.384 18.385-1.414 1.414-3.747-3.747L12 21.485 3.52 12.993c-2.04-2.284-2.028-5.753.034-8.023L1.393 2.808l1.415-1.415zm17.435 3.364c2.262 2.268 2.34 5.88.236 8.236l-1.635 1.636L7.26 3.046c1.67-.207 3.408.288 4.741 1.483 2.349-2.109 5.979-2.039 8.242.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dossier-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 2v2h3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h3V2h10zm-4 9h-2v2H9v2h1.999L11 17h2l-.001-2H15v-2h-2v-2zm2-7H9v2h6V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "capsule-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19.778 4.222c2.343 2.343 2.343 6.142 0 8.485l-7.07 7.071c-2.344 2.343-6.143 2.343-8.486 0-2.343-2.343-2.343-6.142 0-8.485l7.07-7.071c2.344-2.343 6.143-2.343 8.486 0zm-5.656 11.313L8.465 9.878l-2.829 2.83c-1.562 1.561-1.562 4.094 0 5.656 1.562 1.562 4.095 1.562 5.657 0l2.829-2.83zm4.242-9.899c-1.562-1.562-4.095-1.562-5.657 0L9.88 8.464l5.657 5.657 2.828-2.828c1.562-1.562 1.562-4.095 0-5.657z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "empathize-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M18.364 10.98c1.562 1.561 1.562 4.094 0 5.656l-5.657 5.657c-.39.39-1.024.39-1.414 0l-5.657-5.657c-1.562-1.562-1.562-4.095 0-5.657 1.562-1.562 4.095-1.562 5.657 0l.706.707.708-.707c1.562-1.562 4.095-1.562 5.657 0zM7.05 12.392c-.78.781-.78 2.048 0 2.829l4.95 4.95 4.95-4.95c.78-.781.78-2.048 0-2.829-.781-.78-2.048-.78-2.83.002l-2.122 2.118-2.12-2.12c-.78-.78-2.047-.78-2.828 0zM12 1c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4zm0 2c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dossier-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 2v2h3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h3V2h10zM7 6H5v14h14V6h-2v2H7V6zm6 5v2h2v2h-2.001L13 17h-2l-.001-2H9v-2h2v-2h2zm2-7H9v2h6V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "first-aid-kit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 1c.552 0 1 .448 1 1v3h4c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V6c0-.552.448-1 1-1h4V2c0-.552.448-1 1-1h8zm-3 8h-2v3H8v2h2.999L11 17h2l-.001-3H16v-2h-3V9zm2-6H9v2h6V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "first-aid-kit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 1c.552 0 1 .448 1 1v3h4c.552 0 1 .448 1 1v14c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V6c0-.552.448-1 1-1h4V2c0-.552.448-1 1-1h8zm4 6H4v12h16V7zm-7 2v3h3v2h-3.001L13 17h-2l-.001-3H8v-2h3V9h2zm2-6H9v2h6V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "flask-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 2v2h-1v3.243c0 1.158.251 2.301.736 3.352l4.282 9.276c.347.753.018 1.644-.734 1.99-.197.092-.411.139-.628.139H5.344c-.828 0-1.5-.672-1.5-1.5 0-.217.047-.432.138-.629l4.282-9.276C8.749 9.545 9 8.401 9 7.243V4H8V2h8zm-3 2h-2v4h2V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "empathize-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M18.364 10.98c1.562 1.561 1.562 4.094 0 5.656l-5.657 5.657c-.39.39-1.024.39-1.414 0l-5.657-5.657c-1.562-1.562-1.562-4.095 0-5.657 1.562-1.562 4.095-1.562 5.657 0l.706.707.708-.707c1.562-1.562 4.095-1.562 5.657 0zM12 1c2.21 0 4 1.79 4 4s-1.79 4-4 4-4-1.79-4-4 1.79-4 4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "flask-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 2v2h-1v3.243c0 1.158.251 2.301.736 3.352l4.282 9.276c.347.753.018 1.644-.734 1.99-.197.092-.411.139-.628.139H5.344c-.828 0-1.5-.672-1.5-1.5 0-.217.047-.432.138-.629l4.282-9.276C8.749 9.545 9 8.401 9 7.243V4H8V2h8zm-2.612 8.001h-2.776c-.104.363-.23.721-.374 1.071l-.158.361L6.125 20h11.749l-3.954-8.567c-.214-.464-.392-.943-.532-1.432zM11 7.243c0 .253-.01.506-.029.758h2.058c-.01-.121-.016-.242-.021-.364L13 7.243V4h-2v3.243z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hand-sanitizer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 2v2l-4-.001V6h3v2c2.21 0 4 1.79 4 4v8c0 1.105-.895 2-2 2H6c-1.105 0-2-.895-2-2v-8c0-2.21 1.79-4 4-4V6h3V3.999L7.5 4c-.63 0-1.37.49-2.2 1.6L3.7 4.4C4.87 2.84 6.13 2 7.5 2H17zm-4 10h-2v2H9v2h1.999L11 18h2l-.001-2H15v-2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hand-sanitizer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 2v2l-4-.001V6h3v2c2.21 0 4 1.79 4 4v8c0 1.105-.895 2-2 2H6c-1.105 0-2-.895-2-2v-8c0-2.21 1.79-4 4-4V6h3V3.999L7.5 4c-.63 0-1.37.49-2.2 1.6L3.7 4.4C4.87 2.84 6.13 2 7.5 2H17zm-1 8H8c-1.105 0-2 .895-2 2v8h12v-8c0-1.105-.895-2-2-2zm-3 2v2h2v2h-2.001L13 18h-2l-.001-2H9v-2h2v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "health-book-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 2c.552 0 1 .448 1 1v18c0 .552-.448 1-1 1H6c-.552 0-1-.448-1-1v-2H3v-2h2v-2H3v-2h2v-2H3V9h2V7H3V5h2V3c0-.552.448-1 1-1h14zm-1 2H7v16h12V4zm-5 4v3h3v2h-3.001L14 16h-2l-.001-3H9v-2h3V8h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "health-book-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 2c.552 0 1 .448 1 1v18c0 .552-.448 1-1 1H6c-.552 0-1-.448-1-1v-2H3v-2h2v-2H3v-2h2v-2H3V9h2V7H3V5h2V3c0-.552.448-1 1-1h14zm-6 6h-2v3H9v2h2.999L12 16h2l-.001-3H17v-2h-3V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20.243 4.757c2.262 2.268 2.34 5.88.236 8.236l-8.48 8.492-8.478-8.492c-2.104-2.356-2.025-5.974.236-8.236C5.515 3 8.093 2.56 10.261 3.44L6.343 7.358l1.414 1.415L12 4.53l-.013-.014.014.013c2.349-2.109 5.979-2.039 8.242.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19 14v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2zm1.243-9.243c2.16 2.166 2.329 5.557.507 7.91C19.926 12.24 18.99 12 18 12c-3.314 0-6 2.686-6 6 0 1.009.249 1.96.689 2.794l-.69.691-8.478-8.492c-2.104-2.356-2.025-5.974.236-8.236 2.265-2.264 5.888-2.34 8.244-.228 2.349-2.109 5.979-2.039 8.242.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16.5 3C19.538 3 22 5.5 22 9c0 7-7.5 11-10 12.5C9.5 20 2 16 2 9c0-3.5 2.5-6 5.5-6C9.36 3 11 4 12 5c1-1 2.64-2 4.5-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16.5 3C19.538 3 22 5.5 22 9c0 7-7.5 11-10 12.5C9.5 20 2 16 2 9c0-3.5 2.5-6 5.5-6C9.36 3 11 4 12 5c1-1 2.64-2 4.5-2zm-3.566 15.604c.881-.556 1.676-1.109 2.42-1.701C18.335 14.533 20 11.943 20 9c0-2.36-1.537-4-3.5-4-1.076 0-2.24.57-3.086 1.414L12 7.828l-1.414-1.414C9.74 5.57 8.576 5 7.5 5 5.56 5 4 6.656 4 9c0 2.944 1.666 5.533 4.645 7.903.745.592 1.54 1.145 2.421 1.7.299.189.595.37.934.572.339-.202.635-.383.934-.571z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20.243 4.757c2.262 2.268 2.34 5.88.236 8.236l-8.48 8.492-8.478-8.492c-2.104-2.356-2.025-5.974.236-8.236 2.265-2.264 5.888-2.34 8.244-.228 2.349-2.109 5.979-2.039 8.242.228zM5.172 6.172c-1.49 1.49-1.565 3.875-.192 5.451L12 18.654l7.02-7.03c1.374-1.577 1.299-3.959-.193-5.454-1.487-1.49-3.881-1.562-5.453-.186l-4.202 4.203-1.415-1.414 2.825-2.827-.082-.069c-1.575-1.265-3.877-1.157-5.328.295z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12.001 4.529c2.349-2.109 5.979-2.039 8.242.228 2.262 2.268 2.34 5.88.236 8.236l-8.48 8.492-8.478-8.492c-2.104-2.356-2.025-5.974.236-8.236 2.265-2.264 5.888-2.34 8.244-.228zm6.826 1.641c-1.5-1.502-3.92-1.563-5.49-.153l-1.335 1.198-1.336-1.197c-1.575-1.412-3.99-1.35-5.494.154-1.49 1.49-1.565 3.875-.192 5.451L12 18.654l7.02-7.03c1.374-1.577 1.299-3.959-.193-5.454z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-pulse-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16.5 3C19.538 3 22 5.5 22 9c0 7-7.5 11-10 12.5-1.978-1.187-7.084-3.937-9.132-8.5h4.698l.934-1.556 3 5L13.566 13H17v-2h-4.566l-.934 1.556-3-5L6.434 11H2.21C2.074 10.363 2 9.696 2 9c0-3.5 2.5-6 5.5-6C9.36 3 11 4 12 5c1-1 2.64-2 4.5-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19 14v3h3v2h-3.001L19 22h-2l-.001-3H14v-2h3v-3h2zm1.243-9.243c2.262 2.268 2.34 5.88.236 8.235l-1.42-1.418c1.331-1.524 1.261-3.914-.232-5.404-1.503-1.499-3.92-1.563-5.49-.153l-1.335 1.198-1.336-1.197c-1.575-1.412-3.991-1.35-5.494.154-1.49 1.49-1.565 3.875-.192 5.451l8.432 8.446L12 21.485 3.52 12.993c-2.104-2.356-2.025-5.974.236-8.236 2.265-2.264 5.888-2.34 8.244-.228 2.349-2.109 5.979-2.039 8.242.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-pulse-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16.5 3C19.538 3 22 5.5 22 9c0 7-7.5 11-10 12.5-1.977-1.186-7.083-3.937-9.131-8.499L1 13v-2h1.21C2.074 10.364 2 9.698 2 9c0-3.5 2.5-6 5.5-6C9.36 3 11 4 12 5c1-1 2.64-2 4.5-2zm0 2c-1.076 0-2.24.57-3.086 1.414L12 7.828l-1.414-1.414C9.74 5.57 8.576 5 7.5 5 5.56 5 4 6.656 4 9c0 .685.09 1.352.267 2h2.167L8.5 7.556l3 5L12.434 11H17v2h-3.434L11.5 16.444l-3-5L7.566 13H5.108c.79 1.374 1.985 2.668 3.537 3.903.745.592 1.54 1.145 2.421 1.7.299.189.595.37.934.572.339-.202.635-.383.934-.571.881-.556 1.676-1.109 2.42-1.701C18.335 14.533 20 11.943 20 9c0-2.36-1.537-4-3.5-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "heart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12.001 4.529c2.349-2.109 5.979-2.039 8.242.228 2.262 2.268 2.34 5.88.236 8.236l-8.48 8.492-8.478-8.492c-2.104-2.356-2.025-5.974.236-8.236 2.265-2.264 5.888-2.34 8.244-.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hearts-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17.363 11.045c1.404-1.393 3.68-1.393 5.084 0 1.404 1.394 1.404 3.654 0 5.047L17 21.5l-5.447-5.408c-1.404-1.393-1.404-3.653 0-5.047 1.404-1.393 3.68-1.393 5.084 0l.363.36.363-.36zm1.88-6.288c.94.943 1.503 2.118 1.689 3.338-1.333-.248-2.739-.01-3.932.713-2.15-1.303-4.994-1.03-6.856.818-2.131 2.115-2.19 5.515-.178 7.701l.178.185 2.421 2.404L11 21.485 2.52 12.993C.417 10.637.496 7.019 2.757 4.757c2.265-2.264 5.888-2.34 8.244-.228 2.349-2.109 5.979-2.039 8.242.228z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hearts-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19.243 4.757c1.462 1.466 2.012 3.493 1.65 5.38.568.16 1.106.463 1.554.908 1.404 1.394 1.404 3.654 0 5.047L17 21.5l-3.022-3L11 21.485 2.52 12.993C.417 10.637.496 7.019 2.757 4.757c2.265-2.264 5.888-2.34 8.244-.228 2.349-2.109 5.979-2.039 8.242.228zm-6.281 7.708c-.616.611-.616 1.597 0 2.208L17 18.682l4.038-4.009c.616-.611.616-1.597 0-2.208-.624-.62-1.642-.62-2.268.002l-1.772 1.754-1.407-1.396-.363-.36c-.624-.62-1.642-.62-2.266 0zm-8.79-6.293c-1.49 1.49-1.565 3.875-.192 5.451L11 18.654l1.559-1.562-1.006-1c-1.404-1.393-1.404-3.653 0-5.047 1.404-1.393 3.68-1.393 5.084 0l.363.36.363-.36c.425-.421.93-.715 1.465-.882.416-1.367.078-2.912-1.001-3.993-1.5-1.502-3.92-1.563-5.49-.153l-1.335 1.198-1.336-1.197c-1.575-1.412-3.99-1.35-5.494.154z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "infrared-thermometer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 2v9h-3.001L18 12c0 2.21-1.79 4-4 4h-1.379l-.613 3.111.911 1.321c.314.455.2 1.078-.255 1.391-.167.115-.365.177-.568.177H3l2.313-10.024L3 11l4-9h14zm-5.001 9h-2.394l-.591 3H14c1.105 0 2-.895 2-2l-.001-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "lungs-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M8.5 5.5c1.412.47 2.048 2.159 2.327 4.023l-4.523 2.611 1 1.732 3.71-2.141C11.06 13.079 11 14.308 11 15c0 3-1 6-5 6s-4 0-4-4C2 9.5 5.5 4.5 8.5 5.5zM22.001 17v.436c-.005 3.564-.15 3.564-4 3.564-4 0-5-3-5-6 0-.691-.06-1.92-.014-3.274l3.71 2.14 1-1.732-4.523-2.61c.279-1.865.915-3.553 2.327-4.024 3-1 6.5 4 6.5 11.5zM13 2v9h-2V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "lungs-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M22.001 17c-.001 4-.001 4-4 4-4 0-5-3-5-6 0-.378-.018-.918-.026-1.55l2.023 1.169L15 15c0 2.776.816 4 3 4 1.14 0 1.61-.007 1.963-.038.03-.351.037-.822.037-1.962 0-3.205-.703-6.033-1.835-7.9-.838-1.382-1.613-1.843-2.032-1.703-.293.098-.605.65-.831 1.623l-1.79-1.033c.369-1.197.982-2.151 1.988-2.487 3-1 6.503 4 6.5 11.5zM8.5 5.5c1.007.336 1.62 1.29 1.989 2.487L8.699 9.02c-.226-.973-.539-1.525-.831-1.623-.42-.14-1.195.32-2.032 1.702C4.703 10.967 4 13.795 4 17c0 1.14.007 1.61.038 1.962.351.031.822.038 1.962.038 2.184 0 3-1.224 3-4l.004-.382 2.023-1.168c-.01.633-.027 1.172-.027 1.55 0 3-1 6-5 6s-4 0-4-4C2 9.5 5.5 4.5 8.5 5.5zM13 2v7.422l4.696 2.712-1 1.732L12 11.155l-4.696 2.711-1-1.732L11 9.422V2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "medicine-bottle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 5v2c1.657 0 3 1.343 3 3v11c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V10c0-1.657 1.343-3 3-3V5h10zm-4 6h-2v2H9v2h1.999L11 17h2l-.001-2H15v-2h-2v-2zm6-9v2H5V2h14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "infrared-thermometer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 2v9h-3.001L18 12c0 2.21-1.79 4-4 4h-1.379l-.613 3.111.911 1.321c.314.455.2 1.078-.255 1.391-.167.115-.365.177-.568.177H3l2.313-10.024L3 11l4-9h14zm-2 2H8.3L5.655 9.95l1.985.837L5.514 20h4.678l-.309-.448L11.96 9H19V4zm-3.001 7h-2.394l-.591 3H14c1.105 0 2-.895 2-2l-.001-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "microscope-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M13.196 2.268l3.25 5.63c.276.477.112 1.089-.366 1.365l-1.3.75 1.001 1.732-1.732 1-1-1.733-1.299.751c-.478.276-1.09.112-1.366-.366L8.546 8.215C6.494 8.837 5 10.745 5 13c0 .625.115 1.224.324 1.776C6.1 14.284 7.016 14 8 14c1.684 0 3.174.833 4.08 2.109l7.688-4.439 1 1.732-7.878 4.549c.072.338.11.69.11 1.049 0 .343-.034.677-.1 1H21v2l-17 .001c-.628-.836-1-1.875-1-3.001 0-1.007.298-1.945.81-2.73C3.293 15.295 3 14.182 3 13c0-2.995 1.881-5.551 4.527-6.55l-.393-.682c-.552-.957-.225-2.18.732-2.732l2.598-1.5c.957-.552 2.18-.225 2.732.732z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "medicine-bottle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M19 2v2h-2v3c1.657 0 3 1.343 3 3v11c0 .552-.448 1-1 1H5c-.552 0-1-.448-1-1V10c0-1.657 1.343-3 3-3V4H5V2h14zm-2 7H7c-.552 0-1 .448-1 1v10h12V10c0-.552-.448-1-1-1zm-4 2v2h2v2h-2.001L13 17h-2l-.001-2H9v-2h2v-2h2zm2-7H9v3h6V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mental-health-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 2c4.068 0 7.426 3.036 7.934 6.965l2.25 3.539c.148.233.118.58-.225.728L19 14.07V17c0 1.105-.895 2-2 2h-1.999L15 22H6v-3.694c0-1.18-.436-2.297-1.244-3.305C3.657 13.631 3 11.892 3 10c0-4.418 3.582-8 8-8zm0 2c-3.314 0-6 2.686-6 6 0 1.385.468 2.693 1.316 3.75C7.41 15.114 8 16.667 8 18.306V20h5l.002-3H17v-4.248l1.55-.664-1.543-2.425-.057-.442C16.566 6.251 14.024 4 11 4zm-.53 3.763l.53.53.53-.53c.684-.684 1.792-.684 2.475 0 .684.683.684 1.791 0 2.474L11 13.243l-3.005-3.006c-.684-.683-.684-1.791 0-2.474.683-.684 1.791-.684 2.475 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mental-health-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 2c4.068 0 7.426 3.036 7.934 6.965l2.25 3.539c.148.233.118.58-.225.728L19 14.07V17c0 1.105-.895 2-2 2h-1.999L15 22H6v-3.694c0-1.18-.436-2.297-1.244-3.305C3.657 13.631 3 11.892 3 10c0-4.418 3.582-8 8-8zm-.53 5.763c-.684-.684-1.792-.684-2.475 0-.684.683-.684 1.791 0 2.474L11 13.243l3.005-3.006c.684-.683.684-1.791 0-2.474-.683-.684-1.791-.684-2.475 0l-.53.53-.53-.53z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "nurse-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12 15c4.08 0 7.446 3.054 7.938 7H4.062c.492-3.946 3.858-7 7.938-7zm-1.813 2.28C8.753 17.734 7.546 18.713 6.8 20H12l-1.813-2.72zm3.627 0L12 20h5.199c-.745-1.287-1.952-2.266-3.385-2.72zM18 2v6c0 3.314-2.686 6-6 6s-6-2.686-6-6V2h12zM8 8c0 2.21 1.79 4 4 4s4-1.79 4-4H8zm8-4H8v2h8V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "psychotherapy-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 2c4.068 0 7.426 3.036 7.934 6.965l2.25 3.539c.148.233.118.58-.225.728L19 14.07V17c0 1.105-.895 2-2 2h-1.999L15 22H6v-3.694c0-1.18-.436-2.297-1.244-3.305C3.657 13.631 3 11.892 3 10c0-4.418 3.582-8 8-8zm0 5c-.552 0-1 .448-1 1v.999L9 9c-.552 0-1 .448-1 1s.448 1 1 1l1-.001V12c0 .552.448 1 1 1s1-.448 1-1v-1h1c.552 0 1-.448 1-1s-.448-1-1-1h-1V8c0-.552-.448-1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "nurse-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M14.956 15.564c2.659 1.058 4.616 3.5 4.982 6.436H4.062c.366-2.936 2.323-5.378 4.982-6.436L12 20l2.956-4.436zM18 2v6c0 3.314-2.686 6-6 6s-6-2.686-6-6V2h12zm-2 6H8c0 2.21 1.79 4 4 4s4-1.79 4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "microscope-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M13.196 2.268l3.25 5.63c.276.477.112 1.089-.366 1.365l-1.3.75 1.001 1.732-1.732 1-1-1.733-1.299.751c-.478.276-1.09.112-1.366-.366L8.546 8.215C6.494 8.837 5 10.745 5 13c0 .625.115 1.224.324 1.776C6.1 14.284 7.016 14 8 14c1.684 0 3.174.833 4.08 2.109l7.688-4.439 1 1.732-7.878 4.549c.072.338.11.69.11 1.049 0 .343-.034.677-.1 1H21v2l-17 .001c-.628-.836-1-1.875-1-3.001 0-1.007.298-1.945.81-2.73C3.293 15.295 3 14.182 3 13c0-2.995 1.881-5.551 4.527-6.55l-.393-.682c-.552-.957-.225-2.18.732-2.732l2.598-1.5c.957-.552 2.18-.225 2.732.732zM8 16c-1.657 0-3 1.343-3 3 0 .35.06.687.17 1h5.66c.11-.313.17-.65.17-1 0-1.657-1.343-3-3-3zm3.464-12.732l-2.598 1.5 2.75 4.763 2.598-1.5-2.75-4.763z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "psychotherapy-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 2c4.068 0 7.426 3.036 7.934 6.965l2.25 3.539c.148.233.118.58-.225.728L19 14.07V17c0 1.105-.895 2-2 2h-1.999L15 22H6v-3.694c0-1.18-.436-2.297-1.244-3.305C3.657 13.631 3 11.892 3 10c0-4.418 3.582-8 8-8zm0 2c-3.314 0-6 2.686-6 6 0 1.385.468 2.693 1.316 3.75C7.41 15.114 8 16.667 8 18.306V20h5l.002-3H17v-4.248l1.55-.664-1.543-2.425-.057-.442C16.566 6.251 14.024 4 11 4zm0 3c.552 0 1 .448 1 1v1h1c.552 0 1 .448 1 1s-.448 1-1 1h-1v1c0 .552-.448 1-1 1s-1-.448-1-1v-1.001L9 11c-.552 0-1-.448-1-1s.448-1 1-1l1-.001V8c0-.552.448-1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pulse-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M9 7.539L15 21.539 18.659 13 23 13 23 11 17.341 11 15 16.461 9 2.461 5.341 11 1 11 1 13 6.659 13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pulse-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M9 7.539L15 21.539 18.659 13 23 13 23 11 17.341 11 15 16.461 9 2.461 5.341 11 1 11 1 13 6.659 13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rest-time-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 6v8h8c0 4.418-3.582 8-8 8s-8-3.582-8-8c0-4.335 3.58-8 8-8zm10-4v2l-5.327 6H21v2h-8v-2l5.326-6H13V2h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stethoscope-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M8 3v2H6v4c0 2.21 1.79 4 4 4s4-1.79 4-4V5h-2V3h3c.552 0 1 .448 1 1v5c0 2.973-2.162 5.44-5 5.917V16.5c0 1.933 1.567 3.5 3.5 3.5 1.497 0 2.775-.94 3.275-2.263C16.728 17.27 16 16.22 16 15c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.371-.92 2.527-2.176 2.885C19.21 20.252 17.059 22 14.5 22 11.462 22 9 19.538 9 16.5v-1.583C6.162 14.441 4 11.973 4 9V4c0-.552.448-1 1-1h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "surgical-mask-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12.485 3.121l7.758 1.94c.445.11.757.51.757.97V7h1c1.1 0 2 .9 2 2v3c0 1.657-1.343 3-3 3h-.421c-.535 1.35-1.552 2.486-2.896 3.158l-4.789 2.395c-.563.281-1.225.281-1.788 0l-4.79-2.395C4.974 17.486 3.957 16.35 3.422 15H3c-1.657 0-3-1.343-3-3V9c0-1.105.895-2 2-2h1v-.97c0-.458.312-.858.757-.97l7.758-1.939c.318-.08.652-.08.97 0zM3 9H2v3c0 .552.448 1 1 1V9zm19 0h-1v4c.552 0 1-.448 1-1V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stethoscope-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M8 3v2H6v4c0 2.21 1.79 4 4 4s4-1.79 4-4V5h-2V3h3c.552 0 1 .448 1 1v5c0 2.973-2.162 5.44-5 5.917V16.5c0 1.933 1.567 3.5 3.5 3.5 1.497 0 2.775-.94 3.275-2.263C16.728 17.27 16 16.22 16 15c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.371-.92 2.527-2.176 2.885C19.21 20.252 17.059 22 14.5 22 11.462 22 9 19.538 9 16.5v-1.583C6.162 14.441 4 11.973 4 9V4c0-.552.448-1 1-1h3zm11 11c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rest-time-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 6v2c-3.314 0-6 2.686-6 6s2.686 6 6 6c3.238 0 5.878-2.566 5.996-5.775L17 14h2c0 4.418-3.582 8-8 8s-8-3.582-8-8c0-4.335 3.58-8 8-8zm10-4v2l-5.327 6H21v2h-8v-2l5.326-6H13V2h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "surgical-mask-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M12.485 3.121l7.758 1.94c.445.11.757.51.757.97V7h1c1.1 0 2 .9 2 2v3c0 1.657-1.343 3-3 3h-.421c-.535 1.35-1.552 2.486-2.896 3.158l-4.789 2.395c-.563.281-1.225.281-1.788 0l-4.79-2.395C4.974 17.486 3.957 16.35 3.422 15H3c-1.657 0-3-1.343-3-3V9c0-1.105.895-2 2-2h1v-.97c0-.458.312-.858.757-.97l7.758-1.939c.318-.08.652-.08.97 0zM12 5.061l-7 1.75v5.98c0 1.516.856 2.9 2.211 3.579L12 18.764l4.789-2.394C18.144 15.692 19 14.307 19 12.792v-5.98l-7-1.75zM3 9H2v3c0 .552.448 1 1 1V9zm19 0h-1v4c.552 0 1-.448 1-1V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "syringe-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21.678 7.98l-1.415 1.413-2.12-2.12-2.122 2.12 3.535 3.536-1.414 1.414-.707-.707L11.071 20H5.414l-2.121 2.121-1.414-1.414L4 18.586v-5.657l6.364-6.364-.707-.707 1.414-1.414 3.536 3.535 2.12-2.121-2.12-2.121 1.414-1.415 5.657 5.657zM9.657 14.342l-2.829-2.828-1.414 1.414 2.829 2.828 1.414-1.414zm2.828-2.828L9.657 8.686l-1.414 1.415 2.828 2.828 1.414-1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "test-tube-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 2v2h-1v14c0 2.21-1.79 4-4 4s-4-1.79-4-4V4H7V2h10zm-4 13c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm-2-3c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm3-8h-4v4h4V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "syringe-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21.678 7.98l-1.415 1.413-2.12-2.12-2.122 2.12 3.535 3.536-1.414 1.414-.707-.707L11.071 20H5.414l-2.121 2.121-1.414-1.414L4 18.586v-5.657l6.364-6.364-.707-.707 1.414-1.414 3.536 3.535 2.12-2.121-2.12-2.121 1.414-1.415 5.657 5.657zm-5.657 4.242l-4.243-4.243-1.414 1.414 2.121 2.122-1.414 1.414-2.121-2.121-1.414 1.414 2.12 2.121-1.413 1.414-2.122-2.121-.121.121V18h4.243l5.778-5.778z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "test-tube-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M17 2v2h-1v14c0 2.21-1.79 4-4 4s-4-1.79-4-4V4H7V2h10zm-3 8h-4v8c0 1.105.895 2 2 2s2-.895 2-2v-8zm-1 5c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm-2-3c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm3-8h-4v4h4V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "thermometer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20.556 3.444c1.562 1.562 1.562 4.094 0 5.657l-8.2 8.2c-.642.642-1.484 1.047-2.387 1.147l-3.378.374-2.298 2.3c-.39.39-1.024.39-1.414 0-.39-.391-.39-1.024 0-1.415l2.298-2.299.375-3.377c.1-.903.505-1.745 1.147-2.387l8.2-8.2c1.563-1.562 4.095-1.562 5.657 0zm-9.192 9.192L9.95 14.05l2.121 2.122 1.414-1.415-2.121-2.121zm2.828-2.828l-1.414 1.414 2.121 2.121 1.415-1.414-2.122-2.121zm2.829-2.829l-1.414 1.414 2.12 2.122L19.143 9.1l-2.121-2.122z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "virus-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M13.717 1.947l3.734 1.434-.717 1.867-.934-.359-.746 1.945c.779.462 1.444 1.094 1.945 1.846l1.903-.847-.407-.914 1.827-.813 1.627 3.654-1.827.813-.407-.913-1.902.847c.122.477.187.978.187 1.493 0 .406-.04.803-.117 1.187l1.944.746.358-.933 1.868.717-1.434 3.734-1.867-.717.358-.933-1.944-.747c-.462.779-1.094 1.444-1.846 1.945l.847 1.903.914-.407.813 1.827-3.654 1.627-.813-1.827.913-.407-.847-1.902c-.477.122-.978.187-1.493.187-.407 0-.804-.04-1.188-.118l-.746 1.945.934.358-.717 1.868-3.734-1.434.717-1.867.932.358.748-1.944C8.167 16.704 7.502 16.072 7 15.32l-1.903.847.407.914-1.827.813-1.627-3.654 1.827-.813.406.914 1.903-.848C6.065 13.016 6 12.515 6 12c0-.406.04-.803.117-1.187l-1.945-.746-.357.933-1.868-.717L3.381 6.55l1.867.717-.359.933 1.945.747C7.296 8.167 7.928 7.502 8.68 7l-.847-1.903-.914.407-.813-1.827L9.76 2.051l.813 1.827-.913.407.847 1.902C10.984 6.065 11.485 6 12 6c.406 0 .803.04 1.187.117l.745-1.945L13 3.815l.717-1.868zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm-.5 4.866c.478.276.642.888.366 1.366-.276.478-.888.642-1.366.366-.478-.276-.642-.888-.366-1.366.276-.478.888-.642 1.366-.366zM14 11c.552 0 1 .448 1 1s-.448 1-1 1-1-.448-1-1 .448-1 1-1zm-2.134-1.232c.276.478.112 1.09-.366 1.366s-1.09.112-1.366-.366-.112-1.09.366-1.366 1.09-.112 1.366.366z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "virus-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M13.717 1.947l3.734 1.434-.717 1.867-.934-.359-.746 1.945c.779.462 1.444 1.094 1.945 1.846l1.903-.847-.407-.914 1.827-.813 1.627 3.654-1.827.813-.407-.913-1.902.847c.122.477.187.978.187 1.493 0 .406-.04.803-.117 1.187l1.944.746.358-.933 1.868.717-1.434 3.734-1.867-.717.358-.933-1.944-.747c-.462.779-1.094 1.444-1.846 1.945l.847 1.903.914-.407.813 1.827-3.654 1.627-.813-1.827.913-.407-.847-1.902c-.477.122-.978.187-1.493.187-.407 0-.804-.04-1.188-.118l-.746 1.945.934.358-.717 1.868-3.734-1.434.717-1.867.932.358.748-1.944C8.167 16.704 7.502 16.072 7 15.32l-1.903.847.407.914-1.827.813-1.627-3.654 1.827-.813.406.914 1.903-.848C6.065 13.016 6 12.515 6 12c0-.406.04-.803.117-1.187l-1.945-.746-.357.933-1.868-.717L3.381 6.55l1.867.717-.359.933 1.945.747C7.296 8.167 7.928 7.502 8.68 7l-.847-1.903-.914.407-.813-1.827L9.76 2.051l.813 1.827-.913.407.847 1.902C10.984 6.065 11.485 6 12 6c.406 0 .803.04 1.187.117l.745-1.945L13 3.815l.717-1.868zm-3.583 11.285c-.276.478-.112 1.09.366 1.366s1.09.112 1.366-.366.112-1.09-.366-1.366-1.09-.112-1.366.366zM14 11c-.552 0-1 .448-1 1s.448 1 1 1 1-.448 1-1-.448-1-1-1zm-3.5-1.598c-.478.276-.642.888-.366 1.366.276.478.888.642 1.366.366.478-.276.642-.888.366-1.366-.276-.478-.888-.642-1.366-.366z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "zzz-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 11v2l-5.327 6H11v2H3v-2l5.326-6H3v-2h8zm10-8v2l-5.327 6H21v2h-8v-2l5.326-6H13V3h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "thermometer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20.556 3.444c1.562 1.562 1.562 4.094 0 5.657l-8.2 8.2c-.642.642-1.484 1.047-2.387 1.147l-3.378.374-2.298 2.3c-.39.39-1.024.39-1.414 0-.39-.391-.39-1.024 0-1.415l2.298-2.299.375-3.377c.1-.903.505-1.745 1.147-2.387l8.2-8.2c1.563-1.562 4.095-1.562 5.657 0zm-4.242 1.414l-8.2 8.2c-.322.321-.524.742-.574 1.193l-.276 2.485 2.485-.276c.45-.05.872-.252 1.193-.573l.422-.423L9.95 14.05l1.414-1.414 1.414 1.414 1.414-1.414-1.414-1.414 1.414-1.414 1.415 1.414 1.414-1.415-1.414-1.414L17.02 6.98l1.414 1.414.707-.707c.781-.78.781-2.047 0-2.828-.78-.781-2.047-.781-2.828 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "zzz-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M11 11v2l-5.327 6H11v2H3v-2l5.326-6H3v-2h8zm10-8v2l-5.327 6H21v2h-8v-2l5.326-6H13V3h8z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "map",
            iconsvg: [
                {
                    name: "anchor-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 9.874v10.054c3.619-.453 6.487-3.336 6.938-6.972H17L20.704 7A10.041 10.041 0 0 1 22 11.95C22 17.5 17.523 22 12 22S2 17.5 2 11.95c0-1.8.471-3.489 1.296-4.95L7 12.956H4.062c.451 3.636 3.32 6.519 6.938 6.972V9.874A4.002 4.002 0 0 1 12 2a4 4 0 0 1 1 7.874zM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "barricade-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.556 19H21v2H3v-2h1.444l.89-4h13.333l.889 4zM17.333 9l.89 4H5.777l.889-4h10.666zm-.444-2H7.11l.715-3.217A1 1 0 0 1 8.802 3h6.396a1 1 0 0 1 .976.783L16.889 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "barricade-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.493 19h11.014l-.667-3H7.16l-.667 3zm13.063 0H21v2H3v-2h1.444L7.826 3.783A1 1 0 0 1 8.802 3h6.396a1 1 0 0 1 .976.783L19.556 19zM7.604 14h8.792l-.89-4H8.494l-.889 4zm1.334-6h6.124l-.666-3H9.604l-.666 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bike-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.5 12H4V7H2V5h6v2H6v2.795l9.813-2.629L15.233 5H12V3h3.978a1 1 0 0 1 .988.741l1.553 5.796-1.932.517-.256-.956L5.5 12zM5 21a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm13 3a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "anchor-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.05 11H7v2H4.062A8.004 8.004 0 0 0 11 19.938V9.874A4.002 4.002 0 0 1 12 2a4 4 0 0 1 1 7.874v10.064A8.004 8.004 0 0 0 19.938 13H17v-2h4.95c.033.329.05.663.05 1 0 5.523-4.477 10-10 10S2 17.523 2 12c0-.337.017-.671.05-1zM12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bike-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.5 12H4V7H2V5h6v2H6v2.795l9.813-2.629L15.233 5H12V3h3.978a1 1 0 0 1 .988.741l1.553 5.796-1.932.517-.256-.956L5.5 12zM5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm13-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bus-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 20H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9H2V8h1V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3h1v4h-1v9a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1zM5 5v6h14V5H5zm14 8H5v5h14v-5zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bus-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 20H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H3v-8H2V8h1V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3h1v4h-1v8h-1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zM5 5v9h14V5H5zm0 11v2h4v-2H5zm10 0v2h4v-2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bus-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 20H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9H2V8h1V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3h1v4h-1v9a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1zM5 5v7h14V5H5zm2.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bus-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 20H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H3v-8H2V8h1V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3h1v4h-1v8h-1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zm2-8V5H5v7h14zm0 2H5v4h14v-4zM6 15h4v2H6v-2zm8 0h4v2h-4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "car-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 20H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9l2.513-6.702A2 2 0 0 1 6.386 4h11.228a2 2 0 0 1 1.873 1.298L22 12v9a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zM4.136 12h15.728l-2.25-6H6.386l-2.25 6zM6.5 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bus-wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3v2H5v7h16v8h-1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H3v-8H2V8h1V5a2 2 0 0 1 2-2h7zm7 11H5v4h14v-4zm-9 1v2H6v-2h4zm8 0v2h-4v-2h4zm.5-14a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bus-wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3v2H5v9h14v-2h2v8h-1v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1H3v-8H2V8h1V5a2 2 0 0 1 2-2h7zM9 16H5v2h4v-2zm10 0h-4v2h4v-2zm-.5-15a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "car-washing-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V12l2.417-4.029A2 2 0 0 1 6.132 7h11.736a2 2 0 0 1 1.715.971L22 12v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zm1-7H4v5h16v-5zM4.332 12h15.336l-1.8-3H6.132l-1.8 3zM5.44 3.44L6.5 2.378l1.06 1.06a1.5 1.5 0 1 1-2.121 0zm5.5 0L12 2.378l1.06 1.06a1.5 1.5 0 1 1-2.121 0zm5.5 0L17.5 2.378l1.06 1.06a1.5 1.5 0 1 1-2.121 0zM6.5 18a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "caravan-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M14.172 3c.53 0 1.039.21 1.414.586l4.828 4.828c.375.375.586.884.586 1.414V17h2v2h-8.126c-.445 1.726-2.01 3-3.874 3-1.864 0-3.43-1.274-3.874-3H3c-.552 0-1-.448-1-1V5c0-1.105.895-2 2-2h10.172zM11 16c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zm3.172-11H4v12h3.126c.444-1.725 2.01-3 3.874-3 1.864 0 3.43 1.275 3.874 3H19V9.828L14.172 5zM14 7v6H6V7h8zm-2 2H8v2h4V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "car-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 20H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V11l2.48-5.788A2 2 0 0 1 6.32 4H17.68a2 2 0 0 1 1.838 1.212L22 11v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zm1-7H4v5h16v-5zM4.176 11h15.648l-2.143-5H6.32l-2.143 5zM6.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "caravan-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0L24 0 24 24 0 24z"/>\n        <path d="M14.172 3c.53 0 1.039.21 1.414.586l4.828 4.828c.375.375.586.884.586 1.414V17h2v2h-8.126c-.445 1.726-2.01 3-3.874 3-1.864 0-3.43-1.274-3.874-3H3c-.552 0-1-.448-1-1V5c0-1.105.895-2 2-2h10.172zM11 16c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zm3-9H6v6h8V7zm-2 2v2H8V9h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "charging-pile-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 19V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0v-7h-2a1 1 0 0 1-1-1V6.414l-1.657-1.657 1.414-1.414 4.95 4.95A.997.997 0 0 1 22 9v9a3 3 0 0 1-6 0v-4h-2v5h1v2H2v-2h1zm6-8V7l-4 6h3v4l4-6H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "car-washing-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9l2.417-4.029A2 2 0 0 1 6.132 8h11.736a2 2 0 0 1 1.715.971L22 13v9a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zM4.332 13h15.336l-1.8-3H6.132l-1.8 3zM6.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5.44 3.44L6.5 2.378l1.06 1.06a1.5 1.5 0 1 1-2.121 0zm5.5 0L12 2.378l1.06 1.06a1.5 1.5 0 1 1-2.121 0zm5.5 0l1.06-1.061 1.06 1.06a1.5 1.5 0 1 1-2.121 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "charging-pile-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 19h1v2H2v-2h1V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0v-7h-2a1 1 0 0 1-1-1V6.414l-1.657-1.657 1.414-1.414 4.95 4.95A.997.997 0 0 1 22 9v9a3 3 0 0 1-6 0v-4h-2v5zm-9 0h7V5H5v14zm4-8h3l-4 6v-4H5l4-6v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "charging-pile-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 11h-1V7h1V4h2v3h1v4h-1v7a3 3 0 0 1-6 0v-4h-2v5h1v2H2v-2h1V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0v-7zm-8 8V5H5v14h7zm-3-8h3l-4 6v-4H5l4-6v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "china-railway-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 20v-7H9v-3h6v3h-2v7h5v2H6v-2h5zM10 2.223V1h4v1.223a9.003 9.003 0 0 1 2.993 16.266l-1.11-1.664a7 7 0 1 0-7.767 0l-1.109 1.664A9.003 9.003 0 0 1 10 2.223z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.328 4.258L10.586 12 12 13.414l7.742-7.742A9.957 9.957 0 0 1 22 12c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2c2.4 0 4.604.847 6.328 2.258z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.625 3.133l-1.5 1.5A7.98 7.98 0 0 0 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8a7.98 7.98 0 0 0-.633-3.125l1.5-1.5A9.951 9.951 0 0 1 22 12c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2c1.668 0 3.241.41 4.625 1.133zm1.739 1.089l1.414 1.414L12 13.414 10.586 12l7.778-7.778z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm4.5-14.5L10 10l-2.5 6.5L14 14l2.5-6.5zM12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm4.5-12.5L14 14l-6.5 2.5L10 10l6.5-2.5zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm3.446-12.032a4.02 4.02 0 0 0-1.414-1.414l-5.478 5.478a4.02 4.02 0 0 0 1.414 1.414l5.478-5.478z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.446-10.032l-5.478 5.478a4.02 4.02 0 0 1-1.414-1.414l5.478-5.478a4.02 4.02 0 0 1 1.414 1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-discover-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 22C7.477 22 3 17.523 3 12S7.477 2 13 2s10 4.477 10 10-4.477 10-10 10zM8 11.5l4 1.5 1.5 4.002L17 8l-9 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "china-railway-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 19v-6l-2-1V9h6v3l-2 1v6l5 1v2H6v-2l5-1zM10 2.223V1h4v1.223a9.003 9.003 0 0 1 2.993 16.266l-1.11-1.664a7 7 0 1 0-7.767 0l-1.109 1.664A9.003 9.003 0 0 1 10 2.223z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-discover-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-5-8.5L16 8l-3.5 9.002L11 13l-4-1.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm3.5-13.5l-5 2-2 5 5-2 2-5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cup-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 3h15a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V4a1 1 0 0 1 1-1zm13 2v3h2V5h-2zM2 19h18v2H2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "compass-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.5-11.5l-2 5-5 2 2-5 5-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "direction-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 10a1 1 0 0 0-1 1v4h2v-3h3v2.5l3.5-3.5L13 7.5V10H9zm3.707-8.607l9.9 9.9a1 1 0 0 1 0 1.414l-9.9 9.9a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l9.9-9.9a1 1 0 0 1 1.414 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "cup-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 13V5H6v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2zM5 3h15a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V4a1 1 0 0 1 1-1zm13 2v3h2V5h-2zM2 19h18v2H2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "e-bike-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <g>\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path fill-rule="nonzero" d="M16,1 C16.5522847,1 17,1.44771525 17,2 L17,3 L22,3 L22,9 L19.980979,9 L22.7270773,16.5448432 C22.9032836,16.9958219 23,17.4866163 23,18 C23,20.209139 21.209139,22 19,22 C17.1361606,22 15.5700603,20.7252272 15.1260175,19 L10.8739825,19 C10.4299397,20.7252272 8.86383943,22 7,22 C5.05550552,22 3.43507622,20.612512 3.0747418,18.7735658 C2.43596423,18.4396361 2,17.7707305 2,17 L2,7 C2,6.44771525 2.44771525,6 3,6 L10,6 C10.5522847,6 11,6.44771525 11,7 L11,12 C11,12.5522847 11.4477153,13 12,13 L14,13 C14.5522847,13 15,12.5522847 15,12 L15,3 L12,3 L12,1 L16,1 Z M19,16 C17.8954305,16 17,16.8954305 17,18 C17,19.1045695 17.8954305,20 19,20 C20.1045695,20 21,19.1045695 21,18 C21,17.7596672 20.9576092,17.5292353 20.8798967,17.3157736 L20.8635387,17.2724216 C20.5725256,16.5276089 19.8478776,16 19,16 Z M7,16 C5.8954305,16 5,16.8954305 5,18 C5,19.1045695 5.8954305,20 7,20 C8.1045695,20 9,19.1045695 9,18 C9,16.8954305 8.1045695,16 7,16 Z M9,8 L4,8 L4,10 L9,10 L9,8 Z M20,5 L17,5 L17,7 L20,7 L20,5 Z"/>\n  </g>\n</svg>\n',
                },
                {
                    name: "direction-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3.515L3.515 12 12 20.485 20.485 12 12 3.515zm.707-2.122l9.9 9.9a1 1 0 0 1 0 1.414l-9.9 9.9a1 1 0 0 1-1.414 0l-9.9-9.9a1 1 0 0 1 0-1.414l9.9-9.9a1 1 0 0 1 1.414 0zM13 10V7.5l3.5 3.5-3.5 3.5V12h-3v3H8v-4a1 1 0 0 1 1-1h4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "e-bike-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.5 6.937A6.997 6.997 0 0 1 19 13v8h-4.17a3.001 3.001 0 0 1-5.66 0H5v-8a6.997 6.997 0 0 1 3.5-6.063A3.974 3.974 0 0 1 8.125 6H5V4h3.126a4.002 4.002 0 0 1 7.748 0H19v2h-3.126c-.085.33-.212.645-.373.937zM12 14a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "e-bike-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <g>\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path fill-rule="nonzero" d="M16,1 C16.5522847,1 17,1.44771525 17,2 L17,3 L22,3 L22,9 L19.9813388,9 L22.7270773,16.5438545 C22.9032836,16.9948332 23,17.4856276 23,17.9990113 C23,20.2081503 21.209139,21.9990113 19,21.9990113 C17.1365166,21.9990113 15.5706587,20.7247255 15.1262721,19 L10.8739825,19 C10.4299397,20.7252272 8.86383943,22 7,22 C5.05550552,22 3.43507622,20.612512 3.0747418,18.7735658 C2.43596423,18.4396361 2,17.7707305 2,17 L2,7 C2,6.44771525 2.44771525,6 3,6 L10,6 C10.5522847,6 11,6.44771525 11,7 L11,12 C11,12.5522847 11.4477153,13 12,13 L14,13 C14.5522847,13 15,12.5522847 15,12 L15,3 L12,3 L12,1 L16,1 Z M7,16 C5.8954305,16 5,16.8954305 5,18 C5,19.1045695 5.8954305,20 7,20 C8.1045695,20 9,19.1045695 9,18 C9,16.8954305 8.1045695,16 7,16 Z M19,15.9990113 C17.8954305,15.9990113 17,16.8944418 17,17.9990113 C17,19.1035808 17.8954305,19.9990113 19,19.9990113 C20.1045695,19.9990113 21,19.1035808 21,17.9990113 C21,17.7586785 20.9576092,17.5282466 20.8798967,17.3147849 L20.8635387,17.2714329 C20.5725256,16.5266202 19.8478776,15.9990113 19,15.9990113 Z M17.8529833,9 L16.9999998,9 L16.9999998,12 C16.9999998,13.6568542 15.6568542,15 13.9999998,15 L11.9999998,15 C10.3431458,15 8.99999976,13.6568542 8.99999976,12 L3.99999976,12 L3.99999976,15.3541759 C4.73294422,14.523755 5.80530734,14 6.99999976,14 C8.86383943,14 10.4299397,15.2747728 10.8739825,17 L15.1257631,17 C15.569462,15.2742711 17.1358045,13.9990113 18.9999998,13.9990113 C19.2368134,13.9990113 19.4688203,14.0195905 19.6943299,14.0590581 L17.8529833,9 Z M8.99999976,8 L3.99999976,8 L3.99999976,10 L8.99999976,10 L8.99999976,8 Z M20,5 L17,5 L17,7 L20,7 L20,5 Z"/>\n  </g>\n</svg>\n',
                },
                {
                    name: "charging-pile-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 11h-1V7h1V4h2v3h1v4h-1v7a3 3 0 0 1-6 0v-4h-2v5h1v2H2v-2h1V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0v-7zM9 11V7l-4 6h3v4l4-6H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "e-bike-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.5 6.937A6.997 6.997 0 0 1 19 13v8h-4.17a3.001 3.001 0 0 1-5.66 0H5v-8a6.997 6.997 0 0 1 3.5-6.063A3.974 3.974 0 0 1 8.125 6H5V4h3.126a4.002 4.002 0 0 1 7.748 0H19v2h-3.126c-.085.33-.212.645-.373.937zm-1.453 1.5C13.448 8.795 12.748 9 12 9a3.981 3.981 0 0 1-2.047-.563A5.001 5.001 0 0 0 7 13v6h2v-4a3 3 0 0 1 6 0v4h2v-6a5.001 5.001 0 0 0-2.953-4.563zM12 14a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1zm0-7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "flight-land-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.254 10.47l-.37-8.382 1.933.518 2.81 9.035 5.261 1.41a1.5 1.5 0 1 1-.776 2.898L4.14 11.937l.776-2.898.242.065.914 3.35-2.627-.703a1 1 0 0 1-.74-.983l.09-5.403 1.449.388.914 3.351 5.096 1.366zM4 19h16v2H4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "earth-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm6.355-6.048v-.105c0-.922 0-1.343-.652-1.716a7.374 7.374 0 0 0-.645-.325c-.367-.167-.61-.276-.938-.756a12.014 12.014 0 0 1-.116-.172c-.345-.525-.594-.903-1.542-.753-1.865.296-2.003.624-2.085 1.178l-.013.091c-.121.81-.143 1.082.195 1.437 1.265 1.327 2.023 2.284 2.253 2.844.112.273.4 1.1.202 1.918a8.185 8.185 0 0 0 3.151-2.237c.11-.374.19-.84.19-1.404zM12 3.833c-2.317 0-4.41.966-5.896 2.516.177.123.331.296.437.534.204.457.204.928.204 1.345 0 .328 0 .64.105.865.144.308.766.44 1.315.554.197.042.399.084.583.135.506.14.898.595 1.211.96.13.151.323.374.42.43.05-.036.211-.211.29-.498.062-.22.044-.414-.045-.52-.56-.66-.529-1.93-.356-2.399.272-.739 1.122-.684 1.744-.644.232.015.45.03.614.009.622-.078.814-1.025.949-1.21.292-.4 1.186-1.003 1.74-1.375A8.138 8.138 0 0 0 12 3.833z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "flight-takeoff-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.478 11.632L5.968 4.56l1.931-.518 6.951 6.42 5.262-1.41a1.5 1.5 0 0 1 .776 2.898L5.916 15.96l-.776-2.898.241-.065 2.467 2.445-2.626.704a1 1 0 0 1-1.133-.48L1.466 10.94l1.449-.388 2.466 2.445 5.097-1.366zM4 19h16v2H4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "flight-takeoff-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.478 11.632L5.968 4.56l1.931-.518 6.951 6.42 5.262-1.41a1.5 1.5 0 0 1 .776 2.898L5.916 15.96l-.776-2.898.241-.065 2.467 2.445-2.626.704a1 1 0 0 1-1.133-.48L1.466 10.94l1.449-.388 2.466 2.445 5.097-1.366zM4 19h16v2H4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "earth-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.235 6.453a8 8 0 0 0 8.817 12.944c.115-.75-.137-1.47-.24-1.722-.23-.56-.988-1.517-2.253-2.844-.338-.355-.316-.628-.195-1.437l.013-.091c.082-.554.22-.882 2.085-1.178.948-.15 1.197.228 1.542.753l.116.172c.328.48.571.59.938.756.165.075.37.17.645.325.652.373.652.794.652 1.716v.105c0 .391-.038.735-.098 1.034a8.002 8.002 0 0 0-3.105-12.341c-.553.373-1.312.902-1.577 1.265-.135.185-.327 1.132-.95 1.21-.162.02-.381.006-.613-.009-.622-.04-1.472-.095-1.744.644-.173.468-.203 1.74.356 2.4.09.105.107.3.046.519-.08.287-.241.462-.292.498-.096-.056-.288-.279-.419-.43-.313-.365-.705-.82-1.211-.96-.184-.051-.386-.093-.583-.135-.549-.115-1.17-.246-1.315-.554-.106-.226-.105-.537-.105-.865 0-.417 0-.888-.204-1.345a1.276 1.276 0 0 0-.306-.43zM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "footprint-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 18h5.5v1.25a2.75 2.75 0 1 1-5.5 0V18zM8 6.12c2 0 3 2.88 3 4.88 0 1-.5 2-1 3.5L9.5 16H4c0-1-.5-2.5-.5-5S5.498 6.12 8 6.12zm12.054 7.978l-.217 1.231a2.75 2.75 0 0 1-5.417-.955l.218-1.23 5.416.954zM18.178 1.705c2.464.434 4.018 3.124 3.584 5.586-.434 2.463-1.187 3.853-1.36 4.838l-5.417-.955-.232-1.564c-.232-1.564-.55-2.636-.377-3.62.347-1.97 1.832-4.632 3.802-4.285z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "flight-land-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.254 10.47l-.37-8.382 1.933.518 2.81 9.035 5.261 1.41a1.5 1.5 0 1 1-.776 2.898L4.14 11.937l.776-2.898.242.065.914 3.35-2.627-.703a1 1 0 0 1-.74-.983l.09-5.403 1.449.388.914 3.351 5.096 1.366zM4 19h16v2H4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "footprint-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 18h5.5v1.25a2.75 2.75 0 1 1-5.5 0V18zm4.058-4l.045-.132C8.87 11.762 9 11.37 9 11c0-.75-.203-1.643-.528-2.273C8.23 8.257 8.06 8.12 8 8.12 6.72 8.12 5.5 9.484 5.5 11c0 .959.075 1.773.227 2.758l.038.242h2.293zM8 6.12c2 0 3 2.88 3 4.88 0 1-.5 2-1 3.5L9.5 16H4c0-1-.5-2.5-.5-5S5.498 6.12 8 6.12zm12.054 7.978l-.217 1.231a2.75 2.75 0 0 1-5.417-.955l.218-1.23 5.416.954zm-1.05-4.246c.165-.5.301-.895.303-.9.202-.658.361-1.303.485-2.008.263-1.492-.702-3.047-1.962-3.27-.059-.01-.25.095-.57.515-.43.565-.784 1.41-.915 2.147-.058.33-.049.405.27 2.263.045.256.082.486.116.717l.02.138 2.254.398zm-.826-8.147c2.464.434 4.018 3.124 3.584 5.586-.434 2.463-1.187 3.853-1.36 4.838l-5.417-.955-.232-1.564c-.232-1.564-.55-2.636-.377-3.62.347-1.97 1.832-4.632 3.802-4.285z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "globe-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 21h5v2H6v-2h5v-1.05a10.002 10.002 0 0 1-7.684-4.988l1.737-.992A8 8 0 1 0 15.97 3.053l.992-1.737A9.996 9.996 0 0 1 22 10c0 5.185-3.947 9.449-9 9.95V21zm-1-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "goblet-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 19v-5.111L3 5V3h18v2l-8 8.889V19h5v2H6v-2h5zM7.49 7h9.02l1.8-2H5.69l1.8 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gas-station-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 19V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0v-7h-2a1 1 0 0 1-1-1V6.414l-1.657-1.657 1.414-1.414 4.95 4.95A.997.997 0 0 1 22 9v9a3 3 0 0 1-6 0v-4h-2v5h1v2H2v-2h1zM5 5v6h7V5H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "goblet-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 19v-5.111L3 5V3h18v2l-8 8.889V19h5v2H6v-2h5zM7.49 7h9.02l1.8-2H5.69l1.8 2zm1.8 2L12 12.01 14.71 9H9.29z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "guide-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 8v8a3 3 0 0 1-3 3H7.83a3.001 3.001 0 1 1 0-2H10a1 1 0 0 0 1-1V8a3 3 0 0 1 3-3h3V2l5 4-5 4V7h-3a1 1 0 0 0-1 1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gas-station-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 19h1v2H2v-2h1V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8h2a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0v-7h-2a1 1 0 0 1-1-1V6.414l-1.657-1.657 1.414-1.414 4.95 4.95A.997.997 0 0 1 22 9v9a3 3 0 0 1-6 0v-4h-2v5zm-9 0h7v-6H5v6zM5 5v6h7V5H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "globe-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 21h5v2H6v-2h5v-1.05a10.002 10.002 0 0 1-7.684-4.988l1.737-.992A8 8 0 1 0 15.97 3.053l.992-1.737A9.996 9.996 0 0 1 22 10c0 5.185-3.947 9.449-9 9.95V21zm-1-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "guide-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 8v8a3 3 0 0 1-3 3H7.83a3.001 3.001 0 1 1 0-2H10a1 1 0 0 0 1-1V8a3 3 0 0 1 3-3h3V2l5 4-5 4V7h-3a1 1 0 0 0-1 1zM5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "lifebuoy-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 15a4.987 4.987 0 0 1-1.828-.345l-2.236 2.237A7.963 7.963 0 0 0 12 20a7.963 7.963 0 0 0 4.064-1.108l-2.236-2.237A4.987 4.987 0 0 1 12 17zm-8-5c0 1.484.404 2.873 1.108 4.064l2.237-2.236A4.987 4.987 0 0 1 7 12c0-.645.122-1.261.345-1.828L5.108 7.936A7.963 7.963 0 0 0 4 12zm14.892-4.064l-2.237 2.236c.223.567.345 1.183.345 1.828s-.122 1.261-.345 1.828l2.237 2.236A7.963 7.963 0 0 0 20 12a7.963 7.963 0 0 0-1.108-4.064zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0-5a7.963 7.963 0 0 0-4.064 1.108l2.236 2.237A4.987 4.987 0 0 1 12 7c.645 0 1.261.122 1.828.345l2.236-2.237A7.963 7.963 0 0 0 12 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "luggage-cart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M5.5 20c.828 0 1.5.672 1.5 1.5S6.328 23 5.5 23 4 22.328 4 21.5 4.672 20 5.5 20zm13 0c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5-1.5-.672-1.5-1.5.672-1.5 1.5-1.5zM2.172 1.757l3.827 3.828V17L20 17v2H5c-.552 0-1-.448-1-1V6.413L.756 3.172l1.415-1.415zM16 3c.552 0 1 .448 1 1v2h2.993C20.55 6 21 6.456 21 6.995v8.01c0 .55-.45.995-1.007.995H8.007C7.45 16 7 15.544 7 15.005v-8.01C7 6.445 7.45 6 8.007 6h2.992L11 4c0-.552.448-1 1-1h4zm-5 5h-1v6h1V8zm7 0h-1v6h1V8zm-3-3h-2v1h2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "luggage-cart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M5.5 20c.828 0 1.5.672 1.5 1.5S6.328 23 5.5 23 4 22.328 4 21.5 4.672 20 5.5 20zm13 0c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5-1.5-.672-1.5-1.5.672-1.5 1.5-1.5zM2.172 1.757l3.827 3.828V17L20 17v2H5c-.552 0-1-.448-1-1V6.413L.756 3.172l1.415-1.415zM16 3c.552 0 1 .448 1 1v2h2.993C20.55 6 21 6.456 21 6.995v8.01c0 .55-.45.995-1.007.995H8.007C7.45 16 7 15.544 7 15.005v-8.01C7 6.445 7.45 6 8.007 6h2.992L11 4c0-.552.448-1 1-1h4zm-6 5H9v6h1V8zm6 0h-4v6h4V8zm3 0h-1v6h1V8zm-4-3h-2v1h2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hotel-bed-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11v9h-2v-3H4v3H2V4h2v10h8V7h6a4 4 0 0 1 4 4zM8 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "luggage-deposit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 3c.552 0 1 .448 1 1v2h4c.552 0 1 .448 1 1v12h2v2H1v-2h2V7c0-.552.448-1 1-1h4V4c0-.552.448-1 1-1h6zm-5 5H8v11h2V8zm6 0h-2v11h2V8zm-2-3h-4v1h4V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hotel-bed-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11v9h-2v-3H4v3H2V4h2v10h8V7h6a4 4 0 0 1 4 4zm-2 3v-3a2 2 0 0 0-2-2h-4v5h6zM8 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "luggage-deposit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 3c.552 0 1 .448 1 1v2h4c.552 0 1 .448 1 1v12h2v2H1v-2h2V7c0-.552.448-1 1-1h4V4c0-.552.448-1 1-1h6zM8 8H5v11h3V8zm6 0h-4v11h4V8zm5 0h-3v11h3V8zm-5-3h-4v1h4V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 5l7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5zm13 14.764V7.176l-.065.028L9 4.236v12.588l.065-.028L15 19.764z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "lifebuoy-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zM7.197 14.682l-2.175 2.174a8.549 8.549 0 0 0 1.818 1.899l.305.223 2.173-2.175a5.527 5.527 0 0 1-1.98-1.883l-.14-.238zm9.606 0a5.527 5.527 0 0 1-1.883 1.98l-.238.14 2.174 2.176a8.549 8.549 0 0 0 1.899-1.818l.223-.304-2.175-2.174zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM7.145 5.022a8.549 8.549 0 0 0-1.9 1.818l-.223.305 2.175 2.173a5.527 5.527 0 0 1 1.883-1.98l.238-.14-2.173-2.176zm9.71 0l-2.173 2.175a5.527 5.527 0 0 1 1.98 1.883l.14.238 2.176-2.173a8.549 8.549 0 0 0-1.818-1.9l-.304-.223z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 5l7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5zm14 14.395l4-1.714V5.033l-4 1.714v12.648zm-2-.131V6.736l-4-2v12.528l4 2zm-6-2.011V4.605L4 6.319v12.648l4-1.714z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 5l7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 5l7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5zm12.935 2.204l-6-3L4 6.319v12.648l5.065-2.17 6 3L20 17.68V5.033l-5.065 2.17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.364 17.364L12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0L12 23.728zm4.95-7.778a7 7 0 1 0-9.9 0L12 20.9l4.95-4.95zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 19.945A9.001 9.001 0 0 1 12 2a9 9 0 0 1 1 17.945V24h-2v-4.055z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 19.945A9.001 9.001 0 0 1 12 2a9 9 0 0 1 1 17.945V24h-2v-4.055zM12 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 17.938A8.001 8.001 0 0 1 12 2a8 8 0 0 1 1 15.938V21h-2v-3.062zM5 22h14v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 17.938A8.001 8.001 0 0 1 12 2a8 8 0 0 1 1 15.938V21h-2v-3.062zM12 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm-7 6h14v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.657 15.657L12 21.314l-5.657-5.657a8 8 0 1 1 11.314 0zM5 22h14v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.364 17.364L12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0zM11 10H8v2h3v3h2v-3h3v-2h-3V7h-2v3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20.9l4.95-4.95a7 7 0 1 0-9.9 0L12 20.9zm0 2.828l-6.364-6.364a9 9 0 1 1 12.728 0L12 23.728zM11 10V7h2v3h3v2h-3v3h-2v-3H8v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.364 17.364L12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0zM12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20.9l4.95-4.95a7 7 0 1 0-9.9 0L12 20.9zm0 2.828l-6.364-6.364a9 9 0 1 1 12.728 0L12 23.728zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 18.485l4.243-4.242a6 6 0 1 0-8.486 0L12 18.485zm5.657-2.828L12 21.314l-5.657-5.657a8 8 0 1 1 11.314 0zM5 22h14v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-range-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 17.938A8.001 8.001 0 0 1 12 2a8 8 0 0 1 1 15.938v2.074c3.946.092 7 .723 7 1.488 0 .828-3.582 1.5-8 1.5s-8-.672-8-1.5c0-.765 3.054-1.396 7-1.488v-2.074zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-range-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 17.938A8.001 8.001 0 0 1 12 2a8 8 0 0 1 1 15.938v2.074c3.946.092 7 .723 7 1.488 0 .828-3.582 1.5-8 1.5s-8-.672-8-1.5c0-.765 3.054-1.396 7-1.488v-2.074zM12 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-4a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-time-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 11V6h-2v7h6v-2h-4zm5.364 6.364L12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-user-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.084 15.812a7 7 0 1 0-10.168 0A5.996 5.996 0 0 1 12 13a5.996 5.996 0 0 1 5.084 2.812zM12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0L12 23.728zM12 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "motorbike-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.365 10L11.2 8H17v2h-5.144L9 12H2v-2h6.365zm.916 5.06l2.925-1.065.684 1.88-2.925 1.064a4.5 4.5 0 1 1-.684-1.88zM5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm13 2a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM4 11h6l2.6-1.733.28-1.046 1.932.518-1.922 7.131-1.822-.888.118-.44L9 16l-1-2H4v-3zm12.092-5H20v3h-2.816l1.92 5.276-1.88.684L15.056 9H15v-.152L13.6 5H11V3h4l1.092 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-user-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.084 15.812a7 7 0 1 0-10.168 0A5.996 5.996 0 0 1 12 13a5.996 5.996 0 0 1 5.084 2.812zm-8.699 1.473L12 20.899l3.615-3.614a4 4 0 0 0-7.23 0zM12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0L12 23.728zM12 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "map-pin-time-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.95 15.95a7 7 0 1 0-9.9 0L12 20.9l4.95-4.95zM12 23.728l-6.364-6.364a9 9 0 1 1 12.728 0L12 23.728zM13 11h4v2h-6V6h2v5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "motorbike-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 13.256V12H2v-2h6.365L11.2 8h3.491L13.6 5H11V3h4l1.092 3H20v3h-2.816l1.456 4.002a4.5 4.5 0 1 1-1.985.392L15.419 10h-.947l-1.582 5.87-.002-.001.002.006-2.925 1.064A4.5 4.5 0 1 1 4 13.256zm2-.229a4.5 4.5 0 0 1 3.281 2.033l1.957-.713L12.403 10h-.547L9 12H6v1.027zM5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm13 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "oil-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.07 7L6 11.606V20h12V7H9.07zM8 5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11l4-6zm5-4h5a1 1 0 0 1 1 1v2h-7V2a1 1 0 0 1 1-1zM8 12h2v6H8v-6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "parking-box-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 14h1.5a3.5 3.5 0 0 0 0-7H9v10h2v-3zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 6h1.5a1.5 1.5 0 0 1 0 3H11V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "parking-box-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm4 2h3.5a3.5 3.5 0 0 1 0 7H11v3H9V7zm2 2v3h1.5a1.5 1.5 0 0 0 0-3H11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "parking-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M6 3h7a6 6 0 1 1 0 12h-3v6H6V3zm4 4v4h3a2 2 0 1 0 0-4h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "navigation-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.9 2.3l18.805 6.268a.5.5 0 0 1 .028.939L13 13l-4.425 8.85a.5.5 0 0 1-.928-.086L2.26 2.911A.5.5 0 0 1 2.9 2.3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "navigation-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.965 5.096l3.546 12.41 3.04-6.08 5.637-2.255L4.965 5.096zM2.899 2.3l18.806 6.268a.5.5 0 0 1 .028.939L13 13l-4.425 8.85a.5.5 0 0 1-.928-.086L2.26 2.911A.5.5 0 0 1 2.9 2.3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "passport-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16zm-4 14H8v2h8v-2zM12 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pin-distance-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.39 10.39L7.5 14.277 3.61 10.39a5.5 5.5 0 1 1 7.78 0zM7.5 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12.89 10.89l-3.89 3.888-3.89-3.889a5.5 5.5 0 1 1 7.78 0zM16.5 17.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "passport-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h16zm-1 2H5v16h14V4zm-3 12v2H8v-2h8zM12 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pin-distance-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.975 8.975a3.5 3.5 0 1 0-4.95 0L7.5 11.45l2.475-2.475zM7.5 14.278L3.61 10.39a5.5 5.5 0 1 1 7.78 0L7.5 14.28zM7.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 12.45l2.475-2.475a3.5 3.5 0 1 0-4.95 0L16.5 20.45zm3.89-1.06l-3.89 3.888-3.89-3.889a5.5 5.5 0 1 1 7.78 0zM16.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "plane-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 8.947L22 14v2l-8-2.526v5.36l3 1.666V22l-4.5-1L8 22v-1.5l3-1.667v-5.36L3 16v-2l8-5.053V3.5a1.5 1.5 0 0 1 3 0v5.447z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "plane-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14 8.947L22 14v2l-8-2.526v5.36l3 1.666V22l-4.5-1L8 22v-1.5l3-1.667v-5.36L3 16v-2l8-5.053V3.5a1.5 1.5 0 0 1 3 0v5.447z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "police-car-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 13.5V21a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7.5l-1.243-.31A1 1 0 0 1 0 12.22v-.72a.5.5 0 0 1 .5-.5h1.929L4.48 6.212A2 2 0 0 1 6.319 5H8V3h3v2h2V3h3v2h1.681a2 2 0 0 1 1.838 1.212L21.571 11H23.5a.5.5 0 0 1 .5.5v.72a1 1 0 0 1-.757.97L22 13.5zM4 15v2a1 1 0 0 0 1 1h3.245a.5.5 0 0 0 .44-.736C7.88 15.754 6.318 15 4 15zm16 0c-2.317 0-3.879.755-4.686 2.264a.5.5 0 0 0 .441.736H19a1 1 0 0 0 1-1v-2zM6 7l-1.451 3.629A1 1 0 0 0 5.477 12h13.046a1 1 0 0 0 .928-1.371L18 7H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "police-car-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 13v5h16v-5H4zm1.618-2h12.764a1 1 0 0 0 .894-1.447L18 7H6L4.724 9.553A1 1 0 0 0 5.618 11zM22 13.5V21a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7.5l-1.243-.31A1 1 0 0 1 0 12.22v-.72a.5.5 0 0 1 .5-.5H2l2.447-4.894A2 2 0 0 1 6.237 5H8V3h3v2h2V3h3v2h1.764a2 2 0 0 1 1.789 1.106L22 11h1.5a.5.5 0 0 1 .5.5v.72a1 1 0 0 1-.757.97L22 13.5zM5 14c2.317 0 3.879.755 4.686 2.264a.5.5 0 0 1-.441.736H6a1 1 0 0 1-1-1v-2zm14 0v2a1 1 0 0 1-1 1h-3.245a.5.5 0 0 1-.44-.736C15.12 14.754 16.682 14 19 14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pushpin-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 3v2h-1v6l2 3v2h-6v7h-2v-7H5v-2l2-3V5H6V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pushpin-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 3v2h-1v6l2 3v2h-6v7h-2v-7H5v-2l2-3V5H6V3h12zM9 5v6.606L7.404 14h9.192L15 11.606V5H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pushpin-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22.314 10.172l-1.415 1.414-.707-.707-4.242 4.242-.707 3.536-1.415 1.414-4.242-4.243-4.95 4.95-1.414-1.414 4.95-4.95-4.243-4.242 1.414-1.415L8.88 8.05l4.242-4.242-.707-.707 1.414-1.415z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "restaurant-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.222 3.808l6.717 6.717-2.828 2.829-3.89-3.89a4 4 0 0 1 0-5.656zm10.046 8.338l-.854.854 7.071 7.071-1.414 1.414L12 14.415l-7.071 7.07-1.414-1.414 9.339-9.339c-.588-1.457.02-3.555 1.62-5.157 1.953-1.952 4.644-2.427 6.011-1.06s.892 4.058-1.06 6.01c-1.602 1.602-3.7 2.21-5.157 1.621z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pushpin-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13.828 1.686l8.486 8.486-1.415 1.414-.707-.707-4.242 4.242-.707 3.536-1.415 1.414-4.242-4.243-4.95 4.95-1.414-1.414 4.95-4.95-4.243-4.242 1.414-1.415L8.88 8.05l4.242-4.242-.707-.707 1.414-1.415zm.708 3.536l-4.671 4.67-2.822.565 6.5 6.5.564-2.822 4.671-4.67-4.242-4.243z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "restaurant-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.268 12.146l-.854.854 7.071 7.071-1.414 1.414L12 14.415l-7.071 7.07-1.414-1.414 9.339-9.339c-.588-1.457.02-3.555 1.62-5.157 1.953-1.952 4.644-2.427 6.011-1.06s.892 4.058-1.06 6.01c-1.602 1.602-3.7 2.21-5.157 1.621zM4.222 3.808l6.717 6.717-2.828 2.829-3.89-3.89a4 4 0 0 1 0-5.656zM18.01 9.11c1.258-1.257 1.517-2.726 1.061-3.182-.456-.456-1.925-.197-3.182 1.06-1.257 1.258-1.516 2.727-1.06 3.183.455.455 1.924.196 3.181-1.061z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "restaurant-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2v20h-2v-8h-3V7a5 5 0 0 1 5-5zM9 13.9V22H7v-8.1A5.002 5.002 0 0 1 3 9V3h2v7h2V3h2v7h2V3h2v6a5.002 5.002 0 0 1-4 4.9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "restaurant-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 2v20h-2v-7h-4V8a6 6 0 0 1 6-6zm-2 2.53C18.17 5 17 6.17 17 8v5h2V4.53zM9 13.9V22H7v-8.1A5.002 5.002 0 0 1 3 9V3h2v7h2V3h2v7h2V3h2v6a5.002 5.002 0 0 1-4 4.9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "riding-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.5 21a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm13 3a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-6.969-8.203L13 12v6h-2v-5l-2.719-2.266A2 2 0 0 1 8 7.671l2.828-2.828a2 2 0 0 1 2.829 0l1.414 1.414a6.969 6.969 0 0 0 3.917 1.975l-.01 2.015a8.962 8.962 0 0 1-5.321-2.575L11.53 9.797zM16 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "road-map-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.95 11.95a6.996 6.996 0 0 0 1.858-6.582l2.495-1.07a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V7l3.129-1.341a6.993 6.993 0 0 0 1.921 6.29L12 16.9l4.95-4.95zm-1.414-1.414L12 14.07l-3.536-3.535a5 5 0 1 1 7.072 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "riding-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.5 21a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm13 2a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-7.477-8.695L13 12v6h-2v-5l-2.719-2.266A2 2 0 0 1 8 7.671l2.828-2.828a2 2 0 0 1 2.829 0l1.414 1.414a6.969 6.969 0 0 0 3.917 1.975l-.01 2.015a8.962 8.962 0 0 1-5.321-2.575l-2.634 2.633zM16 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "road-map-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 6.143v12.824l5.065-2.17 6 3L20 17.68V4.857l1.303-.558a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V7l2-.857zm12.243 5.1L12 15.485l-4.243-4.242a6 6 0 1 1 8.486 0zM12 12.657l2.828-2.829a4 4 0 1 0-5.656 0L12 12.657z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "roadster-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 20H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7.5l-1.243-.31A1 1 0 0 1 0 12.22v-.72a.5.5 0 0 1 .5-.5H2l2.48-5.788A2 2 0 0 1 6.32 4H17.68a2 2 0 0 1 1.838 1.212L22 11h1.5a.5.5 0 0 1 .5.5v.72a1 1 0 0 1-.757.97L22 13.5V21a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1zm1-2v-5H4v5h16zM5.477 11h13.046a1 1 0 0 0 .928-1.371L18 6H6L4.549 9.629A1 1 0 0 0 5.477 11zM5 14c2.317 0 3.879.755 4.686 2.264a.5.5 0 0 1-.441.736H6a1 1 0 0 1-1-1v-2zm14 0v2a1 1 0 0 1-1 1h-3.245a.5.5 0 0 1-.44-.736C15.12 14.754 16.682 14 19 14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "roadster-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 13.5V21a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7.5l-1.243-.31A1 1 0 0 1 0 12.22v-.72a.5.5 0 0 1 .5-.5h1.875l2.138-5.702A2 2 0 0 1 6.386 4h11.228a2 2 0 0 1 1.873 1.298L21.625 11H23.5a.5.5 0 0 1 .5.5v.72a1 1 0 0 1-.757.97L22 13.5zM4 15v2a1 1 0 0 0 1 1h3.245a.5.5 0 0 0 .44-.736C7.88 15.754 6.318 15 4 15zm16 0c-2.317 0-3.879.755-4.686 2.264a.5.5 0 0 0 .441.736H19a1 1 0 0 0 1-1v-2zM6 6l-1.561 4.684A1 1 0 0 0 5.387 12h13.226a1 1 0 0 0 .948-1.316L18 6H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rocket-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.498 20h7.004A6.523 6.523 0 0 1 12 23.502 6.523 6.523 0 0 1 8.498 20zM18 14.805l2 2.268V19H4v-1.927l2-2.268V9c0-3.483 2.504-6.447 6-7.545C15.496 2.553 18 5.517 18 9v5.805zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rocket-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15.502 20A6.523 6.523 0 0 1 12 23.502 6.523 6.523 0 0 1 8.498 20h2.26c.326.489.747.912 1.242 1.243.495-.33.916-.754 1.243-1.243h2.259zM18 14.805l2 2.268V19H4v-1.927l2-2.268V9c0-3.483 2.504-6.447 6-7.545C15.496 2.553 18 5.517 18 9v5.805zM17.27 17L16 15.56V9c0-2.318-1.57-4.43-4-5.42C9.57 4.57 8 6.681 8 9v6.56L6.73 17h10.54zM12 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rocket-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.33 15.929A13.064 13.064 0 0 1 5 13c0-5.088 2.903-9.436 7-11.182C16.097 3.564 19 7.912 19 13c0 1.01-.114 1.991-.33 2.929l2.02 1.796a.5.5 0 0 1 .097.63l-2.458 4.096a.5.5 0 0 1-.782.096l-2.254-2.254a1 1 0 0 0-.707-.293H9.414a1 1 0 0 0-.707.293l-2.254 2.254a.5.5 0 0 1-.782-.096l-2.458-4.095a.5.5 0 0 1 .097-.631l2.02-1.796zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rocket-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 13c0-5.088 2.903-9.436 7-11.182C16.097 3.564 19 7.912 19 13c0 .823-.076 1.626-.22 2.403l1.94 1.832a.5.5 0 0 1 .095.603l-2.495 4.575a.5.5 0 0 1-.793.114l-2.234-2.234a1 1 0 0 0-.707-.293H9.414a1 1 0 0 0-.707.293l-2.234 2.234a.5.5 0 0 1-.793-.114l-2.495-4.575a.5.5 0 0 1 .095-.603l1.94-1.832C5.077 14.626 5 13.823 5 13zm1.476 6.696l.817-.817A3 3 0 0 1 9.414 18h5.172a3 3 0 0 1 2.121.879l.817.817.982-1.8-1.1-1.04a2 2 0 0 1-.593-1.82c.124-.664.187-1.345.187-2.036 0-3.87-1.995-7.3-5-8.96C8.995 5.7 7 9.13 7 13c0 .691.063 1.372.187 2.037a2 2 0 0 1-.593 1.82l-1.1 1.039.982 1.8zM12 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "route-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 15V8.5a4.5 4.5 0 0 1 9 0v7a2.5 2.5 0 1 0 5 0V8.83a3.001 3.001 0 1 1 2 0v6.67a4.5 4.5 0 1 1-9 0v-7a2.5 2.5 0 0 0-5 0V15h3l-4 5-4-5h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "route-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 15V8.5a4.5 4.5 0 0 1 9 0v7a2.5 2.5 0 1 0 5 0V8.83a3.001 3.001 0 1 1 2 0v6.67a4.5 4.5 0 1 1-9 0v-7a2.5 2.5 0 0 0-5 0V15h3l-4 5-4-5h3zm15-8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "run-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.83 8.79L8 9.456V13H6V8.05h.015l5.268-1.918c.244-.093.51-.14.782-.131a2.616 2.616 0 0 1 2.427 1.82c.186.583.356.977.51 1.182A4.992 4.992 0 0 0 19 11v2a6.986 6.986 0 0 1-5.402-2.547l-.581 3.297L15 15.67V23h-2v-5.986l-2.05-1.987-.947 4.298-6.894-1.215.348-1.97 4.924.868L9.83 8.79zM13.5 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "run-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.83 8.79L8 9.456V13H6V8.05h.015l5.268-1.918c.244-.093.51-.14.782-.131a2.616 2.616 0 0 1 2.427 1.82c.186.583.356.977.51 1.182A4.992 4.992 0 0 0 19 11v2a6.986 6.986 0 0 1-5.402-2.547l-.697 3.956L15 16.17V23h-2v-5.898l-2.27-1.904-.727 4.127-6.894-1.215.348-1.97 4.924.868L9.83 8.79zM13.5 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sailboat-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 18h18a.5.5 0 0 1 .4.8l-2.1 2.8a1 1 0 0 1-.8.4h-13a1 1 0 0 1-.8-.4l-2.1-2.8A.5.5 0 0 1 3 18zM15 2.425V15a1 1 0 0 1-1 1H4.04a.5.5 0 0 1-.39-.812L14.11 2.113a.5.5 0 0 1 .89.312z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sailboat-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 18h18a.5.5 0 0 1 .4.8l-2.1 2.8a1 1 0 0 1-.8.4h-13a1 1 0 0 1-.8-.4l-2.1-2.8A.5.5 0 0 1 3 18zm4.161-4H13V6.702L7.161 14zM15 2.425V15a1 1 0 0 1-1 1H4.04a.5.5 0 0 1-.39-.812L14.11 2.113a.5.5 0 0 1 .89.312z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ship-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 4h5.446a1 1 0 0 1 .848.47L18.75 10h4.408a.5.5 0 0 1 .439.74l-3.937 7.217A4.992 4.992 0 0 1 15 16 4.992 4.992 0 0 1 11 18a4.992 4.992 0 0 1-4-2 4.992 4.992 0 0 1-4.55 1.97l-1.236-6.791A1 1 0 0 1 2.198 10H3V5a1 1 0 0 1 1-1h1V1h4v3zm-4 6h11.392l-2.5-4H5v4zM3 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 11 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 19 20h2v2h-2a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 11 22a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 3 22H1v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ship-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 4h5.446a1 1 0 0 1 .848.47L18.75 10h4.408a.5.5 0 0 1 .439.74L19.637 18H19a6.01 6.01 0 0 1-1.535-.198L20.63 12H3.4l1.048 5.824A6.013 6.013 0 0 1 3 18h-.545l-1.24-6.821A1 1 0 0 1 2.197 10H3V5a1 1 0 0 1 1-1h1V1h4v3zm-4 6h11.392l-2.5-4H5v4zM3 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 11 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 19 20h2v2h-2a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 11 22a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 3 22H1v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ship-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 10.4V4a1 1 0 0 1 1-1h5V1h4v2h5a1 1 0 0 1 1 1v6.4l1.086.326a1 1 0 0 1 .682 1.2l-1.516 6.068A4.992 4.992 0 0 1 16 16 4.992 4.992 0 0 1 12 18a4.992 4.992 0 0 1-4-2 4.992 4.992 0 0 1-4.252 1.994l-1.516-6.068a1 1 0 0 1 .682-1.2L4 10.4zm2-.6L12 8l2.754.826 1.809.543L18 9.8V5H6v4.8zM4 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 12 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 20 20h2v2h-2a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 12 22a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 4 22H2v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ship-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 10.4V4a1 1 0 0 1 1-1h5V1h4v2h5a1 1 0 0 1 1 1v6.4l1.086.326a1 1 0 0 1 .682 1.2l-1.516 6.068a4.992 4.992 0 0 1-1.902-.272l1.25-5.352L12 10l-7.6 2.37 1.25 5.351a4.992 4.992 0 0 1-1.902.273l-1.516-6.068a1 1 0 0 1 .682-1.2L4 10.4zm2-.6L12 8l6 1.8V5H6v4.8zM4 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 12 20a5.978 5.978 0 0 0 4-1.528A5.978 5.978 0 0 0 20 20h2v2h-2a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 12 22a7.963 7.963 0 0 1-4-1.07A7.963 7.963 0 0 1 4 22H2v-2h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-tower-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.116 20.087A9.986 9.986 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10a9.986 9.986 0 0 1-4.116 8.087l-1.015-1.739a8 8 0 1 0-9.738 0l-1.015 1.739zm2.034-3.485a6 6 0 1 1 7.7 0l-1.03-1.766a4 4 0 1 0-5.64 0l-1.03 1.766zM11 13h2v9h-2v-9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "space-ship-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.88 18.054a35.897 35.897 0 0 1 8.531-16.32.8.8 0 0 1 1.178 0c.166.18.304.332.413.455a35.897 35.897 0 0 1 8.118 15.865c-2.141.451-4.34.747-6.584.874l-2.089 4.178a.5.5 0 0 1-.894 0l-2.089-4.178a44.019 44.019 0 0 1-6.584-.874zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "signal-tower-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.116 20.087A9.986 9.986 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10a9.986 9.986 0 0 1-4.116 8.087l-1.015-1.739a8 8 0 1 0-9.738 0l-1.015 1.739zm2.034-3.485a6 6 0 1 1 7.7 0l-1.03-1.766a4 4 0 1 0-5.64 0l-1.03 1.766zM11 13h2l1 9h-4l1-9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "steering-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zM8 13l-3.938.001A8.004 8.004 0 0 0 11 19.938V16a3 3 0 0 1-3-3zm11.938.001L16 13a3 3 0 0 1-3 3l.001 3.938a8.004 8.004 0 0 0 6.937-6.937zM12 4a8.001 8.001 0 0 0-7.938 7H8a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1h3.938A8.001 8.001 0 0 0 12 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "space-ship-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2.88 18.054a35.897 35.897 0 0 1 8.531-16.32.8.8 0 0 1 1.178 0c.166.18.304.332.413.455a35.897 35.897 0 0 1 8.118 15.865c-2.141.451-4.34.747-6.584.874l-2.089 4.178a.5.5 0 0 1-.894 0l-2.089-4.178a44.019 44.019 0 0 1-6.584-.874zm6.698-1.123l1.157.066L12 19.527l1.265-2.53 1.157-.066a42.137 42.137 0 0 0 4.227-.454A33.913 33.913 0 0 0 12 4.09a33.913 33.913 0 0 0-6.649 12.387c1.395.222 2.805.374 4.227.454zM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "oil-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11l4-6zm5-4h5a1 1 0 0 1 1 1v2h-7V2a1 1 0 0 1 1-1zM6 12v7h2v-7H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "parking-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 3h7a6 6 0 1 1 0 12H8v6H6V3zm2 2v8h5a4 4 0 1 0 0-8H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "steering-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21.8 14.001a10.009 10.009 0 0 1-8.4 7.902v-2.025A8.01 8.01 0 0 0 19.748 14l2.052.001zm-17.548 0a8.01 8.01 0 0 0 6.247 5.858v2.03A10.01 10.01 0 0 1 2.2 14h2.052zM18 11v2h-1a4 4 0 0 0-3.995 3.8L13 17v1h-2v-1a4 4 0 0 0-3.8-3.995L7 13H6v-2h12zm-6-9c5.185 0 9.449 3.947 9.95 9h-2.012a8.001 8.001 0 0 0-15.876 0H2.049C2.551 5.947 6.815 2 12 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "steering-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zM8 13l-3.938.001A8.004 8.004 0 0 0 11 19.938V16a3 3 0 0 1-3-3zm11.938.001L16 13a3 3 0 0 1-3 3l.001 3.938a8.004 8.004 0 0 0 6.937-6.937zM14 12h-4v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1zm-2-8a8.001 8.001 0 0 0-7.938 7H8a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1h3.938A8.001 8.001 0 0 0 12 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "steering-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21.8 14.001a10.009 10.009 0 0 1-8.4 7.902v-2.025A8.01 8.01 0 0 0 19.748 14l2.052.001zm-17.548 0a8.01 8.01 0 0 0 6.247 5.858v2.03A10.01 10.01 0 0 1 2.2 14h2.052zM18 11v2h-3a2 2 0 0 0-1.995 1.85L13 15v3h-2v-3a2 2 0 0 0-1.85-1.995L9 13H6v-2h12zm-6-9c5.185 0 9.449 3.947 9.95 9h-2.012a8.001 8.001 0 0 0-15.876 0H2.049C2.551 5.947 6.815 2 12 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "subway-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.2 20l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v11a2 2 0 0 1-2 2h-1.8zM11 12V5H7a2 2 0 0 0-2 2v5h6zm2 0h6V7a2 2 0 0 0-2-2h-4v7zm-5.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "subway-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.2 20l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v11a2 2 0 0 1-2 2h-1.8zM13 5v6h6V7a2 2 0 0 0-2-2h-4zm-2 0H7a2 2 0 0 0-2 2v4h6V5zm8 8H5v5h14v-5zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "subway-wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 3v9h8v6a2 2 0 0 1-2 2h-1.8l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h6zM7.5 15a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 5H7a2 2 0 0 0-1.995 1.85L5 7v5h6V5zm7.5-4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "subway-wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 18a2 2 0 0 1-2 2h-1.8l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h6v8h8v7zm-2-5H5v5h14v-5zM7.5 14a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm9 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11 5H7a2 2 0 0 0-1.995 1.85L5 7v4h6V5zm7.5-4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "suitcase-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M18 23h-2v-1H8v1H6v-1H5c-1.105 0-2-.895-2-2V7c0-1.105.895-2 2-2h3V3c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v2h3c1.105 0 2 .895 2 2v13c0 1.105-.895 2-2 2h-1v1zM10 9H8v9h2V9zm6 0h-2v9h2V9zm-2-5h-4v1h4V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "suitcase-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M18 23h-2v-1H8v1H6v-1H5c-1.105 0-2-.895-2-2V7c0-1.105.895-2 2-2h3V3c0-.552.448-1 1-1h6c.552 0 1 .448 1 1v2h3c1.105 0 2 .895 2 2v13c0 1.105-.895 2-2 2h-1v1zm1-16H5v13h14V7zm-9 2v9H8V9h2zm6 0v9h-2V9h2zm-2-5h-4v1h4V4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "suitcase-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 1c.552 0 1 .448 1 1v5h1V6h2v1h1c.552 0 1 .448 1 1v12c0 .552-.448 1-1 1h-1v1h-2v-1H7v1H5v-1H4c-.552 0-1-.448-1-1V8c0-.552.448-1 1-1h1V6h2v1h1V2c0-.552.448-1 1-1h6zm-6 9H7v8h2v-8zm4 0h-2v8h2v-8zm4 0h-2v8h2v-8zm-3-7h-4v4h4V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "suitcase-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 1c.552 0 1 .448 1 1v5h1V6h2v1h1c.552 0 1 .448 1 1v12c0 .552-.448 1-1 1h-1v1h-2v-1H7v1H5v-1H4c-.552 0-1-.448-1-1V8c0-.552.448-1 1-1h1V6h2v1h1V2c0-.552.448-1 1-1h6zm4 8H5v10h14V9zM9 10v8H7v-8h2zm4 0v8h-2v-8h2zm4 0v8h-2v-8h2zm-3-7h-4v4h4V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "suitcase-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 3c.552 0 1 .448 1 1v2h5c.552 0 1 .448 1 1v13c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V7c0-.552.448-1 1-1h5V4c0-.552.448-1 1-1h6zm1 5H8v11h8V8zM4 8v11h2V8H4zm10-3h-4v1h4V5zm4 3v11h2V8h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "takeaway-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <g>\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path fill-rule="nonzero" d="M16,1 C16.5522847,1 17,1.44771525 17,2 L17,2.999 L22,3 L22,9 L19.98,8.999 L22.7467496,16.595251 C22.9104689,17.0320314 23,17.5050658 23,17.9990113 C23,20.2081503 21.209139,21.9990113 19,21.9990113 C17.1367966,21.9990113 15.5711292,20.7251084 15.1264725,19.0007774 L10.8737865,19.0007613 C10.429479,20.7256022 8.86356525,22 7,22 C5.05513052,22 3.43445123,20.6119768 3.07453347,18.7725019 C2.43557576,18.4390399 2,17.770387 2,17 L2,12 L11,12 C11,12.5128358 11.3860402,12.9355072 11.8833789,12.9932723 L12,13 L14,13 C14.5128358,13 14.9355072,12.6139598 14.9932723,12.1166211 L15,12 L15,3 L12,3 L12,1 L16,1 Z M7,16 C5.8954305,16 5,16.8954305 5,18 C5,19.1045695 5.8954305,20 7,20 C8.1045695,20 9,19.1045695 9,18 C9,16.8954305 8.1045695,16 7,16 Z M19,16 C17.8954305,16 17,16.8954305 17,18 C17,19.1045695 17.8954305,20 19,20 C20.1045695,20 21,19.1045695 21,18 C21,16.8954305 20.1045695,16 19,16 Z M10,3 C10.5522847,3 11,3.44771525 11,4 L11,11 L2,11 L2,4 C2,3.44771525 2.44771525,3 3,3 L10,3 Z M20,5 L17,5 L17,7 L20,7 L20,5 Z M9,5 L4,5 L4,6 L9,6 L9,5 Z"/>\n  </g>\n</svg>\n',
                },
                {
                    name: "suitcase-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M15 3c.552 0 1 .448 1 1v2h5c.552 0 1 .448 1 1v13c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V7c0-.552.448-1 1-1h5V4c0-.552.448-1 1-1h6zM8 8H6v11h2V8zm10 0h-2v11h2V8zm-4-3h-4v1h4V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "takeaway-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <g>\n    <path fill="none" d="M0 0h24v24H0z"/>\n    <path fill-rule="nonzero" d="M16,1 C16.5522847,1 17,1.44771525 17,2 L17,2.999 L22,3 L22,9 L19.98,8.999 L22.7467496,16.595251 C22.9104689,17.0320314 23,17.5050658 23,17.9990113 C23,20.2081503 21.209139,21.9990113 19,21.9990113 C17.1367966,21.9990113 15.5711292,20.7251084 15.1264725,19.0007774 L10.8737865,19.0007613 C10.429479,20.7256022 8.86356525,22 7,22 C5.05513052,22 3.43445123,20.6119768 3.07453347,18.7725019 C2.43557576,18.4390399 2,17.770387 2,17 L2,4 C2,3.44771525 2.44771525,3 3,3 L10,3 C10.5522847,3 11,3.44771525 11,4 L11,12 C11,12.5128358 11.3860402,12.9355072 11.8833789,12.9932723 L12,13 L14,13 C14.5128358,13 14.9355072,12.6139598 14.9932723,12.1166211 L15,12 L15,3 L12,3 L12,1 L16,1 Z M7,16 C5.8954305,16 5,16.8954305 5,18 C5,19.1045695 5.8954305,20 7,20 C8.1045695,20 9,19.1045695 9,18 C9,16.8954305 8.1045695,16 7,16 Z M19,15.9990113 C17.8954305,15.9990113 17,16.8944418 17,17.9990113 C17,19.1035808 17.8954305,19.9990113 19,19.9990113 C20.1045695,19.9990113 21,19.1035808 21,17.9990113 C21,16.8944418 20.1045695,15.9990113 19,15.9990113 Z M17.852,8.999 L17,8.999 L17,12 C17,13.6568542 15.6568542,15 14,15 L12,15 C10.6941178,15 9.58311485,14.1656226 9.17102423,13.0009007 L3.99994303,13 L3.99994303,15.3542402 C4.73288889,14.523782 5.80527652,14 7,14 C8.86392711,14 10.4300871,15.2748927 10.8740452,17.0002597 L15.1256964,17.0002597 C15.5693048,15.2743991 17.135711,13.9990113 19,13.9990113 C19.2372818,13.9990113 19.469738,14.019672 19.6956678,14.0592925 L17.852,8.999 Z M9,8 L4,8 L4,11 L9,11 L9,8 Z M20,5 L17,5 L17,7 L20,7 L20,5 Z M9,5 L4,5 L4,6 L9,6 L9,5 Z"/>\n  </g>\n</svg>\n',
                },
                {
                    name: "taxi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 12v9a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9l2.48-5.788A2 2 0 0 1 6.32 5H9V3h6v2h2.681a2 2 0 0 1 1.838 1.212L22 12zM4.176 12h15.648l-2.143-5H6.32l-2.143 5zM6.5 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "taxi-wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 3v4H6.319l-2.144 5H22v9a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9l2.48-5.788A2 2 0 0 1 6.32 5H9V3h3zM6.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm1-13a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "taxi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 11v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V11l2.447-4.894A2 2 0 0 1 6.237 5H9V3h6v2h2.764a2 2 0 0 1 1.789 1.106L22 11zm-2 2H4v5h16v-5zM4.236 11h15.528l-2-4H6.236l-2 4zM6.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "taxi-wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12 3v4H6.236l-2.001 4H22v10a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H5v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V11l2.447-4.894A2 2 0 0 1 6.237 5H9V3h3zm8 10H4v5h16v-5zM6.5 14a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm11 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm1-13a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "traffic-light-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 4V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1h3c0 2.5-2.5 3.5-3 3.5V10h3c0 2.5-2.5 3.5-3 3.5V16h3c0 2.5-2.5 3.5-3 3.5V21a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1.5c-.5 0-3-1-3-3.5h3v-2.5c-.5 0-3-1-3-3.5h3V7.5c-.5 0-3-1-3-3.5h3zm5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "traffic-light-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 4V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1h3c0 2.5-2.5 3.5-3 3.5V10h3c0 2.5-2.5 3.5-3 3.5V16h3c0 2.5-2.5 3.5-3 3.5V21a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-1.5c-.5 0-3-1-3-3.5h3v-2.5c-.5 0-3-1-3-3.5h3V7.5c-.5 0-3-1-3-3.5h3zm5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "train-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.2 20l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v11a2 2 0 0 1-2 2h-1.8zM5 7v4h14V7H5zm7 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "train-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.2 20l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v11a2 2 0 0 1-2 2h-1.8zM7 5a2 2 0 0 0-2 2v11h14V7a2 2 0 0 0-2-2H7zm5 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM6 7h12v4H6V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "train-wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.498 3a6.518 6.518 0 0 0-.324 4H5v4h10.035a6.47 6.47 0 0 0 3.465 1 6.48 6.48 0 0 0 2.5-.498V18a2 2 0 0 1-2 2h-1.8l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h5.498zM12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6.5-13a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "train-wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.498 3a6.464 6.464 0 0 0-.479 2H7a2 2 0 0 0-1.995 1.85L5 7v11h14v-6.019a6.463 6.463 0 0 0 2-.48V18a2 2 0 0 1-2 2h-1.8l1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h5.498zM12 13a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm.174-6a6.51 6.51 0 0 0 2.862 4.001L6 11V7h6.174zM18.5 1a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 5.167c-.491 0-.94.177-1.289.47l-.125.115L18.5 8.167l1.413-1.416a1.994 1.994 0 0 0-1.413-.584zm0-2.667a4.65 4.65 0 0 0-3.128 1.203l-.173.165.944.942a3.323 3.323 0 0 1 2.357-.977 3.32 3.32 0 0 1 2.201.83l.156.147.943-.943A4.652 4.652 0 0 0 18.5 3.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "treasure-map-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 5l7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5zm4 6v2h2v-2H6zm4 0v2h2v-2h-2zm6-.06l-1.237-1.238-1.061 1.06L14.939 12l-1.237 1.237 1.06 1.061L16 13.061l1.237 1.237 1.061-1.06L17.061 12l1.237-1.237-1.06-1.061L16 10.939z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "treasure-map-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M14.935 7.204l-6-3L4 6.319v12.648l5.065-2.17 6 3L20 17.68V5.033l-5.065 2.17zM2 5l7-3 6 3 6.303-2.701a.5.5 0 0 1 .697.46V19l-7 3-6-3-6.303 2.701a.5.5 0 0 1-.697-.46V5zm4 6h2v2H6v-2zm4 0h2v2h-2v-2zm5.998-.063L17.236 9.7l1.06 1.06-1.237 1.238 1.237 1.238-1.06 1.06-1.238-1.237-1.237 1.237-1.061-1.06 1.237-1.238-1.237-1.237L14.76 9.7l1.238 1.237z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "walk-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.617 8.712l3.205-2.328A1.995 1.995 0 0 1 12.065 6a2.616 2.616 0 0 1 2.427 1.82c.186.583.356.977.51 1.182A4.992 4.992 0 0 0 19 11v2a6.986 6.986 0 0 1-5.402-2.547l-.697 3.955 2.061 1.73 2.223 6.108-1.88.684-2.04-5.604-3.39-2.845a2 2 0 0 1-.713-1.904l.509-2.885-.677.492-2.127 2.928-1.618-1.176L7.6 8.7l.017.012zM13.5 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-2.972 13.181l-3.214 3.83-1.532-1.285 2.976-3.546.746-2.18 1.791 1.5-.767 1.681z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "truck-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none"  d="M0 0h24v24H0z"/>\n        <path d="M8.965 18a3.5 3.5 0 0 1-6.93 0H1V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2h3l3 4.056V18h-2.035a3.5 3.5 0 0 1-6.93 0h-5.07zM15 7H3v8.05a3.5 3.5 0 0 1 5.663.95h5.674c.168-.353.393-.674.663-.95V7zm2 6h4v-.285L18.992 10H17v3zm.5 6a1.5 1.5 0 1 0 0-3.001 1.5 1.5 0 0 0 0 3.001zM7 17.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "truck-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 8h3l3 4.056V18h-2.035a3.5 3.5 0 0 1-6.93 0h-5.07a3.5 3.5 0 0 1-6.93 0H1V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2zm0 2v3h4v-.285L18.992 10H17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "walk-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.617 8.712l3.205-2.328A1.995 1.995 0 0 1 12.065 6a2.616 2.616 0 0 1 2.427 1.82c.186.583.356.977.51 1.182A4.992 4.992 0 0 0 19 11v2a6.986 6.986 0 0 1-5.402-2.547l-.697 3.955 2.061 1.73 2.223 6.108-1.88.684-2.04-5.604-3.39-2.845a2 2 0 0 1-.713-1.904l.509-2.885-.677.492-2.127 2.928-1.618-1.176L7.6 8.7l.017.012zM13.5 5.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-2.972 13.181l-3.214 3.83-1.532-1.285 2.976-3.546.746-2.18 1.791 1.5-.767 1.681z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "media",
            iconsvg: [
                {
                    name: "4k-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8.5 10.5V12h-1V9H9v3H7.5V9H6v4.5h3V15h1.5v-1.5h1zM18 15l-2.25-3L18 9h-1.75l-1.75 2.25V9H13v6h1.5v-2.25L16.25 15H18z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "4k-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8.5 10.5h-1V15H9v-1.5H6V9h1.5v3H9V9h1.5v3h1v1.5zM18 15h-1.75l-1.75-2.25V15H13V9h1.5v2.25L16.25 9H18l-2.25 3L18 15z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "aspect-ratio-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-1 2H4v14h16V5zm-7 12v-2h3v-3h2v5h-5zM11 7v2H8v3H6V7h5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "album-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "broadcast-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 2.929l1.414 1.414A7.975 7.975 0 0 0 4 10c0 2.21.895 4.21 2.343 5.657L4.93 17.07A9.969 9.969 0 0 1 2 10a9.969 9.969 0 0 1 2.929-7.071zm14.142 0A9.969 9.969 0 0 1 22 10a9.969 9.969 0 0 1-2.929 7.071l-1.414-1.414A7.975 7.975 0 0 0 20 10c0-2.21-.895-4.21-2.343-5.657L19.07 2.93zM7.757 5.757l1.415 1.415A3.987 3.987 0 0 0 8 10c0 1.105.448 2.105 1.172 2.828l-1.415 1.415A5.981 5.981 0 0 1 6 10c0-1.657.672-3.157 1.757-4.243zm8.486 0A5.981 5.981 0 0 1 18 10a5.981 5.981 0 0 1-1.757 4.243l-1.415-1.415A3.987 3.987 0 0 0 16 10a3.987 3.987 0 0 0-1.172-2.828l1.415-1.415zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 2c.58 0 1.077.413 1.184.983L14.5 22h-5l1.316-7.017c.107-.57.604-.983 1.184-.983z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "album-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2zm0 14c2.213 0 4-1.787 4-4s-1.787-4-4-4-4 1.787-4 4 1.787 4 4 4zm0-5c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "aspect-ratio-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm-3 9h-2v3h-3v2h5v-5zm-7-5H6v5h2V9h3V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 2a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm6-12v2h2V5h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM4 5v14h16V5H4zm8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm5-11h2v2h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "broadcast-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.929 2.929l1.414 1.414A7.975 7.975 0 0 0 4 10c0 2.21.895 4.21 2.343 5.657L4.93 17.07A9.969 9.969 0 0 1 2 10a9.969 9.969 0 0 1 2.929-7.071zm14.142 0A9.969 9.969 0 0 1 22 10a9.969 9.969 0 0 1-2.929 7.071l-1.414-1.414A7.975 7.975 0 0 0 20 10c0-2.21-.895-4.21-2.343-5.657L19.07 2.93zM7.757 5.757l1.415 1.415A3.987 3.987 0 0 0 8 10c0 1.105.448 2.105 1.172 2.828l-1.415 1.415A5.981 5.981 0 0 1 6 10c0-1.657.672-3.157 1.757-4.243zm8.486 0A5.981 5.981 0 0 1 18 10a5.981 5.981 0 0 1-1.757 4.243l-1.415-1.415A3.987 3.987 0 0 0 16 10a3.987 3.987 0 0 0-1.172-2.828l1.415-1.415zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-1 2h2v8h-2v-8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 6c0-.552.455-1 .992-1h18.016c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H2.992A.994.994 0 0 1 2 20V6zm2 1v12h16V7H4zm10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM4 2h6v2H4V2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 3h6l2 2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4l2-2zm3 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-2a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-lens-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.827 21.763L14.31 14l3.532 6.117A9.955 9.955 0 0 1 12 22c-.746 0-1.473-.082-2.173-.237zM7.89 21.12A10.028 10.028 0 0 1 2.458 15h8.965L7.89 21.119zM2.05 13a9.964 9.964 0 0 1 2.583-7.761L9.112 13H2.05zm4.109-9.117A9.955 9.955 0 0 1 12 2c.746 0 1.473.082 2.173.237L9.69 10 6.159 3.883zM16.11 2.88A10.028 10.028 0 0 1 21.542 9h-8.965l3.533-6.119zM21.95 11a9.964 9.964 0 0 1-2.583 7.761L14.888 11h7.064z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-lens-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.858 19.71L12 16H5.07a8.018 8.018 0 0 0 4.788 3.71zM4.252 14h4.284L5.07 7.999A7.963 7.963 0 0 0 4 12c0 .69.088 1.36.252 2zm2.143-7.708L8.535 10 12 4a7.974 7.974 0 0 0-5.605 2.292zm7.747-2.002L12 8h6.93a8.018 8.018 0 0 0-4.788-3.71zM19.748 10h-4.284l3.465 6.001A7.963 7.963 0 0 0 20 12c0-.69-.088-1.36-.252-2zm-2.143 7.708L15.465 14 12 20a7.974 7.974 0 0 0 5.605-2.292zM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm1.155-12h-2.31l-1.154 2 1.154 2h2.31l1.154-2-1.154-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 6c0-.552.455-1 .992-1h18.016c.548 0 .992.445.992 1v14c0 .552-.455 1-.992 1H2.992A.994.994 0 0 1 2 20V6zm12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM4 7v2h3V7H4zm0-5h6v2H4V2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.828 5l-2 2H4v12h16V7h-3.828l-2-2H9.828zM9 3h6l2 2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4l2-2zm3 15a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.586 21H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.586L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414L19.586 21zM7.556 8.97a6 6 0 0 0 8.475 8.475l-1.417-1.417a4 4 0 0 1-5.642-5.642L7.555 8.97zM22 17.785l-4.045-4.045a6 6 0 0 0-6.695-6.695L8.106 3.892 9 3h6l2 2h4a1 1 0 0 1 1 1v11.786zm-8.492-8.492a4.013 4.013 0 0 1 2.198 2.198l-2.198-2.198z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.586 21H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.586L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414L19.586 21zm-14-14H4v12h13.586l-2.18-2.18A5.5 5.5 0 0 1 7.68 9.094L5.586 7zm3.524 3.525a3.5 3.5 0 0 0 4.865 4.865L9.11 10.525zM22 17.785l-2-2V7h-3.828l-2-2H9.828l-.307.307-1.414-1.414L9 3h6l2 2h4a1 1 0 0 1 1 1v11.786zM11.263 7.05a5.5 5.5 0 0 1 6.188 6.188l-2.338-2.338a3.515 3.515 0 0 0-1.512-1.512l-2.338-2.338z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-switch-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.828 5l-2 2H4v12h16V7h-3.828l-2-2H9.828zM9 3h6l2 2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4l2-2zm.64 4.53a5.5 5.5 0 0 1 6.187 8.92L13.75 12.6h1.749l.001-.1a3.5 3.5 0 0 0-4.928-3.196L9.64 7.53zm4.677 9.96a5.5 5.5 0 0 1-6.18-8.905L10.25 12.5H8.5a3.5 3.5 0 0 0 4.886 3.215l.931 1.774z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "camera-switch-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 3h6l2 2h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4l2-2zm5.684 15.368l-.895-1.79A4 4 0 0 1 8 13h2.001L7.839 8.677a6 6 0 0 0 6.845 9.69zM9.316 7.632l.895 1.79A4 4 0 0 1 16 13h-2.001l2.161 4.323a6 6 0 0 0-6.845-9.69z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clapperboard-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.998 7l2.31-4h.7c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h3.006l-2.31 4h2.31l2.31-4h3.69l-2.31 4h2.31l2.31-4h3.69l-2.31 4h2.31z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "closed-captioning-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h18zM9 8c-2.208 0-4 1.792-4 4s1.792 4 4 4c1.1 0 2.1-.45 2.828-1.172l-1.414-1.414C10.053 13.776 9.553 14 9 14c-1.105 0-2-.895-2-2s.895-2 2-2c.55 0 1.048.22 1.415.587l1.414-1.414C11.105 8.448 10.105 8 9 8zm7 0c-2.208 0-4 1.792-4 4s1.792 4 4 4c1.104 0 2.104-.448 2.828-1.172l-1.414-1.414c-.362.362-.862.586-1.414.586-1.105 0-2-.895-2-2s.895-2 2-2c.553 0 1.053.224 1.415.587l1.414-1.414C18.105 8.448 17.105 8 16 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "clapperboard-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.998 7l2.31-4h3.69l-2.31 4h-3.69zm6 0l2.31-4h3.69l-2.31 4h-3.69zm6 0l2.31-4h.7c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h3.006L4 6.46V19h16V7h-2.002z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "disc-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 4.582V12a3 3 0 1 1-2-2.83V2.05c5.053.501 9 4.765 9 9.95 0 5.523-4.477 10-10 10S2 17.523 2 12c0-5.185 3.947-9.449 9-9.95v2.012A8.001 8.001 0 0 0 12 20a8 8 0 0 0 3-15.418z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "disc-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 9.17A3 3 0 1 0 15 12V2.458c4.057 1.274 7 5.064 7 9.542 0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2c.337 0 .671.017 1 .05v7.12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "closed-captioning-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M21 3c.552 0 1 .448 1 1v16c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h18zm-1 2H4v14h16V5zM9 8c1.105 0 2.105.448 2.829 1.173l-1.414 1.414C10.053 10.224 9.553 10 9 10c-1.105 0-2 .895-2 2s.895 2 2 2c.553 0 1.053-.224 1.414-.586l1.414 1.414C11.104 15.552 10.104 16 9 16c-2.208 0-4-1.792-4-4s1.792-4 4-4zm7 0c1.105 0 2.105.448 2.829 1.173l-1.414 1.414C17.053 10.224 16.553 10 16 10c-1.105 0-2 .895-2 2s.895 2 2 2c.552 0 1.052-.224 1.414-.586l1.414 1.414C18.104 15.552 17.104 16 16 16c-2.208 0-4-1.792-4-4s1.792-4 4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dvd-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-9h3l-5 7v-5H8l5-7v5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dv-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.608 3H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7v-2h6V5h-6.255A6.968 6.968 0 0 1 15 9a6.992 6.992 0 0 1-3 5.745V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6.255A7 7 0 1 1 11.608 3zM6 13.584V20h4v-6.416a5.001 5.001 0 1 0-4 0zM8 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9-3h2v2h-2V7zM7 17h2v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dv-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 14.745a7 7 0 1 1 8 0V21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6.255zM8 14A5 5 0 1 0 8 4a5 5 0 0 0 0 10zm-1 4v2h2v-2H7zm1-6a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6 5v-1.292A8.978 8.978 0 0 0 17 9a8.966 8.966 0 0 0-2.292-6H21a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7zm4-10v2h2V7h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "eject-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.737 13h8.526L12 6.606 7.737 13zm4.679-9.376l7.066 10.599a.5.5 0 0 1-.416.777H4.934a.5.5 0 0 1-.416-.777l7.066-10.599a.5.5 0 0 1 .832 0zM5 17h14a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "equalizer-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.17 18a3.001 3.001 0 0 1 5.66 0H22v2H11.83a3.001 3.001 0 0 1-5.66 0H2v-2h4.17zm6-7a3.001 3.001 0 0 1 5.66 0H22v2h-4.17a3.001 3.001 0 0 1-5.66 0H2v-2h10.17zm-6-7a3.001 3.001 0 0 1 5.66 0H22v2H11.83a3.001 3.001 0 0 1-5.66 0H2V4h4.17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "eject-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.416 3.624l7.066 10.599a.5.5 0 0 1-.416.777H4.934a.5.5 0 0 1-.416-.777l7.066-10.599a.5.5 0 0 1 .832 0zM5 17h14a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "dvd-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 11V6l-5 7h3v5l5-7h-3zm-1 11C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "equalizer-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6.17 18a3.001 3.001 0 0 1 5.66 0H22v2H11.83a3.001 3.001 0 0 1-5.66 0H2v-2h4.17zm6-7a3.001 3.001 0 0 1 5.66 0H22v2h-4.17a3.001 3.001 0 0 1-5.66 0H2v-2h10.17zm-6-7a3.001 3.001 0 0 1 5.66 0H22v2H11.83a3.001 3.001 0 0 1-5.66 0H2V4h4.17zM9 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "film-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM4 5v2h2V5H4zm14 0v2h2V5h-2zM4 9v2h2V9H4zm14 0v2h2V9h-2zM4 13v2h2v-2H4zm14 0v2h2v-2h-2zM4 17v2h2v-2H4zm14 0v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "film-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM8 5v14h8V5H8zM4 5v2h2V5H4zm14 0v2h2V5h-2zM4 9v2h2V9H4zm14 0v2h2V9h-2zM4 13v2h2v-2H4zm14 0v2h2v-2h-2zM4 17v2h2v-2H4zm14 0v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fullscreen-exit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fullscreen-exit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 7h4v2h-6V3h2v4zM8 9H2V7h4V3h2v6zm10 8v4h-2v-6h6v2h-4zM8 15v6H6v-4H2v-2h6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fullscreen-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 3h6v6h-2V5h-4V3zM2 3h6v2H4v4H2V3zm18 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "fullscreen-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 3h2v6h-2V5h-4V3h4zM4 3h4v2H4v4H2V3h2zm16 16v-4h2v6h-6v-2h4zM4 19h4v2H2v-6h2v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gallery-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17.409 19c-.776-2.399-2.277-3.885-4.266-5.602A10.954 10.954 0 0 1 20 11V3h1.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6V1h2v4H4v7c5.22 0 9.662 2.462 11.313 7h2.096zM18 1v4h-8V3h6V1h2zm-1.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gallery-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 13c-1.678 0-3.249.46-4.593 1.259A14.984 14.984 0 0 1 18.147 19H20v-6zm-3.996 6C14.044 14.302 9.408 11 4 11v8h12.004zM4 9c3.83 0 7.323 1.435 9.974 3.796A10.949 10.949 0 0 1 20 11V3h1.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6V1h2v4H4v4zm14-8v4h-8V3h6V1h2zm-1.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gallery-upload-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 1v2h8V1h2v2h3.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6V1h2zm4 7l-4 4h3v4h2v-4h3l-4-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "gallery-upload-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 1v4H4v14h16V3h1.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6V1h2zm4 7l4 4h-3v4h-2v-4H8l4-4zm6-7v4h-8V3h6V1h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hd-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.5 8.25V9H6v6h1.5v-2.25h2V15H11V9H9.5v2.25h-2zm7-.75H16a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-1.5v-3zM13 9v6h3a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hd-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.5 8.25h2V9H11v6H9.5v-2.25h-2V15H6V9h1.5v2.25zm7-.75v3H16a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-1.5zM13 9h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-3V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "headphone-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 12h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7C2 6.477 6.477 2 12 2s10 4.477 10 10v7a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h3a8 8 0 1 0-16 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "headphone-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 4a8 8 0 0 0-8 8h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7C2 6.477 6.477 2 12 2s10 4.477 10 10v7a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h3a8 8 0 0 0-8-8zM4 14v5h3v-5H4zm13 0v5h3v-5h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hq-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.5 8.25V9H6v6h1.5v-2.25h2V15H11V9H9.5v2.25h-2zM16.25 15H17a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h.75v1.5h1.5V15zm-1.75-4.5h2v3h-2v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hq-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.5 8.25h2V9H11v6H9.5v-2.25h-2V15H6V9h1.5v2.25zM16.25 15v1.5h-1.5V15H14a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-.75zm-1.75-4.5v3h2v-3h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 11.1l2-2 5.5 5.5 3.5-3.5 3 3V5H5v6.1zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm11.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 15v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2zm.008-12c.548 0 .992.445.992.993V13h-2V5H4v13.999L14 9l3 3v2.829l-3-3L6.827 19H14v2H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016zM8 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 15v3h3v2h-3v3h-2v-3h-3v-2h3v-3h2zm.008-12c.548 0 .992.445.992.993v9.349A5.99 5.99 0 0 0 20 13V5H4l.001 14 9.292-9.293a.999.999 0 0 1 1.32-.084l.093.085 3.546 3.55a6.003 6.003 0 0 0-3.91 7.743L2.992 21A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016zM8 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 11.1l2-2 5.5 5.5 3.5-3.5 3 3V5H5v6.1zm0 2.829V19h3.1l2.986-2.985L7 11.929l-2 2zM10.929 19H19v-2.071l-3-3L10.929 19zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm11.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 5H4v14l9.292-9.294a1 1 0 0 1 1.414 0L20 15.01V5zM2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-edit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v1.757l-2 2V5H5v8.1l4-4 4.328 4.329-1.327 1.327-.006 4.239 4.246.006 1.33-1.33L18.899 19H19v-2.758l2-2V20c0 .552-.448 1-1 1H4c-.552 0-1-.448-1-1V4c0-.552.448-1 1-1h16zm1.778 4.808l1.414 1.414L15.414 17l-1.416-.002.002-1.412 7.778-7.778zM15.5 7c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5S14 9.328 14 8.5 14.672 7 15.5 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-edit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M20 3c.552 0 1 .448 1 1v1.757l-2 2V5H5v8.1l4-4 4.328 4.329-1.415 1.413L9 11.93l-4 3.999V19h10.533l.708.001 1.329-1.33L18.9 19h.1v-2.758l2-2V20c0 .552-.448 1-1 1H4c-.55 0-1-.45-1-1V4c0-.552.448-1 1-1h16zm1.778 4.808l1.414 1.414L15.414 17l-1.416-.002.002-1.412 7.778-7.778zM15.5 7c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5S14 9.328 14 8.5 14.672 7 15.5 7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "image-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.828 21l-.02.02-.021-.02H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H4.828zM20 15V5H4v14L14 9l6 6zm0 2.828l-6-6L6.828 19H20v-1.172zM8 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "landscape-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 21l-4.762-8.73L15 6l8 15h-7zM8 10l6 11H2l6-11zM5.5 8a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "landscape-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11.27 12.216L15 6l8 15H2L9 8l2.27 4.216zm1.12 2.022L14.987 19h4.68l-4.77-8.942-2.507 4.18zM5.348 19h7.304L9 12.219 5.348 19zM5.5 8a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "live-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M16 4a1 1 0 0 1 1 1v4.2l5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h14zM7.4 8.829a.4.4 0 0 0-.392.32L7 9.228v5.542a.4.4 0 0 0 .542.374l.073-.036 4.355-2.772a.4.4 0 0 0 .063-.624l-.063-.05L7.615 8.89A.4.4 0 0 0 7.4 8.83z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "live-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M16 4a1 1 0 0 1 1 1v4.2l5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h14zm-1 2H3v12h12V6zM7.4 8.829a.4.4 0 0 1 .215.062l4.355 2.772a.4.4 0 0 1 0 .674L7.615 15.11A.4.4 0 0 1 7 14.77V9.23c0-.221.18-.4.4-.4zM21 8.84l-4 2.8v.718l4 2.8V8.84z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mic-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm0-2a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM3.055 11H5.07a7.002 7.002 0 0 0 13.858 0h2.016A9.004 9.004 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mic-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm0-2a5 5 0 0 1 5 5v6a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM2.192 13.962l1.962-.393a8.003 8.003 0 0 0 15.692 0l1.962.393C20.896 18.545 16.85 22 12 22s-8.896-3.455-9.808-8.038z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mic-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1a5 5 0 0 1 5 5v6a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM2.192 13.962l1.962-.393a8.003 8.003 0 0 0 15.692 0l1.962.393C20.896 18.545 16.85 22 12 22s-8.896-3.455-9.808-8.038z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mic-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.425 17.839A8.941 8.941 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11H5.07a7.002 7.002 0 0 0 9.87 5.354l-1.551-1.55A5 5 0 0 1 7 10V8.414L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414-4.767-4.768zm-7.392-7.392l2.52 2.52a3.002 3.002 0 0 1-2.52-2.52zm10.342 4.713l-1.443-1.442c.509-.81.856-1.73.997-2.718h2.016a8.95 8.95 0 0 1-1.57 4.16zm-2.91-2.909l-1.548-1.548c.054-.226.083-.46.083-.703V6a3 3 0 0 0-5.818-1.032L7.686 3.471A5 5 0 0 1 17 6v4a4.98 4.98 0 0 1-.534 2.251z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "movie-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 20h8v2h-8C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10a9.956 9.956 0 0 1-2 6h-2.708A8 8 0 1 0 12 20zm0-10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-4 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-4 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "movie-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.001 20H20v2h-8C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10a9.985 9.985 0 0 1-3.999 8zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-4 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-4 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mic-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.425 17.839A8.941 8.941 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11H5.07a7.002 7.002 0 0 0 9.87 5.354l-1.551-1.55A5 5 0 0 1 7 10V8.414L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414-4.767-4.768zm2.95-2.679l-1.443-1.442c.509-.81.856-1.73.997-2.718h2.016a8.95 8.95 0 0 1-1.57 4.16zm-2.91-2.909l-8.78-8.78A5 5 0 0 1 17 6l.001 4a4.98 4.98 0 0 1-.534 2.251z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mic-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 1a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM3.055 11H5.07a7.002 7.002 0 0 0 13.858 0h2.016A9.004 9.004 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "movie-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zm8.622 4.422a.4.4 0 0 0-.622.332v6.506a.4.4 0 0 0 .622.332l4.879-3.252a.4.4 0 0 0 0-.666l-4.88-3.252z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "movie-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM4 5v14h16V5H4zm6.622 3.415l4.879 3.252a.4.4 0 0 1 0 .666l-4.88 3.252a.4.4 0 0 1-.621-.332V8.747a.4.4 0 0 1 .622-.332z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "music-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13.535V3h8v2h-6v12a4 4 0 1 1-2-3.465zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "music-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 3v14a4 4 0 1 1-2-3.465V6H9v11a4 4 0 1 1-2-3.465V3h13z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "music-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 3v14a4 4 0 1 1-2-3.465V5H9v12a4 4 0 1 1-2-3.465V3h13zM5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 20H2v-2h1v-6.969C3 6.043 7.03 2 12 2s9 4.043 9 9.031V18h1v2zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "music-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13.535V3h8v3h-6v11a4 4 0 1 1-2-3.465z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 20H2v-2h1v-6.969C3 6.043 7.03 2 12 2s9 4.043 9 9.031V18h1v2zM5 18h14v-6.969C19 7.148 15.866 4 12 4s-7 3.148-7 7.031V18zm4.5 3h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 17h2v2H2v-2h2v-7a8 8 0 1 1 16 0v7zM9 21h6v2H9v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 17h2v2H2v-2h2v-7a8 8 0 1 1 16 0v7zm-2 0v-7a6 6 0 1 0-12 0v7h12zm-9 4h6v2H9v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mv-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zm10 8.178A3 3 0 1 0 14 15V7.999h3V6h-5v6.17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "mv-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993zM4 5v14h16V5H4zm8 7.17V6h5v2h-3v7a3 3 0 1 1-2-2.83z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 10a6 6 0 1 0-12 0v8h12v-8zm2 8.667l.4.533a.5.5 0 0 1-.4.8H4a.5.5 0 0 1-.4-.8l.4-.533V10a8 8 0 1 1 16 0v8.667zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 18.667l.4.533a.5.5 0 0 1-.4.8H4a.5.5 0 0 1-.4-.8l.4-.533V10a8 8 0 1 1 16 0v8.667zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 2c4.97 0 9 4.043 9 9.031V20H3v-8.969C3 6.043 7.03 2 12 2zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 18h14v-6.969C19 7.148 15.866 4 12 4s-7 3.148-7 7.031V18zm7-16c4.97 0 9 4.043 9 9.031V20H3v-8.969C3 6.043 7.03 2 12 2zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-off-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.586 20H4a.5.5 0 0 1-.4-.8l.4-.533V10c0-1.33.324-2.584.899-3.687L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414L18.586 20zM20 15.786L7.559 3.345A8 8 0 0 1 20 10v5.786zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pause-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM9 9v6h2V9H9zm4 0v6h2V9h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "order-play-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 4V2.068a.5.5 0 0 1 .82-.385l4.12 3.433a.5.5 0 0 1-.321.884H2V4h15zM2 18h20v2H2v-2zm0-7h20v2H2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "notification-off-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.586 20H4a.5.5 0 0 1-.4-.8l.4-.533V10c0-1.33.324-2.584.899-3.687L1.393 2.808l1.415-1.415 19.799 19.8-1.415 1.414L18.586 20zM6.408 7.822A5.985 5.985 0 0 0 6 10v8h10.586L6.408 7.822zM20 15.786l-2-2V10a6 6 0 0 0-8.99-5.203L7.56 3.345A8 8 0 0 1 20 10v5.786zM9.5 21h5a2.5 2.5 0 1 1-5 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pause-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9 9h2v6H9V9zm4 0h2v6h-2V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pause-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 5h2v14H6V5zm10 0h2v14h-2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pause-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 5h2v14H6V5zm10 0h2v14h-2V5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "order-play-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 4V2.068a.5.5 0 0 1 .82-.385l4.12 3.433a.5.5 0 0 1-.321.884H2V4h15zM2 18h20v2H2v-2zm0-7h20v2H2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pause-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 7a1 1 0 0 1 2 0v10a1 1 0 1 1-2 0V7zM7 7a1 1 0 1 1 2 0v10a1 1 0 1 1-2 0V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "pause-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M15 7a1 1 0 0 1 2 0v10a1 1 0 1 1-2 0V7zM7 7a1 1 0 1 1 2 0v10a1 1 0 1 1-2 0V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-camera-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.803 4a5.96 5.96 0 0 0-.72 2H3v12h18v-5.083a5.96 5.96 0 0 0 2-.72V19c0 .553-.44 1.001-1.002 1.001H2.002A1 1 0 0 1 1 19V5c0-.552.44-1 1.002-1h12.8zM20 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm-2 2h2v3h-2v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "phone-camera-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M14.803 4A6 6 0 0 0 23 12.197V19c0 .553-.44 1.001-1.002 1.001H2.002A1 1 0 0 1 1 19V5c0-.552.44-1 1.002-1h12.8zM20 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-1 6v3h2v-3h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "picture-in-picture-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zM6.707 6.293l2.25 2.25L11 6.5V12H5.5l2.043-2.043-2.25-2.25 1.414-1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "picture-in-picture-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zm-1 2h-6v4h6v-4zM6.707 6.293l2.25 2.25L11 6.5V12H5.5l2.043-2.043-2.25-2.25 1.414-1.414z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "picture-in-picture-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zm-1 2h-6v4h6v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "picture-in-picture-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM10.622 8.415l4.879 3.252a.4.4 0 0 1 0 .666l-4.88 3.252a.4.4 0 0 1-.621-.332V8.747a.4.4 0 0 1 .622-.332z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM10.622 8.415a.4.4 0 0 0-.622.332v6.506a.4.4 0 0 0 .622.332l4.879-3.252a.4.4 0 0 0 0-.666l-4.88-3.252z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.376 12.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16.394 12L10 7.737v8.526L16.394 12zm2.982.416L8.777 19.482A.5.5 0 0 1 8 19.066V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-list-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M22 18v2H2v-2h20zM2 3.5l8 5-8 5v-10zM22 11v2H12v-2h10zM4 7.108v2.784L6.226 8.5 4 7.108zM22 4v2H12V4h10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-list-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M22 18v2H2v-2h20zM2 3.5l8 5-8 5v-10zM22 11v2H12v-2h10zm0-7v2H12V4h10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "picture-in-picture-exit-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zm-9.5-6L9.457 9.043l2.25 2.25-1.414 1.414-2.25-2.25L6 12.5V7h5.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-list-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 18h10v2H2v-2zm0-7h20v2H2v-2zm0-7h20v2H2V4zm16 14v-3h2v3h3v2h-3v3h-2v-3h-3v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "picture-in-picture-exit-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zm-1 2h-6v4h6v-4zm-8.5-8L9.457 9.043l2.25 2.25-1.414 1.414-2.25-2.25L6 12.5V7h5.5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-list-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 18h10v2H2v-2zm0-7h20v2H2v-2zm0-7h20v2H2V4zm16 14v-3h2v3h3v2h-3v3h-2v-3h-3v-2h3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-list-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 18h10v2H2v-2zm0-7h14v2H2v-2zm0-7h20v2H2V4zm17 11.17V9h5v2h-3v7a3 3 0 1 1-2-2.83zM18 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-list-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 18h10v2H2v-2zm0-7h14v2H2v-2zm0-7h20v2H2V4zm17 11.17V9h5v2h-3v7a3 3 0 1 1-2-2.83z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.752 5.439l10.508 6.13a.5.5 0 0 1 0 .863l-10.508 6.13A.5.5 0 0 1 7 18.128V5.871a.5.5 0 0 1 .752-.432z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "polaroid-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20.659 10a6 6 0 1 0 0 4H21v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6h-.341zM5 6v3h2V6H5zm10 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "polaroid-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 6h-2V5H5v14h14v-1h2v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2zM6 6h2v3H6V6zm9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-4a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "polaroid-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 20.007V3.993zM6 17v2h12v-2H6zM5 5v2h2V5H5zm7 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "radio-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 3V1h2v2h13.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6zM4 5v14h16V5H4zm5 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm5-6h4v2h-4V9zm0 4h4v2h-4v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "play-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M9 8.482v7.036L15.03 12 9 8.482zM7.752 5.44l10.508 6.13a.5.5 0 0 1 0 .863l-10.508 6.13A.5.5 0 0 1 7 18.128V5.871a.5.5 0 0 1 .752-.432z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "radio-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 3V1h2v2h13.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6zm3 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm5-6v2h4V9h-4zm0 4v2h4v-2h-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "polaroid-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 15V5H5v10h14zM3 3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 20.007V3.993zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM6 6h2v2H6V6zm0 11v2h12v-2H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "radio-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 10h3V6H4v4h11V8h2v2zM6 3V1h2v2h13.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6zm1 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "radio-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 10V8h-2v2H5V6h14v4h-2zM6 3V1h2v2h13.008c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3H6zM4 5v14h16V5H4zm4 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "record-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "repeat-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 20v1.932a.5.5 0 0 1-.82.385l-4.12-3.433A.5.5 0 0 1 3.382 18H18a2 2 0 0 0 2-2V8h2v8a4 4 0 0 1-4 4H8zm8-16V2.068a.5.5 0 0 1 .82-.385l4.12 3.433a.5.5 0 0 1-.321.884H6a2 2 0 0 0-2 2v8H2V8a4 4 0 0 1 4-4h10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "record-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-5a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "repeat-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 20v1.932a.5.5 0 0 1-.82.385l-4.12-3.433A.5.5 0 0 1 3.382 18H18a2 2 0 0 0 2-2V8h2v8a4 4 0 0 1-4 4H8zm8-16V2.068a.5.5 0 0 1 .82-.385l4.12 3.433a.5.5 0 0 1-.321.884H6a2 2 0 0 0-2 2v8H2V8a4 4 0 0 1 4-4h10z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "repeat-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 4h15a1 1 0 0 1 1 1v7h-2V6H6v3L1 5l5-4v3zm12 16H3a1 1 0 0 1-1-1v-7h2v6h14v-3l5 4-5 4v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "repeat-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 4h15a1 1 0 0 1 1 1v7h-2V6H6v3L1 5l5-4v3zm12 16H3a1 1 0 0 1-1-1v-7h2v6h14v-3l5 4-5 4v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "repeat-one-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 20v1.932a.5.5 0 0 1-.82.385l-4.12-3.433A.5.5 0 0 1 3.382 18H18a2 2 0 0 0 2-2V8h2v8a4 4 0 0 1-4 4H8zm8-16V2.068a.5.5 0 0 1 .82-.385l4.12 3.433a.5.5 0 0 1-.321.884H6a2 2 0 0 0-2 2v8H2V8a4 4 0 0 1 4-4h10zm-5 4h2v8h-2v-6H9V9l2-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rewind-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 10.667l9.223-6.149a.5.5 0 0 1 .777.416v14.132a.5.5 0 0 1-.777.416L12 13.333v5.733a.5.5 0 0 1-.777.416L.624 12.416a.5.5 0 0 1 0-.832l10.599-7.066a.5.5 0 0 1 .777.416v5.733z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rewind-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 10.667l9.223-6.149a.5.5 0 0 1 .777.416v14.132a.5.5 0 0 1-.777.416L12 13.333v5.733a.5.5 0 0 1-.777.416L.624 12.416a.5.5 0 0 1 0-.832l10.599-7.066a.5.5 0 0 1 .777.416v5.733zm-2 5.596V7.737L3.606 12 10 16.263zm10 0V7.737L13.606 12 20 16.263z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "repeat-one-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 20v1.932a.5.5 0 0 1-.82.385l-4.12-3.433A.5.5 0 0 1 3.382 18H18a2 2 0 0 0 2-2V8h2v8a4 4 0 0 1-4 4H8zm8-17.932a.5.5 0 0 1 .82-.385l4.12 3.433a.5.5 0 0 1-.321.884H6a2 2 0 0 0-2 2v8H2V8a4 4 0 0 1 4-4h10V2.068zM11 8h2v8h-2v-6H9V9l2-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rewind-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 17.035a.5.5 0 0 1-.788.409l-7.133-5.036a.5.5 0 0 1 0-.816l7.133-5.036a.5.5 0 0 1 .788.409v10.07zm1.079-4.627a.5.5 0 0 1 0-.816l7.133-5.036a.5.5 0 0 1 .788.409v10.07a.5.5 0 0 1-.788.409l-7.133-5.036z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shuffle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 17.883V16l5 3-5 3v-2.09a9 9 0 0 1-6.997-5.365L11 14.54l-.003.006A9 9 0 0 1 2.725 20H2v-2h.725a7 7 0 0 0 6.434-4.243L9.912 12l-.753-1.757A7 7 0 0 0 2.725 6H2V4h.725a9 9 0 0 1 8.272 5.455L11 9.46l.003-.006A9 9 0 0 1 18 4.09V2l5 3-5 3V6.117a7 7 0 0 0-5.159 4.126L12.088 12l.753 1.757A7 7 0 0 0 18 17.883z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rewind-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 9.86L5.968 12 9 14.14V9.86zm1.908 7.463a.5.5 0 0 1-.696.12l-7.133-5.035a.5.5 0 0 1 0-.816l7.133-5.036a.5.5 0 0 1 .788.409v10.07a.5.5 0 0 1-.092.288zM18 14.14V9.86L14.968 12 18 14.14zm-5.921-1.732a.5.5 0 0 1 0-.816l7.133-5.036a.5.5 0 0 1 .788.409v10.07a.5.5 0 0 1-.788.409l-7.133-5.036z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-back-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 11.333l10.223-6.815a.5.5 0 0 1 .777.416v14.132a.5.5 0 0 1-.777.416L8 12.667V19a1 1 0 0 1-2 0V5a1 1 0 1 1 2 0v6.333z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rhythm-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 9h2v12H2V9zm6-6h2v18H8V3zm6 9h2v9h-2v-9zm6-6h2v15h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "rhythm-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 9h2v12H2V9zm6-6h2v18H8V3zm6 9h2v9h-2v-9zm6-6h2v15h-2V6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-back-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 11.333l10.223-6.815a.5.5 0 0 1 .777.416v14.132a.5.5 0 0 1-.777.416L8 12.667V19a1 1 0 0 1-2 0V5a1 1 0 1 1 2 0v6.333zm9 4.93V7.737L10.606 12 17 16.263z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "shuffle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18 17.883V16l5 3-5 3v-2.09a9 9 0 0 1-6.997-5.365L11 14.54l-.003.006A9 9 0 0 1 2.725 20H2v-2h.725a7 7 0 0 0 6.434-4.243L9.912 12l-.753-1.757A7 7 0 0 0 2.725 6H2V4h.725a9 9 0 0 1 8.272 5.455L11 9.46l.003-.006A9 9 0 0 1 18 4.09V2l5 3-5 3V6.117a7 7 0 0 0-5.159 4.126L12.088 12l.753 1.757A7 7 0 0 0 18 17.883z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-back-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 6a1 1 0 0 1 1 1v10a1 1 0 0 1-2 0V7a1 1 0 0 1 1-1zm2.079 6.408a.5.5 0 0 1 0-.816l7.133-5.036a.5.5 0 0 1 .788.409v10.07a.5.5 0 0 1-.788.409l-7.133-5.036z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-forward-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 12.667L5.777 19.482A.5.5 0 0 1 5 19.066V4.934a.5.5 0 0 1 .777-.416L16 11.333V5a1 1 0 0 1 2 0v14a1 1 0 0 1-2 0v-6.333z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-back-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 6a1 1 0 0 1 1 1v10a1 1 0 0 1-2 0V7a1 1 0 0 1 1-1zm8 8.14V9.86L11.968 12 15 14.14zm-5.921-1.732a.5.5 0 0 1 0-.816l7.133-5.036a.5.5 0 0 1 .788.409v10.07a.5.5 0 0 1-.788.409l-7.133-5.036z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-forward-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.032 12L9 9.86v4.28L12.032 12zM7.5 17.535a.5.5 0 0 1-.5-.5V6.965a.5.5 0 0 1 .788-.409l7.133 5.036a.5.5 0 0 1 0 .816l-7.133 5.036a.5.5 0 0 1-.288.091zM16 7a1 1 0 0 1 2 0v10a1 1 0 1 1-2 0V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sound-module-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 18v3h-2v-3h-2v-3h6v3h-2zM5 18v3H3v-3H1v-3h6v3H5zm6-12V3h2v3h2v3H9V6h2zm0 5h2v10h-2V11zm-8 2V3h2v10H3zm16 0V3h2v10h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-forward-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7.788 17.444A.5.5 0 0 1 7 17.035V6.965a.5.5 0 0 1 .788-.409l7.133 5.036a.5.5 0 0 1 0 .816l-7.133 5.036zM16 7a1 1 0 0 1 2 0v10a1 1 0 1 1-2 0V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "sound-module-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 18v3h-2v-3h-2v-2h6v2h-2zM5 18v3H3v-3H1v-2h6v2H5zm6-12V3h2v3h2v2H9V6h2zm0 4h2v11h-2V10zm-8 4V3h2v11H3zm16 0V3h2v11h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speaker-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0 2a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speaker-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0 2a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm12 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM6 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm6-5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speaker-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V5H5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm0-4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "skip-forward-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M16 12.667L5.777 19.482A.5.5 0 0 1 5 19.066V4.934a.5.5 0 0 1 .777-.416L16 11.333V5a1 1 0 0 1 2 0v14a1 1 0 0 1-2 0v-6.333zm-9-4.93v8.526L13.394 12 7 7.737z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speaker-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 18a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speaker-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 4v16h14V4H5zM4 2h16a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0 2a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speed-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13.333l-9.223 6.149A.5.5 0 0 1 2 19.066V4.934a.5.5 0 0 1 .777-.416L12 10.667V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832l-10.599 7.066a.5.5 0 0 1-.777-.416v-5.733z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speed-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 13.333l-9.223 6.149A.5.5 0 0 1 2 19.066V4.934a.5.5 0 0 1 .777-.416L12 10.667V4.934a.5.5 0 0 1 .777-.416l10.599 7.066a.5.5 0 0 1 0 .832l-10.599 7.066a.5.5 0 0 1-.777-.416v-5.733zM10.394 12L4 7.737v8.526L10.394 12zM14 7.737v8.526L20.394 12 14 7.737z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speed-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4.788 17.444A.5.5 0 0 1 4 17.035V6.965a.5.5 0 0 1 .788-.409l7.133 5.036a.5.5 0 0 1 0 .816l-7.133 5.036zM13 6.965a.5.5 0 0 1 .788-.409l7.133 5.036a.5.5 0 0 1 0 .816l-7.133 5.036a.5.5 0 0 1-.788-.409V6.965z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speed-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9.032 12L6 9.86v4.28L9.032 12zm-4.244 5.444A.5.5 0 0 1 4 17.035V6.965a.5.5 0 0 1 .788-.409l7.133 5.036a.5.5 0 0 1 0 .816l-7.133 5.036zM15 14.14L18.032 12 15 9.86v4.28zm-2-7.175a.5.5 0 0 1 .788-.409l7.133 5.036a.5.5 0 0 1 0 .816l-7.133 5.036a.5.5 0 0 1-.788-.409V6.965z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stop-circle-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9 9h6v6H9V9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "speaker-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 5v14h14V5H5zM4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM7 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5-3a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stop-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stop-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M7 7v10h10V7H7zM6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stop-mini-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 7v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stop-mini-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8 8v8h8V8H8zM6 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "stop-circle-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM9 9v6h6V9H9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "surround-sound-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.05 4.121A6.978 6.978 0 0 0 5 12.071c0 1.933.784 3.683 2.05 4.95l1.414-1.414A4.984 4.984 0 0 1 7 12.07c0-1.38.56-2.63 1.464-3.535L7.05 7.12zm9.9 0l-1.414 1.415A4.984 4.984 0 0 1 17 12.07c0 1.38-.56 2.63-1.464 3.536l1.414 1.414A6.978 6.978 0 0 0 19 12.07a6.978 6.978 0 0 0-2.05-4.95zM12 15.071a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0-2a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-add-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 4c.552 0 1 .448 1 1v4.2l5.213-3.65c.226-.158.538-.103.697.124.058.084.09.184.09.286v12.08c0 .276-.224.5-.5.5-.103 0-.203-.032-.287-.09L17 14.8V19c0 .552-.448 1-1 1H2c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h14zM8 8v3H5v2h2.999L8 16h2l-.001-3H13v-2h-3V8H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tape-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.83 13A3 3 0 1 0 8 15h8a3 3 0 1 0-2.83-2h-2.34zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm13 10a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-add-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 4c.552 0 1 .448 1 1v4.2l5.213-3.65c.226-.158.538-.103.697.124.058.084.09.184.09.286v12.08c0 .276-.224.5-.5.5-.103 0-.203-.032-.287-.09L17 14.8V19c0 .552-.448 1-1 1H2c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h14zm-1 2H3v12h12V6zM8 8h2v3h3v2H9.999L10 16H8l-.001-3H5v-2h3V8zm13 .841l-4 2.8v.718l4 2.8V8.84z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-download-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 4c.552 0 1 .448 1 1v4.2l5.213-3.65c.226-.158.538-.103.697.124.058.084.09.184.09.286v12.08c0 .276-.224.5-.5.5-.103 0-.203-.032-.287-.09L17 14.8V19c0 .552-.448 1-1 1H2c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h14zm-6 4H8v4H5l4 4 4-4h-3V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-download-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 4c.552 0 1 .448 1 1v4.2l5.213-3.65c.226-.158.538-.103.697.124.058.084.09.184.09.286v12.08c0 .276-.224.5-.5.5-.103 0-.203-.032-.287-.09L17 14.8V19c0 .552-.448 1-1 1H2c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h14zm-1 2H3v12h12V6zm-5 2v4h3l-4 4-4-4h3V8h2zm11 .841l-4 2.8v.718l4 2.8V8.84z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "tape-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10.83 13h2.34A3 3 0 1 1 16 15H8a3 3 0 1 1 2.83-2zM4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm5 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "surround-sound-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M4 5v14h16V5H4zM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm4.05 4.121l1.414 1.415A4.984 4.984 0 0 0 7 12.07c0 1.38.56 2.63 1.464 3.536L7.05 17.02A6.978 6.978 0 0 1 5 12.07c0-1.933.784-3.683 2.05-4.95zm9.9 0a6.978 6.978 0 0 1 2.05 4.95 6.978 6.978 0 0 1-2.05 4.95l-1.414-1.414A4.984 4.984 0 0 0 17 12.07c0-1.38-.56-2.63-1.464-3.535L16.95 7.12zM12 13.071a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-upload-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 4c.552 0 1 .448 1 1v4.2l5.213-3.65c.226-.158.538-.103.697.124.058.084.09.184.09.286v12.08c0 .276-.224.5-.5.5-.103 0-.203-.032-.287-.09L17 14.8V19c0 .552-.448 1-1 1H2c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h14zM9 8l-4 4h3v4h2v-4h3L9 8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 20.007V3.993zm7.622 4.422a.4.4 0 0 0-.622.332v6.506a.4.4 0 0 0 .622.332l4.879-3.252a.4.4 0 0 0 0-.666l-4.88-3.252z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 3.993C3 3.445 3.445 3 3.993 3h16.014c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 20.007V3.993zM5 5v14h14V5H5zm5.622 3.415l4.879 3.252a.4.4 0 0 1 0 .666l-4.88 3.252a.4.4 0 0 1-.621-.332V8.747a.4.4 0 0 1 .622-.332z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "video-upload-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0H24V24H0z"/>\n        <path d="M16 4c.552 0 1 .448 1 1v4.2l5.213-3.65c.226-.158.538-.103.697.124.058.084.09.184.09.286v12.08c0 .276-.224.5-.5.5-.103 0-.203-.032-.287-.09L17 14.8V19c0 .552-.448 1-1 1H2c-.552 0-1-.448-1-1V5c0-.552.448-1 1-1h14zm-1 2H3v12h12V6zM9 8l4 4h-3v4H8v-4H5l4-4zm12 .841l-4 2.8v.718l4 2.8V8.84z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vidicon-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 6V4H5V2h10v4h1a1 1 0 0 1 1 1v2.2l5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h11zm-8 4v2h2v-2H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vidicon-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 9.2l5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4.2zM5 8v2h2V8H5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vidicon-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 6V4H5V2h10v4h1a1 1 0 0 1 1 1v2.2l5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h11zm2 2H3v10h12V8zm2 4.359l4 2.8V8.84l-4 2.8v.718zM5 10h2v2H5v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "vidicon-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 9.2l5.213-3.65a.5.5 0 0 1 .787.41v12.08a.5.5 0 0 1-.787.41L17 14.8V19a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4.2zm0 3.159l4 2.8V8.84l-4 2.8v.718zM3 6v12h12V6H3zm2 2h2v2H5V8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "voiceprint-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 7h2v10H5V7zm-4 3h2v4H1v-4zm8-8h2v18H9V2zm4 2h2v18h-2V4zm4 3h2v10h-2V7zm4 3h2v4h-2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "voiceprint-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5 7h2v10H5V7zm-4 3h2v4H1v-4zm8-8h2v18H9V2zm4 2h2v18h-2V4zm4 3h2v10h-2V7zm4 3h2v4h-2v-4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-mute-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.889 16H2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .817.387v15.89a.5.5 0 0 1-.817.387L5.89 16zm14.525-4l3.536 3.536-1.414 1.414L19 13.414l-3.536 3.536-1.414-1.414L17.586 12 14.05 8.464l1.414-1.414L19 10.586l3.536-3.536 1.414 1.414L20.414 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-mute-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 7.22L6.603 10H3v4h3.603L10 16.78V7.22zM5.889 16H2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .817.387v15.89a.5.5 0 0 1-.817.387L5.89 16zm14.525-4l3.536 3.536-1.414 1.414L19 13.414l-3.536 3.536-1.414-1.414L17.586 12 14.05 8.464l1.414-1.414L19 10.586l3.536-3.536 1.414 1.414L20.414 12z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-off-vibrate-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.39 3.161l1.413 1.414-2.475 2.475 2.475 2.475L18.328 12l2.475 2.476-2.475 2.475 2.475 2.475-1.414 1.414-3.889-3.89 2.475-2.474L15.5 12l2.475-2.475L15.5 7.05l3.89-3.889zM13 19.945a.5.5 0 0 1-.817.387L6.89 15.999 3 16a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1l2.584-.002-3.776-3.776 1.414-1.414L13 12.586v7.359zm-.113-16.206a.5.5 0 0 1 .113.316v5.702L9.282 6.04l2.901-2.372a.5.5 0 0 1 .704.07z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-down-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M8.889 16H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .817.387v15.89a.5.5 0 0 1-.817.387L8.89 16zm9.974.591l-1.422-1.422A3.993 3.993 0 0 0 19 12c0-1.43-.75-2.685-1.88-3.392l1.439-1.439A5.991 5.991 0 0 1 21 12c0 1.842-.83 3.49-2.137 4.591z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-up-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M5.889 16H2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .817.387v15.89a.5.5 0 0 1-.817.387L5.89 16zm13.517 4.134l-1.416-1.416A8.978 8.978 0 0 0 21 12a8.982 8.982 0 0 0-3.304-6.968l1.42-1.42A10.976 10.976 0 0 1 23 12c0 3.223-1.386 6.122-3.594 8.134zm-3.543-3.543l-1.422-1.422A3.993 3.993 0 0 0 16 12c0-1.43-.75-2.685-1.88-3.392l1.439-1.439A5.991 5.991 0 0 1 18 12c0 1.842-.83 3.49-2.137 4.591z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-off-vibrate-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.39 3.161l1.413 1.414-2.475 2.475 2.475 2.475L18.328 12l2.475 2.476-2.475 2.475 2.475 2.475-1.414 1.414-3.889-3.89 2.475-2.474L15.5 12l2.475-2.475L15.5 7.05l3.89-3.889zM13 19.945a.5.5 0 0 1-.817.387L6.89 15.999 3 16a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1l2.584-.002-3.776-3.776 1.414-1.414L13 12.586v7.359zM7.584 9.998L4 10V14l3.603-.001L11 16.779v-3.365L7.584 9.998zm5.303-6.26a.5.5 0 0 1 .113.317v5.702l-2-2V7.22l-.296.241-1.421-1.42 2.9-2.373a.5.5 0 0 1 .704.07z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-up-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 7.22L6.603 10H3v4h3.603L10 16.78V7.22zM5.889 16H2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .817.387v15.89a.5.5 0 0 1-.817.387L5.89 16zm13.517 4.134l-1.416-1.416A8.978 8.978 0 0 0 21 12a8.982 8.982 0 0 0-3.304-6.968l1.42-1.42A10.976 10.976 0 0 1 23 12c0 3.223-1.386 6.122-3.594 8.134zm-3.543-3.543l-1.422-1.422A3.993 3.993 0 0 0 16 12c0-1.43-.75-2.685-1.88-3.392l1.439-1.439A5.991 5.991 0 0 1 18 12c0 1.842-.83 3.49-2.137 4.591z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-vibrate-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.39 3.161l1.413 1.414-2.475 2.475 2.475 2.475L18.328 12l2.475 2.476-2.475 2.475 2.475 2.475-1.414 1.414-3.889-3.89 2.475-2.474L15.5 12l2.475-2.475L15.5 7.05l3.89-3.889zm-6.503.578a.5.5 0 0 1 .113.316v15.89a.5.5 0 0 1-.817.387L6.89 15.999 3 16a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .704.07z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-vibrate-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19.39 3.161l1.413 1.414-2.475 2.475 2.475 2.475L18.328 12l2.475 2.476-2.475 2.475 2.475 2.475-1.414 1.414-3.889-3.89 2.475-2.474L15.5 12l2.475-2.475L15.5 7.05l3.89-3.889zm-6.503.578a.5.5 0 0 1 .113.316v15.89a.5.5 0 0 1-.817.387L6.89 15.999 3 16a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .704.07zM11 7.22L7.603 9.999H4V14l3.603-.001L11 16.779V7.22z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "webcam-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 21v-1.07A7.002 7.002 0 0 1 5 13V8a7 7 0 1 1 14 0v5a7.002 7.002 0 0 1-6 6.93V21h4v2H7v-2h4zm1-18a5 5 0 0 0-5 5v5a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 2a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "volume-down-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 7.22L9.603 10H6v4h3.603L13 16.78V7.22zM8.889 16H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332a.5.5 0 0 1 .817.387v15.89a.5.5 0 0 1-.817.387L8.89 16zm9.974.591l-1.422-1.422A3.993 3.993 0 0 0 19 12c0-1.43-.75-2.685-1.88-3.392l1.439-1.439A5.991 5.991 0 0 1 21 12c0 1.842-.83 3.49-2.137 4.591z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "webcam-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M11 21v-1.07A7.002 7.002 0 0 1 5 13V8a7 7 0 1 1 14 0v5a7.002 7.002 0 0 1-6 6.93V21h4v2H7v-2h4zm1-12a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
        {
            name: "buildings",
            iconsvg: [
                {
                    name: "ancient-gate-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M18.901 10a2.999 2.999 0 0 0 4.075 1.113 3.5 3.5 0 0 1-1.975 3.55L21 21h-6v-2a3 3 0 0 0-5.995-.176L9 19v2H3v-6.336a3.5 3.5 0 0 1-1.979-3.553A2.999 2.999 0 0 0 5.098 10h13.803zm-1.865-7a3.5 3.5 0 0 0 4.446 2.86 3.5 3.5 0 0 1-3.29 3.135L18 9H6a3.5 3.5 0 0 1-3.482-3.14A3.5 3.5 0 0 0 6.964 3h10.072z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ancient-pavilion-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12.513 2.001a9.004 9.004 0 0 0 9.97 5.877A4.501 4.501 0 0 1 19 11.888V19l2 .001v2H3v-2h2v-7.113a4.503 4.503 0 0 1-3.484-4.01 9.004 9.004 0 0 0 9.972-5.876h1.025zM17 12H7V19h10v-7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bank-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 20h20v2H2v-2zm2-8h2v7H4v-7zm5 0h2v7H9v-7zm4 0h2v7h-2v-7zm5 0h2v7h-2v-7zM2 7l10-5 10 5v4H2V7zm10 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ancient-pavilion-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M12.513 2.001a9.004 9.004 0 0 0 9.97 5.877A4.501 4.501 0 0 1 19 11.888V19l2 .001v2H3v-2h2v-7.113a4.503 4.503 0 0 1-3.484-4.01 9.004 9.004 0 0 0 9.972-5.876h1.025zM17 12H7V19h10v-7zm-5-6.673l-.11.155A11.012 11.012 0 0 1 5.4 9.736l-.358.073.673.19h12.573l.668-.19-.011-.002a11.01 11.01 0 0 1-6.836-4.326L12 5.326z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "ancient-gate-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M18.901 10a2.999 2.999 0 0 0 4.075 1.113 3.5 3.5 0 0 1-1.975 3.55L21 21h-7v-2a2 2 0 0 0-1.85-1.995L12 17a2 2 0 0 0-1.995 1.85L10 19v2H3v-6.336a3.5 3.5 0 0 1-1.979-3.553A2.999 2.999 0 0 0 5.098 10h13.803zm-.971 2H6.069l-.076.079c-.431.42-.935.76-1.486 1.002l-.096.039.589.28-.001 5.6 3.002-.001v-.072l.01-.223c.149-2.016 1.78-3.599 3.854-3.698l.208-.005.223.01a4 4 0 0 1 3.699 3.787l.004.201L19 19l.001-5.6.587-.28-.095-.04a5.002 5.002 0 0 1-1.486-1.001L17.93 12zm-.894-9a3.5 3.5 0 0 0 4.446 2.86 3.5 3.5 0 0 1-3.29 3.135L18 9H6a3.5 3.5 0 0 1-3.482-3.14A3.5 3.5 0 0 0 6.964 3h10.072zM15.6 5H8.399a5.507 5.507 0 0 1-1.49 1.816L6.661 7h10.677l-.012-.008a5.518 5.518 0 0 1-1.579-1.722L15.6 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "bank-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 20h20v2H2v-2zm2-8h2v7H4v-7zm5 0h2v7H9v-7zm4 0h2v7h-2v-7zm5 0h2v7h-2v-7zM2 7l10-5 10 5v4H2V7zm2 1.236V9h16v-.764l-8-4-8 4zM12 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M12 19h2V6l6.394 2.74a1 1 0 0 1 .606.92V19h2v2H1v-2h2V5.65a1 1 0 0 1 .594-.914l7.703-3.424A.5.5 0 0 1 12 1.77V19z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M3 19V5.7a1 1 0 0 1 .658-.94l9.671-3.516a.5.5 0 0 1 .671.47v4.953l6.316 2.105a1 1 0 0 1 .684.949V19h2v2H1v-2h2zm2 0h7V3.855L5 6.401V19zm14 0v-8.558l-5-1.667V19h5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 10.111V1l11 6v14H3V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 19h2v2H1v-2h2V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15h2V9h3a1 1 0 0 1 1 1v9zM7 11v2h4v-2H7zm0-4v2h4V7H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20h2v2H1v-2h2V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v17zm-2 0V4H5v16h14zM8 11h3v2H8v-2zm0-4h3v2H8V7zm0 8h3v2H8v-2zm5 0h3v2h-3v-2zm0-4h3v2h-3v-2zm0-4h3v2h-3V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20h2v2H1v-2h2V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v17zM8 11v2h3v-2H8zm0-4v2h3V7H8zm0 8v2h3v-2H8zm5 0v2h3v-2h-3zm0-4v2h3v-2h-3zm0-4v2h3V7h-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M10 10.111V1l11 6v14H3V7l7 3.111zm2-5.742v8.82l-7-3.111V19h14V8.187L12 4.37z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "building-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 19h2v2H1v-2h2V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15h4v-8h-2V9h3a1 1 0 0 1 1 1v9zM5 5v14h8V5H5zm2 6h4v2H7v-2zm0-4h4v2H7V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "community-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 21H3a1 1 0 0 1-1-1v-7.513a1 1 0 0 1 .343-.754L6 8.544V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1zM9 19h3v-6.058L8 9.454l-4 3.488V19h3v-4h2v4zm5 0h6V5H8v2.127c.234 0 .469.082.657.247l5 4.359a1 1 0 0 1 .343.754V19zm2-8h2v2h-2v-2zm0 4h2v2h-2v-2zm0-8h2v2h-2V7zm-4 0h2v2h-2V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "community-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M9 19h3v-6.058L8 9.454l-4 3.488V19h3v-4h2v4zm12 2H3a1 1 0 0 1-1-1v-7.513a1 1 0 0 1 .343-.754L6 8.544V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1zm-5-10v2h2v-2h-2zm0 4v2h2v-2h-2zm0-8v2h2V7h-2zm-4 0v2h2V7h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "government-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M2 19V8H1V6h3V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2h3v2h-1v11h1v2H1v-2h1zm11 0v-7h-2v7h2zm-5 0v-7H6v7h2zm10 0v-7h-2v7h2zM6 5v1h12V5H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "government-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 6h3v2h-1v11h1v2H1v-2h1V8H1V6h3V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2zm0 2H4v11h3v-7h2v7h2v-7h2v7h2v-7h2v7h3V8zM6 5v1h12V5H6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM6 19h12V9.157l-6-5.454-6 5.454V19z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zM8 15v2h8v-2H8z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM6 19h12V9.157l-6-5.454-6 5.454V19zm2-4h8v2H8v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-4-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zm-9-7v6h2v-6h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-4-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zm-6-2h5V9.157l-6-5.454-6 5.454V19h5v-6h2v6z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-5-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.49a1 1 0 0 1 .386-.79l8-6.222a1 1 0 0 1 1.228 0l8 6.222a1 1 0 0 1 .386.79V20zm-10-7v6h2v-6h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-5-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M13 19h6V9.978l-7-5.444-7 5.444V19h6v-6h2v6zm8 1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.49a1 1 0 0 1 .386-.79l8-6.222a1 1 0 0 1 1.228 0l8 6.222a1 1 0 0 1 .386.79V20z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-6-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.49a1 1 0 0 1 .386-.79l8-6.222a1 1 0 0 1 1.228 0l8 6.222a1 1 0 0 1 .386.79V20zM7 15v2h10v-2H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-7-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9H0l10.327-9.388a1 1 0 0 1 1.346 0L22 11h-3v9zm-8-5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-6-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.49a1 1 0 0 1 .386-.79l8-6.222a1 1 0 0 1 1.228 0l8 6.222a1 1 0 0 1 .386.79V20zm-2-1V9.978l-7-5.444-7 5.444V19h14zM7 15h10v2H7v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-8-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM6 19h12V9.157l-6-5.454-6 5.454V19zm3-9h6v6H9v-6zm2 2v2h2v-2h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-8-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zM9 10v6h6v-6H9zm2 2h2v2h-2v-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-7-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM6 19h12V9.157l-6-5.454-6 5.454V19zm6-4a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.49a1 1 0 0 1 .386-.79l8-6.222a1 1 0 0 1 1.228 0l8 6.222a1 1 0 0 1 .386.79V20z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-gear-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zM8.592 13.808l-.991.572 1 1.733.993-.573a3.5 3.5 0 0 0 1.405.811v1.145h2.002V16.35a3.5 3.5 0 0 0 1.405-.81l.992.572L16.4 14.38l-.991-.572a3.504 3.504 0 0 0 0-1.62l.991-.573-1-1.733-.993.573A3.5 3.5 0 0 0 13 9.645V8.5h-2.002v1.144a3.5 3.5 0 0 0-1.405.811l-.992-.573L7.6 11.616l.991.572a3.504 3.504 0 0 0 0 1.62zm3.408.69a1.5 1.5 0 1 1-.002-3.001 1.5 1.5 0 0 1 .002 3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-gear-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM6 19h12V9.157l-6-5.454-6 5.454V19zm2.591-5.191a3.508 3.508 0 0 1 0-1.622l-.991-.572 1-1.732.991.573a3.495 3.495 0 0 1 1.404-.812V8.5h2v1.144c.532.159 1.01.44 1.404.812l.991-.573 1 1.731-.991.573a3.508 3.508 0 0 1 0 1.622l.991.572-1 1.731-.991-.572a3.495 3.495 0 0 1-1.404.811v1.145h-2V16.35a3.495 3.495 0 0 1-1.404-.811l-.991.572-1-1.73.991-.573zm3.404.688a1.5 1.5 0 1 0 0-2.998 1.5 1.5 0 0 0 0 2.998z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-heart-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zm-8-3l3.359-3.359a2.25 2.25 0 1 0-3.182-3.182l-.177.177-.177-.177a2.25 2.25 0 1 0-3.182 3.182L12 17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-heart-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zm-2-1V9.157l-6-5.454-6 5.454V19h12zm-6-2l-3.359-3.359a2.25 2.25 0 1 1 3.182-3.182l.177.177.177-.177a2.25 2.25 0 1 1 3.182 3.182L12 17z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.49a1 1 0 0 1 .386-.79l8-6.222a1 1 0 0 1 1.228 0l8 6.222a1 1 0 0 1 .386.79V20zm-2-1V9.978l-7-5.444-7 5.444V19h14z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-smile-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zM7.5 13a4.5 4.5 0 1 0 9 0h-2a2.5 2.5 0 1 1-5 0h-2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-smile-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.314a1 1 0 0 1 .38-.785l8-6.311a1 1 0 0 1 1.24 0l8 6.31a1 1 0 0 1 .38.786V20zM7 12a5 5 0 0 0 10 0h-2a3 3 0 0 1-6 0H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-smile-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M19 19V9.799l-7-5.522-7 5.522V19h14zm2 1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.314a1 1 0 0 1 .38-.785l8-6.311a1 1 0 0 1 1.24 0l8 6.31a1 1 0 0 1 .38.786V20zM7 12h2a3 3 0 0 0 6 0h2a5 5 0 0 1-10 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-smile-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 19h12V9.157l-6-5.454-6 5.454V19zm13 2H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM7.5 13h2a2.5 2.5 0 1 0 5 0h2a4.5 4.5 0 1 1-9 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hospital-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 20h2v2H1v-2h2V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v17zM11 8H9v2h2v2h2v-2h2V8h-2V6h-2v2zm3 12h2v-6H8v6h2v-4h4v4z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-wifi-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M20 20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9zM7 11v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7zm0 4v3h3a3 3 0 0 0-3-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "home-wifi-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M6 19h12V9.157l-6-5.454-6 5.454V19zm13 2H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM8 10a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5v-2zm0 4a3 3 0 0 1 3 3H8v-3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hospital-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path fill-rule="nonzero" d="M8 20v-6h8v6h3V4H5v16h3zm2 0h4v-4h-4v4zm11 0h2v2H1v-2h2V3a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v17zM11 8V6h2v2h2v2h-2v2h-2v-2H9V8h2z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hotel-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M17 19h2v-8h-6v8h2v-6h2v6zM3 19V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5h2v10h1v2H2v-2h1zm4-8v2h2v-2H7zm0 4v2h2v-2H7zm0-8v2h2V7H7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "hotel-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 21H2v-2h1V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5h2v10h1v2zm-5-2h2v-8h-6v8h2v-6h2v6zm0-10V5H5v14h6V9h6zM7 11h2v2H7v-2zm0 4h2v2H7v-2zm0-8h2v2H7V7z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "store-2-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M22 20v2H2v-2h1v-6.758A4.496 4.496 0 0 1 1 9.5c0-.827.224-1.624.633-2.303L4.345 2.5a1 1 0 0 1 .866-.5H18.79a1 1 0 0 1 .866.5l2.702 4.682A4.496 4.496 0 0 1 21 13.242V20h1zM5.789 4L3.356 8.213a2.5 2.5 0 0 0 4.466 2.216c.335-.837 1.52-.837 1.856 0a2.5 2.5 0 0 0 4.644 0c.335-.837 1.52-.837 1.856 0a2.5 2.5 0 1 0 4.457-2.232L18.21 4H5.79z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "store-2-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 13.242V20h1v2H2v-2h1v-6.758A4.496 4.496 0 0 1 1 9.5c0-.827.224-1.624.633-2.303L4.345 2.5a1 1 0 0 1 .866-.5H18.79a1 1 0 0 1 .866.5l2.702 4.682A4.496 4.496 0 0 1 21 13.242zm-2 .73a4.496 4.496 0 0 1-3.75-1.36A4.496 4.496 0 0 1 12 14.001a4.496 4.496 0 0 1-3.25-1.387A4.496 4.496 0 0 1 5 13.973V20h14v-6.027zM5.789 4L3.356 8.213a2.5 2.5 0 0 0 4.466 2.216c.335-.837 1.52-.837 1.856 0a2.5 2.5 0 0 0 4.644 0c.335-.837 1.52-.837 1.856 0a2.5 2.5 0 1 0 4.457-2.232L18.21 4H5.79z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "store-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 11.646V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.354A3.985 3.985 0 0 1 2 9V3a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v6c0 1.014-.378 1.94-1 2.646zm-2 1.228a4.007 4.007 0 0 1-4-1.228A3.99 3.99 0 0 1 12 13a3.99 3.99 0 0 1-3-1.354 3.99 3.99 0 0 1-4 1.228V20h14v-7.126zM14 9a1 1 0 0 1 2 0 2 2 0 1 0 4 0V4H4v5a2 2 0 1 0 4 0 1 1 0 1 1 2 0 2 2 0 1 0 4 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "store-3-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7H2v-2l1-5h18l1 5v2h-1zM5 13v6h14v-6H5zm1 1h8v3H6v-3zM3 3h18v2H3V3z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "store-fill",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 11.646V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.354A3.985 3.985 0 0 1 2 9V3a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v6c0 1.014-.378 1.94-1 2.646zM14 9a1 1 0 0 1 2 0 2 2 0 1 0 4 0V4H4v5a2 2 0 1 0 4 0 1 1 0 1 1 2 0 2 2 0 1 0 4 0z"/>\n    </g>\n</svg>\n',
                },
                {
                    name: "store-3-line",
                    content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n    <g>\n        <path fill="none" d="M0 0h24v24H0z"/>\n        <path d="M21 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7H2v-2l1-5h18l1 5v2h-1zM5 13v6h14v-6H5zm-.96-2h15.92l-.6-3H4.64l-.6 3zM6 14h8v3H6v-3zM3 3h18v2H3V3z"/>\n    </g>\n</svg>\n',
                },
            ]
        },
    ];

    /* webviews\components\Model.svelte generated by Svelte v3.38.2 */

    const file$2 = "webviews\\components\\Model.svelte";

    // (19:0) {#if shown}
    function create_if_block(ctx) {
    	let div1;
    	let div0;
    	let span1;
    	let svg0;
    	let path0;
    	let path1;
    	let t0;
    	let span0;
    	let t2;
    	let span2;
    	let svg1;
    	let path2;
    	let path3;
    	let t3;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			span1 = element("span");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t0 = space();
    			span0 = element("span");
    			span0.textContent = "priview icon";
    			t2 = space();
    			span2 = element("span");
    			svg1 = svg_element("svg");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			t3 = space();
    			if (default_slot) default_slot.c();
    			attr_dev(path0, "fill", "none");
    			attr_dev(path0, "d", "M0 0h24v24H0z");
    			add_location(path0, file$2, 23, 99, 508);
    			attr_dev(path1, "d", "M6.364 6l8.784 9.663.72-.283c1.685-.661 2.864-2.156 3.092-3.896A6.502 6.502 0 0 1 12.077 6H6.363zM14 5a4.5 4.5 0 0 0 6.714 3.918c.186.618.286 1.271.286 1.947 0 2.891-1.822 5.364-4.4 6.377L20 21H3V4h11.111A4.515 4.515 0 0 0 14 5zm4.5 2.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM5 7.47V19h10.48L5 7.47z");
    			add_location(path1, file$2, 23, 136, 545);
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "width", "24");
    			attr_dev(svg0, "height", "24");
    			add_location(svg0, file$2, 23, 16, 425);
    			attr_dev(span0, "class", "svelte-uhr7xa");
    			add_location(span0, file$2, 24, 16, 878);
    			attr_dev(span1, "class", "modal_title svelte-uhr7xa");
    			add_location(span1, file$2, 22, 12, 381);
    			attr_dev(path2, "fill", "none");
    			attr_dev(path2, "d", "M0 0h24v24H0z");
    			add_location(path2, file$2, 27, 99, 1083);
    			attr_dev(path3, "d", "M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z");
    			attr_dev(path3, "fill", "rgba(0,0,0,1)");
    			add_location(path3, file$2, 27, 136, 1120);
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			attr_dev(svg1, "width", "24");
    			attr_dev(svg1, "height", "24");
    			attr_dev(svg1, "class", "svelte-uhr7xa");
    			add_location(svg1, file$2, 27, 16, 1000);
    			attr_dev(span2, "class", "close svelte-uhr7xa");
    			add_location(span2, file$2, 26, 12, 938);
    			attr_dev(div0, "class", "modal svelte-uhr7xa");
    			add_location(div0, file$2, 21, 8, 348);
    			attr_dev(div1, "class", "modal-wrapper svelte-uhr7xa");
    			add_location(div1, file$2, 19, 4, 305);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, span1);
    			append_dev(span1, svg0);
    			append_dev(svg0, path0);
    			append_dev(svg0, path1);
    			append_dev(span1, t0);
    			append_dev(span1, span0);
    			append_dev(div0, t2);
    			append_dev(div0, span2);
    			append_dev(span2, svg1);
    			append_dev(svg1, path2);
    			append_dev(svg1, path3);
    			append_dev(div0, t3);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(span2, "click", /*click_handler*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[3], dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(19:0) {#if shown}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let if_block_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*shown*/ ctx[1] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(window, "keydown", /*keydown_handler*/ ctx[5], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*shown*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*shown*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Model", slots, ['default']);
    	let shown = false;

    	function show() {
    		$$invalidate(1, shown = true);
    	}

    	function hide() {
    		$$invalidate(1, shown = false);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Model> was created with unknown prop '${key}'`);
    	});

    	const keydown_handler = e => {
    		if (e.keyCode == 27) {
    			hide();
    		}
    	};

    	const click_handler = () => hide();

    	$$self.$$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({ shown, show, hide });

    	$$self.$inject_state = $$props => {
    		if ("shown" in $$props) $$invalidate(1, shown = $$props.shown);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [hide, shown, show, $$scope, slots, keydown_handler, click_handler];
    }

    class Model extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { show: 2, hide: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Model",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get show() {
    		return this.$$.ctx[2];
    	}

    	set show(value) {
    		throw new Error("<Model>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hide() {
    		return this.$$.ctx[0];
    	}

    	set hide(value) {
    		throw new Error("<Model>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-color-picker\src\HsvPicker.svelte generated by Svelte v3.38.2 */
    const file$1 = "node_modules\\svelte-color-picker\\src\\HsvPicker.svelte";

    function create_fragment$1(ctx) {
    	let div20;
    	let div4;
    	let div3;
    	let div2;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let div7;
    	let div5;
    	let t2;
    	let div6;
    	let t3;
    	let div11;
    	let div8;
    	let t4;
    	let div9;
    	let t5;
    	let div10;
    	let t6;
    	let div19;
    	let div13;
    	let div12;
    	let t7;
    	let div14;
    	let p0;
    	let t8;
    	let t9;
    	let div18;
    	let div15;
    	let p1;
    	let t10;
    	let t11;
    	let p2;
    	let t13;
    	let div16;
    	let p3;
    	let t14;
    	let t15;
    	let p4;
    	let t17;
    	let div17;
    	let p5;
    	let t18;
    	let t19;
    	let p6;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div20 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			t1 = space();
    			div7 = element("div");
    			div5 = element("div");
    			t2 = space();
    			div6 = element("div");
    			t3 = space();
    			div11 = element("div");
    			div8 = element("div");
    			t4 = space();
    			div9 = element("div");
    			t5 = space();
    			div10 = element("div");
    			t6 = space();
    			div19 = element("div");
    			div13 = element("div");
    			div12 = element("div");
    			t7 = space();
    			div14 = element("div");
    			p0 = element("p");
    			t8 = text(/*hexValue*/ ctx[3]);
    			t9 = space();
    			div18 = element("div");
    			div15 = element("div");
    			p1 = element("p");
    			t10 = text(/*r*/ ctx[0]);
    			t11 = space();
    			p2 = element("p");
    			p2.textContent = "R";
    			t13 = space();
    			div16 = element("div");
    			p3 = element("p");
    			t14 = text(/*g*/ ctx[1]);
    			t15 = space();
    			p4 = element("p");
    			p4.textContent = "G";
    			t17 = space();
    			div17 = element("div");
    			p5 = element("p");
    			t18 = text(/*b*/ ctx[2]);
    			t19 = space();
    			p6 = element("p");
    			p6.textContent = "B";
    			attr_dev(div0, "id", "colorsquare-picker");
    			attr_dev(div0, "class", "svelte-8esefu");
    			add_location(div0, file$1, 607, 14, 15799);
    			attr_dev(div1, "id", "colorsquare-event");
    			attr_dev(div1, "class", "svelte-8esefu");
    			add_location(div1, file$1, 608, 14, 15849);
    			attr_dev(div2, "class", "value-gradient svelte-8esefu");
    			add_location(div2, file$1, 606, 10, 15756);
    			attr_dev(div3, "class", "saturation-gradient svelte-8esefu");
    			add_location(div3, file$1, 605, 6, 15712);
    			attr_dev(div4, "class", "colorsquare size svelte-8esefu");
    			add_location(div4, file$1, 604, 2, 15675);
    			attr_dev(div5, "id", "hue-picker");
    			attr_dev(div5, "class", "svelte-8esefu");
    			add_location(div5, file$1, 614, 6, 16009);
    			attr_dev(div6, "id", "hue-event");
    			attr_dev(div6, "class", "svelte-8esefu");
    			add_location(div6, file$1, 615, 6, 16043);
    			attr_dev(div7, "class", "hue-selector svelte-8esefu");
    			add_location(div7, file$1, 613, 2, 15976);
    			attr_dev(div8, "class", "alpha-value svelte-8esefu");
    			add_location(div8, file$1, 619, 6, 16169);
    			attr_dev(div9, "id", "alpha-picker");
    			attr_dev(div9, "class", "svelte-8esefu");
    			add_location(div9, file$1, 620, 6, 16207);
    			attr_dev(div10, "id", "alpha-event");
    			attr_dev(div10, "class", "svelte-8esefu");
    			add_location(div10, file$1, 621, 6, 16243);
    			attr_dev(div11, "class", "alpha-selector svelte-8esefu");
    			add_location(div11, file$1, 618, 2, 16134);
    			attr_dev(div12, "class", "color-picked svelte-8esefu");
    			add_location(div12, file$1, 626, 6, 16409);
    			attr_dev(div13, "class", "color-picked-bg svelte-8esefu");
    			add_location(div13, file$1, 625, 4, 16373);
    			attr_dev(p0, "class", "text svelte-8esefu");
    			add_location(p0, file$1, 630, 6, 16493);
    			attr_dev(div14, "class", "hex-text-block svelte-8esefu");
    			add_location(div14, file$1, 629, 4, 16458);
    			attr_dev(p1, "class", "text svelte-8esefu");
    			add_location(p1, file$1, 635, 8, 16610);
    			attr_dev(p2, "class", "text-label svelte-8esefu");
    			add_location(p2, file$1, 636, 8, 16642);
    			attr_dev(div15, "class", "rgb-text-block svelte-8esefu");
    			add_location(div15, file$1, 634, 6, 16573);
    			attr_dev(p3, "class", "text svelte-8esefu");
    			add_location(p3, file$1, 640, 8, 16727);
    			attr_dev(p4, "class", "text-label svelte-8esefu");
    			add_location(p4, file$1, 641, 8, 16759);
    			attr_dev(div16, "class", "rgb-text-block svelte-8esefu");
    			add_location(div16, file$1, 639, 6, 16690);
    			attr_dev(p5, "class", "text svelte-8esefu");
    			add_location(p5, file$1, 645, 8, 16844);
    			attr_dev(p6, "class", "text-label svelte-8esefu");
    			add_location(p6, file$1, 646, 8, 16876);
    			attr_dev(div17, "class", "rgb-text-block svelte-8esefu");
    			add_location(div17, file$1, 644, 6, 16807);
    			attr_dev(div18, "class", "rgb-text-div svelte-8esefu");
    			add_location(div18, file$1, 633, 4, 16540);
    			attr_dev(div19, "class", "color-info-box svelte-8esefu");
    			add_location(div19, file$1, 624, 2, 16340);
    			attr_dev(div20, "class", "main-container svelte-8esefu");
    			add_location(div20, file$1, 602, 0, 15643);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div20, anchor);
    			append_dev(div20, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, div0);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			append_dev(div20, t1);
    			append_dev(div20, div7);
    			append_dev(div7, div5);
    			append_dev(div7, t2);
    			append_dev(div7, div6);
    			append_dev(div20, t3);
    			append_dev(div20, div11);
    			append_dev(div11, div8);
    			append_dev(div11, t4);
    			append_dev(div11, div9);
    			append_dev(div11, t5);
    			append_dev(div11, div10);
    			append_dev(div20, t6);
    			append_dev(div20, div19);
    			append_dev(div19, div13);
    			append_dev(div13, div12);
    			append_dev(div19, t7);
    			append_dev(div19, div14);
    			append_dev(div14, p0);
    			append_dev(p0, t8);
    			append_dev(div19, t9);
    			append_dev(div19, div18);
    			append_dev(div18, div15);
    			append_dev(div15, p1);
    			append_dev(p1, t10);
    			append_dev(div15, t11);
    			append_dev(div15, p2);
    			append_dev(div18, t13);
    			append_dev(div18, div16);
    			append_dev(div16, p3);
    			append_dev(p3, t14);
    			append_dev(div16, t15);
    			append_dev(div16, p4);
    			append_dev(div18, t17);
    			append_dev(div18, div17);
    			append_dev(div17, p5);
    			append_dev(p5, t18);
    			append_dev(div17, t19);
    			append_dev(div17, p6);

    			if (!mounted) {
    				dispose = [
    					listen_dev(div1, "mousedown", /*csDown*/ ctx[4], false, false, false),
    					listen_dev(div1, "touchstart", /*csDownTouch*/ ctx[5], false, false, false),
    					listen_dev(div6, "mousedown", /*hueDown*/ ctx[6], false, false, false),
    					listen_dev(div6, "touchstart", /*hueDownTouch*/ ctx[7], false, false, false),
    					listen_dev(div10, "mousedown", /*alphaDown*/ ctx[8], false, false, false),
    					listen_dev(div10, "touchstart", /*alphaDownTouch*/ ctx[9], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*hexValue*/ 8) set_data_dev(t8, /*hexValue*/ ctx[3]);
    			if (dirty & /*r*/ 1) set_data_dev(t10, /*r*/ ctx[0]);
    			if (dirty & /*g*/ 2) set_data_dev(t14, /*g*/ ctx[1]);
    			if (dirty & /*b*/ 4) set_data_dev(t18, /*b*/ ctx[2]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div20);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function removeEventListenerFromElement(elementId, eventName, listenerCallback) {
    	let element = document.querySelector(elementId);
    	if (element) element.removeEventListener(eventName, listenerCallback);
    }

    //Math algorithms
    function hsvToRgb(h, s, v) {
    	var r, g, b;
    	var i = Math.floor(h * 6);
    	var f = h * 6 - i;
    	var p = v * (1 - s);
    	var q = v * (1 - f * s);
    	var t = v * (1 - (1 - f) * s);

    	switch (i % 6) {
    		case 0:
    			(r = v, g = t, b = p);
    			break;
    		case 1:
    			(r = q, g = v, b = p);
    			break;
    		case 2:
    			(r = p, g = v, b = t);
    			break;
    		case 3:
    			(r = p, g = q, b = v);
    			break;
    		case 4:
    			(r = t, g = p, b = v);
    			break;
    		case 5:
    			(r = v, g = p, b = q);
    			break;
    	}

    	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("HsvPicker", slots, []);
    	let { startColor = "#FF0000" } = $$props;

    	onMount(() => {
    		document.addEventListener("mouseup", mouseUp);
    		document.addEventListener("touchend", mouseUp);
    		document.addEventListener("mousemove", mouseMove);
    		document.addEventListener("touchmove", touchMove);
    		document.addEventListener("touchstart", killMouseEvents);
    		document.addEventListener("mousedown", killTouchEvents);
    		setStartColor();
    	});

    	Number.prototype.mod = function (n) {
    		return (this % n + n) % n;
    	};

    	const dispatch = createEventDispatcher();
    	let tracked;
    	let h = 1;
    	let s = 1;
    	let v = 1;
    	let a = 1;
    	let r = 255;
    	let g = 0;
    	let b = 0;
    	let hexValue = "#FF0000";

    	function setStartColor() {
    		let hex = startColor.replace("#", "");

    		if (hex.length !== 6 && hex.length !== 3 && !hex.match(/([^A-F0-9])/gi)) {
    			alert("Invalid property value (startColor)");
    			return;
    		}

    		let hexFiltered = "";

    		if (hex.length === 3) hex.split("").forEach(c => {
    			hexFiltered += c + c;
    		}); else hexFiltered = hex;

    		$$invalidate(3, hexValue = hexFiltered);
    		$$invalidate(0, r = parseInt(hexFiltered.substring(0, 2), 16));
    		$$invalidate(1, g = parseInt(hexFiltered.substring(2, 4), 16));
    		$$invalidate(2, b = parseInt(hexFiltered.substring(4, 6), 16));
    		rgbToHSV(r, g, b, true);
    		updateCsPicker();
    		updateHuePicker();
    	}

    	function killMouseEvents() {
    		removeEventListenerFromElement("#alpha-event", "mousedown", alphaDown);
    		removeEventListenerFromElement("#colorsquare-event", "mousedown", csDown);
    		removeEventListenerFromElement("#hue-event", "mousedown", hueDown);
    		document.removeEventListener("mouseup", mouseUp);
    		document.removeEventListener("mousemove", mouseMove);
    		document.removeEventListener("touchstart", killMouseEvents);
    		document.removeEventListener("mousedown", killTouchEvents);
    	}

    	function killTouchEvents() {
    		removeEventListenerFromElement("#alpha-event", "touchstart", alphaDownTouch);
    		removeEventListenerFromElement("#colorsquare-event", "touchstart", csDownTouch);
    		removeEventListenerFromElement("#hue-event", "touchstart", hueDownTouch);
    		document.removeEventListener("touchend", mouseUp);
    		document.removeEventListener("touchmove", touchMove);
    		document.removeEventListener("touchstart", killMouseEvents);
    		document.removeEventListener("mousedown", killTouchEvents);
    	}

    	function updateCsPicker() {
    		let csPicker = document.querySelector("#colorsquare-picker");
    		let xPercentage = s * 100;
    		let yPercentage = (1 - v) * 100;
    		csPicker.style.top = yPercentage + "%";
    		csPicker.style.left = xPercentage + "%";
    	}

    	function updateHuePicker() {
    		let huePicker = document.querySelector("#hue-picker");
    		let xPercentage = h * 100;
    		huePicker.style.left = xPercentage + "%";
    	}

    	function colorChangeCallback() {
    		dispatch("colorChange", { r, g, b, a });
    	}

    	function mouseMove(event) {
    		if (tracked) {
    			let mouseX = event.clientX;
    			let mouseY = event.clientY;
    			let trackedPos = tracked.getBoundingClientRect();
    			let xPercentage, yPercentage, picker;

    			switch (tracked.id) {
    				case "colorsquare-event":
    					xPercentage = (mouseX - trackedPos.x) / 240 * 100;
    					yPercentage = (mouseY - trackedPos.y) / 160 * 100;
    					xPercentage > 100
    					? xPercentage = 100
    					: xPercentage < 0 ? xPercentage = 0 : null;
    					yPercentage > 100
    					? yPercentage = 100
    					: yPercentage < 0 ? yPercentage = 0 : null;
    					picker = document.querySelector("#colorsquare-picker");
    					yPercentage = yPercentage.toFixed(2);
    					xPercentage = xPercentage.toFixed(2);
    					picker.style.top = yPercentage + "%";
    					picker.style.left = xPercentage + "%";
    					s = xPercentage / 100;
    					v = 1 - yPercentage / 100;
    					colorChange();
    					break;
    				case "hue-event":
    					xPercentage = (mouseX - 10 - trackedPos.x) / 220 * 100;
    					xPercentage > 100
    					? xPercentage = 100
    					: xPercentage < 0 ? xPercentage = 0 : null;
    					xPercentage = xPercentage.toFixed(2);
    					picker = document.querySelector("#hue-picker");
    					picker.style.left = xPercentage + "%";
    					h = xPercentage / 100;
    					hueChange();
    					break;
    				case "alpha-event":
    					xPercentage = (mouseX - 10 - trackedPos.x) / 220 * 100;
    					xPercentage > 100
    					? xPercentage = 100
    					: xPercentage < 0 ? xPercentage = 0 : null;
    					xPercentage = xPercentage.toFixed(2);
    					picker = document.querySelector("#alpha-picker");
    					picker.style.left = xPercentage + "%";
    					a = xPercentage / 100;
    					colorChange();
    					break;
    			}
    		}
    	}

    	function touchMove(event) {
    		if (tracked) {
    			let mouseX = event.touches[0].clientX;
    			let mouseY = event.touches[0].clientY;
    			let trackedPos = tracked.getBoundingClientRect();
    			let xPercentage, yPercentage, picker;

    			switch (tracked.id) {
    				case "colorsquare-event":
    					xPercentage = (mouseX - trackedPos.x) / 240 * 100;
    					yPercentage = (mouseY - trackedPos.y) / 160 * 100;
    					xPercentage > 100
    					? xPercentage = 100
    					: xPercentage < 0 ? xPercentage = 0 : null;
    					yPercentage > 100
    					? yPercentage = 100
    					: yPercentage < 0 ? yPercentage = 0 : null;
    					picker = document.querySelector("#colorsquare-picker");
    					yPercentage = yPercentage.toFixed(2);
    					xPercentage = xPercentage.toFixed(2);
    					picker.style.top = yPercentage + "%";
    					picker.style.left = xPercentage + "%";
    					s = xPercentage / 100;
    					v = 1 - yPercentage / 100;
    					colorChange();
    					break;
    				case "hue-event":
    					xPercentage = (mouseX - 10 - trackedPos.x) / 220 * 100;
    					xPercentage > 100
    					? xPercentage = 100
    					: xPercentage < 0 ? xPercentage = 0 : null;
    					xPercentage = xPercentage.toFixed(2);
    					picker = document.querySelector("#hue-picker");
    					picker.style.left = xPercentage + "%";
    					h = xPercentage / 100;
    					hueChange();
    					break;
    				case "alpha-event":
    					xPercentage = (mouseX - 10 - trackedPos.x) / 220 * 100;
    					xPercentage > 100
    					? xPercentage = 100
    					: xPercentage < 0 ? xPercentage = 0 : null;
    					xPercentage = xPercentage.toFixed(2);
    					picker = document.querySelector("#alpha-picker");
    					picker.style.left = xPercentage + "%";
    					a = xPercentage / 100;
    					colorChange();
    					break;
    			}
    		}
    	}

    	function csDown(event) {
    		tracked = event.currentTarget;
    		let xPercentage = (event.offsetX + 1) / 240 * 100;
    		let yPercentage = (event.offsetY + 1) / 160 * 100;
    		yPercentage = yPercentage.toFixed(2);
    		xPercentage = xPercentage.toFixed(2);
    		let picker = document.querySelector("#colorsquare-picker");
    		picker.style.top = yPercentage + "%";
    		picker.style.left = xPercentage + "%";
    		s = xPercentage / 100;
    		v = 1 - yPercentage / 100;
    		colorChange();
    	}

    	function csDownTouch(event) {
    		tracked = event.currentTarget;
    		let rect = event.target.getBoundingClientRect();
    		let offsetX = event.targetTouches[0].clientX - rect.left;
    		let offsetY = event.targetTouches[0].clientY - rect.top;
    		let xPercentage = (offsetX + 1) / 240 * 100;
    		let yPercentage = (offsetY + 1) / 160 * 100;
    		yPercentage = yPercentage.toFixed(2);
    		xPercentage = xPercentage.toFixed(2);
    		let picker = document.querySelector("#colorsquare-picker");
    		picker.style.top = yPercentage + "%";
    		picker.style.left = xPercentage + "%";
    		s = xPercentage / 100;
    		v = 1 - yPercentage / 100;
    		colorChange();
    	}

    	function mouseUp(event) {
    		tracked = null;
    	}

    	function hueDown(event) {
    		tracked = event.currentTarget;
    		let xPercentage = (event.offsetX - 9) / 220 * 100;
    		xPercentage = xPercentage.toFixed(2);
    		let picker = document.querySelector("#hue-picker");
    		picker.style.left = xPercentage + "%";
    		h = xPercentage / 100;
    		hueChange();
    	}

    	function hueDownTouch(event) {
    		tracked = event.currentTarget;
    		let rect = event.target.getBoundingClientRect();
    		let offsetX = event.targetTouches[0].clientX - rect.left;
    		let xPercentage = (offsetX - 9) / 220 * 100;
    		xPercentage = xPercentage.toFixed(2);
    		let picker = document.querySelector("#hue-picker");
    		picker.style.left = xPercentage + "%";
    		h = xPercentage / 100;
    		hueChange();
    	}

    	function hueChange() {
    		let rgb = hsvToRgb(h, 1, 1);
    		let colorsquare = document.querySelector(".colorsquare");
    		colorsquare.style.background = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`;
    		colorChange();
    	}

    	function colorChange() {
    		let rgb = hsvToRgb(h, s, v);
    		$$invalidate(0, r = rgb[0]);
    		$$invalidate(1, g = rgb[1]);
    		$$invalidate(2, b = rgb[2]);
    		$$invalidate(3, hexValue = RGBAToHex());
    		let pickedColor = document.querySelector(".color-picked");
    		pickedColor.style.background = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
    		colorChangeCallback();
    	}

    	function alphaDown(event) {
    		tracked = event.currentTarget;
    		let xPercentage = (event.offsetX - 9) / 220 * 100;
    		xPercentage = xPercentage.toFixed(2);
    		let picker = document.querySelector("#alpha-picker");
    		picker.style.left = xPercentage + "%";
    		a = xPercentage / 100;
    		colorChange();
    	}

    	function alphaDownTouch(event) {
    		tracked = event.currentTarget;
    		let rect = event.target.getBoundingClientRect();
    		let offsetX = event.targetTouches[0].clientX - rect.left;
    		let xPercentage = (offsetX - 9) / 220 * 100;
    		xPercentage = xPercentage.toFixed(2);
    		let picker = document.querySelector("#alpha-picker");
    		picker.style.left = xPercentage + "%";
    		a = xPercentage / 100;
    		colorChange();
    	}

    	function RGBAToHex() {
    		let rHex = r.toString(16);
    		let gHex = g.toString(16);
    		let bHex = b.toString(16);
    		if (rHex.length == 1) rHex = "0" + rHex;
    		if (gHex.length == 1) gHex = "0" + gHex;
    		if (bHex.length == 1) bHex = "0" + bHex;
    		return ("#" + rHex + gHex + bHex).toUpperCase();
    	}

    	function rgbToHSV(r, g, b, update) {
    		let rperc, gperc, bperc, max, min, diff, pr, hnew, snew, vnew;
    		rperc = r / 255;
    		gperc = g / 255;
    		bperc = b / 255;
    		max = Math.max(rperc, gperc, bperc);
    		min = Math.min(rperc, gperc, bperc);
    		diff = max - min;
    		vnew = max;
    		vnew == 0 ? snew = 0 : snew = diff / max;

    		for (let i = 0; i < 3; i++) {
    			if ([rperc, gperc, bperc][i] === max) {
    				pr = i;
    				break;
    			}
    		}

    		if (diff == 0) {
    			hnew = 0;

    			if (update) {
    				h = hnew;
    				s = snew;
    				v = vnew;
    				hueChange();
    				return;
    			} else {
    				return { h: hnew, s: snew, v: vnew };
    			}
    		} else {
    			switch (pr) {
    				case 0:
    					hnew = 60 * ((gperc - bperc) / diff % 6) / 360;
    					break;
    				case 1:
    					hnew = 60 * ((bperc - rperc) / diff + 2) / 360;
    					break;
    				case 2:
    					hnew = 60 * ((rperc - gperc) / diff + 4) / 360;
    					break;
    			}

    			if (hnew < 0) hnew += 6;
    		}

    		if (update) {
    			h = hnew;
    			s = snew;
    			v = vnew;
    			hueChange();
    		} else {
    			return { h: hnew, s: snew, v: vnew };
    		}
    	}

    	const writable_props = ["startColor"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<HsvPicker> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("startColor" in $$props) $$invalidate(10, startColor = $$props.startColor);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		createEventDispatcher,
    		startColor,
    		dispatch,
    		tracked,
    		h,
    		s,
    		v,
    		a,
    		r,
    		g,
    		b,
    		hexValue,
    		setStartColor,
    		removeEventListenerFromElement,
    		killMouseEvents,
    		killTouchEvents,
    		updateCsPicker,
    		updateHuePicker,
    		colorChangeCallback,
    		mouseMove,
    		touchMove,
    		csDown,
    		csDownTouch,
    		mouseUp,
    		hueDown,
    		hueDownTouch,
    		hueChange,
    		colorChange,
    		alphaDown,
    		alphaDownTouch,
    		hsvToRgb,
    		RGBAToHex,
    		rgbToHSV
    	});

    	$$self.$inject_state = $$props => {
    		if ("startColor" in $$props) $$invalidate(10, startColor = $$props.startColor);
    		if ("tracked" in $$props) tracked = $$props.tracked;
    		if ("h" in $$props) h = $$props.h;
    		if ("s" in $$props) s = $$props.s;
    		if ("v" in $$props) v = $$props.v;
    		if ("a" in $$props) a = $$props.a;
    		if ("r" in $$props) $$invalidate(0, r = $$props.r);
    		if ("g" in $$props) $$invalidate(1, g = $$props.g);
    		if ("b" in $$props) $$invalidate(2, b = $$props.b);
    		if ("hexValue" in $$props) $$invalidate(3, hexValue = $$props.hexValue);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		r,
    		g,
    		b,
    		hexValue,
    		csDown,
    		csDownTouch,
    		hueDown,
    		hueDownTouch,
    		alphaDown,
    		alphaDownTouch,
    		startColor
    	];
    }

    class HsvPicker extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { startColor: 10 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "HsvPicker",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get startColor() {
    		throw new Error("<HsvPicker>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set startColor(value) {
    		throw new Error("<HsvPicker>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\Vsicons.svelte generated by Svelte v3.38.2 */

    const { console: console_1 } = globals;
    const file = "webviews\\components\\Vsicons.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	return child_ctx;
    }

    // (40:16) {#each category.iconsvg as icon}
    function create_each_block_1(ctx) {
    	let div2;
    	let div1;
    	let i;
    	let t0;
    	let div0;
    	let html_tag;
    	let raw_value = /*icon*/ ctx[10].content + "";
    	let t1;
    	let p;
    	let t2_value = shortentext(/*icon*/ ctx[10].name) + "";
    	let t2;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[3](/*icon*/ ctx[10]);
    	}

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			i = element("i");
    			t0 = space();
    			div0 = element("div");
    			t1 = space();
    			p = element("p");
    			t2 = text(t2_value);
    			attr_dev(i, "class", "add-btn svelte-mpbjc9");
    			add_location(i, file, 48, 28, 1409);
    			html_tag = new HtmlTag(t1);
    			attr_dev(p, "class", "svelte-mpbjc9");
    			add_location(p, file, 51, 32, 1571);
    			attr_dev(div0, "class", "icon-info");
    			add_location(div0, file, 49, 28, 1460);
    			attr_dev(div1, "class", "centerization svelte-mpbjc9");
    			add_location(div1, file, 47, 24, 1352);
    			attr_dev(div2, "class", "icon-item svelte-mpbjc9");
    			add_location(div2, file, 40, 20, 1094);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, i);
    			append_dev(div1, t0);
    			append_dev(div1, div0);
    			html_tag.m(raw_value, div0);
    			append_dev(div0, t1);
    			append_dev(div0, p);
    			append_dev(p, t2);

    			if (!mounted) {
    				dispose = listen_dev(div2, "click", click_handler, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*iconsarray*/ 2 && raw_value !== (raw_value = /*icon*/ ctx[10].content + "")) html_tag.p(raw_value);
    			if (dirty & /*iconsarray*/ 2 && t2_value !== (t2_value = shortentext(/*icon*/ ctx[10].name) + "")) set_data_dev(t2, t2_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(40:16) {#each category.iconsvg as icon}",
    		ctx
    	});

    	return block;
    }

    // (35:8) {#each iconsarray as category}
    function create_each_block(ctx) {
    	let div0;
    	let p;
    	let t0_value = /*category*/ ctx[7].name + "";
    	let t0;
    	let t1;
    	let div1;
    	let t2;
    	let each_value_1 = /*category*/ ctx[7].iconsvg;
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			p = element("p");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			attr_dev(p, "class", "icon-type-name svelte-mpbjc9");
    			add_location(p, file, 36, 16, 912);
    			attr_dev(div0, "class", "iconcategory_title");
    			add_location(div0, file, 35, 12, 862);
    			attr_dev(div1, "class", "fileiconcontainer svelte-mpbjc9");
    			add_location(div1, file, 38, 12, 991);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, p);
    			append_dev(p, t0);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div1, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append_dev(div1, t2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*iconsarray*/ 2 && t0_value !== (t0_value = /*category*/ ctx[7].name + "")) set_data_dev(t0, t0_value);

    			if (dirty & /*modal, currentsvg, iconsarray, shortentext*/ 7) {
    				each_value_1 = /*category*/ ctx[7].iconsvg;
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, t2);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(35:8) {#each iconsarray as category}",
    		ctx
    	});

    	return block;
    }

    // (60:4) <Model bind:this={modal}>
    function create_default_slot(ctx) {
    	let div7;
    	let div0;
    	let raw_value = /*currentsvg*/ ctx[2].content + "";
    	let t0;
    	let div6;
    	let div1;
    	let t1;
    	let div5;
    	let div2;
    	let svg0;
    	let path0;
    	let path1;
    	let t2;
    	let span0;
    	let t4;
    	let h2;
    	let t5_value = /*currentsvg*/ ctx[2].name + "";
    	let t5;
    	let t6;
    	let div3;
    	let hsvpicker;
    	let t7;
    	let div4;
    	let button0;
    	let svg1;
    	let path2;
    	let path3;
    	let t8;
    	let span1;
    	let t10;
    	let button1;
    	let svg2;
    	let path4;
    	let path5;
    	let t11;
    	let span2;
    	let current;
    	let mounted;
    	let dispose;

    	hsvpicker = new HsvPicker({
    			props: { startColor: "#FBFBFB" },
    			$$inline: true
    		});

    	hsvpicker.$on("colorChange", colorCallback);

    	const block = {
    		c: function create() {
    			div7 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div6 = element("div");
    			div1 = element("div");
    			t1 = space();
    			div5 = element("div");
    			div2 = element("div");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t2 = space();
    			span0 = element("span");
    			span0.textContent = "add collection";
    			t4 = space();
    			h2 = element("h2");
    			t5 = text(t5_value);
    			t6 = space();
    			div3 = element("div");
    			create_component(hsvpicker.$$.fragment);
    			t7 = space();
    			div4 = element("div");
    			button0 = element("button");
    			svg1 = svg_element("svg");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			t8 = space();
    			span1 = element("span");
    			span1.textContent = "Copy Svg";
    			t10 = space();
    			button1 = element("button");
    			svg2 = svg_element("svg");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			t11 = space();
    			span2 = element("span");
    			span2.textContent = "Insert";
    			attr_dev(div0, "class", "img-avatar svelte-mpbjc9");
    			add_location(div0, file, 61, 12, 1845);
    			attr_dev(div1, "class", "portada svelte-mpbjc9");
    			add_location(div1, file, 66, 16, 2048);
    			attr_dev(path0, "fill", "none");
    			attr_dev(path0, "d", "M0 0h24v24H0z");
    			add_location(path0, file, 74, 29, 2410);
    			attr_dev(path1, "d", "M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11H7v2h4v4h2v-4h4v-2h-4V7h-2v4z");
    			attr_dev(path1, "fill", "rgba(255,255,255,1)");
    			add_location(path1, file, 74, 67, 2448);
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "width", "24");
    			attr_dev(svg0, "height", "24");
    			attr_dev(svg0, "class", "svelte-mpbjc9");
    			add_location(svg0, file, 69, 24, 2181);
    			add_location(span0, file, 79, 24, 2749);
    			attr_dev(div2, "class", "title svelte-mpbjc9");
    			add_location(div2, file, 68, 20, 2136);
    			attr_dev(h2, "class", "svelte-mpbjc9");
    			add_location(h2, file, 81, 20, 2826);
    			attr_dev(div3, "class", "desc svelte-mpbjc9");
    			add_location(div3, file, 83, 20, 2876);
    			attr_dev(path2, "fill", "none");
    			attr_dev(path2, "d", "M0 0h24v24H0z");
    			add_location(path2, file, 112, 37, 4152);
    			attr_dev(path3, "d", "M6 4v4h12V4h2.007c.548 0 .993.445.993.993v16.014a.994.994 0 0 1-.993.993H3.993A.994.994 0 0 1 3 21.007V4.993C3 4.445 3.445 4 3.993 4H6zm2-2h8v4H8V2z");
    			attr_dev(path3, "fill", "rgba(255,255,255,1)");
    			add_location(path3, file, 112, 75, 4190);
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			attr_dev(svg1, "width", "24");
    			attr_dev(svg1, "height", "24");
    			attr_dev(svg1, "class", "svelte-mpbjc9");
    			add_location(svg1, file, 107, 32, 3883);
    			attr_dev(span1, "class", "svelte-mpbjc9");
    			add_location(span1, file, 117, 32, 4571);
    			attr_dev(button0, "title", "copy svg");
    			attr_dev(button0, "class", "button svelte-mpbjc9");
    			add_location(button0, file, 92, 28, 3251);
    			attr_dev(path4, "fill", "none");
    			attr_dev(path4, "d", "M0 0h24v24H0z");
    			add_location(path4, file, 137, 33, 5539);
    			attr_dev(path5, "d", "M1 14.5a6.496 6.496 0 0 1 3.064-5.519 8.001 8.001 0 0 1 15.872 0 6.5 6.5 0 0 1-2.936 12L7 21c-3.356-.274-6-3.078-6-6.5zm15.848 4.487a4.5 4.5 0 0 0 2.03-8.309l-.807-.503-.12-.942a6.001 6.001 0 0 0-11.903 0l-.12.942-.805.503a4.5 4.5 0 0 0 2.029 8.309l.173.013h9.35l.173-.013zM13 12h3l-4 5-4-5h3V8h2v4z");
    			attr_dev(path5, "fill", "rgba(255,255,255,1)");
    			add_location(path5, file, 137, 71, 5577);
    			attr_dev(svg2, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg2, "viewBox", "0 0 24 24");
    			attr_dev(svg2, "width", "24");
    			attr_dev(svg2, "height", "24");
    			attr_dev(svg2, "class", "svelte-mpbjc9");
    			add_location(svg2, file, 132, 28, 5290);
    			attr_dev(span2, "class", "svelte-mpbjc9");
    			add_location(span2, file, 142, 28, 6089);
    			set_style(button1, "margin-left", "10px");
    			attr_dev(button1, "title", "insert svg");
    			attr_dev(button1, "class", "button svelte-mpbjc9");
    			add_location(button1, file, 120, 24, 4725);
    			attr_dev(div4, "class", "actions svelte-mpbjc9");
    			add_location(div4, file, 89, 20, 3120);
    			attr_dev(div5, "class", "title-total svelte-mpbjc9");
    			add_location(div5, file, 67, 16, 2089);
    			attr_dev(div6, "class", "card-text svelte-mpbjc9");
    			add_location(div6, file, 65, 12, 2007);
    			attr_dev(div7, "class", "card svelte-mpbjc9");
    			add_location(div7, file, 60, 8, 1813);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div7, anchor);
    			append_dev(div7, div0);
    			div0.innerHTML = raw_value;
    			append_dev(div7, t0);
    			append_dev(div7, div6);
    			append_dev(div6, div1);
    			append_dev(div6, t1);
    			append_dev(div6, div5);
    			append_dev(div5, div2);
    			append_dev(div2, svg0);
    			append_dev(svg0, path0);
    			append_dev(svg0, path1);
    			append_dev(div2, t2);
    			append_dev(div2, span0);
    			append_dev(div5, t4);
    			append_dev(div5, h2);
    			append_dev(h2, t5);
    			append_dev(div5, t6);
    			append_dev(div5, div3);
    			mount_component(hsvpicker, div3, null);
    			append_dev(div5, t7);
    			append_dev(div5, div4);
    			append_dev(div4, button0);
    			append_dev(button0, svg1);
    			append_dev(svg1, path2);
    			append_dev(svg1, path3);
    			append_dev(button0, t8);
    			append_dev(button0, span1);
    			append_dev(div4, t10);
    			append_dev(div4, button1);
    			append_dev(button1, svg2);
    			append_dev(svg2, path4);
    			append_dev(svg2, path5);
    			append_dev(button1, t11);
    			append_dev(button1, span2);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler_1*/ ctx[4], false, false, false),
    					listen_dev(button1, "click", /*click_handler_2*/ ctx[5], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty & /*currentsvg*/ 4) && raw_value !== (raw_value = /*currentsvg*/ ctx[2].content + "")) div0.innerHTML = raw_value;			if ((!current || dirty & /*currentsvg*/ 4) && t5_value !== (t5_value = /*currentsvg*/ ctx[2].name + "")) set_data_dev(t5, t5_value);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(hsvpicker.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(hsvpicker.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div7);
    			destroy_component(hsvpicker);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(60:4) <Model bind:this={modal}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div1;
    	let div0;
    	let t;
    	let model;
    	let current;
    	let each_value = /*iconsarray*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	let model_props = {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	};

    	model = new Model({ props: model_props, $$inline: true });
    	/*model_binding*/ ctx[6](model);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			create_component(model.$$.fragment);
    			attr_dev(div0, "class", "wholeicon svelte-mpbjc9");
    			add_location(div0, file, 33, 4, 785);
    			add_location(div1, file, 32, 0, 774);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			append_dev(div1, t);
    			mount_component(model, div1, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*iconsarray, modal, currentsvg, shortentext*/ 7) {
    				each_value = /*iconsarray*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			const model_changes = {};

    			if (dirty & /*$$scope, currentsvg*/ 8196) {
    				model_changes.$$scope = { dirty, ctx };
    			}

    			model.$set(model_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(model.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(model.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    			/*model_binding*/ ctx[6](null);
    			destroy_component(model);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function shortentext(str) {
    	if (str.length > 15) {
    		const res = str.slice(0, 12).concat("...");
    		return res;
    	} else {
    		return str;
    	}
    }

    function colorCallback(rgba) {
    	console.log(rgba.detail);
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Vsicons", slots, []);
    	let modal;
    	let iconsarray = icons;
    	let currentsvg;

    	onMount(() => {
    		window.addEventListener("message", event => {
    			const message = event.data;

    			switch (message.type) {
    				case "all":
    					{
    						$$invalidate(1, iconsarray = message.value);
    						break;
    					}
    			}
    		});
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Vsicons> was created with unknown prop '${key}'`);
    	});

    	const click_handler = icon => {
    		modal.show();
    		$$invalidate(2, currentsvg = icon);
    	};

    	const click_handler_1 = () => {
    		tsiconvscode.postMessage({
    			type: "copied",
    			value: currentsvg.content,
    			name: currentsvg.name
    		});
    	};

    	const click_handler_2 = () => {
    		tsiconvscode.postMessage({
    			type: "insert",
    			value: currentsvg.content,
    			name: currentsvg.name
    		});
    	};

    	function model_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			modal = $$value;
    			$$invalidate(0, modal);
    		});
    	}

    	$$self.$capture_state = () => ({
    		onMount,
    		icons,
    		Model,
    		HsvPicker,
    		modal,
    		iconsarray,
    		currentsvg,
    		shortentext,
    		colorCallback
    	});

    	$$self.$inject_state = $$props => {
    		if ("modal" in $$props) $$invalidate(0, modal = $$props.modal);
    		if ("iconsarray" in $$props) $$invalidate(1, iconsarray = $$props.iconsarray);
    		if ("currentsvg" in $$props) $$invalidate(2, currentsvg = $$props.currentsvg);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		modal,
    		iconsarray,
    		currentsvg,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		model_binding
    	];
    }

    class Vsicons extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Vsicons",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new Vsicons({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=Vsicons.js.map

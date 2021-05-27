var app = (function () {
    'use strict';

    function noop() { }
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

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
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
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
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
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
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

    /* webviews\components\sidebar.svelte generated by Svelte v3.38.2 */

    const file = "webviews\\components\\sidebar.svelte";

    function create_fragment(ctx) {
    	let div19;
    	let input;
    	let t0;
    	let div18;
    	let div0;
    	let svg0;
    	let path0;
    	let path1;
    	let t1;
    	let span0;
    	let t3;
    	let div1;
    	let svg1;
    	let path2;
    	let path3;
    	let t4;
    	let span1;
    	let t6;
    	let div2;
    	let svg2;
    	let path4;
    	let path5;
    	let t7;
    	let span2;
    	let t9;
    	let div3;
    	let svg3;
    	let path6;
    	let path7;
    	let t10;
    	let span3;
    	let t12;
    	let div4;
    	let svg4;
    	let path8;
    	let path9;
    	let t13;
    	let span4;
    	let t15;
    	let div5;
    	let svg5;
    	let path10;
    	let path11;
    	let t16;
    	let span5;
    	let t18;
    	let div6;
    	let svg6;
    	let path12;
    	let path13;
    	let t19;
    	let span6;
    	let t21;
    	let div7;
    	let svg7;
    	let path14;
    	let path15;
    	let t22;
    	let span7;
    	let t24;
    	let div8;
    	let svg8;
    	let path16;
    	let path17;
    	let t25;
    	let span8;
    	let t27;
    	let div9;
    	let svg9;
    	let path18;
    	let path19;
    	let t28;
    	let span9;
    	let t30;
    	let div10;
    	let svg10;
    	let path20;
    	let path21;
    	let t31;
    	let span10;
    	let t33;
    	let div11;
    	let svg11;
    	let path22;
    	let path23;
    	let t34;
    	let span11;
    	let t36;
    	let div12;
    	let svg12;
    	let path24;
    	let path25;
    	let t37;
    	let span12;
    	let t39;
    	let div13;
    	let svg13;
    	let path26;
    	let path27;
    	let t40;
    	let span13;
    	let t42;
    	let div14;
    	let svg14;
    	let path28;
    	let path29;
    	let t43;
    	let span14;
    	let t45;
    	let div15;
    	let svg15;
    	let path30;
    	let path31;
    	let t46;
    	let span15;
    	let t48;
    	let div16;
    	let svg16;
    	let path32;
    	let path33;
    	let t49;
    	let span16;
    	let t51;
    	let div17;
    	let svg17;
    	let path34;
    	let path35;
    	let t52;
    	let span17;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div19 = element("div");
    			input = element("input");
    			t0 = space();
    			div18 = element("div");
    			div0 = element("div");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t1 = space();
    			span0 = element("span");
    			span0.textContent = "all";
    			t3 = space();
    			div1 = element("div");
    			svg1 = svg_element("svg");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			t4 = space();
    			span1 = element("span");
    			span1.textContent = "Builings";
    			t6 = space();
    			div2 = element("div");
    			svg2 = svg_element("svg");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			t7 = space();
    			span2 = element("span");
    			span2.textContent = "Business";
    			t9 = space();
    			div3 = element("div");
    			svg3 = svg_element("svg");
    			path6 = svg_element("path");
    			path7 = svg_element("path");
    			t10 = space();
    			span3 = element("span");
    			span3.textContent = "Communication";
    			t12 = space();
    			div4 = element("div");
    			svg4 = svg_element("svg");
    			path8 = svg_element("path");
    			path9 = svg_element("path");
    			t13 = space();
    			span4 = element("span");
    			span4.textContent = "Design";
    			t15 = space();
    			div5 = element("div");
    			svg5 = svg_element("svg");
    			path10 = svg_element("path");
    			path11 = svg_element("path");
    			t16 = space();
    			span5 = element("span");
    			span5.textContent = "Development";
    			t18 = space();
    			div6 = element("div");
    			svg6 = svg_element("svg");
    			path12 = svg_element("path");
    			path13 = svg_element("path");
    			t19 = space();
    			span6 = element("span");
    			span6.textContent = "Device";
    			t21 = space();
    			div7 = element("div");
    			svg7 = svg_element("svg");
    			path14 = svg_element("path");
    			path15 = svg_element("path");
    			t22 = space();
    			span7 = element("span");
    			span7.textContent = "Editor";
    			t24 = space();
    			div8 = element("div");
    			svg8 = svg_element("svg");
    			path16 = svg_element("path");
    			path17 = svg_element("path");
    			t25 = space();
    			span8 = element("span");
    			span8.textContent = "Document";
    			t27 = space();
    			div9 = element("div");
    			svg9 = svg_element("svg");
    			path18 = svg_element("path");
    			path19 = svg_element("path");
    			t28 = space();
    			span9 = element("span");
    			span9.textContent = "Finance";
    			t30 = space();
    			div10 = element("div");
    			svg10 = svg_element("svg");
    			path20 = svg_element("path");
    			path21 = svg_element("path");
    			t31 = space();
    			span10 = element("span");
    			span10.textContent = "Health & Medical";
    			t33 = space();
    			div11 = element("div");
    			svg11 = svg_element("svg");
    			path22 = svg_element("path");
    			path23 = svg_element("path");
    			t34 = space();
    			span11 = element("span");
    			span11.textContent = "Logos";
    			t36 = space();
    			div12 = element("div");
    			svg12 = svg_element("svg");
    			path24 = svg_element("path");
    			path25 = svg_element("path");
    			t37 = space();
    			span12 = element("span");
    			span12.textContent = "Map";
    			t39 = space();
    			div13 = element("div");
    			svg13 = svg_element("svg");
    			path26 = svg_element("path");
    			path27 = svg_element("path");
    			t40 = space();
    			span13 = element("span");
    			span13.textContent = "Media";
    			t42 = space();
    			div14 = element("div");
    			svg14 = svg_element("svg");
    			path28 = svg_element("path");
    			path29 = svg_element("path");
    			t43 = space();
    			span14 = element("span");
    			span14.textContent = "System";
    			t45 = space();
    			div15 = element("div");
    			svg15 = svg_element("svg");
    			path30 = svg_element("path");
    			path31 = svg_element("path");
    			t46 = space();
    			span15 = element("span");
    			span15.textContent = "User & Faces";
    			t48 = space();
    			div16 = element("div");
    			svg16 = svg_element("svg");
    			path32 = svg_element("path");
    			path33 = svg_element("path");
    			t49 = space();
    			span16 = element("span");
    			span16.textContent = "Weather";
    			t51 = space();
    			div17 = element("div");
    			svg17 = svg_element("svg");
    			path34 = svg_element("path");
    			path35 = svg_element("path");
    			t52 = space();
    			span17 = element("span");
    			span17.textContent = "Others";
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "svelte-10zfept");
    			add_location(input, file, 5, 2, 100);
    			attr_dev(path0, "fill", "none");
    			attr_dev(path0, "d", "M0 0h24v24H0z");
    			attr_dev(path0, "class", "svelte-10zfept");
    			add_location(path0, file, 16, 9, 463);
    			attr_dev(path1, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path1, "fill", "rgba(255,255,255,1)");
    			attr_dev(path1, "class", "svelte-10zfept");
    			add_location(path1, file, 16, 47, 501);
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			attr_dev(svg0, "width", "18");
    			attr_dev(svg0, "height", "18");
    			attr_dev(svg0, "class", "svelte-10zfept");
    			add_location(svg0, file, 11, 6, 334);
    			attr_dev(span0, "class", "svelte-10zfept");
    			add_location(span0, file, 21, 6, 713);
    			attr_dev(div0, "class", "items-body-content active svelte-10zfept");
    			add_location(div0, file, 8, 4, 203);
    			attr_dev(path2, "fill", "none");
    			attr_dev(path2, "d", "M0 0h24v24H0z");
    			attr_dev(path2, "class", "svelte-10zfept");
    			add_location(path2, file, 32, 9, 1050);
    			attr_dev(path3, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path3, "fill", "rgba(255,255,255,1)");
    			attr_dev(path3, "class", "svelte-10zfept");
    			add_location(path3, file, 32, 47, 1088);
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			attr_dev(svg1, "width", "18");
    			attr_dev(svg1, "height", "18");
    			attr_dev(svg1, "class", "svelte-10zfept");
    			add_location(svg1, file, 27, 6, 921);
    			attr_dev(span1, "class", "svelte-10zfept");
    			add_location(span1, file, 37, 6, 1300);
    			attr_dev(div1, "class", "items-body-content svelte-10zfept");
    			add_location(div1, file, 24, 4, 795);
    			attr_dev(path4, "fill", "none");
    			attr_dev(path4, "d", "M0 0h24v24H0z");
    			attr_dev(path4, "class", "svelte-10zfept");
    			add_location(path4, file, 47, 9, 1594);
    			attr_dev(path5, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path5, "fill", "rgba(255,255,255,1)");
    			attr_dev(path5, "class", "svelte-10zfept");
    			add_location(path5, file, 47, 47, 1632);
    			attr_dev(svg2, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg2, "viewBox", "0 0 24 24");
    			attr_dev(svg2, "width", "18");
    			attr_dev(svg2, "height", "18");
    			attr_dev(svg2, "class", "svelte-10zfept");
    			add_location(svg2, file, 42, 6, 1465);
    			attr_dev(span2, "class", "svelte-10zfept");
    			add_location(span2, file, 52, 6, 1844);
    			attr_dev(div2, "class", "items-body-content svelte-10zfept");
    			add_location(div2, file, 39, 4, 1339);
    			attr_dev(path6, "fill", "none");
    			attr_dev(path6, "d", "M0 0h24v24H0z");
    			attr_dev(path6, "class", "svelte-10zfept");
    			add_location(path6, file, 62, 9, 2143);
    			attr_dev(path7, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path7, "fill", "rgba(255,255,255,1)");
    			attr_dev(path7, "class", "svelte-10zfept");
    			add_location(path7, file, 62, 47, 2181);
    			attr_dev(svg3, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg3, "viewBox", "0 0 24 24");
    			attr_dev(svg3, "width", "18");
    			attr_dev(svg3, "height", "18");
    			attr_dev(svg3, "class", "svelte-10zfept");
    			add_location(svg3, file, 57, 6, 2014);
    			attr_dev(span3, "class", "svelte-10zfept");
    			add_location(span3, file, 67, 6, 2393);
    			attr_dev(div3, "class", "items-body-content svelte-10zfept");
    			add_location(div3, file, 54, 4, 1883);
    			attr_dev(path8, "fill", "none");
    			attr_dev(path8, "d", "M0 0h24v24H0z");
    			attr_dev(path8, "class", "svelte-10zfept");
    			add_location(path8, file, 77, 9, 2690);
    			attr_dev(path9, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path9, "fill", "rgba(255,255,255,1)");
    			attr_dev(path9, "class", "svelte-10zfept");
    			add_location(path9, file, 77, 47, 2728);
    			attr_dev(svg4, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg4, "viewBox", "0 0 24 24");
    			attr_dev(svg4, "width", "18");
    			attr_dev(svg4, "height", "18");
    			attr_dev(svg4, "class", "svelte-10zfept");
    			add_location(svg4, file, 72, 6, 2561);
    			attr_dev(span4, "class", "svelte-10zfept");
    			add_location(span4, file, 82, 6, 2940);
    			attr_dev(div4, "class", "items-body-content svelte-10zfept");
    			add_location(div4, file, 69, 4, 2437);
    			attr_dev(path10, "fill", "none");
    			attr_dev(path10, "d", "M0 0h24v24H0z");
    			attr_dev(path10, "class", "svelte-10zfept");
    			add_location(path10, file, 92, 9, 3231);
    			attr_dev(path11, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path11, "fill", "rgba(255,255,255,1)");
    			attr_dev(path11, "class", "svelte-10zfept");
    			add_location(path11, file, 92, 47, 3269);
    			attr_dev(svg5, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg5, "viewBox", "0 0 24 24");
    			attr_dev(svg5, "width", "18");
    			attr_dev(svg5, "height", "18");
    			attr_dev(svg5, "class", "svelte-10zfept");
    			add_location(svg5, file, 87, 6, 3102);
    			attr_dev(span5, "class", "svelte-10zfept");
    			add_location(span5, file, 97, 6, 3481);
    			attr_dev(div5, "class", "items-body-content svelte-10zfept");
    			add_location(div5, file, 84, 4, 2977);
    			attr_dev(path12, "fill", "none");
    			attr_dev(path12, "d", "M0 0h24v24H0z");
    			attr_dev(path12, "class", "svelte-10zfept");
    			add_location(path12, file, 107, 9, 3772);
    			attr_dev(path13, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path13, "fill", "rgba(255,255,255,1)");
    			attr_dev(path13, "class", "svelte-10zfept");
    			add_location(path13, file, 107, 47, 3810);
    			attr_dev(svg6, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg6, "viewBox", "0 0 24 24");
    			attr_dev(svg6, "width", "18");
    			attr_dev(svg6, "height", "18");
    			attr_dev(svg6, "class", "svelte-10zfept");
    			add_location(svg6, file, 102, 6, 3643);
    			attr_dev(span6, "class", "svelte-10zfept");
    			add_location(span6, file, 112, 6, 4022);
    			attr_dev(div6, "class", "items-body-content svelte-10zfept");
    			add_location(div6, file, 99, 4, 3523);
    			attr_dev(path14, "fill", "none");
    			attr_dev(path14, "d", "M0 0h24v24H0z");
    			attr_dev(path14, "class", "svelte-10zfept");
    			add_location(path14, file, 123, 9, 4315);
    			attr_dev(path15, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path15, "fill", "rgba(255,255,255,1)");
    			attr_dev(path15, "class", "svelte-10zfept");
    			add_location(path15, file, 123, 47, 4353);
    			attr_dev(svg7, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg7, "viewBox", "0 0 24 24");
    			attr_dev(svg7, "width", "18");
    			attr_dev(svg7, "height", "18");
    			attr_dev(svg7, "class", "svelte-10zfept");
    			add_location(svg7, file, 118, 6, 4186);
    			attr_dev(span7, "class", "svelte-10zfept");
    			add_location(span7, file, 128, 6, 4565);
    			attr_dev(div7, "class", "items-body-content svelte-10zfept");
    			add_location(div7, file, 115, 4, 4061);
    			attr_dev(path16, "fill", "none");
    			attr_dev(path16, "d", "M0 0h24v24H0z");
    			attr_dev(path16, "class", "svelte-10zfept");
    			add_location(path16, file, 138, 9, 4853);
    			attr_dev(path17, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path17, "fill", "rgba(255,255,255,1)");
    			attr_dev(path17, "class", "svelte-10zfept");
    			add_location(path17, file, 138, 47, 4891);
    			attr_dev(svg8, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg8, "viewBox", "0 0 24 24");
    			attr_dev(svg8, "width", "18");
    			attr_dev(svg8, "height", "18");
    			attr_dev(svg8, "class", "svelte-10zfept");
    			add_location(svg8, file, 133, 6, 4724);
    			attr_dev(span8, "class", "svelte-10zfept");
    			add_location(span8, file, 143, 6, 5103);
    			attr_dev(div8, "class", "items-body-content svelte-10zfept");
    			add_location(div8, file, 130, 4, 4602);
    			attr_dev(path18, "fill", "none");
    			attr_dev(path18, "d", "M0 0h24v24H0z");
    			attr_dev(path18, "class", "svelte-10zfept");
    			add_location(path18, file, 154, 9, 5396);
    			attr_dev(path19, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path19, "fill", "rgba(255,255,255,1)");
    			attr_dev(path19, "class", "svelte-10zfept");
    			add_location(path19, file, 154, 47, 5434);
    			attr_dev(svg9, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg9, "viewBox", "0 0 24 24");
    			attr_dev(svg9, "width", "18");
    			attr_dev(svg9, "height", "18");
    			attr_dev(svg9, "class", "svelte-10zfept");
    			add_location(svg9, file, 149, 6, 5267);
    			attr_dev(span9, "class", "svelte-10zfept");
    			add_location(span9, file, 159, 6, 5646);
    			attr_dev(div9, "class", "items-body-content svelte-10zfept");
    			add_location(div9, file, 146, 4, 5146);
    			attr_dev(path20, "fill", "none");
    			attr_dev(path20, "d", "M0 0h24v24H0z");
    			attr_dev(path20, "class", "svelte-10zfept");
    			add_location(path20, file, 169, 9, 5933);
    			attr_dev(path21, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path21, "fill", "rgba(255,255,255,1)");
    			attr_dev(path21, "class", "svelte-10zfept");
    			add_location(path21, file, 169, 47, 5971);
    			attr_dev(svg10, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg10, "viewBox", "0 0 24 24");
    			attr_dev(svg10, "width", "18");
    			attr_dev(svg10, "height", "18");
    			attr_dev(svg10, "class", "svelte-10zfept");
    			add_location(svg10, file, 164, 6, 5804);
    			attr_dev(span10, "class", "svelte-10zfept");
    			add_location(span10, file, 174, 6, 6183);
    			attr_dev(div10, "class", "items-body-content svelte-10zfept");
    			add_location(div10, file, 161, 4, 5684);
    			attr_dev(path22, "fill", "none");
    			attr_dev(path22, "d", "M0 0h24v24H0z");
    			attr_dev(path22, "class", "svelte-10zfept");
    			add_location(path22, file, 184, 9, 6478);
    			attr_dev(path23, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path23, "fill", "rgba(255,255,255,1)");
    			attr_dev(path23, "class", "svelte-10zfept");
    			add_location(path23, file, 184, 47, 6516);
    			attr_dev(svg11, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg11, "viewBox", "0 0 24 24");
    			attr_dev(svg11, "width", "18");
    			attr_dev(svg11, "height", "18");
    			attr_dev(svg11, "class", "svelte-10zfept");
    			add_location(svg11, file, 179, 6, 6349);
    			attr_dev(span11, "class", "svelte-10zfept");
    			add_location(span11, file, 189, 6, 6728);
    			attr_dev(div11, "class", "items-body-content svelte-10zfept");
    			add_location(div11, file, 176, 4, 6230);
    			attr_dev(path24, "fill", "none");
    			attr_dev(path24, "d", "M0 0h24v24H0z");
    			attr_dev(path24, "class", "svelte-10zfept");
    			add_location(path24, file, 199, 9, 7010);
    			attr_dev(path25, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path25, "fill", "rgba(255,255,255,1)");
    			attr_dev(path25, "class", "svelte-10zfept");
    			add_location(path25, file, 199, 47, 7048);
    			attr_dev(svg12, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg12, "viewBox", "0 0 24 24");
    			attr_dev(svg12, "width", "18");
    			attr_dev(svg12, "height", "18");
    			attr_dev(svg12, "class", "svelte-10zfept");
    			add_location(svg12, file, 194, 6, 6881);
    			attr_dev(span12, "class", "svelte-10zfept");
    			add_location(span12, file, 204, 6, 7260);
    			attr_dev(div12, "class", "items-body-content svelte-10zfept");
    			add_location(div12, file, 191, 4, 6764);
    			attr_dev(path26, "fill", "none");
    			attr_dev(path26, "d", "M0 0h24v24H0z");
    			attr_dev(path26, "class", "svelte-10zfept");
    			add_location(path26, file, 214, 9, 7542);
    			attr_dev(path27, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path27, "fill", "rgba(255,255,255,1)");
    			attr_dev(path27, "class", "svelte-10zfept");
    			add_location(path27, file, 214, 47, 7580);
    			attr_dev(svg13, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg13, "viewBox", "0 0 24 24");
    			attr_dev(svg13, "width", "18");
    			attr_dev(svg13, "height", "18");
    			attr_dev(svg13, "class", "svelte-10zfept");
    			add_location(svg13, file, 209, 6, 7413);
    			attr_dev(span13, "class", "svelte-10zfept");
    			add_location(span13, file, 219, 6, 7792);
    			attr_dev(div13, "class", "items-body-content svelte-10zfept");
    			add_location(div13, file, 206, 4, 7294);
    			attr_dev(path28, "fill", "none");
    			attr_dev(path28, "d", "M0 0h24v24H0z");
    			attr_dev(path28, "class", "svelte-10zfept");
    			add_location(path28, file, 229, 9, 8089);
    			attr_dev(path29, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path29, "fill", "rgba(255,255,255,1)");
    			attr_dev(path29, "class", "svelte-10zfept");
    			add_location(path29, file, 229, 47, 8127);
    			attr_dev(svg14, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg14, "viewBox", "0 0 24 24");
    			attr_dev(svg14, "width", "18");
    			attr_dev(svg14, "height", "18");
    			attr_dev(svg14, "class", "svelte-10zfept");
    			add_location(svg14, file, 224, 6, 7960);
    			attr_dev(span14, "class", "svelte-10zfept");
    			add_location(span14, file, 234, 6, 8339);
    			attr_dev(div14, "class", "items-body-content svelte-10zfept");
    			add_location(div14, file, 221, 4, 7828);
    			attr_dev(path30, "fill", "none");
    			attr_dev(path30, "d", "M0 0h24v24H0z");
    			attr_dev(path30, "class", "svelte-10zfept");
    			add_location(path30, file, 244, 9, 8635);
    			attr_dev(path31, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path31, "fill", "rgba(255,255,255,1)");
    			attr_dev(path31, "class", "svelte-10zfept");
    			add_location(path31, file, 244, 47, 8673);
    			attr_dev(svg15, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg15, "viewBox", "0 0 24 24");
    			attr_dev(svg15, "width", "18");
    			attr_dev(svg15, "height", "18");
    			attr_dev(svg15, "class", "svelte-10zfept");
    			add_location(svg15, file, 239, 6, 8506);
    			attr_dev(span15, "class", "svelte-10zfept");
    			add_location(span15, file, 249, 6, 8885);
    			attr_dev(div15, "class", "items-body-content svelte-10zfept");
    			add_location(div15, file, 236, 4, 8376);
    			attr_dev(path32, "fill", "none");
    			attr_dev(path32, "d", "M0 0h24v24H0z");
    			attr_dev(path32, "class", "svelte-10zfept");
    			add_location(path32, file, 259, 9, 9190);
    			attr_dev(path33, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path33, "fill", "rgba(255,255,255,1)");
    			attr_dev(path33, "class", "svelte-10zfept");
    			add_location(path33, file, 259, 47, 9228);
    			attr_dev(svg16, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg16, "viewBox", "0 0 24 24");
    			attr_dev(svg16, "width", "18");
    			attr_dev(svg16, "height", "18");
    			attr_dev(svg16, "class", "svelte-10zfept");
    			add_location(svg16, file, 254, 6, 9061);
    			attr_dev(span16, "class", "svelte-10zfept");
    			add_location(span16, file, 264, 6, 9440);
    			attr_dev(div16, "class", "items-body-content svelte-10zfept");
    			add_location(div16, file, 251, 4, 8928);
    			attr_dev(path34, "fill", "none");
    			attr_dev(path34, "d", "M0 0h24v24H0z");
    			attr_dev(path34, "class", "svelte-10zfept");
    			add_location(path34, file, 274, 9, 9739);
    			attr_dev(path35, "d", "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm6 6V7h2v4h4v2h-4v4h-2v-4H7v-2h4z");
    			attr_dev(path35, "fill", "rgba(255,255,255,1)");
    			attr_dev(path35, "class", "svelte-10zfept");
    			add_location(path35, file, 274, 47, 9777);
    			attr_dev(svg17, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg17, "viewBox", "0 0 24 24");
    			attr_dev(svg17, "width", "18");
    			attr_dev(svg17, "height", "18");
    			attr_dev(svg17, "class", "svelte-10zfept");
    			add_location(svg17, file, 269, 6, 9610);
    			attr_dev(span17, "class", "svelte-10zfept");
    			add_location(span17, file, 279, 6, 9989);
    			attr_dev(div17, "class", "items-body-content svelte-10zfept");
    			add_location(div17, file, 266, 4, 9478);
    			attr_dev(div18, "class", "items-body svelte-10zfept");
    			add_location(div18, file, 6, 2, 125);
    			attr_dev(div19, "class", "svelte-10zfept");
    			add_location(div19, file, 4, 0, 91);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div19, anchor);
    			append_dev(div19, input);
    			append_dev(div19, t0);
    			append_dev(div19, div18);
    			append_dev(div18, div0);
    			append_dev(div0, svg0);
    			append_dev(svg0, path0);
    			append_dev(svg0, path1);
    			append_dev(div0, t1);
    			append_dev(div0, span0);
    			append_dev(div18, t3);
    			append_dev(div18, div1);
    			append_dev(div1, svg1);
    			append_dev(svg1, path2);
    			append_dev(svg1, path3);
    			append_dev(div1, t4);
    			append_dev(div1, span1);
    			append_dev(div18, t6);
    			append_dev(div18, div2);
    			append_dev(div2, svg2);
    			append_dev(svg2, path4);
    			append_dev(svg2, path5);
    			append_dev(div2, t7);
    			append_dev(div2, span2);
    			append_dev(div18, t9);
    			append_dev(div18, div3);
    			append_dev(div3, svg3);
    			append_dev(svg3, path6);
    			append_dev(svg3, path7);
    			append_dev(div3, t10);
    			append_dev(div3, span3);
    			append_dev(div18, t12);
    			append_dev(div18, div4);
    			append_dev(div4, svg4);
    			append_dev(svg4, path8);
    			append_dev(svg4, path9);
    			append_dev(div4, t13);
    			append_dev(div4, span4);
    			append_dev(div18, t15);
    			append_dev(div18, div5);
    			append_dev(div5, svg5);
    			append_dev(svg5, path10);
    			append_dev(svg5, path11);
    			append_dev(div5, t16);
    			append_dev(div5, span5);
    			append_dev(div18, t18);
    			append_dev(div18, div6);
    			append_dev(div6, svg6);
    			append_dev(svg6, path12);
    			append_dev(svg6, path13);
    			append_dev(div6, t19);
    			append_dev(div6, span6);
    			append_dev(div18, t21);
    			append_dev(div18, div7);
    			append_dev(div7, svg7);
    			append_dev(svg7, path14);
    			append_dev(svg7, path15);
    			append_dev(div7, t22);
    			append_dev(div7, span7);
    			append_dev(div18, t24);
    			append_dev(div18, div8);
    			append_dev(div8, svg8);
    			append_dev(svg8, path16);
    			append_dev(svg8, path17);
    			append_dev(div8, t25);
    			append_dev(div8, span8);
    			append_dev(div18, t27);
    			append_dev(div18, div9);
    			append_dev(div9, svg9);
    			append_dev(svg9, path18);
    			append_dev(svg9, path19);
    			append_dev(div9, t28);
    			append_dev(div9, span9);
    			append_dev(div18, t30);
    			append_dev(div18, div10);
    			append_dev(div10, svg10);
    			append_dev(svg10, path20);
    			append_dev(svg10, path21);
    			append_dev(div10, t31);
    			append_dev(div10, span10);
    			append_dev(div18, t33);
    			append_dev(div18, div11);
    			append_dev(div11, svg11);
    			append_dev(svg11, path22);
    			append_dev(svg11, path23);
    			append_dev(div11, t34);
    			append_dev(div11, span11);
    			append_dev(div18, t36);
    			append_dev(div18, div12);
    			append_dev(div12, svg12);
    			append_dev(svg12, path24);
    			append_dev(svg12, path25);
    			append_dev(div12, t37);
    			append_dev(div12, span12);
    			append_dev(div18, t39);
    			append_dev(div18, div13);
    			append_dev(div13, svg13);
    			append_dev(svg13, path26);
    			append_dev(svg13, path27);
    			append_dev(div13, t40);
    			append_dev(div13, span13);
    			append_dev(div18, t42);
    			append_dev(div18, div14);
    			append_dev(div14, svg14);
    			append_dev(svg14, path28);
    			append_dev(svg14, path29);
    			append_dev(div14, t43);
    			append_dev(div14, span14);
    			append_dev(div18, t45);
    			append_dev(div18, div15);
    			append_dev(div15, svg15);
    			append_dev(svg15, path30);
    			append_dev(svg15, path31);
    			append_dev(div15, t46);
    			append_dev(div15, span15);
    			append_dev(div18, t48);
    			append_dev(div18, div16);
    			append_dev(div16, svg16);
    			append_dev(svg16, path32);
    			append_dev(svg16, path33);
    			append_dev(div16, t49);
    			append_dev(div16, span16);
    			append_dev(div18, t51);
    			append_dev(div18, div17);
    			append_dev(div17, svg17);
    			append_dev(svg17, path34);
    			append_dev(svg17, path35);
    			append_dev(div17, t52);
    			append_dev(div17, span17);

    			if (!mounted) {
    				dispose = [
    					listen_dev(div0, "click", /*click_handler*/ ctx[0], false, false, false),
    					listen_dev(div1, "click", /*click_handler_1*/ ctx[1], false, false, false),
    					listen_dev(div2, "click", /*click_handler_2*/ ctx[2], false, false, false),
    					listen_dev(div3, "click", /*click_handler_3*/ ctx[3], false, false, false),
    					listen_dev(div4, "click", /*click_handler_4*/ ctx[4], false, false, false),
    					listen_dev(div5, "click", /*click_handler_5*/ ctx[5], false, false, false),
    					listen_dev(div6, "click", /*click_handler_6*/ ctx[6], false, false, false),
    					listen_dev(div7, "click", /*click_handler_7*/ ctx[7], false, false, false),
    					listen_dev(div8, "click", /*click_handler_8*/ ctx[8], false, false, false),
    					listen_dev(div9, "click", /*click_handler_9*/ ctx[9], false, false, false),
    					listen_dev(div10, "click", /*click_handler_10*/ ctx[10], false, false, false),
    					listen_dev(div11, "click", /*click_handler_11*/ ctx[11], false, false, false),
    					listen_dev(div12, "click", /*click_handler_12*/ ctx[12], false, false, false),
    					listen_dev(div13, "click", /*click_handler_13*/ ctx[13], false, false, false),
    					listen_dev(div14, "click", /*click_handler_14*/ ctx[14], false, false, false),
    					listen_dev(div15, "click", /*click_handler_15*/ ctx[15], false, false, false),
    					listen_dev(div16, "click", /*click_handler_16*/ ctx[16], false, false, false),
    					listen_dev(div17, "click", /*click_handler_17*/ ctx[17], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div19);
    			mounted = false;
    			run_all(dispose);
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

    function instance($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Sidebar", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => {
    		tsvscode.postMessage({ type: "all", value: "all" });
    	};

    	const click_handler_1 = () => {
    		tsvscode.postMessage({ type: "all", value: "buildings" });
    	};

    	const click_handler_2 = () => {
    		tsvscode.postMessage({ type: "all", value: "business" });
    	};

    	const click_handler_3 = () => {
    		tsvscode.postMessage({ type: "all", value: "Communication" });
    	};

    	const click_handler_4 = () => {
    		tsvscode.postMessage({ type: "all", value: "design" });
    	};

    	const click_handler_5 = () => {
    		tsvscode.postMessage({ type: "all", value: "development" });
    	};

    	const click_handler_6 = () => {
    		tsvscode.postMessage({ type: "all", value: "device" });
    	};

    	const click_handler_7 = () => {
    		tsvscode.postMessage({ type: "all", value: "editor" });
    	};

    	const click_handler_8 = () => {
    		tsvscode.postMessage({ type: "all", value: "document" });
    	};

    	const click_handler_9 = () => {
    		tsvscode.postMessage({ type: "all", value: "finance" });
    	};

    	const click_handler_10 = () => {
    		tsvscode.postMessage({ type: "all", value: "health" });
    	};

    	const click_handler_11 = () => {
    		tsvscode.postMessage({ type: "all", value: "logos" });
    	};

    	const click_handler_12 = () => {
    		tsvscode.postMessage({ type: "all", value: "map" });
    	};

    	const click_handler_13 = () => {
    		tsvscode.postMessage({ type: "all", value: "media" });
    	};

    	const click_handler_14 = () => {
    		tsvscode.postMessage({ type: "all", value: "media/icons/System" });
    	};

    	const click_handler_15 = () => {
    		tsvscode.postMessage({ type: "all", value: "media/icons/User" });
    	};

    	const click_handler_16 = () => {
    		tsvscode.postMessage({
    			type: "all",
    			value: "media/icons/Weather"
    		});
    	};

    	const click_handler_17 = () => {
    		tsvscode.postMessage({ type: "all", value: "media/icons/Others" });
    	};

    	return [
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		click_handler_5,
    		click_handler_6,
    		click_handler_7,
    		click_handler_8,
    		click_handler_9,
    		click_handler_10,
    		click_handler_11,
    		click_handler_12,
    		click_handler_13,
    		click_handler_14,
    		click_handler_15,
    		click_handler_16,
    		click_handler_17
    	];
    }

    class Sidebar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sidebar",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new Sidebar({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=Sidebar.js.map

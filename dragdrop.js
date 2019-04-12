import $ from 'sprint-js';

const utils = {
	throwError(msg) {
		throw `DragDrop Error: ${msg}`;
	},
	isString(str) {
		return typeof str === 'string';
	},
	isFunction(fn) {
		return typeof fn === 'function';
	},
	isArray(arr) {
		return Array.isArray(arr);
	},
	isPlainObject(obj) {
		const toString = Object.prototype.toString;
		return toString.call(obj) === '[object Object]';
	},
	capitalize(str) {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
};

let dragEl,
	$dragEl,
	parentEl,
	$parentEl,
	cloneEl,
	$cloneEl,
	rootEl,
	$rootEl,
	nextEl,
	$nextEl,
	oldIndex,
	newIndex,
	dragIns,
	dropIns,
	moved,
	dragRect,
	targetRect,
	lastMode,
	lastTarget;
const win = window,
	doc = win.document;

$(doc).on('dragover', function (evt) {
	if (!dragEl) return;

	let dragdrop = DragDrop.detectEmptyInstance(evt);
	dragdrop && dragdrop.onDragging(evt);
});

class DragDrop {
	constructor(...args) {
		this.checkDraggable();
		let opts = this.normalizeArgs(args);
		this.initEl(opts);
		this.options = this.mergeOptions(opts);
		this.transGroup();
		this.initEvents();
		DragDrop.instances.push(this);
	}

	checkDraggable() {
		const supportDraggable = 'draggable' in doc.createElement('div');
		if (!supportDraggable) {
			utils.throwError('Your browser doesn\'t support H5 Drag and Drop');
		}
	}

	normalizeArgs(args) {
		const len = args.length;
		const opts = Object.create(null);
		if (len === 0) {
			utils.throwError('requires at least one param');
		} else if (len === 1) {
			if (utils.isPlainObject(args[0])) {
				Object.assign(opts, args[0]);
			} else if (typeof args[0] === 'string') {
				opts.el = args[0];
			} else {
				utils.throwError('parameter type not available');
			}
		} else {
			if (typeof args[0] === 'string' || utils.isPlainObject(args[0])) {
				Object.assign(opts, args[1], {
					el: args[0]
				});
			} else {
				utils.throwError('parameter type not available');
			}
		}

		const el = $(opts.el).get(0);
		if (!el || el.nodeType !== 1) {
			utils.throwError('`el` matches no HTML Element');
		}

		opts.el = el;
		return opts;
	}

	initEl(opts) {
		this.el = opts.el;
		this.$el = $(opts.el);
		this.uid = `dd-${Date.now().toString(32)}`;
		this.$el.addClass(this.uid);
	}

	mergeOptions(opts) {
		const defaults = {
			group: null,
			sortable: true,
			disabled: false,
			draggable: `.${[].join.call(this.el.classList, '.')}>*`,
			ignore: 'a, img',
			chosenClass: 'sortable-chosen',
			ghostClass: 'sortable-ghost',
			dragClass: 'sortable-drag',
			setData(dataTransfer) {
				dataTransfer.setData('Text', $dragEl.textContent);
			},
			dragoverBubble: false,
			duration: 1000,
			easing: 'cubic-bezier(1, 0, 0, 1)',
			emptyInstanceThreshold: 10 // TODO: 内部范围阈值
		};

		for (let key in defaults) {
			(!opts[key]) && (opts[key] = defaults[key]);
		}

		return opts;
	}

	toDragFn(drag) {
		return function(to, from, dragEl, evt) {
			const toName = to.options.group.name;

			if (drag == null) {
				return true;  // defaults to true
			} else if (drag === false || drag === true || drag === 'clone') {
				return drag; // depends put drag when boolean or 'clone'
			} else if (utils.isString(drag)) {
				return drag === toName;
			} else if (utils.isArray(drag)) {
				return drag.includes(toName);
			} else if (utils.isFunction(drag)) {
				return toDragFn(value(to, from, dragEl, evt));
			} else {
				return false;
			}
		}
	}

	toDropFn(drop) {
		return function(to, from, dragEl, evt) {
			const toName = to.options.group.name;
			const fromName = from.options.group.name;
			const sameGroup = toName && fromName && toName === fromName;

			if (drop == null) {
				return sameGroup; // depends whether are same group
			} else if (drop === false || drop === true) {
				return drop; // depends put drop when boolean
			} else if (utils.isString(drop)) {
				return drop === fromName;
			} else if (utils.isArray(drop)) {
				return drop.includes(fromName);
			} else if (utils.isFunction(drop)) {
				return toDropFn(value(to, from, dragEl, evt));
			} else {
				return false;
			}
		}
	}
	
	transGroup() {
		const group = {};
		const options = this.options;
		let _group = options.group;

		if (utils.isPlainObject(_group)) {
			// do nothing here
		} else if (utils.isString(_group)) {
			_group = {
				name: _group
			};
		} else {
			_group = {};
		}

		group.name = _group.name;
		group.drag = _group.drag;
		group.drop = _group.drop;
		group.checkDrag = this.toDragFn(_group.drag);
		group.checkDrop = this.toDropFn(_group.drop);

		options.group = group;
	}

	initEvents() {
		const proto = Object.getPrototypeOf(this) || this.__proto__;
		Object.getOwnPropertyNames(proto).map(fn => { // ES6 prototype not enumerable
			if (fn.startsWith('_') && typeof proto[fn] === 'function') {
				this[fn.slice(1)] = proto[fn].bind(this);
			}
		});

		this.$el.on('mousedown', this.onSelect)
		.on('dragenter dragover', this.handleEvent);
	}

	_onSelect(evt) {
		const el = this.el;
		const $el = this.$el;
		const options =  this.options;
		const type = evt.type;
		let target = evt.target;

		// W3C Std: left/middle/right 0/1/2
		// IE9Less: left/middle/right 1/4/2
		if (options.disabled || evt.button !== 0) {
			return;
		}

		target = $(target).closest(options.draggable, el).get(0);
		if (!target) return;

		oldIndex = $(target).index();

		this.initDragStart(evt, target, oldIndex);
	}

	initDragStart(evt, target, oldIndex) {
		if (dragEl) return;

		const el = this.el;
		const options = this.options;
		const { ignore, chosenClass } = options;

		rootEl = el;
		dragEl = target;
		parentEl = dragEl.parentNode;
		nextEl = dragEl.nextElementSibling;
		$rootEl = $(rootEl);
		$dragEl = $(dragEl);
		$parentEl = $(parentEl);
		$nextEl = $(nextEl);

		this._lastX = evt.clientX;
		this._lastY = evt.clientY;
		
		$(dragEl).find(ignore).each((index, item) => {
			item.draggable = false;
		});

		this.$el.on('mouseup', this.onDrop);

		dragEl.draggable = true;
		$dragEl.addClass(chosenClass);

		this.dispatchEvent('choose', dragEl, rootEl, rootEl, evt, oldIndex);

		$dragEl.on('dragend', this.handleEvent);
		$rootEl.on('dragstart', this.onDragStart);
		$rootEl.on('drop', this.handleEvent);

		// clear selections
		if (win.getSelection) {
			win.getSelection().removeAllRanges();
		} else if (doc.selection) {
			doc.selection.empty();
		}
	}

	_handleEvent(evt) {
		switch (evt.type) {
			case 'drop':
			case 'dragend':
				this.onDrop(evt);
				break;
			case 'dragenter':
			case 'dragover':
				if (dragEl) {
					this.onDragging(evt);
					this.onGlobalDragging(evt);
				}
				break;
		}
	}

	dispatchEvent(name, dragEl, fromEl, toEl, evt, oldIndex, newIndex) {
		const options = this.options;
		const evtName = `on${utils.capitalize(name)}`;
		const evtHandler = options[evtName];
		let event;

		if (win.CustomEvent) {
			event = new CustomEvent(name, {
				bubbles: true,
				cancelable: true
			});
		} else {
			event = doc.createEvent('Event');
			event.initEvent(name, true, true);
		}

		event.from = fromEl;
		event.to = toEl;
		event.item = dragEl;
		event.event = evt;
		event.oldIndex = oldIndex;
		event.newIndex = newIndex;

		evtHandler && evtHandler.call(this, event);
	}

	_onMove(fromEl, toEl, dragEl, dragRect, targetEl, targetRect, evt) {
		const name = 'move';
		const options = this.options;
		const evtName = `on${utils.capitalize(name)}`;
		const evtHandler = options[evtName];

		if (win.CustomEvent) {
			event = new CustomEvent(name, {
				bubbles: true,
				cancelable: true
			});
		} else {
			event = doc.createEvent('Event');
			event.initEvent(name, true, true);
		}

		event.from = fromEl;
		event.to = toEl;
		event.dragged = dragEl;
		event.draggedRect = dragRect;
		event.related = targetEl || toEl;
		event.relatedRect = targetRect || DragDrop.getRect(toEl);
		event.event = evt;

		return evtHandler && evtHandler.call(this, event);
		// false: cancel
		// -1: insert before target
		// 1: insert after target
	}

	_onDragStart(evt) {
		const dataTransfer = evt.dataTransfer;
		const options = this.options;
		const { chosenClass, dragClass, ghostClass, setData } = options;

		$cloneEl = $dragEl.clone();
		$cloneEl.removeClass(chosenClass);
		cloneEl = $cloneEl.get(0);
		cloneEl.draggable = false;
		this.hideClone();

		$dragEl.addClass(dragClass).addClass(ghostClass);

		if (dataTransfer) {
			dataTransfer.effectAllowed = 'move';
			setData && setData.call(this, dataTransfer);
		}

		dragIns = this;

		this.dispatchEvent('start', dragEl, rootEl, rootEl, evt, oldIndex);
	}

	_onDragging(evt) {
		const el = this.el;
		const $el = this.$el;
		const options = this.options;
		const { sortable, group: dropGroup } = options;
		const { group: dragGroup } = dragIns.options;
		const emptyEl = $el.children().length === 0;
		const inSelf = dragIns === this;

		moved = true;

		let target = evt.target;

		if (!emptyEl) {
			target = $(target).closest(options.draggable, el).get(0);
		}

		const $target = $(target);
		if (!target || target === dragEl || target.animating) {
			return false;
		}

		dragRect = DragDrop.getRect(dragEl);

		function completed(insertion) {
			if (insertion) {
				if (this !== dropIns && this != dragIns) {
					dropIns = this;
				} else if (this === dragIns) {
					dropIns = null;
				}

				dragRect && this.animate(dragRect, dragEl);
				target && targetRect && this.animate(targetRect, target);
			}

			if ((target === dragEl && !dragEl.animating) || (target === el && !target.animating)) {
				lastTarget = null;
			}

			!options.dragoverBubble && evt.stopPropagation && evt.stopPropagation();
			return false;
		}

		const draggable = dragGroup.checkDrag(this, dragIns, dragEl, evt);
		const droppable = dropGroup.checkDrop(this, dragIns, dragEl, evt);

		if (inSelf && !sortable || draggable && droppable) {
			if (emptyEl) { // empty case
				lastTarget = el;
				targetRect = DragDrop.getRect(target);

				const moveVector = this.onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt);
				if (moveVector === false) return;

				if (inSelf) {
					dragIns.hideClone();
				} else {
					dragIns.showClone();
				}

				$dragEl.appendTo($target);

				parentEl = target;
				$parentEl = $(parentEl);

				this.dispatchEvent('change', dragEl, el, rootEl, evt, oldIndex, $dragEl.index());

				return completed.bind(this)(true);
			} else {
				const direction = this.getDirection($target);
				lastMode = 'insert';
				lastTarget = target;
				targetRect = DragDrop.getRect(target);

				const $nextEl = $target.next();
				const elChildren = $el.children().dom;
				const elLastChild = elChildren[elChildren.length - 1];
				let after = direction === 1;

				const moveVector = this.onMove(rootEl, el, dragEl, dragRect, target, targetRect, evt);
				if (moveVector === false) return;

				if (moveVector === 1) {
					after = true;
				} else if (moveVector === -1) {
					after = false;
				}

				if (inSelf) {
					dragIns.hideClone();
				} else {
					dragIns.showClone();
				}

				if (after) {
					if ($nextEl.length) {
						$dragEl.insertAfter($target);
					} else {
						$dragEl.appendTo($target.parent());
					}
				} else {
					$dragEl.insertBefore($target);
				}

				parentEl = target.parentNode;
				$parentEl = $(parentEl);

				this.dispatchEvent('change', dragEl, el, rootEl, evt, oldIndex, $dragEl.index());

				return completed.bind(this)(true);
			}
		}
	}

	_onGlobalDragging(evt) {
		evt.dataTransfer.dropEffect = 'move';
		evt.cancelable && evt.preventDefault();
	}

	_onDrop(evt) {
		if (!$dragEl) return;
		$dragEl.off('dragend', this.handleEvent);
		$rootEl.off('dragstart', this.onDragStart);
		$rootEl.off('drop', this.handleEvent);

		if (moved) {
			evt.cancelable && evt.preventDefault();
			evt.stopPropagation();
		}

		dragEl.draggable = false;
		$dragEl.removeClass(this.options.chosenClass);

		if (dragIns) {
			const { dragClass, ghostClass } = dragIns.options;
			$dragEl.removeClass(dragClass).removeClass(ghostClass);
		}

		this.dispatchEvent('unchoose', dragEl, rootEl, parentEl, evt, oldIndex);

		if (rootEl !== parentEl) {
			newIndex = $dragEl.index();
			this.dispatchEvent('add', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
			this.dispatchEvent('remove', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
		} else {
			if (dragEl.nextSibling !== nextEl) {
				newIndex = $dragEl.index();
				this.dispatchEvent('update', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
				this.dispatchEvent('sort', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
			}
		}

		if (dragIns) {
			newIndex = newIndex || oldIndex;
			this.dispatchEvent('end', dragEl, rootEl, parentEl, evt, oldIndex, newIndex);
		}

		this.reset();
	}

	reset() {
		dragEl =
		$dragEl =
		parentEl =
		$parentEl =
		cloneEl =
		$cloneEl =
		rootEl =
		$rootEl =
		nextEl =
		$nextEl =
		oldIndex =
		newIndex =
		dragIns =
		dropIns =
		moved =
		dragRect =
		targetRect =
		lastMode =
		lastTarget = null;
	}

	getDirection($target) {
		const dragElIndex = $dragEl.index();
		const targetIndex = $target.index();

		if (dragElIndex < targetIndex) {
			return 1;
		} else {
			return -1;
		}
	}

	animate(prevRect, target) {
		let { duration, easing } = this.options;

		if (!duration) return;

		let { top: pTop, left: pLeft, height: pHeight, width: pWidth } = prevRect,
			$target = $(target),
			currRect = DragDrop.getRect(target),
			{ top: cTop, left: cLeft, height: cHeight, width: cWidth } = currRect;

		// center point changed vertical or horizontal
		if ((pTop + pHeight / 2) !== (cTop + cHeight / 2) ||
			(pLeft + pWidth / 2) !== (cLeft + cWidth / 2)) {
			let matrix = DragDrop.matrix(this.el),
				{a: scaleX = 1, d: scaleY = 1} = matrix,
				pTransform = `translate3d(${(pLeft - cLeft) / scaleX}px, ${(pTop - cTop) / scaleY}px, 0)`,
				cTransform = 'translate3d(0, 0, 0)',
				transition = `transform ${duration}ms ${easing}`;

			$target.css('transition', 'none') // reset transition
			.css('transform', pTransform); // set to prev position

			target.offsetWidth; // trigger repaint

			$target.css('transition', transition) // set transition
			.css('transform', cTransform); // set to current position
		}

		target.animating && clearTimeout(target.animating);
		target.animating = setTimeout(() => {
			$target.css({
				transition: '',
				transform: ''
			});
			target.animating = null;
		}, duration);
	}

	hideClone() {
		$cloneEl.css('display', 'none');
	}

	showClone() {
		if (dragIns && dragIns.options.group.drag !== 'clone') {
			return;
		}

		if ($nextEl.length) {
			$cloneEl.insertBefore($nextEl);
		} else {
			$cloneEl.appendTo($parentEl);
		}
		
		$cloneEl.css('display', '');
	}

	static getRect(el) {
		let top, left, bottom, right, height, width;

		// 'getBoundingClientRect' in window/document === false
		if (el === win || el === doc) {
			top = 0;
			left = 0;
			height = bottom = win.innerHeight;
			width = right = win.innerWidth;
			return { top, left, bottom, right, height, width };
		}

		return el.getBoundingClientRect();
	}

	static matrix(el) {
		let appliedTransforms = '';

		do {
			let transform = $(el).css('transform');
			if (transform && transform !== 'none') {
				appliedTransforms = transform + ' ' + appliedTransforms;
			}
		} while (el = el.parentNode);

		if (win.DOMMatrix) {
			return new DOMMatrix(appliedTransforms);
		} else if (win.WebKitCSSMatrix) {
			return new WebKitCSSMatrix(appliedTransforms);
		} else if (win.CSSMatrix) {
			return new CSSMatrix(appliedTransforms);
		}
	}

	static instances = [] // store all DragDrop instances

	static detectEmptyInstance(evt) { // detect neareast empty instance
		let { clientX, clientY } = evt,
			inss = this.instances,
			len = inss.length;

		for (let i = 0; i < len; i++) {
			let ins = inss[i],
				el = ins.el,
				$el = ins.$el;

			if ($el.children().length > 0) continue;

			let { top, left, bottom, right } = this.getRect(el);
			let threshold = ins.options.emptyInstanceThreshold;

			let verInside = clientY >= (top - threshold) && clientY <= (bottom + threshold);
			let horInside = clientX >= (left - threshold) && clientX <= (right + threshold);

			if (verInside && horInside) {
				return ins;
			}
		}
	}
}

export default DragDrop;

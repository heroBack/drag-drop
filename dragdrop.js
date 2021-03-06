/**
 * @version 1.0.0
 * @author Jordan Wang
 * @repository https://github.com/mingmingwon/drag-drop
 * @license MIT
 */

import $ from 'sprint-js';
import util from './util';

let fromEl,
    $fromEl,
    toEl,
    $toEl,
    dragEl,
    $dragEl,
    cloneEl,
    $cloneEl,
    nextEl,
    $nextEl,
    targetEl,
    $targetEl,
    oldIndex,
    newIndex,
    dragIns,
    dropIns,
    moved,
    dragRect,
    targetRect;
let docDragOverInit = false,
    docDragOverEvent = function (evt) {
        if (!dragEl) return;
        let dragdrop = DragDrop.detectEmptyInstance(evt);
        dragdrop && dragdrop.onDragging(evt);
    };
const win = window,
    doc = win.document,
    $doc = $(doc),
    supportPointer = 'PointerEvent' in win;

class DragDrop {
    constructor(...args) {
        this.checkDraggable();

        let opts = this.normalizeArgs(args);
        this.options = this.mergeOptions(opts);

        this.initEl();
        this.initGroup();
        this.initEvents();

        this.index = DragDrop.instances.push(this) - 1;
    }

    checkDraggable() {
        let supportDraggable = 'draggable' in doc.createElement('div');

        if (!supportDraggable) {
            util.throwError('browser doesn\'t support HTML5 Drag and Drop!');
        }
    }

    normalizeArgs(args) {
        let len = args.length;
        let opts = util.createObj();

        if (len === 0) {
            util.throwError('requires at least one parameter');
        } else if (len === 1) {
            if (util.isPlainObject(args[0])) {
                util.assign(opts, args[0]);
            } else {
                opts.el = args[0];
            }
        } else {
            if (util.isPlainObject(args[1])) {
                util.assign(opts, args[1], {
                    el: args[0]
                });
            } else {
                util.throwError('`options` parameter invalid');
            }
        }

        let el = opts.el;
        if (!util.isString(el) && !util.isHtmlElement(el)) {
            util.throwError('`el` parameter invalid');
        }

        el = $(el).get(0);
        if (!el || el.nodeType !== 1) {
            util.throwError('`el` matches no HTML Element');
        }

        opts.el = el;
        return opts;
    }

    mergeOptions(opts) {
        let defaults = {
            iden: 'dd-id',
            group: null,
            clone: false,
            sortable: true,
            disabled: false,
            draggable(iden) {
                return `[${this.iden}="${iden}"]>*`;
            },
            filter: null,
            handle: null,
            exceptEl: 'a, img', // should be changed to undraggable
            chosenClass: 'dd-chosen',
            ghostClass: 'dd-ghost',
            dragClass: 'dd-drag',
            fromClass: 'dd-from',
            toClass: 'dd-to',
            direction: 'vertical',
            setData(dataTransfer) {
                dataTransfer.setData('Text', $dragEl.textContent);
            },
            duration: 100, // ms
            easing: 'cubic-bezier(1, 0, 0, 1)',
            emptyInstanceThreshold: 10 // px
        };

        for (let key in defaults) {
            !(key in opts) && (opts[key] = defaults[key]);
        }

        // special meaning for `>*` 
        if (opts.draggable === '>*') {
            opts.draggable = defaults.draggable;
        }

        return opts;
    }

    initEl() {
        let options = this.options;
        let {el, iden, draggable } = options;

        this.el = el;
        this.$el = $(el);
        this.iden = util.rndStr();
        this.$el.attr(iden, this.iden);

        if (util.isFunction(draggable)) {
            options.draggable = options.draggable(this.iden); 
        }
    }

    initGroup() {
        let group = util.createObj(),
            options = this.options,
            _group = options.group,
            toCheckDrag = drag => (from, to, dragEl, evt) => {
                let toName = to.options.group.name;

                if (drag == null) {
                    return true;  // default to true
                } else if (drag === false || drag === true) {
                    return drag;
                } else if (util.isString(drag)) {
                    return drag === toName;
                } else if (util.isArray(drag)) {
                    return drag.includes(toName);
                } else if (util.isFunction(drag)) {
                    return toCheckDrag(drag(from, to, dragEl, evt))(from, to, dragEl, evt);
                } else {
                    return false;
                }
            },
            toCheckDrop = drop => (from, to, dragEl, evt) => {
                let fromName = from.options.group.name,
                    toName = to.options.group.name,
                    sameGroup = fromName && toName && fromName === toName;

                if (drop == null) {
                    return sameGroup; // depends whether are same group
                } else if (drop === false || drop === true) {
                    return drop;
                } else if (util.isString(drop)) {
                    return drop === fromName;
                } else if (util.isArray(drop)) {
                    return drop.includes(fromName);
                } else if (util.isFunction(drop)) {
                    return toCheckDrop(drop(from, to, dragEl, evt))(from, to, dragEl, evt);
                } else {
                    return false;
                }
            };

        if (util.isPlainObject(_group)) {
            // do nothing here
        } else if (util.isString(_group)) {
            _group = {
                name: _group
            };
        } else {
            _group = {};
        }

        group.name = _group.name;
        group.drag = _group.drag;
        group.drop = _group.drop;
        group.checkDrag = toCheckDrag(_group.drag);
        group.checkDrop = toCheckDrop(_group.drop);

        options.group = group;
    }

    initEvents() {
        let proto = Object.getPrototypeOf(this);
        Object.getOwnPropertyNames(proto).map(fn => { // ES6 Class prototype not enumerable
            if (fn.startsWith('_') && util.isFunction(proto[fn])) {
                this[fn.slice(1)] = proto[fn].bind(this); // `this` => instance, and able to off event
            }
        });

        let $el = this.$el;
        if (supportPointer) {
            $el.on('pointerdown', this.onSelect);
        } else {
            $el.on('mousedown', this.onSelect);
        }
        $el.on('dragenter dragover', this.handleEvent);

        if (docDragOverInit) return; // enure just one event binded
        $doc.on('dragover', docDragOverEvent);
        docDragOverInit = true;
    }

    _onSelect(evt) {
        let el = this.el;
        let $el = this.$el;
        let options =  this.options;
        let { disabled, draggable, filter, handle } = options;
        let { type, target: _target, button } = evt; // keep original as _target

        // W3C Standard: left/middle/right 0/1/2
        // IE9Less: left/middle/right 1/4/2
        if (disabled || button !== 0) {
            return;
        }

        if (_target.isContentEditable) {
            return;
        }

        let target = $(_target).closest(draggable, el).get(0);
        if (!target) return;
        if (target.parentNode !== el) return; // Only children draggable

        if (util.isFunction(filter)) {
            if (filter.call(this, evt, _target, target)) {
                evt.preventDefault();
                return;
            }
        } else if (util.isString(filter)) {
            let match = filter.split(/,\s*/).some(sel => {
                return $(_target).closest(sel, el).get(0);
            });

            if (match) {
                evt.preventDefault();
                return;
            }
        }

        if (handle && !$(_target).closest(handle, el).get(0)) {
            return;
        }

        oldIndex = $(target).index(draggable); // unmatch: -1

        this.initDragStart(evt, target, oldIndex);
    }

    initDragStart(evt, target, oldIndex) {
        if (dragEl) return;

        let el = this.el,
            $el = this.$el,
            options = this.options,
            { exceptEl, chosenClass } = options;

        fromEl = el;
        $fromEl = $el;
        dragEl = target;
        $dragEl = $(dragEl);
        nextEl = target.nextElementSibling;
        $nextEl = $(nextEl);
        
        $dragEl.find(exceptEl).each((index, item) => {
            item.draggable = false;
        });

        if (supportPointer) {
            $fromEl.on('pointerup', this.onDrop);
        } else {
            $fromEl.on('mouseup', this.onDrop);
        }

        dragEl.draggable = true;
        $dragEl.addClass(chosenClass);

        this.dispatchEvent('choose', dragEl, fromEl, fromEl, evt, oldIndex);

        $dragEl.on('dragend', this.handleEvent); // dragend event on dragEl

        $fromEl.on('dragstart', this.onDragStart); // drop event on fromEl
        $fromEl.on('drop', this.handleEvent);

        // clear selections before dragstart
        if (win.getSelection) {
            win.getSelection().removeAllRanges();
        } else if (doc.selection) {
            doc.selection.empty();
        }
    }

    _onDragStart(evt) {
        let { clone, chosenClass, dragClass, fromClass } = this.options;

        if (clone) {
            cloneEl = dragEl.cloneNode(true);
            $cloneEl = $(cloneEl).removeAttr('draggable').removeClass(chosenClass);
            this.hideClone();
        }

        $dragEl.addClass(dragClass);
        $fromEl.addClass(fromClass);
        setTimeout(this.onDragStarted, 0, evt);
    }

    _onDragStarted(evt) {
        let { dragClass, ghostClass, setData } = this.options,
            dataTransfer = evt.dataTransfer;

        $dragEl.removeClass(dragClass).addClass(ghostClass);

        dataTransfer.effectAllowed = 'move';
        setData && setData.call(this, dataTransfer, dragEl);

        dragIns = this;

        this.dispatchEvent('start', dragEl, fromEl, fromEl, evt, oldIndex);
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
        let options = this.options,
            evtName = `on${util.capitalize(name)}`,
            evtHandler = options[evtName],
            _evt = util.createEvent(name);

        _evt.from = fromEl;
        _evt.to = toEl;
        _evt.item = dragEl;
        _evt.oldIndex = oldIndex;
        _evt.newIndex = newIndex;
        _evt.evt = evt;

        evtHandler && evtHandler.call(this, _evt);
    }

    _onMove(fromEl, toEl, dragEl, dragRect, targetEl, targetRect, evt) {
        let options = this.options,
            evtHandler = options.onMove,
            _evt = util.createEvent('move');

        _evt.from = fromEl;
        _evt.to = toEl;
        _evt.dragged = dragEl;
        _evt.draggedRect = dragRect;
        _evt.related = targetEl || toEl;
        _evt.relatedRect = targetRect || DragDrop.getRect(toEl);
        _evt.evt = evt;

        return evtHandler && evtHandler.call(this, _evt);
        // false: cancel
        // -1: insert before target
        // 1: insert after target
    }

    _onDragging(evt) {
        let el = this.el,
            $el = this.$el,
            options = this.options,
            { draggable, sortable, group: dropGroup, toClass } = options,
            { clone, group: dragGroup } = dragIns.options,
            emptyEl = $el.children().length === 0,
            inSelf = dragIns === this,
            _target = evt.target,
            target;

        moved = true;

        if (!emptyEl) {
            target = $(_target).closest(draggable, el).get(0);
        } else {
            target = _target;
        }

        if (!target || target === dragEl || target.animating) {
            return false;
        }

        dropIns = this;
        targetEl = target;
        $targetEl = $(target);
        dragRect = DragDrop.getRect(dragEl);

        let allowDrag = dragGroup.checkDrag(dragIns, this, dragEl, evt),
            allowDrop = dropGroup.checkDrop(dragIns, this, dragEl, evt);

        if (inSelf && sortable || (!inSelf && allowDrag && allowDrop)) {
            $el.addClass(toClass);
            if (inSelf) {
                $toEl && $toEl !== $fromEl && $toEl.removeClass(toClass);
            } else {
                $fromEl.removeClass(toClass);
            }

            toEl = el;
            $toEl = $el;
            if (emptyEl) { // empty case
                targetRect = DragDrop.getRect(targetEl);

                let move = this.onMove(fromEl, el, dragEl, dragRect, targetEl, targetRect, evt);
                if (move === false) return;

                clone && (inSelf ? dragIns.hideClone() : dragIns.showClone());

                $dragEl.appendTo($el);
                newIndex = $dragEl.index();

                this.dispatchEvent('change', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            } else {
                targetRect = DragDrop.getRect(targetEl);

                let direction = this.getDirection(evt),
                    after = direction === 1,
                    move = this.onMove(fromEl, toEl, dragEl, dragRect, targetEl, targetRect, evt);
                if (move === false) return;

                if (move === 1) {
                    after = true;
                } else if (move === -1) {
                    after = false;
                }

                clone && (inSelf ? dragIns.hideClone() : dragIns.showClone());

                if (after) {
                    if ($targetEl.next().length) {
                        $dragEl.insertAfter($targetEl);
                    } else {
                        $dragEl.appendTo($toEl);
                    }
                } else {
                    $dragEl.insertBefore($targetEl);
                }

                newIndex = $dragEl.index();

                this.dispatchEvent('change', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            }

            this.animate(dragRect, dragEl);
            this.animate(targetRect, targetEl);

            evt.stopPropagation();
        }
    }

    _onGlobalDragging(evt) {
        evt.dataTransfer.dropEffect = 'move';
        evt.preventDefault();
    }

    _onDrop(evt) {
        if (!dragEl) return;

        $dragEl.off('dragend', this.handleEvent);
        $fromEl.off('dragstart', this.onDragStart);
        $fromEl.off('drop', this.handleEvent);

        if (supportPointer) {
            $fromEl.off('pointerup', this.onDrop);
        } else {
            $fromEl.off('mouseup', this.onDrop);
        }

        if (moved) {
            evt.preventDefault();
            evt.stopPropagation();
        }

        $dragEl.removeAttr('draggable').removeClass(this.options.chosenClass);
        if (dragIns) {
            let { ghostClass, fromClass, toClass } = dragIns.options;
            $dragEl.removeClass(ghostClass);
            $fromEl.removeClass(`${fromClass} ${toClass}`);
        }
        if (dropIns) {
            $toEl.removeClass(dropIns.options.toClass);
        }
        
        this.dispatchEvent('unchoose', dragEl, fromEl, toEl, evt, oldIndex, newIndex);

        if (fromEl !== toEl) {
            dropIns && dropIns.dispatchEvent('add', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            this.dispatchEvent('remove', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
        } else if (newIndex !== oldIndex) {
            this.dispatchEvent('update', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
            this.dispatchEvent('sort', dragEl, fromEl, toEl, evt, oldIndex, newIndex);
        }

        this.dispatchEvent('end', dragEl, fromEl, toEl, evt, oldIndex, newIndex || oldIndex);
        this.reset();
    }

    destroy() {
        let el = this.el,
            $el = this.$el;

        this.onDrop();

        if (supportPointer) {
            $el.off('pointerdown', this.onSelect);
        } else {
            $el.off('mousedown', this.onSelect);
        }
        $el.off('dragenter dragover', this.handleEvent);

        DragDrop.instances.splice(this.index, 1);
        if (!DragDrop.instances.length) {
            $doc.off('dragover', docDragOverEvent);
            docDragOverInit = false;
        }
    }

    reset() {
        fromEl =
        $fromEl =
        toEl =
        $toEl =
        dragEl =
        $dragEl =
        cloneEl =
        $cloneEl =
        nextEl =
        $nextEl =
        targetEl =
        $targetEl =
        oldIndex =
        newIndex =
        dragIns =
        dropIns =
        moved =
        dragRect =
        targetRect = null;
    }

    detectDirection(el) {
        let display = el.css('display');
        if (display === 'flex') {
            let flexDirection = el.css('flex-direction');
            return flexDirection.startsWith('column') ? 'vertical' : 'horizontal';
        }

        let first = el.children().get(0),
            $first = $(first),
            second = el.children().eq(1),
            $second = $(second);

        if (first) {
            let firstFloat = $first.css('float'),
                firstDisplay = $first.css('display');
            if (firstFloat !== 'none') {
                if (second) {
                    let secondClear = $second.css('clear');
                    return secondClear === 'both' || secondClear === firstFloat ? 'vertical' : 'horizontal';
                } else {
                    return 'horizontal';
                }
            } else {
                if (firstDisplay === 'block' || firstDisplay === 'flex' || firstDisplay === 'table') {
                    return 'vertical';
                } else {
                    return 'horizontal';
                }
            }
        } else {
            return 'horizontal';
        }
    }

    getDirection(evt) {
        let direction = dropIns.options.direction;
        let { top, left, bottom, right } = DragDrop.getRect(targetEl);
        let { pageX, pageY } = evt;

        if (direction === 'vertical') {
            return bottom - pageY <= pageY - top ? 1 : -1;
        } else if (direction === 'horizontal') {
            return right - pageX <= pageX - left ? 1 : -1;
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
        if ($nextEl.length) {
            $cloneEl.insertBefore($nextEl);
        } else {
            $cloneEl.appendTo($fromEl);
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

    static create(...args) {
        return new this(...args);
    }

    static version = '1.0.0'
}

export default DragDrop;

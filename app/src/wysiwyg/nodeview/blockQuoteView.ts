import { EditorView, NodeView } from 'prosemirror-view';
import { ProsemirrorNode } from 'prosemirror-model';

import isFunction from 'tui-code-snippet/type/isFunction';
import css from 'tui-code-snippet/domUtil/css';

import { setAttributes } from '@/utils/dom';
import { getCustomAttrs } from '@/wysiwyg/helper/node';

import { Emitter } from '@t/event';

type GetPos = (() => number) | boolean;

type InputPos = {
  top: number;
  right: number;
};

const WRAPPER_CLASS_NAME = 'toastui-editor-ww-block-quote';
const BLOCK_QUOTE_TYPE_CLASS_NAME = 'toastui-editor-ww-block-quote-type';

const BLOCK_QUOTE_TYPES = ['default', 'danger', 'info', 'warning', 'success'];

export class BlockQuoteView implements NodeView {
  dom!: HTMLElement;

  contentDOM: HTMLElement | null = null;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  private eventEmitter: Emitter;

  private select: HTMLElement | null = null;

  private timer: NodeJS.Timeout | null = null;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos, eventEmitter: Emitter) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.eventEmitter = eventEmitter;

    this.createElement();
    this.bindDOMEvent();
    this.bindEvent();
  }

  private createElement() {
    const { bqType } = this.node.attrs;
    const wrapper = document.createElement('div');

    wrapper.setAttribute('data-block-quote-type', bqType || 'default');
    wrapper.className = WRAPPER_CLASS_NAME;

    const blockquote = this.createBlockQuoteElement();

    wrapper.appendChild(blockquote);

    this.dom = wrapper;
    this.contentDOM = blockquote;
  }

  private createBlockQuoteElement() {
    const blockquote = document.createElement('blockquote');
    const { bqType } = this.node.attrs;
    const attrs = getCustomAttrs(this.node.attrs);

    blockquote.setAttribute('data-block-quote-type', bqType || 'default');
    setAttributes(attrs, blockquote);

    return blockquote;
  }

  private createTypeEditor({ top, right }: InputPos) {
    const wrapper = document.createElement('div');

    wrapper.className = BLOCK_QUOTE_TYPE_CLASS_NAME;

    BLOCK_QUOTE_TYPES.forEach((type) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.value = type;
      button.textContent = type.charAt(0).toUpperCase() + type.slice(1);

      if (type === this.node.attrs.bqType) {
        button.classList.add('active');
      }

      button.addEventListener('click', () => {
        this.changeTypeWithValue(type);
      });

      wrapper.appendChild(button);
    });

    // Temporarily add to DOM to measure dimensions
    wrapper.style.visibility = 'hidden';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '-9999px';
    this.view.dom.parentElement!.appendChild(wrapper);

    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;    // Get viewport and container dimensions
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const containerRect = this.view.dom.parentElement!.getBoundingClientRect();

    // Find mode switch element and get its height
    const editorContainer = this.view.dom.closest('.toastui-editor-defaultUI');
    const modeSwitch = editorContainer?.querySelector('.toastui-editor-mode-switch');
    const modeSwitchHeight = modeSwitch ? modeSwitch.getBoundingClientRect().height : 28; // fallback to 28px

    // Calculate available space considering mode switch
    const effectiveViewportBottom = viewportHeight - modeSwitchHeight - 10; // 10px padding

    // Calculate optimal position
    let adjustedTop = top - 10;
    let adjustedLeft = right - wrapperWidth - 5;

    // Check bottom boundary - ensure dropdown doesn't overlap with mode switch
    const dropdownBottom = top + wrapperHeight;
    if (dropdownBottom > effectiveViewportBottom) {
      // Show above the element instead
      adjustedTop = top - wrapperHeight - 10;
    }

    // Check top boundary - ensure dropdown doesn't go above container
    const minTop = containerRect.top + 10;
    if (adjustedTop < minTop) {
      // If showing above would go too high, find best position
      const spaceAbove = top - containerRect.top;
      const spaceBelow = effectiveViewportBottom - top;

      if (spaceBelow >= wrapperHeight + 20) {
        // Use below if there's enough space
        adjustedTop = top + 10;
      } else if (spaceAbove >= wrapperHeight + 20) {
        // Use above if there's enough space
        adjustedTop = top - wrapperHeight - 10;
      } else {
        // Use the larger space and clip if necessary
        if (spaceBelow > spaceAbove) {
          adjustedTop = top + 10;
        } else {
          adjustedTop = Math.max(minTop, top - wrapperHeight - 10);
        }
      }
    }

    // Check right boundary - ensure dropdown doesn't go off-screen to the left
    if (adjustedLeft < 10) {
      adjustedLeft = 10;
    }

    // Check left boundary - ensure dropdown doesn't go off-screen to the right
    if (adjustedLeft + wrapperWidth > viewportWidth - 10) {
      adjustedLeft = viewportWidth - wrapperWidth - 10;
    }

    // Apply final positioning
    css(wrapper, {
      visibility: 'visible',
      position: 'fixed',
      top: `${adjustedTop}px`,
      left: `${adjustedLeft}px`,
      right: 'unset',
    });

    this.select = wrapper;

    // Close dropdown when clicking outside
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 0);
  }

  private bindDOMEvent() {
    if (this.dom) {
      this.dom.addEventListener('click', this.handleMousedown);
    }
  }

  private bindEvent() {
    this.eventEmitter.listen('scroll', () => {
      if (this.select) {
        this.reset();
      }
    });
  }

  private handleMousedown = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;

    // Only show type selector if clicking on the wrapper itself, not on content
    if (target === this.dom || target === this.contentDOM) {
      if (this.select) {
        this.reset();
        return;
      }

      if (isFunction(this.getPos)) {
        const { top, right } = this.view.coordsAtPos(this.getPos());

        this.createTypeEditor({ top, right });
      }

      ev.preventDefault();
      ev.stopPropagation();
    }
  };

  private handleOutsideClick = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;

    if (this.select && !this.select.contains(target)) {
      this.reset();
    }
  };

  private changeTypeWithValue(type: string) {
    if (isFunction(this.getPos)) {
      this.reset();

      const pos = this.getPos();

      if (typeof pos === 'number') {
        const { tr } = this.view.state;
        const node = this.view.state.doc.nodeAt(pos);

        if (node && node.type.name === 'blockQuote') {
          // Use setNodeAttribute to preserve content and only change the attribute
          tr.setNodeMarkup(pos, null, { bqType: type });
          this.view.dispatch(tr);
        }
      }
    }
  }

  private reset() {
    this.select?.remove();
    this.select = null;

    document.removeEventListener('click', this.handleOutsideClick);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  stopEvent(event: Event) {
    // Only stop click events to prevent interference with editing
    if (event.type === 'click' && event.target === this.dom) {
      return true;
    }

    return false;
  }

  update(node: ProsemirrorNode) {
    if (!node.sameMarkup(this.node)) {
      return false;
    }

    this.node = node;

    // Update the data attributes when the node updates
    const { bqType } = node.attrs;

    this.dom.setAttribute('data-block-quote-type', bqType || 'default');
    if (this.contentDOM) {
      this.contentDOM.setAttribute('data-block-quote-type', bqType || 'default');
    }

    return true;
  }

  destroy() {
    this.reset();
    this.clearTimer();

    if (this.dom) {
      this.dom.removeEventListener('click', this.handleMousedown);
    }
  }
}

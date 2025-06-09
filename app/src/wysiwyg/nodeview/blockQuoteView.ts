import { EditorView, NodeView } from 'prosemirror-view';
import { ProsemirrorNode } from 'prosemirror-model';

import isFunction from 'tui-code-snippet/type/isFunction';
import css from 'tui-code-snippet/domUtil/css';

import { removeNode, setAttributes } from '@/utils/dom';
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

    this.view.dom.parentElement!.appendChild(wrapper);

    const wrapperWidth = wrapper.clientWidth;

    css(wrapper, {
      top: `${top + 10}px`,
      left: `${right - wrapperWidth - 10}px`,
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

        console.log(node);

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
    // if (this.select?.parentElement) {
    //   const parent = this.select.parentElement;

    //   this.select = null;
    //   removeNode(parent);
    // } else if (this.select) {
    //   removeNode(this.select);
    //   this.select = null;
    // }

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

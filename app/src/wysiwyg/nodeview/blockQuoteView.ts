import { EditorView, NodeView } from 'prosemirror-view';
import { ProsemirrorNode } from 'prosemirror-model';

import isFunction from 'tui-code-snippet/type/isFunction';
import css from 'tui-code-snippet/domUtil/css';

import { cls, setAttributes } from '@/utils/dom';
import { getCustomAttrs } from '@/wysiwyg/helper/node';

import { Emitter } from '@t/event';

type GetPos = (() => number) | boolean;

type InputPos = {
  top: number;
  right: number;
};

const WRAPPER_CLASS_NAME = cls('ww-block-quote');
const BLOCK_QUOTE_TYPE_CLASS_NAME = cls('ww-block-quote-type');

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
  protected editPanelContainer = document.querySelector(".toastui-edit-panel-container") as HTMLElement;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos, eventEmitter: Emitter) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.eventEmitter = eventEmitter;

    this.createElement();
    this.bindDOMEvent();
    this.bindEvent();
    
    // Initialize editPanelContainer when DOM is ready
    this.eventEmitter.listen('loadUI', () => {
      this.editPanelContainer = this.view.dom.closest(`.${cls('container')}`)!.querySelector('.toastui-edit-panel-container') as HTMLElement;
    });
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

    // Temporarily add to editPanelContainer to measure dimensions
    wrapper.style.visibility = 'hidden';
    wrapper.style.position = 'absolute';
    wrapper.style.top = '-9999px';
    this.editPanelContainer.appendChild(wrapper);

    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;

    // Get container and editor dimensions relative to editPanelContainer
    const containerRect = this.editPanelContainer.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();

    // Convert viewport coordinates to editPanelContainer relative coordinates
    const relativeTop = top - containerRect.top;
    const relativeRight = right - containerRect.left;

    // Find mode switch element and get its height relative to container
    const modeSwitch = this.view.dom.closest(`.${cls('container')}`)!.querySelector(`.${cls('mode-switch')}`) as HTMLElement;
    let bottomBoundary = containerRect.height;
    if (modeSwitch) {
      const modeSwitchRect = modeSwitch.getBoundingClientRect();
      bottomBoundary = modeSwitchRect.top - containerRect.top - 10; // 10px padding
    }

    // Calculate effective top boundary relative to container
    const topBoundary = Math.max(0, editorRect.top - containerRect.top) + 10;

    // Calculate optimal position relative to editPanelContainer
    let adjustedTop = relativeTop - 10;
    let adjustedLeft = relativeRight - wrapperWidth - 5;

    // Check bottom boundary
    const dropdownBottom = relativeTop + wrapperHeight;
    if (dropdownBottom > bottomBoundary) {
      // Show above the element instead
      adjustedTop = relativeTop - wrapperHeight - 10;
    }

    // Check top boundary
    if (adjustedTop < topBoundary) {
      // If showing above would go too high, find best position
      const spaceAbove = relativeTop - topBoundary;
      const spaceBelow = bottomBoundary - relativeTop;

      if (spaceBelow >= wrapperHeight + 20) {
        // Use below if there's enough space
        adjustedTop = relativeTop + 10;
      } else if (spaceAbove >= wrapperHeight + 20) {
        // Use above if there's enough space
        adjustedTop = relativeTop - wrapperHeight - 10;
      } else {
        // Use the larger space and clip if necessary
        if (spaceBelow > spaceAbove) {
          adjustedTop = relativeTop + 10;
        } else {
          adjustedTop = Math.max(topBoundary, relativeTop - wrapperHeight - 10);
        }
      }
    }

    // Check horizontal boundaries relative to container
    if (adjustedLeft < 10) {
      adjustedLeft = 10;
    }

    if (adjustedLeft + wrapperWidth > containerRect.width - 10) {
      adjustedLeft = containerRect.width - wrapperWidth - 10;
    }

    // Apply final positioning relative to editPanelContainer
    css(wrapper, {
      visibility: 'visible',
      position: 'absolute',
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
    window.addEventListener('scroll', () => {
      if (this.select) {
        this.reset();
      }
    })
  }

  private handleMousedown = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;

    const style = getComputedStyle(target, ':after');
    // Only show type selector if clicking on the wrapper itself, not on content
    if (target === this.dom || target === this.contentDOM) {
      if (this.select) {
        this.reset();
        return;
      }

      if (style.cursor === 'pointer' && isFunction(this.getPos)) {
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

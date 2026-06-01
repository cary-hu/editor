import { ProsemirrorNode } from 'prosemirror-model';
import { EditorView, NodeView } from 'prosemirror-view';
import isFunction from 'tui-code-snippet/type/isFunction';
import css from 'tui-code-snippet/domUtil/css';

import { getCustomAttrs } from '@/wysiwyg/helper/node';
import { cls, setAttributes } from '@/utils/dom';
import i18n from '@/i18n/i18n';

import { Emitter } from '@t/event';

type GetPos = (() => number) | boolean;

type InputPos = {
  top: number;
  right: number;
};

const BLOCK_QUOTE_TYPE_CLASS_NAME = cls('ww-block-quote-type');
const BLOCK_QUOTE_TYPES = ['default', 'danger', 'note', 'info', 'warning', 'success'];

export class DetailsView implements NodeView {
  dom!: HTMLElement;

  contentDOM: HTMLElement | null = null;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  private eventEmitter: Emitter;

  private select: HTMLElement | null = null;

  protected editPanelContainer = document.querySelector(
    '.toastui-edit-panel-container',
  ) as HTMLElement;

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
    const details = document.createElement('details');

    this.applyAttrs(details, this.node);
    this.dom = details;
    this.contentDOM = details;
  }

  private createTypeEditor({ top, right }: InputPos) {
    const wrapper = document.createElement('div');

    wrapper.className = BLOCK_QUOTE_TYPE_CLASS_NAME;

    BLOCK_QUOTE_TYPES.forEach((type) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.value = type;
      button.textContent = i18n.get(`Blockquote ${type}`);

      if (type === this.node.attrs.bqType) {
        button.classList.add('active');
      }

      button.addEventListener('click', () => {
        this.changeTypeWithValue(type);
      });

      wrapper.appendChild(button);
    });

    wrapper.style.visibility = 'hidden';
    wrapper.style.position = 'absolute';
    wrapper.style.top = '-9999px';
    this.editPanelContainer.appendChild(wrapper);

    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    const containerRect = this.editPanelContainer.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();
    const relativeTop = top - containerRect.top;
    const relativeRight = right - containerRect.left;
    const modeSwitch = this.view.dom
      .closest(`.${cls('container')}`)!
      .querySelector(`.${cls('mode-switch')}`) as HTMLElement;
    let bottomBoundary = containerRect.height;

    if (modeSwitch) {
      const modeSwitchRect = modeSwitch.getBoundingClientRect();

      bottomBoundary = modeSwitchRect.top - containerRect.top - 10;
    }

    const topBoundary = Math.max(0, editorRect.top - containerRect.top) + 10;
    let adjustedTop = relativeTop - 10;
    let adjustedLeft = relativeRight - wrapperWidth - 5;
    const dropdownBottom = relativeTop + wrapperHeight;

    if (dropdownBottom > bottomBoundary) {
      adjustedTop = relativeTop - wrapperHeight - 10;
    }

    if (adjustedTop < topBoundary) {
      const spaceAbove = relativeTop - topBoundary;
      const spaceBelow = bottomBoundary - relativeTop;

      if (spaceBelow >= wrapperHeight + 20) {
        adjustedTop = relativeTop + 10;
      } else if (spaceAbove >= wrapperHeight + 20) {
        adjustedTop = relativeTop - wrapperHeight - 10;
      } else if (spaceBelow > spaceAbove) {
        adjustedTop = relativeTop + 10;
      } else {
        adjustedTop = Math.max(topBoundary, relativeTop - wrapperHeight - 10);
      }
    }

    if (adjustedLeft < 10) {
      adjustedLeft = 10;
    }

    if (adjustedLeft + wrapperWidth > containerRect.width - 10) {
      adjustedLeft = containerRect.width - wrapperWidth - 10;
    }

    css(wrapper, {
      visibility: 'visible',
      position: 'absolute',
      top: `${adjustedTop}px`,
      left: `${adjustedLeft}px`,
      right: 'unset',
    });

    this.select = wrapper;

    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 0);
  }

  private applyAttrs(details: HTMLElement, node: ProsemirrorNode) {
    setAttributes(getCustomAttrs(node.attrs), details);
    details.className = 'toastui-editor-ww-block-quote';
    details.setAttribute('data-detail-summary-type', node.attrs.bqType || 'default');
    details.removeAttribute('data-block-quote-type');
    details.setAttribute('data-block-quote-details', 'true');

    if (node.attrs.open) {
      details.setAttribute('open', '');
    } else {
      details.removeAttribute('open');
    }
  }

  private bindDOMEvent() {
    this.dom.addEventListener('click', this.handleClick);
  }

  private bindEvent() {
    this.eventEmitter.listen('loadUI', () => {
      this.editPanelContainer = this.view.dom
        .closest(`.${cls('container')}`)!
        .querySelector('.toastui-edit-panel-container') as HTMLElement;
    });
    this.eventEmitter.listen('scroll', () => {
      if (this.select) {
        this.reset();
      }
    });
    window.addEventListener('scroll', this.handleWindowScroll);
  }

  private handleClick = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;
    const style = getComputedStyle(target, ':after');

    if (target === this.dom && style.cursor === 'pointer' && isFunction(this.getPos)) {
      if (this.select) {
        this.reset();
        return;
      }

      const { top, right } = this.view.coordsAtPos(this.getPos());

      this.createTypeEditor({ top, right });
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

  private handleWindowScroll = () => {
    if (this.select) {
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

        if (node?.type.name === 'details') {
          tr.setNodeMarkup(pos, null, { ...node.attrs, bqType: type });
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

  update(node: ProsemirrorNode) {
    if (node.type.name !== this.node.type.name) {
      return false;
    }

    this.node = node;
    this.applyAttrs(this.dom, node);

    return true;
  }

  stopEvent(event: Event) {
    if (event.type === 'click' && event.target === this.dom) {
      return true;
    }

    return false;
  }

  destroy() {
    this.reset();
    this.dom.removeEventListener('click', this.handleClick);
    window.removeEventListener('scroll', this.handleWindowScroll);
  }
}

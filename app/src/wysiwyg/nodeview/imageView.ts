import { EditorView, NodeView } from 'prosemirror-view';
import { Node as ProsemirrorNode, Mark } from 'prosemirror-model';

import hasClass from 'tui-code-snippet/domUtil/hasClass';
import isFunction from 'tui-code-snippet/type/isFunction';

import { isPositionInBox, setAttributes } from '@/utils/dom';
import { createTextSelection } from '@/helper/manipulation';
import { getCustomAttrs } from '@/wysiwyg/helper/node';

import { Emitter } from '@t/event';

type GetPos = (() => number) | boolean;

const IMAGE_LINK_CLASS_NAME = 'image-link';

export class ImageView implements NodeView {
  dom: HTMLElement;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  private eventEmitter: Emitter;

  private imageLink: Mark | null;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos, eventEmitter: Emitter) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.eventEmitter = eventEmitter;
    this.imageLink = node.marks.filter(({ type }) => type.name === 'link')[0] ?? null;
    this.dom = this.createElement();

    this.bindEvent();
  }

  private createElement() {
    const image = this.createImageElement(this.node);

    if (this.imageLink) {
      const wrapper = document.createElement('span');

      wrapper.className = IMAGE_LINK_CLASS_NAME;
      wrapper.appendChild(image);

      return wrapper;
    }

    return image;
  }

  private createImageElement(node: ProsemirrorNode) {
    const image = document.createElement('img');
    const { imageUrl, altText, width, verticalAlign, caption } = node.attrs;

    const attrs = getCustomAttrs(node.attrs);

    image.src = imageUrl;

    if (altText) {
      image.alt = altText;
    }
    if (width !== null) {
      const widthValue = width.toString();
      const widthWithUnit = widthValue.includes('px') ? widthValue : `${widthValue}px`;

      image.style.width = widthWithUnit;
    }

    if (verticalAlign && !caption) {
      image.style.verticalAlign = verticalAlign;
    }

    setAttributes(attrs, image);

    // If there's a caption, wrap image in a figure element
    if (caption) {
      const figure = document.createElement('figure');
      const captionElement = document.createElement('figcaption');

      // Figure should match the image width
      if (width !== null) {
        const widthValue = width.toString();
        const widthWithUnit = widthValue.includes('px') ? widthValue : `${widthValue}px`;
        figure.style.width = widthWithUnit;
      }

      captionElement.textContent = caption;
      figure.appendChild(image);
      figure.appendChild(captionElement);

      return figure;
    }

    return image;
  }

  private bindEvent() {
    if (this.imageLink) {
      this.dom.addEventListener('mousedown', this.handleMousedown);
    }
  }

  private handleMousedown = (ev: MouseEvent) => {
    ev.preventDefault();

    const { target, offsetX, offsetY } = ev;

    if (
      this.imageLink &&
      isFunction(this.getPos) &&
      hasClass(target as HTMLElement, IMAGE_LINK_CLASS_NAME)
    ) {
      const style = getComputedStyle(target as HTMLElement, ':before');

      ev.stopPropagation();

      if (isPositionInBox(style, offsetX, offsetY)) {
        const { tr } = this.view.state;
        const pos = this.getPos();

        tr.setSelection(createTextSelection(tr, pos, pos + 1));
        this.view.dispatch(tr);
        this.eventEmitter.emit('openPopup', 'link', this.imageLink.attrs);
      }
    }
  };

  stopEvent() {
    return true;
  }

  destroy() {
    if (this.imageLink) {
      this.dom.removeEventListener('mousedown', this.handleMousedown);
    }
  }

  update(node: ProsemirrorNode) {
    if (!node.sameMarkup(this.node)) {
      return false;
    }

    // 检查是否是同一类型但属性有变化
    if (
      node.attrs.imageUrl !== this.node.attrs.imageUrl ||
      node.attrs.width !== this.node.attrs.width ||
      node.attrs.verticalAlign !== this.node.attrs.verticalAlign ||
      node.attrs.caption !== this.node.attrs.caption ||
      node.attrs.altText !== this.node.attrs.altText
    ) {
      // 更新节点引用
      this.node = node;

      // 重新创建DOM元素
      const newElement = this.createElement();

      // 替换现有的DOM元素
      if (this.dom.parentNode) {
        this.dom.parentNode.replaceChild(newElement, this.dom);
        this.dom = newElement;

        // 重新绑定事件
        this.bindEvent();
      }

      return true;
    }

    this.node = node;
    return true;
  }
}

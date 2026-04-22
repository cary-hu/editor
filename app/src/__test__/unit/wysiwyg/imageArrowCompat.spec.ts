import { DOMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';

describe('image arrow navigation compatibility', () => {
  let wwe: WysiwygEditor;
  let el: HTMLElement;

  function setContent(content: string) {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = content;

    const nodes = DOMParser.fromSchema(wwe.schema).parse(wrapper);

    wwe.setModel(nodes);
  }

  function getImagePos() {
    let imagePos = -1;

    wwe.view.state.doc.descendants((node, pos) => {
      if (imagePos < 0 && node.type.name === 'image') {
        imagePos = pos;
      }
    });

    if (imagePos < 0) {
      throw new Error('Expected to find an image node');
    }

    return imagePos;
  }

  beforeEach(() => {
    const toDOMAdaptor = new WwToDOMAdaptor({}, {});

    wwe = new WysiwygEditor(new EventEmitter(), {
      toDOMAdaptor,
      editPanel: {
        useImageEditPanel: false,
        useLinkEditPanel: false,
        useTableEditPanel: false,
      },
    });
    el = wwe.el;
    document.body.appendChild(el);
  });

  afterEach(() => {
    if (wwe) {
      wwe.destroy();
    }
    if (el?.parentNode === document.body) {
      document.body.removeChild(el);
    }
  });

  it('moves into and out of images with horizontal arrows', () => {
    setContent(
      '<p><img src="https://uicdn.toast.com/toastui/img/tui-editor-bi.png" alt="image"></p><h1>Awesome Editor!</h1>',
    );

    const imagePos = getImagePos();
    const imageElement = wwe.view.dom.querySelector(
      'img:not(.ProseMirror-separator)',
    ) as HTMLImageElement;

    expect(wwe.schema.nodes.image.spec.selectable).toBe(false);
    expect(imageElement).not.toBeNull();

    wwe.view.dispatch(
      wwe.view.state.tr.setSelection(TextSelection.create(wwe.view.state.doc, imagePos)),
    );
    wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(imageElement.classList.contains('toastui-editor-inline-image-selected')).toBe(true);
    expect(wwe.view.state.selection.from).toBe(imagePos);
    expect(wwe.view.state.selection.to).toBe(imagePos);

    wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(imageElement.classList.contains('toastui-editor-inline-image-selected')).toBe(false);
    expect(wwe.view.state.selection.from).toBe(imagePos + 1);
    expect(wwe.view.state.selection.to).toBe(imagePos + 1);

    wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(imageElement.classList.contains('toastui-editor-inline-image-selected')).toBe(true);
    expect(wwe.view.state.selection.from).toBe(imagePos + 1);
    expect(wwe.view.state.selection.to).toBe(imagePos + 1);

    wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    expect(imageElement.classList.contains('toastui-editor-inline-image-selected')).toBe(false);
    expect(wwe.view.state.selection.from).toBe(imagePos);
    expect(wwe.view.state.selection.to).toBe(imagePos);
  });
});

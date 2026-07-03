import { DOMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';

describe('tabbed code arrow navigation', () => {
  let wwe: WysiwygEditor;
  let el: HTMLElement;

  function setContent(content: string) {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = content;

    const nodes = DOMParser.fromSchema(wwe.schema).parse(wrapper);

    wwe.setModel(nodes);
  }

  function getNodePos(typeName: string, index = 0) {
    let nodePos = -1;
    let count = 0;

    wwe.view.state.doc.descendants((node, pos) => {
      if (node.type.name === typeName) {
        if (count === index) {
          nodePos = pos;
          return false;
        }

        count += 1;
      }

      return true;
    });

    if (nodePos < 0) {
      throw new Error(`Expected to find a ${typeName} node`);
    }

    return nodePos;
  }

  function setSelectionAtCodeBlockEnd(index = 0) {
    const codeBlockPos = getNodePos('codeBlock', index);
    const codeBlock = wwe.view.state.doc.nodeAt(codeBlockPos)!;
    const codeBlockEndPos = codeBlockPos + codeBlock.nodeSize - 1;

    wwe.view.dispatch(
      wwe.view.state.tr.setSelection(TextSelection.create(wwe.view.state.doc, codeBlockEndPos)),
    );
  }

  function dispatchArrowDown() {
    wwe.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
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
    vi.restoreAllMocks();
    wwe.destroy();

    if (el.parentNode === document.body) {
      document.body.removeChild(el);
    }
  });

  it('adds a paragraph after tabbed code at the document end with ArrowDown', () => {
    setContent(
      [
        '<div class="toastui-editor-code-group">',
        '<pre data-code-label="config.js"><code data-language="js">foo\nbar</code></pre>',
        '<pre data-code-label="config.ts"><code data-language="ts">baz</code></pre>',
        '</div>',
      ].join(''),
    );
    vi.spyOn(wwe.view, 'endOfTextblock').mockReturnValue(true);

    const tabbedCodePos = getNodePos('tabbedCode');
    const tabbedCodeEndPos = tabbedCodePos + wwe.view.state.doc.nodeAt(tabbedCodePos)!.nodeSize;

    setSelectionAtCodeBlockEnd();
    dispatchArrowDown();

    expect(wwe.view.state.doc.lastChild!.type.name).toBe('paragraph');
    expect(wwe.view.state.selection.from).toBe(tabbedCodeEndPos + 1);
  });

  it('moves after tabbed code when a following block exists with ArrowDown', () => {
    setContent(
      [
        '<div class="toastui-editor-code-group">',
        '<pre data-code-label="config.js"><code data-language="js">foo\nbar</code></pre>',
        '<pre data-code-label="config.ts"><code data-language="ts">baz</code></pre>',
        '</div>',
        '<p>after</p>',
      ].join(''),
    );
    vi.spyOn(wwe.view, 'endOfTextblock').mockReturnValue(true);

    const tabbedCodePos = getNodePos('tabbedCode');
    const tabbedCodeEndPos = tabbedCodePos + wwe.view.state.doc.nodeAt(tabbedCodePos)!.nodeSize;
    const childCount = wwe.view.state.doc.childCount;

    setSelectionAtCodeBlockEnd();
    dispatchArrowDown();

    expect(wwe.view.state.doc.childCount).toBe(childCount);
    expect(wwe.view.state.doc.lastChild!.textContent).toBe('after');
    expect(wwe.view.state.selection.from).toBe(tabbedCodeEndPos + 1);
  });
});

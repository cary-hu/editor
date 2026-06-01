import { DOMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';

describe('details arrow navigation', () => {
  let wwe: WysiwygEditor;
  let el: HTMLElement;

  function setContent(content: string) {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = content;

    const nodes = DOMParser.fromSchema(wwe.schema).parse(wrapper);

    wwe.setModel(nodes);
  }

  function getNodePos(typeName: string) {
    let nodePos = -1;

    wwe.view.state.doc.descendants((node, pos) => {
      if (nodePos < 0 && node.type.name === typeName) {
        nodePos = pos;
      }
    });

    if (nodePos < 0) {
      throw new Error(`Expected to find a ${typeName} node`);
    }

    return nodePos;
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
    wwe.destroy();

    if (el.parentNode === document.body) {
      document.body.removeChild(el);
    }
  });

  it('moves after collapsed details from the end of summary', () => {
    setContent(`
      <details data-detail-summary-type="warning" data-block-quote-details="true">
        <summary class="toastui-editor-block-quote-summary">Summary</summary>
        <div class="toastui-editor-block-quote-body"><p>foo</p></div>
      </details>
      <p>bar</p>
    `);

    const detailsPos = getNodePos('details');
    const summaryPos = getNodePos('summary');
    const summaryNode = wwe.view.state.doc.nodeAt(summaryPos)!;
    const summaryEndPos = summaryPos + summaryNode.nodeSize - 1;
    const detailsEndPos = detailsPos + wwe.view.state.doc.nodeAt(detailsPos)!.nodeSize;
    const summaryElement = wwe.view.dom.querySelector(
      '.toastui-editor-block-quote-summary',
    ) as HTMLElement;

    wwe.view.dispatch(
      wwe.view.state.tr.setSelection(TextSelection.create(wwe.view.state.doc, summaryEndPos)),
    );
    summaryElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(wwe.view.state.doc.nodeAt(detailsPos)!.attrs.open).toBe(false);
    expect(wwe.view.state.selection.from).toBe(detailsEndPos + 1);
  });

  it('creates default details with Alt-d', () => {
    setContent('<p>foo</p>');

    wwe.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'd', altKey: true, bubbles: true }),
    );

    const details = wwe.view.state.doc.firstChild!;

    expect(details.type.name).toBe('details');
    expect(details.attrs.bqType).toBe('default');
    expect(details.attrs.open).toBe(true);
    expect(details.firstChild!.textContent).toBe('Summary');
    expect(wwe.view.state.selection.from).toBe(2);
    expect(wwe.view.state.selection.to).toBe(9);
  });
});
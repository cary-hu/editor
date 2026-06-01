import { ProsemirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { EditorView, NodeView } from 'prosemirror-view';

import isFunction from 'tui-code-snippet/type/isFunction';

import { addParagraph, createTextSelection } from '@/helper/manipulation';

type GetPos = (() => number) | boolean;

export class SummaryView implements NodeView {
  dom!: HTMLElement;

  contentDOM: HTMLElement | null = null;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.createElement();
  }

  private createElement() {
    const summary = document.createElement('summary');
    const marker = document.createElement('span');
    const summaryText = document.createElement('span');

    summary.className = 'toastui-editor-block-quote-summary';
    summary.addEventListener('mousedown', this.handleMousedown, true);
    summary.addEventListener('click', this.handleClick, true);
    summary.addEventListener('keydown', this.handleKeydown);
    marker.className = 'toastui-editor-block-quote-summary-marker';
    marker.contentEditable = 'false';
    marker.setAttribute('aria-hidden', 'true');
    summaryText.className = 'toastui-editor-block-quote-summary-text';
    summary.appendChild(marker);
    summary.appendChild(summaryText);

    this.dom = summary;
    this.contentDOM = summaryText;
  }

  private getCurrentPos() {
    if (!isFunction(this.getPos)) {
      return null;
    }

    const pos = this.getPos();

    return typeof pos === 'number' ? pos : null;
  }

  private isSelectionAtEnd() {
    const pos = this.getCurrentPos();

    if (pos === null) {
      return false;
    }

    const { selection } = this.view.state;

    return selection.empty && selection.from === pos + this.node.nodeSize - 1;
  }

  private getDetailsInfo() {
    const pos = this.getCurrentPos();

    if (pos === null) {
      return null;
    }

    const detailsPos = pos - 1;
    const details = this.view.state.doc.nodeAt(detailsPos);

    if (details?.type.name !== 'details') {
      return null;
    }

    return { details, detailsPos };
  }

  private moveCursorAfterDetails() {
    const detailsInfo = this.getDetailsInfo();

    if (!detailsInfo) {
      return;
    }

    const { state } = this.view;
    const { doc, schema, tr } = state;
    const detailsEndPos = detailsInfo.detailsPos + detailsInfo.details.nodeSize;
    const $detailsEnd = doc.resolve(detailsEndPos);
    const nextNode = $detailsEnd.nodeAfter;
    const nextSelectionPos = nextNode ? detailsEndPos + 1 : detailsEndPos;

    if (nextNode) {
      this.view.dispatch(tr.setSelection(createTextSelection(tr, nextSelectionPos)));
    } else {
      this.view.dispatch(addParagraph(tr, $detailsEnd, schema));
    }

    this.view.focus();
  }

  private focusDetailsBody() {
    const pos = this.getCurrentPos();
    const detailsInfo = this.getDetailsInfo();

    if (pos === null || !detailsInfo) {
      return;
    }
    const bodyPos = pos + this.node.nodeSize;
    const selection = TextSelection.near(this.view.state.doc.resolve(bodyPos), 1);
    const tr = this.view.state.tr.setSelection(selection);

    if (!detailsInfo.details.attrs.open) {
      tr.setNodeMarkup(detailsInfo.detailsPos, null, { ...detailsInfo.details.attrs, open: true });
    }

    this.view.dispatch(tr);
    this.view.focus();
  }

  private isMarkerEvent(ev: MouseEvent) {
    return !!(ev.target as HTMLElement).closest('.toastui-editor-block-quote-summary-marker');
  }

  private toggleDetailsOpen() {
    const detailsInfo = this.getDetailsInfo();

    if (!detailsInfo) {
      return;
    }
    const { details, detailsPos } = detailsInfo;
    const open = !details.attrs.open;
    const { tr } = this.view.state;

    tr.setNodeMarkup(detailsPos, null, { ...details.attrs, open });
    this.view.dispatch(tr);
  }

  private handleMousedown = (ev: MouseEvent) => {
    if (this.isMarkerEvent(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }
  };

  private handleClick = (ev: MouseEvent) => {
    ev.preventDefault();

    if (this.isMarkerEvent(ev)) {
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      this.toggleDetailsOpen();
    }
  };

  private handleKeydown = (ev: KeyboardEvent) => {
    const detailsInfo = this.getDetailsInfo();
    const shouldFocusBody = ev.key === 'Tab' || ev.key === 'Enter';
    const shouldMoveAfterCollapsedDetails =
      ev.key === 'ArrowRight' && this.isSelectionAtEnd() && detailsInfo && !detailsInfo.details.attrs.open;
    const shouldFocusOpenedBody =
      ev.key === 'ArrowRight' && this.isSelectionAtEnd() && detailsInfo?.details.attrs.open;

    if (shouldMoveAfterCollapsedDetails) {
      ev.preventDefault();
      ev.stopPropagation();
      this.moveCursorAfterDetails();
    } else if (shouldFocusBody || shouldFocusOpenedBody) {
      ev.preventDefault();
      ev.stopPropagation();
      this.focusDetailsBody();
    }
  };

  stopEvent(event: Event) {
    return (
      event.type === 'keydown' && event.target instanceof Node && this.dom.contains(event.target)
    );
  }

  update(node: ProsemirrorNode) {
    if (node.type.name !== this.node.type.name) {
      return false;
    }

    this.node = node;

    return true;
  }

  destroy() {
    this.dom.removeEventListener('mousedown', this.handleMousedown, true);
    this.dom.removeEventListener('click', this.handleClick, true);
    this.dom.removeEventListener('keydown', this.handleKeydown);
  }
}

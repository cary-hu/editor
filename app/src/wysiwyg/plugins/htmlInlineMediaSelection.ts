import { Mark, MarkType, Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { cls, closest } from '@/utils/dom';
import {
  hasMediaBoundaryPlaceholder,
  MEDIA_BOUNDARY_PLACEHOLDER,
  stripMediaBoundaryPlaceholders,
} from '@/utils/htmlInlineMedia';

const MEDIA_MARK_NAMES = ['video', 'audio'] as const;
const MEDIA_SELECTOR = MEDIA_MARK_NAMES.join(',');
const SELECTED_MEDIA_CLASS_NAME = cls('html-inline-media-selected');
const pendingSelectionUpdates = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();
const htmlInlineMediaSelectionKey = new PluginKey<HtmlInlineMediaSelectionState>(
  'htmlInlineMediaSelection',
);

interface MediaRange {
  from: number;
  to: number;
}

interface MediaMarkRange extends MediaRange {
  mark: Mark;
}

interface TextblockPosition {
  node: ProsemirrorNode;
  pos: number;
}

interface HtmlInlineMediaSelectionState {
  range: MediaRange | null;
}

interface ReplaceTextOperation {
  from: number;
  to: number;
  text: string;
}

interface DeleteTextOperation {
  from: number;
  to: number;
  text: null;
}

type MediaBoundaryNormalizationOperation = ReplaceTextOperation | DeleteTextOperation;

function isMediaMarkType(type: MarkType | null | undefined) {
  return !!type && MEDIA_MARK_NAMES.includes(type.name as (typeof MEDIA_MARK_NAMES)[number]);
}

function findMediaMark(node: ProsemirrorNode | null | undefined) {
  if (!node) {
    return null;
  }

  return node.marks.find((mark) => isMediaMarkType(mark.type)) || null;
}

function isMediaBoundaryPlaceholderNode(node: ProsemirrorNode | null | undefined) {
  return !!node && node.isText && !node.marks.length && node.text === MEDIA_BOUNDARY_PLACEHOLDER;
}

function isSameRange(a: MediaRange | null, b: MediaRange | null) {
  return a?.from === b?.from && a?.to === b?.to;
}

function getExplicitMediaSelection(state: EditorState) {
  return htmlInlineMediaSelectionKey.getState(state)?.range || null;
}

function setExplicitMediaSelection(tr: Transaction, range: MediaRange | null) {
  return tr.setMeta(htmlInlineMediaSelectionKey, range);
}

function updateExplicitMediaSelection(view: EditorView, range: MediaRange | null) {
  if (isSameRange(getExplicitMediaSelection(view.state), range)) {
    return;
  }

  view.dispatch(setExplicitMediaSelection(view.state.tr, range));
}

function getChildOffset(parent: ProsemirrorNode, targetIndex: number) {
  let offset = 0;

  for (let i = 0; i < targetIndex; i += 1) {
    offset += parent.child(i).nodeSize;
  }

  return offset;
}

function findMediaOnlyTextblockRange(
  node: ProsemirrorNode | null | undefined,
  nodePos: number,
): MediaMarkRange | null {
  if (!node || !node.isTextblock || !node.childCount) {
    return null;
  }

  let from = -1;
  let to = -1;
  let offset = 0;
  let mediaMark: Mark | null = null;

  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    const childFrom = nodePos + 1 + offset;

    offset += child.nodeSize;

    if (isMediaBoundaryPlaceholderNode(child)) {
      continue;
    }

    const childMediaMark = findMediaMark(child);

    if (!child.isText || !childMediaMark) {
      return null;
    }

    if (mediaMark && !childMediaMark.eq(mediaMark)) {
      return null;
    }

    if (!mediaMark) {
      mediaMark = childMediaMark;
      from = childFrom;
    }

    to = childFrom + child.nodeSize;
  }

  return mediaMark && from >= 0 && to >= 0 ? { from, to, mark: mediaMark } : null;
}

function findMediaMarkRangeAtPos(doc: ProsemirrorNode, pos: number): MediaMarkRange | null {
  if (pos < 0 || pos > doc.content.size) {
    return null;
  }

  const $pos = doc.resolve(pos);
  const { parent } = $pos;
  const start = $pos.start();

  const after = parent.childAfter($pos.parentOffset);
  const before = parent.childBefore($pos.parentOffset);

  let target = after;
  let targetStart = start + after.offset;
  let mediaMark = findMediaMark(after.node);

  if (!mediaMark && before.node) {
    target = before;
    targetStart = start + before.offset;
    mediaMark = findMediaMark(before.node);
  }

  if (!target.node || !target.node.isText || !mediaMark) {
    return null;
  }

  let from = targetStart;
  let to = targetStart + target.node.nodeSize;
  let leftIndex = target.index;
  let rightIndex = target.index;

  while (leftIndex > 0) {
    const prevNode = parent.child(leftIndex - 1);
    const prevMark = findMediaMark(prevNode);

    if (!prevNode.isText || !prevMark || !prevMark.eq(mediaMark)) {
      break;
    }

    from -= prevNode.nodeSize;
    leftIndex -= 1;
  }

  while (rightIndex < parent.childCount - 1) {
    const nextNode = parent.child(rightIndex + 1);
    const nextMark = findMediaMark(nextNode);

    if (!nextNode.isText || !nextMark || !nextMark.eq(mediaMark)) {
      break;
    }

    to += nextNode.nodeSize;
    rightIndex += 1;
  }

  return { from, to, mark: mediaMark };
}

function findMediaMarkRangeAtTextblockBoundary(
  node: ProsemirrorNode | null | undefined,
  nodePos: number,
  side: 'start' | 'end',
): MediaMarkRange | null {
  if (!node || !node.isTextblock || !node.childCount) {
    return null;
  }

  let targetIndex = side === 'start' ? 0 : node.childCount - 1;

  while (
    targetIndex >= 0 &&
    targetIndex < node.childCount &&
    isMediaBoundaryPlaceholderNode(node.child(targetIndex))
  ) {
    targetIndex += side === 'start' ? 1 : -1;
  }

  if (targetIndex < 0 || targetIndex >= node.childCount) {
    return null;
  }

  const targetNode = node.child(targetIndex);
  const mediaMark = findMediaMark(targetNode);

  if (!targetNode.isText || !mediaMark) {
    return null;
  }

  let leftIndex = targetIndex;
  let rightIndex = targetIndex;
  let from = nodePos + 1 + getChildOffset(node, targetIndex);
  let to = from + targetNode.nodeSize;

  while (leftIndex > 0) {
    const prevNode = node.child(leftIndex - 1);
    const prevMark = findMediaMark(prevNode);

    if (!prevNode.isText || !prevMark || !prevMark.eq(mediaMark)) {
      break;
    }

    from -= prevNode.nodeSize;
    leftIndex -= 1;
  }

  while (rightIndex < node.childCount - 1) {
    const nextNode = node.child(rightIndex + 1);
    const nextMark = findMediaMark(nextNode);

    if (!nextNode.isText || !nextMark || !nextMark.eq(mediaMark)) {
      break;
    }

    to += nextNode.nodeSize;
    rightIndex += 1;
  }

  return { from, to, mark: mediaMark };
}

function findAdjacentMediaMarkRange(
  doc: ProsemirrorNode,
  pos: number,
  key: string,
): MediaMarkRange | null {
  const $pos = doc.resolve(pos);
  const { parent } = $pos;
  const start = $pos.start();

  if (key === 'ArrowRight') {
    const after = parent.childAfter($pos.parentOffset);

    return after.node
      ? findMediaMarkRangeAtTextblockBoundary(after.node, start + after.offset, 'start')
      : null;
  }

  const before = parent.childBefore($pos.parentOffset);

  return before.node
    ? findMediaMarkRangeAtTextblockBoundary(before.node, start + before.offset, 'end')
    : null;
}

function findCurrentTextblockPosition(
  state: EditorState,
): (TextblockPosition & { depth: number }) | null {
  const { $from } = state.selection;

  return findTextblockPositionAtResolvedPos($from);
}

function findTextblockPositionAtResolvedPos(
  $pos: EditorState['selection']['$from'],
): (TextblockPosition & { depth: number }) | null {
  for (let { depth } = $pos; depth > 0; depth -= 1) {
    const node = $pos.node(depth);

    if (node.isTextblock) {
      return {
        node,
        pos: $pos.before(depth),
        depth,
      };
    }
  }

  return null;
}

function findFirstTextblock(
  doc: ProsemirrorNode,
  from: number,
  to: number,
): TextblockPosition | null {
  let result: TextblockPosition | null = null;

  doc.nodesBetween(from, to, (node, pos) => {
    if (result) {
      return false;
    }
    if (!node.isTextblock) {
      return true;
    }

    result = { node, pos };

    return false;
  });

  return result;
}

function findLastTextblock(
  doc: ProsemirrorNode,
  from: number,
  to: number,
): TextblockPosition | null {
  let result: TextblockPosition | null = null;

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      result = { node, pos };
    }
  });

  return result;
}

function findMediaMarkRangeAcrossTextblocks(
  state: EditorState,
  key: string,
): MediaMarkRange | null {
  const { selection, doc } = state;
  const currentTextblock = findCurrentTextblockPosition(state);

  if (!selection.empty || !currentTextblock) {
    return null;
  }

  if (key === 'ArrowRight') {
    if (selection.from !== selection.$from.end(currentTextblock.depth)) {
      return null;
    }

    const nextTextblock = findFirstTextblock(
      doc,
      currentTextblock.pos + currentTextblock.node.nodeSize,
      doc.content.size,
    );

    return nextTextblock
      ? findMediaMarkRangeAtTextblockBoundary(nextTextblock.node, nextTextblock.pos, 'start')
      : null;
  }

  if (selection.from !== selection.$from.start(currentTextblock.depth)) {
    return null;
  }

  const previousTextblock = findLastTextblock(doc, 0, Math.max(currentTextblock.pos - 1, 0));

  return previousTextblock
    ? findMediaMarkRangeAtTextblockBoundary(previousTextblock.node, previousTextblock.pos, 'end')
    : null;
}

function getTextblockVisibleSelectionPos(textblock: TextblockPosition, side: 'start' | 'end') {
  return side === 'start' ? textblock.pos + 1 : textblock.pos + textblock.node.nodeSize - 1;
}

function isWholeTextblockMediaRange(doc: ProsemirrorNode, range: MediaRange) {
  const $from = doc.resolve(range.from);
  const textblock = findTextblockPositionAtResolvedPos($from);
  const textblockRange = textblock
    ? findMediaOnlyTextblockRange(textblock.node, textblock.pos)
    : null;

  return !!textblockRange && textblockRange.from === range.from && textblockRange.to === range.to;
}

function getMediaEscapeSelectionPos(doc: ProsemirrorNode, range: MediaRange, key: string) {
  if (!isWholeTextblockMediaRange(doc, range)) {
    return key === 'ArrowLeft' ? range.from : range.to;
  }

  const $from = doc.resolve(range.from);
  const textblock = findTextblockPositionAtResolvedPos($from);

  if (!textblock) {
    return key === 'ArrowLeft' ? range.from : range.to;
  }

  if (key === 'ArrowLeft') {
    const previousTextblock = findLastTextblock(doc, 0, Math.max(textblock.pos - 1, 0));

    return previousTextblock
      ? getTextblockVisibleSelectionPos(previousTextblock, 'end')
      : range.from;
  }

  const nextTextblock = findFirstTextblock(
    doc,
    textblock.pos + textblock.node.nodeSize,
    doc.content.size,
  );

  return nextTextblock ? getTextblockVisibleSelectionPos(nextTextblock, 'start') : range.to;
}

function matchesMediaBoundarySelectionPos(
  doc: ProsemirrorNode,
  range: MediaRange,
  selectionPos: number,
  key: string,
) {
  if (key === 'ArrowRight') {
    return (
      selectionPos === range.from ||
      (isWholeTextblockMediaRange(doc, range) && selectionPos === range.from - 1)
    );
  }

  return (
    selectionPos === range.to ||
    (isWholeTextblockMediaRange(doc, range) && selectionPos === range.to + 1)
  );
}

function findSelectedMediaRange(view: EditorView): MediaRange | null {
  const explicitRange = getExplicitMediaSelection(view.state);

  if (explicitRange) {
    return explicitRange;
  }

  const { selection, doc } = view.state;
  const rangeAtFrom = findMediaMarkRangeAtPos(doc, selection.from);

  if (!rangeAtFrom) {
    return null;
  }

  if (selection.empty) {
    return selection.from > rangeAtFrom.from && selection.from < rangeAtFrom.to
      ? rangeAtFrom
      : null;
  }

  return selection.from >= rangeAtFrom.from && selection.to <= rangeAtFrom.to ? rangeAtFrom : null;
}

function findMediaMarkRangeNearPos(doc: ProsemirrorNode, pos: number): MediaMarkRange | null {
  const positions = [pos, pos - 1, pos + 1].filter(
    (candidatePos, index, array) =>
      candidatePos >= 0 &&
      candidatePos <= doc.content.size &&
      array.indexOf(candidatePos) === index,
  );

  for (const candidatePos of positions) {
    const range = findMediaMarkRangeAtPos(doc, candidatePos);

    if (range) {
      return range;
    }
  }

  return null;
}

function findMediaMarkRangeForElement(
  view: EditorView,
  mediaElement: HTMLElement,
): MediaMarkRange | null {
  const positionTargets: Array<{ node: Node; offset: number }> = [];

  if (mediaElement.firstChild) {
    const { firstChild } = mediaElement;

    if (firstChild.nodeType === Node.TEXT_NODE) {
      const textLength = firstChild.textContent?.length || 0;
      const offsets = [0, textLength].filter(
        (offset, index, array) => array.indexOf(offset) === index,
      );

      offsets.forEach((offset) => {
        positionTargets.push({ node: firstChild, offset });
      });
    } else {
      positionTargets.push({ node: firstChild, offset: 0 });
    }
  }

  positionTargets.push({ node: mediaElement, offset: 0 });
  positionTargets.push({ node: mediaElement, offset: mediaElement.childNodes.length });

  for (const target of positionTargets) {
    try {
      const pos = view.posAtDOM(target.node, target.offset);
      const range = findMediaMarkRangeNearPos(view.state.doc, pos);

      if (range) {
        return range;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function resolveMediaElementFromDomPosition(node: Node, offset: number) {
  if (node instanceof HTMLElement) {
    if (node.matches(MEDIA_SELECTOR)) {
      return node;
    }

    const siblings = [node.childNodes[offset - 1], node.childNodes[offset]].filter(Boolean);

    for (const sibling of siblings) {
      if (sibling instanceof HTMLElement && sibling.matches(MEDIA_SELECTOR)) {
        return sibling;
      }

      if (sibling instanceof HTMLElement) {
        const nestedMedia = sibling.querySelector(MEDIA_SELECTOR);

        if (nestedMedia instanceof HTMLElement) {
          return nestedMedia;
        }
      }
    }
  }

  return closest(node, MEDIA_SELECTOR) as HTMLElement | null;
}

function findMediaElementForRange(view: EditorView, range: MediaRange): HTMLElement | null {
  const probePositions = [
    range.from - 1,
    range.from,
    range.from + 1,
    range.to - 1,
    range.to,
    range.to + 1,
  ].filter(
    (pos, index, array) =>
      pos >= 0 && pos <= view.state.doc.content.size && array.indexOf(pos) === index,
  );

  for (const probePos of probePositions) {
    const { node, offset } = view.domAtPos(probePos);
    const element = resolveMediaElementFromDomPosition(node, offset);

    if (element && view.dom.contains(element)) {
      return element;
    }
  }

  return null;
}

function setSelectionToRange(view: EditorView, from: number, to = from) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
}

function clearScheduledSelectionUpdate(view: EditorView) {
  const timer = pendingSelectionUpdates.get(view);

  if (timer) {
    clearTimeout(timer);
    pendingSelectionUpdates.delete(view);
  }
}

function scheduleSelectionUpdate(view: EditorView, from: number, to = from) {
  clearScheduledSelectionUpdate(view);

  const timer = setTimeout(() => {
    pendingSelectionUpdates.delete(view);
    setSelectionToRange(view, from, to);
    view.focus();
  }, 0);

  pendingSelectionUpdates.set(view, timer);
}

function collectMediaBoundaryNormalizationOperations(doc: ProsemirrorNode) {
  const operations: MediaBoundaryNormalizationOperation[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return;
    }

    const leadingMediaRange = findMediaMarkRangeAtTextblockBoundary(node, pos, 'start');
    const trailingMediaRange = findMediaMarkRangeAtTextblockBoundary(node, pos, 'end');
    let offset = 0;

    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      const from = pos + 1 + offset;
      const to = from + child.nodeSize;

      offset += child.nodeSize;

      if (!child.isText || findMediaMark(child) || !hasMediaBoundaryPlaceholder(child.text || '')) {
        continue;
      }

      const strippedText = stripMediaBoundaryPlaceholders(child.text || '');
      const isLeadingPlaceholder =
        child.text === MEDIA_BOUNDARY_PLACEHOLDER && !!leadingMediaRange && i === 0;
      const isTrailingPlaceholder =
        child.text === MEDIA_BOUNDARY_PLACEHOLDER &&
        !!trailingMediaRange &&
        i === node.childCount - 1;
      const isEdgePlaceholder = isLeadingPlaceholder || isTrailingPlaceholder;

      if (!isEdgePlaceholder) {
        operations.push(strippedText ? { from, to, text: strippedText } : { from, to, text: null });
      }
    }

    if (leadingMediaRange && !isMediaBoundaryPlaceholderNode(node.firstChild)) {
      operations.push({
        from: leadingMediaRange.from,
        to: leadingMediaRange.from,
        text: MEDIA_BOUNDARY_PLACEHOLDER,
      });
    }

    if (trailingMediaRange && !isMediaBoundaryPlaceholderNode(node.lastChild)) {
      operations.push({
        from: trailingMediaRange.to,
        to: trailingMediaRange.to,
        text: MEDIA_BOUNDARY_PLACEHOLDER,
      });
    }
  });

  operations.sort((a, b) => b.from - a.from || b.to - a.to);

  return operations;
}

function normalizeMediaBoundaryPlaceholders(state: EditorState) {
  const operations = collectMediaBoundaryNormalizationOperations(state.doc);

  if (!operations.length) {
    return null;
  }

  const { tr } = state;

  operations.forEach((operation) => {
    if (operation.text === null) {
      tr.delete(operation.from, operation.to);
    } else {
      tr.insertText(operation.text, operation.from, operation.to);
    }
  });

  return tr.docChanged ? tr : null;
}

function maybeSelectMediaAtBoundary(view: EditorView, key: string) {
  const { selection, doc } = view.state;

  if (!selection.empty) {
    return false;
  }

  const pos = key === 'ArrowRight' ? selection.from : Math.max(selection.from - 1, 0);
  const range =
    findAdjacentMediaMarkRange(doc, selection.from, key) || findMediaMarkRangeAtPos(doc, pos);

  if (range && matchesMediaBoundarySelectionPos(doc, range, selection.from, key)) {
    updateExplicitMediaSelection(view, { from: range.from, to: range.to });
    return true;
  }

  const textblockRange = findMediaMarkRangeAcrossTextblocks(view.state, key);

  if (!textblockRange) {
    return false;
  }

  updateExplicitMediaSelection(view, { from: textblockRange.from, to: textblockRange.to });
  return true;
}

function maybeEscapeFromMedia(view: EditorView, key: string) {
  const { selection, doc } = view.state;

  if (selection.empty) {
    const range = findMediaMarkRangeAtPos(doc, selection.from);

    if (!range) {
      return false;
    }

    if (selection.from > range.from && selection.from < range.to) {
      scheduleSelectionUpdate(view, key === 'ArrowLeft' ? range.from : range.to);
      return true;
    }

    return false;
  }

  const range = findMediaMarkRangeAtPos(doc, selection.from);

  if (!range || selection.from !== range.from || selection.to !== range.to) {
    return false;
  }

  scheduleSelectionUpdate(view, getMediaEscapeSelectionPos(doc, range, key));
  return true;
}

class HtmlInlineMediaSelectionView {
  private selectedElement: HTMLElement | null = null;

  constructor(private view: EditorView) {
    this.handleMediaClick = this.handleMediaClick.bind(this);
    this.view.dom.addEventListener('click', this.handleMediaClick, true);
    this.update(view);
  }

  update(view: EditorView) {
    this.view = view;
    this.syncSelectedMediaElement();
  }

  destroy() {
    clearScheduledSelectionUpdate(this.view);
    this.view.dom.removeEventListener('click', this.handleMediaClick, true);
    this.clearSelectedMediaElement();
  }

  private handleMediaClick(event: MouseEvent) {
    const mediaElement = closest(event.target as Node, MEDIA_SELECTOR) as HTMLElement | null;

    if (!mediaElement || !this.view.dom.contains(mediaElement)) {
      if (getExplicitMediaSelection(this.view.state)) {
        updateExplicitMediaSelection(this.view, null);
      }
      return;
    }

    const range = findMediaMarkRangeForElement(this.view, mediaElement);

    if (!range) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateExplicitMediaSelection(this.view, { from: range.from, to: range.to });
    this.view.focus();
  }

  private syncSelectedMediaElement() {
    const range = findSelectedMediaRange(this.view);
    const nextElement = range ? findMediaElementForRange(this.view, range) : null;

    if (nextElement === this.selectedElement) {
      return;
    }

    this.clearSelectedMediaElement();

    if (nextElement) {
      nextElement.classList.add(SELECTED_MEDIA_CLASS_NAME);
      this.selectedElement = nextElement;
    }
  }

  private clearSelectedMediaElement() {
    if (this.selectedElement) {
      this.selectedElement.classList.remove(SELECTED_MEDIA_CLASS_NAME);
      this.selectedElement = null;
    }
  }
}

export function htmlInlineMediaSelection() {
  return new Plugin({
    key: htmlInlineMediaSelectionKey,
    appendTransaction(_, __, newState) {
      return normalizeMediaBoundaryPlaceholders(newState);
    },
    state: {
      init(): HtmlInlineMediaSelectionState {
        return { range: null };
      },
      apply(tr, value: HtmlInlineMediaSelectionState): HtmlInlineMediaSelectionState {
        const meta = tr.getMeta(htmlInlineMediaSelectionKey);

        if (typeof meta !== 'undefined') {
          return { range: meta };
        }

        if (!value.range) {
          return value;
        }

        let { range } = value;

        if (tr.docChanged) {
          range = {
            from: tr.mapping.map(range.from),
            to: tr.mapping.map(range.to),
          };
        }

        if (tr.selectionSet) {
          const { selection } = tr;
          const isBoundarySelection =
            selection.empty &&
            (selection.from === range.from - 1 || selection.from === range.to + 1);

          return {
            range: isBoundarySelection ? range : null,
          };
        }

        return { range };
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return false;
        }

        const explicitRange = getExplicitMediaSelection(view.state);

        if (explicitRange) {
          updateExplicitMediaSelection(view, null);
          scheduleSelectionUpdate(
            view,
            getMediaEscapeSelectionPos(view.state.doc, explicitRange, event.key),
          );
          event.preventDefault();
          return true;
        }

        if (maybeEscapeFromMedia(view, event.key) || maybeSelectMediaAtBoundary(view, event.key)) {
          event.preventDefault();
          return true;
        }

        return false;
      },
    },
    view(editorView) {
      return new HtmlInlineMediaSelectionView(editorView);
    },
  });
}

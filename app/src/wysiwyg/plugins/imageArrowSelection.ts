import { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { cls } from '@/utils/dom';

interface ImageArrowSelectionState {
  pos: number | null;
}

const imageArrowSelectionKey = new PluginKey<ImageArrowSelectionState>('imageArrowSelection');
const SELECTED_IMAGE_CLASS_NAME = cls('inline-image-selected');

function isImageNode(node: ProsemirrorNode | null | undefined) {
  return !!node && node.type.name === 'image';
}

function getExplicitImageSelection(state: EditorState) {
  return imageArrowSelectionKey.getState(state)?.pos ?? null;
}

function setExplicitImageSelection(tr: Transaction, pos: number | null) {
  return tr.setMeta(imageArrowSelectionKey, pos);
}

function findImagePosAtSelectionBoundary(state: EditorState, key: string) {
  const { selection, doc } = state;

  if (!selection.empty) {
    return null;
  }

  if (key === 'ArrowRight') {
    return isImageNode(doc.nodeAt(selection.from)) ? selection.from : null;
  }

  const imagePos = selection.from - 1;

  return imagePos >= 0 && isImageNode(doc.nodeAt(imagePos)) ? imagePos : null;
}

function resolveImageElement(view: EditorView, pos: number) {
  const nodeDOM = view.nodeDOM(pos);

  if (!(nodeDOM instanceof HTMLElement)) {
    return null;
  }

  if (nodeDOM.matches('img')) {
    return nodeDOM;
  }

  return nodeDOM.querySelector('img');
}

class ImageArrowSelectionView {
  private selectedImageElement: HTMLElement | null = null;

  constructor(private view: EditorView) {
    this.update(view);
  }

  update(view: EditorView) {
    this.view = view;
    this.syncSelectedImageElement();
  }

  destroy() {
    this.clearSelectedImageElement();
  }

  private syncSelectedImageElement() {
    const imagePos = getExplicitImageSelection(this.view.state);
    const nextElement = imagePos !== null ? resolveImageElement(this.view, imagePos) : null;

    if (nextElement === this.selectedImageElement) {
      return;
    }

    this.clearSelectedImageElement();

    if (nextElement) {
      nextElement.classList.add(SELECTED_IMAGE_CLASS_NAME);
      this.selectedImageElement = nextElement;
    }
  }

  private clearSelectedImageElement() {
    if (this.selectedImageElement) {
      this.selectedImageElement.classList.remove(SELECTED_IMAGE_CLASS_NAME);
      this.selectedImageElement = null;
    }
  }
}

export function imageArrowSelection() {
  return new Plugin({
    key: imageArrowSelectionKey,
    state: {
      init() {
        return { pos: null };
      },
      apply(tr, value) {
        const meta = tr.getMeta(imageArrowSelectionKey);

        if (meta !== undefined) {
          return { pos: meta };
        }

        if (value.pos === null) {
          return value;
        }

        let pos: number = value.pos;

        if (tr.docChanged) {
          pos = tr.mapping.map(pos, 1);
        }

        if (!isImageNode(tr.doc.nodeAt(pos))) {
          return { pos: null };
        }

        if (tr.selectionSet) {
          const { selection } = tr;
          const isBoundarySelection =
            selection.empty && (selection.from === pos || selection.from === pos + 1);

          return { pos: isBoundarySelection ? pos : null };
        }

        return { pos };
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return false;
        }

        const explicitImagePos = getExplicitImageSelection(view.state);

        if (explicitImagePos !== null) {
          const targetPos = event.key === 'ArrowRight' ? explicitImagePos + 1 : explicitImagePos;
          const tr = setExplicitImageSelection(
            view.state.tr.setSelection(TextSelection.create(view.state.doc, targetPos)),
            null
          );

          view.dispatch(tr.scrollIntoView());
          event.preventDefault();

          return true;
        }

        const imagePos = findImagePosAtSelectionBoundary(view.state, event.key);

        if (imagePos === null) {
          return false;
        }

        view.dispatch(setExplicitImageSelection(view.state.tr, imagePos));
        event.preventDefault();

        return true;
      },
    },
    view(editorView) {
      return new ImageArrowSelectionView(editorView);
    },
  });
}

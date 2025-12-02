import { Plugin } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { MdContext } from '@t/spec';

const CURSOR_LINE_CLASS = 'toastui-editor-md-cursor-line';

export function cursorLineHighlight({ eventEmitter }: MdContext) {
  return new Plugin({
    state: {
      init(_, state) {
        return createDecorations(state);
      },
      apply(tr, decorationSet, oldState, newState) {
        // Only update decorations if selection changed or document changed
        if (tr.docChanged || !oldState.selection.eq(newState.selection)) {
          return createDecorations(newState);
        }
        return decorationSet;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}

function createDecorations(state: any): DecorationSet {
  const { doc, selection } = state;
  const { from } = selection;

  // Get the position info for the current line
  const $from = doc.resolve(from);
  const lineStart = $from.start();
  const lineEnd = $from.end();

  // Create a decoration for the entire line (node decoration)
  const decorations: Decoration[] = [];

  // Get the index of the paragraph/block containing the cursor
  const index = doc.content.findIndex(from);
  if (index.index >= 0 && index.index < doc.childCount) {
    // Calculate the position of the paragraph node
    let pos = 0;
    for (let i = 0; i < index.index; i++) {
      pos += doc.child(i).nodeSize;
    }

    const node = doc.child(index.index);
    // Add node decoration to highlight the entire paragraph/line
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: CURSOR_LINE_CLASS,
      })
    );
  }

  return DecorationSet.create(doc, decorations);
}

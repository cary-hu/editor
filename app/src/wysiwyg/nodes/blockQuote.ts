import { DOMOutputSpec, ProsemirrorNode } from 'prosemirror-model';
import { wrapIn, Command } from 'prosemirror-commands';
import { TextSelection } from 'prosemirror-state';

import NodeSchema from '@/spec/node';
import {
  createDOMInfoParsedRawHTML,
  getCustomAttrs,
  getDefaultCustomAttrs,
} from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

export class BlockQuote extends NodeSchema {
  get name() {
    return 'blockQuote';
  }

  get schema() {
    return {
      attrs: {
        bqType: { default: 'default' },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      content: 'block+',
      group: 'block',
      parseDOM: [
        {
          tag: 'blockquote',
          getAttrs(dom: HTMLElement) {
            const bqType = dom.getAttribute('data-block-quote-type') || 'default';

            return { bqType };
          },
        },
        createDOMInfoParsedRawHTML('blockquote'),
      ],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        const customAttrs = getCustomAttrs(attrs);
        const domAttrs = {
          ...customAttrs,

          'data-block-quote-type': attrs.bqType || 'default',
        };

        return ['blockquote', domAttrs, 0];
      },
    };
  }

  commands(): EditorCommand {
    return (payload) => (state, dispatch) => {
      if (!state || !state.selection) {
        return false;
      }

      const { bqType = 'default' } = payload || {};
      const blockQuoteNode = state.schema.nodes.blockQuote;
      const { $from } = state.selection;
      const { tr } = state;

      // Check if cursor is in a code block, table, or has inline code mark - if so, disable blockquote
      // Check for code blocks and tables: look for nodes with code: true in schema, codeBlock type, or table-related types
      for (let d = $from.depth; d >= 0; d -= 1) {
        const node = $from.node(d);

        // Disable blockquote in code blocks
        if (node.type.spec.code === true || node.type.name === 'codeBlock') {
          return false; // Disable blockquote when in code block
        }

        // Disable blockquote in tables (any table-related node)
        if (
          node.type.name === 'table' ||
          node.type.name === 'tableHead' ||
          node.type.name === 'tableBody' ||
          node.type.name === 'tableRow' ||
          node.type.name === 'tableHeadCell' ||
          node.type.name === 'tableBodyCell'
        ) {
          return false; // Disable blockquote when in table
        }
      }

      // Check for inline code mark
      const codeMarkType = state.schema.marks.code;

      if (codeMarkType && codeMarkType.isInSet($from.marks())) {
        return false; // Disable blockquote when inline code mark is active
      }

      // Check if we're already inside a blockquote
      let currentBlockQuoteNode = null;
      let currentBlockQuotePos = -1;

      for (let d = $from.depth; d >= 0; d -= 1) {
        if ($from.node(d).type === blockQuoteNode) {
          currentBlockQuoteNode = $from.node(d);
          currentBlockQuotePos = $from.start(d) - 1;
          break;
        }
      }

      if (currentBlockQuoteNode) {
        // We're inside a blockquote
        const currentBqType = currentBlockQuoteNode.attrs.bqType || 'default';

        if (currentBqType === bqType) {
          // Same type - unwrap (remove blockquote) by replacing with its content
          if (dispatch) {
            const blockQuoteStart = currentBlockQuotePos;
            const blockQuoteEnd = currentBlockQuotePos + currentBlockQuoteNode.nodeSize;

            // Replace the blockquote with its content directly
            const newTr = tr.replaceWith(
              blockQuoteStart,
              blockQuoteEnd,
              currentBlockQuoteNode.content
            );

            // Calculate new cursor position
            const cursorOffset = $from.pos - blockQuoteStart;
            const newCursorPos =
              blockQuoteStart + Math.min(cursorOffset - 1, currentBlockQuoteNode.content.size - 1);

            if (newCursorPos >= 0) {
              const $newPos = newTr.doc.resolve(Math.max(0, newCursorPos));

              newTr.setSelection(TextSelection.near($newPos));
            }

            dispatch(newTr);
          }

          return true;
        }

        // Different type - change the type by replacing the entire blockquote
        if (dispatch) {
          // Get the range of the blockquote node
          const blockQuoteStart = currentBlockQuotePos;
          const blockQuoteEnd = currentBlockQuotePos + currentBlockQuoteNode.nodeSize;

          // Create a new blockquote node with the new type and same content
          const newBlockQuote = blockQuoteNode.create(
            { ...currentBlockQuoteNode.attrs, bqType },
            currentBlockQuoteNode.content
          );

          // Calculate the cursor position relative to the blockquote start
          const cursorOffset = $from.pos - blockQuoteStart;

          // Replace the entire blockquote node
          const newTr = tr.replaceWith(blockQuoteStart, blockQuoteEnd, newBlockQuote);

          // Restore cursor position within the new blockquote
          const newCursorPos = blockQuoteStart + Math.min(cursorOffset, newBlockQuote.nodeSize - 1);
          const $newPos = newTr.doc.resolve(newCursorPos);

          newTr.setSelection(TextSelection.near($newPos));

          dispatch(newTr);
        }

        return true;
      }

      // Not in a blockquote - create new one
      // Try standard wrapIn first
      if (wrapIn(blockQuoteNode, { bqType })(state)) {
        return wrapIn(blockQuoteNode, { bqType })(state, dispatch);
      }

      // If wrapIn fails (e.g., we're in a list), try to find wrappable content
      if (dispatch) {
        const { $to } = state.selection;
        const range = $from.blockRange($to);

        if (range) {
          // Check if we're in a list - if so, wrap the entire list
          for (let d = $from.depth; d >= 0; d -= 1) {
            const node = $from.node(d);
            const nodePos = $from.start(d) - 1;

            // If we find a list node (bulletList or orderedList), wrap it
            if (
              (node.type.name === 'bulletList' || node.type.name === 'orderedList') &&
              nodePos >= 0
            ) {
              const nodeStart = nodePos;
              const nodeEnd = nodeStart + node.nodeSize;

              // Create new blockquote containing the list
              const newBlockQuote = blockQuoteNode.create({ bqType }, node);

              // Replace the list with blockquote containing it
              const newTr = tr.replaceWith(nodeStart, nodeEnd, newBlockQuote);

              // Position cursor at the start of the first list item content
              const newCursorPos = nodeStart + 2; // blockquote + list wrapper
              const $newPos = newTr.doc.resolve(Math.min(newCursorPos, newTr.doc.content.size - 1));

              newTr.setSelection(TextSelection.near($newPos));

              dispatch(newTr);
              return true;
            }
          }

          // Try to wrap the current block range
          const rangeStart = range.start - 1;
          const rangeEnd = range.end;

          if (rangeStart >= 0) {
            const { content } = tr.doc.slice(range.start, range.end);

            if (content.size > 0) {
              const newBlockQuote = blockQuoteNode.create({ bqType }, content);
              const newTr = tr.replaceWith(rangeStart, rangeEnd, newBlockQuote);

              // Maintain cursor position
              const cursorOffset = $from.pos - range.start;
              const newCursorPos =
                rangeStart + Math.min(cursorOffset + 1, newBlockQuote.nodeSize - 1);
              const $newPos = newTr.doc.resolve(Math.max(0, newCursorPos));

              newTr.setSelection(TextSelection.near($newPos));

              dispatch(newTr);
              return true;
            }
          }
        }
      }

      return false;
    };
  }

  keymaps() {
    const blockQuoteCommand: Command = (state, dispatch) => {
      const editorCommand = this.commands();

      return editorCommand({ bqType: 'default' })(state, dispatch);
    };

    return {
      'Alt-q': blockQuoteCommand,
      'Alt-Q': blockQuoteCommand,
    };
  }
}

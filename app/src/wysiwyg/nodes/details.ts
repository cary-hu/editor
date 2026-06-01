import { DOMOutputSpec, Fragment, ProsemirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Command } from 'prosemirror-commands';

import NodeSchema from '@/spec/node';
import {
  createDOMInfoParsedRawHTML,
  getCustomAttrs,
  getDefaultCustomAttrs,
} from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

function getPlainTextSelection(state: EditorState) {
  const { doc, selection } = state;

  if (selection.empty || selection.$from.parent !== selection.$to.parent) {
    return null;
  }

  const { parent } = selection.$from;

  if (!parent.isTextblock) {
    return null;
  }

  const text = doc.textBetween(selection.from, selection.to, '\n');

  return text && !text.includes('\n') ? text : null;
}

function getSelectedBlockContent(state: EditorState) {
  const { doc, selection } = state;
  const range = selection.$from.blockRange(selection.$to);

  if (!range) {
    return null;
  }

  return doc.slice(range.start, range.end).content;
}

function isInDetails(state: EditorState) {
  const { selection } = state;

  for (let { depth } = selection.$from; depth >= 0; depth -= 1) {
    if (selection.$from.node(depth).type.name === 'details') {
      return true;
    }
  }

  return false;
}

function containsDetails(state: EditorState, from: number, to: number) {
  let hasDetails = false;

  state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'details') {
      hasDetails = true;
      return false;
    }

    return !hasDetails;
  });

  return hasDetails;
}

export class Details extends NodeSchema {
  get name() {
    return 'details';
  }

  get schema() {
    return {
      attrs: {
        bqType: { default: 'default' },
        open: { default: false },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      content: 'summary detailsBody',
      group: 'block',
      parseDOM: [
        {
          tag: 'details[data-block-quote-details="true"]',
          getAttrs(dom: HTMLElement) {
            return {
              bqType:
                dom.getAttribute('data-detail-summary-type') ||
                dom.getAttribute('data-block-quote-type') ||
                'default',
              open: dom.hasAttribute('open'),
            };
          },
        },
        {
          tag: 'details[data-detail-summary-type]',
          getAttrs(dom: HTMLElement) {
            return {
              bqType: dom.getAttribute('data-detail-summary-type') || 'default',
              open: dom.hasAttribute('open'),
            };
          },
        },
        createDOMInfoParsedRawHTML('details'),
      ],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        const domAttrs = {
          ...getCustomAttrs(attrs),
          'data-detail-summary-type': attrs.bqType || 'default',
          'data-block-quote-details': 'true',
        };

        if (attrs.open) {
          domAttrs.open = '';
        }

        return ['details', domAttrs, 0];
      },
    };
  }

  commands(): EditorCommand {
    return () => (state, dispatch) => {
      const { schema, selection, tr } = state;
      const { details, summary, detailsBody, paragraph } = schema.nodes;

      if (!details || !summary || !detailsBody || !paragraph) {
        return false;
      }

      if (isInDetails(state)) {
        return false;
      }

      const plainText = getPlainTextSelection(state);
      const summaryText = schema.text(plainText || 'Summary');
      const summaryNode = summary.create(null, summaryText);
      const selectedBlockContent = plainText ? null : getSelectedBlockContent(state);
      const bodyContent = selectedBlockContent?.size
        ? selectedBlockContent
        : Fragment.from(paragraph.create());
      const bodyNode = detailsBody.create(null, bodyContent);
      const detailsNode = details.create({ bqType: 'default', open: true }, [
        summaryNode,
        bodyNode,
      ]);
      const range = selection.$from.blockRange(selection.$to);
      const insertPos = plainText
        ? selection.$from.before(selection.$from.depth || 1)
        : range?.start || selection.$from.before(selection.$from.depth || 1);
      const replaceTo = plainText
        ? selection.$from.after(selection.$from.depth || 1)
        : range?.end || selection.$from.after(selection.$from.depth || 1);

      if (containsDetails(state, insertPos, replaceTo)) {
        return false;
      }

      if (dispatch) {
        const nextTr = tr.replaceWith(insertPos, replaceTo, detailsNode);
        const summaryStartPos = insertPos + 2;
        const summaryEndPos = summaryStartPos + summaryText.nodeSize;

        nextTr.setSelection(TextSelection.create(nextTr.doc, summaryStartPos, summaryEndPos));
        dispatch(nextTr.scrollIntoView());
      }

      return true;
    };
  }

  keymaps() {
    const detailsCommand: Command = (state, dispatch) => this.commands()()(state, dispatch);

    return {
      'Alt-d': detailsCommand,
      'Alt-D': detailsCommand,
    };
  }
}

import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { findCellElement } from '@/wysiwyg/helper/table';
import i18n from '@/i18n/i18n';

import { Emitter } from '@t/event';
import toArray from 'tui-code-snippet/collection/toArray';

interface ContextMenuInfo {
  action: string;
  command: string;
  payload?: {
    align: string;
  };
  className: string;
  disableInThead?: boolean;
}

const TABLE_CELL_SELECT_CLASS = '.toastui-editor-cell-selected';
function hasSpanAttr(tableCell: Element) {
  return (
    Number(tableCell.getAttribute('colspan')) > 1 || Number(tableCell.getAttribute('rowspan')) > 1
  );
}

function hasSpanningCell(headOrBody: Element) {
  return toArray(headOrBody.querySelectorAll(TABLE_CELL_SELECT_CLASS)).some(hasSpanAttr);
}

function isCellSelected(headOrBody: Element) {
  return !!headOrBody.querySelectorAll(TABLE_CELL_SELECT_CLASS).length;
}
function createMergedTableContextMenu(tableCell: Element) {
  const headOrBody = tableCell.parentElement!.parentElement!;
  const mergedTableContextMenu = [];

  if (isCellSelected(headOrBody)) {
    mergedTableContextMenu.push({
      action: 'Merge cells',
      command: 'mergeCells',
      className: 'merge-cells',
    });
  }

  if (hasSpanAttr(tableCell) || hasSpanningCell(headOrBody)) {
    mergedTableContextMenu.push({
      action: 'Split cells',
      command: 'splitCells',
      className: 'split-cells',
    });
  }

  return mergedTableContextMenu;
}

const contextMenuGroups: ContextMenuInfo[][] = [
  [
    {
      action: 'Add row to up',
      command: 'addRowToUp',
      disableInThead: true,
      className: 'add-row-up',
    },
    {
      action: 'Add row to down',
      command: 'addRowToDown',
      disableInThead: true,
      className: 'add-row-down',
    },
    { action: 'Remove row', command: 'removeRow', disableInThead: true, className: 'remove-row' },
  ],
  [
    { action: 'Add column to left', command: 'addColumnToLeft', className: 'add-column-left' },
    { action: 'Add column to right', command: 'addColumnToRight', className: 'add-column-right' },
    { action: 'Remove column', command: 'removeColumn', className: 'remove-column' },
  ],
  [
    {
      action: 'Align column to left',
      command: 'alignColumn',
      payload: { align: 'left' },
      className: 'align-column-left',
    },
    {
      action: 'Align column to center',
      command: 'alignColumn',
      payload: { align: 'center' },
      className: 'align-column-center',
    },
    {
      action: 'Align column to right',
      command: 'alignColumn',
      payload: { align: 'right' },
      className: 'align-column-right',
    },
  ],
  [{ action: 'Remove table', command: 'removeTable', className: 'remove-table' }],
];

function getContextMenuGroups(eventEmitter: Emitter, inTableHead: boolean, tableCell: Element) {
  const mergedTableContextMenu = createMergedTableContextMenu(tableCell);

  return contextMenuGroups.concat([mergedTableContextMenu])
    .map((contextMenuGroup) =>
      contextMenuGroup.map(({ action, command, payload, disableInThead, className }) => {
        return {
          label: i18n.get(action),
          onClick: () => {
            eventEmitter.emit('command', command, payload);
          },
          disabled: inTableHead && !!disableInThead,
          className,
        };
      })
    )
    .concat();
}

export function tableContextMenu(eventEmitter: Emitter) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        contextmenu: (view: EditorView, ev: Event) => {
          const tableCell = findCellElement(ev.target as HTMLElement, view.dom);

          if (tableCell) {
            ev.preventDefault();

            let { clientX, clientY } = ev as MouseEvent;
            const { left, top } = (view.dom.parentNode as HTMLElement).getBoundingClientRect();
            const inTableHead = tableCell.nodeName === 'TH';

            const contextMenuHeight = 330;
            const contextMenuWidth = 90;

            if (clientX + contextMenuWidth > window.innerWidth) {
              clientX -= contextMenuWidth;
            }

            if (clientY + contextMenuHeight > window.innerHeight) {
              clientY -= contextMenuHeight;
            }

            eventEmitter.emit('contextmenu', {
              pos: { left: `${clientX - left + 10}px`, top: `${clientY - top + 30}px` },
              menuGroups: getContextMenuGroups(eventEmitter, inTableHead, tableCell),
              tableCell,
            });

            return true;
          }

          return false;
        },
      },
    },
  });
}

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
  icon: string;
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
      icon: 'merge-cells'
    });
  }

  if (hasSpanAttr(tableCell) || hasSpanningCell(headOrBody)) {
    mergedTableContextMenu.push({
      action: 'Split cells',
      command: 'splitCells',
      icon: 'split-cell'
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
      icon: 'row-plus-before',
    },
    {
      action: 'Add row to down',
      command: 'addRowToDown',
      disableInThead: true,
      icon: 'row-plus-after',
    },
    {
      action: 'Remove row',
      command: 'removeRow',
      disableInThead: true,
      icon: 'row-remove'
    },
  ],
  [
    {
      action: 'Add column to left',
      command: 'addColumnToLeft',
      icon: 'column-plus-before',
    },
    {
      action: 'Add column to right',
      command: 'addColumnToRight',
      icon: 'column-plus-after',
    },
    {
      action: 'Remove column',
      command: 'removeColumn',
      icon: 'column-remove',
    },
  ],
  [
    {
      action: 'Align column to left',
      command: 'alignColumn',
      payload: { align: 'left' },
      icon: 'align-item-left-line'
    },
    {
      action: 'Align column to center',
      command: 'alignColumn',
      payload: { align: 'center' },
      icon: 'align-item-horizontal-center-line'
    },
    {
      action: 'Align column to right',
      command: 'alignColumn',
      payload: { align: 'right' },
      icon: 'align-item-right-line'
    },
  ],
  [
    {
      action: 'Remove table',
      command: 'removeTable',
      icon: 'remove'
    }
  ],

];

function getContextMenuGroups(eventEmitter: Emitter, inTableHead: boolean, tableCell: Element) {
  const mergedTableContextMenu = createMergedTableContextMenu(tableCell);

  return contextMenuGroups.concat([mergedTableContextMenu])
    .map((contextMenuGroup) =>
      contextMenuGroup.map(({ action, command, payload, disableInThead, icon }) => {
        return {
          label: i18n.get(action),
          icon: `table-${icon}`,
          onClick: () => {
            eventEmitter.emit('command', command, payload);
          },
          disabled: inTableHead && !!disableInThead,
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

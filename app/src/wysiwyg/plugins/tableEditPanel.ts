import { Plugin, PluginKey } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';

import { TableOffsetMap } from '@/wysiwyg/helper/tableOffsetMap';
import CellSelection from '@/wysiwyg/plugins/selection/cellSelection';
import { EditPanel } from './editPanel';
import { cls } from '@/utils/dom';
import i18n from '@/i18n/i18n';

interface TableEditPanelState {
  isVisible: boolean;
  tableElement: HTMLElement | null;
  overlay: HTMLElement | null;
  panel: HTMLElement | null;
  toolbar: HTMLElement | null;
  activeEditType: 'row' | 'column' | null;
  activeEditIndex: number | null;
  activeControl: HTMLElement | null;
  editMask: HTMLElement | null;
}

class TableEditPanelView extends EditPanel {
  private state: TableEditPanelState = {
    isVisible: false,
    tableElement: null,
    overlay: null,
    panel: null,
    toolbar: null,
    activeControl: null,
    activeEditType: null,
    activeEditIndex: null,
    editMask: null,
  };
  private lastShowTime = 0;

  constructor(view: EditorView, eventEmitter: Emitter) {
    super(view, eventEmitter);

  }

  protected preparePanel(): void {
    this.handleTableClick = this.handleTableClick.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.init();
  }

  private init() {
    this.view.dom.addEventListener('click', this.handleTableClick, true);
    // Listen for clicks on the document to hide panel when clicking outside
    document.addEventListener('click', this.handleDocumentClick, true);
  }

  private handleTableClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const tableElement = target.closest('table');
    
    if (!tableElement) {
      return;
    }
    
    // If already in edit mode for this table, let the document click handler deal with it
    if (this.state.activeEditType !== null && this.state.tableElement === tableElement) {
      return;
    }
    
    // If clicking on the same table that's already shown, don't re-show
    if (this.state.tableElement === tableElement && this.state.isVisible) {
      return;
    }
    
    // Show panel for new table
    this.showPanel(tableElement);
    // Don't stopPropagation here to allow contextMenu to handle closing
  }

  private isTableOrPanelElement(element: HTMLElement): boolean {
    return !!(element.closest('table') || element.closest(`.${cls('table-edit-panel')}`));
  }

  private showPanel(tableElement: HTMLElement) {
    // Hide existing panel if any
    this.hide();
    this.setAsActivePanel();
    this.state.tableElement = tableElement;
    this.lastShowTime = Date.now(); // Record when panel was shown
    this.createPanel();
    this.createOverlay();
    this.createDeleteButton();
    this.createCellEditControls();
    this.state.isVisible = true;
  }

  private hideIfNotEditing() {
    if (this.state.activeEditType !== null) {
      return;
    }
    this.hide();
  }

  protected updatePosition() {
    if (!this.state.isVisible || !this.state.tableElement || !this.isPanelReady || !this.state.panel) {
      return;
    }

    const tableRect = this.state.tableElement.getBoundingClientRect();
    const containerRect = this.editPanelContainer.getBoundingClientRect();
    const viewportOffset = { left: -10, top: -10 };

    // Calculate position relative to editPanelContainer
    this.state.panel.style.left = `${tableRect.left - containerRect.left + viewportOffset.left}px`;
    this.state.panel.style.top = `${tableRect.top - containerRect.top + viewportOffset.top}px`;
    this.state.panel.style.width = `${tableRect.width + 10}px`;
    this.state.panel.style.height = `${tableRect.height + 10}px`;
  }

  /**
   * Recreates the entire panel and its controls to handle table structure changes
   */
  private recreatePanel() {
    if (!this.state.isVisible || !this.state.tableElement) {
      return;
    }

    // Store current table element
    const currentTable = this.state.tableElement;

    // Show panel again with updated structure
    this.showPanel(currentTable);
  }

  /**
   * Force hide the panel without checking activeEditType
   */
  protected hide() {
    if (this.state.panel) {
      this.state.panel.remove();
      this.state.panel = null;
    }
    if (this.state.overlay) {
      this.state.overlay.remove();
      this.state.overlay = null;
    }
    this.hideToolbar();
    this.state.isVisible = false;
    this.state.tableElement = null;
  }

  private createPanel() {
    if (!this.state.tableElement) return;

    const panel = document.createElement('div');

    panel.className = cls('table-edit-panel');

    // Position the panel to cover the table
    const tableRect = this.state.tableElement.getBoundingClientRect();
    const containerRect = this.editPanelContainer.getBoundingClientRect();
    const viewportOffset = { left: -10, top: -10 };

    // Use positioning relative to editPanelContainer
    panel.style.left = `${tableRect.left - containerRect.left + viewportOffset.left}px`;
    panel.style.top = `${tableRect.top - containerRect.top + viewportOffset.top}px`;
    panel.style.width = `${tableRect.width + 10}px`;
    panel.style.height = `${tableRect.height + 10}px`;

    this.editPanelContainer.appendChild(panel);
    this.state.panel = panel;
  }

  private createOverlay() {
    if (!this.state.panel || !this.state.tableElement) return;

    const overlay = document.createElement('div');

    overlay.className = cls('table-edit-overlay');

    this.state.panel.appendChild(overlay);
    this.state.overlay = overlay;
  }

  private createDeleteButton() {
    if (!this.state.panel) return;

    const deleteBtn = document.createElement('div');

    deleteBtn.className = cls('delete-table-btn');
    deleteBtn.innerHTML = `<i class="${cls("icon")} table-remove"></i>`;
    deleteBtn.title = 'Delete table';

    // Click event for the delete button
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.deleteTable();
    });

    this.state.panel.appendChild(deleteBtn);
  }

  private deleteTable() {
    if (!this.state.tableElement) return;
    // Find the table position in the document and set selection
    const { state, dispatch } = this.view;
    const { doc, tr } = state;
    let tablePos: number | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;
        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;
          return false;
        }
      }
      return true;
    });
    if (tablePos === null) return;
    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);
    if (!map) return;
    // Create cell selection for the table
    const startCellPos = doc.resolve(map.getCellInfo(0, 0).offset);
    const endCellPos = doc.resolve(map.getCellInfo(map.totalRowCount - 1, map.totalColumnCount - 1).offset);
    const cellSelection = new CellSelection(startCellPos, endCellPos);
    dispatch!(tr.setSelection(cellSelection));
    // Use event emitter to execute the removeTable command
    this.eventEmitter.emit('command', 'removeTable');
    this.hideIfNotEditing();
  }

  private addRow(rowIndex: number) {
    if (!this.state.tableElement) return;

    // Find the table element in the document and get the table offset map
    const { state, dispatch } = this.view;
    const { doc, tr } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;

          return false;
        }
      }

      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);

    if (!map) return;

    // Calculate the target position for row insertion
    // Since we don't allow insertion above header, all row insertions are "below" operations
    // - rowIndex 1 means insert after row 0 (header)
    // - rowIndex 2 means insert after row 1, etc.
    const targetColIdx = 0; // Always use first column to set selection

    // All insertions are after existing rows, so target row is rowIndex - 1
    let targetRowIdx = Math.min(rowIndex - 1, map.totalRowCount - 1);
    let command = 'addRowToDown';
    let direction: 'up' | 'down' = 'down';

    if (targetRowIdx === 0) {
      targetRowIdx = 1;
      command = 'addRowToUp';
      direction = 'up'; // Insert above first body row
    }

    // Get the cell offset for the target position
    const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
    const startCellPos = doc.resolve(cellOffset);
    const endCellPos = startCellPos;

    // Create cell selection and set it
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(cellSelection));

    // Use event emitter to execute the command
    this.eventEmitter.emit('command', command);

    this.setCellSelection(tablePos, direction);
  }

  private addColumn(columnIndex: number) {
    if (!this.state.tableElement) return;

    // Find the table element in the document and get the table offset map
    const { state, dispatch } = this.view;
    const { doc, tr } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;

          return false;
        }
      }

      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);

    if (!map) return;

    // Calculate the target position for column insertion
    // Column buttons are positioned between columns, so:
    // - Button 0 (leftmost) inserts before column 0
    // - Button 1 (between col 0 and 1) inserts after column 0
    // - Button 2 (between col 1 and 2) inserts after column 1, etc.
    const targetRowIdx = 0; // Always use first row to set selection

    let targetColIdx: number;
    let command: string;
    let direction: 'left' | 'right';

    if (columnIndex === 0) {
      // Leftmost button - insert left of first column
      targetColIdx = 0;
      command = 'addColumnToLeft';
      direction = 'left';
    } else {
      // Other buttons - insert right of the column to the left
      targetColIdx = columnIndex - 1;
      command = 'addColumnToRight';
      direction = 'right';
    }

    // Ensure target column index is valid
    targetColIdx = Math.min(targetColIdx, map.totalColumnCount - 1);

    // Get the cell offset for the target position
    const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
    const startCellPos = doc.resolve(cellOffset);
    const endCellPos = startCellPos;

    // Create cell selection and set it
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(cellSelection));

    // Use event emitter to execute the command
    this.eventEmitter.emit('command', command);

    this.setCellSelection(tablePos, direction);
  }

  /**
   * Will select the new Added cell
   * @param tablePos - The position of the table in the document
   * @param direction - The direction where the new cell was added ('up', 'down', 'left', 'right')
   */
  private setCellSelection(
    tablePos: number | null = null,
    direction: 'up' | 'down' | 'left' | 'right' = 'down'
  ) {
    const { state, dispatch } = this.view;
    const { doc } = state;

    if (tablePos === null) return;

    try {
      const cellPos = doc.resolve(tablePos);
      const map = TableOffsetMap.create(cellPos);

      if (!map) return;

      // Get the current selection to determine the newly added cell position
      const { selection } = state;
      let targetRowIdx = 0;
      let targetColIdx = 0;

      // If there's a current cell selection, use it as reference
      if (selection instanceof CellSelection) {
        const selectionInfo = map.getRectOffsets(selection.startCell, selection.endCell);

        switch (direction) {
          case 'down':
            // New row was added below, select the first cell of the new row
            targetRowIdx = selectionInfo.endRowIdx + 1;
            targetColIdx = selectionInfo.startColIdx;
            break;
          case 'up':
            // New row was added above, select the first cell of the new row
            targetRowIdx = selectionInfo.startRowIdx - 1;
            targetColIdx = selectionInfo.startColIdx;
            break;
          case 'right':
            // New column was added to the right, select the first cell of the new column
            targetRowIdx = selectionInfo.startRowIdx;
            targetColIdx = selectionInfo.endColIdx + 1;
            break;
          case 'left':
            // New column was added to the left, select the first cell of the new column
            targetRowIdx = selectionInfo.startRowIdx;
            targetColIdx = selectionInfo.startColIdx - 1;
            break;
          default:
            throw new Error(`Unknown direction: ${direction}`);
        }
      } else {
        // No cell selection, determine position based on direction and table bounds
        switch (direction) {
          case 'down':
            targetRowIdx = map.totalRowCount - 1; // Last row (newly added)
            targetColIdx = 0;
            break;
          case 'up':
            targetRowIdx = 1; // First body row (header is 0)
            targetColIdx = 0;
            break;
          case 'right':
            targetRowIdx = 0;
            targetColIdx = map.totalColumnCount - 1; // Last column (newly added)
            break;
          case 'left':
            targetRowIdx = 0;
            targetColIdx = 0; // First column (newly added)
            break;
          default:
            throw new Error(`Unknown direction: ${direction}`);
        }
      }

      // Ensure the target position is within table bounds
      targetRowIdx = Math.max(0, Math.min(targetRowIdx, map.totalRowCount - 1));
      targetColIdx = Math.max(0, Math.min(targetColIdx, map.totalColumnCount - 1));

      // Get the cell offset for the target position
      const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
      const startCellPos = doc.resolve(cellOffset);

      // Create cell selection for the newly added cell
      const cellSelection = new CellSelection(startCellPos, startCellPos);
      const tr = state.tr.setSelection(cellSelection);

      dispatch(tr);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to select newly added cell:', error);
    }
  }

  private removeRow(rowIndex: number) {
    if (!this.state.tableElement) return;

    // Find the table element in the document and get the table offset map
    const { state, dispatch } = this.view;
    const { doc, tr } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;

          return false;
        }
      }

      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);

    if (!map) return;

    // Don't allow deletion of header row (index 0) or if only one body row exists
    if (rowIndex === 0 || map.totalRowCount <= 2) return;

    // Calculate the target position for row deletion
    const targetColIdx = 0; // Always use first column to set selection
    const targetRowIdx = rowIndex;

    // Get the cell offset for the target position
    const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
    const startCellPos = doc.resolve(cellOffset);
    const endCellPos = startCellPos;

    // Create cell selection and set it
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(cellSelection));

    // Use event emitter to execute the removeRow command
    this.eventEmitter.emit('command', 'removeRow');
  }

  private removeColumn(columnIndex: number) {
    if (!this.state.tableElement) return;

    // Find the table element in the document and get the table offset map
    const { state, dispatch } = this.view;
    const { doc, tr } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;

          return false;
        }
      }

      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);

    if (!map) return;

    // Don't allow deletion if only one column exists
    if (map.totalColumnCount <= 1) return;

    // Calculate the target position for column deletion
    const targetRowIdx = 0; // Always use first row to set selection
    const targetColIdx = columnIndex;

    // Get the cell offset for the target position
    const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
    const startCellPos = doc.resolve(cellOffset);
    const endCellPos = startCellPos;

    // Create cell selection and set it
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(cellSelection));

    // Use event emitter to execute the removeColumn command
    this.eventEmitter.emit('command', 'removeColumn');
  }

  /**
   * Check if cells can be merged (multiple cells are selected and mergeable)
   */
  private canMergeCells(): boolean {
    const { state } = this.view;
    const { selection } = state;

    // @ts-ignore
    if (!selection.isCellSelection) return false;

    // @ts-ignore
    const startPos = selection.startCell.pos;
    // @ts-ignore
    const endPos = selection.endCell.pos;

    // Must have different start and end positions (multiple cells selected)
    if (startPos === endPos) return false;

    // Get the table map to check if the selection is valid for merging
    try {
      // @ts-ignore
      const map = TableOffsetMap.create(selection.startCell);
      if (!map) return false;

      // @ts-ignore
      const selectionInfo = map.getRectOffsets(selection.startCell, selection.endCell);
      const { startRowIdx, startColIdx, endRowIdx, endColIdx } = selectionInfo;

      // Check if this would be merging header and body (not allowed)
      const hasTableHead = startRowIdx === 0 && endRowIdx > startRowIdx;
      if (hasTableHead) return false;

      // Check if we're trying to merge the entire table (not allowed)
      const { totalRowCount, totalColumnCount } = map;
      const rowCount = endRowIdx - startRowIdx + 1;
      const columnCount = endColIdx - startColIdx + 1;
      const allSelected = rowCount >= totalRowCount - 1 && columnCount === totalColumnCount;
      if (allSelected) return false;

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if cells can be split (selected cell/cells have colspan or rowspan)
   */
  private canSplitCells(): boolean {
    const { state } = this.view;
    const { selection } = state;

    if (!this.state.tableElement) return false;

    // @ts-ignore
    if (!selection.isCellSelection) return false;

    try {
      // @ts-ignore
      const map = TableOffsetMap.create(selection.startCell);
      if (!map) return false;

      // @ts-ignore
      const selectionInfo = map.getRectOffsets(selection.startCell, selection.endCell);
      const { startRowIdx, startColIdx, endRowIdx, endColIdx } = selectionInfo;

      // Check if any cell in the selection has colspan or rowspan
      for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx++) {
        for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx++) {
          // Skip extended cells (they are part of a spanning cell but not the root)
          if (map.extendedRowSpan(rowIdx, colIdx) || map.extendedColSpan(rowIdx, colIdx)) {
            continue;
          }

          // Find the DOM element for this cell
          const cellInfo = map.getCellInfo(rowIdx, colIdx);
          const domNode = this.view.domAtPos(cellInfo.offset + 1).node;
          let cellElement: Node | null = domNode;

          // Find the actual td/th element
          while (cellElement && cellElement.nodeType === Node.TEXT_NODE) {
            cellElement = cellElement.parentNode;
          }
          while (cellElement && cellElement.nodeName !== 'TD' && cellElement.nodeName !== 'TH') {
            cellElement = cellElement.parentNode;
          }

          if (cellElement) {
            const colspan = parseInt((cellElement as HTMLElement).getAttribute('colspan') || '1');
            const rowspan = parseInt((cellElement as HTMLElement).getAttribute('rowspan') || '1');
            if (colspan > 1 || rowspan > 1) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Merge selected cells
   */
  private mergeCells(): void {
    this.eventEmitter.emit('command', 'mergeCells');
  }

  /**
   * Split selected cells
   */
  private splitCells(): void {
    this.eventEmitter.emit('command', 'splitCells');
  }

  protected documentChanged() {
    if (!this.state.isVisible || !this.state.tableElement || !this.isPanelReady) {
      return;
    }

    // Check if table structure has changed by comparing current row/column count
    // with the number of controls we have
    const currentRows = this.state.tableElement.querySelectorAll('tr').length;
    const currentCols = this.state.tableElement.querySelector('tr')?.querySelectorAll('th, td').length || 0;

    // Count existing controls
    const existingRowControls = this.state.panel?.querySelectorAll(`.${cls('row-hover-area')}`).length || 0;
    const existingColControls = this.state.panel?.querySelectorAll(`.${cls('col-hover-area')}`).length || 0;

    // If structure changed, recreate panel; otherwise just update position
    if (currentRows !== existingRowControls || currentCols !== existingColControls) {
      this.recreatePanel();
    } else {
      this.updatePosition();
    }
  }

  destroy() {
    this.view.dom.removeEventListener('click', this.handleTableClick, true);
    document.removeEventListener('click', this.handleDocumentClick, true);
    this.hideIfNotEditing();
    // Ensure we unregister as active panel
    this.unsetAsActivePanel();
  }

  private createCellEditControls() {
    if (!this.state.panel || !this.state.tableElement) return;

    const rows = this.state.tableElement.querySelectorAll('tr');
    const panelRect = this.state.tableElement.getBoundingClientRect();

    // First, create all row edit controls and hover areas
    rows.forEach((row, rowIndex) => {
      const rowRect = row.getBoundingClientRect();
      const rowTop = rowRect.top - panelRect.top + 10;
      const rowHeight = rowRect.height;

      // Row hover area - covers the row but leaves space for column controls
      const rowHoverArea = document.createElement('div');
      rowHoverArea.className = cls('row-hover-area');
      rowHoverArea.style.top = `${rowTop}px`;
      rowHoverArea.style.height = `${rowHeight}px`;

      // Click events
      const handleRowClick = (event: Event) => {
        event.stopPropagation();
        this.showToolbar(rowIndex, 'row', rowHoverArea);
      };

      rowHoverArea.addEventListener('click', handleRowClick);

      // Add row elements to panel
      this.state.panel!.appendChild(rowHoverArea);
    });

    // Then create all column edit controls and hover areas (these will be on top)
    if (rows.length > 0) {
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('th, td');

      cells.forEach((cell, colIndex) => {
        const cellRect = cell.getBoundingClientRect();
        const cellLeft = cellRect.left - panelRect.left + 10;
        const cellWidth = cellRect.width;

        // Column hover area - covers the entire column
        const colHoverArea = document.createElement('div');
        colHoverArea.className = cls('col-hover-area');
        colHoverArea.style.left = `${cellLeft}px`;
        colHoverArea.style.width = `${cellWidth}px`;

        // Click events
        const handleColClick = (event: Event) => {
          event.stopPropagation();
          this.showToolbar(colIndex, 'column', colHoverArea);
        };

        colHoverArea.addEventListener('click', handleColClick);

        // Add column elements to panel (these are added after row elements)
        this.state.panel!.appendChild(colHoverArea);
      });
    }
  }

  private showToolbar(rowIndex: number, toolBarType: 'row' | 'column', controlElement: HTMLElement) {
    // Hide existing toolbar
    this.hideToolbar();

    this.state.activeEditType = toolBarType;
    this.state.activeEditIndex = rowIndex;
    this.state.activeControl = controlElement;

    controlElement.classList.add('active');

    // Auto-select the row or column before showing toolbar
    this.autoSelectRowOrColumn(toolBarType, rowIndex);

    // Create edit mask for the row
    this.createEditMask(toolBarType, rowIndex);

    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = cls('table-edit-toolbar');

    // Position toolbar
    const controlRect = controlElement.getBoundingClientRect();
    const panelRect = this.state.panel!.getBoundingClientRect();
    let toolbarLeft = toolBarType === 'row' ? (controlRect.right - panelRect.left) : (controlRect.left - panelRect.left);
    let toolbarTop = toolBarType === 'row' ? (controlRect.top - panelRect.top - controlRect.height) : (controlRect.bottom - panelRect.top - 10 - 50);

    toolbar.style.left = `${toolbarLeft}px`;
    toolbar.style.top = `${toolbarTop}px`;

    // Create toolbar buttons
    const buttons = toolBarType === 'row' ?
      [
        {
          icon: 'table-row-plus-after',
          title: 'Add row to down',
          action: () => this.addRow(rowIndex + 1),
          changesStructure: true
        },
      ] :
      [
        {
          icon: 'table-column-plus-before',
          title: 'Add column to left',
          action: () => this.addColumn(rowIndex),
          changesStructure: true
        },
        {
          icon: 'table-column-plus-after',
          title: 'Add column to right',
          action: () => this.addColumn(rowIndex + 1),
          changesStructure: true
        },
        {
          icon: 'table-align-item-left-line',
          title: 'Align column to left',
          action: () => this.alignColumn(rowIndex, 'left'),
          changesStructure: false
        },
        {
          icon: 'table-align-item-horizontal-center-line',
          title: 'Align column to center',
          action: () => this.alignColumn(rowIndex, 'center'),
          changesStructure: false
        },
        {
          icon: 'table-align-item-right-line',
          title: 'Align column to right',
          action: () => this.alignColumn(rowIndex, 'right'),
          changesStructure: false
        },
      ];

    // Add merge/split cell buttons to both row and column toolbars
    // Check if cells can be merged
    if (this.canMergeCells()) {
      buttons.unshift({
        icon: 'table-merge-cells',
        title: 'Merge cells',
        action: () => this.mergeCells(),
        changesStructure: true
      });
    }

    // Check if cells can be split
    if (this.canSplitCells()) {
      buttons.unshift({
        icon: 'table-split-cell',
        title: 'Split cells',
        action: () => this.splitCells(),
        changesStructure: true
      });
    }
    if (toolBarType === 'row') {
      const totalRows = this.state.tableElement?.querySelectorAll('tbody tr').length || 0;
      if (rowIndex > 0) {
        buttons.push({
          icon: 'table-row-plus-before',
          title: 'Add row to up',
          action: () => this.addRow(rowIndex),
          changesStructure: true
        });
        if (totalRows > 1) {
          buttons.push({
            icon: 'table-row-remove',
            title: 'Remove row',
            action: () => this.removeRow(rowIndex),
            changesStructure: true
          });
        }
      }
    } else {
      const totalColumns = this.state.tableElement?.querySelector('tr')?.querySelectorAll('th, td').length || 0;
      if (totalColumns > 1) {
        buttons.push({
          icon: 'table-column-remove',
          title: 'Remove column',
          action: () => this.removeColumn(rowIndex),
          changesStructure: true
        });
      }
    }

    buttons.forEach(({ icon, title, action, changesStructure }) => {
      const button = document.createElement('button');
      button.className = cls('table-toolbar-btn');
      button.innerHTML = `<i class="${cls('icon')} ${icon}"></i>`;
      button.title = i18n.get(title);

      // Check if this is a delete button
      const isDeleteButton = icon === 'table-row-remove' || icon === 'table-column-remove';

      if (isDeleteButton) {
        // Add hover events for delete buttons to change mask color
        button.addEventListener('mouseenter', () => {
          this.setMaskColor('danger');
        });

        button.addEventListener('mouseleave', () => {
          this.setMaskColor('normal');
        });
      }

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        action();

        if (changesStructure) {
          // For operations that change table structure, recreate the entire panel
          setTimeout(() => {
            this.recreatePanel();
          }, 100); // Delay to allow DOM updates and command execution
        } else {
          // For operations that don't change structure, just update position
          this.updatePosition();
        }
      });

      toolbar.appendChild(button);
    });

    this.state.panel!.appendChild(toolbar);
    this.state.toolbar = toolbar;
  }
  private hideToolbar() {
    if (this.state.toolbar) {
      this.state.toolbar.remove();
      this.state.toolbar = null;
    }
    if (this.state.activeControl) {
      this.state.activeControl.classList.remove('active');
      this.state.activeControl = null;
    }
    if (this.state.editMask) {
      this.state.editMask.remove();
      this.state.editMask = null;
    }
    this.state.activeEditType = null;
    this.state.activeEditIndex = null;
  }

  private createEditMask(type: 'row' | 'column', index: number) {
    if (!this.state.panel || !this.state.tableElement) return;

    // Remove existing edit mask
    if (this.state.editMask) {
      this.state.editMask.remove();
      this.state.editMask = null;
    }

    const mask = document.createElement('div');
    mask.className = cls('table-edit-mask');

    const panelRect = this.state.tableElement.getBoundingClientRect();

    if (type === 'row') {
      // Create mask for the entire row
      const rows = this.state.tableElement.querySelectorAll('tr');
      if (index < rows.length) {
        const row = rows[index];
        const rowRect = row.getBoundingClientRect();
        const rowTop = rowRect.top - panelRect.top + 10;
        const rowHeight = rowRect.height;

        mask.style.top = `${rowTop}px`;
        mask.style.left = '0px';
        mask.style.width = '100%';
        mask.style.height = `${rowHeight}px`;
      }
    } else if (type === 'column') {
      // Create mask for the entire column
      const firstRow = this.state.tableElement.querySelector('tr');
      if (firstRow) {
        const cells = firstRow.querySelectorAll('th, td');
        if (index < cells.length) {
          const cell = cells[index];
          const cellRect = cell.getBoundingClientRect();
          const cellLeft = cellRect.left - panelRect.left + 10;
          const cellWidth = cellRect.width;

          mask.style.top = '0px';
          mask.style.left = `${cellLeft}px`;
          mask.style.width = `${cellWidth}px`;
          mask.style.height = '100%';
        }
      }
    }

    this.state.panel.appendChild(mask);
    this.state.editMask = mask;
  }

  /**
   * Set the color of the edit mask
   * @param mode - 'normal' for default color, 'danger' for red color
   */
  private setMaskColor(mode: 'normal' | 'danger') {
    if (!this.state.editMask) return;

    if (mode === 'danger') {
      this.state.editMask.classList.add('danger');
    } else {
      this.state.editMask.classList.remove('danger');
    }
  }

  private alignColumn(colIndex: number, alignment: 'left' | 'center' | 'right') {
    // Get table element in document
    const { state, dispatch } = this.view;
    const { doc } = state;

    let tablePos: number | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;
        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;
          return false;
        }
      }
      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);
    if (!map) return;

    // Select the column
    const firstCellInfo = map.getCellInfo(0, colIndex);
    const lastRowIdx = map.totalRowCount - 1;
    const lastCellInfo = map.getCellInfo(lastRowIdx, colIndex);

    const startCellPos = doc.resolve(firstCellInfo.offset);
    const endCellPos = doc.resolve(lastCellInfo.offset);

    const cellSelection = new CellSelection(startCellPos, endCellPos);
    const tr = state.tr.setSelection(cellSelection);
    dispatch(tr);

    // Execute align command
    this.eventEmitter.emit('command', 'alignColumn', { align: alignment });
  }

  private handleDocumentClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const now = Date.now();

    // Don't hide panel immediately after showing it (prevents event bubbling issues)
    if (now - this.lastShowTime < 100) {
      return;
    }

    // Check if contextMenu is visible - if so, don't interfere with its closing
    const contextMenu = document.querySelector(`.${cls('context-menu')}`);
    if (contextMenu && (contextMenu as HTMLElement).style.display !== 'none') {
      // Let contextMenu handle its own closing
      return;
    }

    // Check if clicking on specific panel elements that should not trigger any action
    const isClickingOnToolbar = target.closest(`.${cls('table-edit-toolbar')}`);
    const isClickingOnHoverArea = target.closest(`.${cls('row-hover-area')}`) || target.closest(`.${cls('col-hover-area')}`);

    // Don't do anything if clicking on toolbar or hover areas
    if (isClickingOnToolbar || isClickingOnHoverArea) {
      return;
    }

    // If we're in edit mode (toolbar is visible), hide it regardless of where we click
    if (this.state.activeEditType !== null) {
      this.hideToolbar();
      return;
    }

    // Check if clicking on table or panel elements
    const isClickingOnTableOrPanel = this.isTableOrPanelElement(target);

    // If clicking outside table or panel, hide the panel
    if (!isClickingOnTableOrPanel) {
      this.hideIfNotEditing();
    }
  }

  /**
   * Auto-select the entire row or column when toolbar is shown
   * @param type - 'row' or 'column'
   * @param index - row or column index
   */
  private autoSelectRowOrColumn(type: 'row' | 'column', index: number) {
    if (!this.state.tableElement) return;

    const { state, dispatch } = this.view;
    const { doc } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;
          return false;
        }
      }
      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);
    if (!map) return;

    try {
      let startCellPos, endCellPos;

      if (type === 'row') {
        // Select entire row
        const startColIdx = 0;
        const endColIdx = map.totalColumnCount - 1;
        const startCellInfo = map.getCellInfo(index, startColIdx);
        const endCellInfo = map.getCellInfo(index, endColIdx);

        startCellPos = doc.resolve(startCellInfo.offset);
        endCellPos = doc.resolve(endCellInfo.offset);
      } else {
        // Select entire column, but skip header (start from row 1 instead of 0)
        const startRowIdx = 1; // Skip header row (index 0)
        const endRowIdx = map.totalRowCount - 1;
        const startCellInfo = map.getCellInfo(startRowIdx, index);
        const endCellInfo = map.getCellInfo(endRowIdx, index);

        startCellPos = doc.resolve(startCellInfo.offset);
        endCellPos = doc.resolve(endCellInfo.offset);
      }

      // Create cell selection
      const cellSelection = new CellSelection(startCellPos, endCellPos);
      const tr = state.tr.setSelection(cellSelection);
      dispatch(tr);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to auto-select row/column:', error);
    }
  }
}

export function tableEditPanel(eventEmitter: Emitter): Plugin {
  return new Plugin({
    key: new PluginKey('tableEditPanel'),
    view: (view: EditorView) => new TableEditPanelView(view, eventEmitter),
  });
}

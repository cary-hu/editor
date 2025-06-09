import { Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';

import { TableOffsetMap } from '@/wysiwyg/helper/tableOffsetMap';
import CellSelection from '@/wysiwyg/plugins/selection/cellSelection';

interface TableEditPanelState {
  isVisible: boolean;
  tableElement: HTMLElement | null;
  overlay: HTMLElement | null;
  panel: HTMLElement | null;
}

class TableEditPanelView {
  private eventEmitter: Emitter;

  private view: EditorView;

  private state: TableEditPanelState;

  private lastShowTime = 0;

  constructor(view: EditorView, eventEmitter: Emitter) {
    this.view = view;
    this.eventEmitter = eventEmitter;
    this.state = {
      isVisible: false,
      tableElement: null,
      overlay: null,
      panel: null,
    };
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleTableClick = this.handleTableClick.bind(this);
    this.init();
  }

  private init() {
    // Listen for clicks on the document
    document.addEventListener('click', this.handleDocumentClick);

    // Listen for table clicks
    this.view.dom.addEventListener('click', this.handleTableClick);

    // Listen for scroll events to update panel position
    window.addEventListener('scroll', this.updatePanelPosition.bind(this), true);
    window.addEventListener('resize', this.updatePanelPosition.bind(this));
  }

  private handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const now = Date.now();

    // Don't hide panel immediately after showing it (prevents event bubbling issues)
    if (now - this.lastShowTime < 100) {
      return;
    }

    // If clicking outside table or panel, hide the panel
    if (!this.isTableOrPanelElement(target)) {
      this.hidePanel();
    }
  }

  private handleTableClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const tableElement = target.closest('table');

    if (tableElement) {
      event.stopPropagation();
      event.preventDefault();
      this.showPanel(tableElement);
    }
  }

  private isTableOrPanelElement(element: HTMLElement): boolean {
    return !!(
      element.closest('table') ||
      element.closest('.toastui-editor-table-edit-panel') ||
      element.classList.contains('toastui-editor-add-row-btn') ||
      element.classList.contains('toastui-editor-add-col-btn')
    );
  }

  private showPanel(tableElement: HTMLElement) {
    // Hide existing panel if any
    this.hidePanel();

    this.state.tableElement = tableElement;
    this.lastShowTime = Date.now();
    this.createPanel();
    this.createOverlay();
    this.createRowDividers();
    this.createColumnDividers();
    this.state.isVisible = true;
  }

  private hidePanel() {
    if (this.state.panel) {
      this.state.panel.remove();
      this.state.panel = null;
    }
    if (this.state.overlay) {
      this.state.overlay.remove();
      this.state.overlay = null;
    }
    this.state.isVisible = false;
    this.state.tableElement = null;
  }

  private updatePanelPosition() {
    if (!this.state.panel || !this.state.tableElement) return;

    const tableRect = this.state.tableElement.getBoundingClientRect();

    this.state.panel.style.left = `${tableRect.left}px`;
    this.state.panel.style.top = `${tableRect.top}px`;
    this.state.panel.style.width = `${tableRect.width}px`;
    this.state.panel.style.height = `${tableRect.height}px`;
  }

  private createPanel() {
    if (!this.state.tableElement) return;

    const panel = document.createElement('div');

    panel.className = 'toastui-editor-table-edit-panel';

    // Position the panel to cover the table
    const tableRect = this.state.tableElement.getBoundingClientRect();
    const viewportOffset = { left: 0, top: 0 };

    // Use fixed positioning to avoid ProseMirror DOMObserver issues
    panel.style.position = 'fixed';
    panel.style.left = `${tableRect.left + viewportOffset.left}px`;
    panel.style.top = `${tableRect.top + viewportOffset.top}px`;
    panel.style.width = `${tableRect.width}px`;
    panel.style.height = `${tableRect.height}px`;
    panel.style.zIndex = '25';

    // Ensure panel is visible
    panel.style.display = 'block';
    panel.style.visibility = 'visible';

    // Add to document body instead of editor DOM to avoid ProseMirror DOMObserver
    document.body.appendChild(panel);
    this.state.panel = panel;
  }

  private createOverlay() {
    if (!this.state.panel || !this.state.tableElement) return;

    const overlay = document.createElement('div');

    overlay.className = 'toastui-editor-table-edit-overlay';

    // Set overlay to cover the entire table
    overlay.style.width = '100%';
    overlay.style.height = '100%';

    this.state.panel.appendChild(overlay);
    this.state.overlay = overlay;
  }

  private createRowDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    const rows = this.state.tableElement.querySelectorAll('tr');
    const panelRect = this.state.panel.getBoundingClientRect();

    // Add buttons starting after the header row (first row is header, skip adding button above it)
    // Start from index 0 to add button after header row
    rows.forEach((row, index) => {
      const rowRect = row.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerY = rowRect.bottom - panelRect.top;

      // Create add row button
      const addRowBtn = document.createElement('div');

      addRowBtn.className = 'toastui-editor-add-row-btn';
      addRowBtn.style.left = '50%';
      addRowBtn.style.top = `${dividerY - 10}px`;
      addRowBtn.style.transform = 'translateX(-50%)';
      addRowBtn.title = index === 0 ? 'Add row after header' : 'Add row below';

      addRowBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        // For header row (index 0), insert at position 1 (after header)
        // For other rows, insert at position index + 1
        this.addRow(index + 1);
      });

      this.state.panel!.appendChild(addRowBtn);
    });
  }

  private createColumnDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    const firstRow = this.state.tableElement.querySelector('tr');

    if (!firstRow) return;

    const cells = firstRow.querySelectorAll('th, td');
    const panelRect = this.state.panel.getBoundingClientRect();

    // Add button before first column (at the left)
    if (cells.length > 0) {
      const [firstCell] = cells;
      const firstCellRect = firstCell.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerX = firstCellRect.left - panelRect.left;

      // Create add column button
      const addColBtn = document.createElement('div');

      addColBtn.className = 'toastui-editor-add-col-btn';
      addColBtn.style.left = `${dividerX - 10}px`;
      addColBtn.style.top = '50%';
      addColBtn.style.transform = 'translateY(-50%)';
      addColBtn.title = 'Add column left';

      addColBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addColumn(0); // Button index 0 - insert before first column
      });

      this.state.panel!.appendChild(addColBtn);
    }

    // Add buttons between columns and after last column
    cells.forEach((cell, index) => {
      const cellRect = cell.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerX = cellRect.right - panelRect.left;

      // Create add column button
      const addColBtn = document.createElement('div');

      addColBtn.className = 'toastui-editor-add-col-btn';
      addColBtn.style.left = `${dividerX - 10}px`;
      addColBtn.style.top = '50%';
      addColBtn.style.transform = 'translateY(-50%)';
      addColBtn.title = 'Add column right';

      addColBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addColumn(index + 1); // Button index represents insertion point
      });

      this.state.panel!.appendChild(addColBtn);
    });
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
    this.hidePanel();

    // Re-show panel and select newly added row after a short delay to allow DOM to update
    this.setCellSelection(tablePos, direction);
    setTimeout(() => {
      if (this.state.tableElement) {
        this.showPanel(this.state.tableElement);
        // Select the newly added row
      }
    }, 150);
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
    this.hidePanel();

    // Re-show panel and select newly added column after a short delay to allow DOM to update
    this.setCellSelection(tablePos, direction);
    setTimeout(() => {
      if (this.state.tableElement) {
        this.showPanel(this.state.tableElement);
        // Select the newly added column
      }
    }, 150);
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

  destroy() {
    document.removeEventListener('click', this.handleDocumentClick);
    this.view.dom.removeEventListener('click', this.handleTableClick);
    window.removeEventListener('scroll', this.updatePanelPosition.bind(this), true);
    window.removeEventListener('resize', this.updatePanelPosition.bind(this));
    this.hidePanel();
  }
}

export function tableEditPanel(eventEmitter: Emitter) {
  return new Plugin({
    view(editorView) {
      return new TableEditPanelView(editorView, eventEmitter);
    },
  });
}

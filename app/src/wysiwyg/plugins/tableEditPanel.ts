import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';

import { TableOffsetMap } from '@/wysiwyg/helper/tableOffsetMap';
import CellSelection from '@/wysiwyg/plugins/selection/cellSelection';
import { EditPanel } from './editPanel';
import { cls } from '@/utils/dom';

interface TableEditPanelState {
  isVisible: boolean;
  tableElement: HTMLElement | null;
  overlay: HTMLElement | null;
  panel: HTMLElement | null;
}

class TableEditPanelView extends EditPanel {
  private state: TableEditPanelState = {
    isVisible: false,
    tableElement: null,
    overlay: null,
    panel: null,
  };

  constructor(view: EditorView, eventEmitter: Emitter) {
    super(view, eventEmitter);

  }

  protected preparePanel(): void {
    this.handleTableHover = this.handleTableHover.bind(this);
    this.handleTableLeave = this.handleTableLeave.bind(this);
    this.init();
  }

  private init() {
    this.view.dom.addEventListener('mouseenter', this.handleTableHover, true);
    this.view.dom.addEventListener('mouseleave', this.handleTableLeave, true);
  }

  private handleTableHover(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const tableElement = target.closest('table');
    if (!tableElement) {
      return;
    }

    if (this.state.tableElement !== tableElement) {
      this.showPanel(tableElement);
    }
  }

  private handleTableLeave(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;

    // Don't hide if moving to panel or its elements
    if (relatedTarget && this.isTableOrPanelElement(relatedTarget)) {
      return;
    }

    // Check if we're actually leaving the table area
    const tableElement = target.closest('table');

    if (tableElement && this.state.tableElement === tableElement) {
      // Double check we're still not hovering over table or panel
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement;

      if (hoveredElement && !this.isTableOrPanelElement(hoveredElement)) {
        this.hide();
      }
    }
  }

  private isTableOrPanelElement(element: HTMLElement): boolean {
    return !!(
      element.closest('table') ||
      element.closest(`.${cls('table-edit-panel')}`) ||
      element.classList.contains(cls('add-row-btn')) ||
      element.classList.contains(cls('add-col-btn')) ||
      element.classList.contains(cls('remove-row-btn')) ||
      element.classList.contains(cls('remove-col-btn')) ||
      element.classList.contains(cls('row-divider-container')) ||
      element.classList.contains(cls('col-divider-container')) ||
      element.classList.contains(cls('row-delete-container')) ||
      element.classList.contains(cls('col-delete-container')) ||
      element.classList.contains(cls('row-delete-overlay')) ||
      element.classList.contains(cls('col-delete-overlay')) ||
      element.classList.contains(cls('row-add-highlight')) ||
      element.classList.contains(cls('col-add-highlight')) ||
      element.classList.contains(cls('delete-table-btn'))
    );
  }

  private showPanel(tableElement: HTMLElement) {
    // Hide existing panel if any
    this.hide();

    this.state.tableElement = tableElement;
    this.createPanel();
    this.createOverlay();
    this.createRowDividers();
    this.createColumnDividers();
    this.state.isVisible = true;
  }

  protected hide() {
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

  protected updatePosition() {
    if (!this.state.isVisible || !this.state.tableElement || !this.isPanelReady || !this.state.panel) {
      return;
    }

    const tableRect = this.state.tableElement.getBoundingClientRect();

    this.state.panel.style.left = `${tableRect.left}px`;
    this.state.panel.style.top = `${tableRect.top}px`;
    this.state.panel.style.width = `${tableRect.width}px`;
    this.state.panel.style.height = `${tableRect.height}px`;

    this.recreateDividers();
  }

  private createPanel() {
    if (!this.state.tableElement) return;

    const panel = document.createElement('div');

    panel.className = cls('table-edit-panel');

    // Position the panel to cover the table
    const tableRect = this.state.tableElement.getBoundingClientRect();
    const viewportOffset = { left: 0, top: 0 };

    // Use fixed positioning to avoid ProseMirror DOMObserver issues
    panel.style.left = `${tableRect.left + viewportOffset.left}px`;
    panel.style.top = `${tableRect.top + viewportOffset.top}px`;
    panel.style.width = `${tableRect.width}px`;
    panel.style.height = `${tableRect.height}px`;

    // Add hover event listeners to keep panel visible when hovering over it
    panel.addEventListener('mouseenter', () => {
      // Cancel any pending hide operation
    });

    panel.addEventListener('mouseleave', (event) => {
      const relatedTarget = event.relatedTarget as HTMLElement;

      // Hide panel if not moving to the table or other panel elements
      if (!relatedTarget || !this.isTableOrPanelElement(relatedTarget)) {
        this.hide();
      }
    });

    this.editPanelContainer.appendChild(panel);
    this.state.panel = panel;

    // Create delete table button
    this.createDeleteButton();
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
    deleteBtn.innerHTML = '×';
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

    // Hide the panel first
    this.hide();

    // Use event emitter to execute the removeTable command
    this.eventEmitter.emit('command', 'removeTable');
  }

  private createRowDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    const rows = this.state.tableElement.querySelectorAll('tr');
    const panelRect = this.state.tableElement.getBoundingClientRect();

    // Calculate how many body rows exist (total rows minus header)
    const bodyRowCount = rows.length - 1;

    // Create hover zones for adding rows and separate delete containers for body rows
    rows.forEach((row, index) => {
      const rowRect = row.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerY = rowRect.bottom - panelRect.top;

      // Create hover container for add row button
      const hoverContainer = document.createElement('div');
      hoverContainer.className = cls('row-divider-container');
      hoverContainer.style.top = `${dividerY - 5}px`; // Adjusted for 10px height container to center properly

      // Create add row button (initially hidden)
      const addRowBtn = document.createElement('div');
      addRowBtn.className = cls('add-row-btn');
      addRowBtn.innerHTML = '+';
      addRowBtn.title = index === 0 ? 'Add row after header' : 'Add row below';

      // Append button to container
      hoverContainer.appendChild(addRowBtn);

      // Create highlight border for add row insertion point
      const addHighlight = document.createElement('div');
      addHighlight.className = cls('row-add-highlight');
      addHighlight.style.top = `${dividerY}px`; // Position at the insertion line

      // Hover events for the add row container
      hoverContainer.addEventListener('mouseenter', () => {
        addRowBtn.style.visibility = 'visible';
        addRowBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        addHighlight.style.opacity = '1';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addRowBtn.style.visibility = 'hidden';
        addHighlight.style.opacity = '0';
      });

      // Prevent hover container from interfering with cell selection
      hoverContainer.addEventListener('click', (event) => {
        if (event.target !== addRowBtn) {
          event.stopPropagation();
          event.preventDefault();
        }
      });

      // Click event for the add button
      addRowBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addRow(index + 1);
      });

      this.state.panel!.appendChild(hoverContainer);
      this.state.panel!.appendChild(addHighlight);

      // Create separate delete container for body rows (positioned at row center, left side)
      if (index > 0 && bodyRowCount > 1) { // Don't show delete button for header row or if only one body row exists
        const deleteContainer = document.createElement('div');
        deleteContainer.className = cls('row-delete-container');

        // Position at the center of the row height
        const rowHeight = rowRect.height;
        const rowTop = rowRect.top - panelRect.top;
        deleteContainer.style.top = `${rowTop}px`;
        deleteContainer.style.height = `${rowHeight}px`;

        // Create delete row button
        const deleteRowBtn = document.createElement('div');
        deleteRowBtn.className = cls('remove-row-btn');
        deleteRowBtn.innerHTML = '×';
        deleteRowBtn.title = 'Delete row';

        deleteContainer.appendChild(deleteRowBtn);

        // Create red overlay for the row to be deleted
        const deleteOverlay = document.createElement('div');
        deleteOverlay.className = cls('row-delete-overlay');
        deleteOverlay.style.top = `${rowTop}px`;
        deleteOverlay.style.height = `${rowHeight}px`;

        // Hover events for the delete container
        deleteContainer.addEventListener('mouseenter', () => {
          deleteContainer.style.opacity = '1';
          deleteRowBtn.style.visibility = 'visible';
          deleteOverlay.style.opacity = '.1';
        });

        deleteContainer.addEventListener('mouseleave', () => {
          deleteContainer.style.opacity = '0';
          deleteRowBtn.style.visibility = 'hidden';
          deleteOverlay.style.opacity = '0';
        });

        // Click event for the delete button
        deleteRowBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.removeRow(index);
        });

        this.state.panel!.appendChild(deleteContainer);
        this.state.panel!.appendChild(deleteOverlay);
      }
    });
  }

  private createColumnDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    const firstRow = this.state.tableElement.querySelector('tr');

    if (!firstRow) return;

    const cells = firstRow.querySelectorAll('th, td');
    const panelRect = this.state.tableElement.getBoundingClientRect();

    // Calculate how many columns exist
    const columnCount = cells.length;

    // Add hover zone and button before first column (at the left)
    if (cells.length > 0) {
      const [firstCell] = cells;
      const firstCellRect = firstCell.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerX = firstCellRect.left - panelRect.left;

      // Create hover container for column divider (first column)
      const hoverContainer = document.createElement('div');
      hoverContainer.className = cls('col-divider-container');
      hoverContainer.style.left = `${dividerX - 5}px`; // Adjusted for 10px width container to center properly

      // Create add column button (initially hidden)
      const addColBtn = document.createElement('div');
      addColBtn.className = cls('add-col-btn');
      addColBtn.innerHTML = '+';
      addColBtn.title = 'Add column left';

      // Append button to container
      hoverContainer.appendChild(addColBtn);

      // Create highlight border for add column insertion point
      const addHighlight = document.createElement('div');
      addHighlight.className = cls('col-add-highlight');
      addHighlight.style.left = `${dividerX}px`; // Position at the insertion line

      // Hover events for the container
      hoverContainer.addEventListener('mouseenter', () => {
        addColBtn.style.visibility = 'visible';
        addHighlight.style.opacity = '1';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addColBtn.style.visibility = 'hidden';
        addHighlight.style.opacity = '0';
      });

      // Prevent hover container from interfering with cell selection
      hoverContainer.addEventListener('click', (event) => {
        if (event.target !== addColBtn) {
          event.stopPropagation();
          event.preventDefault();
        }
      });

      // Click event for the add button
      addColBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addColumn(0); // Button index 0 - insert before first column
      });

      this.state.panel!.appendChild(hoverContainer);
      this.state.panel!.appendChild(addHighlight);

      // Create delete container for first column (positioned above column center)
      if (columnCount > 1) {
        const deleteContainer = document.createElement('div');
        deleteContainer.className = cls('col-delete-container');

        // Position at the center of the column width
        const colLeft = firstCellRect.left - panelRect.left;
        const colWidth = firstCellRect.width;
        deleteContainer.style.left = `${colLeft}px`;
        deleteContainer.style.width = `${colWidth}px`;

        // Create delete column button
        const deleteColBtn = document.createElement('div');
        deleteColBtn.className = cls('remove-col-btn');
        deleteColBtn.innerHTML = '×';
        deleteColBtn.title = 'Delete first column';

        deleteContainer.appendChild(deleteColBtn);

        // Create red overlay for the column to be deleted
        const deleteOverlay = document.createElement('div');
        deleteOverlay.className = cls('col-delete-overlay');
        deleteOverlay.style.left = `${colLeft}px`;
        deleteOverlay.style.width = `${colWidth}px`;

        // Hover events for the delete container
        deleteContainer.addEventListener('mouseenter', () => {
          deleteContainer.style.opacity = '1';
          deleteColBtn.style.visibility = 'visible';
          deleteOverlay.style.opacity = '.1';
        });

        deleteContainer.addEventListener('mouseleave', () => {
          deleteContainer.style.opacity = '0';
          deleteColBtn.style.visibility = 'hidden';
          deleteOverlay.style.opacity = '0';
        });

        // Click event for the delete button
        deleteColBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.removeColumn(0);
        });

        this.state.panel!.appendChild(deleteContainer);
        this.state.panel!.appendChild(deleteOverlay);
      }
    }

    // Add hover zones and buttons between columns and after last column
    cells.forEach((cell, index) => {
      const cellRect = cell.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerX = cellRect.right - panelRect.left;

      // Create hover container for column divider
      const hoverContainer = document.createElement('div');
      hoverContainer.className = cls('col-divider-container');
      hoverContainer.style.left = `${dividerX - 5}px`; // Adjusted for 10px width container to center properly

      // Create add column button (initially hidden)
      const addColBtn = document.createElement('div');
      addColBtn.className = cls('add-col-btn');
      addColBtn.innerHTML = '+';
      addColBtn.title = 'Add column right';

      // Append button to container
      hoverContainer.appendChild(addColBtn);

      // Create highlight border for add column insertion point
      const addHighlight = document.createElement('div');
      addHighlight.className = cls('col-add-highlight');
      addHighlight.style.left = `${dividerX}px`; // Position at the insertion line

      // Hover events for the container
      hoverContainer.addEventListener('mouseenter', () => {
        addColBtn.style.visibility = 'visible';
        addColBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        addHighlight.style.opacity = '1';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addColBtn.style.visibility = 'hidden';
        addHighlight.style.opacity = '0';
      });

      // Prevent hover container from interfering with cell selection
      hoverContainer.addEventListener('click', (event) => {
        if (event.target !== addColBtn) {
          event.stopPropagation();
          event.preventDefault();
        }
      });

      // Click event for the add button
      addColBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addColumn(index + 1); // Button index represents insertion point
      });

      this.state.panel!.appendChild(hoverContainer);
      this.state.panel!.appendChild(addHighlight);

      // Create delete container for each column (positioned above column center)
      if (columnCount > 1) {
        const deleteContainer = document.createElement('div');
        deleteContainer.className = cls('col-delete-container');

        // Position at the center of the column width
        const colLeft = cellRect.left - panelRect.left;
        const colWidth = cellRect.width;
        deleteContainer.style.left = `${colLeft}px`;
        deleteContainer.style.width = `${colWidth}px`;

        // Create delete column button
        const deleteColBtn = document.createElement('div');
        deleteColBtn.className = cls('remove-col-btn');
        deleteColBtn.innerHTML = '×';
        deleteColBtn.title = `Delete column ${index + 1}`;

        deleteContainer.appendChild(deleteColBtn);

        // Create red overlay for the column to be deleted
        const deleteOverlay = document.createElement('div');
        deleteOverlay.className = cls('col-delete-overlay');
        deleteOverlay.style.left = `${colLeft}px`;
        deleteOverlay.style.width = `${colWidth}px`;

        // Hover events for the delete container
        deleteContainer.addEventListener('mouseenter', () => {
          deleteContainer.style.opacity = '1';
          deleteColBtn.style.visibility = 'visible';
          deleteOverlay.style.opacity = '.1';
        });

        deleteContainer.addEventListener('mouseleave', () => {
          deleteContainer.style.opacity = '0';
          deleteColBtn.style.visibility = 'hidden';
          deleteOverlay.style.opacity = '0';
        });

        // Click event for the delete button
        deleteColBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          this.removeColumn(index);
        });

        this.state.panel!.appendChild(deleteContainer);
        this.state.panel!.appendChild(deleteOverlay);
      }
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

  private recreateDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    // Check if table structure actually changed
    const currentRows = this.state.tableElement.querySelectorAll('tr').length;
    const currentCols =
      this.state.tableElement.querySelector('tr')?.querySelectorAll('th, td').length || 0;

    const existingRowDividers = this.state.panel.querySelectorAll(`.${cls('row-divider-container')}`).length;
    const existingColDividers = this.state.panel.querySelectorAll(`.${cls('col-divider-container')}`).length;

    // Only recreate if the structure actually changed
    const rowsChanged = currentRows !== existingRowDividers;
    const colsChanged = currentCols + 1 !== existingColDividers; // +1 because we have one extra divider before first column

    if (rowsChanged || colsChanged) {
      // Remove existing dividers, delete containers, and highlight elements
      const existingDividers = this.state.panel.querySelectorAll(
        `.${cls('row-divider-container')}, .${cls('col-divider-container')}, .${cls('row-delete-container')}, .${cls('col-delete-container')}, .${cls('row-delete-overlay')}, .${cls('col-delete-overlay')}, .${cls('row-add-highlight')}, .${cls('col-add-highlight')}`
      );

      existingDividers.forEach((divider) => divider.remove());

      // Recreate dividers with updated table structure
      this.createRowDividers();
      this.createColumnDividers();
    }
  }

  protected documentChanged() {
    if (!this.state.isVisible || !this.state.tableElement || !this.isPanelReady) {
      return;
    }
    this.updatePosition();
  }

  destroy() {
    this.view.dom.removeEventListener('mouseenter', this.handleTableHover, true);
    this.view.dom.removeEventListener('mouseleave', this.handleTableLeave, true);
    this.hide();
  }
}

export function tableEditPanel(eventEmitter: Emitter) {
  let tableEditPanelView: TableEditPanelView | null = null;

  return new Plugin({
    view(editorView) {
      tableEditPanelView = new TableEditPanelView(editorView, eventEmitter);
      return tableEditPanelView;
    },
  });
}

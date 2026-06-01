import { ProsemirrorNode } from 'prosemirror-model';
import { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';

const CODE_GROUP_CLASS_NAME = 'toastui-editor-code-group';
const TAB_LIST_CLASS_NAME = 'toastui-editor-code-group-tabs';
const TAB_CLASS_NAME = 'toastui-editor-code-group-tab';
const TAB_LABEL_CLASS_NAME = 'toastui-editor-code-group-tab-label';
const TAB_NAME_INPUT_CLASS_NAME = 'toastui-editor-code-group-tab-name';
const TAB_ACTIONS_CLASS_NAME = 'toastui-editor-code-group-actions';
const TAB_ACTION_CLASS_NAME = 'toastui-editor-code-group-action';
const PANELS_CLASS_NAME = 'toastui-editor-code-group-panels';
const ACTIVE_CLASS_NAME = 'active';

const DEFAULT_TAB_LABEL = 'Code';

type GetPos = (() => number) | boolean;

const activeIndexByView = new WeakMap<EditorView, Map<number, number>>();
const editingIndexByView = new WeakMap<EditorView, Map<number, number | null>>();

function getCodeBlockLabel(node: ProsemirrorNode, index: number) {
  return node.attrs.label || node.attrs.language || `${DEFAULT_TAB_LABEL} ${index + 1}`;
}

function createActionButton(action: string, label: string, title: string, index?: number) {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = TAB_ACTION_CLASS_NAME;
  button.contentEditable = 'false';
  button.dataset.action = action;
  if (typeof index === 'number') {
    button.dataset.index = String(index);
  }
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);

  return button;
}

export class TabbedCodeView implements NodeView {
  dom!: HTMLElement;

  contentDOM: HTMLElement | null = null;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  private activeIndex = 0;

  private editingIndex: number | null = null;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.activeIndex = this.getStoredActiveIndex();
    this.editingIndex = this.getStoredEditingIndex();
    this.createElement();
    this.renderTabs();
    this.syncActivePanel();
  }

  private getStoredActiveIndex() {
    if (typeof this.getPos !== 'function') {
      return 0;
    }

    return activeIndexByView.get(this.view)?.get(this.getPos()) || 0;
  }

  private getStoredEditingIndex() {
    if (typeof this.getPos !== 'function') {
      return null;
    }

    return editingIndexByView.get(this.view)?.get(this.getPos()) ?? null;
  }

  private storeActiveIndex() {
    if (typeof this.getPos !== 'function') {
      return;
    }

    let activeIndexByPos = activeIndexByView.get(this.view);

    if (!activeIndexByPos) {
      activeIndexByPos = new Map();
      activeIndexByView.set(this.view, activeIndexByPos);
    }

    activeIndexByPos.set(this.getPos(), this.activeIndex);
  }

  private storeEditingIndex() {
    if (typeof this.getPos !== 'function') {
      return;
    }

    let editingIndexByPos = editingIndexByView.get(this.view);

    if (!editingIndexByPos) {
      editingIndexByPos = new Map();
      editingIndexByView.set(this.view, editingIndexByPos);
    }

    editingIndexByPos.set(this.getPos(), this.editingIndex);
  }

  private createElement() {
    const wrapper = document.createElement('div');
    const tabs = document.createElement('div');
    const panels = document.createElement('div');

    wrapper.className = CODE_GROUP_CLASS_NAME;
    wrapper.addEventListener('pointerdown', this.handleTabEvent, true);
    wrapper.addEventListener('mousedown', this.handleTabEvent, true);
    wrapper.addEventListener('click', this.handleTabEvent, true);
    wrapper.addEventListener('click', this.handleActionEvent, true);
    tabs.className = TAB_LIST_CLASS_NAME;
    tabs.setAttribute('role', 'tablist');
    tabs.contentEditable = 'false';
    panels.className = PANELS_CLASS_NAME;
    panels.dataset.activeIndex = String(this.activeIndex);

    wrapper.appendChild(tabs);
    wrapper.appendChild(panels);

    this.dom = wrapper;
    this.contentDOM = panels;
  }

  private renderTabs() {
    const tabs = this.dom.querySelector(`.${TAB_LIST_CLASS_NAME}`)!;

    // If there is a focused editing input that we are about to destroy via
    // `tabs.textContent = ''`, browsers (Chrome/Firefox) fire `blur`
    // synchronously when the focused element is removed from the DOM.
    // That blur would trigger `handleRenameBlur → commitRename`, exiting
    // editing mode prematurely (before the user does anything).
    // Guard against this by temporarily detaching the blur listener and
    // preserving the user's current typed value.
    let savedEditingValue: string | null = null;
    const existingInput = tabs.querySelector<HTMLInputElement>(`.${TAB_NAME_INPUT_CLASS_NAME}`);

    if (existingInput) {
      existingInput.removeEventListener('blur', this.handleRenameBlur);
      savedEditingValue = existingInput.value;
    }

    tabs.textContent = '';
    this.node.forEach((child, _, index) => {
      if (index === this.editingIndex) {
        const input = document.createElement('input');

        input.className = TAB_NAME_INPUT_CLASS_NAME;
        input.contentEditable = 'false';
        input.dataset.index = String(index);
        // Restore typed value when rebuilding during an active edit session;
        // fall back to the persisted label only when opening the input fresh.
        input.value = savedEditingValue ?? getCodeBlockLabel(child, index);
        input.setAttribute('aria-label', 'Tab name');
        input.addEventListener('blur', this.handleRenameBlur);
        input.addEventListener('keydown', this.handleRenameKeydown);
        document.removeEventListener('mousedown', this.handleOutsideMouseDown, true);
        document.addEventListener('mousedown', this.handleOutsideMouseDown, true);
        tabs.appendChild(input);

        setTimeout(() => {
          input.focus({ preventScroll: true });
          input.select();
        });

        return;
      }

      const tab = document.createElement('span');
      const label = document.createElement('span');

      tab.className = TAB_CLASS_NAME;
      tab.contentEditable = 'false';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(index === this.activeIndex));
      tab.dataset.index = String(index);
      label.className = TAB_LABEL_CLASS_NAME;
      label.textContent = getCodeBlockLabel(child, index);
      tab.appendChild(label);
      tab.appendChild(createActionButton('rename', 'A', 'Rename tab', index));
      tab.appendChild(createActionButton('delete', 'x', 'Delete tab', index));

      if (index === this.activeIndex) {
        tab.classList.add(ACTIVE_CLASS_NAME);
      }

      tabs.appendChild(tab);
    });

    tabs.appendChild(this.createActions());

    this.syncActiveTabs();
  }

  private createActions() {
    const actions = document.createElement('span');

    actions.className = TAB_ACTIONS_CLASS_NAME;
    actions.contentEditable = 'false';
    actions.appendChild(createActionButton('add', '+', 'Add tab'));

    return actions;
  }

  private syncActiveTabs() {
    const tabs = this.dom.querySelector(`.${TAB_LIST_CLASS_NAME}`)!;

    Array.from(tabs.querySelectorAll<HTMLElement>(`.${TAB_CLASS_NAME}`)).forEach((tab) => {
      const isActive = Number(tab.dataset.index || 0) === this.activeIndex;

      tab.classList.toggle(ACTIVE_CLASS_NAME, isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  private syncActivePanel() {
    const panels = this.contentDOM;

    if (panels) {
      panels.dataset.activeIndex = String(this.activeIndex);
    }

    Array.from(panels?.children || []).forEach((panel, index) => {
      const isActive = index === this.activeIndex;

      panel.classList.toggle(ACTIVE_CLASS_NAME, isActive);
      panel.setAttribute('role', 'tabpanel');
    });
  }

  private handleOutsideMouseDown = (ev: MouseEvent) => {
    const input = this.dom.querySelector<HTMLInputElement>(`.${TAB_NAME_INPUT_CLASS_NAME}`);

    if (!input || ev.target === input) {
      return;
    }
    document.removeEventListener('mousedown', this.handleOutsideMouseDown, true);
    input.blur();
  };

  private handleTabEvent = (ev: MouseEvent | PointerEvent) => {
    if (
      (ev.target as HTMLElement).closest(`.${TAB_ACTION_CLASS_NAME}`) ||
      (ev.target as HTMLElement).closest(`.${TAB_NAME_INPUT_CLASS_NAME}`)
    ) {
      return;
    }

    const target = (ev.target as HTMLElement).closest<HTMLButtonElement>(`.${TAB_CLASS_NAME}`);

    if (!target) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    this.activeIndex = Number(target.dataset.index || 0);
    this.storeActiveIndex();
    this.syncActiveTabs();
    this.syncActivePanel();
  };

  private handleActionEvent = (ev: MouseEvent) => {
    const target = (ev.target as HTMLElement).closest<HTMLButtonElement>(
      `.${TAB_ACTION_CLASS_NAME}`,
    );

    if (!target) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const index = Number(target.dataset.index || this.activeIndex);

    switch (target.dataset.action) {
      case 'add':
        this.addTab();
        break;
      case 'rename':
        this.renameTab(index);
        break;
      case 'delete':
        this.deleteTab(index);
        break;
      default:
        break;
    }
  };

  private getNodePos() {
    return typeof this.getPos === 'function' ? this.getPos() : null;
  }

  private getChildPos(index: number) {
    const pos = this.getNodePos();

    if (pos === null) {
      return null;
    }

    let offset = 0;

    for (let childIndex = 0; childIndex < index; childIndex += 1) {
      offset += this.node.child(childIndex).nodeSize;
    }

    return pos + 1 + offset;
  }

  private preserveScrollPosition() {
    const snapshots: Array<{ element: Element; scrollLeft: number; scrollTop: number }> = [];
    let element = this.dom.parentElement;

    while (element) {
      if (
        element.scrollHeight > element.clientHeight ||
        element.scrollWidth > element.clientWidth
      ) {
        snapshots.push({ element, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop });
      }

      element = element.parentElement;
    }

    const { scrollingElement } = document;

    if (scrollingElement) {
      snapshots.push({
        element: scrollingElement,
        scrollLeft: scrollingElement.scrollLeft,
        scrollTop: scrollingElement.scrollTop,
      });
    }

    return () => {
      const restore = () =>
        snapshots.forEach(({ element: target, scrollLeft, scrollTop }) => {
          target.scrollLeft = scrollLeft;
          target.scrollTop = scrollTop;
        });

      restore();
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
      setTimeout(restore);
      setTimeout(restore, 50);
      setTimeout(restore, 200);
    };
  }

  private addTab() {
    const pos = this.getNodePos();

    if (pos === null) {
      return;
    }

    const { state } = this.view;
    const codeBlock = state.schema.nodes.codeBlock.create({
      language: 'text',
      label: `${DEFAULT_TAB_LABEL} ${this.node.childCount + 1}`,
    });
    const insertPos = pos + this.node.nodeSize - 1;
    const restoreScrollPosition = this.preserveScrollPosition();

    this.activeIndex = this.node.childCount;
    this.editingIndex = this.activeIndex;
    this.storeActiveIndex();
    this.storeEditingIndex();
    this.view.dispatch(state.tr.insert(insertPos, codeBlock));
    restoreScrollPosition();
  }

  private renameTab(index: number) {
    if (index >= this.node.childCount) {
      return;
    }

    this.activeIndex = index;
    this.editingIndex = index;
    this.storeActiveIndex();
    this.storeEditingIndex();
    this.renderTabs();
    this.syncActivePanel();
  }

  private commitRename(index: number, value: string, focusEditor = false) {
    const pos = this.getNodePos();
    const childPos = this.getChildPos(index);

    if (pos === null || childPos === null) {
      return;
    }

    const node = this.view.state.doc.nodeAt(pos);

    if (!node || index >= node.childCount) {
      return;
    }

    const child = node.child(index);
    const newLabel = value.trim() || null;

    this.editingIndex = null;
    this.storeEditingIndex();

    if (child.attrs.label !== newLabel) {
      // Label actually changed: persist via ProseMirror transaction.
      // dispatch() → update() → renderTabs() will exit editing mode.
      const attrs = { ...child.attrs, label: newLabel };
      const { tr } = this.view.state;
      const restoreScrollPosition = this.preserveScrollPosition();

      tr.setNodeMarkup(childPos, null, attrs);
      this.view.dispatch(tr);
      restoreScrollPosition();
    } else {
      // No change: skip the no-op dispatch because ProseMirror may skip
      // calling update() when the node is deeply equal, leaving the input
      // element in the DOM and the editing state visually stuck.
      // Directly update the UI instead.
      this.renderTabs();
      this.syncActivePanel();
    }

    if (focusEditor) {
      this.view.focus();
    }
  }

  private handleRenameBlur = (ev: FocusEvent) => {
    const input = ev.target as HTMLInputElement;

    this.commitRename(Number(input.dataset.index || 0), input.value);
  };

  private handleRenameKeydown = (ev: KeyboardEvent) => {
    const input = ev.target as HTMLInputElement;

    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.commitRename(Number(input.dataset.index || 0), input.value, true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.editingIndex = null;
      this.storeEditingIndex();
      this.renderTabs();
      this.view.focus();
    }
  };

  private deleteTab(index: number) {
    const pos = this.getNodePos();

    const childPos = this.getChildPos(index);

    if (pos === null || childPos === null || index >= this.node.childCount) {
      return;
    }

    const { tr } = this.view.state;
    const restoreScrollPosition = this.preserveScrollPosition();

    if (this.node.childCount <= 1) {
      this.activeIndex = 0;
      this.editingIndex = null;
      this.storeActiveIndex();
      this.storeEditingIndex();
      tr.delete(pos, pos + this.node.nodeSize);
      this.view.dispatch(tr);
      restoreScrollPosition();

      return;
    }

    const child = this.node.child(index);

    this.activeIndex = Math.min(index, this.node.childCount - 2);
    this.editingIndex = null;
    this.storeActiveIndex();
    this.storeEditingIndex();

    tr.delete(childPos, childPos + child.nodeSize);
    this.view.dispatch(tr);
    restoreScrollPosition();
  }

  stopEvent(ev: Event) {
    if ((ev.target as HTMLElement).closest(`.${TAB_NAME_INPUT_CLASS_NAME}`)) {
      return true;
    }

    return (
      (ev.type === 'pointerdown' || ev.type === 'mousedown' || ev.type === 'click') &&
      ((ev.target as HTMLElement).closest(`.${TAB_CLASS_NAME}`) !== null ||
        (ev.target as HTMLElement).closest(`.${TAB_ACTION_CLASS_NAME}`) !== null)
    );
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    if (mutation.type === 'selection') {
      return false;
    }

    if (mutation.target === this.dom.firstChild) {
      return true;
    }

    if (
      mutation.type === 'attributes' &&
      mutation.target === this.contentDOM &&
      mutation.attributeName === 'data-active-index'
    ) {
      return true;
    }

    if (
      mutation.type === 'attributes' &&
      this.contentDOM?.contains(mutation.target) &&
      (mutation.attributeName === 'class' ||
        mutation.attributeName === 'role' ||
        mutation.attributeName === 'style')
    ) {
      return true;
    }

    return false;
  }

  update(node: ProsemirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.activeIndex = Math.min(this.activeIndex, Math.max(node.childCount - 1, 0));
    this.renderTabs();
    this.syncActivePanel();

    return true;
  }

  destroy() {
    this.dom.removeEventListener('pointerdown', this.handleTabEvent, true);
    this.dom.removeEventListener('mousedown', this.handleTabEvent, true);
    this.dom.removeEventListener('click', this.handleTabEvent, true);
    this.dom.removeEventListener('click', this.handleActionEvent, true);
    document.removeEventListener('mousedown', this.handleOutsideMouseDown, true);
  }
}

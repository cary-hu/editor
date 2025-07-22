import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';
import i18n from '@/i18n/i18n';
import { cls } from '@/utils/dom';
import { EditPanel } from './editPanel';
import { Mark } from 'prosemirror-model';

interface LinkEditPanelState {
    isVisible: boolean;
    linkElement: HTMLElement | null;
    dialog: HTMLElement | null;
    linkNode: Mark | null;
    linkPos: number | null;
    tempChanges: {
        linkUrl?: string;
        linkText?: string;
        target?: string | null;
        rel?: string | null;
    };
}

class LinkEditPanelView extends EditPanel {
    private state: LinkEditPanelState = {
        isVisible: false,
        linkElement: null,
        dialog: null,
        linkNode: null,
        linkPos: null,
        tempChanges: {},
    };
    private lastShowTime = 0;

    constructor(view: EditorView, eventEmitter: Emitter) {
        super(view, eventEmitter);
    }

    private init() {
        // Listen for clicks on the document
        document.addEventListener('click', this.handleDocumentClick);

        // Listen for link click events
        this.view.dom.addEventListener('click', this.handleLinkClick, true);
    }

    private handleDocumentClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const now = Date.now();

        // Don't hide panel immediately after showing it (prevents event bubbling issues)
        if (now - this.lastShowTime < 100) {
            return;
        }
        // If clicking outside link or panel, hide the panel
        if (!this.isLinkOrPanelElement(target)) {
            this.hide();
        }
    };

    protected preparePanel(): void {
        this.handleLinkClick = this.handleLinkClick.bind(this);
        this.init();
    }

    private handleLinkClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const linkElement = target.closest('a[href]') as HTMLElement;

        if (!linkElement) {
            return;
        }

        // Prevent the link from being followed
        event.preventDefault();

        // If clicking on the same link that's already being edited, don't re-show
        if (this.state.linkElement === linkElement && this.state.isVisible) {
            // Prevent event from bubbling only when we're not doing anything
            event.stopPropagation();
            return;
        }

        const pos = this.view.posAtDOM(linkElement, 0);
        if (pos === null) {
            return;
        }

        const node = this.view.state.doc.nodeAt(pos);
        if (!node || !node.marks) {
            return;
        }
        const linkMark = node?.marks.find(mark => mark.type.name === 'link');

        if (linkMark && pos !== null) {
            // Only prevent bubbling when we're actually showing a new panel
            event.stopPropagation();
            this.showPanel(linkElement, linkMark, pos);
        }
    };

    private isLinkOrPanelElement(element: HTMLElement): boolean {
        return !!(element.closest('a[href]') || element.closest(`.${cls('link-edit-dialog')}`));
    }

    private showPanel(linkElement: HTMLElement, linkMark: Mark, linkPos: number) {
        // Hide existing dialog if any
        this.hide();
        this.setAsActivePanel();
        this.state.linkElement = linkElement;
        this.state.linkNode = linkMark;
        this.state.linkPos = linkPos;
        this.state.tempChanges = {};
        this.lastShowTime = Date.now();
        this.createLinkDialog();
        this.state.isVisible = true;
    }

    protected hide() {
        if (this.state.dialog) {
            this.state.dialog.remove();
            this.state.dialog = null;
        }
        this.state.isVisible = false;
        this.state.linkElement = null;
        this.state.linkNode = null;
        this.state.linkPos = null;
        this.state.tempChanges = {};
    }

    protected updatePosition() {
        if (!this.isLinkVisible()) {
            this.hide();
            return;
        }
        if (!this.state.dialog || !this.state.linkElement) return;

        const linkRect = this.state.linkElement.getBoundingClientRect();
        const editorRect = this.view.dom.getBoundingClientRect();

        const containerRect = this.editPanelContainer.getBoundingClientRect();
        let topBoundary = 0; // Relative to panel container
        let bottomBoundary = containerRect.height - 30; // Relative to panel container

        // Find toolbar boundary (relative to panel container)
        if (this.editorToolbar) {
            const toolbarRect = this.editorToolbar.getBoundingClientRect();
            topBoundary = Math.max(0, toolbarRect.bottom - containerRect.top);
        }

        // Find status bar boundary (relative to panel container)
        if (this.editorModeSwitchBar) {
            const statusBarRect = this.editorModeSwitchBar.getBoundingClientRect();
            bottomBoundary = Math.min(containerRect.height, statusBarRect.top - containerRect.top);
        }

        // Calculate relative positions (relative to panel container)
        const linkRelativeTop = linkRect.top - containerRect.top;
        const linkRelativeRight = linkRect.right - containerRect.left;
        const linkRelativeLeft = linkRect.left - containerRect.left;

        // Position dialog horizontally
        const dialogWidth = 320;
        const containerWidth = containerRect.width;
        const spaceToRight = containerWidth - linkRelativeRight;
        const spaceToLeft = linkRelativeLeft;

        let left = linkRelativeRight + 10; // 10px gap

        if (spaceToRight < dialogWidth + 20 && spaceToLeft > dialogWidth + 20) {
            left = linkRelativeLeft - dialogWidth - 10;
        }

        // Ensure dialog doesn't go off container horizontally
        left = Math.max(10, Math.min(left, containerWidth - dialogWidth - 10));

        // Position dialog vertically with sticky behavior
        let top = linkRelativeTop;

        // Get actual dialog height instead of using fixed value
        const dialogHeight = this.state.dialog.offsetHeight || 300; // Fallback to 300 if not rendered yet

        const padding = 3;

        // Calculate the visible portion of the link relative to editor
        const editorRelativeTop = Math.max(0, editorRect.top - containerRect.top);
        const editorRelativeBottom = Math.min(
            containerRect.height,
            editorRect.bottom - containerRect.top
        );
        const visibleLinkTop = Math.max(linkRelativeTop, editorRelativeTop);
        const visibleLinkBottom = Math.min(linkRelativeTop + linkRect.height, editorRelativeBottom);
        const visibleLinkHeight = visibleLinkBottom - visibleLinkTop;

        // Check if dialog would fit if positioned at link top
        const wouldFitAtLinkTop = linkRelativeTop + dialogHeight <= bottomBoundary - padding;

        // Sticky behavior: position dialog optimally based on available space
        if (visibleLinkHeight > 0) {
            if (linkRelativeTop >= editorRelativeTop) {
                // Link top is visible
                if (wouldFitAtLinkTop) {
                    // Position at link top if there's enough space
                    top = linkRelativeTop;
                } else {
                    // Not enough space below link - position dialog so its bottom edge aligns with status bar
                    const minPadding = 2; // Minimal padding from status bar
                    top = bottomBoundary - dialogHeight - minPadding;

                    // Ensure dialog doesn't go above the toolbar
                    if (top < topBoundary + minPadding) {
                        top = topBoundary + minPadding;
                    }
                }
            } else {
                // Link top is above viewport - stick to toolbar boundary
                top = topBoundary + padding;
            }
        }

        // Set dialog position relative to panel container
        this.state.dialog.style.position = 'absolute';
        this.state.dialog.style.left = `${left}px`;
        this.state.dialog.style.top = `${top}px`;
    }

    private createLinkDialog() {
        if (!this.state.linkElement || !this.state.linkNode) return;

        const dialog = document.createElement('div');
        dialog.className = cls('link-edit-dialog', 'edit-dialog');

        // Create dialog content first
        this.createDialogContent(dialog);

        this.editPanelContainer.appendChild(dialog);
        this.state.dialog = dialog;

        // Position the dialog after it's added to DOM and fully rendered
        requestAnimationFrame(() => {
            this.updatePosition();
        });
    }

    private createDialogContent(dialog: HTMLElement) {
        if (!this.state.linkNode) return;

        const {
            linkUrl = '',
            title = '',
            target = null,
            rel = null,
        } = this.state.linkNode.attrs;

        const currentUrl = this.state.tempChanges.linkUrl ?? linkUrl;
        const currentText = this.state.tempChanges.linkText ?? (this.state.linkElement?.textContent || '');
        const currentTarget = this.state.tempChanges.target ?? target;
        const currentRel = this.state.tempChanges.rel ?? rel;

        dialog.innerHTML = `
      <div class="dialog-section">
        <label class="dialog-label">${i18n.get('Link Text')}</label>
        <div class="current-value">${i18n.get('Current value')}: ${currentText || i18n.get('Not set')}</div>
        <input type="text" class="text-input" id="text-input" value="${currentText}" placeholder="${i18n.get('Enter link text')}...">
      </div>
      
      <div class="dialog-section">
        <label class="dialog-label">${i18n.get('Link URL')}</label>
        <div class="current-value" title="${currentUrl || ""}">${i18n.get('Current value')}: ${currentUrl || i18n.get('Not set')}</div>
        <input type="url" class="url-input" id="url-input" value="${currentUrl}" placeholder="${i18n.get('Enter URL')}...">
      </div>

      <div class="dialog-section">
        <label class="dialog-label">${i18n.get('Target')}</label>
        <div class="current-value">${i18n.get('Current value')}: ${currentTarget || i18n.get('Not set')}</div>
        <input type="text" class="target-input" id="target-input" value="${currentTarget || ''}" placeholder="${i18n.get('Enter target attribute')}...">
        <div class="presets-button-group target-presets">
          <button type="button" class="preset-btn" data-target="">${i18n.get('Same window')}</button>
          <button type="button" class="preset-btn" data-target="_blank">${i18n.get('New window')}</button>
          <button type="button" class="preset-btn" data-target="_self">${i18n.get('Same frame')}</button>
          <button type="button" class="preset-btn" data-target="_parent">${i18n.get('Parent frame')}</button>
          <button type="button" class="preset-btn" data-target="_top">${i18n.get('Top frame')}</button>
        </div>
      </div>

      <div class="dialog-section">
        <label class="dialog-label">${i18n.get('Rel')}</label>
        <div class="current-value">${i18n.get('Current value')}: ${currentRel || i18n.get('Not set')}</div>
        <input type="text" class="rel-input" id="rel-input" value="${currentRel || ''}" placeholder="${i18n.get('Enter rel attribute')}...">
        <div class="presets-button-group rel-presets">
          <button type="button" class="preset-btn" data-rel="noopener">noopener</button>
          <button type="button" class="preset-btn" data-rel="noreferrer">noreferrer</button>
          <button type="button" class="preset-btn" data-rel="nofollow">nofollow</button>
          <button type="button" class="preset-btn" data-rel="noopener noreferrer">noopener noreferrer</button>
        </div>
      </div>

      <div class="dialog-actions">
        <button type="button" class="save-btn" id="save-changes">${i18n.get('Save')}</button>
        <button type="button" class="reset-btn" id="reset-changes">${i18n.get('Reset')}</button>
        <button type="button" class="delete-btn" id="delete-link" title="${i18n.get('Remove link')}">${i18n.get('Remove link')}</button>
      </div>
    `;

        this.bindDialogEvents(dialog);
    }

    private bindDialogEvents(dialog: HTMLElement) {
        const textInput = dialog.querySelector('#text-input') as HTMLInputElement;
        const urlInput = dialog.querySelector('#url-input') as HTMLInputElement;
        const targetInput = dialog.querySelector('#target-input') as HTMLInputElement;
        const relInput = dialog.querySelector('#rel-input') as HTMLInputElement;
        const targetPresetBtns = dialog.querySelectorAll('.target-presets .preset-btn') as NodeListOf<HTMLButtonElement>;
        const relPresetBtns = dialog.querySelectorAll('.rel-presets .preset-btn') as NodeListOf<HTMLButtonElement>;
        const saveBtn = dialog.querySelector('#save-changes') as HTMLButtonElement;
        const resetBtn = dialog.querySelector('#reset-changes') as HTMLButtonElement;
        const deleteBtn = dialog.querySelector('#delete-link') as HTMLButtonElement;

        textInput.addEventListener('input', () => {
            this.state.tempChanges.linkText = textInput.value;
        });

        urlInput.addEventListener('input', () => {
            this.state.tempChanges.linkUrl = urlInput.value;
        });

        targetInput.addEventListener('input', () => {
            this.state.tempChanges.target = targetInput.value || null;
        });

        relInput.addEventListener('input', () => {
            this.state.tempChanges.rel = relInput.value || null;
        });

        targetPresetBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const { target } = btn.dataset;
                if (target !== undefined) {
                    targetInput.value = target;
                    this.state.tempChanges.target = target || null;
                }
            });
        });

        relPresetBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const { rel } = btn.dataset;
                if (rel) {
                    relInput.value = rel;
                    this.state.tempChanges.rel = rel;
                }
            });
        });

        saveBtn.addEventListener('click', () => {
            this.saveChanges();
        });

        resetBtn.addEventListener('click', () => {
            this.resetChanges();
            this.resetFormInputs(dialog);
        });

        deleteBtn.addEventListener('click', () => {
            this.deleteLink();
        });

        [textInput, urlInput, targetInput, relInput].forEach((input) => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveChanges();
                }
            });
        });
    }

    private saveChanges() {
        if (this.state.linkPos === null) return;

        const { tr, schema } = this.view.state;
        const node = tr.doc.nodeAt(this.state.linkPos);

        if (!node) return;
        let start = this.state.linkPos;
        let end = start + node.nodeSize;
        const linkMark = node.marks.find(mark => mark.type.name === 'link');
        if (!linkMark) return;
        // Create new attributes for the link
        const newAttrs = { ...linkMark.attrs };

        if ('linkUrl' in this.state.tempChanges) {
            newAttrs.linkUrl = this.state.tempChanges.linkUrl;
        }
        if ('target' in this.state.tempChanges) {
            newAttrs.target = this.state.tempChanges.target;
        }
        if ('rel' in this.state.tempChanges) {
            newAttrs.rel = this.state.tempChanges.rel;
        }
        tr.removeMark(start, end, linkMark);
        const newLinkMark = schema.marks.link.create(newAttrs);
        if ('linkText' in this.state.tempChanges && this.state.tempChanges.linkText !== undefined) {
            const textNode = schema.text(this.state.tempChanges.linkText, [newLinkMark]);
            tr.replaceWith(start, end, textNode);
            end = start + textNode.nodeSize;
        }

        tr.addMark(start, end, newLinkMark);

        this.view.dispatch(tr);

        this.state.tempChanges = {};
        this.refreshDialog();
    }

    private resetChanges() {
        this.state.tempChanges = {};
    }

    private resetFormInputs(dialog: HTMLElement) {
        if (!this.state.linkNode) return;

        const {
            linkUrl = '',
            target = null,
            rel = null,
        } = this.state.linkNode.attrs;

        const textInput = dialog.querySelector('#text-input') as HTMLInputElement;
        const urlInput = dialog.querySelector('#url-input') as HTMLInputElement;
        const targetInput = dialog.querySelector('#target-input') as HTMLInputElement;
        const relInput = dialog.querySelector('#rel-input') as HTMLInputElement;

        if (textInput) {
            textInput.value = this.state.linkElement?.textContent || '';
        }
        if (urlInput) {
            urlInput.value = linkUrl;
        }
        if (targetInput) {
            targetInput.value = target || '';
        }
        if (relInput) {
            relInput.value = rel || '';
        }
    }

    private refreshDialog() {
        if (!this.state.dialog) return;
        this.createDialogContent(this.state.dialog);
    }

    private deleteLink() {
        if (this.state.linkPos === null) return;
        const { tr } = this.view.state;
        const node = tr.doc.nodeAt(this.state.linkPos);

        if (!node) return;
        let start = this.state.linkPos;
        let end = start + node.nodeSize;
        const linkMark = node.marks.find(mark => mark.type.name === 'link');
        if (!linkMark) return;
        tr.removeMark(start, end, linkMark);
        this.state.tempChanges = {};
        this.view.dispatch(tr);
        this.hide();
    }

    protected documentChanged(): void {
        if (this.state.isVisible && this.state.linkElement) {
            this.updatePosition();
        }
    }

    destroy() {
        document.removeEventListener('click', this.handleDocumentClick);
        this.view.dom.removeEventListener('click', this.handleLinkClick, true);

        this.hide();

        // Ensure we unregister as active panel
        this.unsetAsActivePanel();
    }

    private isLinkVisible(): boolean {
        if (!this.state.linkElement) return false;

        const linkRect = this.state.linkElement.getBoundingClientRect();
        const editorRect = this.view.dom.getBoundingClientRect();

        // Check if link is within the editor's visible area
        return (
            linkRect.bottom > editorRect.top &&
            linkRect.top < editorRect.bottom &&
            linkRect.right > editorRect.left &&
            linkRect.left < editorRect.right
        );
    }
}

export function linkEditPanel(eventEmitter: Emitter) {
    let linkEditPanelView: LinkEditPanelView | null = null;

    return new Plugin({
        view(editorView) {
            linkEditPanelView = new LinkEditPanelView(editorView, eventEmitter);
            return linkEditPanelView;
        },
    });
}

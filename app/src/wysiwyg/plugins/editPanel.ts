import { cls } from "@/utils/dom";
import { Emitter } from "@t/event";
import { EditorView } from "prosemirror-view";

export abstract class EditPanel {
    protected eventEmitter: Emitter;
    protected view: EditorView;
    protected editPanelContainer = document.querySelector(".toastui-edit-panel-container") as HTMLElement;
    protected editorToolbar?: HTMLElement;
    protected editorModeSwitchBar?: HTMLElement;

    protected isPanelReady = false;
    
    // Static manager to ensure only one edit panel is visible at a time
    private static activePanel: EditPanel | null = null;

    constructor(view: EditorView, eventEmitter: Emitter) {
        this.view = view;
        this.eventEmitter = eventEmitter;
        eventEmitter.listen('loadUI', () => {
            this.editPanelContainer = this.view.dom.closest(`.${cls('container')}`)!.querySelector('.toastui-edit-panel-container') as HTMLElement;
            this.editorToolbar = this.view.dom.closest(`.${cls('container')}`)!.querySelector(`.${cls('toolbar')}`) as HTMLElement;
            this.editorModeSwitchBar = this.view.dom.closest(`.${cls('container')}`)!.querySelector(`.${cls('mode-switch')}`) as HTMLElement;
            this.preparePanel();
            this.isPanelReady = true;
        });
        eventEmitter.listen('destroy', () => {
            this.destroy();
            this.isPanelReady = false;
        });
        eventEmitter.listen('change', () => {
            this.documentChanged();
        });
        eventEmitter.listen('scroll', () => {
            this.updatePosition();
        });
    }

    /**
     * Register this panel as the active one and hide any other active panels
     */
    protected setAsActivePanel(): void {
        this.eventEmitter.emit('closeEditPanel');
        if (EditPanel.activePanel && EditPanel.activePanel !== this) {
            EditPanel.activePanel.hide();
        }
        EditPanel.activePanel = this;
    }

    /**
     * Unregister this panel as the active one
     */
    protected unsetAsActivePanel(): void {
        if (EditPanel.activePanel === this) {
            EditPanel.activePanel = null;
        }
    }
    protected abstract preparePanel(): void;
    protected abstract destroy(): void;
    protected abstract hide(): void;
    protected abstract documentChanged(): void;
    protected abstract updatePosition(): void;
}

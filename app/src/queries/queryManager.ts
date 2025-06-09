import type { EditorCore as Editor } from '@t/editor';

type QueryFn = (editor: Editor, payload?: Record<string, any>) => any;

const queryMap: Record<string, QueryFn> = {
  getPopupInitialValues(editor, payload) {
    const { popupName } = payload!;

    if (popupName === 'link') {
      return { linkText: editor.getSelectedText() };
    }

    if (popupName === 'quote') {
      // Get current blockquote type from toolbar state
      const toolbarState = editor.getCurrentToolbarState();

      return { currentBqType: toolbarState?.blockQuote?.bqType || '' };
    }

    return {};
  },
};

export function buildQuery(editor: Editor) {
  editor.eventEmitter.listen('query', (query: string, payload?: Record<string, any>) =>
    queryMap[query](editor, payload)
  );
}

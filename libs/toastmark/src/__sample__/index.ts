import { basicSetup, EditorView } from 'codemirror';
import { Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { ToastMark } from '../toastmark';
import { Renderer } from '../html/renderer';
import './index.css';

document.body.innerHTML = `
  <section class="container">
    <div class="editor"></div>
    <div class="preview"></div>
    <div class="html"></div>
  </section>
`;

const editorEl = document.querySelector('.editor') as HTMLElement;
const htmlEl = document.querySelector('.html') as HTMLElement;
const previewEl = document.querySelector('.preview') as HTMLElement;

const toastMarkDoc = new ToastMark();
const renderer = new Renderer({ gfm: true, nodeId: true });

const tokenTypes = {
  heading: 'header',
  emph: 'em',
  strong: 'strong',
  strike: 'strikethrough',
  item: 'variable-2',
  image: 'variable-3',
  blockQuote: 'quote',
};

type TokenTypes = typeof tokenTypes;

const updateDecorations = StateEffect.define<DecorationSet>();

const markdownDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (let effect of tr.effects) {
      if (effect.is(updateDecorations)) {
        decorations = effect.value;
      }
    }
    return decorations;
  },
  provide: f => EditorView.decorations.from(f)
});

const markdownHighlightPlugin = ViewPlugin.fromClass(class {
  private isInitialized = false;

  constructor(public view: EditorView) {
    this.syncToastMark();
    // 不在构造函数中直接更新视图，而是标记需要初始化
  }

  update(update: ViewUpdate) {
    // 首次更新时处理初始内容
    if (!this.isInitialized) {
      this.isInitialized = true;
      this.handleInitialContent();
    }
    
    if (update.docChanged) {
      this.handleDocumentChange(update);
    }
  }

  private syncToastMark() {
    try {
      const content = this.view.state.doc.toString();
      toastMarkDoc.editMarkdown([1, 1], [1, 1], content);
    } catch (error) {
    }
  }

  private handleInitialContent() {
    try {
      const content = this.view.state.doc.toString();
      if (content.trim()) {
        // 渲染初始内容
        const html = renderer.render(toastMarkDoc.getRootNode());
        htmlEl.innerText = html;
        previewEl.innerHTML = html;
      }
    } catch (error) {
      console.error('处理初始内容时出错:', error);
    }
  }

  private handleDocumentChange(update: ViewUpdate) {
    try {
      const fullContent = update.state.doc.toString();


      const lines = toastMarkDoc.getLineTexts();
      const oldContent = lines.join('\n');

      if (oldContent !== fullContent) {
        const oldLines = oldContent.split('\n');
        const newLines = fullContent.split('\n');

        const startLine = 1;
        const startCh = 1;
        const endLine = Math.max(1, oldLines.length);
        const endCh = Math.max(1, (oldLines[oldLines.length - 1] || '').length + 1);

        const changed = toastMarkDoc.editMarkdown(
          [startLine, startCh],
          [endLine, endCh],
          fullContent
        );

        if (changed && Array.isArray(changed)) {
          const html = renderer.render(toastMarkDoc.getRootNode());
          htmlEl.innerText = html;
          previewEl.innerHTML = html;
        }
      }
    } catch (error) {
      try {
        const html = renderer.render(toastMarkDoc.getRootNode());
        previewEl.innerHTML = html;
      } catch (renderError) {
        console.error('Rerender failed:', renderError);
      }
    }
  }
});

const cm = new EditorView({
  doc: `![image](https://uicdn.toast.com/toastui/img/tui-editor-bi.png?caption=123)`,
  extensions: [
    basicSetup,
    markdownDecorations,
    markdownHighlightPlugin
  ],
  parent: editorEl,
});

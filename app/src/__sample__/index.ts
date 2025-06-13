import Editor from '@/index.js';

const content = [
    '![image](https://uicdn.toast.com/toastui/img/tui-editor-bi.png)',
    '',
    '# Awesome Editor!',
    '',
    '',
    '| name | type | description |',
    '| --- | --- | --- |',
    '| el | `HTMLElement` | container element |',
    '',
    '## Features',
    '',
    '* CommonMark + GFM Specifications',
    '   * Live Preview',
    '   * Scroll Sync',
    '   * Auto Indent',
    '   * Syntax Highlight',
    '        1. Markdown',
    '        2. Preview',
    '',
    '## Support Wrappers',
    '',
    '> * Wrappers',
    '>    1. [x] React',
    '>    2. [x] Vue',
    '>    3. [ ] Ember',
].join('\n');

const editor = new Editor({
    el: document.querySelector('#editor')!,
    previewStyle: 'vertical',
    height: '100vh',
    initialEditType: 'wysiwyg',
    useCommandShortcut: true,
    extendedAutolinks: true,
    frontMatter: true,
    initialValue: content,
});


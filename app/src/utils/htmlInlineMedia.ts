export const MEDIA_BOUNDARY_PLACEHOLDER = '\u200b';
export const HTML_INLINE_MEDIA_TAGS = ['video', 'audio'] as const;

const reMediaBoundaryPlaceholder = new RegExp(MEDIA_BOUNDARY_PLACEHOLDER, 'g');

export function isHtmlInlineMediaTag(tagName: string) {
  return HTML_INLINE_MEDIA_TAGS.includes(tagName.toLowerCase() as typeof HTML_INLINE_MEDIA_TAGS[number]);
}

export function hasMediaBoundaryPlaceholder(text: string) {
  return text.includes(MEDIA_BOUNDARY_PLACEHOLDER);
}

export function stripMediaBoundaryPlaceholders(text: string) {
  return text.replace(reMediaBoundaryPlaceholder, '');
}

export function ensureEmptyHtmlInlineMediaPlaceholders(root: ParentNode) {
  root.querySelectorAll(HTML_INLINE_MEDIA_TAGS.join(',')).forEach((element) => {
    if (!element.textContent) {
      element.appendChild(document.createTextNode(MEDIA_BOUNDARY_PLACEHOLDER));
    }
  });
}

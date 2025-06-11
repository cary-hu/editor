import { ProsemirrorNode, DOMOutputSpec } from 'prosemirror-model';

import NodeSchema from '@/spec/node';
import { escapeXml } from '@/utils/common';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';

import { EditorCommand } from '@t/spec';
import { getCustomAttrs, getDefaultCustomAttrs } from '../helper/node';

export class Image extends NodeSchema {
  get name() {
    return 'image';
  }

  get schema() {
    return {
      inline: true,
      attrs: {
        imageUrl: { default: '' },
        altText: { default: null },
        width: { default: null },
        verticalAlign: { default: null },
        caption: { default: null },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      group: 'inline',
      selectable: false,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom: Node | string) {
            const sanitizedDOM = sanitizeHTML<DocumentFragment>(dom, { RETURN_DOM_FRAGMENT: true })
              .firstChild as HTMLElement;
            const imageUrl = sanitizedDOM.getAttribute('src') || '';
            const rawHTML = sanitizedDOM.getAttribute('data-raw-html');
            const altText = sanitizedDOM.getAttribute('alt');
            const caption = sanitizedDOM.getAttribute('data-caption');

            // Parse width from style attribute
            const style = sanitizedDOM.getAttribute('style') || '';
            const widthMatch = style.match(/width:\s*([^;]+)/);
            const width = widthMatch ? widthMatch[1].trim() : null;

            // Parse vertical-align from style attribute
            const verticalAlignMatch = style.match(/vertical-align:\s*([^;]+)/);
            const verticalAlign = verticalAlignMatch ? verticalAlignMatch[1].trim() : null;

            // Parse query parameters from image URL for additional attributes
            let queryWidth = null;
            let queryVerticalAlign = null;
            let queryCaption = null;

            if (imageUrl && imageUrl.includes('?')) {
              const [, queryString] = imageUrl.split('?');
              const queryParams = new URLSearchParams(queryString);

              if (queryParams.has('width')) {
                queryWidth = queryParams.get('width');
              }
              if (queryParams.has('verticalAlign')) {
                queryVerticalAlign = queryParams.get('verticalAlign');
              }
              if (queryParams.has('caption')) {
                queryCaption = queryParams.get('caption');
              }
            }

            const attrs: any = {
              imageUrl,
              altText,
            };

            if (width || queryWidth) {
              attrs.width = width || queryWidth;
            }
            if (verticalAlign || queryVerticalAlign) {
              attrs.verticalAlign = verticalAlign || queryVerticalAlign;
            }
            if (caption || queryCaption) {
              attrs.caption = caption || queryCaption;
            }
            if (rawHTML) {
              attrs.rawHTML = rawHTML;
            }

            return attrs;
          },
        },
        {
          tag: 'figure',
          getAttrs(dom: Node | string) {
            const figureEl = dom as HTMLElement;
            const imgEl = figureEl.querySelector('img');
            const captionEl = figureEl.querySelector('figcaption');

            if (!imgEl) return false;

            const imageUrl = imgEl.getAttribute('src') || '';
            const altText = imgEl.getAttribute('alt');
            const caption = captionEl ? captionEl.textContent : imgEl.getAttribute('data-caption');

            // Parse width from style attribute
            const style = imgEl.getAttribute('style') || '';
            const widthMatch = style.match(/width:\s*([^;]+)/);
            const width = widthMatch ? widthMatch[1].trim() : null;

            // Parse vertical-align from style attribute
            const verticalAlignMatch = style.match(/vertical-align:\s*([^;]+)/);
            const verticalAlign = verticalAlignMatch ? verticalAlignMatch[1].trim() : null;

            // Parse query parameters from image URL for additional attributes
            let queryWidth = null;
            let queryVerticalAlign = null;
            let queryCaption = null;

            if (imageUrl && imageUrl.includes('?')) {
              const [, queryString] = imageUrl.split('?');
              const queryParams = new URLSearchParams(queryString);

              if (queryParams.has('width')) {
                queryWidth = queryParams.get('width');
              }
              if (queryParams.has('verticalAlign')) {
                queryVerticalAlign = queryParams.get('verticalAlign');
              }
              if (queryParams.has('caption')) {
                queryCaption = queryParams.get('caption');
              }
            }

            const attrs: any = {
              imageUrl,
              altText,
            };

            if (width || queryWidth) {
              attrs.width = width || queryWidth;
            }
            if (verticalAlign || queryVerticalAlign) {
              attrs.verticalAlign = verticalAlign || queryVerticalAlign;
            }
            if (caption || queryCaption) {
              attrs.caption = caption || queryCaption;
            }

            return attrs;
          },
        },
      ],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        let imgStyle = '';
        let figureStyle = 'margin: 0; padding: 0; display: inline-block;';

        if (attrs.width) {
          // 确保宽度值包含正确的单位
          const widthValue = attrs.width.toString();
          const width = widthValue.includes('px') ? widthValue : `${widthValue}px`;

          imgStyle += `width: ${width}`;
        }

        // 当有caption时，vertical-align应该应用在figure上，否则应用在img上
        if (attrs.verticalAlign) {
          if (attrs.caption) {
            // 有caption时，vertical-align应用在figure元素上
            figureStyle += `; vertical-align: ${attrs.verticalAlign}`;
          } else {
            // 没有caption时，vertical-align应用在img元素上
            if (imgStyle) imgStyle += '; ';
            imgStyle += `vertical-align: ${attrs.verticalAlign}`;
          }
        }

        const imgAttrs: Record<string, any> = {
          src: escapeXml(attrs.imageUrl),
          ...(attrs.altText && { alt: attrs.altText }),
          ...(imgStyle && { style: imgStyle }),
          ...(attrs.caption && { 'data-caption': attrs.caption }),
          ...getCustomAttrs(attrs),
        };

        // If there's a caption, wrap in figure element
        if (attrs.caption) {
          return [
            'figure',
            { style: figureStyle },
            [attrs.rawHTML || 'img', imgAttrs],
            [
              'figcaption',
              { style: 'font-size: 14px; color: #666; text-align: center; margin-top: 5px;' },
              attrs.caption,
            ],
          ];
        }

        return [attrs.rawHTML || 'img', imgAttrs];
      },
    };
  }

  private addImage(): EditorCommand {
    return (payload) => ({ schema, tr }, dispatch) => {
      const { imageUrl, altText } = payload!;

      if (!imageUrl) {
        return false;
      }

      const node = schema.nodes.image.createAndFill({
        imageUrl,
        ...(altText && { altText }),
      });

      dispatch!(tr.replaceSelectionWith(node!).scrollIntoView());

      return true;
    };
  }

  commands() {
    return {
      addImage: this.addImage(),
    };
  }
}

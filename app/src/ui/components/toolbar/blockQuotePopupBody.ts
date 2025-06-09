import { Emitter } from '@t/event';
import { ExecCommand, PopupInitialValues } from '@t/ui';
import { closest } from '@/utils/dom';
import i18n from '@/i18n/i18n';
import html from '@/ui/vdom/template';
import { Component } from '@/ui/vdom/component';

interface Props {
  eventEmitter: Emitter;
  execCommand: ExecCommand;
  initialValues?: PopupInitialValues;
}

const BLOCK_QUOTE_TYPES = [
  { type: 'default', label: 'Blockquote default' },
  { type: 'danger', label: 'Blockquote danger' },
  { type: 'info', label: 'Blockquote info' },
  { type: 'warning', label: 'Blockquote warning' },
  { type: 'success', label: 'Blockquote success' },
];

export class BlockQuotePopupBody extends Component<Props> {
  execCommand(ev: MouseEvent) {
    const el = closest(ev.target as HTMLElement, 'li')! as HTMLElement;
    const bqType = el.getAttribute('data-type');

    if (bqType) {
      this.props.execCommand('blockQuote', { bqType });
    }
  }

  render() {
    const currentBqType = this.props.initialValues?.currentBqType;

    return html`
      <ul
        onClick=${(ev: MouseEvent) => this.execCommand(ev)}
        aria-role="menu"
        aria-label="${i18n.get('Blockquote')}"
      >
        ${BLOCK_QUOTE_TYPES.map(
          ({ type, label }) =>
            html`
              <li
                data-type="${type}"
                aria-role="menuitem"
                class="${currentBqType && type === currentBqType ? 'active' : ''}"
              >
                <div class="block-quote-type-${type}">${i18n.get(label)}</div>
              </li>
            `
        )}
      </ul>
    `;
  }
}

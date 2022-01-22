import {h, render} from 'preact';

import * as Helper from '../../helper.js';

interface Props {
  title: string;
  content: string;
}

export const Notification = (props: Props) => {
  return <div class="notification">
    <div class="notification__section notification__section--title">
      {props.title}
    </div>
    <div class="notification__section notification__section--content">
      {props.content}
    </div>
  </div>;
};

export function makeNotificationComponent(props: Props) {
  const el = Helper.createElement('div', 'notification-wrapper');
  render(<Notification {...props} />, el);
  return el;
}

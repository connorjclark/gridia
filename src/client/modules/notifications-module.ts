import {ClientModule} from '../client-module.js';
import * as Helper from '../helper.js';
import {makeNotificationComponent} from '../ui/components/notification.js';

export class NotificationsModule extends ClientModule {
  private hasActiveNotification = false;
  private pendingNotifications: Array<{ title: string; content: string }> = [];

  onStart() {
    // ...
  }

  onTick() {
    if (this.hasActiveNotification) return;

    const nextNotification = this.pendingNotifications.shift();
    if (!nextNotification) return;

    const el = makeNotificationComponent(nextNotification);
    el.addEventListener('animationiteration', () => {
      el.style.animationPlayState = 'paused';
      setTimeout(() => {
        el.style.animationPlayState = 'running';
      }, 1000 * 3);
    });
    el.addEventListener('animationend', () => {
      el.remove();
      this.hasActiveNotification = false;
    });
    Helper.find('.game').append(el);
    this.hasActiveNotification = true;
  }

  addNotification(notification: { title: string; content: string }) {
    this.pendingNotifications.push(notification);
  }
}

import * as Content from '../../content.js';
import {ClientModule} from '../client-module.js';
import * as Helper from '../helper.js';
import {makeNotificationComponent} from '../ui/components/notification.js';

type Notification = Protocol.Events.Notification;
export class NotificationsModule extends ClientModule {
  private hasActiveNotification = false;
  private pendingNotifications: Notification[] = [];

  onStart() {
    this.game.client.eventEmitter.on('event', (e) => {
      if (e.type === 'notification') {
        this.addNotification(e.args);
      }
    });
  }

  onTick() {
    if (this.hasActiveNotification) return;

    const nextNotification = this.pendingNotifications.shift();
    if (!nextNotification) return;

    const details = nextNotification.details;
    let title = '';
    let content = '';
    if (details.type === 'skill-level') {
      const usagesBefore = new Set(Content.getItemUsesForSkill(details.skillId, details.from));
      const newUsages = new Set(Content.getItemUsesForSkill(details.skillId, details.to));
      for (const usage of usagesBefore) newUsages.delete(usage);

      const deltaText = details.to - details.from === 1 ? '' : ` (+${details.to - details.from})`;
      title = 'Level Up!';
      content = [
        `You are now level ${details.to}${deltaText} in ${Content.getSkill(details.skillId).name}!`,
        newUsages.size > 0 ? `You can now do ${newUsages.size} new things!` : '',
      ].join('\n');
    } else if (details.type === 'text') {
      title = 'Notification';
      content = details.text;
    }

    const el = makeNotificationComponent({title, content});
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

  addNotification(notification: Notification) {
    this.pendingNotifications.push(notification);
  }
}

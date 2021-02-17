export class WorldTime {
  constructor(readonly ticksPerWorldDay: number, public epoch = 0) { }

  get time() {
    return {
      epoch: this.epoch,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
    };
  }

  get day() {
    return Math.floor(this.epoch / this.ticksPerWorldDay);
  }

  get hour() {
    const ticksPerWorldHour = this.ticksPerWorldDay / 24;
    return Math.floor(this.epoch / ticksPerWorldHour) % 24;
  }

  get minute() {
    const ticksPerWorldMinute = this.ticksPerWorldDay / 24 / 60;
    return Math.floor(this.epoch / ticksPerWorldMinute) % 60;
  }

  toString() {
    const { day, hour, minute } = this.time;
    const H = hour.toString().padStart(2, '0');
    const M = minute.toString().padStart(2, '0');
    return `${H}${M}, day ${day + 1}`;
  }
}

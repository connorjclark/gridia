export class WorldTime {
  public constructor(public readonly ticksPerWorldDay: number, public epoch = 0) { }

  public get time() {
    return {
      epoch: this.epoch,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
    };
  }

  public get day() {
    return Math.floor(this.epoch / this.ticksPerWorldDay);
  }

  public get hour() {
    const ticksPerWorldHour = this.ticksPerWorldDay / 24;
    return Math.floor(this.epoch / ticksPerWorldHour) % 24;
  }

  public get minute() {
    const ticksPerWorldMinute = this.ticksPerWorldDay / 24 / 60;
    return Math.floor(this.epoch / ticksPerWorldMinute) % 60;
  }

  public toString() {
    const { day, hour, minute } = this.time;
    const H = hour.toString().padStart(2, '0');
    const M = minute.toString().padStart(2, '0');
    return `${H}${M}, day ${day + 1}`;
  }
}

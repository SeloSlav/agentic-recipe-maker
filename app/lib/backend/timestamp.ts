/** Serializable timestamp for persisted app documents. */
export class Timestamp {
  constructor(readonly seconds: number, readonly nanoseconds: number) {
    if (!Number.isInteger(seconds) || !Number.isInteger(nanoseconds) || nanoseconds < 0 || nanoseconds >= 1e9) throw new RangeError("Invalid timestamp");
  }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(date: Date) { return Timestamp.fromMillis(date.getTime()); }
  static fromMillis(milliseconds: number) {
    if (!Number.isFinite(milliseconds)) throw new RangeError("Invalid timestamp");
    const seconds = Math.floor(milliseconds / 1000);
    return new Timestamp(seconds, Math.floor((milliseconds - seconds * 1000) * 1e6));
  }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  toDate() { return new Date(this.toMillis()); }
  isEqual(other: Timestamp) { return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds; }
  toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
}

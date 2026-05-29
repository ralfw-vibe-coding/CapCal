// Command-RPU: aktualisiert die Felder einer Buchung.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Booking } from "../types";
import type { Rpu } from "./rpu";

export type UpdateBookingRequest = { bookingId: string; patch: Partial<Booking> };

export class UpdateBookingRpu implements Rpu<UpdateBookingRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: UpdateBookingRequest): void {
    const state = this.store.read();
    if (!state) return;
    this.store.write({
      ...state,
      bookings: state.bookings.map((booking) =>
        booking.id === request.bookingId ? { ...booking, ...request.patch } : booking
      )
    });
  }
}

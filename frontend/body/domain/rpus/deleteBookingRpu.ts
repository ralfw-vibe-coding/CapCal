// Command-RPU: loescht eine Buchung. Die zugehoerige Aufgabe bleibt erhalten.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type DeleteBookingRequest = { bookingId: string };

export class DeleteBookingRpu implements Rpu<DeleteBookingRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: DeleteBookingRequest): void {
    const state = this.store.read();
    if (!state) return;
    this.store.write({
      ...state,
      bookings: state.bookings.filter((booking) => booking.id !== request.bookingId)
    });
  }
}

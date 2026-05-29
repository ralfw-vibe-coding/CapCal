// Query-RPU: alle CapCal-Buchungen eines Tages.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Booking } from "../types";
import type { Rpu } from "./rpu";

export type GetBookingsForDateRequest = { date: string };

export class GetBookingsForDateRpu implements Rpu<GetBookingsForDateRequest, Booking[]> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: GetBookingsForDateRequest): Booking[] {
    return (this.store.read()?.bookings ?? []).filter((booking) => booking.date === request.date);
  }
}

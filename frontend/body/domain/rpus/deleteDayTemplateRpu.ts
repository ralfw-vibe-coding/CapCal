// Command-RPU: loescht eine Tagesvorlage. Bestehende Buchungen bleiben.

import type { TaskspaceStore } from "../taskspaceStore";
import type { Rpu } from "./rpu";

export type DeleteDayTemplateRequest = { templateId: string };

export class DeleteDayTemplateRpu implements Rpu<DeleteDayTemplateRequest, void> {
  constructor(private readonly store: TaskspaceStore) {}

  process(request: DeleteDayTemplateRequest): void {
    const state = this.store.read();
    if (!state) return;
    this.store.write({
      ...state,
      dayTemplates: (state.dayTemplates ?? []).filter((template) => template.id !== request.templateId)
    });
  }
}

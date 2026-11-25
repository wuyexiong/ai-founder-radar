export type RadarEventName =
  | "signal_outbound_click"
  | "signal_detail_click"
  | "signal_copy_brief"
  | "signal_share_x"
  | "signal_bookmark"
  | "signal_tag_filter"
  | "topic_hub_click"
  | "toolbox_click"
  | "newsletter_submit"
  | "search_query"
  | "saved_export"
  | "saved_import"
  | "feedback_open"
  | "feedback_submit";

export type RadarEventProps = Record<
  string,
  string | number | boolean | undefined
>;

interface AnalyticsWindow {
  posthog?: {
    capture?: (event: string, properties?: Record<string, unknown>) => void;
  };
  gtag?: (
    command: "event",
    eventName: string,
    eventParams?: Record<string, unknown>
  ) => void;
}

export function trackRadarEvent(
  eventName: RadarEventName,
  props: RadarEventProps = {}
): void {
  try {
    const g = globalThis as unknown as { window?: AnalyticsWindow };
    const win = g.window;
    if (!win) return;

    const cleanProps: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v !== undefined) {
        cleanProps[k] = v;
      }
    }

    win.posthog?.capture?.(eventName, cleanProps);
    win.gtag?.("event", eventName, cleanProps);
  } catch {
    // Analytics blockers or strict privacy browsers must never disrupt UI actions
  }
}

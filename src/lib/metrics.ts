/**
 * Minimal in-process Prometheus counter registry.
 *
 * Deliberately dependency-free and counters-only: the one thing it exists for is surfacing
 * message fields we do not model yet, so a provider adding a field becomes an alert instead of
 * silent data loss. Values are per-process and reset on restart, which is fine for counters.
 */
type Labels = Record<string, string>;

interface Counter {
  name: string;
  help: string;
  labels: Labels;
  value: number;
}

const counters = new Map<string, Counter>();

const COUNTER_HELP: Record<string, string> = {
  promptkeeper_unknown_message_fields_total:
    "Message fields or content-part types received that this version does not model",
  promptkeeper_messages_stored_total: "Messages written to Postgres",
};

// Prometheus label values must escape backslash, quote and newline
const escapeLabelValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const keyOf = (name: string, labels: Labels) =>
  `${name}{${Object.keys(labels)
    .sort()
    .map((label) => `${label}="${labels[label]}"`)
    .join(",")}}`;

export function incrementCounter(name: string, labels: Labels = {}, delta = 1) {
  const key = keyOf(name, labels);
  const existing = counters.get(key);

  if (existing) {
    existing.value += delta;
    return;
  }

  counters.set(key, { name, help: COUNTER_HELP[name] ?? name, labels, value: delta });
}

/** Serialize the registry in the Prometheus text exposition format. */
export function renderMetrics(): string {
  const byName = new Map<string, Counter[]>();
  counters.forEach((counter) => {
    const series = byName.get(counter.name) ?? [];
    series.push(counter);
    byName.set(counter.name, series);
  });

  const lines: string[] = [];

  byName.forEach((series, name) => {
    lines.push(`# HELP ${name} ${series[0].help}`);
    lines.push(`# TYPE ${name} counter`);

    series.forEach(({ labels, value }) => {
      const rendered = Object.keys(labels)
        .sort()
        .map((label) => `${label}="${escapeLabelValue(labels[label])}"`)
        .join(",");
      lines.push(rendered ? `${name}{${rendered}} ${value}` : `${name} ${value}`);
    });
  });

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Only used by tests. */
export function resetMetrics() {
  counters.clear();
}

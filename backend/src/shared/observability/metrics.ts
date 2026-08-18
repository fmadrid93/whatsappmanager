type Labels = Record<string, string | number | boolean | undefined>;

interface MetricPoint {
  name: string;
  help: string;
  type: "counter" | "gauge";
  labels: Labels;
  value: number;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function labelsKey(labels: Labels): string {
  return Object.entries(labels)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("|");
}

function formatLabels(labels: Labels): string {
  const pairs = Object.entries(labels)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabel(String(value))}"`);
  return pairs.length ? `{${pairs.join(",")}}` : "";
}

export class MetricsRegistry {
  private readonly points = new Map<string, MetricPoint>();

  increment(name: string, help: string, labels: Labels = {}, value = 1): void {
    const key = `${name}|${labelsKey(labels)}`;
    const current = this.points.get(key);
    this.points.set(key, {
      name,
      help,
      type: "counter",
      labels,
      value: (current?.value ?? 0) + value,
    });
  }

  gauge(name: string, help: string, labels: Labels = {}, value: number): void {
    this.points.set(`${name}|${labelsKey(labels)}`, { name, help, type: "gauge", labels, value });
  }

  observeSeconds(name: string, help: string, labels: Labels, seconds: number): void {
    this.increment(`${name}_count`, `${help} (count)`, labels, 1);
    this.increment(`${name}_sum`, `${help} (sum seconds)`, labels, seconds);
  }

  render(): string {
    const groups = new Map<string, MetricPoint[]>();
    for (const point of this.points.values()) {
      const list = groups.get(point.name) ?? [];
      list.push(point);
      groups.set(point.name, list);
    }

    const lines: string[] = [];
    for (const [name, points] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const first = points[0]!;
      lines.push(`# HELP ${name} ${first.help}`);
      lines.push(`# TYPE ${name} ${first.type}`);
      for (const point of points) lines.push(`${point.name}${formatLabels(point.labels)} ${point.value}`);
    }

    lines.push("# HELP process_resident_memory_bytes Resident memory used by the Node.js process.");
    lines.push("# TYPE process_resident_memory_bytes gauge");
    lines.push(`process_resident_memory_bytes ${process.memoryUsage().rss}`);
    lines.push("# HELP process_uptime_seconds Node.js process uptime.");
    lines.push("# TYPE process_uptime_seconds gauge");
    lines.push(`process_uptime_seconds ${process.uptime()}`);
    return `${lines.join("\n")}\n`;
  }
}

export const metrics = new MetricsRegistry();

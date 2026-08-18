import assert from "node:assert/strict";
import test from "node:test";
import { MetricsRegistry } from "../src/shared/observability/metrics.js";

test("renderiza métricas Prometheus con etiquetas", () => {
  const registry = new MetricsRegistry();
  registry.increment("example_total", "Example counter.", { status: 200 });
  registry.gauge("example_up", "Example gauge.", { worker: "w1" }, 1);
  const output = registry.render();
  assert.match(output, /example_total\{status="200"\} 1/);
  assert.match(output, /example_up\{worker="w1"\} 1/);
});

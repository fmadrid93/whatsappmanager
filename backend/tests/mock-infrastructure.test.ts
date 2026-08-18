import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MockObjectStorage } from "../src/infrastructure/storage/mock-object-storage.js";

test("MockObjectStorage comparte objetos entre procesos mediante disco", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "waas-mock-storage-"));
  const writer = new MockObjectStorage(root);
  const reader = new MockObjectStorage(root);

  try {
    await writer.putObject({
      key: "temporary/tenant/a.txt",
      body: Buffer.from("hola"),
      contentType: "text/plain",
    });

    assert.equal((await reader.headObject("temporary/tenant/a.txt")).sizeBytes, 4);
    assert.equal((await reader.readObjectPrefix("temporary/tenant/a.txt", 2)).toString(), "ho");

    const readPath = await reader.createSignedReadUrl("temporary/tenant/a.txt", 60);
    assert.equal(path.isAbsolute(readPath), true);
    assert.equal((await fs.readFile(readPath, "utf8")), "hola");

    await reader.deleteObject("temporary/tenant/a.txt");
    await assert.rejects(() => writer.headObject("temporary/tenant/a.txt"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

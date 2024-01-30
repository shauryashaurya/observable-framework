import assert from "node:assert";
import {readFile} from "node:fs/promises";
import type * as clack from "@clack/prompts";
import type {ClackEffects} from "../src/clack.js";
import {type CreateEffects, create} from "../src/create.js";

describe("create", async () => {
  it("instantiates the default template", async () => {
    const effects = new TestCreateEffects();
    effects.clack.inputs.push(
      "./template-test", // Where to create your project?
      true, // Include sample files to help you get started?
      null, // Install dependencies?
      false // Initialize git repository?
    );
    await create(undefined, effects);
    assert.deepStrictEqual(
      new Set(effects.outputs.keys()),
      new Set([
        "template-test/.gitignore",
        "template-test/docs/components/timeline.js",
        "template-test/docs/data/launchHistory.csv.js",
        "template-test/docs/data/spaceHistory.json",
        "template-test/docs/example-dashboard.md",
        "template-test/docs/example-report.md",
        "template-test/docs/index.md",
        "template-test/observablehq.config.ts",
        "template-test/package.json",
        "template-test/README.md"
      ])
    );
  });
  it("instantiates the empty template", async () => {
    const effects = new TestCreateEffects();
    effects.clack.inputs.push(
      "./template-test", // Where to create your project?
      false, // Include sample files to help you get started?
      null, // Install dependencies?
      false // Initialize git repository?
    );
    await create(undefined, effects);
    assert.deepStrictEqual(
      new Set(effects.outputs.keys()),
      new Set([
        "template-test/.gitignore",
        "template-test/docs/index.md",
        "template-test/observablehq.config.ts",
        "template-test/package.json",
        "template-test/README.md"
      ])
    );
  });
});

class TestCreateEffects implements CreateEffects {
  outputs = new Map<string, string>();
  clack = new TestClackEffects();
  async sleep(): Promise<void> {}
  log(): void {}
  async mkdir(): Promise<void> {} // TODO test?
  async copyFile(sourcePath: string, outputPath: string): Promise<void> {
    this.outputs.set(outputPath, await readFile(sourcePath, "utf-8"));
  }
  async writeFile(outputPath: string, contents: string): Promise<void> {
    this.outputs.set(outputPath, contents);
  }
}

class TestClackEffects implements ClackEffects {
  inputs: any[] = [];
  intro() {}
  outro() {}
  note() {}
  cancel() {}
  group: any = async (steps: clack.PromptGroup<any>) => {
    const results = {};
    for (const key in steps) {
      results[key] = await steps[key]({results});
    }
    return results;
  };
  async text({validate}: clack.TextOptions) {
    const result = this.inputs.shift();
    if (validate) validate(result);
    return result;
  }
  async select() {
    return this.inputs.shift();
  }
  async confirm() {
    return this.inputs.shift();
  }
  spinner() {
    return {
      start() {},
      stop() {},
      message() {}
    };
  }
}

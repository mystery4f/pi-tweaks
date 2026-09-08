import { expect, test } from "vitest";
import { installLinkedRenderPatch } from "@zigai/pi-extension-internals";
import { installMessageHighlightPatch } from "../src/message-highlight-patch.ts";
import { DEFAULT_MESSAGE_HIGHLIGHTS_CONFIG } from "../src/settings.ts";

test("reinstall updates current policy without stacking; disposal preserves successor", () => {
    const assistantPrototype = { render: (_width: number) => ["https://example.com"] };
    const userPrototype = { render: (_width: number) => ["https://example.com"] };
    const editorPrototype = { render: (_width: number) => [], getText: () => "" };
    const original = assistantPrototype.render;
    const targets = { theme: undefined, assistantPrototype, userPrototype, editorPrototype };
    const patch = installMessageHighlightPatch(targets, DEFAULT_MESSAGE_HIGHLIGHTS_CONFIG);
    const installed = assistantPrototype.render;
    const same = installMessageHighlightPatch(targets, { urlColor: { kind: "none" } });
    expect(same).toBe(patch);
    expect(assistantPrototype.render).toBe(installed);
    expect(assistantPrototype.render(80).join("\n")).not.toContain("38;");
    patch.update(DEFAULT_MESSAGE_HIGHLIGHTS_CONFIG);
    expect(assistantPrototype.render(80).join("\n")).toContain("38;");
    const successor = installLinkedRenderPatch(
        assistantPrototype,
        (previous) =>
            function (width) {
                return [...previous.call(this, width), "successor"];
            },
    );
    patch.dispose();
    patch.dispose();
    patch.update(DEFAULT_MESSAGE_HIGHLIGHTS_CONFIG);
    expect(assistantPrototype.render(80)).toEqual(["https://example.com", "successor"]);
    successor.dispose();
    expect(assistantPrototype.render).toBe(original);
});

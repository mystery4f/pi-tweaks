import assert from "node:assert/strict";
import { Theme } from "@earendil-works/pi-coding-agent";
import { SelectList } from "@earendil-works/pi-tui";
import { test } from "vitest";

import { installSelectedOptionPrefixSelectListPatch } from "../src/selected-option-prefix.ts";
import { captureConsoleWarnings } from "./capture-console-warnings.ts";

function createList(): SelectList {
    return new SelectList(
        [{ value: "settings", label: "settings", description: "Open settings menu" }],
        5,
        {
            selectedPrefix: (text) => text,
            selectedText: (text) => text,
            description: (text) => text,
            scrollInfo: (text) => text,
            noMatch: (text) => text,
        },
    );
}

test("explicit null does not patch Pi's default select-list prototype", async () => {
    const warnings = await captureConsoleWarnings(() => {
        const originalRender = Object.getOwnPropertyDescriptor(SelectList.prototype, "render");
        const handle = installSelectedOptionPrefixSelectListPatch(
            { selectedOptionPrefix: "▌" },
            null,
        );

        assert.deepEqual(
            Object.getOwnPropertyDescriptor(SelectList.prototype, "render"),
            originalRender,
        );

        handle.dispose();
    });

    assert.deepEqual(warnings, [
        "[pi-ui-tweaks] selected option prefix patch unavailable; Pi internals may have changed",
    ]);
});

test("selected option prefix updates generic select-list markers", () => {
    const handle = installSelectedOptionPrefixSelectListPatch({ selectedOptionPrefix: "▌" });
    assert.equal(
        createList().render(80)[0],
        "▌ settings                        Open settings menu",
    );

    handle.update({ selectedOptionPrefix: "→ " });
    assert.equal(createList().render(80)[0]?.startsWith("→ settings"), true);
    handle.dispose();
});

test("theme runtime decoder rejects missing and incompatible patch surfaces", async () => {
    const { selectedOptionThemeRuntime } = await import("../src/selected-option-prefix.ts");
    for (const module of [
        null,
        undefined,
        1,
        {},
        { Theme: null },
        { Theme: {} },
        { Theme: { prototype: { fg: 1 } } },
    ]) {
        assert.equal(selectedOptionThemeRuntime.parse(module), undefined);
    }
});

test("theme runtime decoder preserves the installed Pi prototype identity", async () => {
    const { selectedOptionThemeRuntime } = await import("../src/selected-option-prefix.ts");
    const { loadPiInternalModule } = await import("@zigai/pi-extension-internals");
    const prototype = await loadPiInternalModule("modes/interactive/theme/theme.js", {
        scope: "pi-ui-tweaks-test",
        feature: "theme contract",
        parse: selectedOptionThemeRuntime.parse,
    });
    assert.ok(prototype);
    assert.equal(prototype, Theme.prototype);
});

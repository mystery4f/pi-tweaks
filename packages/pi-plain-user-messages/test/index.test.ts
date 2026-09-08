import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { test } from "vitest";

import plainUserMessagesExtension from "../src/index.ts";
import { userMessageRuntime } from "../src/user-message-runtime.ts";

type ThemeRuntimeModule = {
    readonly initTheme: (settings: undefined, watch: boolean) => void;
};

function isThemeRuntimeModule(value: unknown): value is ThemeRuntimeModule {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) {
        return false;
    }

    return "initTheme" in value && typeof value.initTheme === "function";
}

type LifecycleApi = {
    readonly api: NonNullable<Parameters<typeof plainUserMessagesExtension>[0]>;
    readonly shutdownHandlers: Array<() => void>;
};

function createLifecycleApi(): LifecycleApi {
    const shutdownHandlers: Array<() => void> = [];
    const api = {
        on(event: string, handler: () => void): void {
            if (event === "session_shutdown") shutdownHandlers.push(handler);
        },
    };

    return { api, shutdownHandlers };
}

async function loadUserMessageConstructor(): Promise<
    NonNullable<ReturnType<typeof userMessageRuntime.parse>>
> {
    const codingAgentEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
    const themePath = pathToFileURL(
        join(dirname(codingAgentEntry), "modes/interactive/theme/theme.js"),
    ).href;
    const themeModule: unknown = await import(themePath);
    if (!isThemeRuntimeModule(themeModule)) {
        assert.fail("missing theme module");
    }

    themeModule.initTheme.call(themeModule, undefined, false);

    const userMessagePath = pathToFileURL(
        join(dirname(codingAgentEntry), "modes/interactive/components/user-message.js"),
    ).href;
    const userMessageModule: unknown = await import(userMessagePath);
    const component = userMessageRuntime.parse(userMessageModule);
    if (component === undefined) {
        assert.fail("missing UserMessageComponent");
    }

    return component;
}

test("renders Markdown heading syntax literally in user messages", async () => {
    const UserMessageComponent = await loadUserMessageConstructor();
    const lifecycle = createLifecycleApi();

    try {
        await plainUserMessagesExtension(lifecycle.api);
        const message = new UserMessageComponent("# test 1");

        assert.ok(message.render(80).some((line) => line.includes("# test 1")));
    } finally {
        for (const handler of lifecycle.shutdownHandlers) handler();
    }
});

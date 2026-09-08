import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
    createListProvider,
    registerMention,
    type MentionExtensionApi,
} from "@zigai/pi-mention-anything/api";
import { listProjectDirectories } from "./projects.ts";
import {
    applyMentionProjectCliFlags,
    loadMentionProjectSettings,
    INCLUDE_DOT_FOLDERS_FLAG,
    INCLUDE_NON_GIT_FLAG,
    type MentionProjectSettings,
    type MentionProjectSettingsContext,
} from "./settings.ts";

function mentionProjectSettings(
    pi: Pick<ExtensionAPI, "getFlag">,
    ctx: MentionProjectSettingsContext,
): MentionProjectSettings {
    return applyMentionProjectCliFlags(loadMentionProjectSettings(ctx), {
        includeNonGit: pi.getFlag(INCLUDE_NON_GIT_FLAG),
        includeDotFolders: pi.getFlag(INCLUDE_DOT_FOLDERS_FLAG),
    });
}

export type ProjectMentionExtensionApi = Pick<ExtensionAPI, "registerFlag" | "getFlag"> &
    MentionExtensionApi;

export function registerProjectMentionExtension(pi: ProjectMentionExtensionApi): void {
    pi.registerFlag(INCLUDE_NON_GIT_FLAG, {
        description: "Include non-Git child folders in pi-mention-project suggestions.",
        type: "boolean",
        default: false,
    });
    pi.registerFlag(INCLUDE_DOT_FOLDERS_FLAG, {
        description: "Include dot-prefixed child folders in pi-mention-project suggestions.",
        type: "boolean",
        default: false,
    });

    registerMention(pi, {
        id: "project",
        configuration(ctx) {
            const settings = mentionProjectSettings(pi, ctx);
            return {
                trigger: settings.trigger,
                completionSuffix: settings.completionSuffix,
                initialSuggestions: settings.initialSuggestions,
                expansionPolicy: "selected-or-resolved",
                cache: true,
                cacheTtlMs: 5_000,
                refreshOnStartup: true,
            };
        },
        provider(ctx) {
            const settings = mentionProjectSettings(pi, ctx);
            return createListProvider(async (request) => {
                const projects = await listProjectDirectories(settings, ctx.cwd, {
                    signal: request.signal,
                });
                return projects.map((project) => ({
                    id: project.path,
                    label: project.name,
                    segment: project.name,
                    description: project.path,
                    searchText: `${project.name} ${project.path}`,
                    selectable: true,
                    navigable: false,
                    replacement: project.path,
                }));
            });
        },
    });
}

export default function (pi: ExtensionAPI): void {
    registerProjectMentionExtension(pi);
}

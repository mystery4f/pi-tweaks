import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerMention, type MentionExtensionApi } from "@zigai/pi-mention-anything/api";
import { createCachedSkillExpansionLoader } from "./skill-content.ts";
import { loadMentionSkillSettings } from "./settings.ts";
import { createSkillProvider, resolveSkillCandidate } from "./skill-provider.ts";
import { getSkillCommands } from "./skill-commands.ts";

export type MentionSkillExtensionApi = Pick<ExtensionAPI, "getCommands"> & MentionExtensionApi;

export default function (pi: MentionSkillExtensionApi): void {
    const loadSkillExpansion = createCachedSkillExpansionLoader();

    registerMention(pi, {
        id: "skill",
        configuration(ctx) {
            const settings = loadMentionSkillSettings(ctx);
            return {
                trigger: settings.trigger,
                completionSuffix: settings.completionSuffix,
                initialSuggestions: settings.initialSuggestions,
                expansionPolicy: "selected-or-resolved",
            };
        },
        provider(ctx) {
            const settings = loadMentionSkillSettings(ctx);

            return createSkillProvider(() => getSkillCommands(pi), loadSkillExpansion, {
                projectSkillsFirst: settings.initialSuggestions.projectSkillsFirst,
            });
        },
        async replacement(candidatePath, _ctx, options) {
            return resolveSkillCandidate(candidatePath, loadSkillExpansion, options.signal);
        },
    });
}

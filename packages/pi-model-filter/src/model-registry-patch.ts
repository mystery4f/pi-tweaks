import {
    filterModels,
    isVisibleModel,
    type ModelLike,
    type ModelFilterSettings,
} from "./model-filter.ts";

const REGISTRY_PATCH_MARKER = Symbol.for("@zigai/pi-model-filter/registry-patched");
const REGISTRY_RUNTIME_KEY = Symbol.for("@zigai/pi-model-filter/registry-runtime");
const ORIGINAL_REGISTRY_GET_ALL_KEY = Symbol.for("@zigai/pi-model-filter/registry-get-all");
const ORIGINAL_REGISTRY_GET_AVAILABLE_KEY = Symbol.for(
    "@zigai/pi-model-filter/registry-get-available",
);
const ORIGINAL_REGISTRY_FIND_KEY = Symbol.for("@zigai/pi-model-filter/registry-find");

export type BasicModelRegistry = {
    getAll: (this: BasicModelRegistry) => ModelLike[];
    getAvailable: (this: BasicModelRegistry) => ModelLike[];
    find: (this: BasicModelRegistry, provider: string, modelId: string) => ModelLike | undefined;
};

export type PatchedModelRegistry = BasicModelRegistry & {
    [REGISTRY_PATCH_MARKER]?: boolean;
    [REGISTRY_RUNTIME_KEY]?: () => ModelFilterSettings;
    [ORIGINAL_REGISTRY_GET_ALL_KEY]?: BasicModelRegistry["getAll"];
    [ORIGINAL_REGISTRY_GET_AVAILABLE_KEY]?: BasicModelRegistry["getAvailable"];
    [ORIGINAL_REGISTRY_FIND_KEY]?: BasicModelRegistry["find"];
};

function requireSettingsAccessor(
    accessor: (() => ModelFilterSettings) | undefined,
): () => ModelFilterSettings {
    if (accessor !== undefined) return accessor;
    throw new Error("Pi model filter policy is not initialized.");
}

export function installRegistryPatch(
    registry: PatchedModelRegistry,
    getSettings: () => ModelFilterSettings,
): void {
    registry[REGISTRY_RUNTIME_KEY] = getSettings;

    if (
        typeof registry.getAll !== "function" ||
        typeof registry.getAvailable !== "function" ||
        typeof registry.find !== "function"
    ) {
        throw new Error("Pi model registry does not expose the expected methods.");
    }

    if (registry[REGISTRY_PATCH_MARKER] === true) return;

    registry[ORIGINAL_REGISTRY_GET_ALL_KEY] = registry.getAll;
    registry[ORIGINAL_REGISTRY_GET_AVAILABLE_KEY] = registry.getAvailable;
    registry[ORIGINAL_REGISTRY_FIND_KEY] = registry.find;

    registry.getAll = function getAll(this: PatchedModelRegistry) {
        const models = this[ORIGINAL_REGISTRY_GET_ALL_KEY]?.call(this) ?? [];
        const runtime = requireSettingsAccessor(
            this[REGISTRY_RUNTIME_KEY] ?? registry[REGISTRY_RUNTIME_KEY],
        );
        return filterModels(models, runtime());
    };

    registry.getAvailable = function getAvailable(this: PatchedModelRegistry) {
        const models = this[ORIGINAL_REGISTRY_GET_AVAILABLE_KEY]?.call(this) ?? [];
        const runtime = requireSettingsAccessor(
            this[REGISTRY_RUNTIME_KEY] ?? registry[REGISTRY_RUNTIME_KEY],
        );
        return filterModels(models, runtime());
    };

    registry.find = function find(this: PatchedModelRegistry, provider: string, modelId: string) {
        const finder = this[ORIGINAL_REGISTRY_FIND_KEY] ?? registry[ORIGINAL_REGISTRY_FIND_KEY];
        const model = finder?.call(this, provider, modelId);
        if (model === undefined) return undefined;

        const runtime = requireSettingsAccessor(
            this[REGISTRY_RUNTIME_KEY] ?? registry[REGISTRY_RUNTIME_KEY],
        );
        if (!isVisibleModel(model, runtime())) return undefined;
        return model;
    };

    registry[REGISTRY_PATCH_MARKER] = true;
}

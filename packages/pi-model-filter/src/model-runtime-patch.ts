import {
    filterModels,
    isVisibleModel,
    type ModelLike,
    type ModelFilterSettings,
} from "./model-filter.ts";

const MODEL_RUNTIME_PATCH_MARKER = Symbol.for("@zigai/pi-model-filter/model-runtime-patched");
const MODEL_RUNTIME_STATE_KEY = Symbol.for("@zigai/pi-model-filter/model-runtime-state");
const ORIGINAL_RUNTIME_GET_MODELS_KEY = Symbol.for(
    "@zigai/pi-model-filter/model-runtime-get-models",
);
const ORIGINAL_RUNTIME_GET_AVAILABLE_KEY = Symbol.for(
    "@zigai/pi-model-filter/model-runtime-get-available",
);
const ORIGINAL_RUNTIME_GET_AVAILABLE_SNAPSHOT_KEY = Symbol.for(
    "@zigai/pi-model-filter/model-runtime-get-available-snapshot",
);
const ORIGINAL_RUNTIME_GET_MODEL_KEY = Symbol.for("@zigai/pi-model-filter/model-runtime-get-model");

export type BasicModelRuntime = {
    getModels: (this: BasicModelRuntime, providerId?: string) => readonly ModelLike[];
    getAvailable: (this: BasicModelRuntime, providerId?: string) => Promise<readonly ModelLike[]>;
    getAvailableSnapshot: (this: BasicModelRuntime) => readonly ModelLike[];

    getModel: (
        this: BasicModelRuntime,
        providerId: string,
        modelId: string,
    ) => ModelLike | undefined;
};

export type PatchedModelRuntime = BasicModelRuntime & {
    [MODEL_RUNTIME_PATCH_MARKER]?: boolean;
    [MODEL_RUNTIME_STATE_KEY]?: () => ModelFilterSettings;
    [ORIGINAL_RUNTIME_GET_MODELS_KEY]?: BasicModelRuntime["getModels"];
    [ORIGINAL_RUNTIME_GET_AVAILABLE_KEY]?: BasicModelRuntime["getAvailable"];
    [ORIGINAL_RUNTIME_GET_AVAILABLE_SNAPSHOT_KEY]?: BasicModelRuntime["getAvailableSnapshot"];
    [ORIGINAL_RUNTIME_GET_MODEL_KEY]?: BasicModelRuntime["getModel"];
};

function requireSettingsAccessor(
    accessor: (() => ModelFilterSettings) | undefined,
): () => ModelFilterSettings {
    if (accessor !== undefined) return accessor;
    throw new Error("Pi model filter policy is not initialized.");
}

export function installModelRuntimePatch(
    runtime: PatchedModelRuntime,
    getSettings: () => ModelFilterSettings,
): void {
    runtime[MODEL_RUNTIME_STATE_KEY] = getSettings;

    if (
        typeof runtime.getModels !== "function" ||
        typeof runtime.getAvailable !== "function" ||
        typeof runtime.getAvailableSnapshot !== "function" ||
        typeof runtime.getModel !== "function"
    ) {
        throw new Error("Pi model runtime does not expose the expected methods.");
    }

    if (runtime[MODEL_RUNTIME_PATCH_MARKER] === true) return;

    runtime[ORIGINAL_RUNTIME_GET_MODELS_KEY] = runtime.getModels;
    runtime[ORIGINAL_RUNTIME_GET_AVAILABLE_KEY] = runtime.getAvailable;
    runtime[ORIGINAL_RUNTIME_GET_AVAILABLE_SNAPSHOT_KEY] = runtime.getAvailableSnapshot;
    runtime[ORIGINAL_RUNTIME_GET_MODEL_KEY] = runtime.getModel;

    runtime.getModels = function getModels(this: PatchedModelRuntime, providerId?: string) {
        const models = this[ORIGINAL_RUNTIME_GET_MODELS_KEY]?.call(this, providerId) ?? [];
        const filterState = requireSettingsAccessor(
            this[MODEL_RUNTIME_STATE_KEY] ?? runtime[MODEL_RUNTIME_STATE_KEY],
        );
        return filterModels(models, filterState());
    };

    runtime.getAvailable = async function getAvailable(
        this: PatchedModelRuntime,
        providerId?: string,
    ) {
        const models =
            (await this[ORIGINAL_RUNTIME_GET_AVAILABLE_KEY]?.call(this, providerId)) ?? [];
        const filterState = requireSettingsAccessor(
            this[MODEL_RUNTIME_STATE_KEY] ?? runtime[MODEL_RUNTIME_STATE_KEY],
        );
        return filterModels(models, filterState());
    };

    runtime.getAvailableSnapshot = function getAvailableSnapshot(this: PatchedModelRuntime) {
        const models = this[ORIGINAL_RUNTIME_GET_AVAILABLE_SNAPSHOT_KEY]?.call(this) ?? [];
        const filterState = requireSettingsAccessor(
            this[MODEL_RUNTIME_STATE_KEY] ?? runtime[MODEL_RUNTIME_STATE_KEY],
        );
        return filterModels(models, filterState());
    };

    runtime.getModel = function getModel(
        this: PatchedModelRuntime,
        providerId: string,
        modelId: string,
    ) {
        const finder =
            this[ORIGINAL_RUNTIME_GET_MODEL_KEY] ?? runtime[ORIGINAL_RUNTIME_GET_MODEL_KEY];
        const model = finder?.call(this, providerId, modelId);
        if (model === undefined) return undefined;

        const filterState = requireSettingsAccessor(
            this[MODEL_RUNTIME_STATE_KEY] ?? runtime[MODEL_RUNTIME_STATE_KEY],
        );
        if (!isVisibleModel(model, filterState())) return undefined;
        return model;
    };

    runtime[MODEL_RUNTIME_PATCH_MARKER] = true;
}

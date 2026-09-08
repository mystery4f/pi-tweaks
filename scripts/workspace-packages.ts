import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const extensionManifest = Type.Object({ extensions: Type.Array(Type.String()) });
const workspaceManifest = Type.Object({
    name: Type.String(),
    exports: Type.Record(Type.String(), Type.String()),
    dependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
    peerDependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
    pi: Type.Optional(extensionManifest),
    piExtensionSettings: Type.Optional(
        Type.Object({
            definition: Type.String(),
            prevalidation: Type.String(),
            schema: Type.String(),
            readme: Type.String(),
        }),
    ),
});
const rootManifest = Type.Object({
    workspaces: Type.Array(Type.String()),
    pi: extensionManifest,
});

export type WorkspacePackage = {
    readonly directory: string;
    readonly manifest: Static<typeof workspaceManifest>;
};

export type WorkspaceExtension = {
    readonly workspace: WorkspacePackage;
    readonly entry: string;
    readonly source: string;
};

export type WorkspacePackages = {
    readonly root: string;
    readonly packages: readonly WorkspacePackage[];

    /** Ordered exactly as the root Pi manifest, which determines extension loading order. */
    readonly extensions: readonly WorkspaceExtension[];
};

export function isWithinDirectory(directory: string, file: string): boolean {
    const relative = path.relative(directory, file);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Discovers manifests and verifies that the root loads every declared extension exactly once. */
export function loadWorkspacePackages(root: string): WorkspacePackages {
    const rootValue: unknown = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    if (!Value.Check(rootManifest, rootValue)) throw new Error("Invalid root workspace manifest");
    const manifest = Value.Parse(rootManifest, rootValue);
    const manifestPaths = globSync(
        manifest.workspaces.map((pattern) => `${pattern}/package.json`),
        { cwd: root },
    ).sort();
    const packages: WorkspacePackage[] = [];
    const names = new Set<string>();
    const entries = new Map<string, WorkspaceExtension>();

    for (const manifestPath of manifestPaths) {
        const directory = path.resolve(root, path.dirname(manifestPath));
        const value: unknown = JSON.parse(readFileSync(path.join(root, manifestPath), "utf8"));
        if (!Value.Check(workspaceManifest, value)) {
            throw new Error(`${manifestPath} must declare a name and explicit string exports`);
        }

        const parsed = Value.Parse(workspaceManifest, value);
        if (names.has(parsed.name)) throw new Error(`Duplicate workspace package ${parsed.name}`);
        names.add(parsed.name);

        const workspace = { directory, manifest: parsed };
        packages.push(workspace);

        for (const entry of parsed.pi?.extensions ?? []) {
            const source = path.resolve(directory, entry);
            if (!isWithinDirectory(directory, source) || !existsSync(source)) {
                throw new Error(`${manifestPath} declares an invalid extension entry ${entry}`);
            }
            if (entries.has(source)) throw new Error(`Duplicate workspace extension ${source}`);
            entries.set(source, { workspace, entry, source });
        }
    }

    if (packages.length === 0) throw new Error("No workspace packages found");
    const extensions: WorkspaceExtension[] = [];
    for (const entry of manifest.pi.extensions) {
        const source = path.resolve(root, entry);
        const extension = entries.get(source);
        if (extension === undefined) {
            throw new Error(`Root Pi extension is undeclared or duplicated: ${entry}`);
        }

        extensions.push(extension);
        entries.delete(source);
    }

    if (entries.size > 0) {
        throw new Error(
            `Root Pi manifest is missing workspace extensions: ${[...entries.keys()]
                .map((source) => path.relative(root, source))
                .join(", ")}`,
        );
    }

    return { root, packages, extensions };
}

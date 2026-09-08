import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkArchitecture } from "./architecture.ts";
import { loadWorkspacePackages } from "./workspace-packages.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaces = loadWorkspacePackages(root);
const diagnostics = checkArchitecture(workspaces);
if (diagnostics.length > 0) {
    console.error(diagnostics.join("\n"));
    process.exitCode = 1;
} else {
    console.log(`Architecture check passed for ${workspaces.packages.length} workspace packages`);
}

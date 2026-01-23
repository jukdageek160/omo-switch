import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { confirm } from "@inquirer/prompts";
import { StoreManager, ProjectStoreManager, Scope } from "../store";
import { resolveProjectRoot, findProjectRoot } from "../utils/scope-resolver";

interface RmOptions {
  scope?: Scope;
  force?: boolean;
}

export const rmCommand = new Command("rm")
  .description("Remove a profile by ID")
  .argument("<profile-id>", "Profile ID to remove")
  .option("--scope <scope>", "Target scope (user or project)")
  .option("--force", "Skip confirmation prompt")
  .action(async (profileId: string, options: RmOptions) => {
    const spinner = ora().start();

    try {
      const scope = options.scope as Scope | undefined;

      if (scope && scope !== "user" && scope !== "project") {
        spinner.fail(`Invalid scope: ${scope}. Use 'user' or 'project'.`);
        process.exit(1);
      }

      let found = false;
      let deletedFrom: "user" | "project" | null = null;

      // If scope is specified, only check that scope
      if (scope === "user") {
        spinner.text = "Checking global store...";
        const globalStore = new StoreManager();
        const index = globalStore.loadIndex();
        const profile = index.profiles.find((p) => p.id === profileId);

        if (!profile) {
          spinner.fail(`Profile '${profileId}' not found in global store.`);
          process.exit(1);
        }

        if (!options.force) {
          spinner.stop();
          const confirmed = await confirm({
            message: `Are you sure you want to delete profile '${profileId}'?`,
            default: false,
          });

          if (!confirmed) {
            console.log(chalk.gray("Operation cancelled."));
            return;
          }
          spinner.start();
        }

        spinner.text = "Deleting profile...";
        globalStore.deleteProfile(profileId);
        found = true;
        deletedFrom = "user";
      } else if (scope === "project") {
        spinner.text = "Checking project store...";
        const projectRoot = findProjectRoot();

        if (!projectRoot) {
          spinner.fail("No .opencode/ directory found in parent directories.");
          console.log(chalk.gray("Run in a project directory or use --scope user."));
          process.exit(1);
        }

        const projectStore = new ProjectStoreManager(projectRoot);

        if (!projectStore.configExists(profileId)) {
          spinner.fail(`Profile '${profileId}' not found in project.`);
          process.exit(1);
        }

        if (!options.force) {
          spinner.stop();
          const confirmed = await confirm({
            message: `Are you sure you want to delete profile '${profileId}'?`,
            default: false,
          });

          if (!confirmed) {
            console.log(chalk.gray("Operation cancelled."));
            return;
          }
          spinner.start();
        }

        spinner.text = "Deleting profile...";
        projectStore.deleteProfileConfig(profileId);

        // Reset active profile if needed
        const rc = projectStore.loadRc();
        if (rc && rc.activeProfileId === profileId) {
          projectStore.saveRc({ activeProfileId: null });
        }

        found = true;
        deletedFrom = "project";
      } else {
        // No scope specified: try to find in both stores
        spinner.text = "Searching for profile...";

        // Check project first
        const projectRoot = findProjectRoot();
        if (projectRoot) {
          const projectStore = new ProjectStoreManager(projectRoot);
          if (projectStore.configExists(profileId)) {
            if (!options.force) {
              spinner.stop();
              const confirmed = await confirm({
                message: `Delete profile '${profileId}' from project?`,
                default: false,
              });

              if (!confirmed) {
                console.log(chalk.gray("Operation cancelled."));
                return;
              }
              spinner.start();
            }

            spinner.text = "Deleting profile from project...";
            projectStore.deleteProfileConfig(profileId);

            const rc = projectStore.loadRc();
            if (rc && rc.activeProfileId === profileId) {
              projectStore.saveRc({ activeProfileId: null });
            }

            found = true;
            deletedFrom = "project";
          }
        }

        // Check global store if not found in project
        if (!found) {
          const globalStore = new StoreManager();
          const index = globalStore.loadIndex();
          const profile = index.profiles.find((p) => p.id === profileId);

          if (profile) {
            if (!options.force) {
              spinner.stop();
              const confirmed = await confirm({
                message: `Delete profile '${profileId}' from global store?`,
                default: false,
              });

              if (!confirmed) {
                console.log(chalk.gray("Operation cancelled."));
                return;
              }
              spinner.start();
            }

            spinner.text = "Deleting profile from global store...";
            globalStore.deleteProfile(profileId);
            found = true;
            deletedFrom = "user";
          }
        }
      }

      if (!found) {
        spinner.fail(`Profile '${profileId}' not found.`);
        process.exit(1);
      }

      const scopeLabel = deletedFrom === "project" ? "[project]" : "[user]";
      spinner.succeed(`Deleted profile '${profileId}' ${scopeLabel}`);
    } catch (err) {
      spinner.fail(`Failed to remove profile: ${err instanceof Error ? err.message : "Unknown error"}`);
      process.exit(1);
    }
  });

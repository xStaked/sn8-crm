import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stitch } from "@google/stitch-sdk";

async function loadEnvFileIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  try {
    const envContent = await readFile(envPath, "utf8");
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function run() {
  await loadEnvFileIfPresent();
  const command = process.argv[2] ?? "pull";

  if (!process.env.STITCH_API_KEY) {
    console.error("Missing STITCH_API_KEY");
    process.exit(1);
  }

  if (command === "discover") {
    const projects = await stitch.projects();
    if (projects.length === 0) {
      console.log("No Stitch projects were found for this API key.");
      return;
    }

    for (const project of projects) {
      const screens = await project.screens();
      const projectId = project.id ?? project.projectId ?? "(unknown)";
      console.log(`Project: ${projectId}`);

      if (screens.length === 0) {
        console.log("  Screens: (none)");
        continue;
      }

      for (const screen of screens) {
        const screenId = screen.id ?? screen.screenId ?? "(unknown)";
        const screenTitle =
          typeof screen.title === "string" && screen.title.length > 0
            ? ` - ${screen.title}`
            : "";
        console.log(`  Screen: ${screenId}${screenTitle}`);
      }
    }

    return;
  }

  const projectId = process.env.STITCH_PROJECT_ID;
  const screenId = process.env.STITCH_SCREEN_ID;
  const outputPath =
    process.env.STITCH_OUTPUT_PATH ?? "src/app/dashboard/stitch-generated.html";

  if (!projectId || !screenId) {
    console.error("Missing STITCH_PROJECT_ID or STITCH_SCREEN_ID");
    process.exit(1);
  }

  const screen = await stitch.project(projectId).getScreen(screenId);
  const htmlUrl = await screen.getHtml();

  const response = await fetch(htmlUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Stitch HTML (${response.status})`);
  }

  const html = await response.text();
  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, html, "utf8");

  console.log(`Saved Stitch HTML to ${absoluteOutputPath}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

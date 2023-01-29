#!/usr/bin/env node

import { fdir } from "fdir";
import { mkdir, readFile, writeFile } from "fs/promises";
import prompts from "prompts";
import { highlight } from "cli-highlight";
import path from "path";
import tempy from "tempy";
import { spawnSync } from "child_process";
import os from "os";

export interface File {
  sourceFilePath: string;
  version: number;
  resource: string;
  entries: Entry[];
}

export interface Entry {
  id: string;
  timestamp: number;
  source?: string;
}

const ROAMING_DIR_PATH =
  process.platform === "win32"
    ? path.join(
        process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      )
    : process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support")
    : path.join(os.homedir(), ".config");

const HISTORY_DIR_PATH = path.join(ROAMING_DIR_PATH, "Code", "User", "History");

async function main() {
  const files = (
    await Promise.all(
      (
        new fdir()
          .withFullPaths()
          .filter((path) => path.includes("entries.json"))
          .crawl(HISTORY_DIR_PATH)
          .sync() as string[]
      ).map(async (path) => {
        return { path, contents: await readFile(path, "utf8") };
      })
    )
  ).map(({ path, contents }) => {
    return { ...JSON.parse(contents), sourceFilePath: path } as File;
  });

  await restore({ files });
}

main();

type CLIState = {
  files: File[];
  selectedFile?: File;
  version?: Entry;
};

async function restore(state: CLIState): Promise<void> {
  state.selectedFile = state.selectedFile || (await getFile(state.files));
  if (!state.selectedFile) return;

  state.version = state.version || (await getVersion(state.selectedFile));
  if (!state.version) return;

  const { files, selectedFile, version } = state;

  const action = await getAction(selectedFile);
  if (!action) return;

  const versionContents = await readFile(
    path.join(path.dirname(selectedFile.sourceFilePath), version.id),
    "utf8"
  );

  switch (action) {
    case "restore":
      await mkdir(path.dirname(selectedFile.resource.replace("file://", "")), {
        recursive: true,
      });
      await writeFile(
        selectedFile.resource.replace("file://", ""),
        versionContents
      );
      return await restore({ files });
    case "save":
      await writeFile(path.basename(selectedFile.resource), versionContents);
      break;
    case "preview":
      if (process.env.EDITOR) {
        await tempy.write.task(
          versionContents,
          (path) => {
            if (!process.env.EDITOR) return;
            spawnSync(process.env.EDITOR, [path], { stdio: "inherit" });
          },
          {
            name: path.basename(selectedFile.resource),
          }
        );
      } else {
        console.log(highlight(versionContents));
      }
      return await restore(state);
    case "restart":
      return await restore({ files });
    case "choose-version":
      return await restore({ files, selectedFile });
  }
}

async function getFile(files: File[]): Promise<File | undefined> {
  const { file } = await prompts({
    type: "autocomplete",
    limit: 5,
    name: "file",
    message: "Choose a file",
    choices: files.map((file) => ({
      title: normalizePath(file.resource),
      value: file,
    })),
    suggest: (input, choices) =>
      Promise.resolve(
        choices.filter((c) =>
          c.value?.resource?.toLowerCase().includes(input.toLowerCase())
        )
      ),
  });
  return file;
}

async function getVersion(file: File): Promise<Entry | undefined> {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const { version } = await prompts({
    type: "select",
    name: "version",
    message: "Choose a file version",
    limit: 5,
    choices: () => {
      file.entries.sort((a, b) => b.timestamp - a.timestamp);
      return file.entries.map((e) => ({
        title: new Date(e.timestamp).toLocaleString(locale, {
          year: "numeric",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          hour12: true,
          minute: "2-digit",
          second: "2-digit",
        }),
        description: daysSince(e.timestamp),
        value: e,
      }));
    },
  });
  return version;
}

async function getAction(
  selectedFile: File
): Promise<
  "restore" | "save" | "preview" | "restart" | "choose-version" | undefined
> {
  const { action } = await prompts({
    type: "select",
    name: "action",
    message: "Choose",
    choices: [
      {
        title: "Restore",
        value: "restore",
        description: `Restore selected version to ${selectedFile.resource}`,
      },
      {
        title: "Save here",
        value: "save",
        description: `Save selected version to ${process.cwd()}`,
      },
      {
        title: "Preview",
        value: "preview",
        description: `Preview selected version in ${
          process.env.EDITOR || "terminal"
        }`,
      },
      {
        title: "Start over",
        value: "restart",
        description: "Go back to selecting file",
      },
      {
        title: "Choose a different version",
        value: "choose-version",
        description: "Go back to selecting version",
      },
    ],
  });
  return action;
}

function normalizePath(filePath: string): string {
  filePath = decodeURIComponent(filePath);
  filePath = filePath.replace("file:///", "");
  if (process.platform !== "win32") filePath = `/${filePath}`;
  else filePath = `${filePath[0].toUpperCase()}${filePath.slice(1)}`;

  return path.normalize(filePath);
}

function daysSince(timestamp: number) {
  const MILLISECONDS_IN_DAY = 86400000;
  const daysSince = Math.round((Date.now() - timestamp) / MILLISECONDS_IN_DAY);
  return daysSince === 0
    ? "today"
    : daysSince > 1
    ? `${daysSince} days ago`
    : `${daysSince} day ago`;
}

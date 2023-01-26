import { fdir, Output } from "fdir";
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
  console.log("Searching ", HISTORY_DIR_PATH, "for files...");
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
  ).map(
    ({ path, contents }) =>
      ({ ...JSON.parse(contents), sourceFilePath: path } as File)
  );

  // const allPaths = files.map((a) => a.resource);
  // while (true) {

  const { file } = (await prompts({
    type: "autocomplete",
    name: "file",
    message: "Choose a file",
    choices: files.map((file) => ({
      title: file.resource.replace("file://", ""),
      value: file,
    })),
    suggest: (input, choices) =>
      Promise.resolve(
        choices.filter((c) =>
          c.value?.resource?.toLowerCase().includes(input.toLowerCase())
        )
      ),
  })) as { file: File };

  const { version } = (await prompts({
    type: "select",
    name: "version",
    message: "Choose a file version",
    choices: () => {
      file.entries.sort((a, b) => b.timestamp - a.timestamp);
      return file.entries.map((e) => ({
        title: new Date(e.timestamp).toISOString(),
        value: e,
      }));
    },
  })) as { version: Entry };

  const { action } = (await prompts({
    type: "select",
    name: "action",
    message: "Choose",
    choices: [
      { title: "Restore", value: "restore" },
      { title: "Save here", value: "save" },
      { title: "Preview", value: "preview" },
      { title: "Start over", value: "restart" },
      { title: "Choose a different version", value: "choose-version" },
    ],
  })) as { action: string };

  // const selectedFile = files.find((f) => f.resource === selectedFilePath);
  // if (!selectedFile) {
  //   console.error("Please select a valid file.");
  //   return;
  // }
  // selectedFile.entries.sort((a, b) => b.timestamp - a.timestamp);

  // const { selectedVersion } = await inquirer.prompt([
  //   {
  //     type: "list",
  //     name: "selectedVersion",
  //     message: "Choose a file version",
  //     choices: selectedFile.entries.map((e) =>
  //       new Date(e.timestamp).toISOString()
  //     ),
  //     pageSize: 5,
  //   },
  // ]);

  // const version = selectedFile.entries.find(
  //   (e) => new Date(e.timestamp).toISOString() === selectedVersion
  // );
  // if (!version) {
  //   console.log("Invalid version.");
  //   return;
  // }

  // actionLoop: while (true) {
  //   const { action } = await inquirer.prompt([
  //     {
  //       type: "list",
  //       name: "action",
  //       message: "What do you want to do?",
  //       choices: ["Restore", "Save here", "Preview", "Start over"],
  //       pageSize: 5,
  //     },
  //   ]);

  //   const versionContents = await readFile(
  //     path.join(path.dirname(selectedFile.sourceFilePath), version.id),
  //     "utf8"
  //   );
  //   switch (action) {
  //     case "Restore":
  //       await mkdir(
  //         path.dirname(selectedFile.resource.replace("file://", "")),
  //         { recursive: true }
  //       );
  //       await writeFile(
  //         selectedFile.resource.replace("file://", ""),
  //         versionContents
  //       );
  //       break actionLoop;
  //     case "Save here":
  //       await writeFile(
  //         path.basename(selectedFile.resource),
  //         versionContents
  //       );
  //       break;
  //     case "Preview":
  //       if (process.env.EDITOR) {
  //         await tempy.write.task(
  //           versionContents,
  //           (path) => {
  //             if (!process.env.EDITOR) return;
  //             spawnSync(process.env.EDITOR, [path], { stdio: "inherit" });
  //           },
  //           {
  //             name: path.basename(selectedFile.resource),
  //           }
  //         );
  //       } else {
  //         console.log(highlight(versionContents));
  //       }
  //       break;
  //     case "Start over":
  //       break actionLoop;
  //   }
  // }
  // }
}
main();

import { fdir, Output } from "fdir";
import { mkdir, readFile, writeFile } from "fs/promises";
import inquirer from "inquirer";
// @ts-ignore
import inquirerPrompt from "inquirer-autocomplete-prompt";
import { highlight } from "cli-highlight";
import path from "path";
import tempy from "tempy";
import { spawnSync } from "child_process";

inquirer.registerPrompt("autocomplete", inquirerPrompt);
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

async function main() {
  const files = (
    await Promise.all(
      (
        new fdir()
          .withFullPaths()
          .filter((path) => path.includes("entries.json"))
          .crawl("/home/thecodrr/.config/Code/User/History/")
          .sync() as string[]
      ).map(async (path) => {
        return { path, contents: await readFile(path, "utf8") };
      })
    )
  ).map(
    ({ path, contents }) =>
      ({ ...JSON.parse(contents), sourceFilePath: path } as File)
  );

  const allPaths = files.map((a) => a.resource);
  while (true) {
    const { selectedFilePath } = await inquirer.prompt([
      {
        type: "autocomplete",
        name: "selectedFilePath",
        message: "Choose a file",
        // @ts-ignore
        source: (_, input) =>
          input
            ? allPaths.filter((p) =>
                p.toLowerCase().includes(input.toLowerCase())
              )
            : allPaths,
        pageSize: 5,
      },
    ]);

    const selectedFile = files.find((f) => f.resource === selectedFilePath);
    if (!selectedFile) {
      console.error("Please select a valid file.");
      return;
    }
    selectedFile.entries.sort((a, b) => b.timestamp - a.timestamp);

    const { selectedVersion } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedVersion",
        message: "Choose a file version",
        choices: selectedFile.entries.map((e) =>
          new Date(e.timestamp).toISOString()
        ),
        pageSize: 5,
      },
    ]);

    const version = selectedFile.entries.find(
      (e) => new Date(e.timestamp).toISOString() === selectedVersion
    );
    if (!version) {
      console.log("Invalid version.");
      return;
    }

    actionLoop: while (true) {
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What do you want to do?",
          choices: ["Restore", "Save here", "Preview"],
          pageSize: 5,
        },
      ]);

      const versionContents = await readFile(
        path.join(path.dirname(selectedFile.sourceFilePath), version.id),
        "utf8"
      );
      switch (action) {
        case "Restore":
          await mkdir(
            path.dirname(selectedFile.resource.replace("file://", "")),
            { recursive: true }
          );
          await writeFile(
            selectedFile.resource.replace("file://", ""),
            versionContents
          );
          break actionLoop;
        case "Save here":
          await writeFile(
            path.basename(selectedFile.resource),
            versionContents
          );
          break;
        case "Preview":
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
          break;
      }
    }
  }
}
main();

import { Notice, Plugin } from "obsidian";
import {
  getDailyNoteSettings,
  getAllDailyNotes,
  getDailyNote,
} from "obsidian-daily-notes-interface";
import UndoModal from "./ui/UndoModal";
import RolloverSettingTab from "./ui/RolloverSettingTab";
import { getTodos } from "./get-todos";

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

/* Just some boilerplate code for recursively going through subheadings for later
function createRepresentationFromHeadings(headings) {
  let i = 0;
  const tags = [];

  (function recurse(depth) {
    let unclosedLi = false;
    while (i < headings.length) {
      const [hashes, data] = headings[i].split("# ");
      if (hashes.length < depth) {
        break;
      } else if (hashes.length === depth) {
        if (unclosedLi) tags.push('</li>');
        unclosedLi = true;
        tags.push('<li>', data);
        i++;
      } else {
        tags.push('<ul>');
        recurse(depth + 1);
        tags.push('</ul>');
      }
    }
    if (unclosedLi) tags.push('</li>');
  })(-1);
  return tags.join('\n');
}
*/

export default class RolloverTodosPlugin extends Plugin {
  async loadSettings() {
    const DEFAULT_SETTINGS = {
      templateHeading: "none",
      deleteOnComplete: false,
      removeEmptyTodos: false,
      rolloverChildren: false,
      rolloverOnFileCreate: true,
      rolloverAllContent: false,
      doneStatusMarkers: "xX-",
    };
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  isDailyNotesEnabled() {
    const dailyNotesPlugin = this.app.internalPlugins.plugins["daily-notes"];
    const dailyNotesEnabled = dailyNotesPlugin && dailyNotesPlugin.enabled;

    const periodicNotesPlugin = this.app.plugins.getPlugin("periodic-notes");
    const periodicNotesEnabled =
      periodicNotesPlugin && periodicNotesPlugin.settings?.daily?.enabled;

    return dailyNotesEnabled || periodicNotesEnabled;
  }

  getLastDailyNote() {
    const { moment } = window;
    let { folder, format } = getDailyNoteSettings();

    folder = this.getCleanFolder(folder);
    folder = folder.length === 0 ? folder : folder + "/";

    const dailyNoteRegexMatch = new RegExp("^" + folder + "(.*).md$");
    const todayMoment = moment();

    // get all notes in directory that aren't null
    const dailyNoteFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(folder))
      .filter((file) =>
        moment(
          file.path.replace(dailyNoteRegexMatch, "$1"),
          format,
          true
        ).isValid()
      )
      .filter((file) => file.basename)
      .filter((file) =>
        this.getFileMoment(file, folder, format).isSameOrBefore(
          todayMoment,
          "day"
        )
      );

    // sort by date
    const sorted = dailyNoteFiles.sort(
      (a, b) =>
        this.getFileMoment(b, folder, format).valueOf() -
        this.getFileMoment(a, folder, format).valueOf()
    );
    return sorted[1];
  }

  getFileMoment(file, folder, format) {
    let path = file.path;

    if (path.startsWith(folder)) {
      // Remove length of folder from start of path
      path = path.substring(folder.length);
    }

    if (path.endsWith(`.${file.extension}`)) {
      // Remove length of file extension from end of path
      path = path.substring(0, path.length - file.extension.length - 1);
    }

    return moment(path, format);
  }

  async getAllUnfinishedTodos(file) {
    const dn = await this.app.vault.read(file);
    const dnLines = dn.split(/\r?\n|\r|\n/g);

    return getTodos({
      lines: dnLines,
      withChildren: this.settings.rolloverChildren,
      doneStatusMarkers: this.settings.doneStatusMarkers,
    });
  }

  // Get all content except completed todos
  async getContentWithoutCompletedTodos(file) {
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n|\r|\n/g);
    
    // Create a TodoParser to check which lines are completed todos
    const todoParser = new (class {
      constructor(lines, withChildren, doneStatusMarkers) {
        this.lines = lines;
        this.withChildren = withChildren;
        this.doneStatusMarkers = doneStatusMarkers ? Array.from(doneStatusMarkers) : ["x", "X", "-"];
      }
      
      // Check if a line is a completed todo
      isCompletedTodo(line) {
        const match = line.match(/\s*[*+-] \[(.+?)\]/);
        if (!match) return false;
        
        const content = match[1];
        if (content.length !== 1) return false;
        
        return this.doneStatusMarkers.includes(content);
      }
      
      // Get indices of completed todos and their children (if rolloverChildren is enabled)
      getCompletedTodoIndices() {
        const indices = [];
        for (let i = 0; i < this.lines.length; i++) {
          if (this.isCompletedTodo(this.lines[i])) {
            indices.push(i);
            // If rolloverChildren is enabled, also add child lines
            if (this.withChildren) {
              let j = i + 1;
              const currentIndent = this.lines[i].search(/\S/);
              while (j < this.lines.length && this.lines[j].search(/\S/) > currentIndent) {
                indices.push(j);
                j++;
              }
            }
          }
        }
        return indices;
      }
    })(lines, this.settings.rolloverChildren, this.settings.doneStatusMarkers);
    
    const completedIndices = todoParser.getCompletedTodoIndices();
    const filteredLines = lines.filter((line, index) => !completedIndices.includes(index));
    
    return filteredLines.join("\n");
  }

  async sortHeadersIntoHierarchy(file) {
    ///console.log('testing')
    const templateContents = await this.app.vault.read(file);
    const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
      ([heading]) => heading
    );

    if (allHeadings.length > 0) {
      console.log(createRepresentationFromHeadings(allHeadings));
    }
  }

  getCleanFolder(folder) {
    // Check if user defined folder with root `/` e.g. `/dailies`
    if (folder.startsWith("/")) {
      folder = folder.substring(1);
    }

    // Check if user defined folder with trailing `/` e.g. `dailies/`
    if (folder.endsWith("/")) {
      folder = folder.substring(0, folder.length - 1);
    }

    return folder;
  }

  async rollover(file = undefined) {
    /*** First we check if the file created is actually a valid daily note ***/
    let { folder, format } = getDailyNoteSettings();
    let ignoreCreationTime = false;

    // Rollover can be called, but we need to get the daily file
    if (file == undefined) {
      const allDailyNotes = getAllDailyNotes();
      file = getDailyNote(window.moment(), allDailyNotes);
      ignoreCreationTime = true;
    }
    if (!file) return;

    folder = this.getCleanFolder(folder);

    // is a daily note
    if (!file.path.startsWith(folder)) return;

    // is today's daily note
    const today = new Date();
    const todayFormatted = window.moment(today).format(format);
    const filePathConstructed = `${folder}${
      folder == "" ? "" : "/"
    }${todayFormatted}.${file.extension}`;
    if (filePathConstructed !== file.path) return;

    // was just created or ignore creation time (for manual rollover)
    if (
      today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION &&
      !ignoreCreationTime
    ) {
      // Check if file is empty (newly created) - this fixes the bug where deleted and recreated files were blank
      const fileContent = await this.app.vault.read(file);
      if (fileContent.trim() !== "") {
        return;
      }
    }

    /*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
    if (!this.isDailyNotesEnabled()) {
      new Notice(
        "RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).",
        10000
      );
    } else {
      const { templateHeading, deleteOnComplete, removeEmptyTodos, rolloverAllContent } =
        this.settings;

      // check if there is a daily note from yesterday
      const lastDailyNote = this.getLastDailyNote();
      if (!lastDailyNote) return;

      // TODO: Rollover to subheadings (optional)
      //this.sortHeadersIntoHierarchy(lastDailyNote)

      let contentToRollover = "";
      let todosAdded = 0;
      let emptiesToNotAddToTomorrow = 0;
      let todos_yesterday = [];
      
      // If rolloverAllContent is enabled, copy all content except completed todos
      if (rolloverAllContent) {
        contentToRollover = await this.getContentWithoutCompletedTodos(lastDailyNote);
        // Count non-empty lines as "todos added" for notification purposes
        todosAdded = contentToRollover.split(/\r?\n/).filter(line => line.trim() !== "").length;
      } else {
        // Original behavior - only copy unfinished todos
        todos_yesterday = await this.getAllUnfinishedTodos(lastDailyNote);

        console.log(
          `rollover-daily-todos: ${todos_yesterday.length} todos found in ${lastDailyNote.basename}.md`
        );

        if (todos_yesterday.length == 0) {
          return;
        }

        // Potentially filter todos from yesterday for today
        let todos_today = !removeEmptyTodos ? todos_yesterday : [];
        if (removeEmptyTodos) {
          todos_yesterday.forEach((line, i) => {
            const trimmedLine = (line || "").trim();
            if (trimmedLine != "- [ ]" && trimmedLine != "- [  ]") {
              todos_today.push(line);
              todosAdded++;
            } else {
              emptiesToNotAddToTomorrow++;
            }
          });
        } else {
          todosAdded = todos_yesterday.length;
        }
        
        contentToRollover = todos_today.join("\n");
      }

      // setup undo history
      let undoHistoryInstance = {
        previousDay: {
          file: undefined,
          oldContent: "",
        },
        today: {
          file: undefined,
          oldContent: "",
        },
      };

      // get today's content and modify it
      let templateHeadingNotFoundMessage = "";
      const templateHeadingSelected = templateHeading !== "none";

      if (contentToRollover.length > 0) {
        let dailyNoteContent = await this.app.vault.read(file);
        undoHistoryInstance.today = {
          file: file,
          oldContent: `${dailyNoteContent}`,
        };
        
        // If template heading is selected, try to rollover to template heading
        if (templateHeadingSelected) {
          const contentAddedToHeading = dailyNoteContent.replace(
            templateHeading,
            `${templateHeading}\n${contentToRollover}`
          );
          if (contentAddedToHeading == dailyNoteContent) {
            templateHeadingNotFoundMessage = `Rollover couldn't find '${templateHeading}' in today's daily not. Rolling todos to end of file.`;
          } else {
            dailyNoteContent = contentAddedToHeading;
          }
        } else {
          // Rollover to bottom of file if no heading selected
          dailyNoteContent += `\n${contentToRollover}`;
        }

        await this.app.vault.modify(file, dailyNoteContent);
      }

      // if deleteOnComplete, get yesterday's content and modify it
      if (deleteOnComplete) {
        let lastDailyNoteContent = await this.app.vault.read(lastDailyNote);
        undoHistoryInstance.previousDay = {
          file: lastDailyNote,
          oldContent: `${lastDailyNoteContent}`,
        };
        let lines = lastDailyNoteContent.split("\n");

        // If rolloverAllContent is enabled, we need to remove completed todos from yesterday
        if (rolloverAllContent) {
          const contentWithoutCompleted = await this.getContentWithoutCompletedTodos(lastDailyNote);
          const linesWithoutCompleted = contentWithoutCompleted.split("\n");
          // Remove lines that are not in the filtered content
          lines = lines.filter((line, index) => {
            return linesWithoutCompleted.includes(line) || line.trim() === "";
          });
        } else {
          // Original behavior - remove unfinished todos
          for (let i = lines.length; i >= 0; i--) {
            if (todos_yesterday.includes(lines[i])) {
              lines.splice(i, 1);
            }
          }
        }

        const modifiedContent = lines.join("\n");
        await this.app.vault.modify(lastDailyNote, modifiedContent);
      }

      // Let user know rollover has been successful with X todos
      const todosAddedString =
        todosAdded == 0
          ? ""
          : `- ${todosAdded} item${todosAdded > 1 ? "s" : ""} rolled over.`;
      const emptiesToNotAddToTomorrowString =
        emptiesToNotAddToTomorrow == 0
          ? ""
          : deleteOnComplete
          ? `- ${emptiesToNotAddToTomorrow} empty todo${
              emptiesToNotAddToTomorrow > 1 ? "s" : ""
            } removed.`
          : "";
      const part1 =
        templateHeadingNotFoundMessage.length > 0
          ? `${templateHeadingNotFoundMessage}`
          : "";
      const part2 = `${todosAddedString}${
        todosAddedString.length > 0 ? " " : ""
      }`;
      const part3 = `${emptiesToNotAddToTomorrowString}${
        emptiesToNotAddToTomorrowString.length > 0 ? " " : ""
      }`;

      let allParts = [part1, part2, part3];
      let nonBlankLines = [];
      allParts.forEach((part) => {
        if (part.length > 0) {
          nonBlankLines.push(part);
        }
      });

      const message = nonBlankLines.join("\n");
      if (message.length > 0) {
        new Notice(message, 4000 + message.length * 3);
      }
      this.undoHistoryTime = new Date();
      this.undoHistory = [undoHistoryInstance];
    }
  }

  async onload() {
    await this.loadSettings();
    this.undoHistory = [];
    this.undoHistoryTime = new Date();

    this.addSettingTab(new RolloverSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        // Check if automatic daily note creation is enabled
        if (!this.settings.rolloverOnFileCreate) return;
        this.rollover(file);
      })
    );

    this.addCommand({
      id: "obsidian-rollover-daily-todos-rollover",
      name: "Rollover Todos Now",
      callback: () => {
        this.rollover();
      },
    });

    this.addCommand({
      id: "obsidian-rollover-daily-todos-undo",
      name: "Undo last rollover",
      checkCallback: (checking) => {
        // no history, don't allow undo
        if (this.undoHistory.length > 0) {
          const now = window.moment();
          const lastUse = window.moment(this.undoHistoryTime);
          const diff = now.diff(lastUse, "seconds");
          // 2+ mins since use: don't allow undo
          if (diff > 2 * 60) {
            return false;
          }
          if (!checking) {
            new UndoModal(this).open();
          }
          return true;
        }
        return false;
      },
    });
  }
}

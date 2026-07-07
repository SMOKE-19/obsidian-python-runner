import {
  App,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile
} from "obsidian";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import { homedir, tmpdir } from "os";
import * as path from "path";
import { parse as parseYaml } from "yaml";

interface PythonRunnerSettings {
  defaultPythonPath: string;
  defaultWorkingDirectory: string;
  timeoutSeconds: number;
  pathTemplates: Record<string, string>;
}

const DEFAULT_SETTINGS: PythonRunnerSettings = {
  defaultPythonPath: "python",
  defaultWorkingDirectory: ".",
  timeoutSeconds: 60,
  pathTemplates: {}
};

const BUILT_IN_PATH_TEMPLATE_LABELS: Record<string, string> = {
  documents: "문서",
  downloads: "다운로드",
  desktop: "바탕화면"
};

interface Section {
  name: string;
  level: number;
  headingStart: number;
  contentStart: number;
  end: number;
}

interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  canceled: boolean;
  stdout: string;
  stderr: string;
}

interface NoteRunSettings {
  python?: string;
  install_missing_requirements?: boolean;
  working_directory?: string;
  append_run_history?: boolean;
  capture_python_info?: boolean;
  capture_requirements?: boolean;
  requirements_mode?: "freeze" | "packages";
  requirements_packages?: string[];
  timeout_seconds?: number;
}

interface EffectiveRunConfig {
  rawSettings: Record<string, unknown>;
  rawVariables: Record<string, unknown>;
  pythonPath: string;
  workingDirectoryValue: string;
  workingDirectory: string;
  appendRunHistory: boolean;
  capturePythonInfo: boolean;
  captureRequirements: boolean;
  installMissingRequirements: boolean;
  requirementsMode: "freeze" | "packages";
  requirementsPackages: string[];
  timeoutSeconds: number;
}

interface RunMetadata {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  documentPath: string;
  configuredPython: string;
  workingDirectory: string;
  pythonInfo?: ProbeResult;
  requirements?: ProbeResult;
  install?: InstallMetadata;
}

interface InstallMetadata {
  missingPackages: string[];
  result?: ProbeResult;
}

interface ProbeResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface FencedBlock {
  language: string;
  name: string;
  content: string;
}

const MAX_CAPTURE_BYTES = 1024 * 1024;

type LocaleKey =
  | "runCurrentNote"
  | "pathTemplateModalAdd"
  | "pathTemplateModalEdit"
  | "pathTemplateModalDesc"
  | "templateName"
  | "templateNameDesc"
  | "path"
  | "pathDesc"
  | "cancel"
  | "yes"
  | "no"
  | "save"
  | "openMarkdownNote"
  | "noScriptSection"
  | "pythonRunCanceled"
  | "installingMissingPackages"
  | "pipInstallFailed"
  | "pythonRunMissingResult"
  | "pythonTimedOut"
  | "pythonRunCompleted"
  | "pythonExited"
  | "pythonRunnerFailed"
  | "runPythonNote"
  | "document"
  | "python"
  | "workingDirectory"
  | "pythonIsRunning"
  | "invalidTemplateName"
  | "reservedTemplateName"
  | "emptyTemplatePath"
  | "defaultPythonPath"
  | "defaultPythonPathDesc"
  | "defaultWorkingDirectory"
  | "defaultWorkingDirectoryDesc"
  | "timeoutSeconds"
  | "timeoutSecondsDesc"
  | "pathTemplates"
  | "pathTemplatesDesc"
  | "noteDirDesc"
  | "vaultRootDesc"
  | "edit"
  | "delete"
  | "customPathTemplate"
  | "customPathTemplateDesc"
  | "add";

const UI_TEXT: Record<"en" | "ko", Record<LocaleKey, string>> = {
  en: {
    runCurrentNote: "Run current note",
    pathTemplateModalAdd: "Add path template",
    pathTemplateModalEdit: "Edit path template",
    pathTemplateModalDesc:
      "Use the template in notes as {{template_name}}. Reserved templates note_dir and vault_root cannot be edited.",
    templateName: "Template name",
    templateNameDesc: "Letters, numbers, and underscores only. Example: data_dir",
    path: "Path",
    pathDesc: "May include {{note_dir}}, {{vault_root}}, or another custom template.",
    cancel: "Cancel",
    yes: "Yes",
    no: "No",
    save: "Save",
    openMarkdownNote: "Open a markdown note before running Python.",
    noScriptSection: "No Script section found.",
    pythonRunCanceled: "Python run canceled.",
    installingMissingPackages: "Installing missing Python packages: {packages}",
    pipInstallFailed: "pip install failed.",
    pythonRunMissingResult: "Python run did not produce a result.",
    pythonTimedOut: "Python timed out after {seconds}s.",
    pythonRunCompleted: "Python run completed.",
    pythonExited: "Python exited with code {code}.",
    pythonRunnerFailed: "Python Runner failed: {message}",
    runPythonNote: "Run Python note?",
    document: "Document",
    python: "Python",
    workingDirectory: "Working directory",
    pythonIsRunning: "Python is running",
    invalidTemplateName: "Template name must use letters, numbers, and underscores, and cannot start with a number.",
    reservedTemplateName: "note_dir and vault_root are reserved templates.",
    emptyTemplatePath: "Template path cannot be empty.",
    defaultPythonPath: "Default Python path",
    defaultPythonPathDesc: "Used when the note does not include a Python section.",
    defaultWorkingDirectory: "Default working directory",
    defaultWorkingDirectoryDesc: "Use '.', '{{note_dir}}', '{{vault_root}}', an absolute path, or a note-dir-relative path.",
    timeoutSeconds: "Timeout seconds",
    timeoutSecondsDesc: "The plugin stops a Python run after this many seconds.",
    pathTemplates: "Path templates",
    pathTemplatesDesc: "Reserved templates are available in Python paths, working directories, and Variables strings.",
    noteDirDesc: "Folder containing the current markdown note. Reserved and read-only.",
    vaultRootDesc: "Root folder of the current Obsidian vault. Reserved and read-only.",
    edit: "Edit",
    delete: "Delete",
    customPathTemplate: "Custom path template",
    customPathTemplateDesc: "Add a reusable path token such as {{data_dir}} or {{venv_dir}}.",
    add: "Add"
  },
  ko: {
    runCurrentNote: "현재 노트 실행",
    pathTemplateModalAdd: "경로 템플릿 추가",
    pathTemplateModalEdit: "경로 템플릿 수정",
    pathTemplateModalDesc:
      "노트에서는 {{template_name}} 형태로 사용합니다. 예약 템플릿 note_dir, vault_root는 수정할 수 없습니다.",
    templateName: "템플릿 이름",
    templateNameDesc: "영문, 숫자, 밑줄만 사용할 수 있습니다. 예: data_dir",
    path: "경로",
    pathDesc: "{{note_dir}}, {{vault_root}}, 다른 사용자 템플릿을 포함할 수 있습니다.",
    cancel: "취소",
    yes: "예",
    no: "아니오",
    save: "저장",
    openMarkdownNote: "Python을 실행할 마크다운 노트를 먼저 열어주세요.",
    noScriptSection: "Script 섹션을 찾을 수 없습니다.",
    pythonRunCanceled: "Python 실행을 취소했습니다.",
    installingMissingPackages: "누락된 Python 패키지를 설치하는 중입니다: {packages}",
    pipInstallFailed: "pip install에 실패했습니다.",
    pythonRunMissingResult: "Python 실행 결과가 생성되지 않았습니다.",
    pythonTimedOut: "Python 실행이 {seconds}초 후 시간 초과되었습니다.",
    pythonRunCompleted: "Python 실행이 완료되었습니다.",
    pythonExited: "Python이 종료 코드 {code}로 종료되었습니다.",
    pythonRunnerFailed: "Python Runner 실행 실패: {message}",
    runPythonNote: "Python 노트를 실행할까요?",
    document: "문서",
    python: "Python",
    workingDirectory: "작업 디렉토리",
    pythonIsRunning: "Python 실행 중",
    invalidTemplateName: "템플릿 이름은 영문, 숫자, 밑줄만 사용할 수 있고 숫자로 시작할 수 없습니다.",
    reservedTemplateName: "note_dir와 vault_root는 예약 템플릿입니다.",
    emptyTemplatePath: "템플릿 경로를 입력해야 합니다.",
    defaultPythonPath: "기본 Python 경로",
    defaultPythonPathDesc: "노트에 Python 섹션이 없을 때 사용합니다.",
    defaultWorkingDirectory: "기본 작업 디렉토리",
    defaultWorkingDirectoryDesc: "'.', '{{note_dir}}', '{{vault_root}}', 절대경로, 노트 폴더 기준 상대경로를 사용할 수 있습니다.",
    timeoutSeconds: "제한 시간(초)",
    timeoutSecondsDesc: "설정한 시간이 지나면 Python 실행을 중지합니다.",
    pathTemplates: "경로 템플릿",
    pathTemplatesDesc: "예약 템플릿은 Python 경로, 작업 디렉토리, Variables 문자열에서 사용할 수 있습니다.",
    noteDirDesc: "현재 마크다운 노트가 있는 폴더입니다. 예약 템플릿이며 읽기 전용입니다.",
    vaultRootDesc: "현재 Obsidian vault 루트 폴더입니다. 예약 템플릿이며 읽기 전용입니다.",
    edit: "수정",
    delete: "삭제",
    customPathTemplate: "사용자 경로 템플릿",
    customPathTemplateDesc: "{{data_dir}}, {{venv_dir}} 같은 재사용 경로 토큰을 추가합니다.",
    add: "추가"
  }
};

export default class PythonRunnerPlugin extends Plugin {
  settings: PythonRunnerSettings;
  settingTab: PythonRunnerSettingTab;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "run-current-note",
      name: localize(this.app, "runCurrentNote"),
      callback: () => this.runCurrentNote()
    });

    this.settingTab = new PythonRunnerSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
  }

  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    this.settings.pathTemplates = Object.assign(
      {},
      getDefaultPathTemplates(),
      this.settings.pathTemplates
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async runCurrentNote() {
    const t = getTranslator(this.app);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;

    if (!(file instanceof TFile)) {
      new Notice(t("openMarkdownNote"));
      return;
    }

    try {
      const vaultBasePath = this.getVaultBasePath();
      const source = await this.app.vault.read(file);
      const sections = parseSections(source);
      const script = readSectionValue(source, sections, "Script");

      if (!script) {
        new Notice(t("noScriptSection"));
        return;
      }

      const config = this.buildRunConfig(source, sections, vaultBasePath, file);

      const confirmed = await confirmRun(this.app, file, config.pythonPath, config.workingDirectory);
      if (!confirmed) {
        new Notice(t("pythonRunCanceled"));
        return;
      }

      const runningModal = new RunningPythonModal(this.app, file.path);
      runningModal.open();

      let result: RunResult | undefined;
      let pythonInfo: ProbeResult | undefined;
      let requirements: ProbeResult | undefined;
      let install: InstallMetadata | undefined;
      const startedAt = new Date();
      try {
        if (config.capturePythonInfo) {
          pythonInfo = await this.capturePythonInfo(config.pythonPath, config.workingDirectory);
        }

        if (config.installMissingRequirements) {
          const missingPackages = await this.findMissingRequirements(config);
          install = { missingPackages };

          if (missingPackages.length > 0) {
            new Notice(formatLocalized(t("installingMissingPackages"), { packages: missingPackages.join(", ") }));
            install.result = await this.installMissingRequirements(config, missingPackages);

            if (!install.result.ok) {
              result = {
                exitCode: 1,
                timedOut: false,
                canceled: false,
                stdout: "",
                stderr: install.result.stderr || t("pipInstallFailed")
              };
            }
          }
        }

        if (!result) {
          const runnableScript = buildRunnableScript(config.rawSettings, config.rawVariables, script);
          result = await this.executePython(config.pythonPath, runnableScript, config.workingDirectory, config.timeoutSeconds, (cancel) => {
            runningModal.setCancelHandler(cancel);
          });
        }

        if (config.captureRequirements && result && !result.canceled && !result.timedOut) {
          requirements = await this.captureRequirements(config);
        }
      } finally {
        runningModal.close();
      }

      const finishedAt = new Date();
      if (!result) {
        result = {
          exitCode: 1,
          timedOut: false,
          canceled: false,
          stdout: "",
          stderr: t("pythonRunMissingResult")
        };
      }

      const metadata: RunMetadata = {
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        documentPath: file.path,
        configuredPython: config.pythonPath,
        workingDirectory: config.workingDirectory,
        pythonInfo,
        requirements,
        install
      };

      let nextSource = config.installMissingRequirements ? disableInstallMissingRequirements(source) : source;
      nextSource = updateSection(nextSource, "Result", formatResult(result, metadata));
      if (config.appendRunHistory) {
        nextSource = prependSectionEntry(nextSource, "Run History", formatHistoryEntry(result, metadata));
      }

      await this.app.vault.modify(file, nextSource);

      if (result.canceled) {
        new Notice(t("pythonRunCanceled"));
      } else if (result.timedOut) {
        new Notice(formatLocalized(t("pythonTimedOut"), { seconds: String(config.timeoutSeconds) }));
      } else if (result.exitCode === 0) {
        new Notice(t("pythonRunCompleted"));
      } else {
        new Notice(formatLocalized(t("pythonExited"), { code: String(result.exitCode) }));
      }
    } catch (error) {
      console.error(error);
      new Notice(formatLocalized(t("pythonRunnerFailed"), { message: error instanceof Error ? error.message : String(error) }));
    }
  }

  private async executePython(
    pythonPath: string,
    script: string,
    workingDirectory: string,
    timeoutSeconds: number,
    onCancelReady: (cancel: () => void) => void
  ): Promise<RunResult> {
    const tempPath = path.join(tmpdir(), `obsidian-python-runner-${Date.now()}.py`);
    await fs.writeFile(tempPath, script, "utf8");

    try {
      return await new Promise<RunResult>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let canceled = false;

        const child = spawn(pythonPath, [tempPath], {
          cwd: workingDirectory,
          env: process.env,
          shell: false
        });

        onCancelReady(() => {
          canceled = true;
          child.kill();
        });

        const timer = window.setTimeout(() => {
          timedOut = true;
          child.kill();
        }, Math.max(1, timeoutSeconds) * 1000);

        child.stdout.on("data", (chunk: Buffer) => {
          stdout = appendLimited(stdout, chunk.toString("utf8"));
        });

        child.stderr.on("data", (chunk: Buffer) => {
          stderr = appendLimited(stderr, chunk.toString("utf8"));
        });

        child.on("error", (error) => {
          window.clearTimeout(timer);
          reject(error);
        });

        child.on("close", (exitCode) => {
          window.clearTimeout(timer);
          resolve({ exitCode, timedOut, canceled, stdout, stderr });
        });
      });
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }

  private async capturePythonInfo(pythonPath: string, workingDirectory: string): Promise<ProbeResult> {
    const code = [
      "import json, sys",
      "print(json.dumps({",
      "  'sys_executable': sys.executable,",
      "  'sys_version': sys.version,",
      "  'sys_prefix': sys.prefix,",
      "  'sys_base_prefix': sys.base_prefix,",
      "}, ensure_ascii=False))"
    ].join("\n");
    return this.runProbe(pythonPath, ["-c", code], workingDirectory);
  }

  private async captureRequirements(config: EffectiveRunConfig): Promise<ProbeResult> {
    if (config.requirementsMode === "packages") {
      const packagesJson = JSON.stringify(config.requirementsPackages);
      const code = [
        "import importlib.metadata as metadata, json",
        `packages = json.loads(${JSON.stringify(packagesJson)})`,
        "rows = []",
        "for name in packages:",
        "    try:",
        "        rows.append(f'{name}=={metadata.version(name)}')",
        "    except metadata.PackageNotFoundError:",
        "        rows.append(f'{name}==<not installed>')",
        "print('\\n'.join(rows))"
      ].join("\n");
      return this.runProbe(config.pythonPath, ["-c", code], config.workingDirectory);
    }

    return this.runProbe(config.pythonPath, ["-m", "pip", "freeze"], config.workingDirectory);
  }

  private async findMissingRequirements(config: EffectiveRunConfig): Promise<string[]> {
    if (config.requirementsPackages.length === 0) {
      return [];
    }

    const packagesJson = JSON.stringify(config.requirementsPackages);
    const code = [
      "import importlib.metadata as metadata, json",
      `packages = json.loads(${JSON.stringify(packagesJson)})`,
      "missing = []",
      "for name in packages:",
      "    try:",
      "        metadata.version(name)",
      "    except metadata.PackageNotFoundError:",
      "        missing.append(name)",
      "print(json.dumps(missing, ensure_ascii=False))"
    ].join("\n");
    const probe = await this.runProbe(config.pythonPath, ["-c", code], config.workingDirectory);

    if (!probe.ok) {
      return config.requirementsPackages;
    }

    try {
      const parsed = JSON.parse(probe.stdout.trim());
      return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
    } catch {
      return config.requirementsPackages;
    }
  }

  private async installMissingRequirements(config: EffectiveRunConfig, missingPackages: string[]): Promise<ProbeResult> {
    return this.runProbe(
      config.pythonPath,
      ["-m", "pip", "install", ...missingPackages],
      config.workingDirectory,
      Math.max(60, config.timeoutSeconds)
    );
  }

  private async runProbe(
    pythonPath: string,
    args: string[],
    workingDirectory: string,
    timeoutSeconds = 30
  ): Promise<ProbeResult> {
    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";

      const child = spawn(pythonPath, args, {
        cwd: workingDirectory,
        env: process.env,
        shell: false
      });

      const timer = window.setTimeout(() => {
        child.kill();
        stderr = appendLimited(stderr, "\n[probe timed out]\n");
      }, Math.max(1, timeoutSeconds) * 1000);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = appendLimited(stdout, chunk.toString("utf8"));
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr = appendLimited(stderr, chunk.toString("utf8"));
      });

      child.on("error", (error) => {
        window.clearTimeout(timer);
        resolve({ ok: false, stdout, stderr: appendLimited(stderr, String(error)) });
      });

      child.on("close", (exitCode) => {
        window.clearTimeout(timer);
        resolve({ ok: exitCode === 0, stdout, stderr });
      });
    });
  }

  private buildRunConfig(source: string, sections: Section[], vaultBasePath: string, file: TFile): EffectiveRunConfig {
    const rawSettings = parseSettings(readSectionValue(source, sections, "Settings"));
    const rawVariables = parseVariables(
      readSectionContent(source, sections, "Variables"),
      vaultBasePath,
      file,
      this.settings.pathTemplates
    );
    const settings = normalizeRunSettings(rawSettings);
    const legacyPython = readSectionValue(source, sections, "Python");
    const legacyWorkingDirectory = readSectionValue(source, sections, "Working Directory");
    const pythonPath = stripWrappingQuotes(
      expandPathTokens(
        settings.python || legacyPython || this.settings.defaultPythonPath,
        vaultBasePath,
        file,
        this.settings.pathTemplates
      ) as string
    );
    const workingDirectoryValue = stripWrappingQuotes(
      settings.working_directory || legacyWorkingDirectory || this.settings.defaultWorkingDirectory
    );
    const timeoutSeconds = settings.timeout_seconds ?? this.settings.timeoutSeconds;

    return {
      rawSettings,
      rawVariables,
      pythonPath,
      workingDirectoryValue,
      workingDirectory: resolveWorkingDirectory(
        vaultBasePath,
        file,
        workingDirectoryValue,
        this.settings.pathTemplates
      ),
      appendRunHistory: settings.append_run_history ?? true,
      capturePythonInfo: settings.capture_python_info ?? true,
      captureRequirements: settings.capture_requirements ?? true,
      installMissingRequirements: settings.install_missing_requirements ?? false,
      requirementsMode: settings.requirements_mode ?? "freeze",
      requirementsPackages: settings.requirements_packages ?? [],
      timeoutSeconds
    };
  }

  private getVaultBasePath(): string {
    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    const basePath = adapter.getBasePath?.();

    if (!basePath) {
      throw new Error("Python Runner requires the desktop file system adapter.");
    }

    return basePath;
  }
}

class ConfirmRunModal extends Modal {
  private file: TFile;
  private pythonPath: string;
  private workingDirectory: string;
  private resolve: (confirmed: boolean) => void;
  private resolved = false;

  constructor(
    app: App,
    file: TFile,
    pythonPath: string,
    workingDirectory: string,
    resolve: (confirmed: boolean) => void
  ) {
    super(app);
    this.file = file;
    this.pythonPath = pythonPath;
    this.workingDirectory = workingDirectory;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    const t = getTranslator(this.app);
    contentEl.empty();
    contentEl.createEl("h2", { text: t("runPythonNote") });
    contentEl.createEl("p", { text: `${t("document")}: ${this.file.path}` });
    contentEl.createEl("p", { text: `${t("python")}: ${this.pythonPath}` });
    contentEl.createEl("p", { text: `${t("workingDirectory")}: ${this.workingDirectory}` });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t("no"))
          .onClick(() => this.finish(false))
      )
      .addButton((button) =>
        button
          .setButtonText(t("yes"))
          .setCta()
          .onClick(() => this.finish(true))
      );
  }

  onClose() {
    if (!this.resolved) {
      this.finish(false);
    }
  }

  private finish(confirmed: boolean) {
    if (this.resolved) {
      return;
    }

    this.resolved = true;
    this.resolve(confirmed);
    this.close();
  }
}

class RunningPythonModal extends Modal {
  private filePath: string;
  private cancelRun: (() => void) | null = null;

  constructor(app: App, filePath: string) {
    super(app);
    this.filePath = filePath;
  }

  onOpen() {
    const { contentEl } = this;
    const t = getTranslator(this.app);
    contentEl.empty();
    contentEl.createEl("h2", { text: t("pythonIsRunning") });
    contentEl.createEl("p", { text: `${t("document")}: ${this.filePath}` });

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText(t("cancel"))
        .setWarning()
        .onClick(() => {
          this.cancelRun?.();
          this.close();
        })
    );
  }

  setCancelHandler(cancelRun: () => void) {
    this.cancelRun = cancelRun;
  }
}

class PathTemplateModal extends Modal {
  private plugin: PythonRunnerPlugin;
  private existingName: string | null;
  private nameValue: string;
  private pathValue: string;

  constructor(app: App, plugin: PythonRunnerPlugin, existingName: string | null = null) {
    super(app);
    this.plugin = plugin;
    this.existingName = existingName;
    this.nameValue = existingName ?? "";
    this.pathValue = existingName ? plugin.settings.pathTemplates[existingName] ?? "" : "";
  }

  onOpen() {
    const { contentEl } = this;
    const t = getTranslator(this.app);
    contentEl.empty();
    contentEl.createEl("h2", { text: this.existingName ? t("pathTemplateModalEdit") : t("pathTemplateModalAdd") });
    contentEl.createEl("p", {
      text: t("pathTemplateModalDesc")
    });

    new Setting(contentEl)
      .setName(t("templateName"))
      .setDesc(t("templateNameDesc"))
      .addText((text) => {
        text
          .setPlaceholder("data_dir")
          .setValue(this.nameValue)
          .onChange((value) => {
            this.nameValue = value.trim();
          });
        text.inputEl.disabled = this.existingName !== null;
      });

    new Setting(contentEl)
      .setName(t("path"))
      .setDesc(t("pathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("{{vault_root}}\\data")
          .setValue(this.pathValue)
          .onChange((value) => {
            this.pathValue = value.trim();
          })
      );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t("cancel"))
          .onClick(() => this.close())
      )
      .addButton((button) =>
        button
          .setButtonText(t("save"))
          .setCta()
          .onClick(async () => {
            if (!isValidTemplateName(this.nameValue)) {
              new Notice(t("invalidTemplateName"));
              return;
            }
            if (isReservedTemplateName(this.nameValue)) {
              new Notice(t("reservedTemplateName"));
              return;
            }
            if (!this.pathValue) {
              new Notice(t("emptyTemplatePath"));
              return;
            }

            this.plugin.settings.pathTemplates[this.nameValue] = this.pathValue;
            await this.plugin.saveSettings();
            this.close();
            this.plugin.settingTab?.display();
          })
      );
  }
}

class PythonRunnerSettingTab extends PluginSettingTab {
  plugin: PythonRunnerPlugin;

  constructor(app: App, plugin: PythonRunnerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const t = getTranslator(this.app);
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("defaultPythonPath"))
      .setDesc(t("defaultPythonPathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("python")
          .setValue(this.plugin.settings.defaultPythonPath)
          .onChange(async (value) => {
            this.plugin.settings.defaultPythonPath = value.trim() || DEFAULT_SETTINGS.defaultPythonPath;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("defaultWorkingDirectory"))
      .setDesc(t("defaultWorkingDirectoryDesc"))
      .addText((text) =>
        text
          .setPlaceholder(".")
          .setValue(this.plugin.settings.defaultWorkingDirectory)
          .onChange(async (value) => {
            this.plugin.settings.defaultWorkingDirectory =
              value.trim() || DEFAULT_SETTINGS.defaultWorkingDirectory;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("timeoutSeconds"))
      .setDesc(t("timeoutSecondsDesc"))
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.timeoutSeconds))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            this.plugin.settings.timeoutSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: t("pathTemplates") });
    containerEl.createEl("p", {
      text: t("pathTemplatesDesc")
    });

    new Setting(containerEl)
      .setName("{{note_dir}}")
      .setDesc(t("noteDirDesc"));

    new Setting(containerEl)
      .setName("{{vault_root}}")
      .setDesc(t("vaultRootDesc"));

    for (const [name, templatePath] of Object.entries(this.plugin.settings.pathTemplates).sort()) {
      const setting = new Setting(containerEl)
        .setName(`{{${name}}}`);

      setting.settingEl.addClass("python-runner-path-template-setting");
      setting.controlEl.createDiv({
        cls: "python-runner-template-path",
        text: templatePath
      });
      setting.addButton((button) =>
        button
          .setButtonText(t("edit"))
          .onClick(() => new PathTemplateModal(this.app, this.plugin, name).open())
      );

      const koreanLabel = BUILT_IN_PATH_TEMPLATE_LABELS[name];
      if (koreanLabel) {
        setting.nameEl.createDiv({
          cls: "python-runner-template-label",
          text: koreanLabel
        });
      } else {
        setting.addButton((button) =>
          button
            .setButtonText(t("delete"))
            .setWarning()
            .onClick(async () => {
              delete this.plugin.settings.pathTemplates[name];
              await this.plugin.saveSettings();
              this.display();
            })
        );
      }
    }

    new Setting(containerEl)
      .setName(t("customPathTemplate"))
      .setDesc(t("customPathTemplateDesc"))
      .addButton((button) =>
        button
          .setButtonText(t("add"))
          .setCta()
          .onClick(() => new PathTemplateModal(this.app, this.plugin).open())
      );
  }
}

function confirmRun(
  app: App,
  file: TFile,
  pythonPath: string,
  workingDirectory: string
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmRunModal(app, file, pythonPath, workingDirectory, resolve).open();
  });
}

function getTranslator(app: App): (key: LocaleKey) => string {
  const locale = getObsidianLocale(app);
  const language = locale.toLowerCase().startsWith("ko") ? "ko" : "en";
  return (key: LocaleKey) => UI_TEXT[language][key];
}

function localize(app: App, key: LocaleKey): string {
  return getTranslator(app)(key);
}

function formatLocalized(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function getObsidianLocale(app: App): string {
  const appWithVaultConfig = app as App & { vault?: { getConfig?: (key: string) => unknown } };
  const configLocale = appWithVaultConfig.vault?.getConfig?.("locale");
  if (typeof configLocale === "string" && configLocale) {
    return configLocale;
  }

  const localStorageLocale =
    window.localStorage.getItem("language") ||
    window.localStorage.getItem("locale") ||
    window.localStorage.getItem("obsidian-language");
  if (localStorageLocale) {
    return localStorageLocale;
  }

  return document.documentElement.lang || navigator.language || "en";
}

function parseSections(source: string): Section[] {
  const lines = source.split(/\n/);
  const sections: Section[] = [];
  let offset = 0;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
    }

    const match = inFence ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      sections.push({
        name: match[2].replace(/#+$/, "").trim(),
        level: match[1].length,
        headingStart: offset,
        contentStart: offset + line.length + 1,
        end: source.length
      });
    }
    offset += line.length + 1;
  }

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const nextPeer = sections
      .slice(index + 1)
      .find((candidate) => candidate.level <= section.level);
    section.end = nextPeer?.headingStart ?? source.length;
  }

  return sections;
}

function readSectionValue(source: string, sections: Section[], name: string): string {
  const content = readSectionContent(source, sections, name);
  return content ? extractFirstFence(content).trim() : "";
}

function readSectionContent(source: string, sections: Section[], name: string): string {
  const section = findSection(sections, name);
  if (!section) {
    return "";
  }

  return source.slice(section.contentStart, section.end).trim();
}

function updateSection(source: string, name: string, content: string): string {
  const sections = parseSections(source);
  const section = findSection(sections, name);
  const normalizedContent = `\n${content.trimEnd()}\n`;

  if (!section) {
    return `${source.trimEnd()}\n\n## ${name}${normalizedContent}`;
  }

  return `${source.slice(0, section.contentStart)}${normalizedContent}${source.slice(section.end)}`;
}

function disableInstallMissingRequirements(source: string): string {
  const sections = parseSections(source);
  const section = findSection(sections, "Settings");
  if (!section) {
    return source;
  }

  const content = source.slice(section.contentStart, section.end);
  const nextContent = content.replace(
    /^(\s*install_missing_requirements:\s*)true(\s*(?:#.*)?)$/m,
    "$1false$2"
  );

  if (nextContent === content) {
    return source;
  }

  return `${source.slice(0, section.contentStart)}${nextContent}${source.slice(section.end)}`;
}

function prependSectionEntry(source: string, name: string, content: string): string {
  const sections = parseSections(source);
  const section = findSection(sections, name);
  const normalizedContent = `${content.trimEnd()}\n`;

  if (!section) {
    return `${source.trimEnd()}\n\n## ${name}\n${normalizedContent}`;
  }

  const before = source.slice(0, section.contentStart).trimEnd();
  const existingContent = source.slice(section.contentStart, section.end).trimStart();
  const after = source.slice(section.end);
  return `${before}\n\n${normalizedContent}${existingContent ? `\n${existingContent}` : ""}${after}`;
}

function findSection(sections: Section[], name: string): Section | undefined {
  return sections.find((section) => section.name.toLowerCase() === name.toLowerCase());
}

function extractFirstFence(content: string): string {
  const match = /```[^\n]*\n([\s\S]*?)```/.exec(content);
  return match?.[1] ?? content;
}

function extractFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const info = match[1].trim();
    const [language = "", name = ""] = info.split(/\s+/);
    blocks.push({
      language: language.toLowerCase(),
      name,
      content: match[2]
    });
  }

  return blocks;
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function parseSettings(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }

  const parsed = parseYaml(escapeBackslashesInQuotedYamlScalars(value));
  return isPlainObject(parsed) ? parsed : {};
}

function parseVariables(
  value: string,
  vaultBasePath: string,
  file: TFile,
  pathTemplates: Record<string, string>
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};
  const blocks = extractFencedBlocks(value);

  for (const block of blocks) {
    if (!block.language || !block.name) {
      continue;
    }

    const parsed = parseVariableBlock(block);
    if (block.language === "yaml" || block.language === "yml") {
      if (block.name === "variables") {
        if (!isPlainObject(parsed)) {
          throw new Error("Variables block 'yaml variables' must contain a YAML object.");
        }
        Object.assign(variables, parsed);
      } else {
        variables[block.name] = parsed;
      }
    } else {
      variables[block.name] = parsed;
    }
  }

  return expandPathTokens(variables, vaultBasePath, file, pathTemplates) as Record<string, unknown>;
}

function parseVariableBlock(block: FencedBlock): unknown {
  const content = block.content.trimEnd();

  if (block.language === "yaml" || block.language === "yml") {
    return parseYaml(escapeBackslashesInQuotedYamlScalars(content));
  }

  if (block.language === "json") {
    return content.trim() ? JSON.parse(content) : {};
  }

  return content;
}

function escapeBackslashesInQuotedYamlScalars(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      const match = /^(\s*[\w-]+:\s*)"([^"]*)"\s*$/.exec(line);
      if (!match) {
        return line;
      }

      return `${match[1]}${JSON.stringify(match[2])}`;
    })
    .join("\n");
}

function normalizeRunSettings(rawSettings: Record<string, unknown>): NoteRunSettings {
  const pythonEnv = readObject(rawSettings.python_env);
  const execution = readObject(rawSettings.execution);
  const log = readObject(rawSettings.log);
  const captureRequirements = readObject(log.capture_requirements);
  const requirementsPackages = pythonEnv.requirements_packages ?? rawSettings.requirements_packages;
  const timeoutSeconds = readNumber(execution.timeout_seconds ?? rawSettings.timeout_seconds);
  const rawRequirementsMode =
    captureRequirements.requirements_mode ?? log.requirements_mode ?? rawSettings.requirements_mode;
  const requirementsMode = rawRequirementsMode === "packages" ? "packages" : "freeze";

  return {
    python: readString(pythonEnv.python ?? rawSettings.python),
    install_missing_requirements: readBoolean(
      pythonEnv.install_missing_requirements ?? rawSettings.install_missing_requirements
    ),
    working_directory: readString(execution.working_directory ?? rawSettings.working_directory),
    append_run_history: readBoolean(log.append_run_history ?? rawSettings.append_run_history),
    capture_python_info: readBoolean(log.capture_python_info ?? rawSettings.capture_python_info),
    capture_requirements: readBoolean(
      captureRequirements.enabled ?? log.capture_requirements ?? rawSettings.capture_requirements
    ),
    requirements_mode: requirementsMode,
    requirements_packages: Array.isArray(requirementsPackages)
      ? requirementsPackages.map((item) => String(item)).filter(Boolean)
      : [],
    timeout_seconds: timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds : undefined
  };
}

function buildRunnableScript(
  rawSettings: Record<string, unknown>,
  rawVariables: Record<string, unknown>,
  script: string
): string {
  const encodedSettings = Buffer.from(JSON.stringify(rawSettings), "utf8").toString("base64");
  const encodedVariables = Buffer.from(JSON.stringify(rawVariables), "utf8").toString("base64");
  return [
    "import base64 as __obsidian_python_runner_base64",
    "import json as __obsidian_python_runner_json",
    `settings = __obsidian_python_runner_json.loads(__obsidian_python_runner_base64.b64decode("${encodedSettings}").decode("utf-8"))`,
    `variables = __obsidian_python_runner_json.loads(__obsidian_python_runner_base64.b64decode("${encodedVariables}").decode("utf-8"))`,
    "del __obsidian_python_runner_base64, __obsidian_python_runner_json",
    "",
    script
  ].join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function formatResult(result: RunResult, metadata: RunMetadata): string {
  const parts = [
    "- stdout",
    "```text",
    result.stdout.trimEnd(),
    "```",
    "",
    formatMetadataDetails(result, metadata)
  ];

  if (result.stderr.trim()) {
    parts.splice(4, 0, "", "- stderr", "```text", result.stderr.trimEnd(), "```");
  }

  return parts.join("\n");
}

function formatHistoryEntry(result: RunResult, metadata: RunMetadata): string {
  return [
    `### ${formatDateTime(metadata.startedAt)}`,
    "",
    "- stdout",
    "```text",
    result.stdout.trimEnd(),
    "```",
    ...(result.stderr.trim() ? ["", "- stderr", "```text", result.stderr.trimEnd(), "```"] : []),
    "",
    formatMetadataDetails(result, metadata)
  ].join("\n");
}

function formatMetadataDetails(result: RunResult, metadata: RunMetadata): string {
  return [
    "<details>",
    "<summary>실행 메타데이터</summary>",
    "",
    `<pre><code class="language-yaml">${escapeHtml(formatMetadataYaml(result, metadata))}</code></pre>`,
    "",
    "</details>"
  ].join("\n");
}

function formatMetadataYaml(result: RunResult, metadata: RunMetadata): string {
  const rows = [
    `started_at: ${JSON.stringify(metadata.startedAt.toISOString())}`,
    `finished_at: ${JSON.stringify(metadata.finishedAt.toISOString())}`,
    `duration_ms: ${metadata.durationMs}`,
    `document: ${JSON.stringify(metadata.documentPath)}`,
    `configured_python: ${JSON.stringify(metadata.configuredPython)}`,
    `working_directory: ${JSON.stringify(metadata.workingDirectory)}`,
    `exit_code: ${result.exitCode ?? "null"}`,
    `timed_out: ${result.timedOut ? "true" : "false"}`,
    `canceled: ${result.canceled ? "true" : "false"}`
  ];

  if (metadata.pythonInfo) {
    rows.push("python_info:");
    rows.push(...indentBlock(formatProbeYaml(metadata.pythonInfo), 2));
  }

  if (metadata.install) {
    rows.push("install:");
    rows.push(`  missing_packages: [${metadata.install.missingPackages.map((name) => JSON.stringify(name)).join(", ")}]`);
    if (metadata.install.result) {
      rows.push("  result:");
      rows.push(...indentBlock(formatProbeYaml(metadata.install.result), 4));
    }
  }

  if (metadata.requirements) {
    rows.push("requirements:");
    rows.push(...indentBlock(formatProbeYaml(metadata.requirements), 2));
  }

  return rows.join("\n");
}

function formatProbeYaml(probe: ProbeResult): string {
  return [
    `ok: ${probe.ok ? "true" : "false"}`,
    "stdout: |-",
    ...indentBlock(probe.stdout.trimEnd() || "", 2),
    "stderr: |-",
    ...indentBlock(probe.stderr.trimEnd() || "", 2)
  ].join("\n");
}

function indentBlock(value: string, spaces: number): string[] {
  const prefix = " ".repeat(spaces);
  const lines = value ? value.split("\n") : [""];
  return lines.map((line) => `${prefix}${line}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(value: Date): string {
  return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function resolveWorkingDirectory(
  vaultBasePath: string,
  file: TFile,
  value: string,
  pathTemplates: Record<string, string>
): string {
  const trimmed = (expandPathTokens(value, vaultBasePath, file, pathTemplates) as string).trim() || ".";
  const noteDir = path.dirname(path.join(vaultBasePath, file.path));

  if (trimmed === "." || trimmed === "{{note_dir}}") {
    return noteDir;
  }

  if (trimmed === "{{vault_root}}") {
    return vaultBasePath;
  }

  return isAbsolutePath(trimmed) ? trimmed : path.join(noteDir, trimmed);
}

function expandPathTokens(
  value: unknown,
  vaultBasePath: string,
  file: TFile,
  pathTemplates: Record<string, string>
): unknown {
  const noteDir = path.dirname(path.join(vaultBasePath, file.path));

  if (typeof value === "string") {
    return expandPathTemplateString(value, {
      note_dir: noteDir,
      vault_root: vaultBasePath,
      ...pathTemplates
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandPathTokens(item, vaultBasePath, file, pathTemplates));
  }

  if (isPlainObject(value)) {
    const expanded: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      expanded[key] = expandPathTokens(item, vaultBasePath, file, pathTemplates);
    }
    return expanded;
  }

  return value;
}

function expandPathTemplateString(value: string, templates: Record<string, string>): string {
  let expanded = value;

  for (let index = 0; index < 10; index += 1) {
    const next = expanded.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (match, name: string) => {
      return templates[name] ?? match;
    });

    if (next === expanded) {
      return next;
    }

    expanded = next;
  }

  return expanded;
}

function getDefaultPathTemplates(): Record<string, string> {
  const home = process.env.USERPROFILE || homedir();
  return {
    documents: path.join(home, "Documents"),
    downloads: path.join(home, "Downloads"),
    desktop: path.join(home, "Desktop")
  };
}

function isValidTemplateName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isReservedTemplateName(value: string): boolean {
  return value === "note_dir" || value === "vault_root";
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function appendLimited(current: string, next: string): string {
  const combined = current + next;
  if (combined.length <= MAX_CAPTURE_BYTES) {
    return combined;
  }

  return `${combined.slice(0, MAX_CAPTURE_BYTES)}\n[output truncated]\n`;
}

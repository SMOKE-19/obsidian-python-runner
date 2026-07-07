# Obsidian Python Runner

Run a Python script from an Obsidian note, then write stdout, stderr, runtime metadata, Python environment info, and package requirements back into the same note.

This plugin is intentionally document-oriented: each note can declare its own Python executable, working directory, requirements, execution options, and logging behavior.

## Install

Download the release zip and extract it into your vault's plugin directory:

```text
<vault>/.obsidian/plugins/
```

The zip contains a `python-runner` folder, so Windows default extraction keeps the deployable plugin folder name stable.

Enable **Python Runner** from Obsidian's Community plugins settings.

## Note Format

````md
# My Python Run

## Settings
```yaml
python_env:
  python: "{{vault_root}}\\.venv\\Scripts\\python.exe"
  install_missing_requirements: true
  requirements_packages:
    - numpy
    - matplotlib
    - scipy
execution:
  working_directory: "{{note_dir}}"
  timeout_seconds: 120
log:
  append_run_history: true
  capture_python_info: true
  capture_requirements:
    enabled: true
    requirements_mode: packages
```

## Variables
```yaml variables
x: 10
input_csv: "{{note_dir}}\\data\\input.csv"
```

```sql query
select *
from read_csv_auto($input_csv)
```

```json options
{
  "limit": 1000
}
```

## Script
```python
print(settings["python_env"]["python"])
print(settings["execution"]["working_directory"])
print(variables["x"])
```

## Result
- stdout
  ```text

  ```

- 실행 메타데이터
  <details>
  <summary>실행 메타데이터</summary>

  <pre><code class="language-yaml"></code></pre>

  </details>

## Run History
````

Run the focused note with `Python Runner: Run current note`.

## Settings

- `python_env.python`: Python executable. Windows Explorer style quoted paths are supported.
- `python_env.install_missing_requirements`: installs missing `requirements_packages` with `python -m pip install ...` before running. After that run, the plugin rewrites this value to `false`.
- `python_env.requirements_packages`: package names to check, install, or record when `requirements_mode` is `packages`.
- `execution.working_directory`: `{{note_dir}}`, `.`, `{{vault_root}}`, an absolute path, or a path relative to the note folder.
- `execution.timeout_seconds`: maximum script runtime.
- `log.append_run_history`: prepends the latest run to `## Run History`.
- `log.capture_python_info`: records `sys.executable`, `sys.version`, `sys.prefix`, and `sys.base_prefix`.
- `log.capture_requirements.enabled`: records package state in the metadata.
- `log.capture_requirements.requirements_mode`: `packages` records selected packages, `freeze` records `python -m pip freeze`.

The Settings YAML is injected into the script as a normal Python `settings` dict.

## Path Templates

Python paths, working directories, and string values in Variables support path templates:

- `{{note_dir}}`: folder containing the current markdown note.
- `{{vault_root}}`: root folder of the current Obsidian vault.
- `{{documents}}`: current Windows user's Documents folder.
- `{{downloads}}`: current Windows user's Downloads folder.
- `{{desktop}}`: current Windows user's Desktop folder.
- Custom templates such as `{{data_dir}}`: add them in the plugin settings.

`note_dir` and `vault_root` are reserved and read-only in settings. `documents`, `downloads`, and `desktop` are provided by default. Custom templates may reference other templates, for example `{{vault_root}}\\data`.

## Variables

`## Variables` injects a normal Python `variables` dict.

- `yaml variables`: merge the parsed YAML object into top-level `variables`.
- `yaml name`: set `variables[name]` to the parsed YAML value.
- `json name`: set `variables[name]` to the parsed JSON value.
- `sql name`: set `variables[name]` to the raw SQL string.
- `text name`: set `variables[name]` to the raw text string.
- Any other `lang name`: set `variables[name]` to the raw string.

String values inside variables expand `{{note_dir}}` and `{{vault_root}}`.

## Release Artifacts

Release builds include:

- `manifest.json`
- `main.js`
- `styles.css`
- `obsidian-python-runner-<version>.zip`

The zip stores files under the inner folder `python-runner/`, matching the Obsidian plugin id.

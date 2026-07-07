# Python Run

## Settings
```yaml
python_env:
  python: "C:\Users\me\project\.venv\Scripts\python.exe"
  install_missing_requirements: false
  requirements_packages:
    - numpy
    - matplotlib
    - scipy
execution:
  working_directory: "{{note_dir}}"
  timeout_seconds: 120
log:
  # 실행 결과를 ## Run History에 append할지 여부
  append_run_history: true
  # sys.executable, sys.version, sys.prefix를 기록할지 여부
  capture_python_info: true
  capture_requirements:
    enabled: true
    # packages: requirements_packages에 적은 패키지만 기록
    # freeze: python -m pip freeze 전체 기록
    requirements_mode: packages
```

<!--
install_missing_requirements를 true로 두고 실행하면 누락 패키지를 pip install 합니다.
실행 후 이 값은 false로 자동 변경됩니다.

Settings YAML은 Python 코드 안에서 settings dict로 바로 사용할 수 있습니다.
-->

## Script
```python
print("hello from Obsidian")
print(settings["execution"]["working_directory"])
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

## Notes

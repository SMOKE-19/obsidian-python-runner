# Tail Ratio Matplotlib Test

## Settings
```yaml settings
python_env:
  python: "C:\obs-SMOKE\.venv\Scripts\python.exe"
  install_missing_requirements: true
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
python에는 가상환경의 Windows 절대경로를 넣는 것이 가장 재현성이 좋습니다.
파일 탐색기에서 복사한 "C:\...\python.exe" 형태의 따옴표 포함 경로도 사용할 수 있습니다.

install_missing_requirements를 true로 두고 실행하면 누락 패키지를 pip install 합니다.
실행 후 이 값은 false로 자동 변경됩니다.

Settings YAML은 Python 코드 안에서 settings dict로 바로 사용할 수 있습니다.
-->

## Variables
```yaml variables
x: 10
g1: 1.0
g2: 2.5
e_min: 0
e_max: 20
e_count: 500
```

```sql query
-- DuckDB SQL을 사용할 때 여기에 쿼리를 작성합니다.
-- 예: select * from read_csv_auto($input_csv)
select 1 as value
```

```json options
{
  "show_plot": true,
  "figure_size": [8, 5]
}
```

```yaml paths
duckdb_path: "{{note_dir}}\\data\\example.duckdb"
input_csv: "{{note_dir}}\\data\\input.csv"
```

<!--
Variables 코드블럭은 Python 코드 안에서 variables dict로 사용할 수 있습니다.
- ```yaml variables```는 최상위 variables dict에 병합됩니다.
- ```yaml name```은 variables["name"] dict로 들어갑니다.
- ```json options```는 variables["options"] dict로 들어갑니다.
- ```sql query```는 variables["query"] 문자열로 들어갑니다.
- ```text name```과 기타 ```lang name```은 variables["name"] 문자열로 들어갑니다.
- ```yaml paths```는 variables["paths"] dict로 들어갑니다.
-->

## Script
```python
print(f"working directory setting: {settings['execution']['working_directory']}")
print(f"query preview: {variables['query'].strip()}")

import numpy as np
import matplotlib.pyplot as plt
from scipy.special import erfc

# x는 고정
x = variables["x"]

# 서로 다른 sigma
g1 = variables["g1"]
g2 = variables["g2"]

# e를 x축으로 사용
e = np.linspace(variables["e_min"], variables["e_max"], variables["e_count"])

# Tail Ratio 계산
y1 = 0.5 * erfc((x - e) / (g1 * np.sqrt(2)))
y2 = 0.5 * erfc((x - e) / (g2 * np.sqrt(2)))

plt.figure(figsize=tuple(variables["options"]["figure_size"]))
plt.plot(e, y1, label=f"g = {g1}")
plt.plot(e, y2, label=f"g = {g2}")

# 기준 x 위치 표시
plt.axvline(x, color="gray", linestyle="--", alpha=0.6)

plt.xlabel("e (Gaussian Position)")
plt.ylabel(f"Tail Ratio  P(X > {x})")
plt.title("Tail Ratio vs Gaussian Position")
plt.grid(True)
plt.legend()

if variables["options"]["show_plot"]:
    plt.show()
```

<!--
DuckDB를 사용할 경우 예시는 다음과 같습니다.
```json
{
  "example": "import duckdb; con = duckdb.connect(variables['paths']['duckdb_path'])"
}
```
-->

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

This example requires `numpy`, `matplotlib`, and `scipy` in the Python environment selected above.

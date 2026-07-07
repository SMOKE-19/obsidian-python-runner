# Tail Ratio Matplotlib Test

## Settings
```yaml
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

## Script
```python
print(f"working directory setting: {settings['execution']['working_directory']}")

import numpy as np
import matplotlib.pyplot as plt
from scipy.special import erfc

# x는 고정
x = 10

# 서로 다른 sigma
g1 = 1.0
g2 = 2.5

# e를 x축으로 사용
e = np.linspace(0, 20, 500)

# Tail Ratio 계산
y1 = 0.5 * erfc((x - e) / (g1 * np.sqrt(2)))
y2 = 0.5 * erfc((x - e) / (g2 * np.sqrt(2)))

plt.figure(figsize=(8, 5))
plt.plot(e, y1, label=f"g = {g1}")
plt.plot(e, y2, label=f"g = {g2}")

# 기준 x 위치 표시
plt.axvline(x, color="gray", linestyle="--", alpha=0.6)

plt.xlabel("e (Gaussian Position)")
plt.ylabel("Tail Ratio  P(X > 10)")
plt.title("Tail Ratio vs Gaussian Position")
plt.grid(True)
plt.legend()
plt.show()
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

This example requires `numpy`, `matplotlib`, and `scipy` in the Python environment selected above.

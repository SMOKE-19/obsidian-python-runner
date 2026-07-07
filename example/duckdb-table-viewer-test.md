# DuckDB Jupyter Style Table Viewer Design

## Settings
```yaml settings
python_env:
  python: "{{vault_root}}\\.venv\\Scripts\\python.exe"
  install_missing_requirements: true
  requirements_packages:
    - duckdb
    - pandas
execution:
  working_directory: "{{note_dir}}"
  timeout_seconds: 120
table:
  enabled: true
  limit: 500
  output_section: Table Result
  query_variable: query
log:
  append_run_history: true
  capture_python_info: true
  capture_requirements:
    enabled: true
    requirements_mode: packages
```

<!--
table.limit은 테이블 뷰어가 한 번에 문서에 기록할 최대 행 수입니다.
테이블 뷰어 기능은 Python Runner 흐름을 그대로 사용하되, stdout 대신
python-runner-table 코드블럭을 갱신하는 방향으로 구현할 예정입니다.
-->

## Variables
```yaml variables
duckdb_path: "{{note_dir}}\\data\\example.duckdb"
input_csv: "{{note_dir}}\\data\\input.csv"
```

```sql query
select *
from read_csv_auto($input_csv)
```

```json table_options
{
  "height_px": 420,
  "show_index": true,
  "sticky_header": true
}
```

<!--
DuckDB 쿼리는 variables["query"]로 주입됩니다.
input_csv와 duckdb_path는 {{note_dir}} 토큰이 실제 노트 폴더 경로로 치환됩니다.
-->

## Table Result
```python-runner-table
{
  "columns": [],
  "rows": [],
  "row_count": 0,
  "truncated": false,
  "limit": 500
}
```

<!--
구현 목표:
- 읽기 모드에서는 위 코드블럭을 Jupyter dataframe 스타일 테이블로 렌더링합니다.
- 상하/좌우 스크롤을 지원합니다.
- 컬럼 헤더는 sticky로 고정합니다.
- 문서에는 JSON 데이터가 남고, 플러그인이 켜져 있을 때만 테이블 UI로 보입니다.
-->

## Script
<!--
이 섹션은 Obsidian 헤더 접기로 접어두는 것을 권장합니다.
테이블 뷰어 명령도 이 Python Runner 스크립트를 실행하고,
stdout의 TABLE_JSON marker 사이 payload를 ## Table Result에 반영하는 흐름을 목표로 합니다.
나중에 DuckDB 연결 방식이나 payload 변환이 필요하면 이 스크립트를 직접 수정하면 됩니다.
-->

```python
import json
import duckdb

TABLE_JSON_START = "__PYTHON_RUNNER_TABLE_JSON_START__"
TABLE_JSON_END = "__PYTHON_RUNNER_TABLE_JSON_END__"

table_settings = settings.get("table", {})
limit = int(table_settings.get("limit", 500))
query_name = table_settings.get("query_variable", "query")
query = variables[query_name].strip().rstrip(";")
duckdb_path = variables.get("duckdb_path", ":memory:")

params = {
    key: value
    for key, value in variables.items()
    if isinstance(value, (str, int, float, bool)) or value is None
}

con = duckdb.connect(duckdb_path)
result = con.execute(
    f"select * from ({query}) as python_runner_query limit {limit}",
    params,
).fetchdf()

payload = {
    "columns": list(result.columns),
    "rows": result.astype(object).where(result.notna(), None).values.tolist(),
    "row_count": len(result),
    "truncated": len(result) >= limit,
    "limit": limit,
}

print(TABLE_JSON_START)
print(json.dumps(payload, ensure_ascii=False, default=str))
print(TABLE_JSON_END)
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

This example is a design target for a possible Jupyter-style table viewer command. Use `duckdb-simple-query-test.md` first when stdout preview is enough.

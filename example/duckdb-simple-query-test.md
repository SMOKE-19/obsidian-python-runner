# DuckDB Simple Query Test

## Settings
```yaml settings
python_env:
  python: "{{vault_root}}\\.venv\\Scripts\\python.exe"
  install_missing_requirements: true
  requirements_packages:
    - duckdb
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

<!--
SQL을 조금씩 바꿔가며 DuckDB 결과 모양을 stdout에서 확인하는 가장 가벼운 예시입니다.
duckdb.sql(...)의 출력은 작은 테이블 확인용으로 충분히 읽기 좋습니다.
-->

## Variables
```yaml variables
parquet_path: data.parquet
limit: 20
output_csv: duckdb-query-result.csv
```

```sql query
SELECT *
FROM '{parquet_path}'
LIMIT {limit}
```

## Script
```python
import duckdb

def sql_quote(value):
    return str(value).replace("'", "''")

query = variables["query"].format(
    parquet_path=sql_quote(variables["parquet_path"]),
    limit=int(variables["limit"]),
)

result = duckdb.sql(query)
print(result)

output_csv = variables.get("output_csv")
if output_csv:
    result.write_csv(output_csv)
    print(f"saved csv: {output_csv}")
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

Use this note when you only need a quick DuckDB table preview in stdout. For large, wide, or interactive table viewing, use the Jupyter-style table viewer design example.

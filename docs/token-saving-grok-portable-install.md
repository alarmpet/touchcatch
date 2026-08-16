# Grok 토큰 절약 — 다른 PC 이식·설치 가이드

> **작성일:** 2026-07-17 · **인코딩:** UTF-8  
> **목적:** 이 문서만 보고 **다른 Windows PC**에 동일 구성을 설치·검증한다.  
> **번들 위치:** `tools/token-saving-grok/`  
> **원 설계(이 PC에서 적용한 내용):** `docs/token-saving-setup-grok.md`  
> **Claude 원본 축:** `docs/token-saving-setup.md`

---

## 0. 한 줄 요약

토큰 절약은 **세 층**이다.

| 층 | 이름 | 하는 일 | 어디에 사나 |
|---|---|---|---|
| ① | **rtk** | 시끄러운 쉘 출력 압축 (`git status`, `ls` …) | **WSL** `~/.local/bin/rtk` |
| ② | **serena** | 코드 통독 대신 **심볼 단위** 탐색/편집 | **WSL** `serena` + 프로젝트 `.serena/` |
| ③ | **하네스** | MCP 결과 상한·훅·스킬·compact | Windows `%USERPROFILE%\.grok\` |

Grok은 Claude와 달리 PreToolUse에서 명령을 **투명 재작성(updatedInput)** 하지 못한다.  
그래서 rtk는 **enforce 모드 = 1회 deny + “이 명령으로 다시 실행”** 으로 같은 효과를 낸다.

---

## 1. 전제 조건 (새 PC)

| 필수 | 버전/비고 |
|---|---|
| Windows 10/11 | Grok CLI 실행 |
| **WSL2** + Ubuntu 등 | rtk·serena·uv 설치 위치 |
| **Grok CLI** | `grok` / `%USERPROFILE%\.grok\bin\grok.exe` |
| **Python 3** (Windows PATH) | 훅 스크립트 `python …` 실행 |
| 인터넷 | uvx로 pyright 등 최초 설치 |

선택: Claude Code를 같이 쓰면 rtk/serena 바이너리를 **WSL에서 공유**하면 된다.

---

## 2. 아키텍처 (이 PC에 어떻게 붙였는지)

```
┌──────────────────── Windows (Grok) ────────────────────┐
│  ~/.grok/config.toml                                   │
│    [mcp_servers.serena] → wsl.exe -e bash start_….sh   │
│    [mcp] max_output_bytes=20000                        │
│    [session] auto_compact 80%                          │
│  ~/.grok/hooks/token-saving.json                       │
│    PreToolUse[Bash|run_terminal_command]               │
│      → python rtk_grok_pretool.py                      │
│    SessionStart/End → serena_grok_session.py           │
│  ~/.grok/skills/token-saving/SKILL.md                  │
│  <project>/.grok/config.toml  (프로젝트 MCP 핀)         │
│  <project>/.grok/rules/token-saving.md                 │
│  <project>/.serena/project.yml                         │
└───────────────────────┬────────────────────────────────┘
                        │ wsl.exe -e  (비로그인 → PATH 주의!)
┌───────────────────────▼────────────────────────────────┐
│  WSL                                                   │
│  ~/.local/bin/{rtk,serena,serena-hooks,uv,uvx}         │
│  start_serena_mcp.sh 가 PATH=$HOME/.local/bin 을 주입  │
│  serena --context claude-code --project <repo>         │
└────────────────────────────────────────────────────────┘
```

### 꼭 알아야 할 함정 (실측)

1. **`wsl.exe -e` 는 로그인 셸이 아니다**  
   → `~/.local/bin` 이 PATH에 없음 → **`uv`/`uvx` 못 찾음** → Python LSP 실패 → **serena MCP 90초 타임아웃**.  
   → 해결: 반드시 `start_serena_mcp.sh` 로 기동 (PATH 주입).

2. **Grok PreToolUse는 deny/allow만**  
   → Claude의 `rtk hook claude` 투명 rewrite 불가.  
   → `rtk_grok_pretool.py` 가 rewrite 후 enforce면 deny.

3. **프로젝트 MCP/훅은 folder trust 필요**  
   → 프로젝트 폴더에서 `/hooks-trust` 또는 `grok --trust`.  
   → 글로벌 `~/.grok/hooks/` 는 trust 없이 동작.

4. **하드코딩 금지**  
   번들 스크립트는 `$HOME` / `%USERPROFILE%` 기준으로 동작한다.  
   (초기 적용 PC는 `/home/shs` 가 박혀 있었으나, **번들은 이식형으로 고침**.)

---

## 3. 빠른 설치 (권장)

### 3.1 이 저장소를 새 PC에 가져온다

```text
git clone <repo>   또는  USB/동기화로 all-manage 복사
cd all-manage
```

### 3.2 WSL 쪽 도구 설치

WSL 터미널에서:

```bash
# 1) uv (Astral) — serena Python LSP(pyright) 기동에 필수
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
# ~/.bashrc 에도 PATH 추가 권장:
# echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc

# 2) rtk (Rust Token Killer) — 토큰 압축 CLI
#    공식 설치 방법은 rtk 배포 문서 따름. 설치 후:
which rtk && rtk --version
# 기대: ~/.local/bin/rtk , 예) 0.42.4+

# 3) serena
uv tool install serena-agent   # 또는 기존 사용 중인 설치 방법
which serena serena-hooks
serena --version

# 4) 프로젝트 등록 (저장소 루트에서)
cd /mnt/<drive>/path/to/all-manage   # Windows 경로를 WSL로
# .serena/project.yml 이 없으면:
serena project create   # 안내에 따라 language=python 등
# 이미 있으면 복사/유지
```

**rtk 설치 메모:**  
이 PC에서는 `~/.local/bin/rtk` (v0.42.4). 다른 PC도 동일 바이너리 계열이면 된다.  
`rtk gain` 이 동작해야 올바른 token-killer 이다 (다른 패키지 `rtk` 와 이름 충돌 주의).

### 3.3 Windows 쪽 원클릭 설치

PowerShell (관리자 불필요):

```powershell
cd D:\all-manage   # 본인 경로
powershell -ExecutionPolicy Bypass -File .\tools\token-saving-grok\install.ps1 -ProjectRoot (Get-Location).Path -RtkMode enforce
```

설치기가 하는 일:

| 단계 | 대상 |
|---|---|
| 훅 스크립트 복사 | `%USERPROFILE%\.grok\hooks\bin\` |
| `token-saving.json` 생성 | 현재 사용자 경로로 command 생성 |
| `token-saving.mode` | enforce/soft/off |
| skill 복사 | `%USERPROFILE%\.grok\skills\token-saving\` |
| `config.toml` 패치 | serena MCP + harness |
| 프로젝트 `.grok/config.toml` | serena 동일 기동 + rules |

### 3.4 Grok 재시작 + trust

```text
1) Grok 완전 종료 후 재실행
2) 프로젝트 폴더에서 연 뒤:
   /hooks-trust
   (또는 터미널에서 해당 cwd로 grok --trust — TUI가 뜰 수 있음)
3) 확인:
   /hooks  → token-saving 관련 훅
   /mcps   → serena enabled (timeout 아님)
```

---

## 4. 수동 설치 (install.ps1 없이)

### 4.1 복사할 파일 목록

번들: `tools/token-saving-grok/`

```
tools/token-saving-grok/
  install.ps1
  hooks/
    token-saving.mode
    bin/
      rtk_grok_pretool.py      # PreToolUse rtk 어댑터
      serena_grok_session.py   # SessionStart/End 워밍
      start_serena_mcp.sh      # ★ PATH 주입 후 serena MCP
      set-rtk-mode.ps1         # enforce|soft|off
  skills/
    token-saving/
      SKILL.md
```

Windows 대상:

```
%USERPROFILE%\.grok\
  config.toml
  hooks\
    token-saving.json
    token-saving.mode
    bin\   ← 위 bin/* 전부
  skills\
    token-saving\SKILL.md
  logs\    (자동 생성)

<PROJECT>\
  .grok\
    config.toml
    rules\token-saving.md
  .serena\
    project.yml
```

### 4.2 `token-saving.json` 템플릿

`YOUR_USER` 를 Windows 사용자 폴더로 바꾼다.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python C:\\Users\\YOUR_USER\\.grok\\hooks\\bin\\serena_grok_session.py activate",
            "timeout": 20
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python C:\\Users\\YOUR_USER\\.grok\\hooks\\bin\\serena_grok_session.py cleanup",
            "timeout": 15
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python C:\\Users\\YOUR_USER\\.grok\\hooks\\bin\\rtk_grok_pretool.py",
            "timeout": 8
          }
        ]
      },
      {
        "matcher": "run_terminal_command",
        "hooks": [
          {
            "type": "command",
            "command": "python C:\\Users\\YOUR_USER\\.grok\\hooks\\bin\\rtk_grok_pretool.py",
            "timeout": 8
          }
        ]
      }
    ]
  }
}
```

### 4.3 `~/.grok/config.toml` 에 추가할 블록

`YOUR_USER` / 드라이브 문자를 맞춘다.  
WSL 경로는 Windows `C:\Users\foo` → `/mnt/c/Users/foo`.

```toml
[ui]
group_tool_verbs = true

[session]
auto_compact_threshold_percent = 80

[mcp]
max_output_bytes = 20000

[mcp_servers.serena]
command = "C:\\Windows\\System32\\wsl.exe"
args = [
  "-e",
  "bash",
  "/mnt/c/Users/YOUR_USER/.grok/hooks/bin/start_serena_mcp.sh",
]
enabled = true
startup_timeout_sec = 180
tool_timeout_sec = 180

[compat.claude]
hooks = true
skills = true
rules = true
mcps = true
```

### 4.4 프로젝트 `<PROJECT>/.grok/config.toml`

글로벌과 동일하게 `start_serena_mcp.sh` 를 가리키면 된다.  
스크립트가 `.serena/project.yml` 을 cwd 기준으로 찾는다.

```toml
[mcp]
max_output_bytes = 20000

[mcp_servers.serena]
command = "C:\\Windows\\System32\\wsl.exe"
args = [
  "-e",
  "bash",
  "/mnt/c/Users/YOUR_USER/.grok/hooks/bin/start_serena_mcp.sh",
]
enabled = true
startup_timeout_sec = 180
tool_timeout_sec = 180
```

### 4.5 bash 스크립트 LF + 실행권한

```powershell
# 예: C 드라이브 사용자
wsl.exe -e bash -lc "sed -i 's/\r$//' ~/.local/../.. 2>/dev/null; sed -i 's/\r$//' /mnt/c/Users/\$USER/.grok/hooks/bin/*.sh; chmod +x /mnt/c/Users/\$USER/.grok/hooks/bin/*.sh"
```

실제 사용자 경로에 맞게 `/mnt/<drive>/Users/<name>/.grok/hooks/bin` 을 쓴다.

---

## 5. 각 컴포넌트 설명 (왜 넣었는지)

### 5.1 `rtk_grok_pretool.py`

| 모드 | 동작 |
|---|---|
| **enforce** (기본) | `git status` 등 rewrite 가능하면 **deny** + reason에 `wsl … rtk …` |
| **soft** | allow + systemMessage 안내만 |
| **off** | 항상 allow |

모드 결정 순서: `--mode` > env `GROK_RTK_MODE` > `token-saving.mode` > `enforce`.

전환:

```powershell
powershell -File $env:USERPROFILE\.grok\hooks\bin\set-rtk-mode.ps1 soft
powershell -File $env:USERPROFILE\.grok\hooks\bin\set-rtk-mode.ps1 enforce
```

### 5.2 `start_serena_mcp.sh`

- `PATH=$HOME/.local/bin:$PATH`
- `serena start-mcp-server --context claude-code --project <auto>`
- 대시보드 off (헤드리스)
- **이 파일이 없으면 serena 타임아웃이 재발한다**

### 5.3 skill `token-saving`

에이전트에게 습관 주입:

- 파일 통독/`cat` 금지 → `read_file` / serena
- 쉘 노이즈 → rtk
- MCP는 `search_tool` 로 지연 로딩

### 5.4 하네스

| 설정 | 값 | 이유 |
|---|---|---|
| `max_output_bytes` | 20000 | 거대 MCP 결과 절단 |
| `group_tool_verbs` | true | 연속 read/search 접기 |
| `auto_compact_threshold_percent` | 80 | 컨텍스트 조기 압축 |
| `startup_timeout_sec` | 180 | serena 콜드스타트 여유 |

---

## 6. 검증 체크리스트

### 6.1 WSL

```bash
export PATH="$HOME/.local/bin:$PATH"
rtk --version          # 예: 0.42.4
serena --version
uv --version
command -v uvx
```

### 6.2 rtk 어댑터 (Windows PowerShell)

```powershell
'{"toolName":"run_terminal_command","toolInput":{"command":"git status"}}' |
  python $env:USERPROFILE\.grok\hooks\bin\rtk_grok_pretool.py
```

기대 (enforce):

```json
{"decision": "deny", "reason": "TOKEN-SAVE(rtk)[enforce]: ... rtk git status ..."}
```

### 6.3 serena MCP 핸드셰이크 (선택)

```powershell
wsl.exe -e bash -lc 'export PATH=$HOME/.local/bin:$PATH
# 간단히 기동만 확인
timeout 15 serena start-mcp-server --context claude-code --project /mnt/d/all-manage --enable-web-dashboard false --open-web-dashboard false --log-level WARNING </dev/null
'
```

또는 Grok 세션에서 serena 연결 후:

- `search_tool` query: `serena`
- `serena__get_symbols_overview` 로 파일 하나 개요

### 6.4 Grok inspect

```powershell
cd <PROJECT>
grok inspect
```

확인 포인트:

- Project trusted: **yes**
- MCP: **serena**
- Hooks: 4개 전후
- Skills: **token-saving**
- Project rules: `token-saving.md`

---

## 7. 일상 사용

| 상황 | 행동 |
|---|---|
| 코드 찾기/구조 | Serena (`find_symbol`, `get_symbols_overview`) |
| 파일 일부 읽기 | 내장 `read_file` (offset/limit) |
| `git status` 등 | enforce면 deny → reason 명령 그대로 재실행 |
| deny 거슬림 | `set-rtk-mode.ps1 soft` |
| 훅 끄기 | `set-rtk-mode.ps1 off` |
| 절약 통계 (WSL) | `rtk gain` |

---

## 8. 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| serena **timed out 90s/180s** | PATH에 uv 없음 | `start_serena_mcp.sh` 경로·실행권한 확인; 스크립트 안 `PATH=$HOME/.local/bin` |
| `Could not find uvx or uv` | 위와 동일 | WSL: `ls ~/.local/bin/uv` 확인 후 재설치 |
| rtk deny 안 됨 | 훅 미로드 | `/hooks` 확인; Grok 재시작 |
| rtk deny 무한 루프 | reason 명령 무시 | reason의 **exact** 줄 재실행 |
| 프로젝트 MCP 안 뜸 | untrusted | `/hooks-trust` |
| `python` 명령 없음 | Windows PATH | Python 설치 또는 `py -3` 로 hooks json 수정 |
| 사용자명/드라이브 다름 | 경로 하드코딩 | **install.ps1 재실행** 또는 config WSL 경로 수정 |
| rtk 이름 충돌 | 다른 rtk 패키지 | `rtk gain` 동작 여부로 확인 |

---

## 9. 이 PC(원본) 기준 실측 경로 예시

참고용. **다른 PC는 사용자명·드라이브가 다르다.**

```
Windows:
  C:\Users\shs\.grok\config.toml
  C:\Users\shs\.grok\hooks\token-saving.json
  C:\Users\shs\.grok\hooks\bin\*.py,*.sh,*.ps1
  C:\Users\shs\.grok\skills\token-saving\SKILL.md
  D:\all-manage\.grok\config.toml
  D:\all-manage\.serena\project.yml
  D:\all-manage\tools\token-saving-grok\   ← 이식 번들
  D:\all-manage\docs\token-saving-grok-portable-install.md  ← 본 문서

WSL:
  /home/shs/.local/bin/rtk          # 0.42.4
  /home/shs/.local/bin/serena
  /home/shs/.local/bin/serena-hooks
  /home/shs/.local/bin/uv , uvx
  /mnt/d/all-manage/.serena/project.yml
```

검증 완료 시점(원본 PC):

- Project trusted: yes  
- serena MCP 연결 + `get_symbols_overview` 성공  
- rtk enforce: `git status` → deny + rewrite 문구  

---

## 10. 관련 문서

| 문서 | 내용 |
|---|---|
| `docs/token-saving-setup.md` | Claude Code 축 (rtk hook claude + serena hooks) |
| `docs/token-saving-setup-grok.md` | Grok 상세 동작·모드·문제해결 |
| `docs/token-saving-grok-portable-install.md` | **이 문서 — 타 PC 설치** |
| `tools/token-saving-grok/` | 스크립트 번들 + `install.ps1` |

---

## 11. 설치 완료 정의 (Definition of Done)

다음이 모두 참이면 이식 성공이다.

1. [ ] WSL: `rtk`, `serena`, `uv`/`uvx` 동작  
2. [ ] Windows: hooks/skill/config 존재  
3. [ ] `rtk_grok_pretool.py` 가 enforce에서 deny 반환  
4. [ ] Grok 재시작 후 **serena timeout 없음**  
5. [ ] 프로젝트 **trusted**  
6. [ ] 에이전트가 serena 도구를 `search_tool` 로 발견  

끝.

# setsuzei

[![CI](https://github.com/ozko00/setsuzei/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ozko00/setsuzei/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/setsuzei)](https://www.npmjs.com/package/setsuzei)

[日本語](README.md) | English

**A cited, tested calculation engine so that LLMs don't have to do Japanese tax arithmetic in their heads.** Use it as an MCP server, a CLI, an Agent Skill, or in the browser.

It estimates Japanese national income tax and local resident tax for freelancers and people with side jobs (tax year 2026 / Reiwa 8), and how much each year-end measure would still reduce them:

- **Furusato nozei** (hometown tax donation): the donation limit at which the out-of-pocket cost stays at about 2,000 yen
- **iDeCo** (individual defined-contribution pension): remaining contribution room and the tax reduction
- **Small Business Mutual Aid** (shokibo kigyo kyosai): remaining room and the tax reduction
- **Blue-return special deduction** (aoiro shinkoku tokubetsu kojo): tax at each level (none / 100,000 / 550,000 / 650,000 yen)

Why an engine instead of letting the model calculate:

- **Every rate, deduction and threshold is taken from a primary source** (National Tax Agency, Ministry of Internal Affairs and Communications, statutes on e-Gov, scheme operators) and cited next to the number in [`src/data/2026.ts`](src/data/2026.ts). `list_tax_sources` returns the list.
- **Over 200 tests**, including published worked examples from the National Tax Agency and the ministry's furusato nozei table, boundary values, and hand-calculated expectations from the statutes.
- **The model never does the arithmetic.** It passes the user's figures to a tool and reports the returned numbers. Outputs are structured (JSON Schema) and always carry the estimate notice, the assumptions and the sources.
- **Local only.** No network access, no telemetry, zero runtime dependencies. `npx setsuzei` installs one package.

> [!IMPORTANT]
> Results are estimates. They do not replace the judgment of a tax accountant, the tax office or your municipality.

## Add it to your agent

Requires Node.js 20 or later.

### Claude Code (plugin)

Inside Claude Code, run these two lines:

```
/plugin marketplace add ozko00/setsuzei
/plugin install setsuzei@setsuzei
```

This installs the MCP server (the five tools below) and the Agent Skill together. From a shell: `claude plugin marketplace add ozko00/setsuzei` and `claude plugin install setsuzei@setsuzei`. On first use the MCP server fetches the pinned `setsuzei` package from npm (no other packages) and runs locally.

### MCP server

`setsuzei mcp` starts an MCP server over stdio. Add it to your client's MCP configuration:

```json
{
  "mcpServers": {
    "setsuzei": {
      "command": "npx",
      "args": ["-y", "setsuzei@0.4.0", "mcp"]
    }
  }
}
```

Claude Code, MCP server only:

```sh
claude mcp add setsuzei -- npx -y setsuzei@0.4.0 mcp
```

Keep the version (`@0.4.0`). The `mcp` subcommand exists from 0.4.0, and without a version `npx` may reuse an older copy left from an earlier `npx setsuzei`, in which case the connection fails.

| Tool | What it returns |
| --- | --- |
| `estimate_tax_savings` | Current income tax and resident tax, each measure's limit / remaining room / tax reduction, and a combined plan recomputed together |
| `furusato_nozei_limit` | Only the furusato nozei limit, the remaining room and the tax reduction |
| `compare_furusato_limit_with_2025` | The limit for tax year 2025 vs 2026 for the same input, with the reason for any change |
| `validate_tax_input` | Problems in an input object, without calculating |
| `list_tax_sources` | The primary sources behind the numbers |

- Inputs are annual amounts in whole yen (integers). Unknown fields and non-integer amounts are rejected with a message the model can act on.
- Every result has `meta`: `estimate: true`, the disclaimer, the assumptions, what is not calculated, and the sources.
- Notes and warnings inside the result are in Japanese (the CLI and the MCP tools have no English output yet; the library and the browser version do).
- Protocol: supports the current MCP revision (2026-07-28, per-request metadata and `server/discover`) and the earlier handshake-based revisions (2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05). Tools only; no resources, prompts or sampling.
- Checked with Claude Code, the official MCP Inspector (CLI) and the client of the official TypeScript SDK. **Not checked with Claude Desktop**; the configuration above is the standard form.

### Agent Skill

[`skills/setsuzei/SKILL.md`](skills/setsuzei/SKILL.md) teaches an agent to ask for the figures it needs, run the CLI, and explain the result without doing arithmetic itself (instructions are in Japanese).

```sh
mkdir -p ~/.claude/skills && cp -r skills/setsuzei ~/.claude/skills/
```

### CLI

```sh
npx setsuzei --revenue 8000000 --expenses 1500000 --blue 65 --social-insurance 900000 --json
```

`--json` prints the same structure the MCP tool returns in `result`. Run `npx setsuzei --help` for all flags (help text is in Japanese). Amounts accept `8,000,000`, `8m`, `750k`, `¥8,000,000` and Japanese notation such as `800万`.

### Library

```ts
import { calculate } from "setsuzei";

const result = calculate({ businessRevenue: 8_000_000, businessExpenses: 1_500_000, blueReturn: "65", socialInsurance: 900_000 });
console.log(result.baseline.totalTax, result.measures.furusato.limit);
```

Notes, warnings and input errors are in Japanese by default. Pass `{ locale: "en" }` as the second argument to get them in English; the numbers do not change.

```ts
const english = calculate(input, { locale: "en" });
console.log(english.warnings, english.measures.furusato.notes);
```

## Model alone vs. with the tool (measured)

On 2026-11-27 the same three questions were asked of the model alone (Claude Sonnet 5.5, no tools, three runs each) and with the setsuzei MCP tools connected (one run each).

| Question (tax year 2026) | Correct | Model alone (3 runs) | With the tool |
| --- | --- | --- | --- |
| Furusato nozei limit: salary 5,000,000 yen, social insurance 750,000 yen, single | 57,000 | 57,000 / **61,000** / **61,000** | 57,000 |
| Income tax + resident tax: freelancer, revenue 8,000,000, expenses 1,500,000, blue return 650,000, social insurance 900,000 | 891,900 | 891,900 / 891,900 / 891,900 | 891,900 |
| Furusato nozei limit: freelancer, revenue 4,800,000, expenses 750,000, blue return 650,000, social insurance 590,000 | 57,000 | **61,000** / **61,000** / **61,000** | 57,000 |

- The model alone got the total tax right every time. It missed the furusato nozei limit in 5 of 6 runs, answering 61,000 yen, which is the value under the rules up to tax year 2025; the 2026 increase of the basic deduction lowers the limit to 57,000 yen in this income band.
- This is a small measurement: three questions, one model. Other models and questions were not measured. The full questions, method and limits are in [evaluation/model-vs-tool.md](evaluation/model-vs-tool.md) (Japanese).

## Browser version

For people rather than agents: **<https://ozko00.github.io/setsuzei/en/>** (English) and <https://ozko00.github.io/setsuzei/> (Japanese). Answer three questions (work style, revenue, expenses) and it shows what to do before year-end, how much to pay and how much tax it saves. It uses the same engine and makes no network requests.

The English version is written for freelancers and employees with side income who live in Japan: each scheme gets a one-line explanation, amounts stay in yen, and the Japanese names you need on forms and at counters are shown next to the English. It has the full calculator and five single-topic pages:

- [Furusato nozei limit calculator for freelancers and sole proprietors](https://ozko00.github.io/setsuzei/en/furusato-nozei-limit-freelance/)
- [iDeCo tax savings calculator for freelancers and the self-employed](https://ozko00.github.io/setsuzei/en/ideco-tax-savings-self-employed/)
- [Small Business Mutual Aid (shokibo kigyo kyosai) tax savings calculator](https://ozko00.github.io/setsuzei/en/small-business-mutual-aid-tax-savings/)
- [Blue return special deduction: ¥650,000 vs ¥550,000 vs ¥100,000 in actual tax](https://ozko00.github.io/setsuzei/en/blue-return-deduction/)
- [Is your furusato nozei limit lower for 2026? Compare it with 2025](https://ozko00.github.io/setsuzei/en/furusato-nozei-limit-2026/)

The same input gives the same numbers in both languages (covered by tests). It assumes you are a resident of Japan for tax purposes; foreign income, tax treaties and non-resident rules are not handled. English terms follow the National Tax Agency's [English income tax guide](https://www.nta.go.jp/english/taxes/individual/incometax_2025.htm) where it has one.

## What is and is not calculated

Calculated: income tax and special reconstruction income tax for 2026; resident tax for fiscal 2027 at the standard rate, including the exemption threshold for the income-based part; salary income deduction, basic deduction, spouse and dependent deductions, social insurance and small-business mutual-aid deductions; the furusato nozei limit under the rule in force from fiscal 2026.

Not calculated: the full national health insurance premium, enterprise tax, consumption tax, the exemption of the per-capita part of resident tax (differs by municipality), separately taxed income (capital gains), housing-loan and other tax credits, and eligibility (whether you can join mutual aid, meet a blue-return requirement, or claim a dependent).

Details, assumptions and the comparison with the ministry's published table are in the [Japanese README](README.md#何を計算し何を計算しないか).

## Glossary

| Japanese | Used here as |
| --- | --- |
| ふるさと納税 | furusato nozei (hometown tax donation) |
| iDeCo（個人型確定拠出年金） | iDeCo (individual defined-contribution pension) |
| 小規模企業共済 | Small Business Mutual Aid (SMRJ's own English name; NTA: “small business mutual aid premiums”) |
| 青色申告特別控除 | special deduction for blue returns (blue-return deduction) |
| 所得税・復興特別所得税 | income tax and special income tax for reconstruction |
| 住民税（所得割・均等割） | resident tax (income-based part, per-person part); “inhabitant tax” in NTA's English guide |
| 事業所得・雑所得 | business income, miscellaneous income |
| 令和8年分 | tax year 2026 (Reiwa 8) |

## Development

```sh
git clone https://github.com/ozko00/setsuzei.git
cd setsuzei
npm ci
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) (Japanese). Any change to a number needs the URL of a primary source and a test. Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

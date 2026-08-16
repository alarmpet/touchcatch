# TouchCatch Inventory Snapshot

**Measured:** 2026-08-01

This snapshot records repository inventory only. It is not a publication or
production-readiness approval.

## Reproduction command

Run from the repository root:

```powershell
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('content/learning/catalog.v1.json'));const m=JSON.parse(fs.readFileSync('content/learning/manifest.v1.json'));const ce=c.entries||c;const me=m.entries||m;const counts=a=>Object.fromEntries([...new Set(a.map(x=>x.category))].map(k=>[k,a.filter(x=>x.category===k).length]));const admitted=me.filter(x=>x.hintLadderAdmission?.status==='ADMITTED');const keys=new Set(me.map(x=>x.contentKey||x.key||x.id));const drafts=fs.readdirSync('content/learning/drafts').filter(x=>x.endsWith('.json')).map(x=>x.slice(0,-5));console.log(JSON.stringify({catalog:ce.length,manifest:me.length,catalogStatus:Object.fromEntries([...new Set(ce.map(x=>x.status))].map(s=>[s,ce.filter(x=>x.status===s).length])),manifestPublishBlocked:me.filter(x=>x.publishBlocked===true).length,admitted:admitted.length,admittedKeys:admitted.map(x=>x.contentKey||x.key||x.id),catalogByCategory:counts(ce),manifestByCategory:counts(me),draftJsonCount:drafts.length,orphanDrafts:drafts.filter(x=>!keys.has(x))},null,2))"
```

## Observed result

| Source | Count/status | Meaning |
|---|---:|---|
| `catalog.v1.json` | 91 entries; 91 `DRAFT` | working catalog metadata |
| `manifest.v1.json` | 91 entries; 91 `publishBlocked: true` | generated publication manifest |
| admitted five-step ladders | 3 | `en-resilience`, `ko-proverb-seeing-is-believing`, `ko-idiom-turn-misfortune` |
| `content/learning/drafts/*.json` | 95 | includes four orphan/unregistered drafts |
| frozen mobile registry | 79 | historical/frozen generated snapshot; not the current catalog |

Orphan drafts are `en-3d-serenity-temple`, `en-isometric-lab`,
`en-3d-solitude-peak`, and `en-3d-tranquility-tea`.

## Interpretation

`research.md` is a content-pipeline research note. It must not be used as the
SSOT for ranked-season eligibility, publication, rights approval, or production
capacity. A weekly ENGLISH/PROVERB season remains blocked until each category
has five admitted, human-reviewed, published revisions.

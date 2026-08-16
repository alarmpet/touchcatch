# Content pipeline parameter reference

This is a navigational reference, not a second policy source. The executable
values live in `tools/content/pipeline-constants.js`.

| Source/export | Value | Consumer | Normative status |
|---|---:|---|---|
| `pipeline-constants.js` / `RADIUS_BY_DIFFICULTY` | beginner `.085`, intermediate `.070`, advanced `.055` | geometry validation and batch writer | executable gate |
| `pipeline-constants.js` / `PIXEL_THRESHOLD` | `75` | visual delta detector | executable gate |
| `pipeline-constants.js` / `MIN_CLUSTER_CHANGED_PIXELS` | `150` | changed-pixel cluster validator | executable gate |
| `pipeline-constants.js` / `MAX_OUTSIDE_CHANGED_RATIO` | `.08` | outside-geometry validator | executable baseline |
| `pipeline-constants.js` / `ADAPTIVE_RETRY_POLICY` | `90/100/120/140` thresholds | batch retry evidence only | non-ranked retry policy |

Research prose explains rationale; it does not override these exports.

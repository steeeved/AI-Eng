/**
 * Regenerates schema.json from the Zod schema. Run after any change to
 * 1.05/structured_output.ts — the eval's structural assertion reads schema.json,
 * so a stale file means your golden set is validating the old contract.
 *
 *   bun run schema
 */

import { z } from "zod";
import { StandupDump } from "../../1.05/structured_output";

const schema = z.toJSONSchema(StandupDump, { target: "draft-7" }) as Record<string, unknown>;
delete schema.$schema;
schema.$comment =
  "Generated from 1.05/structured_output.ts by scripts/gen-schema.ts — do not hand-edit.";

await Bun.write("schema.json", JSON.stringify(schema, null, 2) + "\n");
console.log("wrote schema.json");

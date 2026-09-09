import { z } from "zod";

const TaskPriority = z.enum(["critical", "high", "medium", "low", "unknown"]);

const TaskStatus = z.enum([
  "assigned",
  "unassigned",
  "blocked",
  "completed",
  "dropped",
]);

const Task = z.object({
  id: z.string().describe("Generated short ID, e.g. T-001"),
  title: z.string().describe("Short task title"),
  assignee: z
    .string()
    .nullable()
    .describe("Person responsible, null if unowned"),
  deadline: z
    .string()
    .nullable()
    .describe("Stated deadline, e.g. 'fri', 'next week', or null if missing"),
  priority: TaskPriority,
  status: TaskStatus,
  blockerDescription: z
    .string()
    .nullable()
    .describe("What is blocking the task, null if not blocked"),
  blockerOwnedByUs: z
    .boolean()
    .nullable()
    .describe("Whether blocker is within our team's control, null if not blocked"),
});

const Decision = z.object({
  title: z.string().describe("What was decided"),
});

const StandupDump = z.object({
  date: z
    .string()
    .nullable()
    .describe("Standup date if mentioned, otherwise null"),
  tasks: z
    .array(Task)
    .describe("All tasks, assignments, and issues mentioned"),
  decisions: z.array(Decision).describe("Explicit decisions made"),
});

type StandupDump = z.infer<typeof StandupDump>;

export { TaskPriority, TaskStatus, Task, Decision, StandupDump };

/**
 * Grouped help for the CLI.
 *
 * Commander 12 renders one flat `Commands:` list, which puts 24 commands and
 * three different audiences in a single column and leads with option flags —
 * the least useful thing a newcomer reads. This module renders help as:
 *
 *   1. what to do first (the three-step path)
 *   2. commands grouped by job, in the order a learner meets them
 *   3. global options last
 *
 * Groups are declared here rather than inferred, so a new command has to be
 * placed deliberately. `mergelearn help --all` reveals internal and trial
 * commands; the default listing stays the surface a user should care about.
 */

export type HelpGroup = { title: string; commands: string[] };

/** Display order. A command absent from every group only shows under --all. */
export const HELP_GROUPS: HelpGroup[] = [
  { title: 'Learn', commands: ['serve', 'due', 'show', 'grade', 'sample'] },
  { title: 'Library', commands: ['list', 'edit', 'archive', 'unarchive', 'delete', 'check', 'prune', 'settings'] },
  { title: 'Skills', commands: ['mastery', 'weak'] },
  { title: 'Agent', commands: ['context', 'apply', 'skip'] },
  { title: 'Share', commands: ['export', 'import', 'backup', 'restore'] },
  { title: 'Setup', commands: ['setup-agent', 'doctor', 'status'] },
];

/** Shown only under `help --all`: internal plumbing and trial instrumentation. */
export const INTERNAL_GROUP: HelpGroup = {
  title: 'Internal and trial (hidden by default)',
  commands: ['dogfood-summary', 'server-run'],
};

/**
 * Pre-0.2 spellings, kept working so an installed agent skill or a script does
 * not break on upgrade. Hidden from the default listing; each one prints a
 * one-line pointer to its replacement when used.
 */
export const DEPRECATED_GROUP: HelpGroup = {
  title: 'Deprecated spellings (still work, will be removed)',
  commands: ['sets', 'cards', 'import-bundle', 'create-and-open', 'skipped'],
};

/** Signature shown after the command name, e.g. `show <set/card>`. */
export const COMMAND_ARGS: Record<string, string> = {
  show: '<set/card>',
  grade: '<set/card> <1-4>',
  list: '<sets|cards|due>',
  edit: '<set/card>',
  archive: '<set/card>',
  unarchive: '<set/card>',
  delete: '<set|set/card>',
  apply: '--file <patch>',
  export: '--set <id>',
  import: '--file <bundle>',
  restore: '--file <backup>',
  mastery: '',
};

/** One-line summaries, shorter and more parallel than the full descriptions. */
export const COMMAND_SUMMARY: Record<string, string> = {
  serve: 'open the local GUI (Home + Practice)',
  due: 'what is scheduled right now',
  show: 'read one card in the terminal',
  grade: 'grade a due card',
  sample: 'install the sample lesson to try it',
  list: 'list or search what you have',
  edit: 'fix teaching text, keep the schedule',
  archive: 'remove from the queue, reversible',
  unarchive: 'put it back',
  delete: 'permanent, needs --yes',
  check: 'cards whose cited code has drifted',
  prune: 'archive drifted cards in bulk',
  settings: 'review cap and queue strategy',
  mastery: 'what you have learned and still remember',
  weak: 'what you keep failing to recall',
  context: 'library state to author against',
  apply: 'apply an AgentSetPatch (add --open)',
  skip: 'record work that produced no lesson',
  export: 'one lesson, state-free',
  import: 'install a shared lesson',
  backup: 'your state and history',
  restore: 'put it back',
  'setup-agent': 'install the skill into your agent(s)',
  doctor: 'diagnose local setup, read-only',
  status: 'is a server running, where, what version',
  'dogfood-summary': 'local trial event counts',
  'server-run': 'managed server entry point (internal)',
};

const START_HERE = [
  'Start here',
  '  1  mergelearn setup-agent              install the authoring skill',
  '  2  in your agent: "Create a MergeLearn lesson from my last PR."',
  '  3  mergelearn serve                    open the browser and learn',
];

const GLOBAL_OPTIONS = [
  'Global options (valid on any command)',
  '  --home <path>   which library      (default: MERGELEARN_HOME or ~/.mergelearn)',
  '  --json          machine-readable output',
  '  --yes           assume yes, for scripts',
  '  -V, --version   print the version',
  '  -h, --help      show help',
];

const FOOTER = [
  'mergelearn help <command>   full options for one command',
  'mergelearn help --all       include internal and trial commands',
];

const LEAD = [
  'Usage: mergelearn [global options] <command> [options]',
  '',
  'Model-free, agent-authored learning. Your coding agent writes the',
  'lessons; MergeLearn stores them, schedules them, and serves them locally.',
];

function renderGroup(group: HelpGroup, known: Set<string>, pad: number): string[] {
  const rows = group.commands
    .filter((name) => known.has(name))
    .map((name) => {
      const signature = [name, COMMAND_ARGS[name] ?? ''].filter(Boolean).join(' ');
      return `  ${signature.padEnd(pad)}  ${COMMAND_SUMMARY[name] ?? ''}`.trimEnd();
    });
  return rows.length ? [group.title, ...rows] : [];
}

/**
 * Render the top-level help text.
 *
 * `known` is the set of command names actually registered, so help can never
 * advertise a command that does not exist (or omit one silently: see
 * `unlistedCommands`).
 */
export function renderHelp(known: Set<string>, options: { all?: boolean } = {}): string {
  const groups = options.all ? [...HELP_GROUPS, DEPRECATED_GROUP, INTERNAL_GROUP] : HELP_GROUPS;
  const listed = groups.flatMap((group) => group.commands).filter((name) => known.has(name));
  const pad = Math.max(
    ...listed.map((name) => [name, COMMAND_ARGS[name] ?? ''].filter(Boolean).join(' ').length),
    0,
  );

  const sections: string[][] = [LEAD, START_HERE];
  for (const group of groups) {
    const rendered = renderGroup(group, known, pad);
    if (rendered.length) sections.push(rendered);
  }
  sections.push(GLOBAL_OPTIONS, FOOTER);

  return sections.map((section) => section.join('\n')).join('\n\n') + '\n';
}

/**
 * Registered commands that no group claims. Non-empty means help is hiding a
 * command by accident; a test asserts this stays empty.
 */
export function unlistedCommands(known: Set<string>): string[] {
  const grouped = new Set(
    [...HELP_GROUPS, DEPRECATED_GROUP, INTERNAL_GROUP].flatMap((group) => group.commands),
  );
  // `help` is represented by the footer rather than a command group.
  return [...known].filter((name) => name !== 'help' && !grouped.has(name)).sort();
}

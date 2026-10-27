import { iterable, record } from './config.js';
import type {
  EmailCustomRule,
  EmailCustomRuleContext,
  EmailCustomRuleEvaluation,
  EmailRuleIssue,
} from './types.js';

const definitionKeys = new Set(['id', 'check']);
const acceptedKeys = new Set(['status']);
const issueKeys = new Set(['status', 'code', 'message']);

export function customRules(value: unknown): readonly EmailCustomRule[] {
  if (value === undefined) return [];
  const ids = new Set<string>();
  const rules: EmailCustomRule[] = [];
  for (const entry of iterable(value, 'customRules')) {
    const rule = record(entry, definitionKeys, 'custom rule');
    const { id, check } = rule;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) {
      throw new TypeError('Custom rule IDs must be nonempty unique strings');
    }
    if (typeof check !== 'function')
      throw new TypeError(`Custom rule ${id} must have a check function`);
    ids.add(id);
    rules.push({ id, check: check as EmailCustomRule['check'] });
  }
  return rules;
}

export function evaluateCustomRules(
  rules: readonly EmailCustomRule[],
  context: EmailCustomRuleContext,
): {
  evaluations: EmailCustomRuleEvaluation[];
  warnings: EmailRuleIssue[];
  rejection?: EmailRuleIssue;
} {
  const evaluations: EmailCustomRuleEvaluation[] = [];
  const warnings: EmailRuleIssue[] = [];
  const frozenContext = Object.freeze({ ...context });
  for (const rule of rules) {
    const returned: unknown = rule.check(frozenContext);
    if (
      returned !== null &&
      (typeof returned === 'object' || typeof returned === 'function') &&
      typeof (returned as PromiseLike<unknown>).then === 'function'
    ) {
      // A misconfigured async callback must not become an unhandled rejection.
      void Promise.resolve(returned).catch(() => {});
      throw new TypeError(`Custom rule ${rule.id} must return a synchronous result`);
    }
    const result = record(returned, issueKeys, `custom rule ${rule.id} result`);
    const { status, code, message } = result;
    if (status === 'accepted') {
      record(result, acceptedKeys, `custom rule ${rule.id} accepted result`);
      evaluations.push({ id: rule.id, status });
      continue;
    }
    if (
      (status !== 'warning' && status !== 'rejected') ||
      typeof code !== 'string' ||
      !code.trim() ||
      (message !== undefined && typeof message !== 'string')
    ) {
      throw new TypeError(
        `Custom rule ${rule.id} must return accepted, rejected or warning with a nonempty code`,
      );
    }
    const details = { code, ...(message === undefined ? {} : { message }) };
    const issue = { ruleId: rule.id, ...details };
    evaluations.push({ id: rule.id, status, ...details });
    if (status === 'rejected') return { evaluations, warnings, rejection: issue };
    warnings.push(issue);
  }
  return { evaluations, warnings };
}

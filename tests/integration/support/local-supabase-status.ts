import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const STATUS_TIMEOUT_MS = 10_000;
const STATUS_MAX_BUFFER = 1024 * 1024;

export type LocalSupabaseStatus = Readonly<{
  apiUrl: string;
  dbUrl: string;
  mailpitUrl: string;
  publishableKey: string;
  cleanupKey: string;
}>;

type StatusCommandInput = Readonly<{
  executable: string;
  args: readonly string[];
  options: Readonly<{
    cwd: string;
    encoding: 'utf8';
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
  }>;
}>;

export type StatusCommand = (command: StatusCommandInput) => string;

const runProjectStatus: StatusCommand = ({ executable, args, options }) => execFileSync(executable, [...args], options);

function parseEnv(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (!match) continue;
    const raw = match[2]!;
    fields.set(match[1]!, raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw);
  }
  return fields;
}

function validate(fields: Readonly<Record<string, string | undefined>>): LocalSupabaseStatus {
  const apiUrl = fields.API_URL;
  const dbUrl = fields.DB_URL;
  const mailpitUrl = fields.MAILPIT_URL;
  const publishableKey = fields.PUBLISHABLE_KEY;
  const cleanupKey = fields.SECRET_KEY;
  if (!apiUrl || !dbUrl || !mailpitUrl || !publishableKey || !cleanupKey) throw new Error('invalid status');
  for (const raw of [apiUrl, dbUrl, mailpitUrl]) {
    const hostname = new URL(raw).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) throw new Error('non-loopback status');
  }
  return {
    apiUrl: apiUrl.replace(/\/+$/u, ''),
    dbUrl,
    mailpitUrl: mailpitUrl.replace(/\/+$/u, ''),
    publishableKey,
    cleanupKey,
  };
}

export function loadLocalSupabaseStatus(options: Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  runStatus?: StatusCommand;
}> = {}): LocalSupabaseStatus {
  const env = options.env ?? process.env;
  try {
    const explicit = {
      API_URL: env.LOCAL_SUPABASE_API_URL,
      DB_URL: env.TEST_DATABASE_URL,
      MAILPIT_URL: env.LOCAL_MAILPIT_URL,
      PUBLISHABLE_KEY: env.LOCAL_SUPABASE_PUBLISHABLE_KEY,
      SECRET_KEY: env.LOCAL_SUPABASE_SECRET_KEY,
    };
    if (Object.values(explicit).every((value) => typeof value === 'string' && value.length > 0)) return validate(explicit);

    const stdout = (options.runStatus ?? runProjectStatus)({
      executable: process.execPath,
      args: [resolve(repositoryRoot, 'node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'],
      options: {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, ...env, SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
        timeout: STATUS_TIMEOUT_MS,
        maxBuffer: STATUS_MAX_BUFFER,
        windowsHide: true,
      },
    });
    const fields = parseEnv(stdout);
    return validate({
      API_URL: fields.get('API_URL'),
      DB_URL: fields.get('DB_URL'),
      MAILPIT_URL: fields.get('MAILPIT_URL') ?? fields.get('INBUCKET_URL'),
      PUBLISHABLE_KEY: fields.get('PUBLISHABLE_KEY') ?? fields.get('ANON_KEY'),
      SECRET_KEY: fields.get('SECRET_KEY') ?? fields.get('SERVICE_ROLE_KEY'),
    });
  } catch {
    throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
  }
}

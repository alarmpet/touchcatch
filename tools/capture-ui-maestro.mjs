import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];const platform=get('--platform'),flow=get('--flow');
if(!['ios','android'].includes(platform)||typeof flow!=='string'||!/^\.maestro\/capture-(ios|android)\.yaml$/.test(flow)||!existsSync(flow))throw new Error('invalid Maestro capture config');
const output=resolve(process.env.UI_OUTPUT??'');if(!process.env.UI_OUTPUT||relative(process.cwd(),output).startsWith('..'))throw new Error('UI_OUTPUT must be inside workspace');
const result=spawnSync('maestro',['test',flow,'--format','junit','--output',`${output}.xml`],{stdio:'inherit',env:{...process.env,UI_OUTPUT:output}});process.exit(result.status??1);

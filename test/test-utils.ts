import {spawn, ChildProcess} from 'child_process';

export function runStaticServer() {
  console.warn('make sure to have run yarn build');
  return new Promise<ChildProcess>((resolve, reject) => {
    const childProcess = spawn('yarn', ['run-static-server']);
    childProcess.stdout.on('data', (data: Buffer) => {
      if (data.toString().includes('Available on')) resolve(childProcess);
    });
    childProcess.stderr.on('data', (data: Buffer) => {
      console.log('[static-server STDERR]', data.toString());
    });
    childProcess.on('close', reject);
    childProcess.on('error', reject);
    process.on('exit', () => childProcess.kill());
  });
}

// Cross-platform Gradle wrapper runner for npm scripts.
// Windows cannot execute `./gradlew`; Unix does not have `gradlew.bat`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const androidDir = join(process.cwd(), 'android');
const windows = process.platform === 'win32';
const wrapper = windows ? 'gradlew.bat' : './gradlew';
const args = process.argv.slice(2);
const env = { ...process.env };

// The Gradle/Android toolchain in this repo targets Java 21. Windows machines
// commonly put a newer standalone JDK first on PATH even though Android Studio
// already bundles the compatible runtime. Prefer that JBR when it is present
// so `npm run android:aab` works from a normal PowerShell session.
if (windows) {
  const androidStudioJbr = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
  if (existsSync(join(androidStudioJbr, 'bin', 'java.exe'))) env.JAVA_HOME = androidStudioJbr;
}

const result = spawnSync(wrapper, args, {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: windows,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
